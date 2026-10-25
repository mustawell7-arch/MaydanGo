import { Router } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { BookingError } from "../lib/reservations";
import { roster, savePolicy, issueQr, scanQr, review, policyInput, scanInput, reviewInput } from "../lib/checkin";

const router = Router();
router.use((req, res, next) => {
  if (!getAuth(req).userId) { res.status(401).json({ message: "Sign in to access attendance." }); return; }
  next();
});
router.get("/", async (req, res) => { res.json(await roster(getAuth(req).userId!)); });
router.post("/scan", async (req, res) => { res.json(await scanQr(getAuth(req).userId!, scanInput.parse(req.body))); });
router.put("/:id/policy", async (req, res) => {
  await savePolicy(getAuth(req).userId!, String(req.params.id), policyInput.parse(req.body)); res.json({ ok: true });
});
router.post("/:id/qr", async (req, res) => { res.json(await issueQr(getAuth(req).userId!, String(req.params.id))); });
router.delete("/:id/qr", async (req, res) => {
  await issueQr(getAuth(req).userId!, String(req.params.id), true); res.json({ ok: true });
});
router.post("/:id/review", async (req, res) => {
  await review(getAuth(req).userId!, String(req.params.id), reviewInput.parse(req.body)); res.json({ ok: true });
});
router.use((error: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
  if (error instanceof z.ZodError) { res.status(400).json({ message: "Invalid check-in input. Check your dates, coordinates and reason." }); return; }
  if (error instanceof BookingError) { res.status(error.status).json({ message: error.message }); return; }
  next(error);
});
export default router;
