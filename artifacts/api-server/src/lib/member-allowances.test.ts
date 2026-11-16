import assert from "node:assert/strict";
import { test } from "node:test";
import { GetMemberAllowancesResponse } from "@workspace/api-zod";
import { calculateMemberAllowances } from "./member-allowances";

const now = new Date("2026-11-16T12:00:00.000Z");
const activeMembership = {
  id: "live-membership",
  scope: "live",
  status: "active",
  source: "paid",
  paymentStatus: "paid",
  tier: "L",
  startsAt: new Date("2026-11-01T00:00:00.000Z"),
  endsAt: new Date("2026-12-01T00:00:00.000Z"),
  rules: {
    quota: 8,
    dailyLimit: 3,
    quotaMode: "separate" as const,
    physicalQuota: 5,
    premiumQuota: 2,
    liveQuota: 4,
  },
};

test("allowances count distinct active bookings and confirmed visits for a valid live membership", () => {
  const result = calculateMemberAllowances(activeMembership, [
    { id: "physical-booking", accessType: "physical", startsAt: new Date("2026-11-16T10:00:00.000Z") },
    { id: "physical-booking", accessType: "physical", startsAt: new Date("2026-11-16T10:00:00.000Z") },
    { id: "premium-visit", accessType: "premium", startsAt: new Date("2026-11-15T10:00:00.000Z") },
    { id: "live-visit", accessType: "live", startsAt: new Date("2026-11-10T10:00:00.000Z") },
    { id: "outside-period", accessType: "physical", startsAt: new Date("2026-10-30T10:00:00.000Z") },
  ], now);

  const allowance = result.membership;
  assert.ok(allowance);
  assert.doesNotThrow(() => GetMemberAllowancesResponse.parse(result));
  assert.equal(allowance.quotaMode, "separate");
  assert.deepEqual(allowance.separate, {
    physical: { limit: 5, remaining: 4, resetsAt: activeMembership.endsAt.toISOString() },
    premium: { limit: 2, remaining: 1, resetsAt: activeMembership.endsAt.toISOString() },
    live: { limit: 4, remaining: 3, resetsAt: activeMembership.endsAt.toISOString() },
  });
  assert.deepEqual(allowance.daily, {
    limit: 3,
    remaining: 2,
    resetsAt: "2026-11-16T21:00:00.000Z",
  });
  assert.equal(allowance.shared, null);
});

test("shared plans expose one shared balance rather than guessed category balances", () => {
  const result = calculateMemberAllowances({
    ...activeMembership,
    rules: { quota: 8, dailyLimit: 3, quotaMode: "shared" },
  }, [
    { id: "one", accessType: "physical", startsAt: new Date("2026-11-12T10:00:00.000Z") },
    { id: "two", accessType: "live", startsAt: new Date("2026-11-13T10:00:00.000Z") },
  ], now);

  assert.equal(result.membership?.quotaMode, "shared");
  assert.deepEqual(result.membership?.shared, {
    limit: 8,
    remaining: 6,
    resetsAt: activeMembership.endsAt.toISOString(),
  });
  assert.deepEqual(result.membership?.separate, { physical: null, premium: null, live: null });
});

test("expired, preview, and missing memberships never expose live allowances", () => {
  const expired = { ...activeMembership, endsAt: new Date("2026-11-15T00:00:00.000Z") };
  const preview = { ...activeMembership, scope: "preview" };

  assert.deepEqual(calculateMemberAllowances(expired, [], now), { membership: null });
  assert.deepEqual(calculateMemberAllowances(preview, [], now), { membership: null });
  assert.deepEqual(calculateMemberAllowances(null, [], now), { membership: null });
  assert.doesNotThrow(() => GetMemberAllowancesResponse.parse({ membership: null }));
});

test("unpaid or not-yet-started memberships do not expose balances", () => {
  assert.deepEqual(
    calculateMemberAllowances({ ...activeMembership, paymentStatus: "pending" }, [], now),
    { membership: null },
  );
  assert.deepEqual(
    calculateMemberAllowances({ ...activeMembership, startsAt: new Date("2026-11-17T00:00:00.000Z") }, [], now),
    { membership: null },
  );
});
