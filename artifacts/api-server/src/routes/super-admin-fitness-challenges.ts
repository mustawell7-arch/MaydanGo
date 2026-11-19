import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq } from "drizzle-orm";
import {
  db, fitnessChallenges, operationAudit,
} from "@workspace/db";
import {
  ArchiveSuperAdminFitnessChallengeParams,
  ArchiveSuperAdminFitnessChallengeResponse,
  CreateSuperAdminFitnessChallengeBody,
  CreateSuperAdminFitnessChallengeResponse,
  GetSuperAdminFitnessChallengesResponse,
  PublishSuperAdminFitnessChallengeParams,
  PublishSuperAdminFitnessChallengeResponse,
  UpdateSuperAdminFitnessChallengeBody,
  UpdateSuperAdminFitnessChallengeParams,
  UpdateSuperAdminFitnessChallengeResponse,
} from "@workspace/api-zod";
import { iraqToday, validFitnessChallengeDates } from "../lib/fitness-challenges";

const router = Router();

async function recordAudit(actorId: string, action: string, challengeId: string): Promise<void> {
  await db.insert(operationAudit).values({
    id: randomUUID(),
    actorId,
    action,
    targetId: challengeId,
    detail: `Fitness challenge ${challengeId}: ${action.replaceAll("_", " ")}.`,
  });
}

router.get("/fitness-challenges", async (_req, res): Promise<void> => {
  const rows = await db.select().from(fitnessChallenges)
    .orderBy(asc(fitnessChallenges.createdAt), asc(fitnessChallenges.id));
  res.json(GetSuperAdminFitnessChallengesResponse.parse(rows));
});

router.post("/fitness-challenges", async (req, res): Promise<void> => {
  const parsed = CreateSuperAdminFitnessChallengeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Provide complete challenge details in all three languages." }); return; }
  const input = parsed.data;
  if (!validFitnessChallengeDates(input.startDate, input.endDate, input.goalActiveDays)) {
    res.status(400).json({ message: "The date range and active-day target must be valid." });
    return;
  }
  const actorId = getAuth(req).userId!;
  const [challenge] = await db.insert(fitnessChallenges).values({
    id: randomUUID(),
    localizedTitle: input.localizedTitle,
    localizedDescription: input.localizedDescription,
    startDate: input.startDate,
    endDate: input.endDate,
    goalActiveDays: input.goalActiveDays,
    status: "draft",
    createdBy: actorId,
  }).returning();
  await recordAudit(actorId, "fitness_challenge_created", challenge.id);
  res.status(201).json(CreateSuperAdminFitnessChallengeResponse.parse(challenge));
});

router.put("/fitness-challenges/:challengeId", async (req, res): Promise<void> => {
  const params = UpdateSuperAdminFitnessChallengeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Choose a valid challenge." }); return; }
  const parsed = UpdateSuperAdminFitnessChallengeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Provide complete challenge details in all three languages." }); return; }
  const input = parsed.data;
  if (!validFitnessChallengeDates(input.startDate, input.endDate, input.goalActiveDays)) {
    res.status(400).json({ message: "The date range and active-day target must be valid." });
    return;
  }
  const actorId = getAuth(req).userId!;
  const [challenge] = await db.update(fitnessChallenges).set({
    localizedTitle: input.localizedTitle,
    localizedDescription: input.localizedDescription,
    startDate: input.startDate,
    endDate: input.endDate,
    goalActiveDays: input.goalActiveDays,
    updatedAt: new Date(),
  }).where(and(
    eq(fitnessChallenges.id, params.data.challengeId),
    eq(fitnessChallenges.status, "draft"),
  )).returning();
  if (!challenge) {
    const [existing] = await db.select({ id: fitnessChallenges.id }).from(fitnessChallenges)
      .where(eq(fitnessChallenges.id, params.data.challengeId)).limit(1);
    res.status(existing ? 409 : 404).json({
      message: existing ? "Only unpublished challenge drafts can be edited." : "Challenge not found.",
    });
    return;
  }
  await recordAudit(actorId, "fitness_challenge_updated", challenge.id);
  res.json(UpdateSuperAdminFitnessChallengeResponse.parse(challenge));
});

router.post("/fitness-challenges/:challengeId/publish", async (req, res): Promise<void> => {
  const params = PublishSuperAdminFitnessChallengeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Choose a valid challenge." }); return; }
  const [challenge] = await db.select().from(fitnessChallenges)
    .where(eq(fitnessChallenges.id, params.data.challengeId)).limit(1);
  if (!challenge) { res.status(404).json({ message: "Challenge not found." }); return; }
  if (challenge.status !== "draft" || challenge.endDate < iraqToday()) {
    res.status(409).json({ message: "Only a current or upcoming draft can be published." });
    return;
  }
  const actorId = getAuth(req).userId!;
  const [published] = await db.update(fitnessChallenges).set({
    status: "published",
    updatedAt: new Date(),
  }).where(and(
    eq(fitnessChallenges.id, challenge.id),
    eq(fitnessChallenges.status, "draft"),
  )).returning();
  if (!published) { res.status(409).json({ message: "The challenge changed before it could be published." }); return; }
  await recordAudit(actorId, "fitness_challenge_published", challenge.id);
  res.json(PublishSuperAdminFitnessChallengeResponse.parse(published));
});

router.post("/fitness-challenges/:challengeId/archive", async (req, res): Promise<void> => {
  const params = ArchiveSuperAdminFitnessChallengeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Choose a valid challenge." }); return; }
  const actorId = getAuth(req).userId!;
  const [challenge] = await db.update(fitnessChallenges).set({
    status: "archived",
    updatedAt: new Date(),
  }).where(eq(fitnessChallenges.id, params.data.challengeId)).returning();
  if (!challenge) { res.status(404).json({ message: "Challenge not found." }); return; }
  await recordAudit(actorId, "fitness_challenge_archived", challenge.id);
  res.json(ArchiveSuperAdminFitnessChallengeResponse.parse(challenge));
});

export default router;
