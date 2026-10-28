import { and, eq } from "drizzle-orm";
import { db, memberNotificationPreferences, pushDeliveries, pushDevices } from "@workspace/db";
import { randomUUID } from "node:crypto";

export type AppLanguage = "en" | "ar" | "ku";
export type NotificationKind =
  | "booking_created"
  | "booking_cancelled"
  | "attendance_received"
  | "attendance_updated"
  | "support_reply"
  | "support_status";

const copy: Record<AppLanguage, Record<NotificationKind, { title: string; body: string }>> = {
  en: {
    booking_created: { title: "Booking confirmed", body: "Your MaydanGO booking is confirmed." },
    booking_cancelled: { title: "Booking update", body: "Your MaydanGO booking was cancelled." },
    attendance_received: { title: "Arrival recorded", body: "Your arrival is recorded and awaiting the venue’s confirmation." },
    attendance_updated: { title: "Attendance update", body: "Your class attendance record has been updated." },
    support_reply: { title: "Support replied", body: "There is a new reply in your MaydanGO support conversation." },
    support_status: { title: "Support update", body: "The status of your MaydanGO support request has changed." },
  },
  ar: {
    booking_created: { title: "تم تأكيد الحجز", body: "تم تأكيد حجزك في MaydanGO." },
    booking_cancelled: { title: "تحديث الحجز", body: "تم إلغاء حجزك في MaydanGO." },
    attendance_received: { title: "تم تسجيل الوصول", body: "تم تسجيل وصولك وبانتظار تأكيد المكان." },
    attendance_updated: { title: "تحديث الحضور", body: "تم تحديث سجل حضورك للحصة." },
    support_reply: { title: "ردّ فريق الدعم", body: "هناك رد جديد في محادثة الدعم الخاصة بك في MaydanGO." },
    support_status: { title: "تحديث من الدعم", body: "تغيّرت حالة طلب الدعم الخاص بك في MaydanGO." },
  },
  ku: {
    booking_created: { title: "حجز پشتڕاست کرایەوە", body: "حجزەکەت لە MaydanGO پشتڕاست کرایەوە." },
    booking_cancelled: { title: "نوێکاریی حجز", body: "حجزەکەت لە MaydanGO هەڵوەشێندرایەوە." },
    attendance_received: { title: "گەیشتنت تۆمار کرا", body: "گەیشتنت تۆمار کرا و چاوەڕێی پشتڕاستکردنەوەی شوێنەکەیە." },
    attendance_updated: { title: "نوێکاریی ئامادەبوون", body: "تۆماری ئامادەبوونت بۆ وانەکە نوێ کرایەوە." },
    support_reply: { title: "وەڵامی پشتگیری", body: "وەڵامێکی نوێ لە گفتوگۆی پشتگیریی MaydanGO هەیە." },
    support_status: { title: "نوێکاریی پشتگیری", body: "دۆخی داواکاریی پشتگیریی MaydanGO گۆڕاوە." },
  },
};

function messageOf(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);
  return message.replace(/(?:Expo|Exponent)PushToken\[[^\]]+\]/g, "[redacted]").slice(0, 400);
}

/**
 * Sends operational notifications only after the underlying state change has
 * committed. Delivery errors are stored for staff review and never rethrown.
 */
export async function sendMemberNotification(userId: string, kind: NotificationKind) {
  try {
    const [preference] = await db.select().from(memberNotificationPreferences)
      .where(eq(memberNotificationPreferences.userId, userId)).limit(1);
    if (!preference?.pushEnabled) return { status: "skipped" as const, reason: "opted_out" };

    const devices = await db.select().from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.enabled, true)));
    if (!devices.length) return { status: "skipped" as const, reason: "no_registered_device" };

    const language: AppLanguage = preference.language === "ar" || preference.language === "ku"
      ? preference.language : "en";
    const localized = copy[language][kind];
    const rows = devices.map(device => ({
      id: randomUUID(),
      userId,
      deviceId: device.id,
      kind,
      title: localized.title,
      body: localized.body,
      status: "pending",
    }));
    await db.insert(pushDeliveries).values(rows);

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(devices.map(device => ({
          to: device.token,
          title: localized.title,
          body: localized.body,
          sound: "default",
          data: { kind },
        }))),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Expo push service returned HTTP ${response.status}.`);

      const responseData = await response.json() as { data?: Array<{ status?: string; id?: string; message?: string; details?: { error?: string } }> };
      const tickets = Array.isArray(responseData.data) ? responseData.data : [];
      await Promise.all(rows.map(async (row, index) => {
        const ticket = tickets[index];
        if (ticket?.status === "ok") {
          await db.update(pushDeliveries).set({
            status: "sent", providerTicketId: ticket.id ?? null, acceptedAt: new Date(),
          }).where(eq(pushDeliveries.id, row.id));
          return;
        }
        const failure = messageOf(ticket?.details?.error ?? ticket?.message ?? "Expo did not accept this notification.");
        await db.update(pushDeliveries).set({ status: "failed", error: failure })
          .where(eq(pushDeliveries.id, row.id));
        if (ticket?.details?.error === "DeviceNotRegistered") {
          await db.update(pushDevices).set({ enabled: false, updatedAt: new Date() })
            .where(eq(pushDevices.id, devices[index].id));
        }
      }));
      if (tickets.some(ticket => ticket?.details?.error === "DeviceNotRegistered")) {
        const [remaining] = await db.select({ id: pushDevices.id }).from(pushDevices)
          .where(and(eq(pushDevices.userId, userId), eq(pushDevices.enabled, true))).limit(1);
        if (!remaining) {
          await db.update(memberNotificationPreferences).set({ pushEnabled: false, updatedAt: new Date() })
            .where(eq(memberNotificationPreferences.userId, userId));
        }
      }
      return { status: rows.every((row, index) => tickets[index]?.status === "ok") ? "sent" as const : "failed" as const };
    } catch (error) {
      const failure = messageOf(error);
      await Promise.all(rows.map(row => db.update(pushDeliveries)
        .set({ status: "failed", error: failure }).where(eq(pushDeliveries.id, row.id))));
      return { status: "failed" as const };
    }
  } catch (error) {
    // Do not let notification persistence or provider outages affect bookings,
    // attendance, support replies, or any other primary transaction.
    console.error("Operational push notification failed outside delivery tracking.", messageOf(error));
    return { status: "failed" as const };
  }
}
