import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import express from "express";
import {
  db, courseEnrollments, learningCourses, offerings, operationAudit, operators, partners, pool,
  reservations, sponsoredContentCampaigns, sponsoredContentPlacementEvents,
} from "@workspace/db";
import sponsoredContentRouter from "./sponsored-content";

const prefix = `sponsored-content-${randomUUID()}`;
const partnerId = `${prefix}-partner`;
const marketingUser = `${prefix}-marketing`;
const financeUser = `${prefix}-finance`;
const eventId = `${prefix}-event`;
const courseId = `${prefix}-course`;
const campaignIds: string[] = [];
const reservationIds: string[] = [];
const enrollmentIds: string[] = [];
let server: Server | null = null;

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
app.use(sponsoredContentRouter);

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
    await db.delete(sponsoredContentPlacementEvents).where(inArray(sponsoredContentPlacementEvents.campaignId, campaignIds));
    await db.delete(sponsoredContentCampaigns).where(inArray(sponsoredContentCampaigns.id, campaignIds));
  }
  if (reservationIds.length) await db.delete(reservations).where(inArray(reservations.id, reservationIds));
  if (enrollmentIds.length) await db.delete(courseEnrollments).where(inArray(courseEnrollments.id, enrollmentIds));
  await db.delete(offerings).where(eq(offerings.id, eventId));
  await db.delete(learningCourses).where(eq(learningCourses.id, courseId));
  await db.delete(operators).where(inArray(operators.userId, [marketingUser, financeUser]));
  await db.delete(partners).where(eq(partners.id, partnerId));
  await pool.end();
});

test("event and course campaigns enforce targeting and report verified conversions", async () => {
  await db.insert(partners).values({
    id: partnerId, name: `${prefix} partner`, groupId: prefix, ownerUserId: marketingUser, approved: true,
  });
  await db.insert(operators).values([
    { userId: marketingUser, role: "marketing_admin", partnerId: null },
    { userId: financeUser, role: "finance_admin", partnerId: null },
  ]);
  await db.insert(offerings).values({
    id: eventId,
    kind: "event",
    targetId: eventId,
    slot: "",
    title: "Community movement session",
    localizedTitle: { en: "Community movement session", ar: "فعالية حركة مجتمعية", ku: "چالاکی جووڵەی کۆمەڵایەتی" },
    localizedDescription: null,
    instructions: null,
    imagePath: null,
    bookingCutoffMinutes: 0,
    localizedInstructor: null,
    difficultyLevel: null,
    instructionLanguage: null,
    requiredEquipment: null,
    joinUrl: null,
    scope: "live",
    partnerId,
    partnerGroup: null,
    recurrenceGroupId: null,
    activityStatus: "published",
    reviewNote: null,
    approvalStatus: "published",
    approvalReason: null,
    partnerResponse: null,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    accessType: "physical",
    active: true,
    cancelledAt: null,
    city: "Baghdad",
    facility: "Community hall",
    category: "Fitness",
    tiers: ["M", "L", "XL"],
    startsAt: dateOffset(5),
    endsAt: dateOffset(5),
    cancellationDeadline: dateOffset(4),
    capacity: 20,
    waitlistOfferMinutes: 30,
    additionalPayment: false,
    gender: "all",
    minAge: 18,
    maxAge: null,
  });
  await db.insert(learningCourses).values({
    id: courseId,
    title: "At-home movement",
    localizedTitle: { en: "At-home movement", ar: "تمارين منزلية", ku: "ڕاهێنانی ماڵەوە" },
    localizedSummary: { en: "A course for home practice.", ar: "دورة للتمرين في المنزل.", ku: "کۆرسێک بۆ ڕاهێنان لە ماڵەوە." },
    localizedInstructor: { en: "Instructor", ar: "مدرب", ku: "ڕاهێنەر" },
    category: "Fitness",
    level: "beginner",
    durationMinutes: 40,
    published: true,
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));

  assert.equal((await call("/operations/sponsored-content", financeUser)).status, 403);
  const startsAt = dateOffset(-1).toISOString();
  const endsAt = dateOffset(7).toISOString();
  const create = async (targetType: "event" | "course", targetId: string, targetCity: string | null) => {
    const result = await call("/operations/sponsored-content", marketingUser, "POST", {
      campaignName: `${targetType} campaign`,
      targetType,
      targetId,
      placementTypes: [targetType === "event" ? "featured_event" : "featured_course", "home_promotion"],
      targetCity,
      targetActivity: "Fitness",
      targetMembershipTiers: [],
      startsAt,
      endsAt,
      status: "active",
    });
    assert.equal(result.status, 201);
    const campaign = result.data as { id: string };
    campaignIds.push(campaign.id);
    return campaign.id;
  };
  const eventCampaignId = await create("event", eventId, "Baghdad");
  const courseCampaignId = await create("course", courseId, null);

  const noCity = await call("/public/sponsored-content");
  assert.equal((noCity.data as unknown[]).some(item => (item as { campaignId: string }).campaignId === eventCampaignId), false);
  const cityFiltered = await call("/public/sponsored-content?city=Baghdad");
  assert.equal((cityFiltered.data as Array<{ campaignId: string }>).some(item => item.campaignId === eventCampaignId), true);
  assert.equal((cityFiltered.data as Array<{ campaignId: string }>).some(item => item.campaignId === courseCampaignId), true);

  const eventReservationId = randomUUID();
  reservationIds.push(eventReservationId);
  await db.insert(reservations).values({
    id: eventReservationId, userId: marketingUser, offeringId: eventId, status: "reserved",
  });
  const enrollmentId = randomUUID();
  enrollmentIds.push(enrollmentId);
  await db.insert(courseEnrollments).values({
    id: enrollmentId, userId: marketingUser, courseId,
  });

  const eventImpression = { eventType: "impression", placementType: "featured_event" };
  const eventClick = { eventType: "click", placementType: "home_promotion" };
  const eventConversion = { eventType: "conversion", placementType: "featured_event" };
  assert.equal((await call(`/public/sponsored-content/${eventCampaignId}/events`, undefined, "POST", eventImpression)).status, 204);
  assert.equal((await call(`/public/sponsored-content/${eventCampaignId}/events`, marketingUser, "POST", eventClick)).status, 204);
  assert.equal((await call(`/public/sponsored-content/${eventCampaignId}/events`, marketingUser, "POST", eventConversion)).status, 204);
  assert.equal((await call(`/public/sponsored-content/${eventCampaignId}/events`, marketingUser, "POST", eventConversion)).status, 204);
  assert.equal((await call(`/public/sponsored-content/${courseCampaignId}/events`, marketingUser, "POST", {
    eventType: "conversion", placementType: "home_promotion",
  })).status, 204);
  assert.equal((await call(`/public/sponsored-content/${courseCampaignId}/events`, financeUser, "POST", {
    eventType: "conversion", placementType: "featured_course",
  })).status, 404);

  const campaigns = (await call("/operations/sponsored-content", marketingUser)).data as Array<{
    id: string; impressions: number; clicks: number; conversions: number;
  }>;
  const event = campaigns.find(item => item.id === eventCampaignId);
  const course = campaigns.find(item => item.id === courseCampaignId);
  assert.deepEqual(
    { impressions: event?.impressions, clicks: event?.clicks, conversions: event?.conversions },
    { impressions: 1, clicks: 1, conversions: 1 },
  );
  assert.equal(course?.conversions, 1);

  const eventAudit = await db.select().from(operationAudit).where(and(
    eq(operationAudit.targetId, eventCampaignId),
    eq(operationAudit.action, "sponsored_content_campaign.created"),
  ));
  assert.equal(eventAudit.length, 1);
});
