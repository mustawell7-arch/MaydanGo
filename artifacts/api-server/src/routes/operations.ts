import { Router, type Response } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { and, desc, eq, inArray, sql, asc, gt, isNull, gte, lte, lt } from "drizzle-orm";
import { z } from "zod";
import { db, operators, partners, offerings, reservations, waitlistEntries, membershipPlans, memberships, accessGrants, operationAudit, attendance, attendanceEvents, checkinPolicies, learningCourses, learningLessons, facilityProfiles, facilityHoursOverrides, facilityQualityAssessments, facilityQualityIncidents, partnerInvoiceSubmissions, membershipBilling, paymentWebhookEvents, financeReviewItems, financeReviewEvents, financeInvoiceCorrections, instructorPortalRequests, instructorCourseAssignments, instructorOfferingAssignments } from "@workspace/db";
import { BookingError, effectiveMembershipStatus, processWaitlistQueue } from "../lib/reservations";
import { hasAdminPermission, isOperationsPortalRole, type AdminPermission } from "../lib/admin-roles";
import { createFacilityProfileInput, facilityHoursOverrideInput, facilityProfileFields, offeringInput, partnerInput, planInput } from "../lib/operation-inputs";
import {
  AddLearningLessonBody, AddLearningLessonResponse, ChangeLiveOfferingBody,
  CreateLearningCourseBody, CreateLearningCourseResponse,
  CreateFacilityProfileBody, CreateFacilityProfileResponse, CreateFacilityHoursOverrideBody,
  CreateFacilityHoursOverrideParams, CreateFacilityHoursOverrideResponse, CreateRecurringOfferingsBody,
  DeleteFacilityHoursOverrideParams, GetOperationCoursesResponse,
  CreateRecurringOfferingsResponse, GetOperationFacilitiesResponse,
  UpdateFacilityProfileBody, UpdateFacilityProfileResponse,
  UpdateLearningCourseBody, UpdateLearningCourseResponse,
  DecideInstructorAccessRequestBody, DecideInstructorAccessRequestResponse,
  GetInstructorAccessRequestsResponse,
} from "@workspace/api-zod";
import { sendMemberNotification } from "../lib/notifications";
import { expandRecurringOffering } from "../lib/recurring-offerings";
import { iraqCalendarDate } from "../lib/facility-hours";
import {
  exceedsPlatformDailyVisitLimit,
  getPlatformSafetyRules,
  partnerSubmissionOutcome,
} from "../lib/platform-rules";

import { PaymentError, paymentsEnabled, payTabsTestModeEnabled } from "../lib/payment-config";

import { cancelPaidSubscriptionImmediately, requestFullRefund, validatePaidPlan } from "../lib/payments-paytabs";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { financeRecordRetentionUntil } from "../lib/finance-record-retention";
import { isPrivateCourseRecordingPath } from "../lib/course-recordings";
import { hasAccessRestrictionRecord, isAccessSuspended } from "../lib/account-access-restrictions";
import { completeGuardianConsentUpload, requestGuardianConsentUpload } from "../lib/guardian-consents";
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
  const isMarketingAdminOnly = Boolean(operator)
    && hasAdminPermission(operator!.role, "marketing")
    && !hasAdminPermission(operator!.role, "partner_operations");
  const marketingHomeOnly = isMarketingAdminOnly && req.method === "GET" && req.path === "/";
  if (!operator || (isMarketingAdminOnly && !marketingHomeOnly)
    || (!isOperationsPortalRole(operator.role) && !marketingHomeOnly)) {
    res.status(403).json({ message: "Authorized staff access is required." }); return;
  }
  if (operator.role === "partner") {
    if (!operator.partnerId) { res.status(403).json({ message: "This partner account is not assigned to an approved partner." }); return; }
    const [partner] = await db.select({ approved: partners.approved }).from(partners).where(eq(partners.id, operator.partnerId));
    if (!partner?.approved) { res.status(403).json({ message: "Partner approval is required for portal access." }); return; }
    if (await isAccessSuspended("partner", operator.partnerId)) {
      res.status(403).json({ message: "Partner operations are temporarily restricted. Contact MaydanGo support." }); return;
    }
  }
  res.locals.operator = operator; next();
});
const admin = (res: import("express").Response, permission: AdminPermission) => {
  if (!hasAdminPermission(res.locals.operator.role, permission))
    throw new BookingError(403, "Your assigned administrator role does not allow this action.");
};
const offeringApprovalStatus = z.enum([
  "draft", "submitted", "under_review", "changes_requested", "approved", "published", "rejected", "archived",
]);
const offeringReviewBody = z.object({
  status: offeringApprovalStatus,
  reason: z.string().trim().min(5).max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (["changes_requested", "rejected", "archived"].includes(value.status) && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A clear reason is required for this decision." });
  }
});
const offeringPartnerResponseBody = z.object({
  response: z.string().trim().min(5).max(1000),
}).strict();
const strictOfferingUpdateBody = ChangeLiveOfferingBody.strict();
const guardianConsentUploadInput = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().min(1).max(10 * 1024 * 1024),
  onSiteVerified: z.literal(true),
}).strict();
const financeStaff = (res: import("express").Response) => {
  if (!hasAdminPermission(res.locals.operator.role, "finance") && res.locals.operator.role !== "finance")
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
type PauseEvent = { action: string; createdAt: Date };
function summarizePauseEvents(events: PauseEvent[], now = new Date()) {
  let openPause: Date | null = null;
  let usedMs = 0;
  for (const event of events) {
    if (event.action === "membership.pause") openPause = event.createdAt;
    else if (event.action === "membership.resume" && openPause) {
      usedMs += Math.max(0, event.createdAt.getTime() - openPause.getTime());
      openPause = null;
    } else if (event.action === "membership.pause_closed") openPause = null;
  }
  const visibleUsedMs = usedMs + (openPause ? Math.max(0, now.getTime() - openPause.getTime()) : 0);
  return { pausedAt: openPause, usedMs, pauseUsedDays: Math.ceil(visibleUsedMs / 86400000) };
}
function own(res: import("express").Response, partnerId: string | null) {
  if (!hasAdminPermission(res.locals.operator.role, "partner_operations") && res.locals.operator.partnerId !== partnerId)
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
router.get("/", async (_req, res) => {
  const op = res.locals.operator;
  const isStaff = hasAdminPermission(op.role, "partner_operations");
  const isMarketingAdmin = hasAdminPermission(op.role, "marketing");
  if (!isStaff && !isMarketingAdmin && op.role !== "partner") throw new BookingError(403, "This operations view requires a partner operations role.");
  if (!isStaff && isMarketingAdmin) {
    res.json({ role: op.role, partnerId: null, partners: [], offerings: [], waitlist: [], plans: [] });
    return;
  }
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
  const policyByOffering = new Map(policyRows.map(policy => [policy.offeringId, policy]));
  const queueCounts = new Map<string, number>();
  const waitlist = queueRows.map(row => {
    const position = (queueCounts.get(row.offeringId) ?? 0) + 1;
    queueCounts.set(row.offeringId, position);
    return { ...row, position };
  });
  res.json({ role: op.role, partnerId: op.partnerId,
    partners: partnerRows, offerings: offeringRows.map(row => ({
      ...row,
      checkinPolicy: policyByOffering.get(row.id) ?? null,
    })), waitlist,
    plans: plans.map(({ whopPlanId: _legacyProviderId, ...plan }) => plan),
  });
});
router.post("/partners", async (req, res) => {
  admin(res, "partner_operations");
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
  admin(res, "partner_operations");
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
    .where(hasAdminPermission(op.role, "partner_operations") ? undefined : eq(facilityProfiles.partnerId, op.partnerId ?? ""))
    .orderBy(asc(facilityProfiles.city), asc(facilityProfiles.facility));
  const hoursOverrides = rows.length ? await db.select().from(facilityHoursOverrides)
    .where(and(
      inArray(facilityHoursOverrides.facilityId, rows.map(row => row.id)),
      gte(facilityHoursOverrides.endDate, iraqCalendarDate(new Date())),
    ))
    .orderBy(asc(facilityHoursOverrides.startDate), asc(facilityHoursOverrides.createdAt)) : [];
  const byFacility = new Map<string, typeof hoursOverrides>();
  for (const override of hoursOverrides) {
    const current = byFacility.get(override.facilityId) ?? [];
    current.push(override);
    byFacility.set(override.facilityId, current);
  }
  res.json(GetOperationFacilitiesResponse.parse(rows.map(row => ({
    ...row,
    specialHours: byFacility.get(row.id) ?? [],
  }))));
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
    if (res.locals.operator.role === "partner" && await isAccessSuspended("facility", id)) {
      throw new BookingError(403, "This facility is temporarily restricted from changes.");
    }
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
    if (await hasAccessRestrictionRecord("facility", id)) {
      throw new BookingError(409, "Remove this facility’s access history before deleting it.");
    }
    const [linked] = await tx.select({ id: offerings.id }).from(offerings).where(and(
      eq(offerings.partnerId, existing.partnerId),
      eq(offerings.city, existing.city),
      eq(offerings.facility, existing.facility),
    )).limit(1);
    if (linked) throw new BookingError(409, "This facility is used by existing sessions and cannot be deleted.");
    const [qualityRecord] = await tx.select({ id: facilityQualityAssessments.id }).from(facilityQualityAssessments)
      .where(eq(facilityQualityAssessments.facilityId, id)).limit(1);
    const [incident] = await tx.select({ id: facilityQualityIncidents.id }).from(facilityQualityIncidents)
      .where(eq(facilityQualityIncidents.facilityId, id)).limit(1);
    if (qualityRecord || incident) throw new BookingError(409, "This facility has quality history and cannot be deleted.");
    await tx.delete(facilityProfiles).where(eq(facilityProfiles.id, id));
    await audit(tx, res.locals.operator.userId, "facility.delete", id);
  });
  res.sendStatus(204);
});
router.post("/facilities/:id/hours-overrides", async (req, res) => {
  const params = CreateFacilityHoursOverrideParams.parse(req.params);
  const data = facilityHoursOverrideInput.parse(CreateFacilityHoursOverrideBody.parse(req.body));
  if (data.endDate < iraqCalendarDate(new Date())) {
    throw new BookingError(400, "An override cannot end before today's date in Iraq.");
  }
  const created = await db.transaction(async tx => {
    const [facility] = await tx.select().from(facilityProfiles)
      .where(eq(facilityProfiles.id, params.id)).for("update");
    if (!facility) throw new BookingError(404, "Facility profile not found.");
    own(res, facility.partnerId);
    if (res.locals.operator.role === "partner" && await isAccessSuspended("facility", params.id)) {
      throw new BookingError(403, "This facility is temporarily restricted from changes.");
    }
    const [conflict] = await tx.select({ id: facilityHoursOverrides.id })
      .from(facilityHoursOverrides)
      .where(and(
        eq(facilityHoursOverrides.facilityId, params.id),
        lte(facilityHoursOverrides.startDate, data.endDate),
        gte(facilityHoursOverrides.endDate, data.startDate),
      ))
      .limit(1);
    if (conflict) throw new BookingError(409, "These dates overlap an existing facility hours override.");
    const [row] = await tx.insert(facilityHoursOverrides).values({
      ...data,
      id: randomUUID(),
      facilityId: params.id,
    }).returning();
    await audit(tx, res.locals.operator.userId, "facility.hoursOverride.create", row.id, params.id);
    return row;
  });
  res.status(201).json(CreateFacilityHoursOverrideResponse.parse(created));
});
router.delete("/facilities/:id/hours-overrides/:overrideId", async (req, res) => {
  const params = DeleteFacilityHoursOverrideParams.parse(req.params);
  await db.transaction(async tx => {
    const [facility] = await tx.select().from(facilityProfiles)
      .where(eq(facilityProfiles.id, params.id)).for("update");
    if (!facility) throw new BookingError(404, "Facility profile not found.");
    own(res, facility.partnerId);
    if (res.locals.operator.role === "partner" && await isAccessSuspended("facility", params.id)) {
      throw new BookingError(403, "This facility is temporarily restricted from changes.");
    }
    const [override] = await tx.select({ id: facilityHoursOverrides.id })
      .from(facilityHoursOverrides)
      .where(and(
        eq(facilityHoursOverrides.id, params.overrideId),
        eq(facilityHoursOverrides.facilityId, params.id),
      ))
      .for("update");
    if (!override) throw new BookingError(404, "Facility hours override not found.");
    await tx.delete(facilityHoursOverrides).where(eq(facilityHoursOverrides.id, params.overrideId));
    await audit(tx, res.locals.operator.userId, "facility.hoursOverride.delete", params.overrideId, params.id);
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
    if (res.locals.operator.role === "partner" && await isAccessSuspended("facility", facility.id)) {
      throw new BookingError(403, "This facility is temporarily restricted from new activities.");
    }
    const id = randomUUID();
    if (data.accessType === "live" && data.active) ensureHttps(data.joinUrl, "Live class join link");
    if (data.joinUrl) ensureHttps(data.joinUrl, "Live class join link");
    const [o] = await tx.insert(offerings).values({ ...data, id, targetId: id, slot: "", scope: "live",
      approvalStatus: data.active ? "published" : "draft",
      reviewedAt: data.active ? new Date() : null,
      reviewedBy: data.active ? res.locals.operator.userId : null,
      localizedTitle: data.localizedTitle ?? null, localizedDescription: data.localizedDescription ?? null, joinUrl: data.joinUrl ?? null,
      partnerGroup: p.groupId, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt),
      cancellationDeadline: new Date(data.cancellationDeadline) }).returning();
    await audit(tx, res.locals.operator.userId, "offering.create", id);
    if (data.active) await audit(tx, res.locals.operator.userId, "offering.approval.decision", id, "from=none;to=published");
    return o;
  });
  res.status(201).json(row);
});
router.post("/offerings/recurring", async (req, res) => {
  const body = CreateRecurringOfferingsBody.parse(req.body);
  const template = offeringInput.parse(body.template);
  if (template.kind !== "session") throw new BookingError(400, "Only sessions can be added to a recurring schedule.");
  const calendarDate = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const schedule = {
    ...body.schedule,
    repeatUntil: calendarDate(body.schedule.repeatUntil),
    dates: body.schedule.dates?.map(calendarDate),
    excludedDates: body.schedule.excludedDates?.map(calendarDate),
  };
  const occurrences = expandRecurringOffering(template, schedule);
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
    if (res.locals.operator.role === "partner" && await isAccessSuspended("facility", facility.id)) {
      throw new BookingError(403, "This facility is temporarily restricted from new activities.");
    }
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
    const conflictingDates = [...new Set(occurrences
      .filter(occurrence => existing.some(row =>
        new Date(occurrence.startsAt) < row.endsAt && new Date(occurrence.endsAt) > row.startsAt,
      ))
      .map(occurrence => iraqCalendarDate(new Date(occurrence.startsAt))))].sort();
    if (conflictingDates.length) return { conflictingDates };

    const rows: (typeof offerings.$inferSelect)[] = [];
    const recurrenceGroupId = randomUUID();
    for (const data of occurrences) {
      const id = randomUUID();
      const [row] = await tx.insert(offerings).values({
        ...data, id, targetId: id, slot: "", scope: "live", partnerGroup: partner.groupId, recurrenceGroupId,
        approvalStatus: template.active ? "published" : "draft",
        reviewedAt: template.active ? new Date() : null,
        reviewedBy: template.active ? res.locals.operator.userId : null,
        localizedTitle: data.localizedTitle ?? null, localizedDescription: data.localizedDescription ?? null,
        joinUrl: data.joinUrl ?? null, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt),
        cancellationDeadline: new Date(data.cancellationDeadline),
      }).returning();
      await audit(tx, res.locals.operator.userId, "offering.create.recurring", id,
        `series=${recurrenceGroupId};mode=${schedule.mode ?? "weekly"};interval=${schedule.interval ?? 1};repeatUntil=${schedule.repeatUntil}`);
      if (template.active) await audit(tx, res.locals.operator.userId, "offering.approval.decision", id, "from=none;to=published");
      rows.push(row);
    }
    return { rows };
  });

  if ("conflictingDates" in created) {
    res.status(409).json({ conflictingDates: created.conflictingDates });
    return;
  }

  const response = created.rows.map(row => ({
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    cancellationDeadline: row.cancellationDeadline.toISOString(),
  }));
  res.status(201).json(CreateRecurringOfferingsResponse.parse(response));
});
type OfferingChangeInput = z.infer<typeof ChangeLiveOfferingBody>;
type OfferingRow = typeof offerings.$inferSelect;
type ScheduleNotice = { offeringId: string; userId: string; startsAt: Date };
type OfferingApprovalStatusValue = z.infer<typeof offeringApprovalStatus>;

const approvalTransitions: Record<OfferingApprovalStatusValue, OfferingApprovalStatusValue[]> = {
  draft: ["archived"],
  submitted: ["under_review", "changes_requested", "approved", "rejected", "archived"],
  under_review: ["changes_requested", "approved", "rejected", "archived"],
  changes_requested: ["rejected", "archived"],
  approved: ["published", "changes_requested", "rejected", "archived"],
  published: ["archived"],
  rejected: ["archived"],
  archived: [],
};

async function assertOfferingReadyForReview(tx: Tx, row: OfferingRow) {
  if (row.cancelledAt || row.startsAt <= new Date()) {
    throw new BookingError(409, "Only a future, uncancelled activity can be submitted or published.");
  }
  if (!row.partnerId) throw new BookingError(409, "This activity is not assigned to a partner.");
  const [partner] = await tx.select().from(partners).where(eq(partners.id, row.partnerId)).for("share");
  if (!partner?.approved) throw new BookingError(403, "Partner approval is required before activity review.");
  const [facility] = await tx.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
    eq(facilityProfiles.partnerId, row.partnerId),
    eq(facilityProfiles.city, row.city),
    eq(facilityProfiles.facility, row.facility),
  )).limit(1);
  if (!facility) throw new BookingError(409, "This activity must use an approved facility profile.");
  if (row.partnerId && await isAccessSuspended("partner", row.partnerId)) {
    throw new BookingError(403, "This partner is temporarily restricted from publishing activities.");
  }
  if (await isAccessSuspended("facility", facility.id)) {
    throw new BookingError(403, "This facility is temporarily restricted from publishing activities.");
  }
  if (row.accessType === "live") {
    if (!row.localizedTitle || !row.localizedDescription) {
      throw new BookingError(400, "Live classes need English, Arabic and Sorani details.");
    }
    ensureHttps(row.joinUrl, "Live class join link");
  }
}

function serializeOffering(row: OfferingRow) {
  return {
    ...row,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    cancellationDeadline: row.cancellationDeadline.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}

router.post("/offerings/:id/submit", async (req, res) => {
  const partnerId = partnerOnly(res);
  const rules = await getPlatformSafetyRules();
  const row = await db.transaction(async tx => {
    const [current] = await tx.select().from(offerings).where(and(
      eq(offerings.id, String(req.params.id)), eq(offerings.scope, "live"),
    )).for("update");
    if (!current) throw new BookingError(404, "Offering not found.");
    own(res, current.partnerId);
    if (current.partnerId !== partnerId) throw new BookingError(403, "You can submit only your own activities.");
    if (current.approvalStatus !== "draft" || current.active) {
      throw new BookingError(409, "Only an inactive draft can be submitted. Use the correction response for requested changes.");
    }
    await assertOfferingReadyForReview(tx, current);
    const now = new Date();
    const outcome = partnerSubmissionOutcome(rules.offeringApprovalRequired);
    const [updated] = await tx.update(offerings).set({
      approvalStatus: outcome.approvalStatus,
      active: outcome.active,
      submittedAt: now,
      reviewedAt: rules.offeringApprovalRequired ? null : now,
      reviewedBy: null,
      approvalReason: null,
      partnerResponse: null,
    }).where(eq(offerings.id, current.id)).returning();
    await audit(
      tx,
      res.locals.operator.userId,
      rules.offeringApprovalRequired ? "offering.approval.submit" : "offering.approval.self_publish",
      current.id,
      rules.offeringApprovalRequired
        ? "from=draft;to=submitted"
        : "from=draft;to=published;admin_approval_required=false",
    );
    return updated;
  });
  res.json(serializeOffering(row));
});

router.post("/offerings/:id/respond", async (req, res) => {
  const partnerId = partnerOnly(res);
  const { response } = offeringPartnerResponseBody.parse(req.body);
  const row = await db.transaction(async tx => {
    const [current] = await tx.select().from(offerings).where(and(
      eq(offerings.id, String(req.params.id)), eq(offerings.scope, "live"),
    )).for("update");
    if (!current) throw new BookingError(404, "Offering not found.");
    own(res, current.partnerId);
    if (current.partnerId !== partnerId) throw new BookingError(403, "You can respond only to corrections on your own activities.");
    if (current.approvalStatus !== "changes_requested" || current.active || current.cancelledAt) {
      throw new BookingError(409, "This activity does not have an open correction request.");
    }
    await assertOfferingReadyForReview(tx, current);
    const [updated] = await tx.update(offerings).set({
      approvalStatus: "submitted",
      submittedAt: new Date(),
      partnerResponse: response,
    }).where(eq(offerings.id, current.id)).returning();
    await audit(tx, res.locals.operator.userId, "offering.approval.respond", current.id,
      `from=changes_requested;to=submitted;responseLength=${response.length}`);
    return updated;
  });
  res.json(serializeOffering(row));
});

router.patch("/offerings/:id/review", async (req, res) => {
  admin(res, "partner_operations");
  const decision = offeringReviewBody.parse(req.body);
  const row = await db.transaction(async tx => {
    const [current] = await tx.select().from(offerings).where(and(
      eq(offerings.id, String(req.params.id)), eq(offerings.scope, "live"),
    )).for("update");
    if (!current) throw new BookingError(404, "Offering not found.");
    if (!approvalTransitions[current.approvalStatus].includes(decision.status)) {
      throw new BookingError(409, `Cannot move an activity from ${current.approvalStatus} to ${decision.status}.`);
    }
    if (current.cancelledAt && decision.status !== "archived") {
      throw new BookingError(409, "Cancelled activities cannot be reopened for review.");
    }
    if (decision.status === "approved" || decision.status === "published") {
      await assertOfferingReadyForReview(tx, current);
    }
    const [booking] = await tx.select({ id: reservations.id }).from(reservations).where(and(
      eq(reservations.offeringId, current.id),
      inArray(reservations.status, ["reserved", "requested"]),
    )).limit(1);
    const [waitlist] = await tx.select({ id: waitlistEntries.id }).from(waitlistEntries).where(and(
      eq(waitlistEntries.offeringId, current.id),
      inArray(waitlistEntries.status, ["waiting", "offered"]),
    )).limit(1);
    if (decision.status !== "published" && (booking || waitlist)) {
      throw new BookingError(409, "Resolve current reservations and waitlist entries before changing this activity's publication state.");
    }
    if (decision.status === "published" && current.approvalStatus !== "approved") {
      throw new BookingError(409, "Approve the activity before publishing it.");
    }
    const [updated] = await tx.update(offerings).set({
      approvalStatus: decision.status,
      approvalReason: decision.reason ?? null,
      ...(decision.status === "changes_requested" ? { partnerResponse: null } : {}),
      active: decision.status === "published",
      reviewedAt: new Date(),
      reviewedBy: res.locals.operator.userId,
    }).where(eq(offerings.id, current.id)).returning();
    await audit(tx, res.locals.operator.userId, "offering.approval.decision", current.id,
      `from=${current.approvalStatus};to=${decision.status};reason=${decision.reason ?? ""}`);
    return updated;
  });
  res.json(serializeOffering(row));
});

async function changeOfferingSet(id: string, data: OfferingChangeInput, res: Response, series: boolean) {
  const timeValues = [data.startsAt, data.endsAt, data.cancellationDeadline];
  const hasTimeChange = timeValues.some(value => value !== undefined);
  if (hasTimeChange && timeValues.some(value => value === undefined)) {
    throw new BookingError(400, "Set the start, end, and cancellation deadline together.");
  }
  const requestedStart = hasTimeChange ? new Date(data.startsAt!) : null;
  const requestedEnd = hasTimeChange ? new Date(data.endsAt!) : null;
  const requestedDeadline = hasTimeChange ? new Date(data.cancellationDeadline!) : null;
  if (requestedStart && requestedEnd && requestedDeadline
    && (!(requestedStart > new Date()) || !(requestedEnd > requestedStart) || requestedDeadline > requestedStart)) {
    throw new BookingError(400, "Use a future start, later end, and a cancellation deadline no later than the start.");
  }

  const result = await db.transaction(async tx => {
    const [selected] = await tx.select().from(offerings).where(and(
      eq(offerings.id, id), eq(offerings.scope, "live"),
    )).for("update");
    if (!selected) throw new BookingError(404, "Offering not found.");
    own(res, selected.partnerId);
    if (selected.cancelledAt) throw new BookingError(409, "Cancelled offerings cannot be edited or republished. Create a replacement.");
    if (selected.startsAt <= new Date()) throw new BookingError(409, "Past offerings cannot be edited.");
    if (res.locals.operator.role === "partner" && selected.partnerId) {
      const [facility] = await tx.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
        eq(facilityProfiles.partnerId, selected.partnerId),
        eq(facilityProfiles.city, selected.city),
        eq(facilityProfiles.facility, selected.facility),
      )).limit(1);
      if (facility && await isAccessSuspended("facility", facility.id)) {
        throw new BookingError(403, "This facility is temporarily restricted from activity changes.");
      }
    }
    if (series && !selected.recurrenceGroupId) {
      throw new BookingError(409, "This session is not part of a recurring series.");
    }

    const venueKey = `${selected.city.trim().toLowerCase()}|${selected.facility.trim().toLowerCase()}`;
    if (selected.partnerId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${selected.partnerId}), hashtext(${venueKey}))`);
    }
    const rows = series
      ? await tx.select().from(offerings).where(and(
        eq(offerings.scope, "live"),
        eq(offerings.partnerId, selected.partnerId ?? ""),
        eq(offerings.recurrenceGroupId, selected.recurrenceGroupId!),
        isNull(offerings.cancelledAt),
        gt(offerings.startsAt, new Date()),
      )).orderBy(asc(offerings.startsAt)).for("update")
      : [selected];
    if (!rows.length || !rows.some(row => row.id === selected.id)) {
      throw new BookingError(409, "There are no remaining future sessions in this series.");
    }
    for (const row of rows) own(res, row.partnerId);

    const contentChanged = data.localizedTitle !== undefined
      || data.localizedDescription !== undefined || data.joinUrl !== undefined;
    const partnerContentEdit = res.locals.operator.role === "partner" && contentChanged;
    if (partnerContentEdit && rows.some(row =>
      ["submitted", "under_review", "rejected", "archived"].includes(row.approvalStatus))) {
      throw new BookingError(409, "Wait for the administrator decision before changing a submitted or closed activity.");
    }
    const needsReview = partnerContentEdit && rows.some(row =>
      row.active || row.approvalStatus === "published" || row.approvalStatus === "approved");
    if (needsReview) {
      const [booking] = await tx.select({ id: reservations.id }).from(reservations).where(and(
        inArray(reservations.offeringId, rows.map(row => row.id)),
        inArray(reservations.status, ["reserved", "requested"]),
      )).limit(1);
      const [waitlist] = await tx.select({ id: waitlistEntries.id }).from(waitlistEntries).where(and(
        inArray(waitlistEntries.offeringId, rows.map(row => row.id)),
        inArray(waitlistEntries.status, ["waiting", "offered"]),
      )).limit(1);
      if (booking || waitlist) {
        throw new BookingError(409, "Cancel remaining bookings and waitlist entries before submitting published content changes for review.");
      }
    }
    const nextTitle = data.localizedTitle ?? selected.localizedTitle;
    const nextDescription = data.localizedDescription ?? selected.localizedDescription;
    const nextJoinUrl = data.joinUrl !== undefined ? data.joinUrl : selected.joinUrl;
    if (data.joinUrl) ensureHttps(data.joinUrl, "Live class join link");

    const nextActive = (row: OfferingRow) => needsReview ? false : row.active;
    if (rows.some(row => row.accessType === "live" && nextActive(row))) {
      if (!nextTitle || !nextDescription) throw new BookingError(400, "Live classes need English, Arabic and Sorani details.");
      ensureHttps(nextJoinUrl, "Live class join link");
    }
    for (const row of rows) {
      if (!nextActive(row)) continue;
      const [partner] = await tx.select().from(partners).where(eq(partners.id, row.partnerId!)).for("share");
      if (!partner?.approved) throw new BookingError(403, "Partner approval is required.");
      const [facility] = await tx.select({ id: facilityProfiles.id }).from(facilityProfiles).where(and(
        eq(facilityProfiles.partnerId, row.partnerId!),
        eq(facilityProfiles.city, row.city),
        eq(facilityProfiles.facility, row.facility),
      )).limit(1);
      if (!facility) throw new BookingError(409, "This session is not linked to an existing shared facility profile.");
    }

    const resolvedTimes = rows.map(row => {
      if (!requestedStart || !requestedEnd || !requestedDeadline) {
        return { row, startsAt: row.startsAt, endsAt: row.endsAt, cancellationDeadline: row.cancellationDeadline };
      }
      if (series) {
        const startDelta = requestedStart.getTime() - selected.startsAt.getTime();
        const duration = requestedEnd.getTime() - requestedStart.getTime();
        const cancellationOffset = requestedDeadline.getTime() - requestedStart.getTime();
        const startsAt = new Date(row.startsAt.getTime() + startDelta);
        return {
          row,
          startsAt,
          endsAt: new Date(startsAt.getTime() + duration),
          cancellationDeadline: new Date(startsAt.getTime() + cancellationOffset),
        };
      }
      return { row, startsAt: requestedStart, endsAt: requestedEnd, cancellationDeadline: requestedDeadline };
    });
    for (const item of resolvedTimes) {
      if (item.startsAt <= new Date() || item.endsAt <= item.startsAt || item.cancellationDeadline > item.startsAt) {
        throw new BookingError(400, "Every changed session needs a future start, later end, and valid cancellation deadline.");
      }
    }

    const offeringIds = rows.map(row => row.id);
    const [heldRows, offerRows] = await Promise.all([
      tx.select({ offeringId: reservations.offeringId, count: sql<number>`count(*)::int` })
        .from(reservations).where(and(
          inArray(reservations.offeringId, offeringIds),
          inArray(reservations.status, ["reserved", "requested"]),
        )).groupBy(reservations.offeringId),
      tx.select({ offeringId: waitlistEntries.offeringId, count: sql<number>`count(*)::int` })
        .from(waitlistEntries).where(and(
          inArray(waitlistEntries.offeringId, offeringIds),
          eq(waitlistEntries.status, "offered"),
          gt(waitlistEntries.offerExpiresAt, new Date()),
        )).groupBy(waitlistEntries.offeringId),
    ]);
    const heldByOffering = new Map(heldRows.map(row => [row.offeringId, Number(row.count)]));
    const offersByOffering = new Map(offerRows.map(row => [row.offeringId, Number(row.count)]));
    for (const row of rows) {
      if ((heldByOffering.get(row.id) ?? 0) + (offersByOffering.get(row.id) ?? 0) > data.capacity) {
        throw new BookingError(409, "Capacity cannot be below existing reservations and active waitlist offers.");
      }
    }

    const scheduleChanged = resolvedTimes.some(item =>
      item.startsAt.getTime() !== item.row.startsAt.getTime()
      || item.endsAt.getTime() !== item.row.endsAt.getTime()
      || item.cancellationDeadline.getTime() !== item.row.cancellationDeadline.getTime());
    let notices: ScheduleNotice[] = [];
    if (scheduleChanged) {
      const attendanceRows = await tx.select({ id: attendance.id }).from(attendance)
        .where(inArray(attendance.offeringId, offeringIds));
      if (attendanceRows.length) {
        throw new BookingError(409, "A session with an arrival record cannot be rescheduled.");
      }
      const [bookingRows, waitlistRows] = await Promise.all([
        tx.select({ offeringId: reservations.offeringId, userId: reservations.userId }).from(reservations)
          .where(and(
            inArray(reservations.offeringId, offeringIds),
            inArray(reservations.status, ["reserved", "requested"]),
          )),
        tx.select({ offeringId: waitlistEntries.offeringId, userId: waitlistEntries.userId }).from(waitlistEntries)
          .where(and(
            inArray(waitlistEntries.offeringId, offeringIds),
            inArray(waitlistEntries.status, ["waiting", "offered"]),
          )),
      ]);
      const startByOffering = new Map(resolvedTimes.map(item => [item.row.id, item.startsAt]));
      notices = [...bookingRows, ...waitlistRows].map(item => ({
        ...item,
        startsAt: startByOffering.get(item.offeringId)!,
      }));

      const ids = new Set(offeringIds);
      const minStart = new Date(Math.min(...resolvedTimes.map(item => item.startsAt.getTime())));
      const maxEnd = new Date(Math.max(...resolvedTimes.map(item => item.endsAt.getTime())));
      const possibleConflicts = await tx.select({
        id: offerings.id, startsAt: offerings.startsAt, endsAt: offerings.endsAt,
      }).from(offerings).where(and(
        eq(offerings.scope, "live"),
        eq(offerings.partnerId, selected.partnerId ?? ""),
        sql`lower(${offerings.city}) = lower(${selected.city})`,
        sql`lower(${offerings.facility}) = lower(${selected.facility})`,
        isNull(offerings.cancelledAt),
        lt(offerings.startsAt, maxEnd),
        gt(offerings.endsAt, minStart),
      ));
      if (possibleConflicts.some(conflict => !ids.has(conflict.id)
        && resolvedTimes.some(item => item.startsAt < conflict.endsAt && item.endsAt > conflict.startsAt))) {
        throw new BookingError(409, "The changed schedule overlaps another offering at this facility.");
      }
    }

    const updatedRows: OfferingRow[] = [];
    for (const item of resolvedTimes) {
      const [updated] = await tx.update(offerings).set({
        capacity: data.capacity,
        ...(data.waitlistOfferMinutes !== undefined ? { waitlistOfferMinutes: data.waitlistOfferMinutes } : {}),
        ...(needsReview ? {
          active: false,
          approvalStatus: "submitted" as const,
          approvalReason: null,
          partnerResponse: null,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedBy: null,
        } : {}),
        ...(data.localizedTitle !== undefined ? { localizedTitle: data.localizedTitle } : {}),
        ...(data.localizedDescription !== undefined ? { localizedDescription: data.localizedDescription } : {}),
        ...(data.joinUrl !== undefined ? { joinUrl: data.joinUrl } : {}),
        ...(scheduleChanged ? {
          startsAt: item.startsAt, endsAt: item.endsAt, cancellationDeadline: item.cancellationDeadline,
        } : {}),
      }).where(eq(offerings.id, item.row.id)).returning();
      await audit(tx, res.locals.operator.userId, series ? "offering.update.series" : "offering.update",
        item.row.id, series ? `series=${selected.recurrenceGroupId}` : undefined);
      if (needsReview) {
        await audit(tx, res.locals.operator.userId, "offering.approval.resubmit", item.row.id,
          `from=${item.row.approvalStatus};to=submitted;reason=published_content_edit`);
      }
      updatedRows.push(updated);
    }
    return { rows: updatedRows, notices, scheduleChanged };
  });

  await processWaitlistQueue();
  if (result.scheduleChanged) {
    await Promise.allSettled(result.notices.map(notice => sendMemberNotification(
      notice.userId,
      "schedule_changed",
      { dedupeKey: `schedule-changed:${notice.offeringId}:${notice.startsAt.toISOString()}` },
    )));
  }
  return result.rows;
}

router.patch("/offerings/:id", async (req, res) => {
  const data = strictOfferingUpdateBody.parse(req.body);
  const [row] = await changeOfferingSet(String(req.params.id), data, res, false);
  res.json(row);
});
router.patch("/offerings/:id/series", async (req, res) => {
  const data = strictOfferingUpdateBody.parse(req.body);
  const rows = await changeOfferingSet(String(req.params.id), data, res, true);
  res.json(CreateRecurringOfferingsResponse.parse(rows.map(serializeOffering)));
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
async function cancelOfferingSet(id: string, res: Response, series: boolean) {
  const affected = await db.transaction(async tx => {
    const [selected] = await tx.select().from(offerings).where(and(
      eq(offerings.id, id), eq(offerings.scope, "live"),
    )).for("update");
    if (!selected) throw new BookingError(404, "Offering not found.");
    own(res, selected.partnerId);
    if (selected.cancelledAt) {
      if (series) throw new BookingError(409, "Choose a remaining session in this series to cancel future sessions.");
      return {
        bookingUsers: [] as ScheduleNotice[],
        waitlistUsers: [] as ScheduleNotice[],
        cancelledDates: [] as string[],
        preservedDates: [] as string[],
      };
    }
    if (selected.startsAt <= new Date()) throw new BookingError(409, "Past sessions require attendance review.");
    if (series && !selected.recurrenceGroupId) {
      throw new BookingError(409, "This session is not part of a recurring series.");
    }
    if (selected.partnerId) {
      const venueKey = `${selected.city.trim().toLowerCase()}|${selected.facility.trim().toLowerCase()}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${selected.partnerId}), hashtext(${venueKey}))`);
    }
    const rows = series
      ? await tx.select().from(offerings).where(and(
        eq(offerings.scope, "live"),
        eq(offerings.partnerId, selected.partnerId ?? ""),
        eq(offerings.recurrenceGroupId, selected.recurrenceGroupId!),
        isNull(offerings.cancelledAt),
        gt(offerings.startsAt, new Date()),
      )).orderBy(asc(offerings.startsAt)).for("update")
      : [selected];
    if (!rows.length || !rows.some(row => row.id === selected.id)) {
      throw new BookingError(409, "There are no remaining future sessions in this series.");
    }

    const protectedOfferingIds = new Set<string>();
    if (series) {
      const offeringIds = rows.map(row => row.id);
      const [heldReservations, attendanceRows] = await Promise.all([
        tx.select({ offeringId: reservations.offeringId }).from(reservations).where(and(
          inArray(reservations.offeringId, offeringIds),
          inArray(reservations.status, ["reserved", "requested"]),
        )),
        tx.select({ offeringId: attendance.offeringId }).from(attendance)
          .where(inArray(attendance.offeringId, offeringIds)),
      ]);
      heldReservations.forEach(row => protectedOfferingIds.add(row.offeringId));
      attendanceRows.forEach(row => protectedOfferingIds.add(row.offeringId));
    }
    const rowsToCancel = series ? rows.filter(row => !protectedOfferingIds.has(row.id)) : rows;
    const preservedDates = series
      ? [...new Set(rows.filter(row => protectedOfferingIds.has(row.id)).map(row => iraqCalendarDate(row.startsAt)))].sort()
      : [];
    const cancelledDates = [...new Set(rowsToCancel.map(row => iraqCalendarDate(row.startsAt)))].sort();

    const bookingUsers: ScheduleNotice[] = [];
    const waitlistUsers: ScheduleNotice[] = [];
    const cancelledAt = new Date();
    for (const row of rowsToCancel) {
      own(res, row.partnerId);
      const heldReservations = await tx.select({ userId: reservations.userId }).from(reservations)
        .where(and(eq(reservations.offeringId, row.id), inArray(reservations.status, ["reserved", "requested"])));
      bookingUsers.push(...heldReservations.map(reservation => ({
        offeringId: row.id, userId: reservation.userId, startsAt: row.startsAt,
      })));
      await tx.update(offerings).set({
        active: false, cancelledAt, approvalStatus: "archived",
      }).where(eq(offerings.id, row.id));
      const arrivals = await tx.select().from(attendance).where(eq(attendance.offeringId, row.id));
      for (const arrival of arrivals) {
        await tx.update(attendance).set({ status: "void", settlementEligible: false }).where(eq(attendance.id, arrival.id));
        if (arrival.reservationId) await tx.insert(attendanceEvents).values({
          id: randomUUID(), reservationId: arrival.reservationId,
          actorId: res.locals.operator.userId, action: "partner_cancelled",
          before: arrival.status, after: "void",
          reason: "Partner cancelled the offering; allowance restored.",
        });
      }
      await tx.update(reservations).set({ status: "partner_cancelled", cancelledAt })
        .where(and(eq(reservations.offeringId, row.id), inArray(reservations.status, ["reserved", "requested"])));
      const activeWaitlist = await tx.select({ userId: waitlistEntries.userId }).from(waitlistEntries)
        .where(and(eq(waitlistEntries.offeringId, row.id), inArray(waitlistEntries.status, ["waiting", "offered"])));
      waitlistUsers.push(...activeWaitlist.map(entry => ({
        offeringId: row.id, userId: entry.userId, startsAt: row.startsAt,
      })));
      await tx.update(waitlistEntries).set({ status: "closed", respondedAt: cancelledAt })
        .where(and(eq(waitlistEntries.offeringId, row.id), inArray(waitlistEntries.status, ["waiting", "offered"])));
      await audit(tx, res.locals.operator.userId, series ? "offering.cancel.series" : "offering.cancel",
        row.id, series ? `series=${selected.recurrenceGroupId}` : undefined);
    }
    return { bookingUsers, waitlistUsers, cancelledDates, preservedDates };
  });
  await Promise.allSettled([
    ...affected.bookingUsers.map(notice => sendMemberNotification(
      notice.userId, "booking_cancelled", { dedupeKey: `offering-cancelled:${notice.offeringId}` },
    )),
    ...affected.waitlistUsers.map(notice => sendMemberNotification(
      notice.userId, "waitlist_closed", { dedupeKey: `offering-waitlist-closed:${notice.offeringId}` },
    )),
  ]);
  return { cancelledDates: affected.cancelledDates, preservedDates: affected.preservedDates };
}

router.post("/offerings/:id/cancel", async (req, res) => {
  await cancelOfferingSet(String(req.params.id), res, false);
  res.json({ ok: true });
});
router.post("/offerings/:id/series/cancel", async (req, res) => {
  const result = await cancelOfferingSet(String(req.params.id), res, true);
  res.json({ ok: true, ...result });
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
  const result = rows.map(row => ({
    ...row,
    retentionUntil: financeRecordRetentionUntil(new Date(`${row.issuedAt}T00:00:00.000Z`)).toISOString(),
  }));
  GetPartnerInvoicesResponse.parse(result);
  res.json(result);
});

router.post("/attendance/:id/guardian-consent/upload-url", async (req, res) => {
  const partnerId = partnerOnly(res);
  const parsed = guardianConsentUploadInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const result = await requestGuardianConsentUpload(
    req.params.id,
    partnerId,
    res.locals.operator.userId,
    parsed.data,
  );
  res.json(result);
});

router.post("/attendance/:id/guardian-consent/:documentId/complete", async (req, res) => {
  const partnerId = partnerOnly(res);
  await completeGuardianConsentUpload(
    req.params.id,
    req.params.documentId,
    partnerId,
    res.locals.operator.userId,
  );
  res.json({ ok: true });
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
  const response = {
    ...result,
    retentionUntil: financeRecordRetentionUntil(new Date(`${result.issuedAt}T00:00:00.000Z`)).toISOString(),
  };
  SubmitPartnerInvoiceResponse.parse(response);
  res.status(201).json(response);
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
    reconciliationRows, reviewRows, reviewEvents, operationEvents, correctionRows] = await Promise.all([
    db.select().from(partners).orderBy(asc(partners.name)),
    db.select({
      id: facilityProfiles.id, partnerId: facilityProfiles.partnerId, city: facilityProfiles.city,
      facility: facilityProfiles.facility, updatedAt: facilityProfiles.updatedAt,
    }).from(facilityProfiles).orderBy(asc(facilityProfiles.city), asc(facilityProfiles.facility)),
    db.select({
      userId: memberships.userId, status: memberships.status, paymentStatus: memberships.paymentStatus,
      tier: memberships.tier, source: memberships.source, startsAt: memberships.startsAt, endsAt: memberships.endsAt,
      rules: memberships.rules,
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
      issuedAt: partnerInvoiceSubmissions.issuedAt, taxNumber: partnerInvoiceSubmissions.taxNumber, periodStart: partnerInvoiceSubmissions.periodStart,
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
    db.select().from(financeInvoiceCorrections).orderBy(desc(financeInvoiceCorrections.createdAt)).limit(500),
  ]);
  const pauseEvents = membershipRows.length ? await db.select({
    targetId: operationAudit.targetId, action: operationAudit.action, createdAt: operationAudit.createdAt,
  }).from(operationAudit).where(and(
    inArray(operationAudit.targetId, membershipRows.map(membership => membership.userId)),
    inArray(operationAudit.action, ["membership.pause", "membership.resume", "membership.pause_closed"]),
  )).orderBy(asc(operationAudit.createdAt)) : [];
  const pausesByUser = new Map<string, PauseEvent[]>();
  for (const event of pauseEvents) {
    const current = pausesByUser.get(event.targetId) ?? [];
    current.push(event);
    pausesByUser.set(event.targetId, current);
  }
  res.json({
    role: res.locals.operator.role,
    paymentGateEnabled: paymentsEnabled(),
    livePayoutGateEnabled: payoutApprovalEnabled(),
    partners: partnersRows,
    facilities: facilityRows,
    customers: membershipRows.map(({ rules, ...membership }) => {
      const pause = summarizePauseEvents(pausesByUser.get(membership.userId) ?? []);
      return {
        ...membership,
        status: effectiveMembershipStatus(membership),
        pauseAllowanceDays: rules.planTerms?.pauseAllowanceDays ?? 0,
        pauseUsedDays: pause.pauseUsedDays,
        pausedAt: pause.pausedAt,
      };
    }),
    bookings: bookingRows,
    customerInvoices: billingRows.map(row => ({
      ...row,
      retentionUntil: financeRecordRetentionUntil(row.createdAt).toISOString(),
    })),
    partnerInvoices: partnerInvoices.map(row => ({
      ...row,
      retentionUntil: financeRecordRetentionUntil(new Date(`${row.issuedAt}T00:00:00.000Z`)).toISOString(),
    })),
    invoiceCorrections: correctionRows,
    reconciliation: reconciliationRows,
    reviewItems: reviewRows,
    reviewEvents,
    audit: operationEvents,
  });
});

router.post("/bookings/:id/cancel", async (req, res) => {
  admin(res, "membership_support");
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

const financeInvoiceCorrectionTypes = [
  "full_refund",
  "partial_refund",
  "incorrect_charge",
  "membership_cancellation",
  "event_cancellation",
  "duplicate_payment",
  "pricing_correction",
  "tax_correction",
] as const;

router.post("/finance/invoice-corrections", async (req, res) => {
  financeStaff(res);
  const input = z.object({
    invoiceType: z.enum(["customer", "partner"]),
    invoiceId: z.string().trim().min(1).max(160),
    correctionType: z.enum(financeInvoiceCorrectionTypes),
    amountIqd: z.number().int().min(1).max(1_000_000_000).optional(),
    refundTransactionReference: z.string().trim().max(160).optional(),
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: z.string().uuid(),
  }).strict().parse(req.body);
  const actorId = res.locals.operator.userId;
  const billingId = input.invoiceType === "customer" ? input.invoiceId : null;
  const partnerInvoiceId = input.invoiceType === "partner" ? input.invoiceId : null;
  const created = await db.transaction(async tx => {
    const [sameKey] = await tx.select().from(financeInvoiceCorrections)
      .where(eq(financeInvoiceCorrections.idempotencyKey, input.idempotencyKey));
    if (sameKey) {
      const sameRequest = sameKey.createdBy === actorId
        && sameKey.membershipBillingId === billingId
        && sameKey.partnerInvoiceId === partnerInvoiceId
        && sameKey.correctionType === input.correctionType
        && sameKey.amountIqd === (input.amountIqd ?? null)
        && sameKey.refundTransactionReference === (input.refundTransactionReference || null)
        && sameKey.reason === input.reason;
      if (!sameRequest) throw new BookingError(409, "This request key was already used for a different invoice correction.");
      return sameKey;
    }

    if (input.invoiceType === "customer") {
      const [invoice] = await tx.select({ id: membershipBilling.id }).from(membershipBilling)
        .where(eq(membershipBilling.id, input.invoiceId)).limit(1);
      if (!invoice) throw new BookingError(404, "Customer invoice not found.");
    } else {
      const [invoice] = await tx.select({ id: partnerInvoiceSubmissions.id }).from(partnerInvoiceSubmissions)
        .where(eq(partnerInvoiceSubmissions.id, input.invoiceId)).limit(1);
      if (!invoice) throw new BookingError(404, "Partner invoice not found.");
    }

    const [row] = await tx.insert(financeInvoiceCorrections).values({
      id: randomUUID(),
      membershipBillingId: billingId,
      partnerInvoiceId,
      correctionType: input.correctionType,
      amountIqd: input.amountIqd ?? null,
      refundTransactionReference: input.refundTransactionReference || null,
      reason: input.reason,
      createdBy: actorId,
      idempotencyKey: input.idempotencyKey,
      retentionUntil: financeRecordRetentionUntil(new Date()),
    }).onConflictDoNothing({ target: financeInvoiceCorrections.idempotencyKey }).returning();
    if (!row) throw new BookingError(409, "This request key has already been used.");
    await audit(tx, actorId, "finance.invoice_correction.create", row.id,
      `invoice=${input.invoiceType}:${input.invoiceId};type=${input.correctionType}`);
    return row;
  });
  res.status(201).json(created);
});

router.get("/finance/audit", async (_req, res) => {
  financeStaff(res);
  const [operationEvents, reviewEvents] = await Promise.all([
    db.select().from(operationAudit).orderBy(desc(operationAudit.createdAt)).limit(500),
    db.select().from(financeReviewEvents).orderBy(desc(financeReviewEvents.createdAt)).limit(500),
  ]);
  res.json({ operations: operationEvents, financeReviews: reviewEvents });
});

router.get("/instructor-access-requests", async (_req, res) => {
  admin(res, "content");
  const now = new Date();
  const [requests, courses, upcomingOfferings] = await Promise.all([
    db.select({
      id: instructorPortalRequests.id,
      userId: instructorPortalRequests.userId,
      message: instructorPortalRequests.message,
      status: instructorPortalRequests.status,
      submittedAt: instructorPortalRequests.submittedAt,
    }).from(instructorPortalRequests)
      .where(eq(instructorPortalRequests.status, "pending"))
      .orderBy(asc(instructorPortalRequests.submittedAt)),
    db.select({
      id: learningCourses.id,
      title: learningCourses.title,
      localizedTitle: learningCourses.localizedTitle,
      category: learningCourses.category,
      published: learningCourses.published,
    }).from(learningCourses).orderBy(desc(learningCourses.updatedAt)),
    db.select({
      id: offerings.id,
      kind: offerings.kind,
      title: offerings.title,
      localizedTitle: offerings.localizedTitle,
      city: offerings.city,
      facility: offerings.facility,
      startsAt: offerings.startsAt,
      endsAt: offerings.endsAt,
    }).from(offerings).where(and(
      eq(offerings.approvalStatus, "published"),
      eq(offerings.active, true),
      isNull(offerings.cancelledAt),
      eq(offerings.additionalPayment, false),
      gt(offerings.startsAt, now),
    )).orderBy(asc(offerings.startsAt)).limit(300),
  ]);
  res.json(GetInstructorAccessRequestsResponse.parse({ requests, courses, offerings: upcomingOfferings }));
});

router.post("/instructor-access-requests/:id/decision", async (req, res) => {
  admin(res, "content");
  const parsed = DecideInstructorAccessRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a valid decision and, when declining, give a reason." });
    return;
  }
  const input = parsed.data;
  if (
    new Set(input.courseIds).size !== input.courseIds.length
    || new Set(input.offeringIds).size !== input.offeringIds.length
    || (input.decision === "reject" && (!input.reason || input.courseIds.length > 0 || input.offeringIds.length > 0))
  ) {
    res.status(400).json({ message: "Use unique assignments and provide a reason without assignments when declining." });
    return;
  }
  const id = String(req.params.id);
  const actorId = getAuth(req).userId!;
  const now = new Date();
  const result = await db.transaction(async tx => {
    const [request] = await tx.select().from(instructorPortalRequests)
      .where(eq(instructorPortalRequests.id, id)).for("update");
    if (!request) throw new BookingError(404, "Instructor access request not found.");
    if (request.status !== "pending") throw new BookingError(409, "This request has already been reviewed.");

    if (input.decision === "approve") {
      const [existingOperator] = await tx.select().from(operators)
        .where(eq(operators.userId, request.userId)).for("update");
      if (existingOperator && existingOperator.role !== "instructor") {
        throw new BookingError(409, "This account already has a different staff role. Resolve the role assignment before approving.");
      }
      if (input.courseIds.length) {
        const validCourses = await tx.select({ id: learningCourses.id }).from(learningCourses)
          .where(inArray(learningCourses.id, input.courseIds));
        if (validCourses.length !== input.courseIds.length) {
          throw new BookingError(400, "One or more selected courses are no longer available.");
        }
      }
      if (input.offeringIds.length) {
        const validOfferings = await tx.select({ id: offerings.id }).from(offerings).where(and(
          inArray(offerings.id, input.offeringIds),
          eq(offerings.approvalStatus, "published"),
          eq(offerings.active, true),
          isNull(offerings.cancelledAt),
          eq(offerings.additionalPayment, false),
          gt(offerings.startsAt, now),
        ));
        if (validOfferings.length !== input.offeringIds.length) {
          throw new BookingError(400, "One or more selected upcoming sessions are no longer available.");
        }
      }

      if (!existingOperator) {
        await tx.insert(operators).values({ userId: request.userId, role: "instructor" });
      }
      if (input.courseIds.length) {
        await tx.insert(instructorCourseAssignments).values(input.courseIds.map(courseId => ({
          id: randomUUID(), userId: request.userId, courseId, assignedBy: actorId,
        }))).onConflictDoNothing();
      }
      if (input.offeringIds.length) {
        await tx.insert(instructorOfferingAssignments).values(input.offeringIds.map(offeringId => ({
          id: randomUUID(), userId: request.userId, offeringId, assignedBy: actorId,
        }))).onConflictDoNothing();
      }
    }

    const status = input.decision === "approve" ? "approved" : "rejected";
    const [updated] = await tx.update(instructorPortalRequests).set({
      status,
      decisionReason: input.reason ?? null,
      decidedAt: now,
      decidedBy: actorId,
      updatedAt: now,
    }).where(eq(instructorPortalRequests.id, id)).returning();
    await audit(tx, actorId, `instructor.access.${status}`, id,
      `user=${request.userId};courses=${input.decision === "approve" ? input.courseIds.length : 0};sessions=${input.decision === "approve" ? input.offeringIds.length : 0}`);
    return {
      id: updated.id,
      status,
      courseCount: input.decision === "approve" ? input.courseIds.length : 0,
      offeringCount: input.decision === "approve" ? input.offeringIds.length : 0,
    };
  });
  res.json(DecideInstructorAccessRequestResponse.parse(result));
});

router.get("/courses", async (_req, res) => {
  admin(res, "content");
  const courses = await db.select().from(learningCourses).orderBy(desc(learningCourses.updatedAt));
  const lessonCounts = courses.length
    ? await db.select({
      courseId: learningLessons.courseId,
      lessonCount: sql<number>`count(*)::int`,
    }).from(learningLessons)
      .where(inArray(learningLessons.courseId, courses.map(course => course.id)))
      .groupBy(learningLessons.courseId)
    : [];
  const countByCourse = new Map(lessonCounts.map(row => [row.courseId, row.lessonCount]));
  res.json(GetOperationCoursesResponse.parse({
    courses: courses.map(course => ({
      ...course,
      lessonCount: countByCourse.get(course.id) ?? 0,
    })),
  }));
});

router.post("/courses", async (req, res) => {
  admin(res, "content");
  const parsed = CreateLearningCourseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Check the course details and lesson content." }); return; }
  const data = parsed.data;
  const positions = data.lessons.map(lesson => lesson.position).sort((a, b) => a - b);
  if (positions.some((position, index) => position !== index + 1)) {
    res.status(400).json({ message: "Lesson positions must start at 1 and have no gaps or duplicates." }); return;
  }
  if (data.lessons.some(lesson => !isPrivateCourseRecordingPath(lesson.mediaUrl))) {
    res.status(400).json({ message: "Each lesson recording must be in private course storage." }); return;
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
  admin(res, "content");
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
  admin(res, "content");
  const parsed = AddLearningLessonBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Check the lesson details." }); return; }
  const data = parsed.data;
  if (!isPrivateCourseRecordingPath(data.mediaUrl)) {
    throw new BookingError(400, "Lesson recordings must be in private course storage.");
  }
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
    return { ...added, hasRecording: true, completed: false };
  });
  res.status(201).json(AddLearningLessonResponse.parse(lesson));
});

router.post("/plans", async (req, res) => {
  admin(res, "partner_operations");
  const data = planInput.parse(req.body);
  const rules = await getPlatformSafetyRules();
  if (exceedsPlatformDailyVisitLimit(null, data.rules.dailyLimit, rules.maxDailyVisitsPerPlan)) {
    throw new BookingError(400, `A new plan cannot exceed the platform limit of ${rules.maxDailyVisitsPerPlan} visits per day.`);
  }
  if (data.kind === "paid") validatePaidPlan(data.priceIqd);
  const row = await db.transaction(async tx => {
    const [p] = await tx.insert(membershipPlans).values({ ...data, id: randomUUID() }).returning();
    await audit(tx, res.locals.operator.userId, "plan.create", p.id);
    return p;
  });
  res.status(201).json(row);
});
router.put("/plans/:id", async (req, res) => {
  admin(res, "partner_operations");
  const data = planInput.parse(req.body);
  const rules = await getPlatformSafetyRules();
  if (data.kind === "paid") validatePaidPlan(data.priceIqd);
  const row = await db.transaction(async tx => {
    const [current] = await tx.select().from(membershipPlans)
      .where(eq(membershipPlans.id, String(req.params.id))).for("update").limit(1);
    if (!current) throw new BookingError(404, "Plan not found.");
    if (exceedsPlatformDailyVisitLimit(
      current.rules.dailyLimit,
      data.rules.dailyLimit,
      rules.maxDailyVisitsPerPlan,
    )) {
      throw new BookingError(400, `A changed plan cannot exceed the platform limit of ${rules.maxDailyVisitsPerPlan} visits per day.`);
    }
    const [p] = await tx.update(membershipPlans).set(data)
      .where(eq(membershipPlans.id, current.id)).returning();
    await audit(tx, res.locals.operator.userId, "plan.update", p.id);
    return p;
  });
  res.json(row);
});
router.post("/grants", async (req, res) => {
  admin(res, "membership_support");
  const input = z.object({ userId: z.string().min(1).max(160), planId: z.string().uuid(),
    corporateId: z.string().max(160).optional(), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    reason: z.string().trim().min(5).max(500) }).strict().parse(req.body);
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
    if (existing && ["active", "trial", "scheduled", "scheduled_cancellation", "paused", "suspended"].includes(existing.status) && existing.endsAt > new Date())
      throw new BookingError(409, "Revoke the existing membership before granting a replacement.");
    const now = new Date();
    if (input.startsOn) {
      const utcDate = new Date(`${input.startsOn}T00:00:00Z`);
      if (!Number.isFinite(utcDate.getTime()) || utcDate.toISOString().slice(0, 10) !== input.startsOn)
        throw new BookingError(400, "Choose a valid Iraq calendar date.");
    }
    const startsAt = input.startsOn ? new Date(`${input.startsOn}T00:00:00+03:00`) : now;
    if (input.startsOn && startsAt <= now)
      throw new BookingError(400, "A scheduled membership must start on a future Iraq date.");
    const endsAt = new Date(startsAt.getTime() + p.durationDays * 86400000);
    const membership = { scope: "live", status: startsAt > now ? "scheduled" : p.kind === "trial" ? "trial" : "active",
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
router.post("/memberships/lifecycle", async (req, res) => {
  const input = z.object({
    userId: z.string().trim().min(1).max(160),
    action: z.enum(["schedule_cancel", "cancel_now", "reactivate", "pause", "resume", "suspend", "terminate"]),
    reason: z.string().trim().min(5).max(500),
  }).strict().parse(req.body);
  const lifecyclePermission = ["suspend", "terminate"].includes(input.action) ? "fraud_compliance" : "membership_support";
  admin(res, lifecyclePermission);
  const now = new Date();
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);
    const [membership] = await tx.select().from(memberships).where(and(
      eq(memberships.userId, input.userId), eq(memberships.scope, "live"),
    )).for("update");
    if (!membership) throw new BookingError(404, "Live membership not found.");
    if (membership.source === "paid" || membership.billingId || membership.paymentStatus !== "not_required")
      throw new BookingError(409, "Paid membership lifecycle changes are reserved for the payment milestone.");
    const status = effectiveMembershipStatus(membership, now);
    const pauseEvents = await tx.select({ action: operationAudit.action, createdAt: operationAudit.createdAt })
      .from(operationAudit).where(and(eq(operationAudit.targetId, input.userId),
        inArray(operationAudit.action, ["membership.pause", "membership.resume", "membership.pause_closed"])))
      .orderBy(asc(operationAudit.createdAt));
    const pauseHistory = summarizePauseEvents(pauseEvents, now);
    let nextStatus = membership.status;
    let endsAt = membership.endsAt;
    let cancelBookings = false;

    if (input.action === "schedule_cancel") {
      if (!["active", "trial", "scheduled", "scheduled_cancellation"].includes(membership.status) || endsAt <= now)
        throw new BookingError(409, "Only a current membership can be scheduled for end-of-term cancellation.");
      nextStatus = "scheduled_cancellation";
    } else if (input.action === "cancel_now") {
      if (["cancelled", "expired", "terminated"].includes(status))
        throw new BookingError(409, "This membership is already ended.");
      nextStatus = "cancelled";
      cancelBookings = true;
    } else if (input.action === "reactivate") {
      if (!["scheduled_cancellation", "cancelled", "suspended"].includes(membership.status) || endsAt <= now)
        throw new BookingError(409, "Only an unexpired cancelled or suspended membership can be reactivated.");
      nextStatus = membership.source === "trial" ? "trial" : "active";
    } else if (input.action === "pause") {
      const allowance = membership.rules.planTerms?.pauseAllowanceDays ?? 0;
      if (!["active", "trial"].includes(membership.status) || endsAt <= now || pauseHistory.pausedAt)
        throw new BookingError(409, "Only a current active membership can be paused.");
      if (allowance * 86400000 <= pauseHistory.usedMs)
        throw new BookingError(409, "This plan has no remaining pause allowance.");
      nextStatus = "paused";
      cancelBookings = true;
    } else if (input.action === "resume") {
      if (membership.status !== "paused" || !pauseHistory.pausedAt)
        throw new BookingError(409, "This membership is not paused.");
      const allowance = membership.rules.planTerms?.pauseAllowanceDays ?? 0;
      const elapsedMs = Math.max(0, now.getTime() - pauseHistory.pausedAt.getTime());
      const remainingMs = Math.max(0, allowance * 86400000 - pauseHistory.usedMs);
      const extensionMs = Math.min(elapsedMs, remainingMs);
      endsAt = new Date(endsAt.getTime() + extensionMs);
      nextStatus = endsAt <= now ? "expired" : membership.source === "trial" ? "trial" : "active";
    } else if (input.action === "suspend") {
      if (!["active", "trial", "scheduled", "scheduled_cancellation"].includes(membership.status) || endsAt <= now)
        throw new BookingError(409, "Only a current membership can be suspended.");
      nextStatus = "suspended";
      cancelBookings = true;
    } else {
      if (["cancelled", "expired", "terminated"].includes(status))
        throw new BookingError(409, "This membership is already ended.");
      nextStatus = "terminated";
      cancelBookings = true;
    }

    await tx.update(memberships).set({ status: nextStatus, endsAt })
      .where(and(eq(memberships.userId, input.userId), eq(memberships.scope, "live")));

    let cancelledOfferingIds: string[] = [];
    if (cancelBookings) {
      const held = await tx.select({ offeringId: reservations.offeringId })
        .from(reservations).innerJoin(offerings, eq(reservations.offeringId, offerings.id))
        .where(and(
          eq(reservations.userId, input.userId), eq(offerings.scope, "live"),
          gt(offerings.startsAt, now), inArray(reservations.status, ["reserved", "requested"]),
        ));
      cancelledOfferingIds = [...new Set(held.map(row => row.offeringId))];
      if (cancelledOfferingIds.length) {
        await tx.update(reservations).set({ status: "cancelled", cancelledAt: now })
          .where(and(eq(reservations.userId, input.userId),
            inArray(reservations.offeringId, cancelledOfferingIds),
            inArray(reservations.status, ["reserved", "requested"])));
      }
    }
    await audit(tx, res.locals.operator.userId, `membership.${input.action}`, input.userId, input.reason);
    if (pauseHistory.pausedAt && ["cancel_now", "terminate"].includes(input.action))
      await audit(tx, res.locals.operator.userId, "membership.pause_closed", input.userId, "Pause closed by membership status change.");
    return cancelledOfferingIds;
  });
  for (const offeringId of result) await processWaitlistQueue(now, [offeringId]);
  if (result.length) void sendMemberNotification(input.userId, "booking_cancelled");
  res.json({ ok: true });
});
router.post("/revoke", async (req, res) => {
  admin(res, "finance");
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
  admin(res, "finance");
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
