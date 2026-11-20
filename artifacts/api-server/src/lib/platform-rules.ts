import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, platformSafetyRules, type PlatformSafetyRules } from "@workspace/db";

export const DEFAULT_PLATFORM_SAFETY_RULES: PlatformSafetyRules = {
  deviceChangeWaitHours: 24,
  deviceChangeRiskWindowDays: 30,
  repeatedDeviceChangeThreshold: 2,
  maxCheckinAccuracyMeters: 100,
  rapidCheckinBlockSeconds: 60,
  impossibleTravelWindowSeconds: 3600,
  impossibleTravelBaseMeters: 500,
  impossibleTravelMetersPerSecond: 80,
  maxDailyVisitsPerPlan: 100000,
  offeringApprovalRequired: true,
  supplementStoreUrl: null,
};

export const platformSafetyRulesSchema = z.object({
  deviceChangeWaitHours: z.number().int().min(1).max(168),
  deviceChangeRiskWindowDays: z.number().int().min(1).max(90),
  repeatedDeviceChangeThreshold: z.number().int().min(1).max(10),
  maxCheckinAccuracyMeters: z.number().int().min(1).max(100),
  rapidCheckinBlockSeconds: z.number().int().min(1).max(600),
  impossibleTravelWindowSeconds: z.number().int().min(60).max(21600),
  impossibleTravelBaseMeters: z.number().int().min(0).max(5000),
  impossibleTravelMetersPerSecond: z.number().int().min(1).max(200),
  maxDailyVisitsPerPlan: z.number().int().min(1).max(100000),
  offeringApprovalRequired: z.boolean(),
  supplementStoreUrl: z.string().url().max(2048).nullable().default(null).refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use a public HTTPS address without embedded credentials."),
}).strict().superRefine((rules, context) => {
  if (rules.impossibleTravelWindowSeconds <= rules.rapidCheckinBlockSeconds) {
    context.addIssue({
      code: "custom",
      path: ["impossibleTravelWindowSeconds"],
      message: "The travel-check window must be longer than the rapid check-in block.",
    });
  }
});

export async function getPlatformSafetyRules(): Promise<PlatformSafetyRules> {
  const [row] = await db.select().from(platformSafetyRules)
    .where(eq(platformSafetyRules.id, "global")).limit(1);
  return row
    ? platformSafetyRulesSchema.parse(row.settings)
    : DEFAULT_PLATFORM_SAFETY_RULES;
}

export function exceedsPlatformDailyVisitLimit(
  currentLimit: number | null,
  proposedLimit: number,
  platformMaximum: number,
) {
  return proposedLimit > platformMaximum && proposedLimit !== currentLimit;
}

export type PartnerActivityApprovalMode =
  | "platform_default"
  | "activity_approval_required"
  | "trusted_direct_publish";

export function partnerSubmissionOutcome(
  platformApprovalRequired: boolean,
  mode: PartnerActivityApprovalMode = "platform_default",
) {
  const approvalRequired = mode === "activity_approval_required"
    ? true
    : mode === "trusted_direct_publish"
      ? false
      : platformApprovalRequired;
  return approvalRequired
    ? { approvalStatus: "submitted" as const, active: false }
    : { approvalStatus: "published" as const, active: true };
}
