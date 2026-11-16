import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  corporateAdministrators,
  corporateAgreementVersions,
  corporateEmployees,
  corporateOrganizations,
  db,
  memberships,
  operationAudit,
  operators,
  pool,
} from "@workspace/db";
import { ObjectNotFoundError } from "../lib/objectStorage";
import { createCorporateAgreementsRouter, type CorporateAgreementStorage } from "./corporate-agreements";

const prefix = `corporate-agreement-test-${randomUUID()}`;
const adminUserId = `${prefix}-admin`;
const financeUserId = `${prefix}-finance`;
const firstHrUserId = `${prefix}-hr-1`;
const secondHrUserId = `${prefix}-hr-2`;
const organizationIds = [randomUUID(), randomUUID()];
const versionIds: string[] = [];
const files = new Map<string, { contentType: string; size: number }>();
let lastUploadPath = "";
let server: Server | null = null;

const fakeStorage = {
  async createCorporateAgreementUpload(organizationId: string, versionId: string, uploadId: string) {
    lastUploadPath = `/objects/corporate-agreements/${organizationId}/${versionId}/${uploadId}.pdf`;
    return { uploadURL: `https://upload.invalid/${uploadId}`, documentPath: lastUploadPath };
  },
  async getPrivateFile(path: string) {
    const metadata = files.get(path);
    if (!metadata) throw new ObjectNotFoundError();
    return {
      getMetadata: async () => [{ contentType: metadata.contentType, size: String(metadata.size) }],
      createReadStream: () => Readable.from(["private signed agreement"]),
    };
  },
  async deletePrivateFile(path: string) {
    files.delete(path);
  },
};

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
app.use(createCorporateAgreementsRouter(fakeStorage as unknown as CorporateAgreementStorage));

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
    await db.delete(corporateAgreementVersions)
      .where(inArray(corporateAgreementVersions.organizationId, organizationIds));
    await db.delete(corporateAdministrators)
      .where(inArray(corporateAdministrators.organizationId, organizationIds));
    await db.delete(corporateOrganizations).where(inArray(corporateOrganizations.id, organizationIds));
  }
  await db.delete(operators).where(inArray(operators.userId, [adminUserId, financeUserId]));
  await pool.end();
});

test("corporate agreements are versioned, reviewed, private, and do not activate services", async () => {
  await db.insert(operators).values([
    { userId: adminUserId, role: "corporate_admin", partnerId: null },
    { userId: financeUserId, role: "finance", partnerId: null },
  ]);
  await db.insert(corporateOrganizations).values(organizationIds.map((id, index) => ({
    id,
    name: index === 0 ? "Northern Wellness Group" : "Southern Fitness Company",
    createdBy: adminUserId,
  })));
  await db.insert(corporateAdministrators).values([
    { id: randomUUID(), organizationId: organizationIds[0], userId: firstHrUserId, assignedBy: adminUserId },
    { id: randomUUID(), organizationId: organizationIds[1], userId: secondHrUserId, assignedBy: adminUserId },
  ]);
  server = app.listen(0);
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const publicTemplate = await call("/public/corporate-agreement-template", "public");
  assert.equal(publicTemplate.status, 200);
  assert.match(publicTemplate.data.agreementText, /NOT FOR SIGNATURE/);

  const firstOrgPath = `/operations/corporate-organizations/${organizationIds[0]}/agreements`;
  const firstCompanyPath = `/corporate/organizations/${organizationIds[0]}/agreements`;
  assert.equal((await call(firstOrgPath, financeUserId)).status, 403);
  assert.equal((await call(firstCompanyPath, secondHrUserId)).status, 404);
  assert.equal((await call(firstCompanyPath, firstHrUserId)).status, 200);

  const rejectedDraft = await call(firstOrgPath, adminUserId, "POST", {
    changeSummary: "Initial discussion draft for employee enrolment",
  });
  assert.equal(rejectedDraft.status, 201);
  assert.equal(rejectedDraft.data.status, "draft");
  assert.match(rejectedDraft.data.agreementText, /NOT FOR SIGNATURE/);
  assert.match(rejectedDraft.data.agreementText, /No price, contribution/);
  versionIds.push(rejectedDraft.data.id);
  assert.equal((await call(firstOrgPath, adminUserId, "POST", {
    changeSummary: "This duplicate draft should be blocked",
  })).status, 409);

  const companyHistory = await call(firstCompanyPath, firstHrUserId);
  assert.equal(companyHistory.status, 200);
  assert.equal(companyHistory.data.length, 1);
  assert.equal(companyHistory.data[0].reviewNote, null);
  assert.equal((await call(`${firstOrgPath}/${rejectedDraft.data.id}`, firstHrUserId, "PATCH", {
    agreementText: "Trying to edit a platform agreement as HR.",
    changeSummary: "Attempted cross-role edit",
  })).status, 403);

  const rejected = await call(`${firstOrgPath}/${rejectedDraft.data.id}/review`, adminUserId, "PATCH", {
    status: "rejected",
    reviewNote: "Confirm the privacy terms with counsel.",
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.status, "rejected");
  const nextDraft = await call(firstOrgPath, adminUserId, "POST", {
    changeSummary: "Updated draft after legal review notes",
  });
  assert.equal(nextDraft.status, 201);
  assert.equal(nextDraft.data.versionNumber, 2);
  assert.equal(nextDraft.data.replacesVersionNumber, 1);
  versionIds.push(nextDraft.data.id);

  const edited = await call(`${firstOrgPath}/${nextDraft.data.id}`, adminUserId, "PATCH", {
    agreementText: `${nextDraft.data.agreementText}\n\nAdditional wording for counsel review.`,
    changeSummary: "Clarified the draft for counsel review",
  });
  assert.equal(edited.status, 200);
  assert.match(edited.data.agreementText, /Additional wording for counsel review/);
  const approved = await call(`${firstOrgPath}/${nextDraft.data.id}/review`, adminUserId, "PATCH", {
    status: "approved",
    reviewNote: null,
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.status, "approved");

  const upload = await call(`${firstOrgPath}/${nextDraft.data.id}/upload-url`, adminUserId, "POST", {
    documentName: "MaydanGo-corporate-agreement.pdf",
    size: 200,
    contentType: "application/pdf",
  });
  assert.equal(upload.status, 200);
  files.set(lastUploadPath, { contentType: "application/pdf", size: 24 });
  const signed = await call(`${firstOrgPath}/${nextDraft.data.id}/complete`, adminUserId, "POST", {
    uploadId: upload.data.uploadId,
  });
  assert.equal(signed.status, 200);
  assert.equal(signed.data.status, "signed");
  assert.equal(signed.data.signedDocumentName, "MaydanGo-corporate-agreement.pdf");

  const companySignedHistory = await call(firstCompanyPath, firstHrUserId);
  assert.equal(companySignedHistory.status, 200);
  assert.equal(companySignedHistory.data[0].status, "signed");
  assert.equal(companySignedHistory.data[0].reviewNote, null);
  assert.equal((await call(`/corporate/organizations/${organizationIds[0]}/agreements/${nextDraft.data.id}/file`, secondHrUserId)).status, 404);
  const download = await fetch(
    `http://127.0.0.1:${(server!.address() as { port: number }).port}/corporate/organizations/${organizationIds[0]}/agreements/${nextDraft.data.id}/file`,
    { headers: { "x-test-user": firstHrUserId } },
  );
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.equal(await download.text(), "private signed agreement");

  const history = await call(firstOrgPath, adminUserId);
  assert.deepEqual(history.data.map((version: { status: string }) => version.status), ["signed", "rejected"]);
  const auditRows = await db.select().from(operationAudit).where(eq(operationAudit.actorId, adminUserId));
  assert.equal(auditRows.some(row => row.action === "corporate.agreement.signed_copy_recorded"), true);
  const agreementRows = await db.select().from(corporateAgreementVersions)
    .where(inArray(corporateAgreementVersions.id, versionIds));
  assert.equal(agreementRows.every(row => row.organizationId === organizationIds[0]), true);
  const employeeRows = await db.select({ id: corporateEmployees.id }).from(corporateEmployees)
    .where(eq(corporateEmployees.organizationId, organizationIds[0]));
  assert.equal(employeeRows.length, 0);
  const membershipRows = await db.select({ userId: memberships.userId }).from(memberships)
    .where(eq(memberships.corporateId, organizationIds[0]));
  assert.equal(membershipRows.length, 0);
});
