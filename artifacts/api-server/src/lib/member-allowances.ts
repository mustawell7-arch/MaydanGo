import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db, attendance, memberships, offerings, reservations } from "@workspace/db";

type MembershipForAllowance = {
  scope: string;
  status: string;
  source: string;
  paymentStatus: string;
  tier: string;
  startsAt: Date;
  endsAt: Date;
  rules: {
    quota?: number;
    dailyLimit?: number;
    quotaMode?: "shared" | "separate";
    physicalQuota?: number;
    premiumQuota?: number;
    liveQuota?: number;
  };
};

type AllowanceUse = {
  id: string;
  accessType: string;
  startsAt: Date;
};

type AllowanceBalance = {
  limit: number;
  remaining: number;
  resetsAt: string;
};

const activeMembershipStatuses = new Set(["active", "trial", "scheduled", "scheduled_cancellation"]);

function isMembershipEligible(membership: MembershipForAllowance, now: Date) {
  const statusIsUsable = activeMembershipStatuses.has(membership.status);
  const datesAreUsable = membership.startsAt <= now && membership.endsAt > now;
  const paymentIsUsable = membership.source === "paid"
    ? membership.paymentStatus === "paid"
    : ["trial", "corporate"].includes(membership.source) && membership.paymentStatus === "not_required";
  return membership.scope === "live" && statusIsUsable && datesAreUsable && paymentIsUsable;
}

function baghdadDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function nextBaghdadMidnight(now: Date) {
  const [year, month, day] = baghdadDate(now).split("-").map(Number);
  const nextCalendarDay = new Date(Date.UTC(year, month - 1, day + 1));
  return new Date(nextCalendarDay.getTime() - 3 * 60 * 60 * 1000);
}

function balance(limit: number | undefined, used: number, resetsAt: Date): AllowanceBalance | null {
  if (!Number.isSafeInteger(limit) || limit! < 0) return null;
  return { limit: limit!, remaining: Math.max(0, limit! - used), resetsAt: resetsAt.toISOString() };
}

export function calculateMemberAllowances(
  membership: MembershipForAllowance | null | undefined,
  uses: AllowanceUse[],
  now = new Date(),
) {
  if (!membership || !isMembershipEligible(membership, now)) return { membership: null };

  const uniqueUses = new Map<string, AllowanceUse>();
  for (const use of uses) {
    if (use.startsAt >= membership.startsAt && use.startsAt < membership.endsAt) {
      uniqueUses.set(use.id, use);
    }
  }
  const countedUses = [...uniqueUses.values()];
  const quotaMode = membership.rules.quotaMode === "separate" ? "separate" : "shared";
  const dailyDate = baghdadDate(now);
  const dailyUsed = countedUses.filter(use => baghdadDate(use.startsAt) === dailyDate).length;

  const shared = quotaMode === "shared"
    ? balance(membership.rules.quota, countedUses.length, membership.endsAt)
    : null;
  const separate = quotaMode === "separate" ? {
    physical: balance(
      membership.rules.physicalQuota,
      countedUses.filter(use => use.accessType === "physical").length,
      membership.endsAt,
    ),
    premium: balance(
      membership.rules.premiumQuota,
      countedUses.filter(use => use.accessType === "premium").length,
      membership.endsAt,
    ),
    live: balance(
      membership.rules.liveQuota,
      countedUses.filter(use => use.accessType === "live").length,
      membership.endsAt,
    ),
  } : { physical: null, premium: null, live: null };

  return {
    membership: {
      tier: membership.tier,
      endsAt: membership.endsAt.toISOString(),
      quotaMode,
      daily: balance(membership.rules.dailyLimit, dailyUsed, nextBaghdadMidnight(now)),
      shared,
      separate,
    },
  };
}

export async function getMemberAllowances(userId: string, now = new Date()) {
  const [membership] = await db.select().from(memberships).where(and(
    eq(memberships.userId, userId),
    eq(memberships.scope, "live"),
  )).limit(1);
  if (!membership) return calculateMemberAllowances(null, [], now);

  const membershipPeriod = and(
    eq(offerings.scope, "live"),
    gte(offerings.startsAt, membership.startsAt),
    lt(offerings.startsAt, membership.endsAt),
  );
  const [reservationUses, attendanceUses] = await Promise.all([
    db.select({
      id: offerings.id,
      accessType: offerings.accessType,
      startsAt: offerings.startsAt,
    }).from(reservations)
      .innerJoin(offerings, eq(offerings.id, reservations.offeringId))
      .where(and(
        eq(reservations.userId, userId),
        inArray(reservations.status, ["reserved", "requested"]),
        membershipPeriod,
      )),
    db.select({
      id: offerings.id,
      accessType: offerings.accessType,
      startsAt: offerings.startsAt,
    }).from(attendance)
      .innerJoin(offerings, eq(offerings.id, attendance.offeringId))
      .where(and(
        eq(attendance.userId, userId),
        inArray(attendance.status, ["pending", "confirmed", "disputed"]),
        membershipPeriod,
      )),
  ]);

  return calculateMemberAllowances(membership, [...reservationUses, ...attendanceUses], now);
}
