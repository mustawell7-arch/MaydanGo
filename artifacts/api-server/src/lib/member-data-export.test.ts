import assert from "node:assert/strict";
import test from "node:test";
import { GetMemberPrivacyRequestExportResponse } from "@workspace/api-zod";

test("member export response contains only the declared, non-secret fields", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");
  const parsed = GetMemberPrivacyRequestExportResponse.parse({
    formatVersion: "1.2",
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
    courses: [{
      title: "Movement basics",
      enrolledAt: now,
      lastAccessAt: now,
      completedLessons: [],
      viewedLessons: [{
        title: "Warm-up",
        firstViewedAt: now,
        lastViewedAt: now,
        playbackPositionSeconds: 45,
        durationSeconds: 600,
      }],
    }],
    savedCourses: [{ title: "Strength basics", savedAt: now }],
    reviews: [],
    consentHistory: [{
      purpose: "marketing",
      policyVersion: "v1-draft",
      choice: "declined",
      recordedAt: now,
    }],
    supportConversations: [{
      subject: "Booking question",
      category: "booking",
      status: "resolved",
      language: "en",
      createdAt: now,
      closedAt: now,
      messages: [{
        authorRole: "member",
        body: "Please help with my booking.",
        language: "en",
        createdAt: now,
        attachments: [{
          fileName: "schedule.jpg",
          contentType: "image/jpeg",
          size: 2048,
          status: "ready",
          createdAt: now,
        }],
      }],
    }],
    referrals: {
      inviteCode: "ABCDEFG234",
      attributedSignups: 2,
      codeUsed: "JKLMNPQ234",
      attributedAt: now,
      inviteeIds: ["must-not-be-exported"],
    },
    privacyRequests: [],
    notificationPreferences: null,
    excludedData: [
      "payment_instrument_details",
      "login_credentials",
      "push_tokens",
      "private_class_links",
      "internal_support_notes",
      "support_attachment_contents",
      "browser_local_cookie_choice",
    ],
  });

  assert.equal("passwordHash" in parsed.account, false);
  assert.equal("billingId" in parsed.memberships[0], false);
  assert.equal("rules" in parsed.memberships[0], false);
  assert.equal(parsed.courses[0]?.viewedLessons[0]?.playbackPositionSeconds, 45);
  assert.equal(parsed.savedCourses[0]?.title, "Strength basics");
  assert.equal(parsed.consentHistory[0]?.choice, "declined");
  assert.equal(parsed.supportConversations[0]?.messages[0]?.body, "Please help with my booking.");
  assert.equal(parsed.supportConversations[0]?.messages[0]?.attachments[0]?.fileName, "schedule.jpg");
  assert.deepEqual(parsed.referrals, {
    inviteCode: "ABCDEFG234",
    attributedSignups: 2,
    codeUsed: "JKLMNPQ234",
    attributedAt: now,
  });
  assert.deepEqual(parsed.excludedData, [
    "payment_instrument_details",
    "login_credentials",
    "push_tokens",
    "private_class_links",
    "internal_support_notes",
    "support_attachment_contents",
    "browser_local_cookie_choice",
  ]);
});
