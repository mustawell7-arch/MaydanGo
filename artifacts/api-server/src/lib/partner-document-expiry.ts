import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db, facilityProfiles, facilityQualityAssessments, operators, partnerComplianceDocuments, partners,
} from "@workspace/db";
import { hasAdminPermission } from "./admin-roles";
import { logger } from "./logger";
import { sendMemberNotification } from "./notifications";

const EXPIRY_REMINDER_WINDOW_DAYS = 30;
const URGENT_ALERT_ROLES = ["customer_support_admin", "support", "super_admin"];

export type PartnerExpiryDocumentType = "licence" | "insurance";
export type PartnerExpiryPhase = "upcoming" | "overdue";

export type PartnerExpiryRecord = {
  facilityId: string;
  partnerId: string;
  partnerName: string;
  facility: string;
  city: string;
  expiresOn: string | null;
  documentType: PartnerExpiryDocumentType;
  daysRemaining: number;
};

export function baghdadDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function daysUntilDocumentExpiry(expiresOn: string, now = new Date()): number {
  return Math.floor(
    (Date.parse(`${expiresOn.slice(0, 10)}T00:00:00Z`) - Date.parse(`${baghdadDate(now)}T00:00:00Z`))
    / 86_400_000,
  );
}

/**
 * Uses the same source precedence as the quality-control dashboard: the latest
 * assessment supplies legacy dates, and the latest approved uploaded document
 * overrides it for that facility and document type.
 */
export async function listExpiringPartnerDocuments(
  partnerScope: string | null = null,
  now = new Date(),
): Promise<PartnerExpiryRecord[]> {
  const assessmentCondition = partnerScope
    ? eq(facilityQualityAssessments.partnerId, partnerScope)
    : undefined;
  const [latestLicenceRows, latestInsuranceRows, latestApprovedDocuments] = await Promise.all([
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
      .where(and(
        isNotNull(facilityQualityAssessments.licenceExpiresOn),
        assessmentCondition,
      ))
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
      .where(and(
        isNotNull(facilityQualityAssessments.insuranceExpiresOn),
        assessmentCondition,
      ))
      .orderBy(
        facilityQualityAssessments.facilityId,
        desc(facilityQualityAssessments.updatedAt),
        desc(facilityQualityAssessments.createdAt),
      ),
    db.selectDistinctOn(
      [partnerComplianceDocuments.facilityId, partnerComplianceDocuments.documentType],
      {
        facilityId: partnerComplianceDocuments.facilityId,
        partnerId: partnerComplianceDocuments.partnerId,
        partnerName: partners.name,
        facility: facilityProfiles.facility,
        city: facilityProfiles.city,
        expiresOn: partnerComplianceDocuments.expiresOn,
        documentType: partnerComplianceDocuments.documentType,
      },
    ).from(partnerComplianceDocuments)
      .innerJoin(facilityProfiles, eq(facilityProfiles.id, partnerComplianceDocuments.facilityId))
      .innerJoin(partners, eq(partners.id, partnerComplianceDocuments.partnerId))
      .where(and(
        eq(partnerComplianceDocuments.status, "approved"),
        isNotNull(partnerComplianceDocuments.expiresOn),
        inArray(partnerComplianceDocuments.documentType, ["licence", "insurance"]),
        partnerScope ? eq(partnerComplianceDocuments.partnerId, partnerScope) : undefined,
      ))
      .orderBy(
        partnerComplianceDocuments.facilityId,
        partnerComplianceDocuments.documentType,
        desc(partnerComplianceDocuments.updatedAt),
        desc(partnerComplianceDocuments.createdAt),
      ),
  ]);

  const latestByFacilityAndType = new Map<string, Omit<PartnerExpiryRecord, "daysRemaining">>();
  [
    ...latestLicenceRows.map(row => ({ ...row, documentType: "licence" as const })),
    ...latestInsuranceRows.map(row => ({ ...row, documentType: "insurance" as const })),
  ].forEach(row => latestByFacilityAndType.set(`${row.facilityId}:${row.documentType}`, row));
  latestApprovedDocuments.forEach(row => {
    if (row.documentType === "licence" || row.documentType === "insurance") {
      latestByFacilityAndType.set(`${row.facilityId}:${row.documentType}`, {
        ...row,
        documentType: row.documentType,
      });
    }
  });

  return [...latestByFacilityAndType.values()].flatMap(row => {
    if (!row.expiresOn) return [];
    const daysRemaining = daysUntilDocumentExpiry(row.expiresOn, now);
    return daysRemaining <= EXPIRY_REMINDER_WINDOW_DAYS
      ? [{ ...row, daysRemaining }]
      : [];
  }).sort((a, b) =>
    a.daysRemaining - b.daysRemaining || a.city.localeCompare(b.city) || a.facility.localeCompare(b.facility),
  );
}

export async function runPartnerDocumentExpiryReminders(
  now = new Date(),
  notify: typeof sendMemberNotification = sendMemberNotification,
) {
  const expiringDocuments = await listExpiringPartnerDocuments(null, now);
  if (!expiringDocuments.length) {
    return { documents: 0, recipients: 0, attempts: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const selectedRecipients = await db.select({
    userId: operators.userId,
    role: operators.role,
  }).from(operators).where(and(
    inArray(operators.role, URGENT_ALERT_ROLES),
    eq(operators.receiveUrgentAlerts, true),
  ));
  const recipients = selectedRecipients.filter(recipient =>
    hasAdminPermission(recipient.role, "fraud_compliance"),
  );
  if (!recipients.length) {
    logger.warn(
      { documentCount: expiringDocuments.length },
      "Partner document expiry reminders have no selected quality-authorized recipients.",
    );
    return { documents: expiringDocuments.length, recipients: 0, attempts: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const attempts = expiringDocuments.flatMap(document => {
    if (!document.expiresOn) return [];
    const phase: PartnerExpiryPhase = document.daysRemaining < 0 ? "overdue" : "upcoming";
    const kind: Parameters<typeof sendMemberNotification>[1] = phase === "overdue"
      ? "partner_document_expiry_overdue"
      : "partner_document_expiry_upcoming";
    const context = {
      dedupeKey: [
        "partner-document-expiry",
        document.facilityId,
        document.documentType,
        document.expiresOn,
        phase,
      ].join(":"),
      qualityRecord: {
        facilityId: document.facilityId,
        documentType: document.documentType,
        expiresOn: document.expiresOn,
        phase,
      },
    };
    return recipients.map(recipient => ({ recipient, kind, context }));
  });

  const outcomes = await Promise.all(attempts.map(({ recipient, kind, context }) =>
    notify(recipient.userId, kind, context),
  ));
  return {
    documents: expiringDocuments.length,
    recipients: recipients.length,
    attempts: outcomes.length,
    sent: outcomes.filter(outcome => outcome.status === "sent").length,
    skipped: outcomes.filter(outcome => outcome.status === "skipped").length,
    failed: outcomes.filter(outcome => outcome.status === "failed").length,
  };
}
