import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import {
  attendance, db, fitnessChallengeParticipants, fitnessChallenges, fitnessChallengeSelfReports,
} from "@workspace/db";
import {
  GetMemberFitnessChallengesResponse,
  JoinMemberFitnessChallengeParams,
  JoinMemberFitnessChallengeResponse,
  LeaveMemberFitnessChallengeParams,
  LogMemberFitnessChallengeTodayParams,
  LogMemberFitnessChallengeTodayResponse,
  UndoMemberFitnessChallengeTodayParams,
} from "@workspace/api-zod";
import {
  MEMBER_CONSENT_REQUIRED_CODE,
  MEMBER_CONSENT_REQUIRED_MESSAGE,
  hasCurrentRequiredMemberConsent,
} from "../lib/member-consents";
import { iraqDateKey, iraqDayBounds, iraqToday } from "../lib/fitness-challenges";
import { isAccessSuspended } from "../lib/account-access-restrictions";

const router = Router();

async function consentIsCurrent(userId: string, res: import("express").Response): Promise<boolean> {
  if (await hasCurrentRequiredMemberConsent(userId)) return true;
  res.status(403).json({
    code: MEMBER_CONSENT_REQUIRED_CODE,
    message: MEMBER_CONSENT_REQUIRED_MESSAGE,
  });
  return false;
}

async function requireMemberAction(
  userId: string,
  res: import("express").Response,
): Promise<boolean> {
  if (!await consentIsCurrent(userId, res)) return false;
  if (await isAccessSuspended("member", userId)) {
    res.status(403).json({ message: "This account is restricted from making changes. Contact MaydanGo support." });
    return false;
  }
  return true;
}

async function listMemberFitnessChallenges(userId: string) {
  const today = iraqToday();
  const challengeRows = await db.select().from(fitnessChallenges)
    .where(inArray(fitnessChallenges.status, ["published", "archived"]))
    .orderBy(asc(fitnessChallenges.startDate), asc(fitnessChallenges.id));
  if (!challengeRows.length) return [];

  const participantRows = await db.select().from(fitnessChallengeParticipants).where(and(
    eq(fitnessChallengeParticipants.userId, userId),
    inArray(fitnessChallengeParticipants.challengeId, challengeRows.map(row => row.id)),
  ));
  const participantByChallenge = new Map(participantRows.map(row => [row.challengeId, row]));
  const visibleChallenges = challengeRows.filter(challenge => {
    const joined = participantByChallenge.has(challenge.id);
    return joined || (challenge.status === "published" && challenge.endDate >= today);
  });
  if (!visibleChallenges.length) return [];

  const joinedIds = visibleChallenges
    .filter(challenge => participantByChallenge.has(challenge.id))
    .map(challenge => challenge.id);
  const selfReports = joinedIds.length
    ? await db.select().from(fitnessChallengeSelfReports).where(and(
      eq(fitnessChallengeSelfReports.userId, userId),
      inArray(fitnessChallengeSelfReports.challengeId, joinedIds),
    ))
    : [];
  const firstDay = visibleChallenges
    .filter(challenge => participantByChallenge.has(challenge.id))
    .map(challenge => iraqDayBounds(challenge.startDate).start)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const lastDay = visibleChallenges
    .filter(challenge => participantByChallenge.has(challenge.id))
    .map(challenge => iraqDayBounds(challenge.endDate).end)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const verifiedRows = joinedIds.length && firstDay && lastDay
    ? await db.select({ checkedInAt: attendance.checkedInAt }).from(attendance).where(and(
      eq(attendance.userId, userId),
      eq(attendance.status, "confirmed"),
      eq(attendance.settlementEligible, true),
      gte(attendance.checkedInAt, firstDay),
      lt(attendance.checkedInAt, lastDay),
    ))
    : [];

  return visibleChallenges.map(challenge => {
    const participant = participantByChallenge.get(challenge.id);
    const joinedAt = participant?.joinedAt ?? null;
    const logs = participant
      ? selfReports.filter(report => report.challengeId === challenge.id).map(report => report.activityDate).sort()
      : [];
    const verified = participant
      ? verifiedRows
        .filter(row => row.checkedInAt >= joinedAt!)
        .map(row => iraqDateKey(row.checkedInAt))
        .filter(day => day >= challenge.startDate && day <= challenge.endDate)
        .filter((day, index, days) => days.indexOf(day) === index)
        .sort()
      : [];
    const activeDays = new Set([...logs, ...verified]).size;
    const activeToday = logs.includes(today) || verified.includes(today);
    return {
      id: challenge.id,
      localizedTitle: challenge.localizedTitle,
      localizedDescription: challenge.localizedDescription,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      goalActiveDays: challenge.goalActiveDays,
      status: challenge.status as "published" | "archived",
      joined: !!participant,
      joinedAt,
      activeDays,
      selfLoggedDates: logs,
      verifiedAttendanceDates: verified,
      canJoin: !participant && challenge.status === "published" && challenge.endDate >= today,
      canLogToday: !!participant
        && challenge.status === "published"
        && today >= challenge.startDate
        && today <= challenge.endDate
        && !activeToday,
    };
  });
}

router.get("/fitness-challenges", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  if (!await consentIsCurrent(userId, res)) return;
  res.json(GetMemberFitnessChallengesResponse.parse(await listMemberFitnessChallenges(userId)));
});

router.post("/fitness-challenges/:challengeId/join", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  if (!await requireMemberAction(userId, res)) return;
  const params = JoinMemberFitnessChallengeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Choose a valid fitness challenge." }); return; }
  const today = iraqToday();
  const [challenge] = await db.select({
    id: fitnessChallenges.id,
    endDate: fitnessChallenges.endDate,
    status: fitnessChallenges.status,
  }).from(fitnessChallenges).where(eq(fitnessChallenges.id, params.data.challengeId)).limit(1);
  if (!challenge || challenge.status !== "published" || challenge.endDate < today) {
    res.status(404).json({ message: "This challenge is not accepting members." });
    return;
  }
  const [existing] = await db.select().from(fitnessChallengeParticipants).where(and(
    eq(fitnessChallengeParticipants.challengeId, challenge.id),
    eq(fitnessChallengeParticipants.userId, userId),
  )).limit(1);
  if (existing) {
    res.json(JoinMemberFitnessChallengeResponse.parse({ challengeId: challenge.id, joinedAt: existing.joinedAt }));
    return;
  }
  const [participant] = await db.insert(fitnessChallengeParticipants).values({
    id: randomUUID(),
    challengeId: challenge.id,
    userId,
  }).onConflictDoNothing().returning();
  const joinedAt = participant?.joinedAt ?? (await db.select({ joinedAt: fitnessChallengeParticipants.joinedAt })
    .from(fitnessChallengeParticipants).where(and(
      eq(fitnessChallengeParticipants.challengeId, challenge.id),
      eq(fitnessChallengeParticipants.userId, userId),
    )).limit(1))[0]?.joinedAt;
  if (!joinedAt) { res.status(409).json({ message: "The challenge could not be joined. Please try again." }); return; }
  res.json(JoinMemberFitnessChallengeResponse.parse({ challengeId: challenge.id, joinedAt }));
});

router.delete("/fitness-challenges/:challengeId/participation", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  if (!await requireMemberAction(userId, res)) return;
  const params = LeaveMemberFitnessChallengeParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Choose a valid fitness challenge." }); return; }
  const [participant] = await db.select({ id: fitnessChallengeParticipants.id }).from(fitnessChallengeParticipants).where(and(
    eq(fitnessChallengeParticipants.challengeId, params.data.challengeId),
    eq(fitnessChallengeParticipants.userId, userId),
  )).limit(1);
  if (!participant) { res.status(404).json({ message: "Challenge participation was not found." }); return; }
  await db.transaction(async tx => {
    await tx.delete(fitnessChallengeSelfReports).where(and(
      eq(fitnessChallengeSelfReports.challengeId, params.data.challengeId),
      eq(fitnessChallengeSelfReports.userId, userId),
    ));
    await tx.delete(fitnessChallengeParticipants).where(eq(fitnessChallengeParticipants.id, participant.id));
  });
  res.status(204).end();
});

router.post("/fitness-challenges/:challengeId/log-today", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  if (!await requireMemberAction(userId, res)) return;
  const params = LogMemberFitnessChallengeTodayParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Choose a valid fitness challenge." }); return; }
  const today = iraqToday();
  const [challenge] = await db.select().from(fitnessChallenges).where(and(
    eq(fitnessChallenges.id, params.data.challengeId),
    eq(fitnessChallenges.status, "published"),
  )).limit(1);
  if (!challenge || today < challenge.startDate || today > challenge.endDate) {
    res.status(404).json({ message: "This challenge is not active today." });
    return;
  }
  const [participant] = await db.select({ joinedAt: fitnessChallengeParticipants.joinedAt })
    .from(fitnessChallengeParticipants).where(and(
      eq(fitnessChallengeParticipants.challengeId, challenge.id),
      eq(fitnessChallengeParticipants.userId, userId),
    )).limit(1);
  if (!participant) { res.status(403).json({ message: "Join this challenge before logging activity." }); return; }
  const bounds = iraqDayBounds(today);
  const [verifiedAttendance] = await db.select({ id: attendance.id }).from(attendance).where(and(
    eq(attendance.userId, userId),
    eq(attendance.status, "confirmed"),
    eq(attendance.settlementEligible, true),
    gte(attendance.checkedInAt, bounds.start > participant.joinedAt ? bounds.start : participant.joinedAt),
    lt(attendance.checkedInAt, bounds.end),
  )).limit(1);
  if (verifiedAttendance) {
    res.status(409).json({ message: "Today's activity is already counted from a partner-confirmed visit." });
    return;
  }
  await db.insert(fitnessChallengeSelfReports).values({
    id: randomUUID(),
    challengeId: challenge.id,
    userId,
    activityDate: today,
  }).onConflictDoNothing();
  res.json(LogMemberFitnessChallengeTodayResponse.parse({ challengeId: challenge.id, activityDate: today }));
});

router.delete("/fitness-challenges/:challengeId/log-today", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  if (!await requireMemberAction(userId, res)) return;
  const params = UndoMemberFitnessChallengeTodayParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ message: "Choose a valid fitness challenge." }); return; }
  const today = iraqToday();
  const [removed] = await db.delete(fitnessChallengeSelfReports).where(and(
    eq(fitnessChallengeSelfReports.challengeId, params.data.challengeId),
    eq(fitnessChallengeSelfReports.userId, userId),
    eq(fitnessChallengeSelfReports.activityDate, today),
  )).returning({ id: fitnessChallengeSelfReports.id });
  if (!removed) { res.status(404).json({ message: "No self-reported activity was found for today." }); return; }
  res.status(204).end();
});

export default router;
