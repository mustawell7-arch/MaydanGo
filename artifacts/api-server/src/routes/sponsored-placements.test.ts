import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import {
  db, facilityProfiles, memberships, operationAudit, operators, partners,
  pool, sponsoredFacilityCampaigns, sponsoredPlacementEvents,
} from "@workspace/db";
import operationsRouter from "./operations";
import sponsoredPlacementsRouter from "./sponsored-placements";

const prefix = `sponsored-placement-${randomUUID()}`;
const partnerId = `${prefix}-partner`;
const facilityId = `${prefix}-facility`;
const marketingUser = `${prefix}-marketing-admin`;
const financeUser = `${prefix}-finance-admin`;
const memberUser = `${prefix}-member`;
const previewUser = `${prefix}-preview`;
const campaignIds: string[] = [];
let server: Server | null = null;

const hours = Array.from({ length: 7 }, (_, day) => ({
  day, closed: true, opensAt: null, closesAt: null,
}));
const dateOffset = (days: number) => new Date(Date.now() + days * 86_400_000);

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
app.use("/test-operations", operationsRouter);
app.use(sponsoredPlacementsRouter);

async function call(path: string, userId?: string, method = "GET", body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${(server!.address() as { port: number }).port}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(userId ? { "x-test-user": userId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json() as unknown };
}

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  if (campaignIds.length) {
    await db.delete(sponsoredPlacementEvents).where(inArray(sponsoredPlacementEvents.campaignId, campaignIds));
    await db.delete(sponsoredFacilityCampaigns).where(inArray(sponsoredFacilityCampaigns.id, campaignIds));
  }
  await db.delete(memberships).where(inArray(memberships.userId, [memberUser, previewUser]));
  await db.delete(facilityProfiles).where(eq(facilityProfiles.id, facilityId));
  await db.delete(operators).where(inArray(operators.userId, [marketingUser, financeUser]));
  await db.delete(partners).where(eq(partners.id, partnerId));
  // operation_audit is append-only; randomized campaign events are intentionally retained.
  await pool.end();
});

test("sponsored facility campaigns enforce role, schedule, membership targeting, and event reporting", async () => {
  await db.insert(partners).values({
    id: partnerId, name: `${prefix} partner`, groupId: prefix, ownerUserId: marketingUser, approved: true,
  });
  await db.insert(operators).values([
    { userId: marketingUser, role: "marketing_admin", partnerId: null },
    { userId: financeUser, role: "finance_admin", partnerId: null },
  ]);
  await db.insert(facilityProfiles).values({
    id: facilityId,
    partnerId,
    city: "Baghdad",
    facility: `${prefix} facility`,
    localizedName: { en: "Strength House", ar: "بيت القوة", ku: "ماڵی هێز" },
    localizedDistrict: { en: "Karrada", ar: "الكرادة", ku: "کەرادە" },
    localizedAddress: { en: "Test address", ar: "عنوان اختبار", ku: "ناونیشانی تاقیکردنەوە" },
    localizedDescription: { en: "Test facility", ar: "مرفق اختباري", ku: "شوێنی تاقیکردنەوە" },
    activities: [{ en: "Strength", ar: "تمارين القوة", ku: "ڕاهێنانی هێز" }],
    amenities: [],
    accessibility: [],
    openingHours: hours,
    contactPhone: null,
    websiteUrl: null,
    latitude: null,
    longitude: null,
  });
  await db.insert(memberships).values([
    {
      userId: memberUser, scope: "live", status: "active", paymentStatus: "paid", tier: "M", source: "paid",
      startsAt: dateOffset(-1), endsAt: dateOffset(30), rules: {} as typeof memberships.$inferInsert["rules"],
    },
    {
      userId: previewUser, scope: "preview", status: "active", paymentStatus: "paid", tier: "M", source: "preview",
      startsAt: dateOffset(-1), endsAt: dateOffset(30), rules: {} as typeof memberships.$inferInsert["rules"],
    },
  ]);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  const portalState = await call("/test-operations/", marketingUser);
  assert.equal(portalState.status, 200);
  assert.deepEqual(portalState.data, {
    role: "marketing_admin", partnerId: null, partners: [], offerings: [], waitlist: [], plans: [],
  });
  assert.equal((await call("/test-operations/facilities", marketingUser)).status, 403);

  const input = {
    campaignName: "Baghdad strength launch",
    facilityId,
    placementTypes: ["home_featured", "search_sponsored"],
    targetCity: "Baghdad",
    targetActivity: "Strength",
    targetMembershipTiers: ["M"],
    startsAt: dateOffset(-1).toISOString(),
    endsAt: dateOffset(7).toISOString(),
    status: "active",
  };
  assert.equal((await call("/operations/sponsored-facilities", financeUser)).status, 403);
  const created = await call("/operations/sponsored-facilities", marketingUser, "POST", input);
  assert.equal(created.status, 201);
  const campaign = created.data as { id: string };
  campaignIds.push(campaign.id);

  assert.equal((await call("/public/sponsored-facilities")).status, 200);
  assert.equal(((await call("/public/sponsored-facilities")).data as unknown[]).length, 0);
  const memberPlacements = await call("/public/sponsored-facilities", memberUser);
  assert.equal(memberPlacements.status, 200);
  const placements = memberPlacements.data as Array<{ campaignId: string; facilityId: string; targetActivity: string | null }>;
  assert.equal(placements.length, 1);
  assert.equal(placements[0].campaignId, campaign.id);
  assert.equal(placements[0].facilityId, facilityId);
  assert.equal(placements[0].targetActivity, "Strength");
  assert.equal(((await call("/public/sponsored-facilities", previewUser)).data as unknown[]).length, 0);

  const impression = { eventType: "impression", placementType: "home_featured" };
  const click = { eventType: "click", placementType: "search_sponsored" };
  assert.equal((await call(`/public/sponsored-facilities/${campaign.id}/events`, undefined, "POST", impression)).status, 404);
  assert.equal((await call(`/public/sponsored-facilities/${campaign.id}/events`, memberUser, "POST", impression)).status, 204);
  assert.equal((await call(`/public/sponsored-facilities/${campaign.id}/events`, memberUser, "POST", click)).status, 204);

  const adminCampaigns = await call("/operations/sponsored-facilities", marketingUser);
  const tracked = (adminCampaigns.data as Array<{ id: string; impressions: number; clicks: number }>).find(item => item.id === campaign.id);
  assert.deepEqual({ impressions: tracked?.impressions, clicks: tracked?.clicks }, { impressions: 1, clicks: 1 });

  const paused = await call(`/operations/sponsored-facilities/${campaign.id}`, marketingUser, "PATCH", { ...input, status: "paused" });
  assert.equal(paused.status, 200);
  assert.equal(((await call("/public/sponsored-facilities", memberUser)).data as unknown[]).length, 0);
  const auditRows = await db.select().from(operationAudit).where(and(
    eq(operationAudit.targetId, campaign.id),
    inArray(operationAudit.action, ["sponsored_facility_campaign.created", "sponsored_facility_campaign.updated"]),
  ));
  assert.equal(auditRows.length, 2);
});
