import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { inArray, or } from "drizzle-orm";
import { db, memberReferralAttributions, memberReferralCodes } from "@workspace/db";
import {
  ExistingMemberReferralError,
  getMemberReferralSummary,
  InvalidMemberReferralCodeError,
  recordMemberReferralAttribution,
  SelfMemberReferralError,
} from "./member-referrals";

test("referral codes count verified, unique account attribution without exposing invitees", async () => {
  const inviter = randomUUID();
  const referred = randomUUID();
  const raceReferred = randomUUID();
  const userIds = [inviter, referred, raceReferred];

  try {
    const firstSummary = await getMemberReferralSummary(inviter);
    const secondSummary = await getMemberReferralSummary(inviter);
    assert.match(firstSummary.code, /^[A-HJ-NP-Z2-9]{10}$/);
    assert.equal(secondSummary.code, firstSummary.code);
    assert.equal(firstSummary.signups, 0);
    assert.equal(firstSummary.hasAppliedCode, false);

    await assert.rejects(
      recordMemberReferralAttribution(referred, "1234567890"),
      InvalidMemberReferralCodeError,
    );
    await assert.rejects(
      recordMemberReferralAttribution(inviter, firstSummary.code),
      SelfMemberReferralError,
    );

    await recordMemberReferralAttribution(referred, firstSummary.code.toLowerCase());
    await assert.rejects(
      recordMemberReferralAttribution(referred, firstSummary.code),
      ExistingMemberReferralError,
    );

    const concurrent = await Promise.allSettled([
      recordMemberReferralAttribution(raceReferred, firstSummary.code),
      recordMemberReferralAttribution(raceReferred, firstSummary.code),
    ]);
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter(result => result.status === "rejected" && result.reason instanceof ExistingMemberReferralError).length, 1);

    const inviterSummary = await getMemberReferralSummary(inviter);
    const referredSummary = await getMemberReferralSummary(referred);
    assert.equal(inviterSummary.signups, 2);
    assert.equal(referredSummary.hasAppliedCode, true);
    assert.equal("referredMembers" in inviterSummary, false);
  } finally {
    await db.delete(memberReferralAttributions).where(or(
      inArray(memberReferralAttributions.referrerUserId, userIds),
      inArray(memberReferralAttributions.referredUserId, userIds),
    ));
    await db.delete(memberReferralCodes).where(inArray(memberReferralCodes.ownerUserId, userIds));
  }
});
