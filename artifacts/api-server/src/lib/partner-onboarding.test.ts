import assert from "node:assert/strict";
import test from "node:test";
import { canTransitionPartnerOnboarding, isValidPartnerApplicationHours } from "./partner-onboarding";

test("partner onboarding advances through the documented stages without skipping or reopening terminal states", () => {
  assert.equal(canTransitionPartnerOnboarding("application_received", "under_review"), true);
  assert.equal(canTransitionPartnerOnboarding("under_review", "commercial_negotiation"), true);
  assert.equal(canTransitionPartnerOnboarding("approved", "live"), true);
  assert.equal(canTransitionPartnerOnboarding("application_received", "live"), false);
  assert.equal(canTransitionPartnerOnboarding("live", "under_review"), false);
  assert.equal(canTransitionPartnerOnboarding("rejected", "under_review"), false);
});

test("partner application hours cover each day once and require complete open/closed times", () => {
  const week = Array.from({ length: 7 }, (_, day) => ({
    day,
    closed: day === 5,
    opensAt: day === 5 ? null : "08:00",
    closesAt: day === 5 ? null : "20:00",
  }));
  assert.equal(isValidPartnerApplicationHours(week), true);
  assert.equal(isValidPartnerApplicationHours([...week.slice(1), week[0], week[0]]), false);
  assert.equal(isValidPartnerApplicationHours([
    ...week.slice(0, 6),
    { day: 6, closed: true, opensAt: "08:00", closesAt: null },
  ]), false);
  assert.equal(isValidPartnerApplicationHours([
    ...week.slice(0, 6),
    { day: 6, closed: false, opensAt: "21:00", closesAt: "08:00" },
  ]), false);
});
