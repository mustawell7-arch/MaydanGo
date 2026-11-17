import { clerkClient } from "@clerk/express";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import {
  attendance,
  courseEnrollments,
  db,
  facilityReviews,
  learningCourses,
  learningLessons,
  lessonAccess,
  lessonProgress,
  memberConsentEvents,
  memberProfilePhotos,
  memberSavedCourses,
  memberNotificationPreferences,
  memberProfiles,
  memberReferralAttributions,
  memberReferralCodes,
  memberships,
  offerings,
  reservations,
  supportAttachments,
  supportMessages,
  supportTickets,
  waitlistEntries,
} from "@workspace/db";
import { GetMemberPrivacyRequestExportResponse } from "@workspace/api-zod";
import { getPrivacyRequestKind, privacyRequestSubjects } from "./privacy-requests";
import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";

const memberDataExportStorage = new ObjectStorageService();

export async function createMemberDataExport(userId: string) {
  const [
    account,
    profileRows,
    profilePhotoRows,
    membershipRows,
    bookingRows,
    waitlistRows,
    attendanceRows,
    enrollmentRows,
    savedCourseRows,
    reviewRows,
    notificationRows,
    privacyRows,
    consentRows,
    supportTicketRows,
    ownReferralRows,
    referralCountRows,
    appliedReferralRows,
  ] = await Promise.all([
    clerkClient.users.getUser(userId),
    db.select({ gender: memberProfiles.gender, birthDate: memberProfiles.birthDate })
      .from(memberProfiles).where(eq(memberProfiles.userId, userId)).limit(1),
    db.select().from(memberProfilePhotos).where(eq(memberProfilePhotos.userId, userId)).limit(1),
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
      lastAccessAt: courseEnrollments.lastAccessAt,
    }).from(courseEnrollments)
      .innerJoin(learningCourses, eq(courseEnrollments.courseId, learningCourses.id))
      .where(eq(courseEnrollments.userId, userId))
      .orderBy(desc(courseEnrollments.enrolledAt)),
    db.select({
      title: learningCourses.title,
      savedAt: memberSavedCourses.savedAt,
    }).from(memberSavedCourses)
      .innerJoin(learningCourses, eq(memberSavedCourses.courseId, learningCourses.id))
      .where(eq(memberSavedCourses.userId, userId))
      .orderBy(desc(memberSavedCourses.savedAt)),
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
    db.select({
      purpose: memberConsentEvents.purpose,
      policyVersion: memberConsentEvents.policyVersion,
      choice: memberConsentEvents.choice,
      recordedAt: memberConsentEvents.recordedAt,
    }).from(memberConsentEvents)
      .where(eq(memberConsentEvents.userId, userId))
      .orderBy(desc(memberConsentEvents.recordedAt), desc(memberConsentEvents.id)),
    db.select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      category: supportTickets.category,
      status: supportTickets.status,
      language: supportTickets.language,
      createdAt: supportTickets.createdAt,
      closedAt: supportTickets.closedAt,
    }).from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.createdAt)),
    db.select({ code: memberReferralCodes.code }).from(memberReferralCodes)
      .where(eq(memberReferralCodes.ownerUserId, userId)).limit(1),
    db.select({ count: count() }).from(memberReferralAttributions)
      .where(eq(memberReferralAttributions.referrerUserId, userId)),
    db.select({
      code: memberReferralCodes.code,
      attributedAt: memberReferralAttributions.attributedAt,
    }).from(memberReferralAttributions)
      .innerJoin(memberReferralCodes, eq(memberReferralAttributions.codeId, memberReferralCodes.id))
      .where(eq(memberReferralAttributions.referredUserId, userId)).limit(1),
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
  const lessonAccessRows = enrollmentIds.length
    ? await db.select({
      enrollmentId: lessonAccess.enrollmentId,
      title: learningLessons.localizedTitle,
      firstViewedAt: lessonAccess.firstViewedAt,
      lastViewedAt: lessonAccess.lastViewedAt,
      playbackPositionSeconds: lessonAccess.playbackPositionSeconds,
      durationSeconds: lessonAccess.durationSeconds,
    }).from(lessonAccess)
      .innerJoin(learningLessons, eq(lessonAccess.lessonId, learningLessons.id))
      .where(inArray(lessonAccess.enrollmentId, enrollmentIds))
      .orderBy(asc(lessonAccess.lastViewedAt))
    : [];
  const supportTicketIds = supportTicketRows.map(row => row.id);
  const supportMessageRows = supportTicketIds.length
    ? await db.select({
      id: supportMessages.id,
      ticketId: supportMessages.ticketId,
      authorRole: supportMessages.authorRole,
      body: supportMessages.body,
      language: supportMessages.language,
      createdAt: supportMessages.createdAt,
    }).from(supportMessages).where(and(
      inArray(supportMessages.ticketId, supportTicketIds),
      eq(supportMessages.isInternal, false),
    )).orderBy(asc(supportMessages.createdAt))
    : [];
  const supportMessageIds = supportMessageRows.map(row => row.id);
  const supportAttachmentRows = supportMessageIds.length
    ? await db.select({
      messageId: supportAttachments.messageId,
      fileName: supportAttachments.fileName,
      contentType: supportAttachments.contentType,
      size: supportAttachments.size,
      status: supportAttachments.status,
      createdAt: supportAttachments.createdAt,
    }).from(supportAttachments)
      .where(inArray(supportAttachments.messageId, supportMessageIds))
      .orderBy(asc(supportAttachments.createdAt))
    : [];
  const attachmentsByMessage = new Map<string, typeof supportAttachmentRows>();
  for (const row of supportAttachmentRows) {
    const attachments = attachmentsByMessage.get(row.messageId) ?? [];
    attachments.push(row);
    attachmentsByMessage.set(row.messageId, attachments);
  }

  const completedLessons = new Map<string, { title: string; completedAt: Date }[]>();
  for (const row of progressRows) {
    const lessons = completedLessons.get(row.enrollmentId) ?? [];
    lessons.push({
      title: row.title.en,
      completedAt: row.completedAt,
    });
    completedLessons.set(row.enrollmentId, lessons);
  }
  const viewedLessons = new Map<string, Array<{
    title: string;
    firstViewedAt: Date;
    lastViewedAt: Date;
    playbackPositionSeconds: number;
    durationSeconds: number | null;
  }>>();
  for (const row of lessonAccessRows) {
    const lessons = viewedLessons.get(row.enrollmentId) ?? [];
    lessons.push({
      title: row.title.en,
      firstViewedAt: row.firstViewedAt,
      lastViewedAt: row.lastViewedAt,
      playbackPositionSeconds: row.playbackPositionSeconds,
      durationSeconds: row.durationSeconds,
    });
    viewedLessons.set(row.enrollmentId, lessons);
  }
  const messagesByTicket = new Map<string, typeof supportMessageRows>();
  for (const row of supportMessageRows) {
    const messages = messagesByTicket.get(row.ticketId) ?? [];
    messages.push(row);
    messagesByTicket.set(row.ticketId, messages);
  }

  const savedProfilePhoto = profilePhotoRows[0];
  let profilePhotoExport = {
    present: false,
    consentVersion: savedProfilePhoto?.consentVersion ?? null,
    consentAt: savedProfilePhoto?.consentAt ?? null,
    contentType: null as "image/jpeg" | "image/png" | "image/webp" | null,
    imageBase64: null as string | null,
  };
  if (savedProfilePhoto?.objectPath) {
    let imageFile;
    try {
      imageFile = await memberDataExportStorage.getPrivateFile(savedProfilePhoto.objectPath);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
      throw new Error("The member profile photo is missing from private storage; the data export cannot be completed.");
    }
    const [metadata] = await imageFile.getMetadata();
    const contentType = String(metadata.contentType ?? "");
    const size = Number(metadata.size ?? 0);
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)
      || size < 1 || size > 5_000_000) {
      throw new Error("The member profile photo is not a supported image; the data export cannot be completed.");
    }
    const [imageBytes] = await imageFile.download();
    if (imageBytes.byteLength !== size) {
      throw new Error("The member profile photo changed while the data export was being prepared.");
    }
    profilePhotoExport = {
      present: true,
      consentVersion: savedProfilePhoto.consentVersion,
      consentAt: savedProfilePhoto.consentAt,
      contentType: contentType as "image/jpeg" | "image/png" | "image/webp",
      imageBase64: imageBytes.toString("base64"),
    };
  }

  return GetMemberPrivacyRequestExportResponse.parse({
    formatVersion: "1.3",
    generatedAt: new Date(),
    account: {
      email: account.primaryEmailAddress?.emailAddress ?? null,
      firstName: account.firstName,
      lastName: account.lastName,
      createdAt: new Date(account.createdAt),
      profile: profileRows[0] ?? null,
      profilePhoto: profilePhotoExport,
    },
    memberships: membershipRows,
    bookings: bookingRows,
    waitlist: waitlistRows,
    attendance: attendanceRows,
    courses: enrollmentRows.map(row => ({
      title: row.title,
      enrolledAt: row.enrolledAt,
      lastAccessAt: row.lastAccessAt,
      completedLessons: completedLessons.get(row.id) ?? [],
      viewedLessons: viewedLessons.get(row.id) ?? [],
    })),
    savedCourses: savedCourseRows,
    reviews: reviewRows,
    consentHistory: consentRows,
    supportConversations: supportTicketRows.map(ticket => ({
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      language: ticket.language,
      createdAt: ticket.createdAt,
      closedAt: ticket.closedAt,
      messages: (messagesByTicket.get(ticket.id) ?? []).map(message => ({
        authorRole: message.authorRole,
        body: message.body,
        language: message.language,
        createdAt: message.createdAt,
        attachments: (attachmentsByMessage.get(message.id) ?? []).map(({ fileName, contentType, size, status, createdAt }) => ({
          fileName,
          contentType,
          size,
          status,
          createdAt,
        })),
      })),
    })),
    referrals: {
      inviteCode: ownReferralRows[0]?.code ?? null,
      attributedSignups: referralCountRows[0]?.count ?? 0,
      codeUsed: appliedReferralRows[0]?.code ?? null,
      attributedAt: appliedReferralRows[0]?.attributedAt ?? null,
    },
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
      "internal_support_notes",
      "support_attachment_contents",
      "browser_local_cookie_choice",
    ],
  });
}
