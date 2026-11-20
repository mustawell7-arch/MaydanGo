import { z } from "zod";
import { getOfferingBookingModel } from "./booking-model";
import { sessionAudienceIssue, type SessionType } from "./session-audience";

const label = z.string().trim().min(1).max(160);
const quota = z.number().int().min(0).max(100000);
const limits = z.record(z.string().min(1).max(160), quota).optional();
const names = z.array(label).max(100).optional();
const localizedText = z.object({
  en: z.string().trim().min(1).max(240),
  ar: z.string().trim().min(1).max(240),
  ku: z.string().trim().min(1).max(240),
}).strict();
const localizedActivityDetail = z.object({
  en: z.string().trim().min(1).max(2000),
  ar: z.string().trim().min(1).max(2000),
  ku: z.string().trim().min(1).max(2000),
}).strict();
const secureUrl = z.string().trim().url().max(2048).refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}, "Use a verified HTTPS link.");
export const rulesInput = z.object({
  quota, dailyLimit: quota, quotaMode: z.enum(["shared", "separate"]),
  physicalQuota: quota, premiumQuota: quota, liveQuota: quota,
  cities: names, facilities: names, categories: names,
  facilityLimits: limits, categoryLimits: limits, partnerGroupLimits: limits,
  trialAllowedTypes: z.array(z.enum(["physical", "premium", "live"])).optional(),
  corporateId: label.optional(),
  planTerms: z.object({
    description: localizedText,
    trialPeriodDays: z.number().int().min(0).max(366),
    minimumContractMonths: z.number().int().min(0).max(120),
    renewalPeriodDays: z.number().int().min(1).max(366),
    cancellationPeriodDays: z.number().int().min(0).max(366),
    automaticRenewal: z.boolean(),
    pauseAllowanceDays: z.number().int().min(0).max(366),
    priceProtectionMonths: z.number().int().min(0).max(120),
    promotionalPriceIqd: z.number().int().min(0).max(1_000_000_000).nullable(),
    corporatePriceIqd: z.number().int().min(0).max(1_000_000_000).nullable(),
    digitalContentAccess: z.boolean(),
    guestPasses: z.number().int().min(0).max(10_000),
    eventAccess: z.boolean(),
    additionalPaymentAllowed: z.boolean(),
  }).strict().optional(),
}).strict();
export const planInput = z.object({
  name: label, tier: label, kind: z.enum(["paid", "trial", "corporate"]),
  durationDays: z.number().int().min(1).max(366), active: z.boolean(), rules: rulesInput,
  priceIqd: z.number().int().min(1).max(1_000_000_000).nullable(),
}).strict().superRefine((p, ctx) => {
  if (p.kind === "corporate" && !p.rules.corporateId)
    ctx.addIssue({ code: "custom", message: "Corporate plans require an organization ID." });
  if (p.kind === "trial" && !p.rules.trialAllowedTypes)
    ctx.addIssue({ code: "custom", message: "Trial plans require allowed activity types." });
  if (p.kind === "paid" && p.priceIqd === null)
    ctx.addIssue({ code: "custom", message: "Paid plans require a price in IQD." });
  if (p.kind !== "paid" && p.priceIqd !== null)
    ctx.addIssue({ code: "custom", message: "Only paid plans can have a payment price." });
  const promotionalPrice = p.rules.planTerms?.promotionalPriceIqd;
  if (promotionalPrice !== null && promotionalPrice !== undefined && p.priceIqd !== null && promotionalPrice > p.priceIqd)
    ctx.addIssue({ code: "custom", path: ["rules", "planTerms", "promotionalPriceIqd"], message: "Promotional price cannot exceed the monthly plan price." });
});
export const partnerInput = z.object({ name: label, groupId: label, ownerUserId: label }).strict();
const facilityHoursInput = z.array(z.object({
  day: z.number().int().min(0).max(6),
  closed: z.boolean(),
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
}).strict()).max(7).superRefine((hours, ctx) => {
  if (hours.length !== 0 && hours.length !== 7) {
    ctx.addIssue({ code: "custom", message: "Publish all seven days or leave hours unpublished." });
  }
  const days = new Set<number>();
  hours.forEach((hoursForDay, index) => {
    if (days.has(hoursForDay.day)) ctx.addIssue({ code: "custom", path: [index, "day"], message: "Each weekday must appear once." });
    days.add(hoursForDay.day);
    if (hoursForDay.closed ? hoursForDay.opensAt !== null || hoursForDay.closesAt !== null
      : hoursForDay.opensAt === null || hoursForDay.closesAt === null || hoursForDay.opensAt === hoursForDay.closesAt) {
      ctx.addIssue({ code: "custom", path: [index], message: "Closed days have no times; open days need different opening and closing times." });
    }
  });
});
const facilityLocalizedText = z.object({
  en: z.string().trim().min(1).max(500),
  ar: z.string().trim().min(1).max(500),
  ku: z.string().trim().min(1).max(500),
}).strict();
const facilityCalendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date.");
export const facilityHoursOverrideInput = z.object({
  startDate: facilityCalendarDate,
  endDate: facilityCalendarDate,
  closed: z.boolean(),
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  localizedReason: facilityLocalizedText,
}).strict().superRefine((value, ctx) => {
  const start = Date.parse(`${value.startDate}T00:00:00Z`);
  const end = Date.parse(`${value.endDate}T00:00:00Z`);
  if (end < start) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end date must not precede the start date." });
  } else if ((end - start) / 86_400_000 > 365) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "An hours override cannot exceed 366 calendar days." });
  }
  if (value.closed
    ? value.opensAt !== null || value.closesAt !== null
    : value.opensAt === null || value.closesAt === null || value.opensAt === value.closesAt) {
    ctx.addIssue({ code: "custom", message: "Closures have no times; special hours need different opening and closing times." });
  }
});
const facilityTextList = z.array(facilityLocalizedText).max(30);
const facilityWebsite = z.string().trim().url().max(2048).refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}, "Use an HTTPS website link.");
const facilityMediaUrl = z.string().trim().url().max(2048).refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}, "Use an HTTPS media link.");
const facilityProfileFieldsObject = z.object({
  city: label,
  facility: label,
  localizedName: facilityLocalizedText,
  localizedDistrict: facilityLocalizedText,
  localizedAddress: facilityLocalizedText,
  localizedDescription: facilityLocalizedText,
  activities: facilityTextList,
  amenities: facilityTextList,
  accessibility: facilityTextList,
  openingHours: facilityHoursInput,
  contactPhone: z.string().trim().max(40).nullable(),
  websiteUrl: facilityWebsite.nullable(),
  logoUrl: facilityMediaUrl.nullable().optional(),
  coverImageUrl: facilityMediaUrl.nullable().optional(),
  galleryImageUrls: z.array(facilityMediaUrl).max(12).optional(),
  promotionalVideoUrl: facilityMediaUrl.nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
}).strict();
const validateFacilityMedia = (
  profile: { galleryImageUrls?: string[] },
  ctx: z.RefinementCtx,
) => {
  const gallery = profile.galleryImageUrls ?? [];
  if (new Set(gallery).size !== gallery.length) {
    ctx.addIssue({ code: "custom", path: ["galleryImageUrls"], message: "Gallery image links must be unique." });
  }
};
const validateFacilityCoordinates = (
  profile: { latitude: number | null; longitude: number | null },
  ctx: z.RefinementCtx,
) => {
  if ((profile.latitude === null) !== (profile.longitude === null)) {
    ctx.addIssue({ code: "custom", message: "Latitude and longitude must be provided together." });
  }
};
export const facilityProfileFields = facilityProfileFieldsObject
  .superRefine(validateFacilityCoordinates)
  .superRefine(validateFacilityMedia);
export const createFacilityProfileInput = facilityProfileFieldsObject.extend({ partnerId: label })
  .strict().superRefine(validateFacilityCoordinates).superRefine(validateFacilityMedia);
export const offeringInput = z.object({
  partnerId: label, title: label, kind: z.enum(["session", "event", "coach"]),
  bookingModel: z.enum(["booking_required", "booking_request", "open_access", "resource_booking", "event", "live_class"]).optional(),
  resourceName: localizedText.nullable().optional(),
  localizedTitle: localizedText.nullable().optional(),
  localizedDescription: localizedText.nullable().optional(),
  sessionType: z.enum(["unspecified", "women_only", "men_only", "mixed", "family", "children", "private"]).default("mixed"),
  instructorGender: z.enum(["female", "male", "unspecified"]).nullable().optional(),
  familyRequirements: localizedActivityDetail.nullable().optional(),
  healthSafetyInstructions: localizedActivityDetail.nullable().optional(),
  accessibilityInformation: localizedActivityDetail.nullable().optional(),
  instructions: z.string().trim().max(2000).nullable().optional(),
  imagePath: z.string().trim().max(1000).nullable().optional(),
  bookingCutoffMinutes: z.number().int().min(0).max(10080).default(0),
  localizedInstructor: localizedText.nullable().optional(),
  difficultyLevel: z.enum(["all-levels", "beginner", "intermediate", "advanced"]).nullable().optional(),
  environment: z.enum(["indoor", "outdoor"]).nullable(),
  instructionLanguage: z.enum(["en", "ar", "ku", "mixed"]).nullable().optional(),
  requiredEquipment: localizedText.nullable().optional(),
  joinUrl: secureUrl.nullable().optional(),
  city: label, facility: label, category: label,
  accessType: z.enum(["physical", "premium", "live"]),
  tiers: z.array(label).min(1).max(30),
  startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
  cancellationDeadline: z.string().datetime({ offset: true }),
  capacity: z.number().int().min(1).max(100000),
  waitlistOfferMinutes: z.number().int().min(5).max(1440).default(30),
  gender: z.enum(["all", "female", "male"]).default("all"),
  minAge: z.number().int().min(0).max(120).default(0),
  maxAge: z.number().int().min(0).max(120).nullable().default(null),
  additionalPayment: z.boolean().default(false), active: z.boolean(),
}).strict().superRefine((o, ctx) => {
  const defaultBookingModel = getOfferingBookingModel({ ...o, bookingModel: undefined });
  const bookingModel = o.bookingModel ?? defaultBookingModel;
  if (bookingModel !== defaultBookingModel && bookingModel !== "open_access" && bookingModel !== "resource_booking") {
    ctx.addIssue({ code: "custom", path: ["bookingModel"], message: "The booking model must match the activity format." });
  }
  if (bookingModel === "open_access" && (
    o.kind !== "session" || o.accessType === "live" || o.additionalPayment || o.bookingCutoffMinutes !== 0
  )) {
    ctx.addIssue({
      code: "custom",
      path: ["bookingModel"],
      message: "Open access is for in-person sessions with no added payment or advance-booking cutoff.",
    });
  }
  if (bookingModel === "resource_booking" && (
    o.kind !== "session" || o.accessType === "live" || o.additionalPayment || o.capacity !== 1 || !o.resourceName
  )) {
    ctx.addIssue({
      code: "custom",
      path: ["resourceName"],
      message: "Resource bookings need a named in-person resource, one reservation per slot, and no added payment.",
    });
  }
  if (bookingModel !== "resource_booking" && o.resourceName != null) {
    ctx.addIssue({ code: "custom", path: ["resourceName"], message: "Only resource bookings can name a reserved resource." });
  }
  if (o.accessType === "live" && o.environment !== null) {
    ctx.addIssue({ code: "custom", path: ["environment"], message: "Live online classes do not use an indoor or outdoor setting." });
  }
  if (o.accessType !== "live" && o.environment === null) {
    ctx.addIssue({ code: "custom", path: ["environment"], message: "Choose whether this in-person activity is indoors or outdoors." });
  }
  const audienceIssue = sessionAudienceIssue(o.sessionType as SessionType, o.gender, o.minAge, o.maxAge);
  if (audienceIssue) {
    ctx.addIssue({
      code: "custom",
      path: o.sessionType === "children" || audienceIssue.startsWith("Maximum age") ? ["maxAge"] : ["gender"],
      message: audienceIssue,
    });
  }
  if (o.accessType === "live" && o.active) {
    if (!o.localizedTitle) ctx.addIssue({ code: "custom", path: ["localizedTitle"], message: "Live classes need English, Arabic and Sorani titles." });
    if (!o.localizedDescription) ctx.addIssue({ code: "custom", path: ["localizedDescription"], message: "Live classes need English, Arabic and Sorani descriptions." });
    if (!o.localizedInstructor) ctx.addIssue({ code: "custom", path: ["localizedInstructor"], message: "Live classes need an instructor name in English, Arabic and Sorani." });
    if (!o.difficultyLevel) ctx.addIssue({ code: "custom", path: ["difficultyLevel"], message: "Choose a live class difficulty level." });
    if (!o.instructionLanguage) ctx.addIssue({ code: "custom", path: ["instructionLanguage"], message: "Choose the language used in the live class." });
    if (!o.requiredEquipment) ctx.addIssue({ code: "custom", path: ["requiredEquipment"], message: "Add the required equipment in English, Arabic and Sorani." });
    if (!o.joinUrl) ctx.addIssue({ code: "custom", path: ["joinUrl"], message: "An HTTPS class link is required before publishing." });
  }
  if (o.kind === "session" && o.active && (
    !o.localizedTitle || !o.localizedDescription || !o.localizedInstructor
    || !o.difficultyLevel || !o.requiredEquipment
    || !o.healthSafetyInstructions || !o.accessibilityInformation
  )) {
    ctx.addIssue({
      code: "custom",
      path: ["localizedTitle"],
      message: "Published sessions need translated title, description, instructor, skill level, equipment, safety, and accessibility details.",
    });
  }
  const cancellationDeadline = new Date(o.cancellationDeadline);
  const validCancellationDeadline = bookingModel === "open_access"
    ? cancellationDeadline <= new Date(o.endsAt)
    : cancellationDeadline <= new Date(o.startsAt);
  if (!(new Date(o.startsAt) > new Date() && new Date(o.endsAt) > new Date(o.startsAt)
    && validCancellationDeadline && (o.maxAge === null || o.maxAge >= o.minAge))) {
    ctx.addIssue({ code: "custom", message: "Use a future start, later end, cancellation deadline no later than start, and valid ages." });
  }
});
