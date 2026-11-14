import { Router, type Response } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { hasAdminPermission } from "../lib/admin-roles";
import {
  db, facilityProfiles, facilityQualityAssessments, facilityQualityEmergencyContacts, facilityQualityIncidents,
  operationAudit, operators, partners,
} from "@workspace/db";
import {
  CreateFacilityQualityAssessmentBody, CreateFacilityQualityAssessmentResponse,
  CreateFacilityQualityIncidentBody, CreateFacilityQualityIncidentResponse,
  GetFacilityQualityControlResponse, UpdateFacilityQualityAssessmentBody,
  UpdateFacilityQualityAssessmentParams, UpdateFacilityQualityAssessmentResponse,
  UpdateFacilityQualityIncidentBody, UpdateFacilityQualityIncidentParams,
  UpdateFacilityQualityIncidentResponse, UpsertFacilityEmergencyContactBody,
  UpsertFacilityEmergencyContactParams, UpsertFacilityEmergencyContactResponse,
} from "@workspace/api-zod";

const router = Router();
type Operator = typeof operators.$inferSelect;
type QualityStatus = "approved" | "action_required" | "suspended";

router.use(async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ message: "Sign in to access facility quality records." });
    return;
  }
  const [operator] = await db.select().from(operators).where(eq(operators.userId, userId)).limit(1);
  if (!operator || (!hasAdminPermission(operator.role, "fraud_compliance") && operator.role !== "partner")) {
    res.status(403).json({ message: "Administrator or approved partner access is required." });
    return;
  }
  if (operator.role === "partner") {
    if (!operator.partnerId) {
      res.status(403).json({ message: "This partner account is not assigned to a partner." });
      return;
    }
    const [partner] = await db.select({ approved: partners.approved })
      .from(partners).where(eq(partners.id, operator.partnerId)).limit(1);
    if (!partner?.approved) {
      res.status(403).json({ message: "Partner approval is required for quality records." });
      return;
    }
  }
  res.locals.qualityOperator = operator;
  next();
});

function operatorFor(res: Response): Operator {
  return res.locals.qualityOperator as Operator;
}

function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isCalendarDate(value: string | null) {
  if (value === null) return true;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function baghdadDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function daysUntilExpiry(expiresOn: string, today = baghdadDate()): number {
  return Math.floor(
    (Date.parse(`${expiresOn.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`))
    / 86_400_000,
  );
}

function assessmentError(input: {
  reviewedOn: Date;
  nextReviewOn: Date | null;
  status: QualityStatus;
  hygieneChecklist: Record<string, string>;
  safetyChecklist: Record<string, string>;
  correctiveAction: string | null;
  correctiveDueOn: Date | null;
}) {
  const reviewedOn = toDateOnly(input.reviewedOn);
  const nextReviewOn = toDateOnly(input.nextReviewOn);
  const correctiveDueOn = toDateOnly(input.correctiveDueOn);
  if (!isCalendarDate(reviewedOn) || !isCalendarDate(nextReviewOn) || !isCalendarDate(correctiveDueOn)) {
    return "Use valid calendar dates.";
  }
  if (reviewedOn && nextReviewOn && nextReviewOn <= reviewedOn) {
    return "The next review date must be after the inspection date.";
  }
  const hasFailedCheck = [...Object.values(input.hygieneChecklist), ...Object.values(input.safetyChecklist)]
    .includes("action_required");
  if (input.status === "approved" && hasFailedCheck) {
    return "An assessment with outstanding checklist items cannot be marked approved.";
  }
  const hasAction = Boolean(input.correctiveAction?.trim());
  if ((input.status !== "approved" || hasFailedCheck) && (!hasAction || !correctiveDueOn)) {
    return "Add a corrective action and due date while any item needs attention.";
  }
  if (hasAction !== Boolean(correctiveDueOn)) {
    return "A corrective action and due date must be set together.";
  }
  return null;
}

async function assessmentDetail(id: string) {
  const [row] = await db.select({
    id: facilityQualityAssessments.id,
    facilityId: facilityQualityAssessments.facilityId,
    partnerId: facilityQualityAssessments.partnerId,
    partnerName: partners.name,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    reviewedOn: facilityQualityAssessments.reviewedOn,
    nextReviewOn: facilityQualityAssessments.nextReviewOn,
    licenceExpiresOn: facilityQualityAssessments.licenceExpiresOn,
    insuranceExpiresOn: facilityQualityAssessments.insuranceExpiresOn,
    hygieneChecklist: facilityQualityAssessments.hygieneChecklist,
    safetyChecklist: facilityQualityAssessments.safetyChecklist,
    status: facilityQualityAssessments.status,
    findings: facilityQualityAssessments.findings,
    correctiveAction: facilityQualityAssessments.correctiveAction,
    correctiveDueOn: facilityQualityAssessments.correctiveDueOn,
    createdBy: facilityQualityAssessments.createdBy,
    updatedBy: facilityQualityAssessments.updatedBy,
    createdAt: facilityQualityAssessments.createdAt,
    updatedAt: facilityQualityAssessments.updatedAt,
  }).from(facilityQualityAssessments)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityAssessments.facilityId))
    .innerJoin(partners, eq(partners.id, facilityQualityAssessments.partnerId))
    .where(eq(facilityQualityAssessments.id, id)).limit(1);
  return row;
}

async function incidentDetail(id: string) {
  const [row] = await db.select({
    id: facilityQualityIncidents.id,
    facilityId: facilityQualityIncidents.facilityId,
    partnerId: facilityQualityIncidents.partnerId,
    partnerName: partners.name,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    incidentType: facilityQualityIncidents.incidentType,
    occurredAt: facilityQualityIncidents.occurredAt,
    description: facilityQualityIncidents.description,
    status: facilityQualityIncidents.status,
    resolution: facilityQualityIncidents.resolution,
    reportedBy: facilityQualityIncidents.reportedBy,
    updatedBy: facilityQualityIncidents.updatedBy,
    createdAt: facilityQualityIncidents.createdAt,
    updatedAt: facilityQualityIncidents.updatedAt,
  }).from(facilityQualityIncidents)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityIncidents.facilityId))
    .innerJoin(partners, eq(partners.id, facilityQualityIncidents.partnerId))
    .where(eq(facilityQualityIncidents.id, id)).limit(1);
  return row;
}

async function emergencyContactDetail(facilityId: string) {
  const [row] = await db.select({
    facilityId: facilityQualityEmergencyContacts.facilityId,
    partnerId: facilityQualityEmergencyContacts.partnerId,
    partnerName: partners.name,
    facility: facilityProfiles.facility,
    city: facilityProfiles.city,
    contactName: facilityQualityEmergencyContacts.contactName,
    contactRole: facilityQualityEmergencyContacts.contactRole,
    contactPhone: facilityQualityEmergencyContacts.contactPhone,
    verifiedAt: facilityQualityEmergencyContacts.verifiedAt,
    updatedAt: facilityQualityEmergencyContacts.updatedAt,
  }).from(facilityQualityEmergencyContacts)
    .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityEmergencyContacts.facilityId))
    .innerJoin(partners, eq(partners.id, facilityQualityEmergencyContacts.partnerId))
    .where(eq(facilityQualityEmergencyContacts.facilityId, facilityId)).limit(1);
  if (!row) return undefined;
  return {
    ...row,
    verificationStatus: row.verifiedAt ? "verified" : "pending",
  };
}

router.get("/", async (_req, res): Promise<void> => {
  const operator = operatorFor(res);
  const partnerScope = operator.role === "partner" ? operator.partnerId : null;
  const facilityCondition = partnerScope ? eq(facilityProfiles.partnerId, partnerScope) : undefined;
  const assessmentCondition = partnerScope ? eq(facilityQualityAssessments.partnerId, partnerScope) : undefined;
  const incidentCondition = partnerScope ? eq(facilityQualityIncidents.partnerId, partnerScope) : undefined;
  const contactCondition = partnerScope ? eq(facilityQualityEmergencyContacts.partnerId, partnerScope) : undefined;
  const [facilities, assessmentRows, incidentRows, contactRows] = await Promise.all([
    db.select({
      id: facilityProfiles.id,
      partnerId: facilityProfiles.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
    }).from(facilityProfiles)
      .innerJoin(partners, eq(partners.id, facilityProfiles.partnerId))
      .where(facilityCondition)
      .orderBy(asc(facilityProfiles.city), asc(facilityProfiles.facility))
      .limit(300),
    db.select({
      id: facilityQualityAssessments.id,
      facilityId: facilityQualityAssessments.facilityId,
      partnerId: facilityQualityAssessments.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      reviewedOn: facilityQualityAssessments.reviewedOn,
      nextReviewOn: facilityQualityAssessments.nextReviewOn,
      licenceExpiresOn: facilityQualityAssessments.licenceExpiresOn,
      insuranceExpiresOn: facilityQualityAssessments.insuranceExpiresOn,
      hygieneChecklist: facilityQualityAssessments.hygieneChecklist,
      safetyChecklist: facilityQualityAssessments.safetyChecklist,
      status: facilityQualityAssessments.status,
      findings: facilityQualityAssessments.findings,
      correctiveAction: facilityQualityAssessments.correctiveAction,
      correctiveDueOn: facilityQualityAssessments.correctiveDueOn,
      createdBy: facilityQualityAssessments.createdBy,
      updatedBy: facilityQualityAssessments.updatedBy,
      createdAt: facilityQualityAssessments.createdAt,
      updatedAt: facilityQualityAssessments.updatedAt,
    }).from(facilityQualityAssessments)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityAssessments.facilityId))
      .innerJoin(partners, eq(partners.id, facilityQualityAssessments.partnerId))
      .where(assessmentCondition)
      .orderBy(desc(facilityQualityAssessments.reviewedOn), desc(facilityQualityAssessments.createdAt))
      .limit(250),
    db.select({
      id: facilityQualityIncidents.id,
      facilityId: facilityQualityIncidents.facilityId,
      partnerId: facilityQualityIncidents.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      incidentType: facilityQualityIncidents.incidentType,
      occurredAt: facilityQualityIncidents.occurredAt,
      description: facilityQualityIncidents.description,
      status: facilityQualityIncidents.status,
      resolution: facilityQualityIncidents.resolution,
      reportedBy: facilityQualityIncidents.reportedBy,
      updatedBy: facilityQualityIncidents.updatedBy,
      createdAt: facilityQualityIncidents.createdAt,
      updatedAt: facilityQualityIncidents.updatedAt,
    }).from(facilityQualityIncidents)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityIncidents.facilityId))
      .innerJoin(partners, eq(partners.id, facilityQualityIncidents.partnerId))
      .where(incidentCondition)
      .orderBy(desc(facilityQualityIncidents.createdAt))
      .limit(250),
    db.select({
      facilityId: facilityQualityEmergencyContacts.facilityId,
      partnerId: facilityQualityEmergencyContacts.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      contactName: facilityQualityEmergencyContacts.contactName,
      contactRole: facilityQualityEmergencyContacts.contactRole,
      contactPhone: facilityQualityEmergencyContacts.contactPhone,
      verifiedAt: facilityQualityEmergencyContacts.verifiedAt,
      updatedAt: facilityQualityEmergencyContacts.updatedAt,
    }).from(facilityQualityEmergencyContacts)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityEmergencyContacts.facilityId))
      .innerJoin(partners, eq(partners.id, facilityQualityEmergencyContacts.partnerId))
      .where(contactCondition)
      .orderBy(asc(facilityProfiles.city), asc(facilityProfiles.facility)),
  ]);
  const [latestLicenceRows, latestInsuranceRows] = await Promise.all([
    db.selectDistinctOn([facilityQualityAssessments.facilityId], {
      facilityId: facilityQualityAssessments.facilityId,
      partnerId: facilityQualityAssessments.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      expiresOn: facilityQualityAssessments.licenceExpiresOn,
    }).from(facilityQualityAssessments)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityAssessments.facilityId))
      .innerJoin(partners, eq(partners.id, facilityQualityAssessments.partnerId))
      .where(and(isNotNull(facilityQualityAssessments.licenceExpiresOn), assessmentCondition))
      .orderBy(
        facilityQualityAssessments.facilityId,
        desc(facilityQualityAssessments.updatedAt),
        desc(facilityQualityAssessments.createdAt),
      ),
    db.selectDistinctOn([facilityQualityAssessments.facilityId], {
      facilityId: facilityQualityAssessments.facilityId,
      partnerId: facilityQualityAssessments.partnerId,
      partnerName: partners.name,
      facility: facilityProfiles.facility,
      city: facilityProfiles.city,
      expiresOn: facilityQualityAssessments.insuranceExpiresOn,
    }).from(facilityQualityAssessments)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, facilityQualityAssessments.facilityId))
      .innerJoin(partners, eq(partners.id, facilityQualityAssessments.partnerId))
      .where(and(isNotNull(facilityQualityAssessments.insuranceExpiresOn), assessmentCondition))
      .orderBy(
        facilityQualityAssessments.facilityId,
        desc(facilityQualityAssessments.updatedAt),
        desc(facilityQualityAssessments.createdAt),
      ),
  ]);
  const expiringDocuments = [
    ...latestLicenceRows.map(row => ({ ...row, documentType: "licence" as const })),
    ...latestInsuranceRows.map(row => ({ ...row, documentType: "insurance" as const })),
  ].flatMap(row => {
    if (!row.expiresOn) return [];
    const daysRemaining = daysUntilExpiry(row.expiresOn);
    return daysRemaining <= 30 ? [{ ...row, daysRemaining }] : [];
  }).sort((a, b) =>
    a.daysRemaining - b.daysRemaining || a.city.localeCompare(b.city) || a.facility.localeCompare(b.facility),
  );
  res.json(GetFacilityQualityControlResponse.parse({
    role: operator.role,
    facilities,
    assessments: assessmentRows,
    incidents: incidentRows,
    expiringDocuments,
    emergencyContacts: contactRows.map(row => ({
      ...row,
      verificationStatus: row.verifiedAt ? "verified" : "pending",
    })),
  }));
});

router.put("/emergency-contacts/:id", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  const params = UpsertFacilityEmergencyContactParams.safeParse(req.params);
  const parsed = UpsertFacilityEmergencyContactBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Enter a contact name, facility role, and valid phone number." });
    return;
  }
  const input = parsed.data;
  const contactName = input.contactName.trim();
  const contactRole = input.contactRole.trim();
  const contactPhone = input.contactPhone.trim();
  const phoneDigits = contactPhone.replace(/\D/g, "");
  if (!contactName || contactRole.length < 2 || phoneDigits.length < 7 || phoneDigits.length > 15) {
    res.status(400).json({ message: "Enter a contact name, facility role, and valid phone number." });
    return;
  }
  const isSafetyAdmin = hasAdminPermission(operator.role, "fraud_compliance");
  if (input.verified && !isSafetyAdmin) {
    res.status(403).json({ message: "Only a safety administrator can verify facility emergency contacts." });
    return;
  }
  const [facility] = await db.select({
    id: facilityProfiles.id,
    partnerId: facilityProfiles.partnerId,
  }).from(facilityProfiles).where(eq(facilityProfiles.id, params.data.id)).limit(1);
  if (!facility || (operator.role === "partner" && facility.partnerId !== operator.partnerId)) {
    res.status(404).json({ message: "Facility not found." });
    return;
  }

  const actorId = operator.userId;
  const now = new Date();
  await db.transaction(async tx => {
    const [current] = await tx.select().from(facilityQualityEmergencyContacts)
      .where(eq(facilityQualityEmergencyContacts.facilityId, facility.id))
      .for("update");
    const fieldsChanged = !current
      || current.contactName !== contactName
      || current.contactRole !== contactRole
      || current.contactPhone !== contactPhone;
    const wasVerified = Boolean(current?.verifiedAt);
    let verifiedAt: Date | null = null;
    let verifiedBy: string | null = null;
    if (isSafetyAdmin && input.verified) {
      verifiedAt = fieldsChanged || !current?.verifiedAt ? now : current.verifiedAt;
      verifiedBy = fieldsChanged || !current?.verifiedBy ? actorId : current.verifiedBy;
    } else if (operator.role === "partner" && !fieldsChanged && current?.verifiedAt) {
      verifiedAt = current.verifiedAt;
      verifiedBy = current.verifiedBy;
    }
    const nextVerified = Boolean(verifiedAt);
    const values = {
      facilityId: facility.id,
      partnerId: facility.partnerId,
      contactName,
      contactRole,
      contactPhone,
      verifiedAt,
      verifiedBy,
      updatedBy: actorId,
      updatedAt: now,
    };
    await tx.insert(facilityQualityEmergencyContacts).values({
      ...values,
      createdBy: actorId,
    }).onConflictDoUpdate({
      target: facilityQualityEmergencyContacts.facilityId,
      set: {
        partnerId: values.partnerId,
        contactName: values.contactName,
        contactRole: values.contactRole,
        contactPhone: values.contactPhone,
        verifiedAt: values.verifiedAt,
        verifiedBy: values.verifiedBy,
        updatedBy: values.updatedBy,
        updatedAt: values.updatedAt,
      },
    });
    if (fieldsChanged || wasVerified !== nextVerified) {
      await tx.insert(operationAudit).values({
        id: randomUUID(),
        actorId,
        action: "facility.quality.emergency_contact.updated",
        targetId: facility.id,
        detail: `changed_fields=${fieldsChanged ? "contact_name,contact_role,contact_phone" : "none"};verification=${wasVerified ? "verified" : "pending"}->${nextVerified ? "verified" : "pending"}`,
      });
    }
  });

  const contact = await emergencyContactDetail(facility.id);
  if (!contact) {
    res.status(500).json({ message: "The facility contact could not be loaded after saving." });
    return;
  }
  res.json(UpsertFacilityEmergencyContactResponse.parse(contact));
});

router.post("/assessments", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (!hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Only administrators can record facility inspections." });
    return;
  }
  const parsed = CreateFacilityQualityAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Complete the required inspection details." });
    return;
  }
  const input = parsed.data;
  const validation = assessmentError(input);
  if (validation) {
    res.status(400).json({ message: validation });
    return;
  }
  const [facility] = await db.select({
    id: facilityProfiles.id,
    partnerId: facilityProfiles.partnerId,
  }).from(facilityProfiles).where(eq(facilityProfiles.id, input.facilityId)).limit(1);
  if (!facility) {
    res.status(404).json({ message: "Facility not found." });
    return;
  }
  const id = randomUUID();
  const actorId = operator.userId;
  await db.transaction(async tx => {
    await tx.insert(facilityQualityAssessments).values({
      id,
      facilityId: facility.id,
      partnerId: facility.partnerId,
      reviewedOn: toDateOnly(input.reviewedOn)!,
      nextReviewOn: toDateOnly(input.nextReviewOn),
      licenceExpiresOn: toDateOnly(input.licenceExpiresOn),
      insuranceExpiresOn: toDateOnly(input.insuranceExpiresOn),
      hygieneChecklist: input.hygieneChecklist,
      safetyChecklist: input.safetyChecklist,
      status: input.status,
      findings: input.findings.trim(),
      correctiveAction: input.correctiveAction?.trim() || null,
      correctiveDueOn: toDateOnly(input.correctiveDueOn),
      createdBy: actorId,
      updatedBy: actorId,
    });
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId,
      action: "facility.quality.assessment.created",
      targetId: id,
      detail: JSON.stringify({
        facilityId: facility.id,
        reviewedOn: toDateOnly(input.reviewedOn),
        status: input.status,
        nextReviewOn: toDateOnly(input.nextReviewOn),
        licenceExpiresOn: toDateOnly(input.licenceExpiresOn),
        insuranceExpiresOn: toDateOnly(input.insuranceExpiresOn),
      }),
    });
  });
  const row = await assessmentDetail(id);
  if (!row) {
    res.status(500).json({ message: "The inspection could not be loaded after saving." });
    return;
  }
  res.status(201).json(CreateFacilityQualityAssessmentResponse.parse(row));
});

router.patch("/assessments/:id", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (!hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Only administrators can update inspection follow-up." });
    return;
  }
  const params = UpdateFacilityQualityAssessmentParams.safeParse(req.params);
  const parsed = UpdateFacilityQualityAssessmentBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Choose a valid status and corrective-action plan." });
    return;
  }
  const input = parsed.data;
  const correctiveAction = input.correctiveAction?.trim() || null;
  const correctiveDueOn = toDateOnly(input.correctiveDueOn);
  if (input.status !== "approved" && (!correctiveAction || !correctiveDueOn)) {
    res.status(400).json({ message: "A corrective action and due date are required until the facility is approved." });
    return;
  }
  if (Boolean(correctiveAction) !== Boolean(correctiveDueOn)) {
    res.status(400).json({ message: "A corrective action and due date must be set together." });
    return;
  }
  const [current] = await db.select({
    id: facilityQualityAssessments.id,
    status: facilityQualityAssessments.status,
    correctiveDueOn: facilityQualityAssessments.correctiveDueOn,
    correctiveAction: facilityQualityAssessments.correctiveAction,
    hygieneChecklist: facilityQualityAssessments.hygieneChecklist,
    safetyChecklist: facilityQualityAssessments.safetyChecklist,
  }).from(facilityQualityAssessments).where(eq(facilityQualityAssessments.id, params.data.id)).limit(1);
  if (!current) {
    res.status(404).json({ message: "Assessment not found." });
    return;
  }
  const hasFailedCheck = [...Object.values(current.hygieneChecklist), ...Object.values(current.safetyChecklist)]
    .includes("action_required");
  if (input.status === "approved" && hasFailedCheck) {
    res.status(400).json({ message: "Outstanding checklist items must be cleared before approval." });
    return;
  }
  await db.transaction(async tx => {
    await tx.update(facilityQualityAssessments).set({
      status: input.status,
      correctiveAction,
      correctiveDueOn,
      updatedBy: operator.userId,
      updatedAt: new Date(),
    }).where(eq(facilityQualityAssessments.id, current.id));
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "facility.quality.assessment.follow_up",
      targetId: current.id,
      detail: JSON.stringify({
        fromStatus: current.status,
        toStatus: input.status,
        fromDueOn: current.correctiveDueOn,
        toDueOn: correctiveDueOn,
        correctiveActionChanged: current.correctiveAction !== correctiveAction,
      }),
    });
  });
  const row = await assessmentDetail(current.id);
  if (!row) {
    res.status(500).json({ message: "The inspection could not be loaded after updating." });
    return;
  }
  res.json(UpdateFacilityQualityAssessmentResponse.parse(row));
});

router.post("/incidents", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  const parsed = CreateFacilityQualityIncidentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Complete the incident type, date, and description." });
    return;
  }
  const description = parsed.data.description.trim();
  if (description.length < 10) {
    res.status(400).json({ message: "Add a brief description of at least 10 characters." });
    return;
  }
  const [facility] = await db.select({
    id: facilityProfiles.id,
    partnerId: facilityProfiles.partnerId,
  }).from(facilityProfiles).where(eq(facilityProfiles.id, parsed.data.facilityId)).limit(1);
  if (!facility || (operator.role === "partner" && facility.partnerId !== operator.partnerId)) {
    res.status(404).json({ message: "Facility not found." });
    return;
  }
  const id = randomUUID();
  await db.transaction(async tx => {
    await tx.insert(facilityQualityIncidents).values({
      id,
      facilityId: facility.id,
      partnerId: facility.partnerId,
      incidentType: parsed.data.incidentType,
      occurredAt: parsed.data.occurredAt,
      description,
      reportedBy: operator.userId,
      updatedBy: operator.userId,
    });
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "facility.quality.incident.created",
      targetId: id,
      detail: JSON.stringify({
        facilityId: facility.id,
        incidentType: parsed.data.incidentType,
        occurredAt: parsed.data.occurredAt.toISOString(),
      }),
    });
  });
  const row = await incidentDetail(id);
  if (!row) {
    res.status(500).json({ message: "The incident could not be loaded after saving." });
    return;
  }
  res.status(201).json(CreateFacilityQualityIncidentResponse.parse(row));
});

router.patch("/incidents/:id", async (req, res): Promise<void> => {
  const operator = operatorFor(res);
  if (!hasAdminPermission(operator.role, "fraud_compliance")) {
    res.status(403).json({ message: "Only administrators can review incident reports." });
    return;
  }
  const params = UpdateFacilityQualityIncidentParams.safeParse(req.params);
  const parsed = UpdateFacilityQualityIncidentBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Choose a valid incident status and resolution." });
    return;
  }
  const resolution = parsed.data.resolution?.trim() || null;
  if (parsed.data.status === "resolved" && (!resolution || resolution.length < 5)) {
    res.status(400).json({ message: "Add a resolution of at least 5 characters before closing a report." });
    return;
  }
  const [current] = await db.select({
    id: facilityQualityIncidents.id,
    status: facilityQualityIncidents.status,
    resolution: facilityQualityIncidents.resolution,
  }).from(facilityQualityIncidents).where(eq(facilityQualityIncidents.id, params.data.id)).limit(1);
  if (!current) {
    res.status(404).json({ message: "Incident report not found." });
    return;
  }
  await db.transaction(async tx => {
    await tx.update(facilityQualityIncidents).set({
      status: parsed.data.status,
      resolution,
      updatedBy: operator.userId,
      updatedAt: new Date(),
    }).where(eq(facilityQualityIncidents.id, current.id));
    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: operator.userId,
      action: "facility.quality.incident.review",
      targetId: current.id,
      detail: JSON.stringify({
        fromStatus: current.status,
        toStatus: parsed.data.status,
        resolutionChanged: current.resolution !== resolution,
      }),
    });
  });
  const row = await incidentDetail(current.id);
  if (!row) {
    res.status(500).json({ message: "The incident could not be loaded after updating." });
    return;
  }
  res.json(UpdateFacilityQualityIncidentResponse.parse(row));
});

export default router;
