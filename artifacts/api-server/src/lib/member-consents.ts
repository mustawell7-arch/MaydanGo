import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, memberConsentEvents, type MemberConsentChoice, type MemberConsentEvent, type MemberConsentPurpose } from "@workspace/db";

export const MEMBER_POLICY_VERSIONS: Record<MemberConsentPurpose, string> = {
  terms_of_use: "v1-draft",
  privacy_policy: "v1-draft",
  marketing: "v1-draft",
};

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
};

export class RequiredMemberConsentError extends Error {
  constructor() {
    super("Accept the current Terms of Use and Privacy Policy to save your service consent.");
    this.name = "RequiredMemberConsentError";
  }
}

export function buildMemberConsentState(history: MemberConsentEvent[]) {
  const latestByPurpose = new Map<MemberConsentPurpose, MemberConsentEvent>();
  for (const event of history) {
    if (!latestByPurpose.has(event.purpose)) latestByPurpose.set(event.purpose, event);
  }
  const currentChoice = (purpose: MemberConsentPurpose): MemberConsentChoice | null => {
    const latest = latestByPurpose.get(purpose);
    return latest?.policyVersion === MEMBER_POLICY_VERSIONS[purpose] ? latest.choice : null;
  };
  const currentChoices = {
    termsOfUse: currentChoice("terms_of_use"),
    privacyPolicy: currentChoice("privacy_policy"),
    marketing: currentChoice("marketing"),
  };
  return {
    policies: MEMBER_CONSENT_POLICIES,
    currentChoices,
    requiredAccepted: currentChoices.termsOfUse === "accepted"
      && currentChoices.privacyPolicy === "accepted",
    history: history.map(event => ({
      id: event.id,
      userId: event.userId,
      purpose: event.purpose,
      policyVersion: event.policyVersion,
      choice: event.choice,
      recordedAt: event.recordedAt.toISOString(),
    })),
  };
}

export async function listMemberConsentHistory(userId: string): Promise<MemberConsentEvent[]> {
  return db.select().from(memberConsentEvents)
    .where(eq(memberConsentEvents.userId, userId))
    .orderBy(desc(memberConsentEvents.recordedAt), desc(memberConsentEvents.id));
}

export async function getMemberConsentState(userId: string): Promise<MemberConsentState> {
  return buildMemberConsentState(await listMemberConsentHistory(userId));
}

export async function hasCurrentRequiredMemberConsent(userId: string): Promise<boolean> {
  return (await getMemberConsentState(userId)).requiredAccepted;
}

export async function saveMemberConsentChoices(
  userId: string,
  input: MemberConsentInput,
): Promise<MemberConsentState> {
  if (!input.termsOfUseAccepted || !input.privacyPolicyAccepted) {
    throw new RequiredMemberConsentError();
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
      return latest?.policyVersion !== MEMBER_POLICY_VERSIONS[purpose] || latest.choice !== choice;
    })
    .map(({ purpose, choice }) => ({
      id: randomUUID(),
      userId,
      purpose,
      policyVersion: MEMBER_POLICY_VERSIONS[purpose],
      choice,
    }));

  if (events.length) {
    await db.transaction(async tx => {
      await tx.insert(memberConsentEvents).values(events);
    });
  }

  return getMemberConsentState(userId);
}
