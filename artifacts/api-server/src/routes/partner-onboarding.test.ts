import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  facilityProfiles,
  operationAudit,
  operators,
  partnerOnboardingApplications,
  partnerOnboardingDocuments,
  partnerOnboardingEvents,
  partners,
} from "@workspace/db";
import { ObjectNotFoundError, type ObjectStorageService } from "../lib/objectStorage";
import { createPartnerOnboardingRouter, type PartnerOnboardingStorage } from "./partner-onboarding";

const prefix = `partner-onboarding-test-${randomUUID()}`;
const applicantId = `${prefix}-applicant`;
const otherUserId = `${prefix}-other`;
const adminId = `${prefix}-admin`;
const userIds = [applicantId, otherUserId, adminId];
const storedFiles = new Map<string, { contentType: string; bytes: Buffer }>();
let server: Server | null = null;
let applicationId: string | null = null;
let partnerId: string | null = null;
let facilityId: string | null = null;

const mockStorage = {
  createPartnerApplicationUpload: async (appId: string, documentId: string) => ({
    uploadURL: `https://upload.invalid/${appId}/${documentId}`,
    documentPath: `/objects/partner-onboarding/${appId}/${documentId}`,
  }),
  getPrivateFile: async (path: string) => {
    const stored = storedFiles.get(path);
    if (!stored) throw new ObjectNotFoundError();
    return {
      getMetadata: async () => [{ contentType: stored.contentType, size: stored.bytes.length }],
      download: async () => [stored.bytes],
    } as unknown as Awaited<ReturnType<ObjectStorageService["getPrivateFile"]>>;
  },
  deletePrivateFile: async (path: string) => {
    storedFiles.delete(path);
  },
} satisfies PartnerOnboardingStorage;

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
app.use("/api", createPartnerOnboardingRouter(mockStorage, async userId =>
  userId === applicantId ? "verified-owner@example.test" : `${userId}@example.test`));

async function call(path: string, userId?: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(userId ? { "x-test-user": userId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data: unknown = text;
  try { data = JSON.parse(text) as unknown; } catch { /* Binary document response. */ }
  return { status: response.status, data, headers: response.headers };
}

const applicationInput = {
  applicantName: "Test Partner Owner",
  contactPhone: "+964 750 000 0000",
  legalBusinessName: "MaydanGo Test Fitness LLC",
  facilityName: "Test Fitness Studio",
  address: "Main street, building 10",
  city: "Erbil",
  district: "City Center",
  latitude: 36.19,
  longitude: 44.01,
  businessRegistrationReference: "REG-TEST-1",
  taxReference: "TAX-TEST-1",
  activityCategories: ["Fitness"],
  openingHours: Array.from({ length: 7 }, (_, day) => ({
    day,
    closed: false,
    opensAt: "08:00",
    closesAt: "20:00",
  })),
  capacity: 24,
  pricingDetails: "Pricing to be discussed during commercial negotiation.",
};

async function changeStatus(status: string) {
  return call(`/api/operations/partner-onboarding/applications/${applicationId}/status`, adminId, "PATCH", {
    status,
    note: `Review stage updated to ${status}.`,
  });
}

before(async () => {
  await db.insert(operators).values({
    userId: adminId,
    role: "partner_operations_admin",
    partnerId: null,
  });
  server = app.listen(0);
  await new Promise<void>(resolve => server!.once("listening", () => resolve()));
});

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (applicationId) {
    const docs = await db.select({ documentPath: partnerOnboardingDocuments.documentPath })
      .from(partnerOnboardingDocuments).where(eq(partnerOnboardingDocuments.applicationId, applicationId));
    for (const doc of docs) storedFiles.delete(doc.documentPath);
    await db.delete(partnerOnboardingEvents).where(eq(partnerOnboardingEvents.applicationId, applicationId));
    await db.delete(partnerOnboardingDocuments).where(eq(partnerOnboardingDocuments.applicationId, applicationId));
    await db.delete(partnerOnboardingApplications).where(eq(partnerOnboardingApplications.id, applicationId));
  }
  if (partnerId) {
    if (facilityId) await db.delete(facilityProfiles).where(eq(facilityProfiles.id, facilityId));
    await db.delete(operators).where(eq(operators.userId, applicantId));
    await db.delete(partners).where(eq(partners.id, partnerId));
  }
  await db.delete(operators).where(inArray(operators.userId, [adminId, otherUserId]));
  storedFiles.clear();
});

test("partner applications are private, documents are scoped, and staff creation waits for setup approval", async () => {
  assert.equal((await call("/api/partner-onboarding/mine")).status, 401);
  const submitted = await call("/api/partner-onboarding/applications", applicantId, "POST", applicationInput);
  assert.equal(submitted.status, 201);
  const details = submitted.data as { application: { id: string; contactEmail: string; status: string } };
  applicationId = details.application.id;
  assert.equal(details.application.contactEmail, "verified-owner@example.test");
  assert.equal(details.application.status, "application_received");

  const deniedList = await call("/api/operations/partner-onboarding/applications", otherUserId);
  assert.equal(deniedList.status, 403);
  const applications = await call("/api/operations/partner-onboarding/applications", adminId);
  assert.equal(applications.status, 200);
  assert.ok((applications.data as Array<{ id: string }>).some(item => item.id === applicationId));

  const skipped = await changeStatus("live");
  assert.equal(skipped.status, 400);
  assert.equal((await changeStatus("under_review")).status, 200);
  assert.equal((await changeStatus("additional_documents_required")).status, 200);

  const update = await call(`/api/partner-onboarding/applications/${applicationId}`, applicantId, "PATCH", {
    ...applicationInput,
    facilityName: "Updated Test Fitness Studio",
  });
  assert.equal(update.status, 200);

  const upload = await call(
    `/api/partner-onboarding/applications/${applicationId}/documents/upload-url`,
    applicantId,
    "POST",
    {
      documentName: "business-registration.pdf",
      documentType: "business_registration",
      contentType: "application/pdf",
      size: 512,
      expiresOn: null,
    },
  );
  assert.equal(upload.status, 200);
  const uploadInfo = upload.data as { id: string };
  const [document] = await db.select().from(partnerOnboardingDocuments)
    .where(eq(partnerOnboardingDocuments.id, uploadInfo.id)).limit(1);
  assert.ok(document);
  storedFiles.set(document.documentPath, {
    contentType: "application/pdf",
    bytes: Buffer.from("%PDF-1.7 MaydanGo partner application test"),
  });
  const completed = await call(
    `/api/partner-onboarding/applications/${applicationId}/documents/${uploadInfo.id}/complete`,
    applicantId,
    "POST",
  );
  assert.equal(completed.status, 200);
  assert.equal((completed.data as { status: string }).status, "submitted");
  assert.equal((await changeStatus("under_review")).status, 200);

  const deniedReview = await call(
    `/api/operations/partner-onboarding/applications/${applicationId}/documents/${uploadInfo.id}/review`,
    otherUserId,
    "PATCH",
    { status: "approved", note: "Registration details are correct." },
  );
  assert.equal(deniedReview.status, 403);
  const rejected = await call(
    `/api/operations/partner-onboarding/applications/${applicationId}/documents/${uploadInfo.id}/review`,
    adminId,
    "PATCH",
    { status: "rejected", note: "Please upload a clearer copy." },
  );
  assert.equal(rejected.status, 200);
  assert.equal((rejected.data as { status: string }).status, "rejected");
  const applicantAfterReview = await call("/api/partner-onboarding/mine", applicantId);
  assert.equal((applicantAfterReview.data as { application: { status: string } }).application.status, "additional_documents_required");

  const replacementUpload = await call(
    `/api/partner-onboarding/applications/${applicationId}/documents/upload-url`,
    applicantId,
    "POST",
    {
      documentName: "business-registration-replacement.pdf",
      documentType: "business_registration",
      contentType: "application/pdf",
      size: 640,
      expiresOn: null,
    },
  );
  assert.equal(replacementUpload.status, 200);
  const replacement = replacementUpload.data as { id: string };
  const [replacementDocument] = await db.select().from(partnerOnboardingDocuments)
    .where(eq(partnerOnboardingDocuments.id, replacement.id)).limit(1);
  assert.ok(replacementDocument);
  storedFiles.set(replacementDocument.documentPath, {
    contentType: "application/pdf",
    bytes: Buffer.from("%PDF-1.7 MaydanGo replacement document"),
  });
  assert.equal((await call(
    `/api/partner-onboarding/applications/${applicationId}/documents/${replacement.id}/complete`,
    applicantId,
    "POST",
  )).status, 200);
  const reviewed = await call(
    `/api/operations/partner-onboarding/applications/${applicationId}/documents/${replacement.id}/review`,
    adminId,
    "PATCH",
    { status: "approved", note: "The replacement copy is clear." },
  );
  assert.equal(reviewed.status, 200);
  assert.equal((reviewed.data as { status: string }).status, "approved");

  const crossAccountDownload = await call(
    `/api/partner-onboarding/applications/${applicationId}/documents/${uploadInfo.id}/download`,
    otherUserId,
  );
  assert.equal(crossAccountDownload.status, 403);
  const adminDownload = await call(
    `/api/partner-onboarding/applications/${applicationId}/documents/${uploadInfo.id}/download`,
    adminId,
  );
  assert.equal(adminDownload.status, 200);
  assert.match(String(adminDownload.data), /MaydanGo partner application test/);
  assert.equal(adminDownload.headers.get("cache-control"), "private, no-store");

  assert.equal((await changeStatus("under_review")).status, 200);
  assert.equal((await changeStatus("commercial_negotiation")).status, 200);
  assert.equal((await changeStatus("contract_issued")).status, 200);
  assert.equal((await changeStatus("contract_signed")).status, 200);
  const facilitySetup = await changeStatus("facility_setup");
  assert.equal(facilitySetup.status, 200);
  const application = (facilitySetup.data as { application: { partnerId: string | null } }).application;
  assert.ok(application.partnerId);
  partnerId = application.partnerId;
  const [partner] = await db.select().from(partners).where(eq(partners.id, partnerId)).limit(1);
  assert.equal(partner?.approved, false);
  const [owner] = await db.select().from(operators).where(eq(operators.userId, applicantId)).limit(1);
  assert.equal(owner?.role, "partner");
  assert.equal(owner?.partnerId, partnerId);

  facilityId = randomUUID();
  await db.insert(facilityProfiles).values({
    id: facilityId,
    partnerId,
    city: applicationInput.city,
    facility: applicationInput.facilityName,
    localizedName: { en: applicationInput.facilityName, ar: "مركز تجريبي", ku: "تاقیگەی تاقیکردنەوە" },
    localizedDistrict: { en: applicationInput.district, ar: "المنطقة الوسطى", ku: "ناوەندی شار" },
    localizedAddress: { en: applicationInput.address, ar: "شارع رئيسي", ku: "شەقامی سەرەکی" },
    localizedDescription: { en: "Test facility", ar: "منشأة تجريبية", ku: "شوێنی تاقیکردنەوە" },
    activities: [{ en: "Fitness", ar: "لياقة", ku: "ڕاهێنان" }],
    amenities: [],
    accessibility: [],
    openingHours: applicationInput.openingHours,
    contactPhone: null,
    websiteUrl: null,
    latitude: applicationInput.latitude,
    longitude: applicationInput.longitude,
  });
  const [privateFacility] = await db.select({ publishedAt: facilityProfiles.publishedAt })
    .from(facilityProfiles).where(eq(facilityProfiles.id, facilityId)).limit(1);
  assert.equal(privateFacility?.publishedAt, null);
  for (const status of ["qr_code_issued", "staff_training_completed", "test_checkin_completed", "approved", "live"]) {
    assert.equal((await changeStatus(status)).status, 200);
  }
  const [publishedFacility] = await db.select({ publishedAt: facilityProfiles.publishedAt })
    .from(facilityProfiles).where(eq(facilityProfiles.id, facilityId)).limit(1);
  assert.ok(publishedFacility?.publishedAt instanceof Date);
});
