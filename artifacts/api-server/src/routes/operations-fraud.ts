import { Router } from "express";
import { getAuth } from "@clerk/express";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db, facilityCheckinQrActivity, facilityProfiles, fraudInvestigations, operationAudit, operators, partners,
} from "@workspace/db";
import {
  CreateFraudInvestigationBody,
  CreateFraudInvestigationResponse,
  GetFraudInvestigationQueueResponse,
  UpdateFraudInvestigationBody,
  UpdateFraudInvestigationParams,
  UpdateFraudInvestigationResponse,
} from "@workspace/api-zod";
import { hasAdminPermission } from "../lib/admin-roles";

const router = Router();

router.use("/fraud", async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in to access fraud investigations." });
    return;
  }
  const [operator] = await db.select({ role: operators.role }).from(operators)
    .where(eq(operators.userId, userId)).limit(1);
  if (!operator || !hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Fraud and Compliance access is required." });
    return;
  }
  res.locals.fraudInvestigationActorId = userId;
  next();
});

router.get("/fraud/signals", async (_req, res): Promise<void> => {
  const rows = await db.select({
    activityId: facilityCheckinQrActivity.id,
    facilityId: facilityProfiles.id,
    facilityName: facilityProfiles.facility,
    city: facilityProfiles.city,
    partnerName: partners.name,
    actorId: facilityCheckinQrActivity.actorId,
    action: facilityCheckinQrActivity.action,
    reason: facilityCheckinQrActivity.reason,
    occurredAt: facilityCheckinQrActivity.createdAt,
    investigationId: fraudInvestigations.id,
    investigationStatus: fraudInvestigations.status,
    investigationOpenedAt: fraudInvestigations.createdAt,
    investigationUpdatedAt: fraudInvestigations.updatedAt,
    resolutionReason: fraudInvestigations.resolutionReason,
  }).from(facilityCheckinQrActivity)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityCheckinQrActivity.facilityId))
    .innerJoin(partners, eq(partners.id, facilityProfiles.partnerId))
    .leftJoin(fraudInvestigations, eq(fraudInvestigations.sourceActivityId, facilityCheckinQrActivity.id))
    .where(eq(facilityCheckinQrActivity.riskFlag, true))
    .orderBy(desc(facilityCheckinQrActivity.createdAt))
    .limit(100);

  res.json(GetFraudInvestigationQueueResponse.parse(rows));
});

router.post("/fraud/investigations", async (req, res): Promise<void> => {
  const parsed = CreateFraudInvestigationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a valid flagged QR activity." });
    return;
  }
  const actorId = res.locals.fraudInvestigationActorId as string;
  const result = await db.transaction(async tx => {
    const [signal] = await tx.select({
      id: facilityCheckinQrActivity.id,
      riskFlag: facilityCheckinQrActivity.riskFlag,
    }).from(facilityCheckinQrActivity)
      .where(eq(facilityCheckinQrActivity.id, parsed.data.sourceActivityId))
      .for("update").limit(1);
    if (!signal) return { kind: "missing" as const };
    if (!signal.riskFlag) return { kind: "not_flagged" as const };

    const [created] = await tx.insert(fraudInvestigations).values({
      id: randomUUID(),
      sourceActivityId: signal.id,
      status: "open",
      openedBy: actorId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing({ target: fraudInvestigations.sourceActivityId }).returning();
    if (!created) return { kind: "duplicate" as const };

    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId,
      action: "fraud.investigation.opened",
      targetId: created.id,
      detail: `source_activity=${signal.id}`,
    });
    return { kind: "created" as const, row: created };
  });

  if (result.kind === "missing") {
    res.status(404).json({ message: "The flagged activity was not found." });
    return;
  }
  if (result.kind === "not_flagged") {
    res.status(409).json({ message: "Only a recorded risk flag can start an investigation." });
    return;
  }
  if (result.kind === "duplicate") {
    res.status(409).json({ message: "An investigation already exists for this activity." });
    return;
  }
  res.status(201).json(CreateFraudInvestigationResponse.parse(result.row));
});

router.patch("/fraud/investigations/:id", async (req, res): Promise<void> => {
  const params = UpdateFraudInvestigationParams.safeParse(req.params);
  const parsed = UpdateFraudInvestigationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Choose a valid investigation status and resolution reason." });
    return;
  }
  const actorId = res.locals.fraudInvestigationActorId as string;
  const result = await db.transaction(async tx => {
    const [current] = await tx.select().from(fraudInvestigations)
      .where(eq(fraudInvestigations.id, params.data.id)).for("update").limit(1);
    if (!current) return { kind: "missing" as const };
    const next = parsed.data.status;
    if (current.status === next) return { kind: "unchanged" as const, row: current };
    const validTransition = current.status === "open" && next === "under_review"
      || current.status === "under_review" && ["resolved_no_action", "action_taken"].includes(next);
    if (!validTransition) return { kind: "invalid_transition" as const };

    const terminal = next === "resolved_no_action" || next === "action_taken";
    const resolutionReason = terminal ? parsed.data.resolutionReason?.trim() ?? "" : null;
    if (terminal && resolutionReason!.length < 10) return { kind: "reason_required" as const };
    const now = new Date();
    const [updated] = await tx.update(fraudInvestigations).set({
      status: next,
      resolutionReason,
      resolvedBy: terminal ? actorId : null,
      updatedAt: now,
    }).where(eq(fraudInvestigations.id, current.id)).returning();

    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId,
      action: "fraud.investigation.status_updated",
      targetId: current.id,
      detail: `status=${current.status}->${next}${terminal ? ";resolution_reason_recorded" : ""}`,
    });
    return { kind: "updated" as const, row: updated };
  });

  if (result.kind === "missing") {
    res.status(404).json({ message: "Investigation not found." });
    return;
  }
  if (result.kind === "invalid_transition") {
    res.status(409).json({ message: "Investigations must be reviewed before they can be resolved." });
    return;
  }
  if (result.kind === "reason_required") {
    res.status(400).json({ message: "Enter at least ten characters explaining the resolution." });
    return;
  }
  res.json(UpdateFraudInvestigationResponse.parse(result.row));
});

export default router;
