import { clerkClient } from "@clerk/express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  attendance,
  courseEnrollments,
  db,
  facilityReviews,
  learningCourses,
  learningLessons,
  lessonProgress,
  memberNotificationPreferences,
  memberProfiles,
  memberships,
  offerings,
  reservations,
  supportTickets,
  waitlistEntries,
} from "@workspace/db";
import { GetMemberPrivacyRequestExportResponse } from "@workspace/api-zod";
import { getPrivacyRequestKind, privacyRequestSubjects } from "./privacy-requests";

export async function createMemberDataExport(userId: string) {
  const [
    account,
    profileRows,
    membershipRows,
    bookingRows,
    waitlistRows,
    attendanceRows,
    enrollmentRows,
    reviewRows,
    notificationRows,
    privacyRows,
  ] = await Promise.all([
    clerkClient.users.getUser(userId),
    db.select({ gender: memberProfiles.gender, birthDate: memberProfiles.birthDate })
      .from(memberProfiles).where(eq(memberProfiles.userId, userId)).limit(1),
    db.select({
      scope: memberships.scope,
      status: memberships.status,
      tier: memberships.tier,
      source: memberships.source,
      startsAt: memberships.startsAt,
      endsAt: memberships.endsAt,
    }).from(memberships).where(eq(memberships.userId, userId)).orderBy(asc(memberships.startsAt)),
    db.select({
      id: reservations.id,
      kind: offerings.kind,
      title: offerings.title,
      city: offerings.city,
      facility: offerings.facility,
      category: offerings.category,
      scope: offerings.scope,
      startsAt: offerings.startsAt,
      endsAt: offerings.endsAt,
      status: reservations.status,
      createdAt: reservations.createdAt,
      cancelledAt: reservations.cancelledAt,
    }).from(reservations)
      .innerJoin(offerings, eq(reservations.offeringId, offerings.id))
      .where(eq(reservations.userId, userId))
      .orderBy(desc(offerings.startsAt)),
    db.select({
      id: waitlistEntries.id,
      title: offerings.title,
      startsAt: offerings.startsAt,
      queuePosition: waitlistEntries.queuePosition,
      status: waitlistEntries.status,
      createdAt: waitlistEntries.createdAt,
      offerExpiresAt: waitlistEntries.offerExpiresAt,
      respondedAt: waitlistEntries.respondedAt,
    }).from(waitlistEntries)
      .innerJoin(offerings, eq(waitlistEntries.offeringId, offerings.id))
      .where(eq(waitlistEntries.userId, userId))
      .orderBy(desc(waitlistEntries.createdAt)),
    db.select({
      id: attendance.id,
      title: offerings.title,
      city: offerings.city,
      facility: offerings.facility,
      checkedInAt: attendance.checkedInAt,
      status: attendance.status,
    }).from(attendance)
      .innerJoin(offerings, eq(attendance.offeringId, offerings.id))
      .where(eq(attendance.userId, userId))
      .orderBy(desc(attendance.checkedInAt)),
    db.select({
      id: courseEnrollments.id,
      title: learningCourses.title,
      enrolledAt: courseEnrollments.enrolledAt,
    }).from(courseEnrollments)
      .innerJoin(learningCourses, eq(courseEnrollments.courseId, learningCourses.id))
      .where(eq(courseEnrollments.userId, userId))
      .orderBy(desc(courseEnrollments.enrolledAt)),
    db.select({
      overallRating: facilityReviews.overallRating,
      categoryRatings: facilityReviews.categoryRatings,
      content: facilityReviews.content,
      status: facilityReviews.status,
      createdAt: facilityReviews.createdAt,
      updatedAt: facilityReviews.updatedAt,
    }).from(facilityReviews)
      .where(eq(facilityReviews.reviewerUserId, userId))
      .orderBy(desc(facilityReviews.createdAt)),
    db.select({
      pushEnabled: memberNotificationPreferences.pushEnabled,
      language: memberNotificationPreferences.language,
      updatedAt: memberNotificationPreferences.updatedAt,
    }).from(memberNotificationPreferences)
      .where(eq(memberNotificationPreferences.userId, userId))
      .limit(1),
    db.select({
      subject: supportTickets.subject,
      status: supportTickets.status,
      createdAt: supportTickets.createdAt,
    }).from(supportTickets).where(and(
      eq(supportTickets.userId, userId),
      eq(supportTickets.category, "account"),
      inArray(supportTickets.subject, privacyRequestSubjects),
    )).orderBy(desc(supportTickets.createdAt)),
  ]);

  const enrollmentIds = enrollmentRows.map(row => row.id);
  const progressRows = enrollmentIds.length
    ? await db.select({
      enrollmentId: lessonProgress.enrollmentId,
      title: learningLessons.localizedTitle,
      completedAt: lessonProgress.completedAt,
    }).from(lessonProgress)
      .innerJoin(learningLessons, eq(lessonProgress.lessonId, learningLessons.id))
      .where(inArray(lessonProgress.enrollmentId, enrollmentIds))
      .orderBy(asc(lessonProgress.completedAt))
    : [];

  const completedLessons = new Map<string, { title: string; completedAt: Date }[]>();
  for (const row of progressRows) {
    const lessons = completedLessons.get(row.enrollmentId) ?? [];
    lessons.push({
      title: row.title.en,
      completedAt: row.completedAt,
    });
    completedLessons.set(row.enrollmentId, lessons);
  }

  return GetMemberPrivacyRequestExportResponse.parse({
    formatVersion: "1.0",
    generatedAt: new Date(),
    account: {
      email: account.primaryEmailAddress?.emailAddress ?? null,
      firstName: account.firstName,
      lastName: account.lastName,
      createdAt: new Date(account.createdAt),
      profile: profileRows[0] ?? null,
    },
    memberships: membershipRows,
    bookings: bookingRows,
    waitlist: waitlistRows,
    attendance: attendanceRows,
    courses: enrollmentRows.map(row => ({
      title: row.title,
      enrolledAt: row.enrolledAt,
      completedLessons: completedLessons.get(row.id) ?? [],
    })),
    reviews: reviewRows,
    privacyRequests: privacyRows.map(row => ({
      ...row,
      kind: getPrivacyRequestKind(row.subject),
    })),
    notificationPreferences: notificationRows[0] ?? null,
    excludedData: [
      "payment_instrument_details",
      "login_credentials",
      "push_tokens",
      "private_class_links",
      "support_conversation_messages",
      "internal_support_notes",
    ],
  });
}
