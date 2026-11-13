import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import { db, adminRolePermissions, operationAudit, operators, pool } from "@workspace/db";
import { createSuperAdminRouter } from "./super-admin";
import { DEFAULT_ADMIN_ACTIONS } from "../lib/admin-roles";

const prefix = `super-admin-${randomUUID()}`;
const superAdminId = `${prefix}-root`;
const targetId = `${prefix}-target`;
const partnerId = `${prefix}-partner`;
const superAdminEmail = `${prefix}@example.com`;
const targetEmail = `operator-${prefix}@example.com`;
const partnerEmail = `partner-${prefix}@example.com`;
let server: Server | null = null;
let originalFinancePolicy: typeof adminRolePermissions.$inferSelect | null = null;

const identities = new Map([
  [superAdminEmail, { userId: superAdminId, email: superAdminEmail }],
  [targetEmail, { userId: targetId, email: targetEmail }],
  [partnerEmail, { userId: partnerId, email: partnerEmail }],
]);

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
app.use("/super-admin", createSuperAdminRouter({
  async findVerifiedByEmail(email) {
    return identities.get(email) ?? null;
  },
  async getEmail(userId) {
    return [...identities.values()].find(identity => identity.userId === userId)?.email ?? null;
  },
}));

async function call(path: string, method = "GET", userId?: string, body?: unknown) {
  const response = await fetch(
    `http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`,
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
  if (originalFinancePolicy) {
    await db.insert(adminRolePermissions).values(originalFinancePolicy).onConflictDoUpdate({
      target: adminRolePermissions.role,
      set: {
        actions: originalFinancePolicy.actions,
        updatedBy: originalFinancePolicy.updatedBy,
        updatedAt: originalFinancePolicy.updatedAt,
      },
    });
  } else {
    await db.delete(adminRolePermissions).where(eq(adminRolePermissions.role, "finance_admin"));
  }
  await db.delete(operators).where(inArray(operators.userId, [superAdminId, targetId, partnerId]));
  // Audit history is append-only; randomized test events are intentionally retained.
  await pool.end();
});

test("Super Admin role management is protected, auditable, and preserves other staff roles", async () => {
  const [originalFinancePolicyRow] = await db.select().from(adminRolePermissions)
    .where(eq(adminRolePermissions.role, "finance_admin")).limit(1);
  originalFinancePolicy = originalFinancePolicyRow ?? null;
  await db.insert(operators).values([
    { userId: superAdminId, role: "super_admin", partnerId: null },
    { userId: partnerId, role: "partner", partnerId: null },
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/super-admin/admin-accounts")).status, 401);
  assert.equal((await call("/super-admin/admin-accounts", "GET", partnerId)).status, 403);

  const initial = await call("/super-admin/admin-accounts", "GET", superAdminId);
  assert.equal(initial.status, 200);
  assert.ok(Array.isArray(initial.data));
  assert.equal((initial.data as Array<{ email: string }>).some(row => row.email === superAdminEmail), true);

  const rolePolicies = await call("/super-admin/role-permissions", "GET", superAdminId);
  assert.equal(rolePolicies.status, 200);
  const financePolicy = (rolePolicies.data as Array<{ role: string; actions: string[]; locked: boolean }>)
    .find(row => row.role === "finance_admin");
  assert.deepEqual(financePolicy?.actions, originalFinancePolicy?.actions ?? DEFAULT_ADMIN_ACTIONS.finance_admin);
  assert.equal((rolePolicies.data as Array<{ role: string; locked: boolean }>)
    .find(row => row.role === "super_admin")?.locked, true);

  const updatedPolicy = await call("/super-admin/role-permissions/finance_admin", "PUT", superAdminId, {
    actions: ["view", "refund", "view_sensitive_data"],
  });
  assert.equal(updatedPolicy.status, 200);
  assert.deepEqual((updatedPolicy.data as { actions: string[] }).actions,
    ["view", "refund", "view_sensitive_data"]);
  assert.equal((await call("/super-admin/role-permissions/super_admin", "PUT", superAdminId, {
    actions: [],
  })).status, 409);
  const resetPolicy = await call("/super-admin/role-permissions/finance_admin", "PUT", superAdminId, {
    actions: null,
  });
  assert.equal(resetPolicy.status, 200);
  assert.equal((resetPolicy.data as { isCustom: boolean }).isCustom, false);

  const assigned = await call("/super-admin/admin-accounts", "PUT", superAdminId, {
    email: targetEmail,
    role: "finance_admin",
    status: "active",
  });
  assert.equal(assigned.status, 200);
  assert.deepEqual(assigned.data, {
    userId: targetId,
    email: targetEmail,
    role: "finance_admin",
    status: "active",
  });
  const [created] = await db.select().from(operators).where(eq(operators.userId, targetId));
  assert.equal(created.role, "finance_admin");
  assert.equal(created.suspendedRole, null);

  assert.equal((await call("/super-admin/admin-accounts", "PUT", superAdminId, {
    email: partnerEmail,
    role: "super_admin",
    status: "active",
  })).status, 409);

  const suspended = await call("/super-admin/admin-accounts", "PUT", superAdminId, {
    email: targetEmail,
    role: "corporate_admin",
    status: "suspended",
  });
  assert.equal(suspended.status, 200);
  const [suspendedRow] = await db.select().from(operators).where(eq(operators.userId, targetId));
  assert.equal(suspendedRow.role, "admin_suspended");
  assert.equal(suspendedRow.suspendedRole, "corporate_admin");

  const listed = await call("/super-admin/admin-accounts", "GET", superAdminId);
  const suspendedAccount = (listed.data as Array<{ userId: string; role: string; status: string }>)
    .find(row => row.userId === targetId);
  assert.deepEqual(suspendedAccount, {
    userId: targetId,
    email: targetEmail,
    role: "corporate_admin",
    status: "suspended",
  });

  const restored = await call("/super-admin/admin-accounts", "PUT", superAdminId, {
    email: targetEmail,
    role: "corporate_admin",
    status: "active",
  });
  assert.equal(restored.status, 200);
  const [restoredRow] = await db.select().from(operators).where(eq(operators.userId, targetId));
  assert.equal(restoredRow.role, "corporate_admin");
  assert.equal(restoredRow.suspendedRole, null);

  const selfChange = await call("/super-admin/admin-accounts", "PUT", superAdminId, {
    email: superAdminEmail,
    role: "finance_admin",
    status: "active",
  });
  assert.equal(selfChange.status, 409);

  const audit = await call("/super-admin/audit-logs?limit=100", "GET", superAdminId);
  assert.equal(audit.status, 200);
  const events = audit.data as Array<{ action: string; targetId: string; detail: string }>;
  assert.equal(events.filter(event => event.action === "super_admin.admin_account.updated" && event.targetId === targetId).length, 3);
  assert.equal(events.some(event => event.targetId === targetId && event.detail.includes("corporate_admin")), true);
  assert.equal((await call("/super-admin/audit-logs?limit=0", "GET", superAdminId)).status, 400);
});
