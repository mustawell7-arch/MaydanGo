import { Router } from "express";
import { z } from "zod";
import {
  GetPublicLegalPoliciesResponse,
  GetPublicLegalPolicyVersionResponse,
} from "@workspace/api-zod";
import { LEGAL_POLICY_KEYS, getCurrentLegalPolicies, getPublicLegalPolicyVersion } from "../lib/legal-policies";
import type { LegalPolicyKey } from "@workspace/db";

const router = Router();
const policyKeySchema = z.enum(LEGAL_POLICY_KEYS as [LegalPolicyKey, ...LegalPolicyKey[]]);

function toPublicPolicy(row: Awaited<ReturnType<typeof getCurrentLegalPolicies>>[number]) {
  return {
    policyKey: row.policyKey,
    version: row.version,
    translations: row.translations,
    effectiveAt: row.effectiveAt.toISOString(),
  };
}

router.get("/", async (_req, res): Promise<void> => {
  const rows = await getCurrentLegalPolicies();
  res.json(GetPublicLegalPoliciesResponse.parse(rows.map(toPublicPolicy)));
});

router.get("/:policyKey", async (req, res): Promise<void> => {
  const parsedKey = policyKeySchema.safeParse(req.params.policyKey);
  const parsedQuery = z.object({
    version: z.string().trim().min(1).max(40).optional(),
  }).safeParse(req.query);
  if (!parsedKey.success || !parsedQuery.success) {
    res.status(400).json({ message: "Choose a valid policy and version." });
    return;
  }
  const row = await getPublicLegalPolicyVersion(parsedKey.data, parsedQuery.data.version);
  if (!row) {
    res.status(404).json({ message: "This published policy version is not available." });
    return;
  }
  res.json(GetPublicLegalPolicyVersionResponse.parse(toPublicPolicy(row)));
});

export default router;
