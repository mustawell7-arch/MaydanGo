import assert from "node:assert/strict";
import test from "node:test";
import { GetMemberPrivacyRequestExportResponse } from "@workspace/api-zod";

test("member export response contains only the declared, non-secret fields", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");
  const parsed = GetMemberPrivacyRequestExportResponse.parse({
    formatVersion: "1.7",
    generatedAt: now,
    account: {
      email: "member@example.test",
      firstName: "Member",
      lastName: null,
      createdAt: now,
      contactPhoneNumber: "+9647700000000",
      contactPhoneNumberVerified: false,
      cityId: "erbil",
      profile: { gender: "unspecified", birthDate: "1990-01-01" },
      profilePhoto: {
        present: true,
        consentVersion: "member-photo-v1",
        consentAt: now,
        contentType: "image/png",
        imageBase64: "aGVsbG8=",
      },
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
    fitnessChallenges: [{
      challengeId: "challenge-1",
      title: "Movement month",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      goalActiveDays: 12,
      status: "archived",
      joinedAt: now,
      activeDays: 2,
      selfReportedDates: ["2026-11-10"],
      verifiedAttendanceDates: ["2026-11-11"],
    }],
    loyaltyPoints: {
      balance: 2,
      entries: [
        {
          id: "attendance:visit-1",
          source: "confirmed_visit",
          points: 1,
          earnedAt: now,
          localizedTitle: { en: "Yoga class", ar: "حصة يوغا", ku: "وانەی یۆگا" },
          facility: "Baghdad studio",
        },
        {
          id: "course:enrollment-1",
          source: "course_completion",
          points: 1,
          earnedAt: now,
          localizedTitle: { en: "Movement basics", ar: "أساسيات الحركة", ku: "بنەماکانی جووڵە" },
          facility: null,
        },
      ],
    },
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
  assert.equal(parsed.account.contactPhoneNumber, "+9647700000000");
  assert.equal(parsed.account.contactPhoneNumberVerified, false);
  assert.equal(parsed.account.cityId, "erbil");
  assert.deepEqual(parsed.account.profilePhoto, {
    present: true,
    consentVersion: "member-photo-v1",
    consentAt: now,
    contentType: "image/png",
    imageBase64: "aGVsbG8=",
  });
  assert.equal("billingId" in parsed.memberships[0], false);
  assert.equal("rules" in parsed.memberships[0], false);
  assert.equal(parsed.courses[0]?.viewedLessons[0]?.playbackPositionSeconds, 45);
  assert.equal(parsed.savedCourses[0]?.title, "Strength basics");
  assert.deepEqual(parsed.fitnessChallenges[0]?.selfReportedDates, ["2026-11-10"]);
  assert.equal(parsed.fitnessChallenges[0]?.activeDays, 2);
  assert.equal(parsed.loyaltyPoints.balance, 2);
  assert.deepEqual(parsed.loyaltyPoints.entries.map(entry => entry.source), ["confirmed_visit", "course_completion"]);
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
