import assert from "node:assert/strict";
import test from "node:test";
import { GetMemberPrivacyRequestExportResponse } from "@workspace/api-zod";

test("member export response contains only the declared, non-secret fields", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");
  const parsed = GetMemberPrivacyRequestExportResponse.parse({
    formatVersion: "1.0",
    generatedAt: now,
    account: {
      email: "member@example.test",
      firstName: "Member",
      lastName: null,
      createdAt: now,
      profile: { gender: "unspecified", birthDate: "1990-01-01" },
      passwordHash: "must-not-be-exported",
    },
    memberships: [{
      scope: "live",
      status: "active",
      tier: "M",
      source: "paid",
      startsAt: now,
      endsAt: now,
      billingId: "must-not-be-exported",
      rules: { private: true },
    }],
    bookings: [],
    waitlist: [],
    attendance: [],
    courses: [],
    reviews: [],
    privacyRequests: [],
    notificationPreferences: null,
    excludedData: [
      "payment_instrument_details",
      "login_credentials",
      "push_tokens",
      "private_class_links",
      "support_conversation_messages",
      "internal_support_notes",
    ],
  });

  assert.equal("passwordHash" in parsed.account, false);
  assert.equal("billingId" in parsed.memberships[0], false);
  assert.equal("rules" in parsed.memberships[0], false);
  assert.deepEqual(parsed.excludedData, [
    "payment_instrument_details",
    "login_credentials",
    "push_tokens",
    "private_class_links",
    "support_conversation_messages",
    "internal_support_notes",
  ]);
});
