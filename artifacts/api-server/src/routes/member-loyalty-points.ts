import { Router } from "express";
import { getAuth } from "@clerk/express";
import { GetMemberLoyaltyPointsResponse } from "@workspace/api-zod";
import {
  MEMBER_CONSENT_REQUIRED_CODE,
  MEMBER_CONSENT_REQUIRED_MESSAGE,
  hasCurrentRequiredMemberConsent,
} from "../lib/member-consents";
import { getMemberLoyaltyPoints } from "../lib/member-loyalty-points";

const router = Router();

router.get("/loyalty-points", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  if (!await hasCurrentRequiredMemberConsent(userId)) {
    res.status(403).json({
      code: MEMBER_CONSENT_REQUIRED_CODE,
      message: MEMBER_CONSENT_REQUIRED_MESSAGE,
    });
    return;
  }
  res.json(GetMemberLoyaltyPointsResponse.parse(await getMemberLoyaltyPoints(userId)));
});

export default router;
