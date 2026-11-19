import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  AcceptMemberActivitySyncBody,
  AcceptMemberActivitySyncResponse,
  DeleteMemberActivitySyncDataResponse,
  GetMemberActivitySyncResponse,
  RevokeMemberActivitySyncResponse,
} from "@workspace/api-zod";
import {
  MEMBER_CONSENT_REQUIRED_CODE,
  MEMBER_CONSENT_REQUIRED_MESSAGE,
  hasCurrentRequiredMemberConsent,
} from "../lib/member-consents";
import { isAccessSuspended } from "../lib/account-access-restrictions";
import {
  acceptMemberActivitySync,
  deleteMemberActivitySyncData,
  getMemberActivitySyncState,
  MEMBER_ACTIVITY_SYNC_CONSENT_VERSION,
  revokeMemberActivitySync,
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

router.delete("/activity-sync/consent", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  res.json(RevokeMemberActivitySyncResponse.parse(await revokeMemberActivitySync(userId)));
});

router.delete("/activity-sync/data", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  res.json(DeleteMemberActivitySyncDataResponse.parse(await deleteMemberActivitySyncData(userId)));
});

export default router;
