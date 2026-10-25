import { Router } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { db, memberships, memberProfiles, offerings, reservations } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { BookingError, memberState, createReservation, cancelReservation } from "../lib/reservations";

const router = Router();
router.use((req, res, next) => {
  if (!getAuth(req).userId) { res.status(401).json({ message: "Sign in to manage your reservations." }); return; }
  next();
});
router.get("/", async (req, res) => { res.json(await memberState(getAuth(req).userId!)); });
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
    .where(eq(offerings.active, true)).groupBy(offerings.id);
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
  if (!parsed.success) { res.status(400).json({ message: "Invalid reservation request." }); return; }
  await createReservation(getAuth(req).userId!, parsed.data);
  res.status(201).json(await memberState(getAuth(req).userId!));
});
router.delete("/bookings/:id", async (req, res) => {
  await cancelReservation(getAuth(req).userId!, String(req.params.id));
  res.json(await memberState(getAuth(req).userId!));
});
router.use((error: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof BookingError) { res.status(error.status).json({ message: error.message }); return; }
  next(error);
});
export default router;
