import { and, desc, eq, inArray, lte } from "drizzle-orm";
import {
  db,
  legalPolicyVersions,
  type LegalPolicyKey,
  type LegalPolicyTranslation,
  type LegalPolicyTranslations,
  type LegalPolicyVersionStatus,
} from "@workspace/db";

export const LEGAL_POLICY_KEYS: LegalPolicyKey[] = [
  "terms_of_use",
  "privacy_policy",
  "booking_policy",
  "cancellation_policy",
  "refund_policy",
];

export type LegalPolicyVersionRecord = typeof legalPolicyVersions.$inferSelect;

export function policyDocumentPath(policyKey: LegalPolicyKey, version: string): string {
  if (version === "v1-draft" && policyKey === "terms_of_use") return "/legal";
  if (version === "v1-draft" && policyKey === "privacy_policy") return "/privacy";
  return `/policies/${policyKey}?version=${encodeURIComponent(version)}`;
}

export async function getCurrentLegalPolicies(now = new Date()): Promise<LegalPolicyVersionRecord[]> {
  const rows = await db.select().from(legalPolicyVersions)
    .where(and(
      eq(legalPolicyVersions.status, "published"),
      lte(legalPolicyVersions.effectiveAt, now),
    ))
    .orderBy(desc(legalPolicyVersions.effectiveAt), desc(legalPolicyVersions.publishedAt));
  const currentByKey = new Map<LegalPolicyKey, LegalPolicyVersionRecord>();
  for (const row of rows) {
    if (!currentByKey.has(row.policyKey)) currentByKey.set(row.policyKey, row);
  }
  return LEGAL_POLICY_KEYS.flatMap(key => {
    const current = currentByKey.get(key);
    return current ? [current] : [];
  });
}

export async function getPublicLegalPolicyVersion(
  policyKey: LegalPolicyKey,
  version: string | undefined,
  now = new Date(),
): Promise<LegalPolicyVersionRecord | null> {
  const rows = await db.select().from(legalPolicyVersions)
    .where(and(
      eq(legalPolicyVersions.policyKey, policyKey),
      eq(legalPolicyVersions.status, "published"),
      version ? undefined : lte(legalPolicyVersions.effectiveAt, now),
      version ? eq(legalPolicyVersions.version, version) : undefined,
    ))
    .orderBy(desc(legalPolicyVersions.effectiveAt), desc(legalPolicyVersions.publishedAt))
    .limit(1);
  return rows[0] ?? null;
}

export function isCompletePolicyTranslation(value: LegalPolicyTranslation): boolean {
  return value.title.trim().length >= 3
    && value.introduction.trim().length >= 10
    && value.body.trim().length >= 20;
}

export function normalizePolicyStatus(status: string): LegalPolicyVersionStatus | null {
  return status === "draft" || status === "published" ? status : null;
}
