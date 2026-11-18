import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import express from "express";
import {
  db, facilityProfiles, offerings, operationAudit, operators, partners, pool,
} from "@workspace/db";
import facilitiesPublicRouter from "./facilities-public";
import operationsRouter from "./operations";

const prefix = `facility-security-${randomUUID()}`;
const partnerA = `${prefix}-partner-a`;
const partnerB = `${prefix}-partner-b`;
const unapprovedPartner = `${prefix}-unapproved`;
const userA = `${prefix}-user-a`;
const userB = `${prefix}-user-b`;
const adminUser = `${prefix}-admin`;
const profileA = `${prefix}-profile-a`;
const profileB = `${prefix}-profile-b`;
const hiddenProfile = `${prefix}-profile-hidden`;
const offeringId = `${prefix}-offering`;
const actorIds = [userA, userB, adminUser];
const profileIds = [profileA, profileB, hiddenProfile];
let server: Server | null = null;

const openingHours = Array.from({ length: 7 }, (_, day) => ({
  day, closed: true, opensAt: null, closesAt: null,
}));
function profileContent(name: string, description: string) {
  return {
    city: "Baghdad",
    facility: name,
    localizedName: { en: name, ar: `مرفق ${name}`, ku: `شوێنی ${name}` },
    localizedDistrict: { en: "Test district", ar: "منطقة اختبار", ku: "ناوچەی تاقیکردنەوە" },
    localizedAddress: { en: "Test address", ar: "عنوان اختبار", ku: "ناونیشانی تاقیکردنەوە" },
    localizedDescription: { en: description, ar: "وصف اختباري", ku: "وەسفی تاقیکردنەوە" },
    activities: [],
    amenities: [],
    accessibility: [],
    openingHours,
    contactPhone: null,
    websiteUrl: null,
    latitude: null,
    longitude: null,
  };
}
function updateBody(name: string, description: string) {
  return profileContent(name, description);
}

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
app.use("/operations", operationsRouter);
app.use("/public", facilitiesPublicRouter);

async function call(path: string, userId?: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(userId ? { "x-test-user": userId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json() as unknown;
  return { status: response.status, data };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  // operation_audit is append-only; randomized test records are intentionally retained.
  await db.delete(offerings).where(eq(offerings.id, offeringId));
  await db.delete(facilityProfiles).where(inArray(facilityProfiles.id, profileIds));
  await db.delete(operators).where(inArray(operators.userId, actorIds));
  await db.delete(partners).where(inArray(partners.id, [partnerA, partnerB, unapprovedPartner]));
  await pool.end();
});

test("facility records stay partner-scoped and public listings require partner approval", async () => {
  await db.insert(partners).values([
    { id: partnerA, name: `${prefix} approved A`, groupId: prefix, ownerUserId: userA, approved: true },
    { id: partnerB, name: `${prefix} approved B`, groupId: prefix, ownerUserId: userB, approved: true },
    { id: unapprovedPartner, name: `${prefix} pending`, groupId: prefix, ownerUserId: `${prefix}-pending-user`, approved: false },
  ]);
  await db.insert(operators).values([
    { userId: userA, role: "partner", partnerId: partnerA },
    { userId: userB, role: "partner", partnerId: partnerB },
    { userId: adminUser, role: "partner_operations_admin", partnerId: null },
  ]);
  await db.insert(facilityProfiles).values([
    { id: profileA, partnerId: partnerA, ...profileContent(`${prefix} facility A`, "Original A") },
    { id: profileB, partnerId: partnerB, ...profileContent(`${prefix} facility B`, "Original B") },
    { id: hiddenProfile, partnerId: unapprovedPartner, ...profileContent(`${prefix} hidden facility`, "Hidden") },
  ]);
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(offerings).values({
    id: offeringId,
    kind: "session",
    targetId: `${prefix}-session`,
    title: "Strength session",
    localizedTitle: { en: "Strength session", ar: "حصة قوة", ku: "وانەی هێز" },
    localizedInstructor: { en: "Rana Ahmed", ar: "رنا أحمد", ku: "ڕەنا ئەحمەد" },
    scope: "live",
    partnerId: partnerA,
    city: "Baghdad",
    facility: `${prefix} facility A`,
    category: "Fitness",
    tiers: ["M", "XL"],
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
    cancellationDeadline: new Date(startsAt.getTime() - 60 * 60 * 1000),
    capacity: 10,
    accessType: "premium",
    active: true,
    approvalStatus: "published",
    activityStatus: "published",
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/operations/facilities")).status, 401);
  const partnerFacilities = await call("/operations/facilities", userA);
  assert.equal(partnerFacilities.status, 200);
  assert.deepEqual(
    (partnerFacilities.data as Array<{ id: string }>).map(row => row.id),
    [profileA],
  );

  assert.equal((await call(`/operations/facilities/${profileB}`, userA, "PUT", updateBody(`${prefix} facility B`, "Forged update"))).status, 403);
  assert.equal((await call(`/operations/facilities/${profileB}`, userA, "DELETE")).status, 403);
  const [unchangedB] = await db.select().from(facilityProfiles).where(eq(facilityProfiles.id, profileB));
  assert.equal(unchangedB.localizedDescription.en, "Original B");

  const authorizedUpdate = await call(`/operations/facilities/${profileA}`, userA, "PUT", updateBody(`${prefix} facility A`, "Partner-owned update"));
  assert.equal(authorizedUpdate.status, 200);
  const [updatedA] = await db.select().from(facilityProfiles).where(eq(facilityProfiles.id, profileA));
  assert.equal(updatedA.localizedDescription.en, "Partner-owned update");

  const adminFacilities = await call("/operations/facilities", adminUser);
  assert.equal(adminFacilities.status, 200);
  const adminFacilityIds = (adminFacilities.data as Array<{ id: string }>).map(row => row.id);
  assert.ok(adminFacilityIds.includes(profileA));
  assert.ok(adminFacilityIds.includes(profileB));
  assert.ok(adminFacilityIds.includes(hiddenProfile));
  assert.equal((await call(`/operations/facilities/${profileB}`, adminUser, "PUT", updateBody(`${prefix} facility B`, "Admin update"))).status, 200);

  const publicFacilities = await call("/public/facilities");
  assert.equal(publicFacilities.status, 200);
  const publicIds = (publicFacilities.data as Array<{ id: string }>).map(row => row.id);
  assert.ok(publicIds.includes(profileA));
  assert.ok(publicIds.includes(profileB));
  assert.ok(!publicIds.includes(hiddenProfile));
  const publicFacilityA = (publicFacilities.data as Array<{
    id: string;
    upcomingSessions: Array<{ tiers: string[]; localizedInstructor: { en: string } | null }>;
  }>).find(row => row.id === profileA);
  assert.deepEqual(publicFacilityA?.upcomingSessions[0]?.tiers, ["M", "XL"]);
  assert.equal(publicFacilityA?.upcomingSessions[0]?.localizedInstructor?.en, "Rana Ahmed");
  assert.equal((await call(`/public/facilities/${hiddenProfile}`)).status, 404);
  const publicApprovedProfile = await call(`/public/facilities/${profileA}`);
  assert.equal(publicApprovedProfile.status, 200);
  assert.ok(Array.isArray((publicApprovedProfile.data as { specialHours: unknown[] }).specialHours));
});
