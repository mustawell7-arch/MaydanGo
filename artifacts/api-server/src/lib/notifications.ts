import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db, memberConsentEvents, memberNotificationPreferences, operationAudit, operators, pushDeliveries, pushDevices, supportTickets,
  waitlistEntries,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
import { buildMemberConsentState, hasCurrentMarketingConsent } from "./member-consents";

export type AppLanguage = "en" | "ar" | "ku";
export type NotificationKind =
  | "booking_created"
  | "booking_cancelled"
  | "venue_suspension_cancelled"
  | "booking_rejected"
  | "schedule_changed"
  | "live_class_reminder"
  | "waitlist_offer"
  | "waitlist_reminder"
  | "waitlist_expired"
  | "waitlist_booked"
  | "waitlist_closed"
  | "attendance_received"
  | "attendance_updated"
  | "support_reply"
  | "support_status"
  | "support_urgent"
  | "support_urgent_escalation"
  | "partner_document_expiry_upcoming"
  | "partner_document_expiry_overdue"
  | "waitlist_promoted"
  | "waitlist_cancelled"
  | "marketing_update";
type OperationalNotificationKind = Exclude<NotificationKind, "marketing_update">;
type NotificationContext = {
  offerExpiresAt?: Date;
  remainingMinutes?: number;
  dedupeKey?: string;
  reservationId?: string;
  ticketId?: string;
  qualityRecord?: {
    facilityId: string;
    documentType: "licence" | "insurance";
    expiresOn: string;
    phase: "upcoming" | "overdue";
  };
};
export type LocalizedMarketingMessage = Record<AppLanguage, { title: string; body: string }>;

const copy: Record<AppLanguage, Record<NotificationKind, { title: string; body: string }>> = {
  en: {
    booking_created: { title: "Booking confirmed", body: "Your MaydanGO booking is confirmed." },
    booking_cancelled: { title: "Booking update", body: "Your MaydanGO booking was cancelled." },
    venue_suspension_cancelled: { title: "Venue visit cancelled", body: "Your upcoming visit was cancelled because the venue is unavailable. Your membership visit allowance has been restored. Contact MaydanGo support about any separate payment." },
    booking_rejected: { title: "Booking request update", body: "The venue could not accept this booking request. Contact MaydanGO support if you need help." },
    schedule_changed: { title: "Class schedule changed", body: "A class time changed. Check the updated schedule in MaydanGO." },
    live_class_reminder: { title: "Live class reminder", body: "Your booked online class starts within the next hour. Open MaydanGO to review the details." },
    waitlist_offer: { title: "A class place opened", body: "A place opened in your class. Accept by {deadline} Iraq time in MaydanGO; it is not booked until you accept." },
    waitlist_reminder: { title: "Your class offer is still open", body: "Your class place is still available. Accept within {remaining} in MaydanGO before the offer expires." },
    waitlist_expired: { title: "Waitlist offer expired", body: "Your offer expired, so the place moved to the next person. You are no longer holding it." },
    waitlist_booked: { title: "Class booking confirmed", body: "You accepted the waitlist offer. Your MaydanGO class booking is confirmed." },
    waitlist_closed: { title: "Waitlist closed", body: "This class was cancelled. Your waitlist entry is closed and no booking was made." },
    attendance_received: { title: "Arrival recorded", body: "Your arrival is recorded and awaiting the venue’s confirmation." },
    attendance_updated: { title: "Attendance update", body: "Your class attendance record has been updated." },
    support_reply: { title: "Support replied", body: "There is a new reply in your MaydanGO support conversation." },
    support_status: { title: "Support update", body: "The status of your MaydanGO support request has changed." },
    support_urgent: { title: "Urgent safety report", body: "A new urgent safety report is in the MaydanGO support queue. Please review and assign it to an authorized teammate." },
    support_urgent_escalation: { title: "Urgent report still unassigned", body: "An urgent safety report is still unassigned after 30 minutes. Open MaydanGO support and assign it to an authorized teammate." },
    partner_document_expiry_upcoming: { title: "Partner document due soon", body: "A partner licence or insurance document expires within 30 days. Open the facility quality record to review it." },
    partner_document_expiry_overdue: { title: "Partner document expired", body: "A partner licence or insurance document has expired without an approved renewal. Review the facility quality record." },
    waitlist_promoted: { title: "A place opened", body: "A place in your MaydanGO class is now reserved for you." },
    waitlist_cancelled: { title: "Class cancelled", body: "The partner cancelled this class, so you were removed from its waiting list." },
    marketing_update: { title: "MaydanGo update", body: "A new MaydanGo offer is available." },
  },
  ar: {
    booking_created: { title: "تم تأكيد الحجز", body: "تم تأكيد حجزك في MaydanGO." },
    booking_cancelled: { title: "تحديث الحجز", body: "تم إلغاء حجزك في MaydanGO." },
    venue_suspension_cancelled: { title: "أُلغيت زيارة المكان", body: "أُلغيت زيارتك القادمة لعدم توفر المكان. أُعيدت الزيارة إلى رصيد عضويتك. تواصل مع دعم MaydanGo بشأن أي دفعة منفصلة." },
    booking_rejected: { title: "تحديث طلب الحجز", body: "لم يتمكن المكان من قبول طلب الحجز. تواصل مع دعم MaydanGO إذا احتجت إلى مساعدة." },
    schedule_changed: { title: "تغيّر موعد الحصة", body: "تغيّر موعد حصة. راجع الجدول المحدّث في MaydanGO." },
    live_class_reminder: { title: "تذكير بالحصة المباشرة", body: "تبدأ حصتك المباشرة المحجوزة خلال الساعة القادمة. افتح MaydanGO لمراجعة التفاصيل." },
    waitlist_offer: { title: "توفر مكان في الحصة", body: "توفر مكان في حصتك. أكّد الحجز في MaydanGO قبل {deadline} بتوقيت العراق؛ ما يتأكد الحجز إلا بعد موافقتك." },
    waitlist_reminder: { title: "ما زال عرض الحصة متاحاً", body: "ما زال المكان متاحاً. أكّد الحجز خلال {remaining} في MaydanGO قبل انتهاء المهلة." },
    waitlist_expired: { title: "انتهت مهلة العرض", body: "انتهت مهلة عرض المكان، وانتقل للشخص التالي. ما عاد المكان محجوزاً لك." },
    waitlist_booked: { title: "تم تأكيد حجز الحصة", body: "قبلت عرض قائمة الانتظار، وتم تأكيد حجزك للحصة في MaydanGO." },
    waitlist_closed: { title: "أُغلقت قائمة الانتظار", body: "أُلغيت هذه الحصة. أُغلق طلبك في قائمة الانتظار ولم يتم إنشاء حجز." },
    attendance_received: { title: "تم تسجيل الوصول", body: "تم تسجيل وصولك وبانتظار تأكيد المكان." },
    attendance_updated: { title: "تحديث الحضور", body: "تم تحديث سجل حضورك للحصة." },
    support_reply: { title: "ردّ فريق الدعم", body: "هناك رد جديد في محادثة الدعم الخاصة بك في MaydanGO." },
    support_status: { title: "تحديث من الدعم", body: "تغيّرت حالة طلب الدعم الخاص بك في MaydanGO." },
    support_urgent: { title: "بلاغ سلامة عاجل", body: "يوجد بلاغ سلامة عاجل جديد في قائمة دعم MaydanGO. يرجى مراجعته وإسناده إلى عضو مخوّل من فريق الدعم." },
    support_urgent_escalation: { title: "تذكير ببلاغ سلامة عاجل غير مسند", body: "ما زال هناك بلاغ سلامة عاجل غير مسند بعد 30 دقيقة. افتح دعم MaydanGO وأسنده إلى عضو مخوّل من الفريق." },
    partner_document_expiry_upcoming: { title: "اقتراب انتهاء مستند شريك", body: "سينتهي ترخيص أو تأمين أحد الشركاء خلال 30 يوماً. افتح سجل جودة المرفق لمراجعته." },
    partner_document_expiry_overdue: { title: "انتهاء مستند شريك", body: "انتهى ترخيص أو تأمين أحد الشركاء دون اعتماد تجديد. راجع سجل جودة المرفق." },
    waitlist_promoted: { title: "توفر مكان", body: "تم حجز مكان لك في الحصة التي انتظرتها عبر MaydanGO." },
    waitlist_cancelled: { title: "تم إلغاء الحصة", body: "ألغى الشريك هذه الحصة، لذلك أُزلت من قائمة الانتظار." },
    marketing_update: { title: "تحديث من MaydanGO", body: "هناك عرض جديد من MaydanGO." },
  },
  ku: {
    booking_created: { title: "حجز پشتڕاست کرایەوە", body: "حجزەکەت لە MaydanGO پشتڕاست کرایەوە." },
    booking_cancelled: { title: "نوێکاریی حجز", body: "حجزەکەت لە MaydanGO هەڵوەشێندرایەوە." },
    venue_suspension_cancelled: { title: "سەردانی شوێن هەڵوەشێندرایەوە", body: "سەردانی داهاتووت بەهۆی بەردەست نەبوونی شوێنەکە هەڵوەشێندرایەوە. سەردانەکە گەڕێندرایەوە بۆ باڵانسی ئەندامێتیت. بۆ هەر پارەدانێکی جیاواز پەیوەندی بە پشتگیریی MaydanGo بکە." },
    booking_rejected: { title: "نوێکاریی داواکاریی حجز", body: "شوێنەکە نەیتوانی داواکاریی حجزەکەت قبوڵ بکات. ئەگەر یارمەتی پێویستت بوو، پەیوەندی بە پشتگیریی MaydanGO بکە." },
    schedule_changed: { title: "کاتی وانە گۆڕا", body: "کاتی وانەیەک گۆڕا. خشتەی نوێ لە MaydanGO ببینە." },
    live_class_reminder: { title: "بیرخستنەوەی وانەی ئۆنلاین", body: "وانەی ئۆنلاینە حجزکراوەکەت لە ماوەی کاتژمێرێکی داهاتوودا دەست پێدەکات. MaydanGO بکەرەوە بۆ پێداچوونەوە بە وردەکارییەکان." },
    waitlist_offer: { title: "شوێنێک لە وانە بەردەستە", body: "شوێنێک لە وانەکەت بەردەست بووە. تا {deadline} بە کاتی عێراق لە MaydanGO پێشنیارەکە قبووڵ بکە؛ حجزەکە تا ئەو کاتە پشتڕاست نییە." },
    waitlist_reminder: { title: "پێشنیاری وانەکەت هێشتا بەردەستە", body: "شوێنەکە هێشتا بەردەستە. لە ماوەی {remaining}دا لە MaydanGO پێشنیارەکە قبووڵ بکە پێش ئەوەی کاتەکەی تەواو ببێت." },
    waitlist_expired: { title: "ماوەی پێشنیاری چاوەڕوانی تەواو بوو", body: "ماوەی پێشنیاری شوێنەکە تەواو بوو و شوێنەکە درا بە کەسی دواتر. چیتر شوێنەکە بۆ تۆ نەپارێزراوە." },
    waitlist_booked: { title: "حجزکردنی وانە پشتڕاست کرایەوە", body: "پێشنیاری لیستی چاوەڕوانیت قبووڵ کرد و حجزکردنی وانەکەت لە MaydanGO پشتڕاست کرایەوە." },
    waitlist_closed: { title: "لیستی چاوەڕوانی داخرا", body: "ئەم وانەیە هەڵوەشێندرایەوە. تۆماری چاوەڕوانییەکەت داخرا و هیچ حجزێک دروست نەکرا." },
    attendance_received: { title: "گەیشتنت تۆمار کرا", body: "گەیشتنت تۆمار کرا و چاوەڕێی پشتڕاستکردنەوەی شوێنەکەیە." },
    attendance_updated: { title: "نوێکاریی ئامادەبوون", body: "تۆماری ئامادەبوونت بۆ وانەکە نوێ کرایەوە." },
    support_reply: { title: "وەڵامی پشتگیری", body: "وەڵامێکی نوێ لە گفتوگۆی پشتگیریی MaydanGO هەیە." },
    support_status: { title: "نوێکاریی پشتگیری", body: "دۆخی داواکاریی پشتگیریی MaydanGO گۆڕاوە." },
    support_urgent: { title: "ڕاپۆرتی پەلەیی سەلامەتی", body: "ڕاپۆرتێکی پەلەیی نوێی سەلامەتی لە لیستی پشتگیریی MaydanGO هەیە. تکایە پێداچوونەوەی بۆ بکە و بیسپێرە بە ئەندامێکی ڕێگەپێدراوی تیمی پشتگیری." },
    support_urgent_escalation: { title: "بیرخستنەوەی ڕاپۆرتی پەلەیی ناسپێردراو", body: "دوای 30 خولەک هێشتا ڕاپۆرتێکی پەلەیی سەلامەتی نەسپێردراوە. پشتگیریی MaydanGO بکەرەوە و بیسپێرە بە ئەندامێکی ڕێگەپێدراوی تیم." },
    partner_document_expiry_upcoming: { title: "بەڵگەنامەی هاوبەش بە زوویی بەسەردەچێت", body: "مۆڵەت یان بیمەیەکی هاوبەش لە ماوەی ٣٠ ڕۆژدا بەسەردەچێت. تۆماری کوالێتیی شوێن بکەرەوە و پێداچوونەوەی بۆ بکە." },
    partner_document_expiry_overdue: { title: "بەڵگەنامەی هاوبەش بەسەرچووە", body: "مۆڵەت یان بیمەیەکی هاوبەش بەسەرچووە و نوێکردنەوەی پەسەندکراوی نییە. تۆماری کوالێتیی شوێن بپشکنە." },
    waitlist_promoted: { title: "شوێنێک بەردەست بوو", body: "شوێنێک لە وانەکەت لە MaydanGO بۆ تۆ حجز کرا." },
    waitlist_cancelled: { title: "وانەکە هەڵوەشێندرایەوە", body: "شریکەکە وانەکەی هەڵوەشاندەوە، بۆیە لە لیستی چاوەڕوانی دەرتکرایت." },
    marketing_update: { title: "نوێکاریی MaydanGO", body: "پێشکەشکردنێکی نوێ لە MaydanGO بەردەستە." },
  },
};

function messageOf(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);
  return message.replace(/(?:Expo|Exponent)PushToken\[[^\]]+\]/g, "[redacted]").slice(0, 400);
}

function remainingTime(minutes: number, language: AppLanguage) {
  const count = Math.max(1, Math.ceil(minutes));
  const number = new Intl.NumberFormat(language === "en" ? "en-IQ" : language === "ar" ? "ar-IQ" : "ku-IQ").format(count);
  if (language === "en") return `${number} ${count === 1 ? "minute" : "minutes"}`;
  if (language === "ar") {
    const unit = count === 1 ? "دقيقة" : count === 2 ? "دقيقتان" : count % 100 >= 3 && count % 100 <= 10 ? "دقائق" : "دقيقة";
    return `${number} ${unit}`;
  }
  return `${number} خولەک`;
}

const MAX_SEND_ATTEMPTS = 3;
const SEND_RETRY_DELAYS_MS = [30_000, 120_000];
const RECEIPT_READY_AFTER_MS = 15 * 60_000;
const RECEIPT_RECHECK_AFTER_MS = 15 * 60_000;
const MAX_RECEIPT_CHECKS = 3;
const RECOVERY_BATCH_SIZE = 100;
export const URGENT_UNASSIGNED_ESCALATION_DELAY_MS = 30 * 60_000;
const ACTIVE_SUPPORT_TICKET_STATUSES = ["open", "in_progress", "waiting_member"] as const;
const URGENT_ESCALATION_KIND = "support_urgent_escalation";

type PushDeliveryRow = typeof pushDeliveries.$inferSelect;
type PushDeviceRow = typeof pushDevices.$inferSelect;
type PushAttempt = { delivery: PushDeliveryRow; device: PushDeviceRow };
type ExpoPushTicket = { status?: string; id?: string; message?: string; details?: { error?: string } };
type ExpoPushReceipt = { status?: string; message?: string; details?: { error?: string } };

async function markUrgentAlertAccepted(delivery: PushDeliveryRow) {
  const ticketId = delivery.kind === "support_urgent" || delivery.kind === URGENT_ESCALATION_KIND
    ? delivery.payloadData?.ticketId
    : undefined;
  if (!ticketId) return;
  try {
    await db.update(supportTickets).set({ urgentAlertStatus: "accepted" })
      .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.urgent, true)));
  } catch (error) {
    console.error("Could not record accepted urgent support alert.", error);
  }
}

export async function refreshUrgentAlertFallbackStatus(ticketId: string) {
  try {
    const deliveries = await db.select({
      status: pushDeliveries.status,
      receiptStatus: pushDeliveries.receiptStatus,
    }).from(pushDeliveries).where(and(
      inArray(pushDeliveries.kind, ["support_urgent", URGENT_ESCALATION_KIND]),
      sql`${pushDeliveries.payloadData}->>'ticketId' = ${ticketId}`,
    ));
    const hasConfirmedDevice = deliveries.some(delivery => delivery.receiptStatus === "ok");
    const hasPendingDelivery = deliveries.some(delivery =>
      delivery.status === "pending"
      || delivery.status === "retry_pending"
      || delivery.receiptStatus === "pending"
      || delivery.receiptStatus === null,
    );
    const allDeliveriesUnconfirmed = deliveries.length > 0 && deliveries.every(delivery =>
      ["error", "unavailable"].includes(delivery.receiptStatus ?? "")
      || (delivery.status === "failed" && delivery.receiptStatus === null),
    );
    if (!hasConfirmedDevice && !hasPendingDelivery && allDeliveriesUnconfirmed) {
      await db.update(supportTickets).set({ urgentAlertStatus: "fallback_required" })
        .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.urgent, true)));
    }
  } catch (error) {
    console.error("Could not evaluate urgent support alert delivery.", error);
  }
}

function retryAt(attemptCount: number, now: Date) {
  const delay = SEND_RETRY_DELAYS_MS[Math.min(Math.max(attemptCount - 1, 0), SEND_RETRY_DELAYS_MS.length - 1)];
  return new Date(now.getTime() + delay);
}

async function recordAttemptFailure(
  attempt: PushAttempt,
  error: string,
  now: Date,
  retryable: boolean,
  receipt?: { status: string; error: string; checkedAt: Date; attemptCount: number },
) {
  const shouldRetry = retryable && attempt.delivery.attemptCount < MAX_SEND_ATTEMPTS;
  await db.update(pushDeliveries).set({
    status: shouldRetry ? "retry_pending" : "failed",
    error,
    nextAttemptAt: shouldRetry ? retryAt(attempt.delivery.attemptCount, now) : null,
    ...(receipt ? {
      receiptStatus: receipt.status,
      receiptError: receipt.error,
      receiptCheckedAt: receipt.checkedAt,
      receiptAttemptCount: receipt.attemptCount,
    } : {}),
  }).where(eq(pushDeliveries.id, attempt.delivery.id));
  return shouldRetry;
}

async function disableUnregisteredDevice(deviceId: string, userId: string, now: Date) {
  await db.update(pushDevices).set({ enabled: false, updatedAt: now }).where(eq(pushDevices.id, deviceId));
  const [remaining] = await db.select({ id: pushDevices.id }).from(pushDevices)
    .where(and(eq(pushDevices.userId, userId), eq(pushDevices.enabled, true))).limit(1);
  if (!remaining) {
    await db.update(memberNotificationPreferences).set({ pushEnabled: false, updatedAt: now })
      .where(eq(memberNotificationPreferences.userId, userId));
  }
}

async function sendPushAttempts(attempts: PushAttempt[], now: Date) {
  if (!attempts.length) return true;
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(attempts.map(({ delivery, device }) => ({
        to: device.token,
        title: delivery.title,
        body: delivery.body,
        sound: "default",
        data: { ...(delivery.payloadData ?? {}), kind: delivery.kind },
      }))),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const failure = `Expo push service returned HTTP ${response.status}.`;
      // A 429 is an explicit rejection. Do not blindly retry ambiguous transport
      // or server failures because Expo may have accepted those messages.
      await Promise.all(attempts.map(attempt => recordAttemptFailure(
        attempt, failure, now, response.status === 429,
      )));
      return false;
    }

    const responseData = await response.json() as { data?: ExpoPushTicket | ExpoPushTicket[] };
    const tickets = Array.isArray(responseData.data)
      ? responseData.data
      : responseData.data ? [responseData.data] : [];
    await Promise.all(attempts.map(async (attempt, index) => {
      const ticket = tickets[index];
      if (ticket?.status === "ok") {
        const receiptStatus = ticket.id ? "pending" : "unavailable";
        await db.update(pushDeliveries).set({
          status: "sent",
          error: null,
          providerTicketId: ticket.id ?? null,
          acceptedAt: now,
          nextAttemptAt: null,
          receiptStatus,
          receiptError: ticket.id ? null : "Expo accepted this notification without a receipt ID.",
          receiptCheckedAt: ticket.id ? null : now,
          receiptAttemptCount: 0,
        }).where(eq(pushDeliveries.id, attempt.delivery.id));
        await markUrgentAlertAccepted(attempt.delivery);
        return;
      }

      const errorCode = ticket?.details?.error;
      const failure = messageOf(errorCode ?? ticket?.message ?? "Expo did not accept this notification.");
      if (errorCode === "DeviceNotRegistered") {
        await disableUnregisteredDevice(attempt.device.id, attempt.delivery.userId, now);
      }
      await recordAttemptFailure(attempt, failure, now, errorCode === "MessageRateExceeded");
    }));
    const urgentTicketIds = [...new Set(attempts.flatMap(({ delivery }) =>
      (delivery.kind === "support_urgent" || delivery.kind === URGENT_ESCALATION_KIND) && delivery.payloadData?.ticketId
        ? [delivery.payloadData.ticketId]
        : [],
    ))];
    await Promise.all(urgentTicketIds.map(refreshUrgentAlertFallbackStatus));
    return attempts.every((_, index) => tickets[index]?.status === "ok");
  } catch (error) {
    const failure = messageOf(error);
    // A timeout or broken connection has an unknown provider outcome. Keep it
    // visible for staff rather than risk sending a duplicate on automatic retry.
    await Promise.all(attempts.map(attempt => recordAttemptFailure(attempt, failure, now, false)));
    return false;
  }
}

/**
 * Sends operational notifications only after the underlying state change has
 * committed. Delivery errors are stored for staff review and never rethrown.
 */
async function deliverMemberNotification(
  userId: string,
  kind: NotificationKind,
  context: NotificationContext = {},
  marketingMessage?: LocalizedMarketingMessage,
) {
  try {
    if (kind === "marketing_update" && !await hasCurrentMarketingConsent(userId)) {
      return { status: "skipped" as const, reason: "marketing_consent_required" };
    }
    const [preference] = await db.select().from(memberNotificationPreferences)
      .where(eq(memberNotificationPreferences.userId, userId)).limit(1);
    if (!preference?.pushEnabled) return { status: "skipped" as const, reason: "opted_out" };

    const devices = await db.select().from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.enabled, true)));
    if (!devices.length) return { status: "skipped" as const, reason: "no_registered_device" };

    const language: AppLanguage = preference.language === "ar" || preference.language === "ku"
      ? preference.language : "en";
    const localized = marketingMessage?.[language] ?? copy[language][kind];
    const deadline = context.offerExpiresAt
      ? new Intl.DateTimeFormat(language === "ar" ? "ar-IQ" : language === "ku" ? "ku-IQ" : "en-IQ", {
          dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Baghdad",
        }).format(context.offerExpiresAt)
      : "";
    const remaining = context.remainingMinutes === undefined ? "" : remainingTime(context.remainingMinutes, language);
    const body = localized.body.replace("{deadline}", deadline).replace("{remaining}", remaining);
    const now = new Date();
    const payloadData: Record<string, string> = (
      kind === "support_urgent" || kind === URGENT_ESCALATION_KIND
    ) && context.ticketId
      ? { ticketId: context.ticketId }
      : kind === "live_class_reminder" && context.reservationId
        ? { reservationId: context.reservationId }
      : (
        (kind === "partner_document_expiry_upcoming" || kind === "partner_document_expiry_overdue")
        && context.qualityRecord
      )
        ? {
            facilityId: context.qualityRecord.facilityId,
            documentType: context.qualityRecord.documentType,
            expiresOn: context.qualityRecord.expiresOn,
            phase: context.qualityRecord.phase,
          }
        : {};
    const rows = devices.map(device => ({
      id: randomUUID(),
      userId,
      deviceId: device.id,
      kind,
      title: localized.title,
      body,
      payloadData,
      status: "pending",
      dedupeKey: context.dedupeKey ? `${context.dedupeKey}:${device.id}` : null,
      attemptCount: 1,
    }));
    const inserted = await db.insert(pushDeliveries).values(rows).onConflictDoNothing()
      .returning({ id: pushDeliveries.id, deviceId: pushDeliveries.deviceId });
    if (!inserted.length) return { status: "skipped" as const, reason: "already_recorded" };

    const insertedIds = new Set(inserted.map(row => row.id));
    const attempts = rows.filter(row => insertedIds.has(row.id)).flatMap(row => {
      const device = devices.find(candidate => candidate.id === row.deviceId);
      return device ? [{ delivery: row as PushDeliveryRow, device }] : [];
    });
    return await sendPushAttempts(attempts, now)
      ? { status: "sent" as const }
      : { status: "failed" as const };
  } catch (error) {
    // Do not let notification persistence or provider outages affect bookings,
    // attendance, support replies, or any other primary transaction.
    console.error("Operational push notification failed outside delivery tracking.", messageOf(error));
    return { status: "failed" as const };
  }
}

export async function sendMemberNotification(
  userId: string,
  kind: OperationalNotificationKind,
  context: NotificationContext = {},
) {
  return deliverMemberNotification(userId, kind, context);
}

export async function sendMemberMarketingNotification(
  userId: string,
  message: LocalizedMarketingMessage,
  context: Pick<NotificationContext, "dedupeKey"> = {},
) {
  const validContent = (["en", "ar", "ku"] as const).every(language => {
    const localized = message?.[language];
    return typeof localized?.title === "string"
      && localized.title.trim().length > 0
      && localized.title.length <= 120
      && typeof localized.body === "string"
      && localized.body.trim().length > 0
      && localized.body.length <= 400;
  });
  if (!validContent) return { status: "failed" as const, reason: "invalid_marketing_content" };
  return deliverMemberNotification(userId, "marketing_update", context, message);
}

export async function sendUrgentEscalationReminder(ticketId: string, recipientUserIds: string[], now = new Date()) {
  const cutoff = new Date(now.getTime() - URGENT_UNASSIGNED_ESCALATION_DELAY_MS);
  const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets).where(and(
    eq(supportTickets.id, ticketId),
    eq(supportTickets.urgent, true),
    isNull(supportTickets.assignedTo),
    isNull(supportTickets.urgentEscalatedAt),
    inArray(supportTickets.status, ACTIVE_SUPPORT_TICKET_STATUSES),
    lte(supportTickets.createdAt, cutoff),
  )).limit(1);
  if (!ticket || !recipientUserIds.length) return false;

  const outcomes = await Promise.all(recipientUserIds.map(userId => sendMemberNotification(
    userId,
    URGENT_ESCALATION_KIND,
    { dedupeKey: `support-urgent-escalation:${ticketId}`, ticketId },
  )));
  let acceptedByProvider = outcomes.some(outcome => outcome.status === "sent");
  if (!acceptedByProvider) {
    const [priorAcceptedDelivery] = await db.select({ id: pushDeliveries.id }).from(pushDeliveries).where(and(
      eq(pushDeliveries.kind, URGENT_ESCALATION_KIND),
      eq(pushDeliveries.status, "sent"),
      sql`${pushDeliveries.payloadData}->>'ticketId' = ${ticketId}`,
    )).limit(1);
    acceptedByProvider = Boolean(priorAcceptedDelivery);
  }
  if (!acceptedByProvider) return false;

  const [marked] = await db.update(supportTickets).set({ urgentEscalatedAt: now }).where(and(
    eq(supportTickets.id, ticketId),
    eq(supportTickets.urgent, true),
    isNull(supportTickets.assignedTo),
    isNull(supportTickets.urgentEscalatedAt),
    inArray(supportTickets.status, ACTIVE_SUPPORT_TICKET_STATUSES),
  )).returning({ id: supportTickets.id });
  if (!marked) return false;

  await db.insert(operationAudit).values({
    id: randomUUID(),
    actorId: "system:urgent-escalation",
    action: "support.ticket.urgent_escalation",
    targetId: ticketId,
    detail: "Urgent report remained unassigned for 30 minutes; reminder push accepted by Expo.",
  });
  return true;
}

export async function escalateUnassignedUrgentTickets(now = new Date()) {
  const cutoff = new Date(now.getTime() - URGENT_UNASSIGNED_ESCALATION_DELAY_MS);
  const tickets = await db.select({ id: supportTickets.id }).from(supportTickets).where(and(
    eq(supportTickets.urgent, true),
    isNull(supportTickets.assignedTo),
    isNull(supportTickets.urgentEscalatedAt),
    inArray(supportTickets.status, ACTIVE_SUPPORT_TICKET_STATUSES),
    lte(supportTickets.createdAt, cutoff),
  )).orderBy(asc(supportTickets.createdAt)).limit(100);
  if (!tickets.length) return 0;

  const recipients = await db.select({ userId: operators.userId }).from(operators)
    .where(and(
      inArray(operators.role, ["customer_support_admin", "support", "super_admin"]),
      eq(operators.receiveUrgentAlerts, true),
    ));
  if (!recipients.length) return 0;

  let escalatedCount = 0;
  for (const ticket of tickets) {
    if (await sendUrgentEscalationReminder(ticket.id, recipients.map(recipient => recipient.userId), now)) {
      escalatedCount += 1;
    }
  }
  return escalatedCount;
}

export async function retryPendingPushDeliveries(now = new Date()) {
  try {
    const attempts = await db.transaction(async tx => {
      const due = await tx.select().from(pushDeliveries)
        .where(and(
          eq(pushDeliveries.status, "retry_pending"),
          lte(pushDeliveries.nextAttemptAt, now),
        ))
        .orderBy(asc(pushDeliveries.nextAttemptAt))
        .limit(RECOVERY_BATCH_SIZE)
        .for("update", { skipLocked: true });
      const claimed: PushAttempt[] = [];
      for (const delivery of due) {
        const [preference] = await tx.select().from(memberNotificationPreferences)
          .where(eq(memberNotificationPreferences.userId, delivery.userId)).limit(1);
        const [device] = await tx.select().from(pushDevices)
          .where(and(eq(pushDevices.id, delivery.deviceId), eq(pushDevices.enabled, true))).limit(1);
        if (!preference?.pushEnabled || !device) {
          await tx.update(pushDeliveries).set({
            status: "failed",
            error: "Push notifications were disabled before the retry.",
            nextAttemptAt: null,
          }).where(eq(pushDeliveries.id, delivery.id));
          continue;
        }
        if (delivery.kind === "marketing_update") {
          const consentHistory = await tx.select().from(memberConsentEvents)
            .where(eq(memberConsentEvents.userId, delivery.userId))
            .orderBy(desc(memberConsentEvents.recordedAt), desc(memberConsentEvents.id));
          if (buildMemberConsentState(consentHistory).currentChoices.marketing !== "accepted") {
            await tx.update(pushDeliveries).set({
              status: "cancelled",
              error: "Marketing consent was withdrawn before retry.",
              nextAttemptAt: null,
            }).where(eq(pushDeliveries.id, delivery.id));
            continue;
          }
        }
        if (delivery.kind === "waitlist_reminder") {
          const prefix = "waitlist-reminder:";
          const remainder = delivery.dedupeKey?.startsWith(prefix) ? delivery.dedupeKey.slice(prefix.length) : "";
          const lastSeparator = remainder.lastIndexOf(":");
          const entryId = lastSeparator > 0 ? remainder.slice(0, lastSeparator) : "";
          const [offer] = entryId ? await tx.select({
            status: waitlistEntries.status,
            offerExpiresAt: waitlistEntries.offerExpiresAt,
          }).from(waitlistEntries).where(eq(waitlistEntries.id, entryId)).limit(1).for("update") : [];
          if (offer?.status !== "offered" || !offer.offerExpiresAt || offer.offerExpiresAt <= now) {
            await tx.update(pushDeliveries).set({
              status: "cancelled",
              error: "Waitlist offer is no longer active; reminder retry was cancelled.",
              nextAttemptAt: null,
              receiptStatus: null,
              receiptError: null,
            }).where(eq(pushDeliveries.id, delivery.id));
            continue;
          }
        }
        const [claimedDelivery] = await tx.update(pushDeliveries).set({
          status: "pending",
          attemptCount: delivery.attemptCount + 1,
          nextAttemptAt: null,
          providerTicketId: null,
          acceptedAt: null,
          receiptStatus: null,
          receiptError: null,
          receiptCheckedAt: null,
          receiptAttemptCount: 0,
        }).where(eq(pushDeliveries.id, delivery.id)).returning();
        if (claimedDelivery) claimed.push({ delivery: claimedDelivery, device });
      }
      return claimed;
    });
    if (!attempts.length) return 0;
    await sendPushAttempts(attempts, now);
    return attempts.length;
  } catch (error) {
    console.error("Push delivery retry sweep failed.", messageOf(error));
    return 0;
  }
}

export async function checkPendingPushReceipts(now = new Date()) {
  const receiptCutoff = new Date(now.getTime() - RECEIPT_READY_AFTER_MS);
  const recheckCutoff = new Date(now.getTime() - RECEIPT_RECHECK_AFTER_MS);
  const claimed = await db.transaction(async tx => {
    const due = await tx.select().from(pushDeliveries)
      .where(and(
        eq(pushDeliveries.status, "sent"),
        eq(pushDeliveries.receiptStatus, "pending"),
        lte(pushDeliveries.acceptedAt, receiptCutoff),
        or(isNull(pushDeliveries.receiptCheckedAt), lte(pushDeliveries.receiptCheckedAt, recheckCutoff)),
      ))
      .orderBy(asc(pushDeliveries.acceptedAt))
      .limit(RECOVERY_BATCH_SIZE)
      .for("update", { skipLocked: true });
    const rows: PushDeliveryRow[] = [];
    for (const delivery of due) {
      const [claimedDelivery] = await tx.update(pushDeliveries).set({
        receiptCheckedAt: now,
        receiptAttemptCount: delivery.receiptAttemptCount + 1,
      }).where(eq(pushDeliveries.id, delivery.id)).returning();
      if (claimedDelivery) rows.push(claimedDelivery);
    }
    return rows;
  });
  if (!claimed.length) return 0;

  const ids = [...new Set(claimed.map(row => row.providerTicketId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return 0;
  let receipts: Record<string, ExpoPushReceipt> = {};
  let requestFailure: string | null = null;
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Expo receipt service returned HTTP ${response.status}.`);
    const responseData = await response.json() as { data?: Record<string, ExpoPushReceipt> };
    receipts = responseData.data ?? {};
  } catch (error) {
    requestFailure = messageOf(error);
  }

  await Promise.all(claimed.map(async delivery => {
    const ticketId = delivery.providerTicketId;
    if (!ticketId) return;
    const receipt = receipts[ticketId];
    if (!receipt) {
      if (delivery.receiptAttemptCount >= MAX_RECEIPT_CHECKS) {
        await db.update(pushDeliveries).set({
          receiptStatus: "unavailable",
          receiptError: requestFailure ?? "Expo did not return a receipt after three checks.",
        }).where(eq(pushDeliveries.id, delivery.id));
      }
      return;
    }
    const checkedAt = delivery.receiptCheckedAt ?? now;
    const errorCode = receipt.details?.error;
    if (receipt.status === "ok") {
      await db.update(pushDeliveries).set({
        receiptStatus: "ok",
        receiptError: null,
        receiptCheckedAt: checkedAt,
        error: null,
      }).where(eq(pushDeliveries.id, delivery.id));
      return;
    }
    const failure = messageOf(errorCode ?? receipt.message ?? "Expo receipt reported a delivery error.");
    if (errorCode === "DeviceNotRegistered") {
      await disableUnregisteredDevice(delivery.deviceId, delivery.userId, now);
    }
    await recordAttemptFailure(
      { delivery, device: { id: delivery.deviceId } as PushDeviceRow },
      failure,
      now,
      errorCode === "MessageRateExceeded",
      {
        status: "error",
        error: failure,
        checkedAt,
        attemptCount: delivery.receiptAttemptCount,
      },
    );
  }));
  const urgentTicketIds = [...new Set(claimed.flatMap(delivery =>
    (delivery.kind === "support_urgent" || delivery.kind === URGENT_ESCALATION_KIND) && delivery.payloadData?.ticketId
      ? [delivery.payloadData.ticketId]
      : [],
  ))];
  await Promise.all(urgentTicketIds.map(refreshUrgentAlertFallbackStatus));
  return claimed.length;
}

export async function recoverPushDeliveries(now = new Date()) {
  const receiptsChecked = await checkPendingPushReceipts(now);
  const deliveriesRetried = await retryPendingPushDeliveries(now);
  return { receiptsChecked, deliveriesRetried };
}
