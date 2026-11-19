import { Router } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ACTIVE_RESERVATION_STATUSES, db, memberships, memberProfilePhotos, memberProfiles, offerings, reservations, partners, waitlistEntries, checkinPolicies } from "@workspace/db";
import { eq, and, inArray, sql, gt, asc, isNull, ne, or } from "drizzle-orm";
import { buildMemberProfileUpsert } from "../lib/member-profile";
import { getOfferingBookingModel } from "../lib/booking-model";
import { ageOnDate } from "../lib/age";
import {
  CompleteMemberProfilePhotoUploadBody,
  CompleteMemberProfilePhotoUploadResponse,
  CreateMemberPrivacyRequestBody,
  CreateMemberPrivacyRequestResponse,
  GetMemberAccountSummaryResponse,
  GetMemberConsentsResponse,
  GetMemberAllowancesResponse,
  GetMemberProfilePhotoResponse,
  GetMemberPrivacyRequestsResponse,
  SaveMemberConsentsBody,
  SaveMemberConsentsResponse,
  GetMemberReferralsResponse,
  AttributeMemberReferralBody,
  AttributeMemberReferralResponse,
  RequestMemberProfilePhotoUploadUrlBody,
  RequestMemberProfilePhotoUploadUrlResponse,
  DeleteMemberProfilePhotoResponse,
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
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
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
const memberProfilePhotoStorage = new ObjectStorageService();
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
      checkedInAt: asIso(booking.checkedInAt),
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
router.get("/profile-photo/file", async (req, res): Promise<void> => {
  const [photo] = await db.select().from(memberProfilePhotos)
    .where(eq(memberProfilePhotos.userId, getAuth(req).userId!)).limit(1);
  if (!photo?.objectPath) {
    res.status(404).end();
    return;
  }
  let file;
  try {
    file = await memberProfilePhotoStorage.getPrivateFile(photo.objectPath);
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) throw error;
    res.status(404).end();
    return;
  }
  const [metadata] = await file.getMetadata();
  const contentType = String(metadata.contentType ?? "");
  const size = Number(metadata.size ?? 0);
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)
    || size < 1 || size > 5_000_000) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  file.createReadStream().on("error", error => {
    req.log.error({ err: error }, "Failed to stream member profile photo");
    if (!res.headersSent) res.status(404).end();
    else res.end();
  }).pipe(res);
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
const profilePhotoExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
const memberProfilePhotoConsentVersion = "member-photo-v1";
const memberProfilePhotoMaxBytes = 5_000_000;
function memberProfilePhotoPath(photo: typeof memberProfilePhotos.$inferSelect | undefined) {
  return photo?.objectPath
    ? `/api/member/profile-photo/file?v=${photo.updatedAt.getTime()}`
    : null;
}
router.get("/profile-photo", async (req, res): Promise<void> => {
  const [photo] = await db.select().from(memberProfilePhotos)
    .where(eq(memberProfilePhotos.userId, getAuth(req).userId!)).limit(1);
  res.json(GetMemberProfilePhotoResponse.parse({
    photoPath: memberProfilePhotoPath(photo),
    consentVersion: photo?.consentVersion ?? null,
    consentAt: photo?.consentAt ?? null,
  }));
});
router.post("/profile-photo/upload-url", async (req, res): Promise<void> => {
  if (!await ensureCurrentMemberConsent(req, res)) return;
  const parsed = RequestMemberProfilePhotoUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Confirm photo consent and choose a JPEG, PNG, or WebP image up to 5 MB." });
    return;
  }
  const userId = getAuth(req).userId!;
  const uploadId = randomUUID();
  const { uploadURL } = await memberProfilePhotoStorage.createMemberProfilePhotoUpload(
    userId, uploadId, profilePhotoExtensions[parsed.data.contentType],
  );
  res.json(RequestMemberProfilePhotoUploadUrlResponse.parse({
    uploadId,
    uploadUrl: uploadURL,
    contentType: parsed.data.contentType,
  }));
});
router.post("/profile-photo/complete", async (req, res): Promise<void> => {
  if (!await ensureCurrentMemberConsent(req, res)) return;
  const parsed = CompleteMemberProfilePhotoUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Confirm photo consent and provide the requested image upload." });
    return;
  }
  const userId = getAuth(req).userId!;
  const extension = profilePhotoExtensions[parsed.data.contentType];
  const stagingPath = memberProfilePhotoStorage.getMemberProfilePhotoUploadPath(
    userId, parsed.data.uploadId, extension,
  );
  let file;
  try {
    file = await memberProfilePhotoStorage.getPrivateFile(stagingPath);
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) throw error;
    res.status(400).json({ message: "The uploaded photo was not found. Please choose it again." });
    return;
  }
  const [metadata] = await file.getMetadata();
  const actualType = String(metadata.contentType ?? "");
  const actualSize = Number(metadata.size ?? 0);
  if (actualType !== parsed.data.contentType || actualSize !== parsed.data.sizeBytes
    || actualSize < 1 || actualSize > memberProfilePhotoMaxBytes) {
    try { await memberProfilePhotoStorage.deletePrivateFile(stagingPath); } catch (error) {
      req.log.warn({ err: error }, "Could not remove rejected member profile photo upload");
    }
    res.status(400).json({ message: "The uploaded photo type or size did not match. Please choose it again." });
    return;
  }

  const objectPath = await memberProfilePhotoStorage.promoteMemberProfilePhotoUpload(
    userId, parsed.data.uploadId, extension,
  );
  const [previous] = await db.select().from(memberProfilePhotos)
    .where(eq(memberProfilePhotos.userId, userId)).limit(1);
  const consentAt = new Date();
  let saved: typeof memberProfilePhotos.$inferSelect | undefined;
  try {
    [saved] = await db.insert(memberProfilePhotos).values({
      userId, objectPath, consentVersion: memberProfilePhotoConsentVersion, consentAt, updatedAt: consentAt,
    }).onConflictDoUpdate({
      target: memberProfilePhotos.userId,
      set: { objectPath, consentVersion: memberProfilePhotoConsentVersion, consentAt, updatedAt: consentAt },
    }).returning();
  } catch (error) {
    try { await memberProfilePhotoStorage.deletePrivateFile(objectPath); } catch (cleanupError) {
      req.log.warn({ err: cleanupError }, "Could not clean up a failed member profile photo save");
    }
    throw error;
  }
  if (!saved) {
    await memberProfilePhotoStorage.deletePrivateFile(objectPath);
    res.status(500).json({ message: "The photo could not be saved. Please try again." });
    return;
  }
  if (previous?.objectPath && previous.objectPath !== objectPath) {
    try { await memberProfilePhotoStorage.deletePrivateFile(previous.objectPath); } catch (error) {
      req.log.warn({ err: error }, "Could not remove replaced member profile photo");
    }
  }
  res.json(CompleteMemberProfilePhotoUploadResponse.parse({
    photoPath: memberProfilePhotoPath(saved),
    consentVersion: saved.consentVersion,
    consentAt: saved.consentAt,
  }));
});
router.delete("/profile-photo", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const [previous] = await db.select().from(memberProfilePhotos)
    .where(eq(memberProfilePhotos.userId, userId)).limit(1);
  if (previous?.objectPath) {
    await db.update(memberProfilePhotos).set({
      objectPath: null,
      updatedAt: new Date(),
    }).where(eq(memberProfilePhotos.userId, userId));
    try { await memberProfilePhotoStorage.deletePrivateFile(previous.objectPath); } catch (error) {
      req.log.warn({ err: error }, "Could not remove deleted member profile photo file");
    }
  }
  res.json(DeleteMemberProfilePhotoResponse.parse({
    photoPath: null,
    consentVersion: previous?.consentVersion ?? null,
    consentAt: previous?.consentAt ?? null,
  }));
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
    checkinPolicyId: checkinPolicies.offeringId,
    checkinOpensAt: checkinPolicies.opensAt,
    checkinClosesAt: checkinPolicies.closesAt,
    reserved: sql<number>`count(${reservations.id})::int`,
    resourceBusy: sql<boolean>`exists (
      select 1 from reservations resource_reservation
      join booking_offerings resource_offering on resource_offering.id = resource_reservation.offering_id
      where resource_reservation.status in ('reserved', 'requested', 'confirmed')
        and resource_offering.booking_model = 'resource_booking'
        and resource_offering.scope = ${offerings.scope}
        and resource_offering.active = true
        and resource_offering.cancelled_at is null
        and resource_offering.partner_id = ${offerings.partnerId}
        and lower(btrim(resource_offering.city)) = lower(btrim(${offerings.city}))
        and lower(btrim(resource_offering.facility)) = lower(btrim(${offerings.facility}))
        and lower(btrim(coalesce(resource_offering.resource_name->>'en', ''))) = lower(btrim(coalesce(${offerings.resourceName}->>'en', '')))
        and resource_offering.id <> ${offerings.id}
        and resource_offering.starts_at < ${offerings.endsAt}
        and resource_offering.ends_at > ${offerings.startsAt}
    )`,
  }).from(offerings).innerJoin(partners, eq(offerings.partnerId, partners.id))
    .leftJoin(reservations, and(eq(reservations.offeringId, offerings.id), inArray(reservations.status, ACTIVE_RESERVATION_STATUSES)))
    .leftJoin(checkinPolicies, eq(checkinPolicies.offeringId, offerings.id))
    .where(and(
      eq(offerings.scope, "live"), eq(offerings.active, true), isNull(offerings.cancelledAt),
      eq(partners.approved, true), or(
        gt(offerings.startsAt, now),
        and(eq(offerings.bookingModel, "open_access"), gt(offerings.endsAt, now)),
      ),
      or(ne(offerings.kind, "event"), eq(offerings.additionalPayment, false)),
    ))
    .groupBy(offerings.id, partners.id, checkinPolicies.offeringId, checkinPolicies.opensAt, checkinPolicies.closesAt).orderBy(asc(offerings.startsAt));
  const activeOffers = await db.select({
    offeringId: waitlistEntries.offeringId,
    count: sql<number>`count(*)::int`,
  }).from(waitlistEntries)
    .where(and(eq(waitlistEntries.status, "offered"), gt(waitlistEntries.offerExpiresAt, now)))
    .groupBy(waitlistEntries.offeringId);
  const offeredByClass = new Map(activeOffers.map(row => [row.offeringId, Number(row.count)]));
  const visibleOfferings = await filterSuspendedOfferings(rows.map(({ offering }) => offering));
  const visibleIds = new Set(visibleOfferings.map(offering => offering.id));
  res.json(rows.filter(({ offering }) => visibleIds.has(offering.id)).map(({ offering: o, partnerName, reserved, resourceBusy, checkinPolicyId, checkinOpensAt, checkinClosesAt }) => ({
    id: o.id, targetId: o.targetId, slot: o.slot, scope: o.scope,
    partnerId: o.partnerId, partnerName, title: o.title,
      localizedTitle: o.localizedTitle, localizedDescription: o.localizedDescription,
      localizedInstructor: o.localizedInstructor, difficultyLevel: o.difficultyLevel,
      requiredEquipment: o.requiredEquipment, instructions: o.instructions,
      healthSafetyInstructions: o.healthSafetyInstructions, accessibilityInformation: o.accessibilityInformation,
      resourceName: o.resourceName,
     kind: o.kind, city: o.city, facility: o.facility, category: o.category, accessType: o.accessType,
     bookingModel: getOfferingBookingModel(o), walkInReady: !!checkinPolicyId,
     walkInOpensAt: checkinOpensAt?.toISOString() ?? null, walkInClosesAt: checkinClosesAt?.toISOString() ?? null,
      checkinOpensAt: checkinOpensAt?.toISOString() ?? null, checkinClosesAt: checkinClosesAt?.toISOString() ?? null,
     environment: o.environment,
    tiers: o.tiers, startsAt: o.startsAt, endsAt: o.endsAt, cancellationDeadline: o.cancellationDeadline,
     capacity: o.capacity, waitlistOfferMinutes: o.waitlistOfferMinutes, gender: o.gender, minAge: o.minAge, maxAge: o.maxAge,
    additionalPayment: o.additionalPayment, active: o.active, cancelledAt: o.cancelledAt,
     remaining: resourceBusy ? 0 : Math.max(0, o.capacity - reserved - (offeredByClass.get(o.id) ?? 0)),
  })));
});
router.put("/profile", async (req, res) => {
  const parsed = z.object({
    gender: z.enum(["female", "male", "unspecified"]).optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d => {
      return new Date(d).getUTCFullYear() >= 1900 && ageOnDate(d, new Date()) !== null;
    }),
  }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Enter a valid birth date (YYYY-MM-DD) and optional gender selection." }); return; }
  const userId = getAuth(req).userId!;
  const upsert = buildMemberProfileUpsert(parsed.data);
  await db.insert(memberProfiles).values({ userId, ...upsert.insert })
    .onConflictDoUpdate({ target: memberProfiles.userId, set: upsert.update });
  res.json(await memberState(userId));
});
router.get("/catalog", async (_req, res) => {
  const rows = await db.select({
    id: offerings.id, kind: offerings.kind, targetId: offerings.targetId, slot: offerings.slot,
    title: offerings.title, startsAt: offerings.startsAt, cancellationDeadline: offerings.cancellationDeadline,
    instructions: offerings.instructions, imagePath: offerings.imagePath,
    bookingCutoffMinutes: offerings.bookingCutoffMinutes,
    scope: offerings.scope, capacity: offerings.capacity,
    reserved: sql<number>`count(${reservations.id})::int`,
  }).from(offerings).leftJoin(reservations, and(eq(reservations.offeringId, offerings.id), inArray(reservations.status, ACTIVE_RESERVATION_STATUSES)))
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
