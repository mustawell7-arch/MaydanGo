import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveOfferingSessionStatus,
  effectiveOfferingActivityStatus,
  transitionOfferingActivity,
} from "./offering-status";

const future = new Date(Date.now() + 60 * 60 * 1000);
const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
const baseOffering = {
  activityStatus: "published" as const,
  active: true,
  cancelledAt: null,
  startsAt: future,
  endsAt: later,
  capacity: 10,
};

test("activity reviews follow the submitted, review, and publish lifecycle", () => {
  assert.deepEqual(transitionOfferingActivity("submitted", "start_review"), {
    activityStatus: "under_review", reviewNote: null,
  });
  assert.deepEqual(transitionOfferingActivity("under_review", "approve"), {
    activityStatus: "approved", reviewNote: null,
  });
  assert.deepEqual(transitionOfferingActivity("approved", "publish"), {
    activityStatus: "published", reviewNote: null,
  });
  assert.equal(transitionOfferingActivity("published", "suspend", "no"), null);
  assert.deepEqual(transitionOfferingActivity("published", "suspend", "Safety review"), {
    activityStatus: "suspended", reviewNote: "Safety review",
  });
  assert.equal(transitionOfferingActivity("submitted", "publish"), null);
});

test("corrections and rejections require a reason and retain it", () => {
  assert.equal(transitionOfferingActivity("under_review", "request_changes", "no"), null);
  assert.deepEqual(transitionOfferingActivity("under_review", "request_changes", "Please add age rules"), {
    activityStatus: "changes_requested", reviewNote: "Please add age rules",
  });
  assert.deepEqual(transitionOfferingActivity("submitted", "reject", "Missing facility license"), {
    activityStatus: "rejected", reviewNote: "Missing facility license",
  });
});

test("session statuses reflect activity approval, booking capacity, dates, and cancellation", () => {
  assert.equal(deriveOfferingSessionStatus({ ...baseOffering, activityStatus: "draft", active: false }, 0), "draft");
  assert.equal(deriveOfferingSessionStatus({ ...baseOffering, activityStatus: "approved", active: false }, 0), "scheduled");
  assert.equal(deriveOfferingSessionStatus(baseOffering, 9), "open_for_booking");
  assert.equal(deriveOfferingSessionStatus(baseOffering, 10), "fully_booked");
  assert.equal(deriveOfferingSessionStatus({ ...baseOffering, bookingCutoffMinutes: 30 }, 0,
    new Date(future.getTime() - 20 * 60 * 1000)), "scheduled");
  assert.equal(deriveOfferingSessionStatus({ ...baseOffering, cancelledAt: new Date() }, 0), "cancelled");
  assert.equal(deriveOfferingSessionStatus({ ...baseOffering, activityStatus: "suspended", active: false }, 0), "suspended");
  assert.equal(deriveOfferingSessionStatus({ ...baseOffering, approvalStatus: "suspended", activityStatus: "published" }, 0), "suspended");
  assert.equal(deriveOfferingSessionStatus(baseOffering, 0, new Date(Date.now() + 90 * 60 * 1000)), "in_progress");
  assert.equal(deriveOfferingSessionStatus(baseOffering, 0, new Date(Date.now() + 3 * 60 * 60 * 1000)), "completed");
});

test("active legacy rows are displayed as published without rewriting old records", () => {
  assert.equal(effectiveOfferingActivityStatus({ activityStatus: "draft", active: true }), "published");
  assert.equal(effectiveOfferingActivityStatus({ activityStatus: "changes_requested", active: false }), "changes_requested");
});
