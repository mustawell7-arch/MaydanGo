import { Router } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { db, memberships, memberProfiles, offerings, reservations, partners } from "@workspace/db";
import { eq, and, inArray, sql, gt, asc, isNull } from "drizzle-orm";
import { BookingError, memberState, createReservation } from "../lib/reservations";
import learningRouter from "./learning";
import { memberSupportRouter } from "./support";
import waitlistRouter from "./waitlist";
import { cancelReservationAndPromote } from "../lib/waitlist";
import { sendMemberNotification } from "../lib/notifications";
import { PaymentError } from "../lib/payment-config";
import { cancelMemberSubscription, createMemberCheckout, listMemberPlans, memberSubscription } from "../lib/payments-paytabs";

const router = Router();
router.use((req, res, next) => {
  if (!getAuth(req).userId) { res.status(401).json({ message: "Sign in to manage your bookings." }); return; }
  next();
});
router.use(learningRouter);
router.use(memberSupportRouter);
router.use("/waitlist", waitlistRouter);
router.get("/", async (req, res) => { res.json(await memberState(getAuth(req).userId!)); });
router.get("/plans", async (_req, res) => { res.json(await listMemberPlans()); });
router.post("/checkout", async (req, res) => {
  const parsed = z.object({ planId: z.string().uuid() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Choose a valid membership plan." }); return; }
  res.json(await createMemberCheckout(getAuth(req).userId!, parsed.data.planId));
});
router.get("/subscription", async (req, res) => {
  res.json(await memberSubscription(getAuth(req).userId!));
});
router.post("/subscription/cancel", async (req, res) => {
  if (req.body && Object.keys(req.body).length) { res.status(400).json({ message: "No cancellation details are accepted from the app." }); return; }
  res.json(await cancelMemberSubscription(getAuth(req).userId!));
});
router.get("/live-catalog", async (_req, res) => {
  const rows = await db.select({ offering: offerings, partnerName: partners.name,
    reserved: sql<number>`count(${reservations.id})::int`,
  }).from(offerings).innerJoin(partners, eq(offerings.partnerId, partners.id))
    .leftJoin(reservations, and(eq(reservations.offeringId, offerings.id), inArray(reservations.status, ["reserved", "requested"])))
    .where(and(eq(offerings.scope, "live"), eq(offerings.active, true), isNull(offerings.cancelledAt), eq(partners.approved, true), gt(offerings.startsAt, new Date())))
    .groupBy(offerings.id, partners.id).orderBy(asc(offerings.startsAt));
  res.json(rows.map(({ offering: o, partnerName, reserved }) => ({
    id: o.id, targetId: o.targetId, slot: o.slot, scope: o.scope,
    partnerId: o.partnerId, partnerName, title: o.title,
    localizedTitle: o.localizedTitle, localizedDescription: o.localizedDescription,
    kind: o.kind, city: o.city, facility: o.facility, category: o.category, accessType: o.accessType,
    tiers: o.tiers, startsAt: o.startsAt, endsAt: o.endsAt, cancellationDeadline: o.cancellationDeadline,
    capacity: o.capacity, gender: o.gender, minAge: o.minAge, maxAge: o.maxAge,
    additionalPayment: o.additionalPayment, active: o.active, cancelledAt: o.cancelledAt,
    remaining: Math.max(0, o.capacity - reserved),
  })));
});
router.put("/profile", async (req, res) => {
  const parsed = z.object({
    gender: z.enum(["female", "male", "unspecified"]),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d => {
      const dt = new Date(d);
      return !isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d && dt < new Date() && dt.getUTCFullYear() >= 1900;
    }),
  }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Enter a valid birth date (YYYY-MM-DD) and gender." }); return; }
  await db.insert(memberProfiles).values({ userId: getAuth(req).userId!, ...parsed.data })
    .onConflictDoUpdate({ target: memberProfiles.userId, set: parsed.data });
  res.json(await memberState(getAuth(req).userId!));
});
router.get("/catalog", async (_req, res) => {
  const rows = await db.select({
    id: offerings.id, kind: offerings.kind, targetId: offerings.targetId, slot: offerings.slot,
    title: offerings.title, startsAt: offerings.startsAt, cancellationDeadline: offerings.cancellationDeadline,
    scope: offerings.scope, capacity: offerings.capacity,
    reserved: sql<number>`count(${reservations.id})::int`,
  }).from(offerings).leftJoin(reservations, and(eq(reservations.offeringId, offerings.id), inArray(reservations.status, ["reserved", "requested"])))
    .where(and(eq(offerings.active, true), eq(offerings.scope, "preview"))).groupBy(offerings.id);
  res.json(rows.map(r => ({ ...r, remaining: Math.max(0, r.capacity - r.reserved) })));
});
router.post("/preview-membership", async (req, res) => {
  if (req.body?.acknowledgeSampleData !== true) { res.status(400).json({ message: "Acknowledge that preview partners and bookings are not live." }); return; }
  // Explicit opt-in, isolated scope. Never upgrades or modifies a real membership.
  const now = new Date();
  await db.insert(memberships).values({
    userId: getAuth(req).userId!, scope: "preview", status: "trial", paymentStatus: "paid", tier: "M",
    startsAt: now, endsAt: new Date(now.getTime() + 30 * 86400000),
    rules: { quota: 8, dailyLimit: 3 },
  }).onConflictDoNothing();
  res.json(await memberState(getAuth(req).userId!));
});
router.post("/bookings", async (req, res) => {
  const parsed = z.object({ kind: z.enum(["session", "event", "coach"]), targetId: z.string().min(1).max(100), slot: z.string().max(100).default("") }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid booking request." }); return; }
  const ownerId = getAuth(req).userId!;
  const reservation = await createReservation(ownerId, parsed.data);
  const [offering] = await db.select({ scope: offerings.scope }).from(offerings)
    .where(eq(offerings.id, reservation.offeringId)).limit(1);
  if (offering?.scope === "live") void sendMemberNotification(ownerId, "booking_created");
  res.status(201).json(await memberState(getAuth(req).userId!));
});
router.delete("/bookings/:id", async (req, res) => {
  const ownerId = getAuth(req).userId!;
  const [offering] = await db.select({ scope: offerings.scope }).from(reservations)
    .innerJoin(offerings, eq(reservations.offeringId, offerings.id))
    .where(and(eq(reservations.id, String(req.params.id)), eq(reservations.userId, ownerId))).limit(1);
  const result = await cancelReservationAndPromote(ownerId, String(req.params.id));
  if (result.cancelled && offering?.scope === "live") void sendMemberNotification(ownerId, "booking_cancelled");
  res.json(await memberState(getAuth(req).userId!));
});
router.use((error: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof BookingError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof PaymentError) { res.status(error.status).json({ message: error.message }); return; }
  next(error);
});
export default router;
