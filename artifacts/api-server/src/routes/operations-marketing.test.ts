import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import { db, operationAudit, operators, partners, pool } from "@workspace/db";
import operationsMarketingRouter from "./operations-marketing";

const prefix = `marketing-profile-${randomUUID()}`;
const partnerId = `${prefix}-partner`;
const partnerUser = `${prefix}-partner-user`;
const adminUser = `${prefix}-admin`;
const financeUser = `${prefix}-finance`;
let server: Server | null = null;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, {
    auth: Object.assign(
      () => ({ userId: req.headers["x-test-user"], tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    ),
  });
  next();
});
app.use("/operations", operationsMarketingRouter);

async function call(method: string, userId: string | undefined, body?: unknown) {
  const response = await fetch(
    `http://127.0.0.1:${(server!.address() as { port: number }).port}/operations/marketing-profile`,
    {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(userId ? { "x-test-user": userId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  return { status: response.status, data: await response.json() as unknown };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await db.delete(operators).where(inArray(operators.userId, [partnerUser, adminUser, financeUser]));
  await db.delete(partners).where(eq(partners.id, partnerId));
  // operation_audit is append-only; randomized test events are intentionally retained.
  await pool.end();
});

test("partner marketing logo is scoped to the approved partner and HTTPS URLs", async () => {
  await db.insert(partners).values({
    id: partnerId, name: `${prefix} Partner`, groupId: prefix,
    ownerUserId: partnerUser, approved: true,
  });
  await db.insert(operators).values([
    { userId: partnerUser, role: "partner", partnerId },
    { userId: adminUser, role: "admin", partnerId: null },
    { userId: financeUser, role: "finance", partnerId: null },
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("GET", undefined)).status, 401);
  assert.equal((await call("GET", adminUser)).status, 403);
  assert.equal((await call("GET", financeUser)).status, 403);
  const initial = await call("GET", partnerUser);
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.data, {
    partnerId,
    partnerName: `${prefix} Partner`,
    logoUrl: null,
  });

  assert.equal((await call("PUT", partnerUser, { logoUrl: "http://example.com/logo.png" })).status, 400);
  const updated = await call("PUT", partnerUser, { logoUrl: "https://example.com/official-logo.png" });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.data, {
    partnerId,
    partnerName: `${prefix} Partner`,
    logoUrl: "https://example.com/official-logo.png",
  });
  assert.equal((await call("PUT", partnerUser, { logoUrl: null })).status, 200);
  const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId));
  assert.equal(partner.logoUrl, null);
  const events = await db.select().from(operationAudit).where(eq(operationAudit.targetId, partnerId));
  assert.equal(events.length, 2);
});
