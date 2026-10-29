import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { BookingError } from "../lib/reservations";
import { joinWaitlist, leaveWaitlist, memberWaitlist } from "../lib/waitlist";

const router = Router();

function memberId(req: Request) {
  const id = getAuth(req).userId;
  if (!id) throw new BookingError(401, "Sign in to manage your waiting list.");
  return id;
}

router.get("/", async (req, res) => {
  res.json(await memberWaitlist(memberId(req)));
});

router.post("/", async (req, res) => {
  const parsed = z.object({ offeringId: z.string().min(1).max(120) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Choose a class to join its waiting list." }); return; }
  res.status(201).json(await joinWaitlist(memberId(req), parsed.data.offeringId));
});

router.delete("/:id", async (req, res) => {
  res.json(await leaveWaitlist(memberId(req), String(req.params.id)));
});

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof z.ZodError) { res.status(400).json({ message: error.issues.map(issue => issue.message).join(" ") }); return; }
  if (error instanceof BookingError) { res.status(error.status).json({ message: error.message }); return; }
  next(error);
});

export default router;
