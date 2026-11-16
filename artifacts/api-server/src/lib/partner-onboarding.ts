import type { PartnerOnboardingStatus } from "@workspace/db";

const allowedTransitions: Record<PartnerOnboardingStatus, readonly PartnerOnboardingStatus[]> = {
  application_received: ["under_review", "additional_documents_required", "rejected"],
  under_review: ["additional_documents_required", "commercial_negotiation", "rejected"],
  additional_documents_required: ["under_review", "rejected"],
  commercial_negotiation: ["additional_documents_required", "contract_issued", "rejected"],
  contract_issued: ["additional_documents_required", "contract_signed"],
  contract_signed: ["additional_documents_required", "facility_setup"],
  facility_setup: ["qr_code_issued", "additional_documents_required"],
  qr_code_issued: ["staff_training_completed", "additional_documents_required"],
  staff_training_completed: ["test_checkin_completed", "additional_documents_required"],
  test_checkin_completed: ["approved", "additional_documents_required"],
  approved: ["live"],
  live: [],
  rejected: [],
};

export function canTransitionPartnerOnboarding(
  current: PartnerOnboardingStatus,
  next: PartnerOnboardingStatus,
): boolean {
  return allowedTransitions[current].includes(next);
}

export function isValidPartnerApplicationHours(
  hours: Array<{ day: number; closed: boolean; opensAt: string | null; closesAt: string | null }>,
): boolean {
  if (hours.length !== 7 || new Set(hours.map(item => item.day)).size !== 7) return false;
  return hours.every(item => {
    if (item.day < 0 || item.day > 6) return false;
    if (item.closed) return item.opensAt === null && item.closesAt === null;
    return Boolean(item.opensAt && item.closesAt && item.opensAt < item.closesAt);
  });
}
