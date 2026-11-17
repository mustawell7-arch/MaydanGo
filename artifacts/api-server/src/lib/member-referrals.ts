import { randomBytes, randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { db, memberReferralAttributions, memberReferralCodes } from "@workspace/db";

const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL_CODE_LENGTH = 10;

export class InvalidMemberReferralCodeError extends Error {
  constructor() {
    super("This referral code is not available.");
    this.name = "InvalidMemberReferralCodeError";
  }
}

export class SelfMemberReferralError extends Error {
  constructor() {
    super("You cannot apply your own referral code.");
    this.name = "SelfMemberReferralError";
  }
}

export class ExistingMemberReferralError extends Error {
  constructor() {
    super("A referral code has already been applied to this account.");
    this.name = "ExistingMemberReferralError";
  }
}

function createReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  return Array.from(bytes, byte => REFERRAL_ALPHABET[byte & 31]).join("");
}

export async function getMemberReferralSummary(userId: string) {
  let referralCode: typeof memberReferralCodes.$inferSelect | undefined;
  for (let attempt = 0; attempt < 6 && !referralCode; attempt++) {
    await db.insert(memberReferralCodes).values({
      id: randomUUID(),
      ownerUserId: userId,
      code: createReferralCode(),
    }).onConflictDoNothing();

    [referralCode] = await db.select().from(memberReferralCodes)
      .where(eq(memberReferralCodes.ownerUserId, userId)).limit(1);
  }
  if (!referralCode) throw new Error("Unable to create a referral code.");

  const [result] = await db.select({ signups: count() }).from(memberReferralAttributions)
    .where(eq(memberReferralAttributions.referrerUserId, userId));
  const [ownAttribution] = await db.select({ id: memberReferralAttributions.id })
    .from(memberReferralAttributions)
    .where(eq(memberReferralAttributions.referredUserId, userId))
    .limit(1);
  return {
    code: referralCode.code,
    signups: result?.signups ?? 0,
    hasAppliedCode: !!ownAttribution,
  };
}

export async function recordMemberReferralAttribution(referredUserId: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  const [referral] = await db.select().from(memberReferralCodes)
    .where(eq(memberReferralCodes.code, code)).limit(1);
  if (!referral) throw new InvalidMemberReferralCodeError();
  if (referral.ownerUserId === referredUserId) throw new SelfMemberReferralError();

  const [attribution] = await db.insert(memberReferralAttributions).values({
    id: randomUUID(),
    codeId: referral.id,
    referrerUserId: referral.ownerUserId,
    referredUserId,
  }).onConflictDoNothing().returning({ id: memberReferralAttributions.id });
  if (!attribution) throw new ExistingMemberReferralError();
  return { referrerUserId: referral.ownerUserId };
}
