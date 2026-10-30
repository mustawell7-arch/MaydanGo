import { Router } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { and, desc, eq, inArray, sql, asc, gt, isNull, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { db, operators, partners, offerings, reservations, waitlistEntries, membershipPlans, memberships, accessGrants, operationAudit, attendance, attendanceEvents, checkinPolicies, learningCourses, learningLessons, facilityProfiles, partnerInvoiceSubmissions, membershipBilling, paymentWebhookEvents, financeReviewItems, financeReviewEvents } from "@workspace/db";
import { BookingError, processWaitlistQueue } from "../lib/reservations";
import { createFacilityProfileInput, facilityProfileFields, offeringInput, partnerInput, planInput } from "../lib/operation-inputs";
import {
  AddLearningLessonBody, AddLearningLessonResponse, AddLiveOfferingResponse, ChangeLiveOfferingBody,
  ChangeLiveOfferingResponse,
  CreateLearningCourseBody, CreateLearningCourseResponse,
  CreateFacilityProfileBody, CreateFacilityProfileResponse, CreateRecurringOfferingsBody,
  CreateRecurringOfferingsResponse, GetOperationFacilitiesResponse, ReviewOfferingBody,
  ReviewOfferingResponse, SubmitOfferingResponse,
  UpdateFacilityProfileBody, UpdateFacilityProfileResponse,
  UpdateLearningCourseBody, UpdateLearningCourseResponse,
} from "@workspace/api-zod";
import { sendMemberNotification } from "../lib/notifications";
import { expandWeeklyOffering } from "../lib/recurring-offerings";
import {
  deriveOfferingSessionStatus, effectiveOfferingActivityStatus, transitionOfferingActivity,
} from "../lib/offering-status";

import { PaymentError, paymentsEnabled, payTabsTestModeEnabled } from "../lib/payment-config";

import { cancelPaidSubscriptionImmediately, requestFullRefund, validatePaidPlan } from "../lib/payments-paytabs";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  GetPartnerInvoicesResponse, GetPartnerSettlementSummaryResponse, RequestPartnerInvoiceUploadUrlBody,
  RequestPartnerInvoiceUploadUrlResponse, SubmitPartnerInvoiceBody, SubmitPartnerInvoiceResponse,
} from "@workspace/api-zod";

const router = Router();
const objectStorage = new ObjectStorageService();
router.use(async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in first." }); return; }
  const [operator] = await db.select().from(operators).where(eq(operators.userId, userId));
  if (!operator || !["admin", "finance", "partner"].includes(operator.role)) {
    res.status(403).json({ message: "Authorized staff access is required." }); return;
  }
  if (operator.role === "partner") {
    if (!operator.partnerId) { res.status(403).json({ message: "This partner account is not assigned to an approved partner." }); return; }
    const [partner] = await db.select({ approved: partners.approved }).from(partners).where(eq(partners.id, operator.partnerId));
    if (!partner?.approved) { res.status(403).json({ message: "Partner approval is required for portal access." }); return; }
  }
  res.locals.operator = operator; next();
});
const admin = (res: import("express").Response) => {
  if (res.locals.operator.role !== "admin") throw new BookingError(403, "Administrator access is required.");
};
const financeStaff = (res: import("express").Response) => {
  if (!["admin", "finance"].includes(res.locals.operator.role))
    throw new BookingError(403, "Finance staff access is required.");
};
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const secureHttps = (value: string | null | undefined) => {
  if (!value) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
};
function ensureHttps(value: string | null | undefined, label: string) {
  if (!secureHttps(value)) throw new BookingError(400, `${label} must be an HTTPS link.`);
}
async function audit(tx: Tx, actorId: string, action: string, targetId: string, detail = "") {
  await tx.insert(operationAudit).values({ id: randomUUID(), actorId, action, targetId, detail });
}
function own(res: import("express").Response, partnerId: string | null) {
  if (res.locals.operator.role !== "admin" && res.locals.operator.partnerId !== partnerId)
    throw new BookingError(403, "This partner is not assigned to your account.");
}
function partnerOnly(res: import("express").Response) {
  if (res.locals.operator.role !== "partner" || !res.locals.operator.partnerId)
    throw new BookingError(403, "This partner-only view is not available to administrators.");
  return res.locals.operator.partnerId as string;
}
const invoiceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
function offeringWithStatuses<T extends typeof offerings.$inferSelect>(row: T, occupiedPlaces = 0) {
  const activityStatus = effectiveOfferingActivityStatus(row);
  const sessionStatus = deriveOfferingSessionStatus({ ...row, activityStatus }, occupiedPlaces);
  return {
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    cancellationDeadline: row.cancellationDeadline.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    activityStatus,
    sessionStatus,
  };
}
router.get("/", async (_req, res) => {
  const op = res.locals.operator;
  const isStaff = op.role !== "partner";
  const [partnerRows, offeringRows, plans, queueRows] = await Promise.all([
    db.select().from(partners).where(isStaff ? undefined : eq(partners.id, op.partnerId ?? "")),
    db.select().from(offerings).where(and(eq(offerings.scope, "live"), isStaff ? undefined : eq(offerings.partnerId, op.partnerId ?? ""))),
    isStaff ? db.select().from(membershipPlans) : Promise.resolve([]),
    db.select({
      id: waitlistEntries.id, offeringId: waitlistEntries.offeringId, joinedAt: waitlistEntries.createdAt,
      title: offerings.title, localizedTitle: offerings.localizedTitle, city: offerings.city, facility: offerings.facility,
      startsAt: offerings.startsAt,
    }).from(waitlistEntries).innerJoin(offerings, eq(waitlistEntries.offeringId, offerings.id))
      .where(and(eq(waitlistEntries.status, "waiting"), eq(offerings.scope, "live"), eq(offerings.active, true),
        isNull(offerings.cancelledAt), gt(offerings.startsAt, new Date()),
         isStaff ? undefined : eq(offerings.partnerId, op.partnerId ?? "")))
      .orderBy(asc(offerings.startsAt), asc(waitlistEntries.createdAt), asc(waitlistEntries.id)),
  ]);
  const policyRows = offeringRows.length ? await db.select().from(checkinPolicies)
    .where(inArray(checkinPolicies.offeringId, offeringRows.map(row => row.id))) : [];
  const reservationCounts = offeringRows.length ? await db.select({
    offeringId: reservations.offeringId,
    count: sql<number>`count(*)::int`,
  }).from(reservations).where(and(
    inArray(reservations.offeringId, offeringRows.map(row => row.id)),
    inArray(reservations.status, ["reserved", "requested"]),
  )).groupBy(reservations.offeringId) : [];
  const activeOfferCounts = offeringRows.length ? await db.select({
    offeringId: waitlistEntries.offeringId,
    count: sql<number>`count(*)::int`,
  }).from(waitlistEntries).where(and(
    inArray(waitlistEntries.offeringId, offeringRows.map(row => row.id)),
    eq(waitlistEntries.status, "offered"),
    gt(waitlistEntries.offerExpiresAt, new Date()),
  )).groupBy(waitlistEntries.offeringId) : [];
  const policyByOffering = new Map(policyRows.map(policy => [policy.offeringId, policy]));
  const occupiedByOffering = new Map<string, number>();
  for (const row of reservationCounts) occupiedByOffering.set(row.offeringId, Number(row.count));
  for (const row of activeOfferCounts) occupiedByOffering.set(row.offeringId,
    (occupiedByOffering.get(row.offeringId) ?? 0) + Number(row.count));
  const queueCounts = new Map<string, number>();
  const waitlist = queueRows.map(row => {
    const position = (queueCounts.get(row.offeringId) ?? 0) + 1;
    queueCounts.set(row.offeringId, position);
    return { ...row, position };
  });
  res.json({ role: op.role, partnerId: op.partnerId,
    partners: partnerRows, offerings: offeringRows.map(row => ({
      ...offeringWithStatuses(row, occupiedByOffering.get(row.id) ?? 0),
      checkinPolicy: policyByOffering.get(row.id) ?? null,
    })), waitlist,
    plans: plans.map(({ whopPlanId: _legacyProviderId, ...plan }) => plan),
  });
});
router.post("/partners", async (req, res) => {
  admin(res);
  const data = partnerInput.parse(req.body);
  const result = await db.transaction(async tx => {
    // Do not overwrite an existing admin or another partner's operator assignment.
    if ((await tx.select().from(operators).where(eq(operators.userId, data.ownerUserId))).length)
      throw new BookingError(409, "This account already has a staff assignment.");
    const [row] = await tx.insert(partners).values({ ...data, id: randomUUID() }).returning();
    await tx.insert(operators).values({ userId: data.ownerUserId, role: "partner", partnerId: row.id });
    await audit(tx, res.locals.operator.userId, "partner.create", row.id);
    return row;
  });
  res.status(201).json(result);
});
router.patch("/partners/:id", async (req, res) => {
  admin(res);
  const data = z.object({ approved: z.boolean() }).strict().parse(req.body);
  const id = String(req.params.id);
  const row = await db.transaction(async tx => {
    const [p] = await tx.update(partners).set(data).where(eq(partners.id, id)).returning();
    if (!p) throw new BookingError(404, "Partner not found.");
    await audit(tx, res.locals.operator.userId, "partner.approval", id, String(data.approved));
    return p;
  });
  res.json(row);
});
router.get("/facilities", async (_req, res) => {
  const op = res.locals.operator;
  const rows = await db.select().from(facilityProfiles)
    .where(op.role === "admin" ? undefined : eq(facilityProfiles.partnerId, op.partnerId ?? ""))
    .orderBy(asc(facilityProfiles.city), asc(facilityProfiles.facility));
  res.json(GetOperationFacilitiesResponse.parse(rows));
});
router.post("/facilities", async (req, res) => {
  const data = createFacilityProfileInput.parse(req.body);
  CreateFacilityProfileBody.parse(data);
  own(res, data.partnerId);
  const [partner] = await db.select({ id: partners.id }).from(partners).where(eq(partners.id, data.partnerId));
  if (!partner) throw new BookingError(404, "Partner not found.");
  const [duplicate] = await db.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
    eq(facilityProfiles.partnerId, data.partnerId),
    eq(facilityProfiles.city, data.city),
    eq(facilityProfiles.facility, data.facility),
  )).limit(1);
  if (duplicate) throw new BookingError(409, "This partner already has a profile for that facility and city.");
  const { partnerId, ...profile } = data;
  const row = await db.transaction(async tx => {
    const [created] = await tx.insert(facilityProfiles).values({
      ...profile, id: randomUUID(), partnerId, updatedAt: new Date(),
    }).returning();
    await audit(tx, res.locals.operator.userId, "facility.create", created.id);
    return created;
  });
  res.status(201).json(CreateFacilityProfileResponse.parse(row));
});
router.put("/facilities/:id", async (req, res) => {
  const data = facilityProfileFields.parse(req.body);
  UpdateFacilityProfileBody.parse(data);
  const id = String(req.params.id);
  const row = await db.transaction(async tx => {
    const [existing] = await tx.select().from(facilityProfiles).where(eq(facilityProfiles.id, id)).for("update");
    if (!existing) throw new BookingError(404, "Facility profile not found.");
    own(res, existing.partnerId);
    if (existing.city !== data.city || existing.facility !== data.facility) {
      const [linked] = await tx.select({ id: offerings.id }).from(offerings).where(and(
        eq(offerings.partnerId, existing.partnerId),
        eq(offerings.city, existing.city),
        eq(offerings.facility, existing.facility),
      )).limit(1);
      if (linked) throw new BookingError(409, "This facility is used by existing sessions. Keep its city and facility name unchanged.");
    }
    const [duplicate] = await tx.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
      eq(facilityProfiles.partnerId, existing.partnerId),
      eq(facilityProfiles.city, data.city),
      eq(facilityProfiles.facility, data.facility),
    )).limit(1);
    if (duplicate && duplicate.id !== id) throw new BookingError(409, "This partner already has a profile for that facility and city.");
    const [updated] = await tx.update(facilityProfiles).set({ ...data, updatedAt: new Date() })
      .where(eq(facilityProfiles.id, id)).returning();
    await audit(tx, res.locals.operator.userId, "facility.update", id);
    return updated;
  });
  res.json(UpdateFacilityProfileResponse.parse(row));
});
router.delete("/facilities/:id", async (req, res) => {
  const id = String(req.params.id);
  await db.transaction(async tx => {
    const [existing] = await tx.select().from(facilityProfiles).where(eq(facilityProfiles.id, id)).for("update");
    if (!existing) throw new BookingError(404, "Facility profile not found.");
    own(res, existing.partnerId);
    const [linked] = await tx.select({ id: offerings.id }).from(offerings).where(and(
      eq(offerings.partnerId, existing.partnerId),
      eq(offerings.city, existing.city),
      eq(offerings.facility, existing.facility),
    )).limit(1);
    if (linked) throw new BookingError(409, "This facility is used by existing sessions and cannot be deleted.");
    await tx.delete(facilityProfiles).where(eq(facilityProfiles.id, id));
    await audit(tx, res.locals.operator.userId, "facility.delete", id);
  });
  res.sendStatus(204);
});
router.post("/offerings", async (req, res) => {
  const data = offeringInput.parse(req.body);
  own(res, data.partnerId);
  const row = await db.transaction(async tx => {
    const [p] = await tx.select().from(partners).where(eq(partners.id, data.partnerId)).for("share");
    if (!p) throw new BookingError(404, "Partner not found.");
    if (res.locals.operator.role === "partner" && data.active)
      throw new BookingError(403, "Partner activities must be reviewed and published by an administrator.");
    if (data.active && !p.approved) throw new BookingError(403, "Partner approval is required before publishing.");
    const [facility] = await tx.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
      eq(facilityProfiles.partnerId, data.partnerId),
      eq(facilityProfiles.city, data.city),
      eq(facilityProfiles.facility, data.facility),
    )).limit(1);
    if (!facility) throw new BookingError(400, "Choose a facility from your approved facility profiles.");
    const id = randomUUID();
    if (data.accessType === "live" && data.active) ensureHttps(data.joinUrl, "Live class join link");
    if (data.joinUrl) ensureHttps(data.joinUrl, "Live class join link");
    const [o] = await tx.insert(offerings).values({ ...data, id, targetId: id, slot: "", scope: "live",
      activityStatus: data.active ? "published" : "draft", reviewNote: null,
      localizedTitle: data.localizedTitle ?? null, localizedDescription: data.localizedDescription ?? null, joinUrl: data.joinUrl ?? null,
      partnerGroup: p.groupId, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt),
      cancellationDeadline: new Date(data.cancellationDeadline) }).returning();
    await audit(tx, res.locals.operator.userId, "offering.create", id);
    return o;
  });
  res.status(201).json(AddLiveOfferingResponse.parse(offeringWithStatuses(row)));
});
router.post("/offerings/recurring", async (req, res) => {
  const body = CreateRecurringOfferingsBody.parse(req.body);
  const template = offeringInput.parse(body.template);
  const schedule = { ...body.schedule, repeatUntil: body.schedule.repeatUntil.toISOString().slice(0, 10) };
  const occurrences = expandWeeklyOffering(template, schedule);
  own(res, template.partnerId);

  const created = await db.transaction(async tx => {
    const venueKey = `${template.city.trim().toLowerCase()}|${template.facility.trim().toLowerCase()}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${template.partnerId}), hashtext(${venueKey}))`);

    const [partner] = await tx.select().from(partners).where(eq(partners.id, template.partnerId)).for("share");
    if (!partner) throw new BookingError(404, "Partner not found.");
    if (res.locals.operator.role === "partner" && template.active)
      throw new BookingError(403, "Only an administrator can approve and publish a partner activity.");
    if (template.active && !partner.approved) throw new BookingError(403, "Partner approval is required before publishing.");
    const [facility] = await tx.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
      eq(facilityProfiles.partnerId, template.partnerId),
      eq(facilityProfiles.city, template.city),
      eq(facilityProfiles.facility, template.facility),
    )).limit(1);
    if (!facility) throw new BookingError(400, "Choose a facility from your approved facility profiles.");
    if (template.accessType === "live" && template.active) ensureHttps(template.joinUrl, "Live class join link");
    if (template.joinUrl) ensureHttps(template.joinUrl, "Live class join link");

    const first = occurrences[0];
    const last = occurrences[occurrences.length - 1];
    const existing = await tx.select({
      id: offerings.id, startsAt: offerings.startsAt, endsAt: offerings.endsAt,
    }).from(offerings).where(and(
      eq(offerings.scope, "live"),
      eq(offerings.partnerId, template.partnerId),
      sql`lower(${offerings.city}) = lower(${template.city})`,
      sql`lower(${offerings.facility}) = lower(${template.facility})`,
      isNull(offerings.cancelledAt),
      lt(offerings.startsAt, new Date(last.endsAt)),
      gt(offerings.endsAt, new Date(first.startsAt)),
    ));
    const conflict = existing.find(row => occurrences.some(occurrence =>
      new Date(occurrence.startsAt) < row.endsAt && new Date(occurrence.endsAt) > row.startsAt,
    ));
    if (conflict) throw new BookingError(409, "One or more sessions overlap an existing offering at this facility. No sessions were created.");

    const rows = [];
    for (const data of occurrences) {
      const id = randomUUID();
      const [row] = await tx.insert(offerings).values({
        ...data, id, targetId: id, slot: "", scope: "live", partnerGroup: partner.groupId,
        activityStatus: data.active ? "published" : "draft", reviewNote: null,
        localizedTitle: data.localizedTitle ?? null, localizedDescription: data.localizedDescription ?? null,
        joinUrl: data.joinUrl ?? null, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt),
        cancellationDeadline: new Date(data.cancellationDeadline),
      }).returning();
      await audit(tx, res.locals.operator.userId, "offering.create.recurring", id,
        `weekdays=${schedule.weekdays.join(",")};repeatUntil=${schedule.repeatUntil}`);
      rows.push(row);
    }
    return rows;
  });

  const response = created.map(row => ({
    ...offeringWithStatuses(row),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    cancellationDeadline: row.cancellationDeadline.toISOString(),
  }));
  res.status(201).json(CreateRecurringOfferingsResponse.parse(response));
});
router.patch("/offerings/:id", async (req, res) => {
  const data = ChangeLiveOfferingBody.parse(req.body);
  const row = await db.transaction(async tx => {
    const [o] = await tx.select().from(offerings).where(and(eq(offerings.id, String(req.params.id)), eq(offerings.scope, "live"))).for("update");
    if (!o) throw new BookingError(404, "Offering not found.");
    own(res, o.partnerId);
    if (o.cancelledAt) throw new BookingError(409, "Cancelled offerings cannot be edited or republished. Create a replacement.");
    if (o.startsAt <= new Date()) throw new BookingError(409, "Past offerings cannot be edited.");
    if (data.active !== undefined)
      throw new BookingError(400, "Use the activity submission and review actions to change publishing status.");
    const needsReview = res.locals.operator.role === "partner" && o.active &&
      (data.localizedTitle !== undefined || data.localizedDescription !== undefined || data.joinUrl !== undefined);
    const nextActive = needsReview ? false : o.active;
    const nextTitle = data.localizedTitle ?? o.localizedTitle;
    const nextDescription = data.localizedDescription ?? o.localizedDescription;
    const nextJoinUrl = data.joinUrl !== undefined ? data.joinUrl : o.joinUrl;
    if (o.accessType === "live" && nextActive) {
      if (!nextTitle || !nextDescription) throw new BookingError(400, "Live classes need English, Arabic and Sorani details.");
      ensureHttps(nextJoinUrl, "Live class join link");
    }
    if (data.joinUrl) ensureHttps(data.joinUrl, "Live class join link");
    if (nextActive) {
      const [p] = await tx.select().from(partners).where(eq(partners.id, o.partnerId!)).for("share");
      if (!p?.approved) throw new BookingError(403, "Partner approval is required.");
      const [facility] = await tx.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
        eq(facilityProfiles.partnerId, o.partnerId!),
        eq(facilityProfiles.city, o.city),
        eq(facilityProfiles.facility, o.facility),
      )).limit(1);
      if (!facility) throw new BookingError(409, "This session is not linked to an existing shared facility profile.");
    }
    const held = await tx.select().from(reservations).where(and(eq(reservations.offeringId, o.id), inArray(reservations.status, ["reserved", "requested"])));
    const [offers] = await tx.select({ count: sql<number>`count(*)::int` }).from(waitlistEntries)
      .where(and(eq(waitlistEntries.offeringId, o.id), eq(waitlistEntries.status, "offered"), gt(waitlistEntries.offerExpiresAt, new Date())));
    if (held.length + Number(offers?.count ?? 0) > data.capacity) throw new BookingError(409, "Capacity cannot be below existing reservations and active waitlist offers.");
    const [result] = await tx.update(offerings).set({
      capacity: data.capacity,
      ...(data.waitlistOfferMinutes !== undefined ? { waitlistOfferMinutes: data.waitlistOfferMinutes } : {}),
      ...(needsReview ? { active: false } : {}),
      ...(needsReview ? { activityStatus: "submitted", reviewNote: null } : {}),
      ...(data.localizedTitle !== undefined ? { localizedTitle: data.localizedTitle } : {}),
      ...(data.localizedDescription !== undefined ? { localizedDescription: data.localizedDescription } : {}),
      ...(data.joinUrl !== undefined ? { joinUrl: data.joinUrl } : {}),
    }).where(eq(offerings.id, o.id)).returning();
    await audit(tx, res.locals.operator.userId, "offering.update", o.id);
    return { offering: result, occupiedPlaces: held.length + Number(offers?.count ?? 0) };
  });
  await processWaitlistQueue();
  res.json(ChangeLiveOfferingResponse.parse(offeringWithStatuses(row.offering, row.occupiedPlaces)));
});
router.post("/offerings/:id/submit", async (req, res) => {
  if (res.locals.operator.role !== "partner") throw new BookingError(403, "Only a partner can submit an activity for review.");
  const id = String(req.params.id);
  const row = await db.transaction(async tx => {
    const [offering] = await tx.select().from(offerings).where(and(
      eq(offerings.id, id), eq(offerings.scope, "live"),
    )).for("update");
    if (!offering) throw new BookingError(404, "Offering not found.");
    own(res, offering.partnerId);
    if (offering.cancelledAt) throw new BookingError(409, "Cancelled offerings cannot be submitted.");
    if (offering.startsAt <= new Date()) throw new BookingError(409, "Past offerings cannot be submitted for review.");
    const current = effectiveOfferingActivityStatus(offering);
    if (current !== "draft" && current !== "changes_requested")
      throw new BookingError(409, "Only drafts or activities with requested changes can be submitted.");
    const [updated] = await tx.update(offerings).set({
      active: false, activityStatus: "submitted", reviewNote: null,
    }).where(eq(offerings.id, id)).returning();
    await audit(tx, res.locals.operator.userId, "offering.submit", id);
    return updated;
  });
  res.json(SubmitOfferingResponse.parse(offeringWithStatuses(row)));
});
router.post("/offerings/:id/review", async (req, res) => {
  admin(res);
  const data = ReviewOfferingBody.parse(req.body);
  const id = String(req.params.id);
  const result = await db.transaction(async tx => {
    const [offering] = await tx.select().from(offerings).where(and(
      eq(offerings.id, id), eq(offerings.scope, "live"),
    )).for("update");
    if (!offering) throw new BookingError(404, "Offering not found.");
    if (offering.cancelledAt) throw new BookingError(409, "Cancelled offerings cannot change activity status.");
    const current = effectiveOfferingActivityStatus(offering);
    const transition = transitionOfferingActivity(current, data.action, data.reason);
    if (!transition) throw new BookingError(409, "That review transition is not allowed from the current activity status, or a reason is missing.");

    if (data.action === "publish") {
      if (offering.startsAt <= new Date()) throw new BookingError(409, "Past activities cannot be published.");
      const [partner] = await tx.select().from(partners).where(eq(partners.id, offering.partnerId ?? "")).for("share");
      if (!partner?.approved) throw new BookingError(403, "Partner approval is required before publishing.");
      const [facility] = await tx.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
        eq(facilityProfiles.partnerId, offering.partnerId ?? ""),
        eq(facilityProfiles.city, offering.city),
        eq(facilityProfiles.facility, offering.facility),
      )).limit(1);
      if (!facility) throw new BookingError(409, "This activity is not linked to an approved facility profile.");
      if (offering.accessType === "live") {
        if (!offering.localizedTitle || !offering.localizedDescription)
          throw new BookingError(400, "Live classes need English, Arabic and Sorani details.");
        ensureHttps(offering.joinUrl, "Live class join link");
      }
      if (offering.joinUrl) ensureHttps(offering.joinUrl, "Live class join link");
    }

    const [updated] = await tx.update(offerings).set({
      activityStatus: transition.activityStatus,
      reviewNote: transition.reviewNote,
      active: transition.activityStatus === "published",
    }).where(eq(offerings.id, id)).returning();
    await audit(tx, res.locals.operator.userId, "offering.review",
      id, `${current} -> ${transition.activityStatus}; action=${data.action}${data.reason ? `; reason=${data.reason.trim()}` : ""}`);
    const [held] = await tx.select({ count: sql<number>`count(*)::int` }).from(reservations).where(and(
      eq(reservations.offeringId, id), inArray(reservations.status, ["reserved", "requested"]),
    ));
    const [offers] = await tx.select({ count: sql<number>`count(*)::int` }).from(waitlistEntries).where(and(
      eq(waitlistEntries.offeringId, id), eq(waitlistEntries.status, "offered"), gt(waitlistEntries.offerExpiresAt, new Date()),
    ));
    return {
      offering: updated,
      occupiedPlaces: Number(held?.count ?? 0) + Number(offers?.count ?? 0),
    };
  });
  if (data.action === "publish") await processWaitlistQueue();
  res.json(ReviewOfferingResponse.parse(offeringWithStatuses(result.offering, result.occupiedPlaces)));
});
router.get("/offerings/:id/waitlist", async (req, res) => {
  const [offering] = await db.select().from(offerings)
    .where(and(eq(offerings.id, String(req.params.id)), eq(offerings.scope, "live"))).limit(1);
  if (!offering) throw new BookingError(404, "Offering not found.");
  own(res, offering.partnerId);
  const rows = await db.select({
    id: waitlistEntries.id,
    queuePosition: waitlistEntries.queuePosition,
    status: waitlistEntries.status,
    createdAt: waitlistEntries.createdAt,
    offerExpiresAt: waitlistEntries.offerExpiresAt,
    respondedAt: waitlistEntries.respondedAt,
  }).from(waitlistEntries).where(eq(waitlistEntries.offeringId, offering.id))
    .orderBy(waitlistEntries.queuePosition);
  res.json(rows);
});
router.post("/offerings/:id/cancel", async (req, res) => {
  const affected = await db.transaction(async tx => {
    const [o] = await tx.select().from(offerings).where(and(eq(offerings.id, String(req.params.id)), eq(offerings.scope, "live"))).for("update");
    if (!o) throw new BookingError(404, "Offering not found.");
    own(res, o.partnerId);
    if (o.cancelledAt) return { bookingUsers: [], waitlistUsers: [] };
    if (o.startsAt <= new Date()) throw new BookingError(409, "Past sessions require attendance review.");
    const heldReservations = await tx.select({ userId: reservations.userId }).from(reservations)
      .where(and(eq(reservations.offeringId, o.id), inArray(reservations.status, ["reserved", "requested"])));
    await tx.update(offerings).set({ active: false, cancelledAt: new Date() }).where(eq(offerings.id, o.id));
    const arrivals = await tx.select().from(attendance).where(eq(attendance.offeringId, o.id));
    for (const a of arrivals) {
      await tx.update(attendance).set({ status: "void", settlementEligible: false }).where(eq(attendance.id, a.id));
      if (a.reservationId) await tx.insert(attendanceEvents).values({ id: randomUUID(), reservationId: a.reservationId,
        actorId: res.locals.operator.userId, action: "partner_cancelled", before: a.status, after: "void",
        reason: "Partner cancelled the offering; allowance restored." });
    }
    await tx.update(reservations).set({ status: "partner_cancelled", cancelledAt: new Date() })
      .where(and(eq(reservations.offeringId, o.id), inArray(reservations.status, ["reserved", "requested"])));
    const activeWaitlist = await tx.select({ userId: waitlistEntries.userId }).from(waitlistEntries)
      .where(and(eq(waitlistEntries.offeringId, o.id), inArray(waitlistEntries.status, ["waiting", "offered"])));
    await tx.update(waitlistEntries).set({ status: "closed", respondedAt: new Date() })
      .where(and(eq(waitlistEntries.offeringId, o.id), inArray(waitlistEntries.status, ["waiting", "offered"])));
    await audit(tx, res.locals.operator.userId, "offering.cancel", o.id);
    return { bookingUsers: heldReservations.map(r => r.userId), waitlistUsers: activeWaitlist.map(r => r.userId) };
  });
  for (const userId of new Set(affected.bookingUsers)) void sendMemberNotification(userId, "booking_cancelled");
  for (const userId of new Set(affected.waitlistUsers)) void sendMemberNotification(userId, "waitlist_closed");
  res.json({ ok: true });
});

router.get("/settlements", async (req, res) => {
  const partnerId = partnerOnly(res);
  const query = z.object({ from: invoiceDate, to: invoiceDate }).strict().parse(req.query);
  const from = new Date(`${query.from}T00:00:00+03:00`);
  const toExclusive = new Date(new Date(`${query.to}T00:00:00+03:00`).getTime() + 86400000);
  if (from >= toExclusive || toExclusive.getTime() - from.getTime() > 367 * 86400000)
    throw new BookingError(400, "Choose a valid settlement period of no more than one year.");
  const rows = await db.select({
    status: attendance.status,
    settlementEligible: attendance.settlementEligible,
    facility: offerings.facility,
    city: offerings.city,
    category: offerings.category,
    accessType: offerings.accessType,
  }).from(attendance).innerJoin(offerings, eq(attendance.offeringId, offerings.id))
    .where(and(eq(offerings.partnerId, partnerId), eq(offerings.scope, "live"),
      gte(attendance.checkedInAt, from), lt(attendance.checkedInAt, toExclusive)));
  const groups = new Map<string, {
    facility: string; city: string; category: string; accessType: "physical" | "premium" | "live";
    verifiedVisits: number; rejectedVisits: number; onHoldVisits: number;
  }>();
  for (const row of rows) {
    const key = [row.facility, row.city, row.category, row.accessType].join("\u0000");
    const group = groups.get(key) ?? {
      facility: row.facility, city: row.city, category: row.category,
      accessType: row.accessType as "physical" | "premium" | "live",
      verifiedVisits: 0, rejectedVisits: 0, onHoldVisits: 0,
    };
    if (row.status === "confirmed" && row.settlementEligible) group.verifiedVisits++;
    else if (["void", "no_show"].includes(row.status)) group.rejectedVisits++;
    else group.onHoldVisits++;
    groups.set(key, group);
  }
  const result = [...groups.values()].sort((a, b) =>
    a.city.localeCompare(b.city) || a.facility.localeCompare(b.facility) || a.category.localeCompare(b.category));
  const summary = {
    partnerId, from: query.from, to: query.to,
    verifiedVisits: result.reduce((sum, row) => sum + row.verifiedVisits, 0),
    rejectedVisits: result.reduce((sum, row) => sum + row.rejectedVisits, 0),
    onHoldVisits: result.reduce((sum, row) => sum + row.onHoldVisits, 0),
    groups: result,
  };
  GetPartnerSettlementSummaryResponse.parse(summary);
  res.json(summary);
});

router.get("/invoices", async (_req, res) => {
  const partnerId = partnerOnly(res);
  const rows = await db.select({
    id: partnerInvoiceSubmissions.id,
    invoiceNumber: partnerInvoiceSubmissions.invoiceNumber,
    amountIqd: partnerInvoiceSubmissions.amountIqd,
    issuedAt: partnerInvoiceSubmissions.issuedAt,
    periodStart: partnerInvoiceSubmissions.periodStart,
    periodEnd: partnerInvoiceSubmissions.periodEnd,
    taxNumber: partnerInvoiceSubmissions.taxNumber,
    documentName: partnerInvoiceSubmissions.documentName,
    status: partnerInvoiceSubmissions.status,
    createdAt: partnerInvoiceSubmissions.createdAt,
  }).from(partnerInvoiceSubmissions).where(eq(partnerInvoiceSubmissions.partnerId, partnerId))
    .orderBy(desc(partnerInvoiceSubmissions.createdAt));
  GetPartnerInvoicesResponse.parse(rows);
  res.json(rows);
});

router.post("/invoices/upload-url", async (req, res) => {
  const partnerId = partnerOnly(res);
  const data = RequestPartnerInvoiceUploadUrlBody.parse(req.body);
  if (!data.fileName.toLowerCase().endsWith(".pdf"))
    throw new BookingError(400, "Upload an invoice as a PDF file.");
  const result = await objectStorage.createPartnerInvoiceUpload(partnerId);
  RequestPartnerInvoiceUploadUrlResponse.parse(result);
  res.json(result);
});

router.post("/invoices", async (req, res) => {
  const partnerId = partnerOnly(res);
  const data = SubmitPartnerInvoiceBody.parse(req.body);
  if (data.periodStart > data.periodEnd || data.issuedAt > new Date())
    throw new BookingError(400, "Check the invoice date and covered period.");
  const prefix = `/objects/partner-invoices/${partnerId}/`;
  if (!data.documentPath.startsWith(prefix) || !/^[0-9a-f-]{36}\.pdf$/i.test(data.documentPath.slice(prefix.length)))
    throw new BookingError(403, "This invoice file was not uploaded to your partner's private folder.");
  const duplicate = await db.select({ id: partnerInvoiceSubmissions.id }).from(partnerInvoiceSubmissions)
    .where(and(eq(partnerInvoiceSubmissions.partnerId, partnerId), eq(partnerInvoiceSubmissions.documentPath, data.documentPath))).limit(1);
  if (duplicate.length) throw new BookingError(409, "This uploaded invoice has already been submitted.");
  const [file] = [await objectStorage.getPrivateFile(data.documentPath)];
  const [metadata] = await file.getMetadata();
  if (metadata.contentType !== "application/pdf" || Number(metadata.size) < 1 || Number(metadata.size) > 10 * 1024 * 1024)
    throw new BookingError(400, "The invoice file must be a PDF no larger than 10 MB.");
  const name = data.documentName.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180);
  if (!name || !name.toLowerCase().endsWith(".pdf")) throw new BookingError(400, "The invoice file name must end in .pdf.");
  const result = await db.transaction(async tx => {
    const [row] = await tx.insert(partnerInvoiceSubmissions).values({
      id: randomUUID(), partnerId, invoiceNumber: data.invoiceNumber.trim(), amountIqd: data.amountIqd,
      issuedAt: data.issuedAt.toISOString().slice(0, 10),
      periodStart: data.periodStart.toISOString().slice(0, 10),
      periodEnd: data.periodEnd.toISOString().slice(0, 10),
      taxNumber: data.taxNumber?.trim() || null, documentPath: data.documentPath, documentName: name,
      status: "submitted", submittedBy: res.locals.operator.userId,
    }).returning();
    await audit(tx, res.locals.operator.userId, "partner.invoice.submit", row.id, `partner=${partnerId}; invoice=${row.invoiceNumber}`);
    return row;
  });
  SubmitPartnerInvoiceResponse.parse(result);
  res.status(201).json(result);
});

router.get("/invoices/:id/document", async (req, res) => {
  const partnerId = partnerOnly(res);
  const [invoice] = await db.select().from(partnerInvoiceSubmissions).where(and(
    eq(partnerInvoiceSubmissions.id, String(req.params.id)),
    eq(partnerInvoiceSubmissions.partnerId, partnerId),
  )).limit(1);
  if (!invoice) throw new BookingError(404, "Invoice not found.");
  const file = await objectStorage.getPrivateFile(invoice.documentPath);
  const [metadata] = await file.getMetadata();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice.documentName.replace(/["\\]/g, "_")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Length", String(metadata.size ?? 0));
  Readable.from(file.createReadStream()).on("error", error => {
    if (!res.headersSent) res.status(500);
    res.end();
  }).pipe(res);
});

function financePeriod(fromValue: string, toValue: string) {
  const from = new Date(`${fromValue}T00:00:00+03:00`);
  const toExclusive = new Date(new Date(`${toValue}T00:00:00+03:00`).getTime() + 86400000);
  if (from >= toExclusive || toExclusive.getTime() - from.getTime() > 367 * 86400000)
    throw new BookingError(400, "Choose a valid finance period of no more than one year.");
  return { from, toExclusive };
}
const payoutApprovalEnabled = () => paymentsEnabled() && !payTabsTestModeEnabled();
async function financeEvent(tx: Tx, reviewItemId: string, actorId: string, action: string, detail: string) {
  await tx.insert(financeReviewEvents).values({
    id: randomUUID(), reviewItemId, actorId, action, detail,
  });
}

router.get("/finance", async (_req, res) => {
  financeStaff(res);
  const [partnersRows, facilityRows, membershipRows, bookingRows, billingRows, partnerInvoices,
    reconciliationRows, reviewRows, reviewEvents, operationEvents] = await Promise.all([
    db.select().from(partners).orderBy(asc(partners.name)),
    db.select({
      id: facilityProfiles.id, partnerId: facilityProfiles.partnerId, city: facilityProfiles.city,
      facility: facilityProfiles.facility, updatedAt: facilityProfiles.updatedAt,
    }).from(facilityProfiles).orderBy(asc(facilityProfiles.city), asc(facilityProfiles.facility)),
    db.select({
      userId: memberships.userId, status: memberships.status, paymentStatus: memberships.paymentStatus,
      tier: memberships.tier, source: memberships.source, startsAt: memberships.startsAt, endsAt: memberships.endsAt,
    }).from(memberships).where(eq(memberships.scope, "live")).orderBy(desc(memberships.endsAt)).limit(500),
    db.select({
      id: reservations.id, userId: reservations.userId, offeringId: offerings.id, title: offerings.title,
      partnerId: offerings.partnerId, partnerName: partners.name, facility: offerings.facility, city: offerings.city,
      startsAt: offerings.startsAt, status: reservations.status, createdAt: reservations.createdAt,
    }).from(reservations).innerJoin(offerings, eq(reservations.offeringId, offerings.id))
      .leftJoin(partners, eq(offerings.partnerId, partners.id)).where(eq(offerings.scope, "live"))
      .orderBy(desc(reservations.createdAt)).limit(500),
    db.select({
      id: membershipBilling.id, userId: membershipBilling.userId, planId: membershipBilling.planId,
      planName: membershipPlans.name, status: membershipBilling.status, paymentStatus: membershipBilling.paymentStatus,
      amountIqd: membershipBilling.amountIqd, refundStatus: membershipBilling.refundStatus,
      periodStartsAt: membershipBilling.periodStartsAt, periodEndsAt: membershipBilling.periodEndsAt,
      createdAt: membershipBilling.createdAt, updatedAt: membershipBilling.updatedAt,
    }).from(membershipBilling).leftJoin(membershipPlans, eq(membershipBilling.planId, membershipPlans.id))
      .orderBy(desc(membershipBilling.createdAt)).limit(500),
    db.select({
      id: partnerInvoiceSubmissions.id, partnerId: partnerInvoiceSubmissions.partnerId,
      invoiceNumber: partnerInvoiceSubmissions.invoiceNumber, amountIqd: partnerInvoiceSubmissions.amountIqd,
      issuedAt: partnerInvoiceSubmissions.issuedAt, periodStart: partnerInvoiceSubmissions.periodStart,
      periodEnd: partnerInvoiceSubmissions.periodEnd, documentName: partnerInvoiceSubmissions.documentName,
      status: partnerInvoiceSubmissions.status, submittedBy: partnerInvoiceSubmissions.submittedBy,
      createdAt: partnerInvoiceSubmissions.createdAt,
    }).from(partnerInvoiceSubmissions).orderBy(desc(partnerInvoiceSubmissions.createdAt)).limit(500),
    db.select({
      id: paymentWebhookEvents.id, eventType: paymentWebhookEvents.eventType,
      status: paymentWebhookEvents.status, receivedAt: paymentWebhookEvents.receivedAt,
      processedAt: paymentWebhookEvents.processedAt,
    }).from(paymentWebhookEvents).orderBy(desc(paymentWebhookEvents.receivedAt)).limit(250),
    db.select().from(financeReviewItems).orderBy(desc(financeReviewItems.createdAt)).limit(500),
    db.select().from(financeReviewEvents).orderBy(desc(financeReviewEvents.createdAt)).limit(500),
    db.select().from(operationAudit).orderBy(desc(operationAudit.createdAt)).limit(500),
  ]);
  res.json({
    role: res.locals.operator.role,
    paymentGateEnabled: paymentsEnabled(),
    livePayoutGateEnabled: payoutApprovalEnabled(),
    partners: partnersRows,
    facilities: facilityRows,
    customers: membershipRows,
    bookings: bookingRows,
    customerInvoices: billingRows,
    partnerInvoices,
    reconciliation: reconciliationRows,
    reviewItems: reviewRows,
    reviewEvents,
    audit: operationEvents,
  });
});

router.post("/bookings/:id/cancel", async (req, res) => {
  admin(res);
  const input = z.object({ reason: z.string().trim().min(5).max(500) }).strict().parse(req.body);
  const id = String(req.params.id);
  const now = new Date();
  const cancelledBooking = await db.transaction(async tx => {
    const [booking] = await tx.select({
      id: reservations.id, offeringId: reservations.offeringId, userId: reservations.userId,
      status: reservations.status, startsAt: offerings.startsAt,
    }).from(reservations).innerJoin(offerings, eq(reservations.offeringId, offerings.id))
      .where(and(eq(reservations.id, id), eq(offerings.scope, "live"))).for("update");
    if (!booking) throw new BookingError(404, "Live booking not found.");
    if (!["reserved", "requested"].includes(booking.status) || booking.startsAt <= now)
      throw new BookingError(409, "Only future active bookings can be cancelled.");
    const [attendanceRecord] = await tx.select({ id: attendance.id }).from(attendance)
      .where(eq(attendance.reservationId, id)).limit(1);
    if (attendanceRecord)
      throw new BookingError(409, "A booking with attendance evidence cannot be cancelled here.");
    const [cancelled] = await tx.update(reservations).set({
      status: "admin_cancelled", cancelledAt: now,
    }).where(and(
      eq(reservations.id, id), inArray(reservations.status, ["reserved", "requested"]),
    )).returning({ id: reservations.id });
    if (!cancelled) throw new BookingError(409, "This booking has already changed.");
    await audit(tx, res.locals.operator.userId, "booking.admin_cancel", id, input.reason);
    return { offeringId: booking.offeringId, userId: booking.userId };
  });
  await processWaitlistQueue(new Date(), [cancelledBooking.offeringId]);
  res.json({ ok: true });
  void sendMemberNotification(cancelledBooking.userId, "booking_cancelled");
});

router.get("/finance/settlements", async (req, res) => {
  financeStaff(res);
  const query = z.object({ from: invoiceDate, to: invoiceDate }).strict().parse(req.query);
  const { from, toExclusive } = financePeriod(query.from, query.to);
  const rows = await db.select({
    partnerId: offerings.partnerId,
    partnerName: partners.name,
    status: attendance.status,
    settlementEligible: attendance.settlementEligible,
    facility: offerings.facility, city: offerings.city, category: offerings.category,
    accessType: offerings.accessType,
  }).from(attendance).innerJoin(offerings, eq(attendance.offeringId, offerings.id))
    .leftJoin(partners, eq(offerings.partnerId, partners.id))
    .where(and(eq(offerings.scope, "live"), gte(attendance.checkedInAt, from), lt(attendance.checkedInAt, toExclusive)));
  const grouped = new Map<string, {
    partnerId: string; partnerName: string; facility: string; city: string; category: string;
    accessType: string; verifiedVisits: number; rejectedVisits: number; disputedVisits: number; onHoldVisits: number;
  }>();
  for (const row of rows) {
    if (!row.partnerId) continue;
    const key = [row.partnerId, row.facility, row.city, row.category, row.accessType].join("\u0000");
    const group = grouped.get(key) ?? {
      partnerId: row.partnerId, partnerName: row.partnerName ?? row.partnerId,
      facility: row.facility, city: row.city, category: row.category, accessType: row.accessType,
      verifiedVisits: 0, rejectedVisits: 0, disputedVisits: 0, onHoldVisits: 0,
    };
    if (row.status === "confirmed" && row.settlementEligible) group.verifiedVisits++;
    else if (["void", "no_show"].includes(row.status)) group.rejectedVisits++;
    else if (row.status === "disputed") { group.disputedVisits++; group.onHoldVisits++; }
    else group.onHoldVisits++;
    grouped.set(key, group);
  }
  const groups = [...grouped.values()].sort((a, b) =>
    a.partnerName.localeCompare(b.partnerName) || a.city.localeCompare(b.city) || a.facility.localeCompare(b.facility));
  res.json({
    from: query.from, to: query.to, groups,
    verifiedVisits: groups.reduce((sum, row) => sum + row.verifiedVisits, 0),
    rejectedVisits: groups.reduce((sum, row) => sum + row.rejectedVisits, 0),
    disputedVisits: groups.reduce((sum, row) => sum + row.disputedVisits, 0),
    onHoldVisits: groups.reduce((sum, row) => sum + row.onHoldVisits, 0),
    payoutApprovalEnabled: payoutApprovalEnabled(),
    amountCalculationAvailable: false,
  });
});

router.post("/finance/refunds/:billingId", async (req, res) => {
  financeStaff(res);
  const input = z.object({
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: z.string().uuid(),
  }).strict().parse(req.body);
  const billingId = String(req.params.billingId);
  const [billing] = await db.select({
    id: membershipBilling.id, userId: membershipBilling.userId,
    status: membershipBilling.status, paymentStatus: membershipBilling.paymentStatus,
  })
    .from(membershipBilling).where(eq(membershipBilling.id, billingId));
  if (!billing) throw new BookingError(404, "Customer invoice not found.");
  if (!["active", "past_due", "conflict"].includes(billing.status) || billing.paymentStatus !== "paid")
    throw new BookingError(409, "Only a verified paid customer invoice can enter refund review.");
  const data = {
    id: randomUUID(), kind: "refund", status: "pending", billingId, partnerId: null,
    periodStart: null, periodEnd: null, amountIqd: null, reason: input.reason,
    requestedBy: res.locals.operator.userId, reviewedBy: null, idempotencyKey: input.idempotencyKey,
  };
  const created = await db.transaction(async tx => {
    const [sameKey] = await tx.select().from(financeReviewItems)
      .where(eq(financeReviewItems.idempotencyKey, input.idempotencyKey));
    if (sameKey) {
      if (sameKey.kind !== "refund" || sameKey.billingId !== billingId ||
          sameKey.reason !== input.reason || sameKey.requestedBy !== res.locals.operator.userId)
        throw new BookingError(409, "This request key was already used for a different finance action.");
      return sameKey;
    }
    const [open] = await tx.select().from(financeReviewItems).where(and(
      eq(financeReviewItems.kind, "refund"), eq(financeReviewItems.billingId, billingId),
      inArray(financeReviewItems.status, ["pending", "processing", "provider_pending", "completed"]),
    )).limit(1);
    if (open) throw new BookingError(409, "A refund request already exists for this customer invoice.");
    const [row] = await tx.insert(financeReviewItems).values(data)
      .onConflictDoNothing({ target: financeReviewItems.idempotencyKey }).returning();
    if (!row) throw new BookingError(409, "This request key has already been used.");
    await financeEvent(tx, row.id, res.locals.operator.userId, "requested", input.reason);
    await audit(tx, res.locals.operator.userId, "finance.refund.request", row.id, `billing=${billingId}`);
    return row;
  });
  res.status(201).json(created);
});

router.post("/finance/payouts", async (req, res) => {
  financeStaff(res);
  const input = z.object({
    partnerId: z.string().min(1).max(160), periodStart: invoiceDate, periodEnd: invoiceDate,
    amountIqd: z.number().int().min(1).max(1_000_000_000),
    reason: z.string().trim().min(5).max(500), idempotencyKey: z.string().uuid(),
  }).strict().parse(req.body);
  const { from, toExclusive } = financePeriod(input.periodStart, input.periodEnd);
  const [partner] = await db.select({ id: partners.id }).from(partners).where(eq(partners.id, input.partnerId));
  if (!partner) throw new BookingError(404, "Partner not found.");
  const data = {
    id: randomUUID(), kind: "payout", status: "pending", billingId: null,
    partnerId: input.partnerId, periodStart: input.periodStart, periodEnd: input.periodEnd,
    amountIqd: input.amountIqd, reason: input.reason, requestedBy: res.locals.operator.userId,
    reviewedBy: null, idempotencyKey: input.idempotencyKey,
  };
  const row = await db.transaction(async tx => {
    const [sameKey] = await tx.select().from(financeReviewItems)
      .where(eq(financeReviewItems.idempotencyKey, input.idempotencyKey));
    if (sameKey) {
      if (sameKey.kind !== "payout" || sameKey.partnerId !== input.partnerId ||
          sameKey.periodStart !== input.periodStart || sameKey.periodEnd !== input.periodEnd ||
          sameKey.amountIqd !== input.amountIqd || sameKey.reason !== input.reason ||
          sameKey.requestedBy !== res.locals.operator.userId)
        throw new BookingError(409, "This request key was already used for a different finance action.");
      return sameKey;
    }
    const [duplicate] = await tx.select().from(financeReviewItems).where(and(
      eq(financeReviewItems.kind, "payout"), eq(financeReviewItems.partnerId, input.partnerId),
      eq(financeReviewItems.periodStart, input.periodStart), eq(financeReviewItems.periodEnd, input.periodEnd),
      inArray(financeReviewItems.status, ["pending", "approved_manual"]),
    )).limit(1);
    if (duplicate) throw new BookingError(409, "A payout tracking item already exists for this partner and period.");
    const [created] = await tx.insert(financeReviewItems).values(data)
      .onConflictDoNothing({ target: financeReviewItems.idempotencyKey }).returning();
    if (!created) throw new BookingError(409, "This request key has already been used.");
    await financeEvent(tx, created.id, res.locals.operator.userId, "requested", input.reason);
    await audit(tx, res.locals.operator.userId, "finance.payout.request", created.id,
      `partner=${input.partnerId};period=${input.periodStart}..${input.periodEnd};amountIqd=${input.amountIqd}`);
    return created;
  });
  res.status(201).json(row);
});

router.post("/finance/reviews/:id/decision", async (req, res) => {
  financeStaff(res);
  const input = z.object({
    decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(5).max(500),
  }).strict().parse(req.body);
  const id = String(req.params.id);
  const [current] = await db.select().from(financeReviewItems).where(eq(financeReviewItems.id, id));
  if (!current) throw new BookingError(404, "Finance review item not found.");
  if (current.requestedBy === res.locals.operator.userId)
    throw new BookingError(403, "A different authorized staff member must review this request.");
  if (current.status !== "pending") throw new BookingError(409, "This finance request has already been decided.");
  if (input.decision === "approve" && current.kind === "refund" && !paymentsEnabled())
    throw new PaymentError(503, "Refunds are disabled until the live payment gates are verified.");
  if (input.decision === "approve" && current.kind === "payout" && !payoutApprovalEnabled())
    throw new PaymentError(503, "Payout approval is disabled until live payout and recurring-payment gates are verified.");

  const next = await db.transaction(async tx => {
    const [locked] = await tx.select().from(financeReviewItems).where(eq(financeReviewItems.id, id)).for("update");
    if (!locked || locked.status !== "pending") throw new BookingError(409, "This finance request has already been decided.");
    if (locked.requestedBy === res.locals.operator.userId)
      throw new BookingError(403, "A different authorized staff member must review this request.");
    if (input.decision === "reject") {
      const [rejected] = await tx.update(financeReviewItems).set({
        status: "rejected", reviewedBy: res.locals.operator.userId, reviewedAt: new Date(),
      }).where(and(eq(financeReviewItems.id, id), eq(financeReviewItems.status, "pending"))).returning();
      if (!rejected) throw new BookingError(409, "This finance request has already been decided.");
      await financeEvent(tx, id, res.locals.operator.userId, "rejected", input.reason);
      await audit(tx, res.locals.operator.userId, `finance.${locked.kind}.reject`, id, input.reason);
      return rejected;
    }
    if (locked.kind === "payout") {
      if (!locked.partnerId || !locked.periodStart || !locked.periodEnd)
        throw new BookingError(409, "The payout tracking record is incomplete.");
      const range = financePeriod(locked.periodStart, locked.periodEnd);
      const heldRows = await tx.select({ status: attendance.status, eligible: attendance.settlementEligible })
        .from(attendance).innerJoin(offerings, eq(attendance.offeringId, offerings.id))
        .where(and(eq(offerings.partnerId, locked.partnerId), eq(offerings.scope, "live"),
          gte(attendance.checkedInAt, range.from), lt(attendance.checkedInAt, range.toExclusive)));
      if (heldRows.some(row => !(row.status === "confirmed" && row.eligible) &&
          !["void", "no_show"].includes(row.status)))
        throw new BookingError(409, "This settlement period has disputed or unreviewed attendance holds.");
      const [approved] = await tx.update(financeReviewItems).set({
        status: "approved_manual", reviewedBy: res.locals.operator.userId, reviewedAt: new Date(),
      }).where(and(eq(financeReviewItems.id, id), eq(financeReviewItems.status, "pending"))).returning();
      if (!approved) throw new BookingError(409, "This finance request has already been decided.");
      await financeEvent(tx, id, res.locals.operator.userId, "approved_manual",
        `${input.reason}; no transfer was sent by MaydanGo.`);
      await audit(tx, res.locals.operator.userId, "finance.payout.approve_manual", id,
        `partner=${locked.partnerId}; no transfer was sent`);
      return approved;
    }
    if (locked.kind !== "refund" || !locked.billingId)
      throw new BookingError(409, "This finance review type cannot be approved.");
    const [billing] = await tx.select().from(membershipBilling).where(eq(membershipBilling.id, locked.billingId)).for("update");
    if (!billing || !["active", "past_due", "conflict"].includes(billing.status) ||
        billing.paymentStatus !== "paid" || !billing.lastPaymentId || !billing.amountIqd ||
        !["none", "failed"].includes(billing.refundStatus))
      throw new BookingError(409, "The paid customer invoice is no longer eligible for a refund.");
    const [latest] = await tx.select({ id: membershipBilling.id }).from(membershipBilling).where(and(
      eq(membershipBilling.userId, billing.userId), inArray(membershipBilling.status, ["active", "past_due", "conflict"]),
      eq(membershipBilling.paymentStatus, "paid"),
    )).orderBy(desc(membershipBilling.createdAt)).limit(1);
    if (latest?.id !== billing.id)
      throw new BookingError(409, "Only the customer's latest verified paid invoice can be refunded.");
    const [processing] = await tx.update(financeReviewItems).set({
      status: "processing", reviewedBy: res.locals.operator.userId, reviewedAt: new Date(),
    }).where(and(eq(financeReviewItems.id, id), eq(financeReviewItems.status, "pending"))).returning();
    if (!processing) throw new BookingError(409, "This finance request has already been decided.");
    await financeEvent(tx, id, res.locals.operator.userId, "approved_processing", input.reason);
    await audit(tx, res.locals.operator.userId, "finance.refund.approve", id, input.reason);
    return processing;
  });

  if (next.kind === "refund" && next.status === "processing" && next.billingId) {
    try {
      const [billing] = await db.select({ userId: membershipBilling.userId }).from(membershipBilling)
        .where(eq(membershipBilling.id, next.billingId));
      if (!billing) throw new BookingError(404, "Customer invoice not found.");
      const result = await requestFullRefund(billing.userId, input.reason);
      const status = result.status === "completed" ? "completed" : "provider_pending";
      const [updated] = await db.update(financeReviewItems).set({ status }).where(and(
        eq(financeReviewItems.id, id), eq(financeReviewItems.status, "processing"),
      )).returning();
      await db.transaction(async tx => {
        await financeEvent(tx, id, res.locals.operator.userId, status, `Provider result: ${result.status}`);
        await audit(tx, res.locals.operator.userId, `finance.refund.${status}`, id, `provider=${result.status}`);
      });
      res.json(updated);
      return;
    } catch (error) {
      await db.update(financeReviewItems).set({ status: "failed" }).where(and(
        eq(financeReviewItems.id, id), eq(financeReviewItems.status, "processing"),
      ));
      await db.transaction(async tx => {
        await financeEvent(tx, id, res.locals.operator.userId, "failed",
          error instanceof Error ? error.message.slice(0, 500) : "Provider refund failed.");
        await audit(tx, res.locals.operator.userId, "finance.refund.failed", id,
          error instanceof Error ? error.message.slice(0, 500) : "Provider refund failed.");
      });
      throw error;
    }
  }
  res.json(next);
});

router.patch("/finance/invoices/:id", async (req, res) => {
  financeStaff(res);
  const input = z.object({
    status: z.enum(["under_review", "accepted", "rejected"]),
    reason: z.string().trim().min(5).max(500),
  }).strict().parse(req.body);
  const id = String(req.params.id);
  const updated = await db.transaction(async tx => {
    const [existing] = await tx.select().from(partnerInvoiceSubmissions).where(eq(partnerInvoiceSubmissions.id, id)).for("update");
    if (!existing) throw new BookingError(404, "Partner invoice not found.");
    if (existing.status === "accepted" || existing.status === "rejected")
      throw new BookingError(409, "A completed invoice review cannot be changed.");
    const [row] = await tx.update(partnerInvoiceSubmissions).set({ status: input.status })
      .where(eq(partnerInvoiceSubmissions.id, id)).returning();
    await audit(tx, res.locals.operator.userId, "finance.partner_invoice.review", id,
      `${existing.status}->${input.status}; ${input.reason}`);
    return row;
  });
  res.json(updated);
});

router.get("/finance/invoices/:id/document", async (req, res) => {
  financeStaff(res);
  const [invoice] = await db.select().from(partnerInvoiceSubmissions)
    .where(eq(partnerInvoiceSubmissions.id, String(req.params.id))).limit(1);
  if (!invoice) throw new BookingError(404, "Invoice not found.");
  const file = await objectStorage.getPrivateFile(invoice.documentPath);
  const [metadata] = await file.getMetadata();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice.documentName.replace(/["\\]/g, "_")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Length", String(metadata.size ?? 0));
  Readable.from(file.createReadStream()).on("error", () => {
    if (!res.headersSent) res.status(500);
    res.end();
  }).pipe(res);
});

router.get("/finance/audit", async (_req, res) => {
  financeStaff(res);
  const [operationEvents, reviewEvents] = await Promise.all([
    db.select().from(operationAudit).orderBy(desc(operationAudit.createdAt)).limit(500),
    db.select().from(financeReviewEvents).orderBy(desc(financeReviewEvents.createdAt)).limit(500),
  ]);
  res.json({ operations: operationEvents, financeReviews: reviewEvents });
});

router.post("/courses", async (req, res) => {
  admin(res);
  const parsed = CreateLearningCourseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Check the course details and lesson content." }); return; }
  const data = parsed.data;
  const positions = data.lessons.map(lesson => lesson.position).sort((a, b) => a - b);
  if (positions.some((position, index) => position !== index + 1)) {
    res.status(400).json({ message: "Lesson positions must start at 1 and have no gaps or duplicates." }); return;
  }
  if (data.lessons.some(lesson => !secureHttps(lesson.mediaUrl))) {
    res.status(400).json({ message: "Each course lesson needs a secure HTTPS recording link." }); return;
  }
  if (data.thumbnailUrl) ensureHttps(data.thumbnailUrl, "Course image");
  const id = randomUUID();
  const created = await db.transaction(async tx => {
    const [course] = await tx.insert(learningCourses).values({
      id,
      title: data.localizedTitle.en,
      localizedTitle: data.localizedTitle,
      localizedSummary: data.localizedSummary,
      localizedInstructor: data.localizedInstructor,
      category: data.category.trim(),
      level: data.level,
      durationMinutes: data.durationMinutes,
      thumbnailUrl: data.thumbnailUrl,
      published: data.published,
    }).returning();
    await tx.insert(learningLessons).values(data.lessons.map(lesson => ({
      id: randomUUID(),
      courseId: id,
      position: lesson.position,
      localizedTitle: lesson.localizedTitle,
      localizedContent: lesson.localizedContent,
      durationMinutes: lesson.durationMinutes,
      mediaUrl: lesson.mediaUrl,
    })));
    await audit(tx, getAuth(req).userId!, "course.create", id, `lessons=${data.lessons.length}`);
    return { ...course, lessonCount: data.lessons.length };
  });
  res.status(201).json(CreateLearningCourseResponse.parse(created));
});

router.put("/courses/:id", async (req, res) => {
  admin(res);
  const parsed = UpdateLearningCourseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Check the course details." }); return; }
  const data = parsed.data;
  if (data.thumbnailUrl) ensureHttps(data.thumbnailUrl, "Course image");
  const id = String(req.params.id);
  const updated = await db.transaction(async tx => {
    const [existing] = await tx.select().from(learningCourses).where(eq(learningCourses.id, id)).for("update");
    if (!existing) throw new BookingError(404, "Course not found.");
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(learningLessons)
      .where(eq(learningLessons.courseId, id));
    if (data.published && count.count < 1) throw new BookingError(409, "Add at least one recorded lesson before publishing.");
    const [course] = await tx.update(learningCourses).set({
      title: data.localizedTitle.en,
      localizedTitle: data.localizedTitle,
      localizedSummary: data.localizedSummary,
      localizedInstructor: data.localizedInstructor,
      category: data.category.trim(),
      level: data.level,
      durationMinutes: data.durationMinutes,
      thumbnailUrl: data.thumbnailUrl,
      published: data.published,
      updatedAt: new Date(),
    }).where(eq(learningCourses.id, id)).returning();
    await audit(tx, getAuth(req).userId!, "course.update", id, `published=${data.published}`);
    return { ...course, lessonCount: count.count };
  });
  res.json(UpdateLearningCourseResponse.parse(updated));
});

router.post("/courses/:id/lessons", async (req, res) => {
  admin(res);
  const parsed = AddLearningLessonBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Check the lesson details." }); return; }
  const data = parsed.data;
  ensureHttps(data.mediaUrl, "Lesson recording");
  const courseId = String(req.params.id);
  const lesson = await db.transaction(async tx => {
    const [course] = await tx.select({ id: learningCourses.id }).from(learningCourses)
      .where(eq(learningCourses.id, courseId)).for("update");
    if (!course) throw new BookingError(404, "Course not found.");
    const [last] = await tx.select({ position: learningLessons.position }).from(learningLessons)
      .where(eq(learningLessons.courseId, courseId)).orderBy(desc(learningLessons.position)).limit(1);
    if (data.position !== (last?.position ?? 0) + 1) {
      throw new BookingError(409, `The next lesson position is ${(last?.position ?? 0) + 1}.`);
    }
    const [added] = await tx.insert(learningLessons).values({
      id: randomUUID(), courseId, position: data.position,
      localizedTitle: data.localizedTitle,
      localizedContent: data.localizedContent,
      durationMinutes: data.durationMinutes,
      mediaUrl: data.mediaUrl,
    }).returning();
    await audit(tx, getAuth(req).userId!, "course.lesson.create", added.id, `course=${courseId}`);
    return { ...added, completed: false };
  });
  res.status(201).json(AddLearningLessonResponse.parse(lesson));
});

router.post("/plans", async (req, res) => {
  admin(res);
  const data = planInput.parse(req.body);
  if (data.kind === "paid") validatePaidPlan(data.priceIqd);
  const row = await db.transaction(async tx => {
    const [p] = await tx.insert(membershipPlans).values({ ...data, id: randomUUID() }).returning();
    await audit(tx, res.locals.operator.userId, "plan.create", p.id);
    return p;
  });
  res.status(201).json(row);
});
router.put("/plans/:id", async (req, res) => {
  admin(res);
  const data = planInput.parse(req.body);
  if (data.kind === "paid") validatePaidPlan(data.priceIqd);
  const row = await db.transaction(async tx => {
    const [p] = await tx.update(membershipPlans).set(data).where(eq(membershipPlans.id, String(req.params.id))).returning();
    if (!p) throw new BookingError(404, "Plan not found.");
    await audit(tx, res.locals.operator.userId, "plan.update", p.id);
    return p;
  });
  res.json(row);
});
router.post("/grants", async (req, res) => {
  admin(res);
  const input = z.object({ userId: z.string().min(1).max(160), planId: z.string().uuid(),
    corporateId: z.string().max(160).optional(), reason: z.string().trim().min(5).max(500) }).strict().parse(req.body);
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);
    const [p] = await tx.select().from(membershipPlans).where(eq(membershipPlans.id, input.planId)).for("share");
    if (!p?.active) throw new BookingError(403, "An active plan is required.");
    if (p.kind === "paid") throw new BookingError(403, "Paid activation is unavailable until payment verification is connected.");
    if (p.kind === "corporate" && (!p.rules.corporateId || input.corporateId !== p.rules.corporateId))
      throw new BookingError(403, "Confirm the member's eligible organization.");
    if (p.kind === "trial" && (await tx.select().from(accessGrants).where(and(eq(accessGrants.userId, input.userId), eq(accessGrants.kind, "trial")))).length)
      throw new BookingError(409, "This member has already received a live trial.");
    const [existing] = await tx.select().from(memberships).where(and(eq(memberships.userId, input.userId), eq(memberships.scope, "live")));
    if (existing && ["active", "trial"].includes(existing.status) && existing.endsAt > new Date())
      throw new BookingError(409, "Revoke the existing membership before granting a replacement.");
    const startsAt = new Date(), endsAt = new Date(startsAt.getTime() + p.durationDays * 86400000);
    const membership = { scope: "live", status: p.kind === "trial" ? "trial" : "active",
      paymentStatus: "not_required", tier: p.tier, source: p.kind, billingId: null, corporateId: input.corporateId ?? null,
      startsAt, endsAt, rules: p.rules };
    await tx.insert(memberships).values({ userId: input.userId, ...membership })
      .onConflictDoUpdate({ target: [memberships.userId, memberships.scope], set: membership });
    await tx.insert(accessGrants).values({ id: randomUUID(), userId: input.userId, planId: p.id,
      kind: p.kind, actorId: res.locals.operator.userId, reason: input.reason });
    await audit(tx, res.locals.operator.userId, "membership.grant", input.userId, input.reason);
  });
  res.status(201).json({ ok: true });
});
router.post("/revoke", async (req, res) => {
  admin(res);
  const input = z.object({ userId: z.string().min(1).max(160), reason: z.string().trim().min(5).max(500) }).strict().parse(req.body);
  const hadBookingsBeforeProviderCancel = (await db.select({ id: reservations.id }).from(reservations)
    .innerJoin(offerings, eq(reservations.offeringId, offerings.id))
    .where(and(eq(reservations.userId, input.userId), eq(offerings.scope, "live"),
      inArray(reservations.status, ["reserved", "requested"]))).limit(1)).length > 0;
  await cancelPaidSubscriptionImmediately(input.userId);
  const cancelledOfferingIds = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);
    await tx.update(memberships).set({ status: "terminated" }).where(and(eq(memberships.userId, input.userId), eq(memberships.scope, "live")));
    const live = await tx.select({ id: offerings.id }).from(offerings).where(eq(offerings.scope, "live"));
    let affectedOfferingIds: string[] = [];
    if (live.length) {
      const held = await tx.select({ offeringId: reservations.offeringId }).from(reservations)
        .where(and(eq(reservations.userId, input.userId), inArray(reservations.offeringId, live.map(o => o.id)),
          inArray(reservations.status, ["reserved", "requested"])));
      affectedOfferingIds = [...new Set(held.map(row => row.offeringId))];
    }
    if (live.length) await tx.update(reservations).set({ status: "cancelled", cancelledAt: new Date() })
      .where(and(eq(reservations.userId, input.userId), inArray(reservations.offeringId, live.map(o => o.id)), inArray(reservations.status, ["reserved", "requested"])));
    await audit(tx, res.locals.operator.userId, "membership.revoke", input.userId, input.reason);
    return affectedOfferingIds;
  });
  for (const offeringId of cancelledOfferingIds) await processWaitlistQueue(new Date(), [offeringId]);
  if (cancelledOfferingIds.length || hadBookingsBeforeProviderCancel) void sendMemberNotification(input.userId, "booking_cancelled");
  res.json({ ok: true });
});
router.post("/refunds", async (req, res) => {
  admin(res);
  const input = z.object({
    userId: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: z.string().uuid().optional(),
  }).strict().parse(req.body);
  const [billing] = await db.select({ id: membershipBilling.id }).from(membershipBilling).where(and(
    eq(membershipBilling.userId, input.userId), inArray(membershipBilling.status, ["active", "past_due", "conflict"]),
    eq(membershipBilling.paymentStatus, "paid"),
  )).orderBy(desc(membershipBilling.createdAt)).limit(1);
  if (!billing) throw new BookingError(404, "No refundable paid membership was found.");
  const key = input.idempotencyKey ?? randomUUID();
  const row = await db.transaction(async tx => {
    const [existing] = await tx.select().from(financeReviewItems).where(and(
      eq(financeReviewItems.kind, "refund"), eq(financeReviewItems.billingId, billing.id),
      inArray(financeReviewItems.status, ["pending", "processing", "provider_pending", "completed"]),
    )).limit(1);
    if (existing) return existing;
    const [created] = await tx.insert(financeReviewItems).values({
      id: randomUUID(), kind: "refund", status: "pending", billingId: billing.id, partnerId: null,
      periodStart: null, periodEnd: null, amountIqd: null, reason: input.reason,
      requestedBy: res.locals.operator.userId, reviewedBy: null, idempotencyKey: key,
    }).onConflictDoNothing({ target: financeReviewItems.idempotencyKey }).returning();
    if (!created) {
      const [sameKey] = await tx.select().from(financeReviewItems).where(eq(financeReviewItems.idempotencyKey, key));
      if (!sameKey || sameKey.billingId !== billing.id || sameKey.reason !== input.reason ||
          sameKey.requestedBy !== res.locals.operator.userId)
        throw new BookingError(409, "This request key was already used for a different finance action.");
      return sameKey;
    }
    await financeEvent(tx, created.id, res.locals.operator.userId, "requested", input.reason);
    await audit(tx, res.locals.operator.userId, "finance.refund.request", created.id, `billing=${billing.id}`);
    return created;
  });
  res.status(202).json(row);
});
router.use((error: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof z.ZodError) { res.status(400).json({ message: error.issues.map(i => i.message).join(" ") }); return; }
  if (error instanceof BookingError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof PaymentError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof ObjectNotFoundError) { res.status(404).json({ message: "Invoice document not found." }); return; }
  next(error);
});
export default router;
