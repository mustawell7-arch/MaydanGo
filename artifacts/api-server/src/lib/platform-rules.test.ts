import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PLATFORM_SAFETY_RULES, exceedsPlatformDailyVisitLimit, partnerSubmissionOutcome, platformSafetyRulesSchema } from "./platform-rules";

test("platform safety defaults preserve the current device and check-in behavior", () => {
  assert.equal(DEFAULT_PLATFORM_SAFETY_RULES.deviceChangeWaitHours, 24);
  assert.equal(DEFAULT_PLATFORM_SAFETY_RULES.deviceChangeRiskWindowDays, 30);
  assert.equal(DEFAULT_PLATFORM_SAFETY_RULES.repeatedDeviceChangeThreshold, 2);
  assert.equal(DEFAULT_PLATFORM_SAFETY_RULES.maxCheckinAccuracyMeters, 100);
  assert.equal(DEFAULT_PLATFORM_SAFETY_RULES.rapidCheckinBlockSeconds, 60);
  assert.equal(DEFAULT_PLATFORM_SAFETY_RULES.impossibleTravelWindowSeconds, 3600);
  assert.equal(DEFAULT_PLATFORM_SAFETY_RULES.impossibleTravelBaseMeters, 500);
  assert.equal(DEFAULT_PLATFORM_SAFETY_RULES.impossibleTravelMetersPerSecond, 80);
  assert.equal(DEFAULT_PLATFORM_SAFETY_RULES.offeringApprovalRequired, true);
  assert.deepEqual(platformSafetyRulesSchema.parse(DEFAULT_PLATFORM_SAFETY_RULES), DEFAULT_PLATFORM_SAFETY_RULES);
});

test("platform safety rejects invalid bounds and inconsistent fraud windows", () => {
  assert.equal(platformSafetyRulesSchema.safeParse({
    ...DEFAULT_PLATFORM_SAFETY_RULES,
    deviceChangeWaitHours: 0,
  }).success, false);
  assert.equal(platformSafetyRulesSchema.safeParse({
    ...DEFAULT_PLATFORM_SAFETY_RULES,
    rapidCheckinBlockSeconds: 600,
    impossibleTravelWindowSeconds: 60,
  }).success, false);
});

test("daily-visit maximum applies only to new or changed plan rules", () => {
  assert.equal(exceedsPlatformDailyVisitLimit(null, 15, 10), true);
  assert.equal(exceedsPlatformDailyVisitLimit(null, 10, 10), false);
  assert.equal(exceedsPlatformDailyVisitLimit(15, 15, 10), false);
  assert.equal(exceedsPlatformDailyVisitLimit(15, 16, 10), true);
  assert.equal(exceedsPlatformDailyVisitLimit(15, 8, 10), false);
});

test("partner submissions follow the Super Admin approval policy", () => {
  assert.deepEqual(partnerSubmissionOutcome(true), { approvalStatus: "submitted", active: false });
  assert.deepEqual(partnerSubmissionOutcome(false), { approvalStatus: "published", active: true });
});
