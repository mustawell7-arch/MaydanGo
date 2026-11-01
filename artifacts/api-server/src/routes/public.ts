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
    })
    .from(membershipPlans)
    .where(eq(membershipPlans.active, true));

  res.json(rows);
});

export default router;
