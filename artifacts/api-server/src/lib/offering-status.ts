export type OfferingActivityStatus =
  | "draft" | "submitted" | "under_review" | "changes_requested" | "approved"
  | "published" | "suspended" | "rejected" | "archived";

export type OfferingSessionStatus =
  | "draft" | "scheduled" | "open_for_booking" | "fully_booked"
  | "in_progress" | "completed" | "cancelled" | "suspended";

export type OfferingReviewAction =
  | "start_review" | "request_changes" | "approve" | "reject"
  | "publish" | "suspend" | "archive";

const transitions: Record<OfferingReviewAction, OfferingActivityStatus[]> = {
  start_review: ["submitted"],
  request_changes: ["submitted", "under_review"],
  approve: ["submitted", "under_review"],
  reject: ["submitted", "under_review"],
  publish: ["approved", "suspended"],
  suspend: ["published"],
  archive: ["draft", "submitted", "under_review", "changes_requested", "approved", "published", "suspended", "rejected"],
};

const reasonRequired = new Set<OfferingReviewAction>(["request_changes", "reject", "suspend", "archive"]);

export function transitionOfferingActivity(
  current: OfferingActivityStatus,
  action: OfferingReviewAction,
  reason?: string,
): { activityStatus: OfferingActivityStatus; reviewNote: string | null } | null {
  const trimmedReason = reason?.trim() ?? "";
  if (!transitions[action].includes(current)) return null;
  if (reasonRequired.has(action) && trimmedReason.length < 5) return null;

  const next: Record<OfferingReviewAction, OfferingActivityStatus> = {
    start_review: "under_review",
    request_changes: "changes_requested",
    approve: "approved",
    reject: "rejected",
    publish: "published",
    suspend: "suspended",
    archive: "archived",
  };
  return {
    activityStatus: next[action],
    reviewNote: reasonRequired.has(action) ? trimmedReason : null,
  };
}

type SessionStatusInput = {
  activityStatus: OfferingActivityStatus;
  approvalStatus?: OfferingActivityStatus;
  active: boolean;
  cancelledAt: Date | string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  capacity: number;
  bookingCutoffMinutes?: number;
};

export function deriveOfferingSessionStatus(
  offering: SessionStatusInput,
  occupiedPlaces: number,
  now = new Date(),
): OfferingSessionStatus {
  if (offering.cancelledAt) return "cancelled";

  const start = new Date(offering.startsAt).getTime();
  const end = new Date(offering.endsAt).getTime();
  const activityStatus = effectiveOfferingActivityStatus(offering);
  if (activityStatus === "suspended") return "suspended";
  if (activityStatus === "archived") return end <= now.getTime() ? "completed" : "suspended";
  if (activityStatus === "approved") return end <= now.getTime() ? "completed" : "scheduled";
  if (activityStatus !== "published" || !offering.active) return "draft";
  if (start > now.getTime()) {
    if (occupiedPlaces >= offering.capacity) return "fully_booked";
    const bookingClosesAt = start - (offering.bookingCutoffMinutes ?? 0) * 60_000;
    return now.getTime() >= bookingClosesAt ? "scheduled" : "open_for_booking";
  }
  if (end > now.getTime()) return "in_progress";
  return "completed";
}

export function effectiveOfferingActivityStatus(
  offering: Pick<SessionStatusInput, "activityStatus" | "approvalStatus" | "active">,
): OfferingActivityStatus {
  if (offering.approvalStatus === "suspended" || offering.activityStatus === "suspended") return "suspended";
  // Preserve the published state of pre-lifecycle rows during the additive migration.
  if (offering.active) return "published";
  return offering.approvalStatus ?? offering.activityStatus;
}
