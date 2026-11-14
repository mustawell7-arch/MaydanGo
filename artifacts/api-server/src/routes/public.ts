import { Router } from "express";
import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, membershipPlans, offerings, partners, reservations } from "@workspace/db";
import facilitiesPublicRouter from "./facilities-public";

const router = Router();
router.use(facilitiesPublicRouter);

router.get("/catalog", async (_req, res) => {
  const rows = await db
    .select({
      id: offerings.id,
      kind: offerings.kind,
      targetId: offerings.targetId,
      slot: offerings.slot,
      title: offerings.title,
      localizedTitle: offerings.localizedTitle,
      localizedDescription: offerings.localizedDescription,
      city: offerings.city,
      facility: offerings.facility,
      category: offerings.category,
      accessType: offerings.accessType,
      tiers: offerings.tiers,
      startsAt: offerings.startsAt,
      endsAt: offerings.endsAt,
      cancellationDeadline: offerings.cancellationDeadline,
      gender: offerings.gender,
      minAge: offerings.minAge,
      maxAge: offerings.maxAge,
      capacity: offerings.capacity,
      additionalPayment: offerings.additionalPayment,
      partnerName: partners.name,
      reserved: sql<number>`count(${reservations.id})::int`,
    })
    .from(offerings)
    .innerJoin(partners, eq(offerings.partnerId, partners.id))
    .leftJoin(
      reservations,
      and(
        eq(reservations.offeringId, offerings.id),
        inArray(reservations.status, ["reserved", "requested"]),
      ),
    )
    .where(
      and(
        eq(offerings.scope, "live"),
        eq(offerings.active, true),
        isNull(offerings.cancelledAt),
        eq(partners.approved, true),
        gt(offerings.startsAt, new Date()),
        or(ne(offerings.kind, "event"), eq(offerings.additionalPayment, false)),
      ),
    )
    .groupBy(offerings.id, partners.id)
    .orderBy(asc(offerings.startsAt));

  res.json(rows.map(({ capacity, reserved, ...offering }) => ({
    ...offering,
    remaining: Math.max(0, capacity - reserved),
  })));
});

router.get("/plans", async (_req, res) => {
  const rows = await db
    .select({
      id: membershipPlans.id,
      name: membershipPlans.name,
      tier: membershipPlans.tier,
      kind: membershipPlans.kind,
      durationDays: membershipPlans.durationDays,
      rules: membershipPlans.rules,
    })
    .from(membershipPlans)
    .where(eq(membershipPlans.active, true));

  res.json(rows.map(({ rules, ...plan }) => {
    const separate = rules.quotaMode === "separate";
    const allowedByPlan = (accessType: "physical" | "premium" | "live") =>
      plan.kind !== "trial" || rules.trialAllowedTypes?.includes(accessType) === true;
    const physicalVisits = separate ? rules.physicalQuota ?? 0 : null;
    const premiumVisits = separate ? rules.premiumQuota ?? 0 : null;
    const liveClassVisits = separate ? rules.liveQuota ?? 0 : null;
    const sharedVisits = separate ? null : rules.quota;

    return {
      ...plan,
      access: {
        quotaMode: separate ? "separate" as const : "shared" as const,
        dailyLimit: rules.dailyLimit,
        sharedVisits,
        physicalVisits,
        premiumVisits,
        liveClassVisits,
        physicalAccess: allowedByPlan("physical") && (separate ? (physicalVisits ?? 0) > 0 : rules.quota > 0),
        premiumAccess: allowedByPlan("premium") && (separate ? (premiumVisits ?? 0) > 0 : rules.quota > 0),
        liveClassAccess: allowedByPlan("live") && (separate ? (liveClassVisits ?? 0) > 0 : rules.quota > 0),
        digitalCourseAccess: rules.planTerms?.digitalContentAccess === true,
        // Older memberships retain their prior event access when no explicit plan term was saved.
        eventAccess: rules.planTerms?.eventAccess !== false,
        cancellationPeriodDays: rules.planTerms?.cancellationPeriodDays ?? null,
        localizedDescription: rules.planTerms?.description ?? null,
      },
    };
  }));
});

export default router;
