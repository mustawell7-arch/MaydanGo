import { Router } from "express";
import { getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, operators, partners, offerings, reservations, membershipPlans, memberships, accessGrants, operationAudit, attendance, attendanceEvents, learningCourses, learningLessons, waitlistEntries } from "@workspace/db";
import { BookingError } from "../lib/reservations";
import { offeringInput, partnerInput, planInput } from "../lib/operation-inputs";
import {
  AddLearningLessonBody, AddLearningLessonResponse, ChangeLiveOfferingBody,
  CreateLearningCourseBody, CreateLearningCourseResponse,
  UpdateLearningCourseBody, UpdateLearningCourseResponse,
} from "@workspace/api-zod";
import { sendMemberNotification } from "../lib/notifications";
import { promoteWaitlistForOffering } from "../lib/waitlist";

import { PaymentError } from "../lib/payment-config";

import { cancelPaidSubscriptionImmediately, requestFullRefund, validatePaidPlan } from "../lib/payments-paytabs";

const router = Router();
router.use(async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ message: "Sign in first." }); return; }
  const [operator] = await db.select().from(operators).where(eq(operators.userId, userId));
  if (!operator || !["admin", "partner"].includes(operator.role)) {
    res.status(403).json({ message: "Authorized staff access is required." }); return;
  }
  res.locals.operator = operator; next();
});
const admin = (res: import("express").Response) => {
  if (res.locals.operator.role !== "admin") throw new BookingError(403, "Administrator access is required.");
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
router.get("/", async (_req, res) => {
  const op = res.locals.operator;
  const isAdmin = op.role === "admin";
  const [partnerRows, offeringRows, plans, queueRows] = await Promise.all([
    db.select().from(partners).where(isAdmin ? undefined : eq(partners.id, op.partnerId ?? "")),
    db.select().from(offerings).where(and(eq(offerings.scope, "live"), isAdmin ? undefined : eq(offerings.partnerId, op.partnerId ?? ""))),
    isAdmin ? db.select().from(membershipPlans) : Promise.resolve([]),
    db.select({
      id: waitlistEntries.id, offeringId: waitlistEntries.offeringId, joinedAt: waitlistEntries.joinedAt,
      title: offerings.title, localizedTitle: offerings.localizedTitle, city: offerings.city, facility: offerings.facility,
      startsAt: offerings.startsAt,
    }).from(waitlistEntries).innerJoin(offerings, eq(waitlistEntries.offeringId, offerings.id))
      .where(and(eq(waitlistEntries.status, "waiting"), eq(offerings.scope, "live"), eq(offerings.active, true),
        isNull(offerings.cancelledAt), gt(offerings.startsAt, new Date()),
        isAdmin ? undefined : eq(offerings.partnerId, op.partnerId ?? "")))
      .orderBy(asc(offerings.startsAt), asc(waitlistEntries.joinedAt), asc(waitlistEntries.id)),
  ]);
  const queueCounts = new Map<string, number>();
  const waitlist = queueRows.map(row => {
    const position = (queueCounts.get(row.offeringId) ?? 0) + 1;
    queueCounts.set(row.offeringId, position);
    return { ...row, position };
  });
  res.json({ role: op.role, partnerId: op.partnerId,
    partners: partnerRows, offerings: offeringRows, waitlist,
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
router.post("/offerings", async (req, res) => {
  const data = offeringInput.parse(req.body);
  own(res, data.partnerId);
  const row = await db.transaction(async tx => {
    const [p] = await tx.select().from(partners).where(eq(partners.id, data.partnerId)).for("share");
    if (!p) throw new BookingError(404, "Partner not found.");
    if (data.active && !p.approved) throw new BookingError(403, "Partner approval is required before publishing.");
    const id = randomUUID();
    if (data.accessType === "live" && data.active) ensureHttps(data.joinUrl, "Live class join link");
    if (data.joinUrl) ensureHttps(data.joinUrl, "Live class join link");
    const [o] = await tx.insert(offerings).values({ ...data, id, targetId: id, slot: "", scope: "live",
      localizedTitle: data.localizedTitle ?? null, localizedDescription: data.localizedDescription ?? null, joinUrl: data.joinUrl ?? null,
      partnerGroup: p.groupId, startsAt: new Date(data.startsAt), endsAt: new Date(data.endsAt),
      cancellationDeadline: new Date(data.cancellationDeadline) }).returning();
    await audit(tx, res.locals.operator.userId, "offering.create", id);
    return o;
  });
  res.status(201).json(row);
});
router.patch("/offerings/:id", async (req, res) => {
  const data = ChangeLiveOfferingBody.parse(req.body);
  const { row, openSlots } = await db.transaction(async tx => {
    const [o] = await tx.select().from(offerings).where(and(eq(offerings.id, String(req.params.id)), eq(offerings.scope, "live"))).for("update");
    if (!o) throw new BookingError(404, "Offering not found.");
    own(res, o.partnerId);
    if (o.cancelledAt) throw new BookingError(409, "Cancelled offerings cannot be edited or republished. Create a replacement.");
    if (o.startsAt <= new Date()) throw new BookingError(409, "Past offerings cannot be edited.");
    const nextActive = data.active ?? o.active;
    const nextTitle = data.localizedTitle ?? o.localizedTitle;
    const nextDescription = data.localizedDescription ?? o.localizedDescription;
    const nextJoinUrl = data.joinUrl !== undefined ? data.joinUrl : o.joinUrl;
    if (o.accessType === "live" && nextActive) {
      if (!nextTitle || !nextDescription) throw new BookingError(400, "Live classes need English, Arabic and Sorani details.");
      ensureHttps(nextJoinUrl, "Live class join link");
    }
    if (data.joinUrl) ensureHttps(data.joinUrl, "Live class join link");
    if (data.active) {
      const [p] = await tx.select().from(partners).where(eq(partners.id, o.partnerId!)).for("share");
      if (!p?.approved) throw new BookingError(403, "Partner approval is required.");
    }
    const held = await tx.select().from(reservations).where(and(eq(reservations.offeringId, o.id), inArray(reservations.status, ["reserved", "requested"])));
    if (held.length > data.capacity) throw new BookingError(409, "Capacity cannot be below existing reservations.");
    const [result] = await tx.update(offerings).set({
      capacity: data.capacity,
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.localizedTitle !== undefined ? { localizedTitle: data.localizedTitle } : {}),
      ...(data.localizedDescription !== undefined ? { localizedDescription: data.localizedDescription } : {}),
      ...(data.joinUrl !== undefined ? { joinUrl: data.joinUrl } : {}),
    }).where(eq(offerings.id, o.id)).returning();
    await audit(tx, res.locals.operator.userId, "offering.update", o.id);
    return { row: result, openSlots: data.active === false ? 0 : Math.max(0, data.capacity - held.length) };
  });
  for (let index = 0; index < openSlots; index++) {
    if (!await promoteWaitlistForOffering(row.id)) break;
  }
  res.json(row);
});
router.post("/offerings/:id/cancel", async (req, res) => {
  const affected = await db.transaction(async tx => {
    const [o] = await tx.select().from(offerings).where(and(eq(offerings.id, String(req.params.id)), eq(offerings.scope, "live"))).for("update");
    if (!o) throw new BookingError(404, "Offering not found.");
    own(res, o.partnerId);
    if (o.cancelledAt) return { memberIds: [], waitlistUserIds: [] };
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
    const queued = await tx.select({ userId: waitlistEntries.userId }).from(waitlistEntries)
      .where(and(eq(waitlistEntries.offeringId, o.id), eq(waitlistEntries.status, "waiting")));
    await tx.update(waitlistEntries).set({
      status: "cancelled", reason: "The partner cancelled this class.", updatedAt: new Date(),
    }).where(and(eq(waitlistEntries.offeringId, o.id), eq(waitlistEntries.status, "waiting")));
    await audit(tx, res.locals.operator.userId, "offering.cancel", o.id);
    return { memberIds: heldReservations.map(r => r.userId), waitlistUserIds: queued.map(r => r.userId) };
  });
  for (const userId of new Set(affected.memberIds)) void sendMemberNotification(userId, "booking_cancelled");
  for (const userId of new Set(affected.waitlistUserIds)) void sendMemberNotification(userId, "waitlist_cancelled");
  res.json({ ok: true });
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
    const held = live.length ? await tx.select({ id: reservations.id, offeringId: reservations.offeringId }).from(reservations)
      .where(and(eq(reservations.userId, input.userId), inArray(reservations.offeringId, live.map(o => o.id)),
        inArray(reservations.status, ["reserved", "requested"]))) : [];
    if (live.length) await tx.update(reservations).set({ status: "cancelled", cancelledAt: new Date() })
      .where(and(eq(reservations.userId, input.userId), inArray(reservations.offeringId, live.map(o => o.id)), inArray(reservations.status, ["reserved", "requested"])));
    await audit(tx, res.locals.operator.userId, "membership.revoke", input.userId, input.reason);
    return held.map(row => row.offeringId);
  });
  for (const offeringId of cancelledOfferingIds) await promoteWaitlistForOffering(offeringId);
  if (cancelledOfferingIds.length || hadBookingsBeforeProviderCancel) void sendMemberNotification(input.userId, "booking_cancelled");
  res.json({ ok: true });
});
router.post("/refunds", async (req, res) => {
  admin(res);
  const input = z.object({
    userId: z.string().trim().min(1).max(160),
    reason: z.string().trim().min(5).max(500),
  }).strict().parse(req.body);
  const result = await requestFullRefund(input.userId, input.reason);
  await db.transaction(async tx => {
    await audit(tx, res.locals.operator.userId, "membership.refund", input.userId,
      `${result.status}: ${input.reason}`);
  });
  res.json(result);
});
router.use((error: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof z.ZodError) { res.status(400).json({ message: error.issues.map(i => i.message).join(" ") }); return; }
  if (error instanceof BookingError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof PaymentError) { res.status(error.status).json({ message: error.message }); return; }
  next(error);
});
export default router;
