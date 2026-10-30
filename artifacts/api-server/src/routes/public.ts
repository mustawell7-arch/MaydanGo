import { Router } from "express";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, membershipPlans, offerings, partners, reservations } from "@workspace/db";
import facilitiesPublicRouter from "./facilities-public";

const router = Router();
router.use(facilitiesPublicRouter);

router.get("/catalog", async (_req, res) => {
  const rows = await db
    .select({
      id: offerings.id,
      kind: offerings.kind,
      title: offerings.title,
      city: offerings.city,
      facility: offerings.facility,
      category: offerings.category,
      accessType: offerings.accessType,
      startsAt: offerings.startsAt,
      endsAt: offerings.endsAt,
      capacity: offerings.capacity,
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
