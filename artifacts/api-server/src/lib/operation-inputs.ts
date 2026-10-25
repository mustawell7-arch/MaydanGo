import { z } from "zod";

const label = z.string().trim().min(1).max(160);
const quota = z.number().int().min(0).max(100000);
const limits = z.record(z.string().min(1).max(160), quota).optional();
const names = z.array(label).max(100).optional();
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
}).strict().superRefine((p, ctx) => {
  if (p.kind === "corporate" && !p.rules.corporateId)
    ctx.addIssue({ code: "custom", message: "Corporate plans require an organization ID." });
  if (p.kind === "trial" && !p.rules.trialAllowedTypes)
    ctx.addIssue({ code: "custom", message: "Trial plans require allowed activity types." });
});
export const partnerInput = z.object({ name: label, groupId: label, ownerUserId: label }).strict();
export const offeringInput = z.object({
  partnerId: label, title: label, kind: z.enum(["session", "event", "coach"]),
  city: label, facility: label, category: label,
  accessType: z.enum(["physical", "premium", "live"]),
  tiers: z.array(label).min(1).max(30),
  startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
  cancellationDeadline: z.string().datetime({ offset: true }),
  capacity: z.number().int().min(1).max(100000),
  gender: z.enum(["all", "female", "male"]).default("all"),
  minAge: z.number().int().min(0).max(120).default(0),
  maxAge: z.number().int().min(0).max(120).nullable().default(null),
  additionalPayment: z.boolean().default(false), active: z.boolean(),
}).strict().refine(o => new Date(o.startsAt) > new Date() && new Date(o.endsAt) > new Date(o.startsAt)
  && new Date(o.cancellationDeadline) <= new Date(o.startsAt) && (o.maxAge === null || o.maxAge >= o.minAge),
{ message: "Use a future start, later end, cancellation deadline no later than start, and valid ages." });
