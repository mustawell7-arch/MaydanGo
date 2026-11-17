import { Router } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { z } from "zod";
import { db, memberships, memberProfiles, offerings, reservations, partners, waitlistEntries } from "@workspace/db";
import { eq, and, inArray, sql, gt, asc, isNull, ne, or } from "drizzle-orm";
import {
  CreateMemberPrivacyRequestBody,
  CreateMemberPrivacyRequestResponse,
  GetMemberAccountSummaryResponse,
  GetMemberConsentsResponse,
  GetMemberAllowancesResponse,
  GetMemberPrivacyRequestsResponse,
  SaveMemberConsentsBody,
  SaveMemberConsentsResponse,
  GetMemberReferralsResponse,
  AttributeMemberReferralBody,
  AttributeMemberReferralResponse,
} from "@workspace/api-zod";
import {
  BookingError, memberState, memberAccountSummary, createReservation, cancelReservation,
  acceptWaitlistOffer, joinWaitlist, leaveWaitlist,
} from "../lib/reservations";
import { getMemberAllowances } from "../lib/member-allowances";
import {
  ActivePrivacyRequestError,
  createMemberPrivacyRequest,
  getMemberPrivacyExportAccess,
  listMemberPrivacyRequests,
  recordMemberPrivacyExportDownload,
} from "../lib/privacy-requests";
import { createMemberDataExport } from "../lib/member-data-export";
import {
  getMemberConsentState,
  hasCurrentRequiredMemberConsent,
  MEMBER_CONSENT_REQUIRED_CODE,
  MEMBER_CONSENT_REQUIRED_MESSAGE,
  saveMemberConsentChoices,
  RequiredMemberConsentError,
  StaleMemberConsentPolicyError,
} from "../lib/member-consents";
import learningRouter from "./learning";
import { memberSupportRouter } from "./support";
import memberReviewsRouter from "./member-reviews";
import { sendMemberNotification } from "../lib/notifications";
import { filterSuspendedOfferings, isAccessSuspended } from "../lib/account-access-restrictions";
import { PaymentError } from "../lib/payment-config";
import { cancelMemberSubscription, createMemberCheckout, listMemberPlans, memberSubscription } from "../lib/payments-paytabs";
import {
  ExistingMemberReferralError,
  getMemberReferralSummary,
  InvalidMemberReferralCodeError,
  recordMemberReferralAttribution,
  SelfMemberReferralError,
} from "../lib/member-referrals";
import {
  cancelMemberDeviceChange, DeviceSecurityError, getMemberDeviceStatus,
  readMemberDeviceToken, requirePrimaryMemberDevice,
} from "../lib/member-device-security";

const router = Router();
router.use((req, res, next) => {
  if (!getAuth(req).userId) { res.status(401).json({ message: "Sign in to manage your bookings." }); return; }
  next();
});
async function ensureCurrentMemberConsent(req: import("express").Request, res: import("express").Response) {
  if (await hasCurrentRequiredMemberConsent(getAuth(req).userId!)) return true;
  res.status(403).json({
    code: MEMBER_CONSENT_REQUIRED_CODE,
    message: MEMBER_CONSENT_REQUIRED_MESSAGE,
  });
  return false;
}
router.get("/account", async (req, res): Promise<void> => {
  if (!await ensureCurrentMemberConsent(req, res)) return;
  const userId = getAuth(req).userId!;
  const [summary, accessRestricted] = await Promise.all([
    memberAccountSummary(userId),
    isAccessSuspended("member", userId),
  ]);
  const asIso = (value: Date | string | null) => value instanceof Date ? value.toISOString() : value;
  res.json(GetMemberAccountSummaryResponse.parse({
    ...summary,
    memberships: summary.memberships.map(membership => ({
      ...membership,
      endsAt: asIso(membership.endsAt),
    })),
    bookings: summary.bookings.map(booking => ({
      ...booking,
      cancellationDeadline: asIso(booking.cancellationDeadline),
      startsAt: asIso(booking.startsAt),
      createdAt: asIso(booking.createdAt),
      cancelledAt: asIso(booking.cancelledAt),
    })),
    accessRestricted,
  }));
});
router.get("/allowances", async (req, res) => {
  if (!await ensureCurrentMemberConsent(req, res)) return;
  res.json(GetMemberAllowancesResponse.parse(await getMemberAllowances(getAuth(req).userId!)));
});
router.get("/consents", async (req, res) => {
  const state = await getMemberConsentState(getAuth(req).userId!);
  res.json(GetMemberConsentsResponse.parse(state));
});
router.post("/consents", async (req, res) => {
  const parsed = SaveMemberConsentsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  try {
    const state = await saveMemberConsentChoices(getAuth(req).userId!, parsed.data);
    res.json(SaveMemberConsentsResponse.parse(state));
  } catch (error) {
    if (error instanceof RequiredMemberConsentError) {
      res.status(400).json({ message: error.message });
      return;
    }
    if (error instanceof StaleMemberConsentPolicyError) {
      res.status(409).json({ code: "POLICY_VERSION_CHANGED", message: error.message });
      return;
    }
    throw error;
  }
});
router.get("/referrals", async (req, res) => {
  if (!await ensureCurrentMemberConsent(req, res)) return;
  res.json(GetMemberReferralsResponse.parse(
    await getMemberReferralSummary(getAuth(req).userId!),
  ));
});
router.post("/referrals/attribute", async (req, res) => {
  if (!await ensureCurrentMemberConsent(req, res)) return;
  const parsed = AttributeMemberReferralBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a valid MaydanGo referral code." });
    return;
  }

  const userId = getAuth(req).userId!;
  const user = await clerkClient.users.getUser(userId);
  const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
  if (primaryEmail?.verification?.status !== "verified") {
    res.status(403).json({ message: "Verify your account email before applying a referral code." });
    return;
  }

  try {
    await recordMemberReferralAttribution(userId, parsed.data.code);
    res.status(201).json(AttributeMemberReferralResponse.parse({ attributed: true }));
  } catch (error) {
    if (error instanceof InvalidMemberReferralCodeError) {
      res.status(400).json({ message: error.message });
      return;
    }
    if (error instanceof SelfMemberReferralError) {
      res.status(400).json({ message: error.message });
      return;
    }
    if (error instanceof ExistingMemberReferralError) {
      res.status(409).json({ message: error.message });
      return;
    }
    throw error;
  }
});
router.get("/privacy-requests", async (req, res) => {
  const ownerId = getAuth(req).userId!;
  res.json(GetMemberPrivacyRequestsResponse.parse(await listMemberPrivacyRequests(ownerId)));
});
router.get("/privacy-requests/:id/export", async (req, res) => {
  const ownerId = getAuth(req).userId!;
  const requestId = String(req.params.id);
  const access = await getMemberPrivacyExportAccess(ownerId, requestId);
  if (!access) {
    res.status(404).json({ message: "Privacy request not found." });
    return;
  }
  if (!access.exportAvailableUntil || access.exportAvailableUntil.getTime() <= Date.now()) {
    res.status(410).json({ message: "This data export is not ready or its download window has expired." });
    return;
  }
  const exportData = await createMemberDataExport(ownerId);
  await recordMemberPrivacyExportDownload(ownerId, requestId);
  req.log.info({ formatVersion: exportData.formatVersion }, "Member data export generated");
  res.set({
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": 'attachment; filename="MaydanGo-account-data.json"',
  });
  res.json(exportData);
});
router.post("/privacy-requests", async (req, res) => {
  const parsed = CreateMemberPrivacyRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a valid privacy request type and language." });
    return;
  }
  const ownerId = getAuth(req).userId!;
  try {
    const request = await createMemberPrivacyRequest(ownerId, parsed.data.kind, parsed.data.language);
    res.status(201).json(CreateMemberPrivacyRequestResponse.parse(request));
  } catch (error) {
    if (error instanceof ActivePrivacyRequestError) {
      res.status(409).json({ message: "You already have an active privacy request. Use its support conversation to follow up." });
      return;
    }
    throw error;
  }
});
router.get("/device", async (req, res) => {
  const token = readMemberDeviceToken(req);
  if (!token) { res.status(403).json({ code: "DEVICE_REGISTRATION_REQUIRED", message: "Secure device registration is required." }); return; }
  res.json(await getMemberDeviceStatus(getAuth(req).userId!, token));
});
router.post("/device", async (req, res) => {
  const parsed = z.object({ platform: z.enum(["ios", "android"]) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Choose a supported device platform." }); return; }
  const token = readMemberDeviceToken(req);
  if (!token) { res.status(403).json({ code: "DEVICE_REGISTRATION_REQUIRED", message: "Secure device registration is required." }); return; }
  res.json(await getMemberDeviceStatus(getAuth(req).userId!, token, parsed.data.platform));
});
router.delete("/device/change", async (req, res) => {
  const token = readMemberDeviceToken(req);
  if (!token) { res.status(403).json({ code: "DEVICE_REGISTRATION_REQUIRED", message: "Secure device registration is required." }); return; }
  res.json(await cancelMemberDeviceChange(getAuth(req).userId!, token));
});
router.use(requirePrimaryMemberDevice);
router.use(learningRouter);
router.use(memberSupportRouter);
router.use(memberReviewsRouter);
router.get("/", async (req, res) => {
  if (!await ensureCurrentMemberConsent(req, res)) return;
  res.json(await memberState(getAuth(req).userId!));
});
router.get("/plans", async (_req, res) => { res.json(await listMemberPlans()); });
router.post("/checkout", async (req, res) => {
  const parsed = z.object({ planId: z.string().uuid() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Choose a valid membership plan." }); return; }
  const userId = getAuth(req).userId!;
  if (await isAccessSuspended("member", userId)) {
    res.status(403).json({ message: "This account is temporarily restricted from starting a membership. Contact MaydanGo support." });
    return;
  }
  res.json(await createMemberCheckout(userId, parsed.data.planId));
});
router.get("/subscription", async (req, res) => {
  res.json(await memberSubscription(getAuth(req).userId!));
});
router.post("/subscription/cancel", async (req, res) => {
  if (req.body && Object.keys(req.body).length) { res.status(400).json({ message: "No cancellation details are accepted from the app." }); return; }
  res.json(await cancelMemberSubscription(getAuth(req).userId!));
});
router.get("/live-catalog", async (_req, res) => {
  const now = new Date();
  const rows = await db.select({ offering: offerings, partnerName: partners.name,
    reserved: sql<number>`count(${reservations.id})::int`,
  }).from(offerings).innerJoin(partners, eq(offerings.partnerId, partners.id))
    .leftJoin(reservations, and(eq(reservations.offeringId, offerings.id), inArray(reservations.status, ["reserved", "requested"])))
    .where(and(
      eq(offerings.scope, "live"), eq(offerings.active, true), isNull(offerings.cancelledAt),
      eq(partners.approved, true), gt(offerings.startsAt, now),
      or(ne(offerings.kind, "event"), eq(offerings.additionalPayment, false)),
    ))
    .groupBy(offerings.id, partners.id).orderBy(asc(offerings.startsAt));
  const activeOffers = await db.select({
    offeringId: waitlistEntries.offeringId,
    count: sql<number>`count(*)::int`,
  }).from(waitlistEntries)
    .where(and(eq(waitlistEntries.status, "offered"), gt(waitlistEntries.offerExpiresAt, now)))
    .groupBy(waitlistEntries.offeringId);
  const offeredByClass = new Map(activeOffers.map(row => [row.offeringId, Number(row.count)]));
  const visibleOfferings = await filterSuspendedOfferings(rows.map(({ offering }) => offering));
  const visibleIds = new Set(visibleOfferings.map(offering => offering.id));
  res.json(rows.filter(({ offering }) => visibleIds.has(offering.id)).map(({ offering: o, partnerName, reserved }) => ({
    id: o.id, targetId: o.targetId, slot: o.slot, scope: o.scope,
    partnerId: o.partnerId, partnerName, title: o.title,
    localizedTitle: o.localizedTitle, localizedDescription: o.localizedDescription,
    kind: o.kind, city: o.city, facility: o.facility, category: o.category, accessType: o.accessType,
    tiers: o.tiers, startsAt: o.startsAt, endsAt: o.endsAt, cancellationDeadline: o.cancellationDeadline,
     capacity: o.capacity, waitlistOfferMinutes: o.waitlistOfferMinutes, gender: o.gender, minAge: o.minAge, maxAge: o.maxAge,
    additionalPayment: o.additionalPayment, active: o.active, cancelledAt: o.cancelledAt,
    remaining: Math.max(0, o.capacity - reserved - (offeredByClass.get(o.id) ?? 0)),
  })));
});
router.put("/profile", async (req, res) => {
  const parsed = z.object({
    gender: z.enum(["female", "male", "unspecified"]),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d => {
      const dt = new Date(d);
      return !isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d && dt < new Date() && dt.getUTCFullYear() >= 1900;
    }),
  }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Enter a valid birth date (YYYY-MM-DD) and gender." }); return; }
  await db.insert(memberProfiles).values({ userId: getAuth(req).userId!, ...parsed.data })
    .onConflictDoUpdate({ target: memberProfiles.userId, set: parsed.data });
  res.json(await memberState(getAuth(req).userId!));
});
router.get("/catalog", async (_req, res) => {
  const rows = await db.select({
    id: offerings.id, kind: offerings.kind, targetId: offerings.targetId, slot: offerings.slot,
    title: offerings.title, startsAt: offerings.startsAt, cancellationDeadline: offerings.cancellationDeadline,
    instructions: offerings.instructions, imagePath: offerings.imagePath,
    bookingCutoffMinutes: offerings.bookingCutoffMinutes,
    scope: offerings.scope, capacity: offerings.capacity,
    reserved: sql<number>`count(${reservations.id})::int`,
  }).from(offerings).leftJoin(reservations, and(eq(reservations.offeringId, offerings.id), inArray(reservations.status, ["reserved", "requested"])))
    .where(and(eq(offerings.active, true), eq(offerings.scope, "preview"))).groupBy(offerings.id);
  res.json(rows.map(({ imagePath, ...r }) => ({
    ...r,
    imageUrl: imagePath ? `/api/public/offerings/${r.id}/image` : null,
    remaining: Math.max(0, r.capacity - r.reserved),
  })));
});
router.post("/preview-membership", async (req, res) => {
  if (req.body?.acknowledgeSampleData !== true) { res.status(400).json({ message: "Acknowledge that preview partners and bookings are not live." }); return; }
  if (await isAccessSuspended("member", getAuth(req).userId!)) {
    res.status(403).json({ message: "This account is temporarily restricted from starting new access. Contact MaydanGo support." });
    return;
  }
  // Explicit opt-in, isolated scope. Never upgrades or modifies a real membership.
  const now = new Date();
  await db.insert(memberships).values({
    userId: getAuth(req).userId!, scope: "preview", status: "trial", paymentStatus: "paid", tier: "M",
    startsAt: now, endsAt: new Date(now.getTime() + 30 * 86400000),
    rules: { quota: 8, dailyLimit: 3 },
  }).onConflictDoNothing();
  res.json(await memberState(getAuth(req).userId!));
});
router.post("/bookings", async (req, res) => {
  const parsed = z.object({ kind: z.enum(["session", "event", "coach"]), targetId: z.string().min(1).max(100), slot: z.string().max(100).default("") }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid booking request." }); return; }
  const ownerId = getAuth(req).userId!;
  const reservation = await createReservation(ownerId, parsed.data);
  const [offering] = await db.select({ scope: offerings.scope }).from(offerings)
    .where(eq(offerings.id, reservation.offeringId)).limit(1);
  if (offering?.scope === "live") void sendMemberNotification(ownerId, "booking_created");
  res.status(201).json(await memberState(getAuth(req).userId!));
});
router.delete("/bookings/:id", async (req, res) => {
  const ownerId = getAuth(req).userId!;
  const [offering] = await db.select({ scope: offerings.scope }).from(reservations)
    .innerJoin(offerings, eq(reservations.offeringId, offerings.id))
    .where(and(eq(reservations.id, String(req.params.id)), eq(reservations.userId, ownerId))).limit(1);
  const cancelled = await cancelReservation(ownerId, String(req.params.id));
  if (cancelled && offering?.scope === "live") void sendMemberNotification(ownerId, "booking_cancelled");
  res.json(await memberState(getAuth(req).userId!));
});
router.post("/offerings/:id/waitlist", async (req, res) => {
  await joinWaitlist(getAuth(req).userId!, String(req.params.id));
  res.json(await memberState(getAuth(req).userId!));
});
router.delete("/waitlist/:id", async (req, res) => {
  await leaveWaitlist(getAuth(req).userId!, String(req.params.id));
  res.json(await memberState(getAuth(req).userId!));
});
router.post("/waitlist/:id/accept", async (req, res) => {
  await acceptWaitlistOffer(getAuth(req).userId!, String(req.params.id));
  res.json(await memberState(getAuth(req).userId!));
});
router.use((error: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof BookingError) {
    res.status(error.status).json({ ...(error.code ? { code: error.code } : {}), message: error.message });
    return;
  }
  if (error instanceof PaymentError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof DeviceSecurityError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
  next(error);
});
export default router;
