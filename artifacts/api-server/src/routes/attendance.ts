import { Router } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { attendance, db, reservations } from "@workspace/db";
import { BookingError } from "../lib/reservations";
import { sendMemberNotification } from "../lib/notifications";
import { DeviceSecurityError, requirePrimaryMemberDevice } from "../lib/member-device-security";
import { roster, savePolicy, issueQr, scanQr, review, policyInput, scanInput, reviewInput, issueManualCheckinCode, recordManualCheckin, manualCheckinInput } from "../lib/checkin";

const router = Router();
router.use((req, res, next) => {
  if (!getAuth(req).userId) { res.status(401).json({ message: "Sign in to access attendance." }); return; }
  next();
});
router.get("/", requirePrimaryMemberDevice, async (req, res) => { res.json(await roster(getAuth(req).userId!)); });
router.post("/scan", requirePrimaryMemberDevice, async (req, res) => {
  const ownerId = getAuth(req).userId!;
  const result = await scanQr(ownerId, scanInput.parse(req.body));
  void sendMemberNotification(ownerId, "attendance_received");
  res.json(result);
});
router.post("/:id/manual-code", requirePrimaryMemberDevice, async (req, res) => {
  res.json(await issueManualCheckinCode(getAuth(req).userId!, String(req.params.id)));
});
router.post("/:id/manual", async (req, res) => {
  const result = await recordManualCheckin(getAuth(req).userId!, String(req.params.id), manualCheckinInput.parse(req.body));
  if (!result.ok) {
    res.status(result.exhausted ? 429 : 400).json({
      message: result.exhausted ? "Too many attempts. Ask the member to request a new code." : "Manual code is incorrect or expired. Request a new code.",
    });
    return;
  }
  const [arrival] = await db.select({ userId: attendance.userId }).from(attendance)
    .where(eq(attendance.id, result.reference)).limit(1);
  if (arrival) void sendMemberNotification(arrival.userId, "attendance_received");
  res.json(result);
});
router.put("/:id/policy", async (req, res) => {
  await savePolicy(getAuth(req).userId!, String(req.params.id), policyInput.parse(req.body)); res.json({ ok: true });
});
router.post("/:id/qr", async (req, res) => { res.json(await issueQr(getAuth(req).userId!, String(req.params.id))); });
router.delete("/:id/qr", async (req, res) => {
  await issueQr(getAuth(req).userId!, String(req.params.id), true); res.json({ ok: true });
});
router.post("/:id/review", async (req, res) => {
  const result = reviewInput.parse(req.body);
  const id = String(req.params.id);
  await review(getAuth(req).userId!, id, result);
  if (result.action === "accept_request") {
    const [booking] = await db.select({ userId: reservations.userId }).from(reservations)
      .where(eq(reservations.id, id)).limit(1);
    if (booking) void sendMemberNotification(booking.userId, "booking_created");
  } else if (result.action === "reject_request") {
    const [booking] = await db.select({ userId: reservations.userId }).from(reservations)
      .where(eq(reservations.id, id)).limit(1);
    if (booking) void sendMemberNotification(booking.userId, "booking_rejected");
  } else {
    const [record] = await db.select({ userId: attendance.userId }).from(attendance)
      .where(eq(attendance.reservationId, id)).limit(1);
    if (record) void sendMemberNotification(record.userId, "attendance_updated");
  }
  res.json({ ok: true });
});
router.use((error: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid check-in input. Check your dates, coordinates and reason." }); return; }
  if (error instanceof BookingError) {
    res.status(error.status).json({ ...(error.code ? { code: error.code } : {}), message: error.message });
    return;
  }
  if (error instanceof DeviceSecurityError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
  next(error);
});
export default router;
