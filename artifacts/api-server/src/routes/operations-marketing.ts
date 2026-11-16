import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, operationAudit, operators, partners } from "@workspace/db";
import { isAccessSuspended } from "../lib/account-access-restrictions";
import { hasPartnerPermission, isPartnerOperatorRole } from "../lib/partner-roles";
import {
  GetPartnerMarketingProfileResponse, UpdatePartnerMarketingProfileBody,
  UpdatePartnerMarketingProfileResponse,
} from "@workspace/api-zod";

const router = Router();
type Operator = typeof operators.$inferSelect;

router.use(async (req, res, next) => {
  if (req.path !== "/marketing-profile") {
    next();
    return;
  }
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in to access partner marketing materials." });
    return;
  }
  const [operator] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
  if (!operator || !isPartnerOperatorRole(operator.role)
    || !hasPartnerPermission(operator.role, "marketing") || !operator.partnerId) {
    res.status(403).json({ message: "An approved partner account is required." });
    return;
  }
  const [partner] = await db.select({
    id: partners.id,
    name: partners.name,
    logoUrl: partners.logoUrl,
    approved: partners.approved,
  }).from(partners).where(eq(partners.id, operator.partnerId)).limit(1);
  if (!partner?.approved) {
    res.status(403).json({ message: "Partner approval is required to access marketing materials." });
    return;
  }
  if (await isAccessSuspended("partner", operator.partnerId)) {
    res.status(403).json({ message: "Partner operations are temporarily restricted. Contact MaydanGo support." });
    return;
  }
  res.locals.marketingOperator = operator;
  res.locals.marketingPartner = partner;
  next();
});

router.get("/marketing-profile", async (_req, res) => {
  const partner = res.locals.marketingPartner as { id: string; name: string; logoUrl: string | null };
  res.json(GetPartnerMarketingProfileResponse.parse({
    partnerId: partner.id,
    partnerName: partner.name,
    logoUrl: partner.logoUrl,
  }));
});

router.put("/marketing-profile", async (req, res) => {
  const input = UpdatePartnerMarketingProfileBody.parse(req.body);
  if (input.logoUrl) {
    const url = new URL(input.logoUrl);
    if (url.protocol !== "https:") {
      res.status(400).json({ message: "Partner logos must use a secure HTTPS URL." });
      return;
    }
  }
  const operator = res.locals.marketingOperator as Operator;
  const partner = res.locals.marketingPartner as { id: string };
  const updated = await db.transaction(async tx => {
    const [row] = await tx.update(partners)
      .set({ logoUrl: input.logoUrl })
      .where(and(eq(partners.id, partner.id), eq(partners.approved, true)))
      .returning({ id: partners.id, name: partners.name, logoUrl: partners.logoUrl });
    if (!row) return null;
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "partner.marketing.logo_update",
      targetId: row.id,
      detail: input.logoUrl ? "Logo URL updated." : "Logo URL removed.",
    });
    return row;
  });
  if (!updated) {
    res.status(404).json({ message: "Partner profile was not found." });
    return;
  }
  res.json(UpdatePartnerMarketingProfileResponse.parse({
    partnerId: updated.id,
    partnerName: updated.name,
    logoUrl: updated.logoUrl,
  }));
});

export default router;
