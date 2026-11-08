import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  corporateAdministrators,
  corporateEmployees,
  corporateInvitations,
  corporateOrganizations,
  db,
  memberships,
  operators,
  pool,
} from "@workspace/db";
import { createCorporateRouter } from "./corporate";
import operationsCorporateRouter from "./operations-corporate";

const prefix = `corporate-access-test-${randomUUID()}`;
const adminUserId = `${prefix}-admin`;
const financeUserId = `${prefix}-finance`;
const hrUserId = `${prefix}-hr`;
const employeeUserId = `${prefix}-employee`;
const secondEmployeeUserId = `${prefix}-employee-2`;
const outsiderUserId = `${prefix}-outsider`;
const verifiedEmails = new Map<string, string[]>();
const organizationIds: string[] = [];
let server: Server | null = null;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, {
    auth: Object.assign(
      () => ({ userId: req.headers["x-test-user"], tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    ),
    log: { error: () => undefined },
  });
  next();
});
app.use("/corporate", createCorporateRouter(async userId => verifiedEmails.get(userId) ?? []));
app.use("/operations/corporate-organizations", operationsCorporateRouter);

async function call(path: string, userId: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-test-user": userId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() as Record<string, any> };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (organizationIds.length) {
    await db.delete(corporateInvitations).where(inArray(corporateInvitations.organizationId, organizationIds));
    await db.delete(corporateEmployees).where(inArray(corporateEmployees.organizationId, organizationIds));
    await db.delete(corporateAdministrators).where(inArray(corporateAdministrators.organizationId, organizationIds));
    await db.delete(corporateOrganizations).where(inArray(corporateOrganizations.id, organizationIds));
  }
  await db.delete(memberships).where(inArray(memberships.userId, [employeeUserId, secondEmployeeUserId]));
  await db.delete(operators).where(inArray(operators.userId, [adminUserId, financeUserId]));
  await pool.end();
});

test("corporate invitations are admin-provisioned, email-verified, and company-scoped", async () => {
  await db.insert(operators).values([
    { userId: adminUserId, role: "admin", partnerId: null },
    { userId: financeUserId, role: "finance", partnerId: null },
  ]);
  server = app.listen(0);
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/operations/corporate-organizations", financeUserId)).status, 403);
  const created = await call("/operations/corporate-organizations", adminUserId, "POST", {
    name: "Northern Wellness Group",
    administratorEmail: "hr@northern.example",
  });
  assert.equal(created.status, 201);
  const orgId = created.data.organization.id as string;
  organizationIds.push(orgId);
  assert.equal(created.data.organization.employeeCount, 0);
  assert.equal(created.data.administratorInvitation.role, "hr_admin");

  const hrInvite = created.data.administratorInvitation.token as string;
  verifiedEmails.set(hrUserId, ["not-hr@northern.example"]);
  assert.equal((await call("/corporate/invitations/accept", hrUserId, "POST", { token: hrInvite })).status, 403);
  verifiedEmails.set(hrUserId, ["hr@northern.example"]);
  const acceptedHr = await call("/corporate/invitations/accept", hrUserId, "POST", { token: hrInvite });
  assert.equal(acceptedHr.status, 200);
  assert.equal(acceptedHr.data.role, "hr_admin");
  assert.equal(acceptedHr.data.organizationId, orgId);

  const batch = await call("/corporate/employee-invitations", hrUserId, "POST", {
    organizationId: orgId,
    emails: ["first@northern.example", "second@northern.example"],
  });
  assert.equal(batch.status, 201);
  assert.equal(batch.data.invitations.length, 2);
  const firstInvite = batch.data.invitations[0];
  const secondInvite = batch.data.invitations[1];

  verifiedEmails.set(employeeUserId, ["different@northern.example"]);
  assert.equal((await call("/corporate/invitations/accept", employeeUserId, "POST", { token: firstInvite.token })).status, 403);
  verifiedEmails.set(employeeUserId, ["first@northern.example"]);
  const acceptedEmployee = await call("/corporate/invitations/accept", employeeUserId, "POST", { token: firstInvite.token });
  assert.equal(acceptedEmployee.status, 200);
  assert.equal(acceptedEmployee.data.role, "employee");

  const hrPortal = await call("/corporate/portal", hrUserId);
  assert.equal(hrPortal.status, 200);
  assert.equal(hrPortal.data.adminOrganizations.length, 1);
  assert.deepEqual(
    hrPortal.data.adminOrganizations[0].employees.map((employee: { status: string }) => employee.status).sort(),
    ["active", "invited"],
  );
  assert.equal(
    hrPortal.data.adminOrganizations[0].employees.find((employee: { status: string }) => employee.status === "invited")?.pendingInvitationId,
    secondInvite.id,
  );
  assert.equal(
    hrPortal.data.adminOrganizations[0].employees.find((employee: { status: string }) => employee.status === "active")?.pendingInvitationId,
    null,
  );
  assert.equal("membership" in hrPortal.data.adminOrganizations[0].employees[0], false);

  verifiedEmails.set(secondEmployeeUserId, ["second@northern.example"]);
  const reissued = await call(`/corporate/employee-invitations/${secondInvite.id}/reissue`, hrUserId, "POST");
  assert.equal(reissued.status, 200);
  assert.notEqual(reissued.data.token, secondInvite.token);
  assert.equal(
    (await call("/corporate/invitations/accept", secondEmployeeUserId, "POST", { token: secondInvite.token })).status,
    404,
  );
  assert.equal(
    (await call("/corporate/invitations/accept", secondEmployeeUserId, "POST", { token: reissued.data.token })).status,
    200,
  );

  const employeePortal = await call("/corporate/portal", employeeUserId);
  assert.equal(employeePortal.status, 200);
  assert.equal(employeePortal.data.adminOrganizations.length, 0);
  assert.equal(employeePortal.data.myEnrollments.length, 1);
  assert.equal(employeePortal.data.myEnrollments[0].organizationId, orgId);
  assert.equal(employeePortal.data.myEnrollments[0].membership, null);
  assert.equal(
    (await call("/corporate/employee-invitations", employeeUserId, "POST", {
      organizationId: orgId,
      emails: ["intruder@northern.example"],
    })).status,
    403,
  );
  assert.equal((await call("/corporate/portal", outsiderUserId)).data.myEnrollments.length, 0);

  await db.insert(memberships).values({
    userId: employeeUserId,
    scope: "live",
    status: "active",
    paymentStatus: "not_required",
    tier: "M",
    source: "corporate",
    billingId: null,
    corporateId: orgId,
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 86_400_000),
    rules: { quota: 1, dailyLimit: 1, corporateId: orgId },
  });
  const blockedRemoval = await call(`/corporate/employees/${firstInvite.employeeId}/remove`, hrUserId, "POST", {
    reason: "Employee access ended",
  });
  assert.equal(blockedRemoval.status, 409);
  await db.delete(memberships).where(and(
    eq(memberships.userId, employeeUserId),
    eq(memberships.corporateId, orgId),
  ));

  const removed = await call(`/corporate/employees/${firstInvite.employeeId}/remove`, hrUserId, "POST", {
    reason: "Employee access ended",
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.status, "removed");
  const removedEmployeePortal = await call("/corporate/portal", employeeUserId);
  assert.equal(removedEmployeePortal.data.myEnrollments[0].status, "removed");

  const organizations = await call("/operations/corporate-organizations", adminUserId);
  assert.equal(organizations.status, 200);
  assert.equal(organizations.data[0].id, orgId);
  assert.equal(organizations.data[0].administratorCount, 1);
  assert.equal(organizations.data[0].employeeCount, 1);

  const invitationRow = await db.select().from(corporateInvitations)
    .where(eq(corporateInvitations.id, firstInvite.id)).limit(1);
  assert.equal(invitationRow.length, 1);
  assert.notEqual(invitationRow[0].tokenHash, firstInvite.token);
});
