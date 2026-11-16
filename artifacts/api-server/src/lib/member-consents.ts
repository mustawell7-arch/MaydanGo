import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, memberConsentEvents, pushDeliveries, type MemberConsentChoice, type MemberConsentEvent, type MemberConsentPurpose } from "@workspace/db";
import { getCurrentLegalPolicies, policyDocumentPath } from "./legal-policies";

export const MEMBER_POLICY_VERSIONS: Record<MemberConsentPurpose, string> = {
  terms_of_use: "v1-draft",
  privacy_policy: "v1-draft",
  marketing: "v1-draft",
};

export const MEMBER_CONSENT_REQUIRED_CODE = "MEMBER_CONSENT_REQUIRED";
export const MEMBER_CONSENT_REQUIRED_MESSAGE =
  "Review and accept the current Terms of Use and Privacy Policy in Account before continuing.";

export const MEMBER_CONSENT_POLICIES = [
  { purpose: "terms_of_use", version: MEMBER_POLICY_VERSIONS.terms_of_use, required: true },
  { purpose: "privacy_policy", version: MEMBER_POLICY_VERSIONS.privacy_policy, required: true },
  { purpose: "marketing", version: MEMBER_POLICY_VERSIONS.marketing, required: false },
] as const;

export type MemberConsentState = ReturnType<typeof buildMemberConsentState>;
export type MemberConsentInput = {
  termsOfUseAccepted: boolean;
  privacyPolicyAccepted: boolean;
  marketingConsent: boolean;
  termsVersion?: string;
  privacyVersion?: string;
};
export type CurrentMemberConsentVersions = Pick<Record<MemberConsentPurpose, string>, "terms_of_use" | "privacy_policy">;

export class StaleMemberConsentPolicyError extends Error {
  constructor() {
    super("The current policies changed. Review the latest versions before saving your choices.");
    this.name = "StaleMemberConsentPolicyError";
  }
}

export class RequiredMemberConsentError extends Error {
  constructor() {
    super("Accept the current Terms of Use and Privacy Policy to save your service consent.");
    this.name = "RequiredMemberConsentError";
  }
}

export function buildMemberConsentState(
  history: MemberConsentEvent[],
  versions: Record<MemberConsentPurpose, string> = MEMBER_POLICY_VERSIONS,
  currentPolicies: Awaited<ReturnType<typeof getCurrentLegalPolicies>> = [],
) {
  const policyByKey = new Map(currentPolicies.map(policy => [policy.policyKey, policy]));
  const latestByPurpose = new Map<MemberConsentPurpose, MemberConsentEvent>();
  for (const event of history) {
    if (!latestByPurpose.has(event.purpose)) latestByPurpose.set(event.purpose, event);
  }
  const currentChoice = (purpose: MemberConsentPurpose): MemberConsentChoice | null => {
    const latest = latestByPurpose.get(purpose);
    return latest?.policyVersion === versions[purpose] ? latest.choice : null;
  };
  const currentChoices = {
    termsOfUse: currentChoice("terms_of_use"),
    privacyPolicy: currentChoice("privacy_policy"),
    marketing: currentChoice("marketing"),
  };
  return {
    policies: MEMBER_CONSENT_POLICIES.map(policy => {
      const key = policy.purpose === "terms_of_use" ? "terms_of_use"
        : policy.purpose === "privacy_policy" ? "privacy_policy" : null;
      const published = key ? policyByKey.get(key) : undefined;
      return {
        ...policy,
        version: versions[policy.purpose],
        policyKey: key,
        documentPath: key ? policyDocumentPath(key, versions[policy.purpose]) : null,
        translations: published?.translations ?? null,
        effectiveAt: published?.effectiveAt.toISOString() ?? null,
      };
    }),
    currentChoices,
    requiredAccepted: currentChoices.termsOfUse === "accepted"
      && currentChoices.privacyPolicy === "accepted",
    history: history.map(event => ({
      id: event.id,
      userId: event.userId,
      purpose: event.purpose,
      policyVersion: event.policyVersion,
      documentPath: event.purpose === "terms_of_use" || event.purpose === "privacy_policy"
        ? policyDocumentPath(event.purpose, event.policyVersion)
        : null,
      choice: event.choice,
      recordedAt: event.recordedAt.toISOString(),
    })),
  };
}

export function buildCurrentMemberConsentState(
  history: MemberConsentEvent[],
  currentPolicies: Awaited<ReturnType<typeof getCurrentLegalPolicies>> = [],
) {
  const currentByKey = new Map(currentPolicies.map(policy => [policy.policyKey, policy]));
  const versions: Record<MemberConsentPurpose, string> = {
    ...MEMBER_POLICY_VERSIONS,
    terms_of_use: currentByKey.get("terms_of_use")?.version ?? MEMBER_POLICY_VERSIONS.terms_of_use,
    privacy_policy: currentByKey.get("privacy_policy")?.version ?? MEMBER_POLICY_VERSIONS.privacy_policy,
  };
  return buildMemberConsentState(history, versions, currentPolicies);
}

export async function listMemberConsentHistory(userId: string): Promise<MemberConsentEvent[]> {
  return db.select().from(memberConsentEvents)
    .where(eq(memberConsentEvents.userId, userId))
    .orderBy(desc(memberConsentEvents.recordedAt), desc(memberConsentEvents.id));
}

export async function getMemberConsentState(userId: string): Promise<MemberConsentState> {
  const [history, currentPolicies] = await Promise.all([
    listMemberConsentHistory(userId),
    getCurrentLegalPolicies(),
  ]);
  return buildCurrentMemberConsentState(history, currentPolicies);
}

export async function hasCurrentRequiredMemberConsent(userId: string): Promise<boolean> {
  return (await getMemberConsentState(userId)).requiredAccepted;
}

export async function hasCurrentMarketingConsent(userId: string): Promise<boolean> {
  return (await getMemberConsentState(userId)).currentChoices.marketing === "accepted";
}

export async function saveMemberConsentChoices(
  userId: string,
  input: MemberConsentInput,
): Promise<MemberConsentState> {
  if (!input.termsOfUseAccepted || !input.privacyPolicyAccepted) {
    throw new RequiredMemberConsentError();
  }

  const currentPolicies = await getCurrentLegalPolicies();
  const currentByKey = new Map(currentPolicies.map(policy => [policy.policyKey, policy]));
  const versions: Record<MemberConsentPurpose, string> = {
    ...MEMBER_POLICY_VERSIONS,
    terms_of_use: currentByKey.get("terms_of_use")?.version ?? MEMBER_POLICY_VERSIONS.terms_of_use,
    privacy_policy: currentByKey.get("privacy_policy")?.version ?? MEMBER_POLICY_VERSIONS.privacy_policy,
  };
  if ((input.termsVersion && input.termsVersion !== versions.terms_of_use)
    || (input.privacyVersion && input.privacyVersion !== versions.privacy_policy)) {
    throw new StaleMemberConsentPolicyError();
  }

  const history = await listMemberConsentHistory(userId);
  const latestByPurpose = new Map<MemberConsentPurpose, MemberConsentEvent>();
  for (const event of history) {
    if (!latestByPurpose.has(event.purpose)) latestByPurpose.set(event.purpose, event);
  }
  const decisions: Array<{ purpose: MemberConsentPurpose; choice: MemberConsentChoice }> = [
    { purpose: "terms_of_use", choice: "accepted" },
    { purpose: "privacy_policy", choice: "accepted" },
    { purpose: "marketing", choice: input.marketingConsent ? "accepted" : "declined" },
  ];
  const events = decisions
    .filter(({ purpose, choice }) => {
      const latest = latestByPurpose.get(purpose);
      return latest?.policyVersion !== versions[purpose] || latest.choice !== choice;
    })
    .map(({ purpose, choice }) => ({
      id: randomUUID(),
      userId,
      purpose,
      policyVersion: versions[purpose],
      choice,
    }));

  if (events.length || !input.marketingConsent) {
    await db.transaction(async tx => {
      if (events.length) await tx.insert(memberConsentEvents).values(events);
      if (!input.marketingConsent) {
        await tx.update(pushDeliveries).set({
          status: "cancelled",
          error: "Marketing consent was withdrawn before delivery.",
          nextAttemptAt: null,
        }).where(and(
          eq(pushDeliveries.userId, userId),
          eq(pushDeliveries.kind, "marketing_update"),
          inArray(pushDeliveries.status, ["pending", "retry_pending"]),
        ));
      }
    });
  }

  return getMemberConsentState(userId);
}
