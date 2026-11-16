import { Router } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, operationAudit, operators, partners } from "@workspace/db";
import { isAccessSuspended } from "../lib/account-access-restrictions";
import {
  ASSIGNABLE_PARTNER_ROLES,
  canManagePartnerStaff,
  isPartnerOperatorRole,
  type AssignablePartnerRole,
} from "../lib/partner-roles";

const router = Router();
const assignStaffInput = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(ASSIGNABLE_PARTNER_ROLES),
}).strict();

type PartnerOwner = typeof operators.$inferSelect;

router.use(async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in to manage partner staff." });
    return;
  }
  const [operator] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
  if (!operator || !operator.partnerId) {
    res.status(403).json({ message: "Only the partner owner can manage partner staff." });
    return;
  }
  const [partner] = await db.select({
    id: partners.id,
    ownerUserId: partners.ownerUserId,
    approved: partners.approved,
  }).from(partners).where(eq(partners.id, operator.partnerId)).limit(1);
  if (!partner || !canManagePartnerStaff(operator, partner)) {
    res.status(403).json({ message: "Approved partner-owner access is required." });
    return;
  }
  if (await isAccessSuspended("partner", partner.id)) {
    res.status(403).json({ message: "Partner operations are temporarily restricted. Contact MaydanGo support." });
    return;
  }
  res.locals.partnerOwner = operator;
  res.locals.partnerStaffScope = partner;
  next();
});

function ownerFor(res: import("express").Response): PartnerOwner {
  return res.locals.partnerOwner as PartnerOwner;
}

function scopeFor(res: import("express").Response) {
  return res.locals.partnerStaffScope as { id: string; ownerUserId: string; approved: boolean };
}

async function publicStaffRecord(operator: typeof operators.$inferSelect, ownerUserId: string) {
  try {
    const user = await clerkClient.users.getUser(operator.userId);
    return {
      userId: operator.userId,
      email: user.emailAddresses.find(address => address.verification?.status === "verified")?.emailAddress
        ?? user.primaryEmailAddress?.emailAddress
        ?? null,
      role: operator.role,
      owner: operator.userId === ownerUserId,
    };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) {
      return {
        userId: operator.userId,
        email: null,
        role: operator.role,
        owner: false,
      };
    }
    throw error;
  }
}

router.get("/", async (_req, res): Promise<void> => {
  const owner = ownerFor(res);
  const partnerId = owner.partnerId!;
  const records = await db.select().from(operators).where(eq(operators.partnerId, partnerId));
  const staff = records.filter(record => isPartnerOperatorRole(record.role));
  const response = await Promise.all(staff.map(record => publicStaffRecord(record, owner.userId)));
  res.json({ partnerId, members: response });
});

router.post("/", async (req, res): Promise<void> => {
  const owner = ownerFor(res);
  const partner = scopeFor(res);
  const parsed = assignStaffInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a valid MaydanGo account email and choose a staff role." });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const matches = await clerkClient.users.getUserList({ emailAddress: [email], limit: 10 });
  const user = matches.data.find(candidate => candidate.emailAddresses.some(address =>
    address.emailAddress.toLowerCase() === email && address.verification?.status === "verified"));
  if (!user) {
    res.status(404).json({ message: "A verified MaydanGo account with this email was not found. The staff member must create an account first." });
    return;
  }
  if (user.id === partner.ownerUserId) {
    res.status(409).json({ message: "The partner owner already has full owner access." });
    return;
  }

  const result = await db.transaction(async tx => {
    const [existing] = await tx.select().from(operators).where(eq(operators.userId, user.id)).for("update");
    if (existing && (!isPartnerOperatorRole(existing.role)
      || existing.role === "partner"
      || existing.partnerId !== partner.id)) {
      return { kind: "role_conflict" as const };
    }
    if (existing) {
      await tx.update(operators).set({ role: parsed.data.role }).where(eq(operators.userId, user.id));
    } else {
      await tx.insert(operators).values({
        userId: user.id,
        role: parsed.data.role satisfies AssignablePartnerRole,
        partnerId: partner.id,
      });
    }
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: owner.userId,
      action: existing ? "partner.staff.role_updated" : "partner.staff.assigned",
      targetId: user.id,
      detail: parsed.data.role,
    });
    const [assigned] = await tx.select().from(operators).where(eq(operators.userId, user.id));
    return { kind: "saved" as const, operator: assigned, updated: !!existing };
  });

  if (result.kind === "role_conflict") {
    res.status(409).json({ message: "This account already has a different MaydanGo staff role or belongs to another partner." });
    return;
  }
  res.status(result.updated ? 200 : 201).json({
    userId: result.operator!.userId,
    email,
    role: result.operator!.role,
    owner: false,
  });
});

router.delete("/:userId", async (req, res): Promise<void> => {
  const owner = ownerFor(res);
  const partner = scopeFor(res);
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  if (!userId || userId === owner.userId || userId === partner.ownerUserId) {
    res.status(400).json({ message: "The partner owner cannot be removed from the partner account." });
    return;
  }
  const result = await db.transaction(async tx => {
    const [target] = await tx.select().from(operators)
      .where(eq(operators.userId, userId)).for("update");
    if (!target || target.partnerId !== partner.id || !isPartnerOperatorRole(target.role) || target.role === "partner") {
      return false;
    }
    await tx.delete(operators).where(and(
      eq(operators.userId, userId),
      eq(operators.partnerId, partner.id),
    ));
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: owner.userId,
      action: "partner.staff.access_removed",
      targetId: userId,
      detail: target.role,
    });
    return true;
  });
  if (!result) {
    res.status(404).json({ message: "Partner staff member was not found." });
    return;
  }
  res.json({ ok: true });
});

export default router;
