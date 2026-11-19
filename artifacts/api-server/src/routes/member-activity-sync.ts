import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import type { MemberActivitySyncProvider } from "@workspace/db";
import {
  AcceptMemberActivitySyncBody,
  AcceptMemberActivitySyncResponse,
  DeleteMemberActivitySyncDataResponse,
  GetMemberActivitySyncResponse,
  RevokeMemberActivitySyncResponse,
  SyncMemberAppleHealthActivityBody,
} from "@workspace/api-zod";
import {
  MEMBER_CONSENT_REQUIRED_CODE,
  MEMBER_CONSENT_REQUIRED_MESSAGE,
  hasCurrentRequiredMemberConsent,
} from "../lib/member-consents";
import { isAccessSuspended } from "../lib/account-access-restrictions";
import { addCalendarDays, iraqToday } from "../lib/fitness-challenges";
import {
  acceptMemberActivitySync,
  deleteMemberActivitySyncData,
  getMemberActivitySyncState,
  MemberActivitySyncConsentRequiredError,
  MEMBER_ACTIVITY_SYNC_CONSENT_VERSION,
  revokeMemberActivitySync,
  syncMemberActivitySummaries,
} from "../lib/member-activity-sync";

const router = Router();

router.get("/activity-sync", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  res.json(GetMemberActivitySyncResponse.parse(await getMemberActivitySyncState(userId)));
});

router.post("/activity-sync/consent", async (req, res): Promise<void> => {
  const parsed = AcceptMemberActivitySyncBody.safeParse(req.body);
  if (!parsed.success || parsed.data.policyVersion !== MEMBER_ACTIVITY_SYNC_CONSENT_VERSION) {
    res.status(400).json({ message: "Review the current activity data notice before enabling this setting." });
    return;
  }
  const userId = getAuth(req).userId!;
  if (!await hasCurrentRequiredMemberConsent(userId)) {
    res.status(403).json({
      code: MEMBER_CONSENT_REQUIRED_CODE,
      message: MEMBER_CONSENT_REQUIRED_MESSAGE,
    });
    return;
  }
  if (await isAccessSuspended("member", userId)) {
    res.status(403).json({ message: "This account is restricted from making changes. Contact MaydanGo support." });
    return;
  }
  res.json(AcceptMemberActivitySyncResponse.parse(await acceptMemberActivitySync(userId)));
});

function syncProviderSummaries(provider: MemberActivitySyncProvider) {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = SyncMemberAppleHealthActivityBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Send valid daily step and completed-workout summaries." });
      return;
    }
    const userId = getAuth(req).userId!;
    if (!await hasCurrentRequiredMemberConsent(userId)) {
      res.status(403).json({
        code: MEMBER_CONSENT_REQUIRED_CODE,
        message: MEMBER_CONSENT_REQUIRED_MESSAGE,
      });
      return;
    }
    if (await isAccessSuspended("member", userId)) {
      res.status(403).json({ message: "This account is restricted from making changes. Contact MaydanGo support." });
      return;
    }
    const current = await getMemberActivitySyncState(userId);
    if (current.consent.status !== "enabled") {
      res.status(403).json({ message: "Enable activity-data sharing before syncing health summaries." });
      return;
    }

    const today = iraqToday();
    const earliestDate = addCalendarDays(today, -29);
    const seenDates = new Set<string>();
    for (const summary of parsed.data.summaries) {
      const parsedDate = new Date(`${summary.activityDate}T00:00:00Z`);
      if (summary.activityDate < earliestDate || summary.activityDate > today
        || !Number.isFinite(parsedDate.getTime())
        || parsedDate.toISOString().slice(0, 10) !== summary.activityDate
        || seenDates.has(summary.activityDate)
        || (summary.steps === null && summary.completedWorkouts === 0)) {
        res.status(400).json({ message: "Summaries must contain unique, non-empty dates from the last 30 Iraq-local days." });
        return;
      }
      seenDates.add(summary.activityDate);
    }

    try {
      res.json(GetMemberActivitySyncResponse.parse(await syncMemberActivitySummaries(
        userId,
        provider,
        parsed.data.summaries,
      )));
    } catch (error) {
      if (error instanceof MemberActivitySyncConsentRequiredError) {
        res.status(403).json({ message: error.message });
        return;
      }
      throw error;
    }
  };
}

router.post("/activity-sync/apple-health/sync", syncProviderSummaries("apple_health"));
router.post("/activity-sync/health-connect/sync", syncProviderSummaries("health_connect"));

router.delete("/activity-sync/consent", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  res.json(RevokeMemberActivitySyncResponse.parse(await revokeMemberActivitySync(userId)));
});

router.delete("/activity-sync/data", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  res.json(DeleteMemberActivitySyncDataResponse.parse(await deleteMemberActivitySyncData(userId)));
});

export default router;
