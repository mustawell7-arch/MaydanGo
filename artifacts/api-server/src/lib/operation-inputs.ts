import { z } from "zod";

const label = z.string().trim().min(1).max(160);
const quota = z.number().int().min(0).max(100000);
const limits = z.record(z.string().min(1).max(160), quota).optional();
const names = z.array(label).max(100).optional();
const localizedText = z.object({
  en: z.string().trim().min(1).max(240),
  ar: z.string().trim().min(1).max(240),
  ku: z.string().trim().min(1).max(240),
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
const facilityTextList = z.array(facilityLocalizedText).max(30);
const facilityWebsite = z.string().trim().url().max(2048).refine(value => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}, "Use an HTTPS website link.");
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
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
}).strict();
const validateFacilityCoordinates = (
  profile: { latitude: number | null; longitude: number | null },
  ctx: z.RefinementCtx,
) => {
  if ((profile.latitude === null) !== (profile.longitude === null)) {
    ctx.addIssue({ code: "custom", message: "Latitude and longitude must be provided together." });
  }
};
export const facilityProfileFields = facilityProfileFieldsObject.superRefine(validateFacilityCoordinates);
export const createFacilityProfileInput = facilityProfileFieldsObject.extend({ partnerId: label })
  .strict().superRefine(validateFacilityCoordinates);
export const offeringInput = z.object({
  partnerId: label, title: label, kind: z.enum(["session", "event", "coach"]),
  localizedTitle: localizedText.nullable().optional(),
  localizedDescription: localizedText.nullable().optional(),
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
  if (o.accessType === "live" && o.active) {
    if (!o.localizedTitle) ctx.addIssue({ code: "custom", path: ["localizedTitle"], message: "Live classes need English, Arabic and Sorani titles." });
    if (!o.localizedDescription) ctx.addIssue({ code: "custom", path: ["localizedDescription"], message: "Live classes need English, Arabic and Sorani descriptions." });
    if (!o.joinUrl) ctx.addIssue({ code: "custom", path: ["joinUrl"], message: "An HTTPS class link is required before publishing." });
  }
  if (!(new Date(o.startsAt) > new Date() && new Date(o.endsAt) > new Date(o.startsAt)
    && new Date(o.cancellationDeadline) <= new Date(o.startsAt) && (o.maxAge === null || o.maxAge >= o.minAge))) {
    ctx.addIssue({ code: "custom", message: "Use a future start, later end, cancellation deadline no later than start, and valid ages." });
  }
});
