import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { Server } from "node:http";
import express from "express";
import {
  db, operationAudit, operators, partnerContractVersions, partners, pool,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ObjectNotFoundError, type ObjectStorageService } from "../lib/objectStorage";
import { createPartnerContractsRouter, type PartnerContractStorage } from "./partner-contracts";

const prefix = `partner-contract-${randomUUID()}`;
const partnerA = `${prefix}-a`;
const partnerB = `${prefix}-b`;
const partnerUserA = `${prefix}-user-a`;
const partnerUserB = `${prefix}-user-b`;
const safetyAdmin = `${prefix}-safety-admin`;
const operationsAdmin = `${prefix}-operations-admin`;
const userIds = [partnerUserA, partnerUserB, safetyAdmin, operationsAdmin];
const contractIds: string[] = [];
const storedFiles = new Map<string, { contentType: string; bytes: Buffer }>();
let server: Server | null = null;

const mockStorage = {
  createPartnerContractUpload: async (partnerId: string, versionId: string) => ({
    uploadURL: `https://upload.invalid/${partnerId}/${versionId}`,
    documentPath: `/objects/partner-contracts/${partnerId}/${versionId}`,
  }),
  getPrivateFile: async (path: string) => {
    const stored = storedFiles.get(path);
    if (!stored) throw new ObjectNotFoundError();
    return {
      getMetadata: async () => [{ contentType: stored.contentType, size: stored.bytes.length }],
      createReadStream: () => Readable.from(stored.bytes),
    } as unknown as Awaited<ReturnType<ObjectStorageService["getPrivateFile"]>>;
  },
  deletePrivateFile: async (path: string) => {
    storedFiles.delete(path);
  },
} satisfies PartnerContractStorage;

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
app.use("/operations/contracts", createPartnerContractsRouter(mockStorage));

async function call(path: string, userId?: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(userId ? { "x-test-user": userId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() as unknown };
}

async function uploadVersion(changeSummary: string) {
  const result = await call("/operations/contracts/upload-url", partnerUserA, "POST", {
    documentName: "signed-partner-contract.pdf",
    size: 2048,
    contentType: "application/pdf",
    changeSummary,
  });
  assert.equal(result.status, 200);
  const upload = result.data as { id: string; versionNumber: number; replacesVersionNumber: number | null };
  contractIds.push(upload.id);
  const [row] = await db.select().from(partnerContractVersions)
    .where(eq(partnerContractVersions.id, upload.id)).limit(1);
  assert.ok(row);
  storedFiles.set(row.documentPath, {
    contentType: "application/pdf",
    bytes: Buffer.from("%PDF-1.7 MaydanGo contract test"),
  });
  const completed = await call(`/operations/contracts/${upload.id}/complete`, partnerUserA, "POST");
  assert.equal(completed.status, 200);
  return upload;
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (contractIds.length) {
    await db.delete(partnerContractVersions).where(inArray(partnerContractVersions.id, contractIds));
  }
  await db.delete(operators).where(inArray(operators.userId, userIds));
  await db.delete(partners).where(inArray(partners.id, [partnerA, partnerB]));
  // operation_audit is append-only; randomized test events are intentionally retained.
  await pool.end();
});

test("partner contract versions stay private, immutable, and auditable", async () => {
  await db.insert(partners).values([
    { id: partnerA, name: `${prefix} partner A`, groupId: prefix, ownerUserId: partnerUserA, approved: true },
    { id: partnerB, name: `${prefix} partner B`, groupId: prefix, ownerUserId: partnerUserB, approved: true },
  ]);
  await db.insert(operators).values([
    { userId: partnerUserA, role: "partner", partnerId: partnerA },
    { userId: partnerUserB, role: "partner", partnerId: partnerB },
    { userId: safetyAdmin, role: "fraud_compliance_admin", partnerId: null },
    { userId: operationsAdmin, role: "partner_operations_admin", partnerId: null },
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/operations/contracts")).status, 401);
  assert.equal((await call("/operations/contracts", operationsAdmin)).status, 403);
  assert.equal((await call("/operations/contracts/upload-url", partnerUserA, "POST", {
    documentName: "contract.pdf",
    size: 2048,
    contentType: "image/png",
    changeSummary: "Initial signed agreement for MaydanGo",
  })).status, 400);
  assert.equal((await call("/operations/contracts", partnerUserA)).status, 200);

  const first = await uploadVersion("Initial signed agreement for MaydanGo");
  assert.equal(first.versionNumber, 1);
  assert.equal(first.replacesVersionNumber, null);
  assert.equal((await call(`/operations/contracts/${first.id}/complete`, partnerUserB, "POST")).status, 404);
  assert.equal((await call(`/operations/contracts/${first.id}/file`, partnerUserB)).status, 404);

  const firstRow = (await db.select().from(partnerContractVersions)
    .where(eq(partnerContractVersions.id, first.id)).limit(1))[0];
  assert.ok(firstRow);
  assert.equal(firstRow.status, "submitted");

  const adminReview = await call(`/operations/contracts/${first.id}/review`, safetyAdmin, "PATCH", {
    status: "approved",
    reviewNote: "Reviewed and approved",
  });
  assert.equal(adminReview.status, 200);
  assert.equal((adminReview.data as { status: string }).status, "approved");

  const second = await uploadVersion("Updated terms and facility obligations");
  assert.equal(second.versionNumber, 2);
  assert.equal(second.replacesVersionNumber, 1);
  const whilePending = await call("/operations/contracts", partnerUserA);
  const pendingVersions = whilePending.data as Array<{ id: string; status: string }>;
  assert.equal(pendingVersions.find(version => version.id === first.id)?.status, "approved");

  const third = await uploadVersion("Corrected schedule and renewal clause");
  assert.equal(third.versionNumber, 3);
  assert.equal(third.replacesVersionNumber, 1);
  assert.equal((await call(`/operations/contracts/${second.id}/review`, safetyAdmin, "PATCH", {
    status: "approved",
    reviewNote: "Replacement reviewed",
  })).status, 200);
  assert.equal((await call(`/operations/contracts/${third.id}/review`, safetyAdmin, "PATCH", {
    status: "approved",
    reviewNote: null,
  })).status, 409);
  assert.equal((await call(`/operations/contracts/${third.id}/review`, safetyAdmin, "PATCH", {
    status: "rejected",
    reviewNote: "A newer contract is already current.",
  })).status, 200);

  const history = await call("/operations/contracts", partnerUserA);
  const versions = history.data as Array<{ id: string; versionNumber: number; status: string; replacesVersionNumber: number | null }>;
  assert.equal(versions.find(version => version.id === first.id)?.status, "superseded");
  assert.equal(versions.find(version => version.id === second.id)?.status, "approved");
  assert.equal(versions.find(version => version.id === third.id)?.status, "rejected");
  assert.deepEqual(
    versions.map(version => [version.versionNumber, version.replacesVersionNumber]),
    [[3, 1], [2, 1], [1, null]],
  );
  assert.deepEqual((await call("/operations/contracts", partnerUserB)).data, []);

  const download = await fetch(
    `http://127.0.0.1:${(server!.address() as { port: number }).port}/operations/contracts/${first.id}/file`,
    { headers: { "x-test-user": partnerUserA } },
  );
  assert.equal(download.status, 200);
  assert.match(download.headers.get("cache-control") ?? "", /no-store/);
  assert.match(await download.text(), /MaydanGo contract test/);
  const [auditRows] = await db.select({ count: sql<number>`count(*)` }).from(operationAudit)
    .where(and(
      inArray(operationAudit.targetId, contractIds),
      eq(operationAudit.actorId, safetyAdmin),
    ));
  assert.ok(Number(auditRows.count) >= 4);
});
