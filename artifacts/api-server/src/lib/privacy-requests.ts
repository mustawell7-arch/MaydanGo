import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, supportMessages, supportTicketEvents, supportTickets } from "@workspace/db";

export type PrivacyRequestKind = "data_export" | "account_deletion";
export type PrivacyRequestLanguage = "en" | "ar" | "ku";
export const PRIVACY_EXPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

type PrivacyRequestCopy = {
  subject: string;
  message: string;
};

const privacyRequestCopy: Record<PrivacyRequestLanguage, Record<PrivacyRequestKind, PrivacyRequestCopy>> = {
  en: {
    data_export: {
      subject: "Privacy request: copy of my data",
      message: "I request a copy of the personal information associated with my MaydanGo account. Please reply in this private support conversation if you need to verify my identity.",
    },
    account_deletion: {
      subject: "Privacy request: account deletion",
      message: "I request a review of deleting my MaydanGo account. I understand this request does not delete my account immediately. Please reply here if identity verification is needed or if some records must be retained.",
    },
  },
  ar: {
    data_export: {
      subject: "طلب خصوصية: نسخة من بياناتي",
      message: "أطلب نسخة من المعلومات الشخصية المرتبطة بحسابي في MaydanGo. يرجى الرد في محادثة الدعم الخاصة هذه إذا لزم التحقق من هويتي.",
    },
    account_deletion: {
      subject: "طلب خصوصية: مراجعة حذف الحساب",
      message: "أطلب مراجعة حذف حسابي في MaydanGo. أفهم أن هذا الطلب لا يحذف الحساب فوراً. يرجى الرد هنا إذا لزم التحقق من هويتي أو الاحتفاظ ببعض السجلات.",
    },
  },
  ku: {
    data_export: {
      subject: "داواکاریی تایبەتمەندی: کۆپیی زانیارییەکانم",
      message: "داوای کۆپیی ئەو زانیارییە تایبەتییانە دەکەم کە بە هەژماری MaydanGo ـەمەوە بەستراون. ئەگەر پێویستە ناسنامەکەم پشتڕاست بکرێتەوە، تکایە لەم گفتوگۆ تایبەتەی پشتگیرییەدا وەڵام بدەنەوە.",
    },
    account_deletion: {
      subject: "داواکاریی تایبەتمەندی: پێداچوونەوە بۆ سڕینەوەی هەژمار",
      message: "داوای پێداچوونەوە بۆ سڕینەوەی هەژماری MaydanGo ـەم دەکەم. تێدەگەم ئەم داواکارییە هەژمارەکەم دەستبەجێ ناسڕێتەوە. ئەگەر پشتڕاستکردنەوەی ناسنامە یان پاراستنی هەندێک تۆمار پێویست بێت، تکایە لێرە وەڵام بدەنەوە.",
    },
  },
};

export function getPrivacyRequestCopy(kind: PrivacyRequestKind, language: PrivacyRequestLanguage): PrivacyRequestCopy {
  return privacyRequestCopy[language][kind];
}

export const privacyRequestSubjects = Object.values(privacyRequestCopy)
  .flatMap(languageCopy => Object.values(languageCopy).map(copy => copy.subject));

export function getPrivacyRequestKind(subject: string): PrivacyRequestKind {
  for (const languageCopy of Object.values(privacyRequestCopy)) {
    for (const [kind, copy] of Object.entries(languageCopy)) {
      if (copy.subject === subject) return kind as PrivacyRequestKind;
    }
  }
  throw new Error("Unknown privacy request subject.");
}

export function parsePrivacyExportExpiry(detail: string): Date | null {
  if (!detail.includes("identityVerified=true")) return null;
  const match = detail.match(/(?:^|;)expiresAt=([^;]+)/);
  if (!match) return null;
  const date = new Date(match[1]);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getPrivacyExportReadyMessage(language: PrivacyRequestLanguage): string {
  if (language === "ar") {
    return "أصبحت نسخة بيانات حسابك جاهزة للتنزيل من الحساب ← طلبات الخصوصية، وستبقى متاحة لمدة 24 ساعة.";
  }
  if (language === "ku") {
    return "کۆپیی زانیارییەکانی هەژمارەکەت ئامادەیە بۆ داگرتن لە هەژمار ← داواکارییەکانی تایبەتمەندی، و بۆ ٢٤ کاتژمێر بەردەست دەبێت.";
  }
  return "Your account data copy is ready in Account → Privacy requests and will be available for 24 hours.";
}

const subjectsByKind: Record<PrivacyRequestKind, string[]> = {
  data_export: Object.values(privacyRequestCopy).map(copy => copy.data_export.subject),
  account_deletion: Object.values(privacyRequestCopy).map(copy => copy.account_deletion.subject),
};

const activeStatuses = ["open", "in_progress", "waiting_member"];

export class ActivePrivacyRequestError extends Error {
  constructor() {
    super("An active privacy request already exists.");
    this.name = "ActivePrivacyRequestError";
  }
}

export async function listMemberPrivacyRequests(userId: string) {
  const rows = await db.select({
    id: supportTickets.id,
    kind: supportTickets.subject,
    subject: supportTickets.subject,
    status: supportTickets.status,
    createdAt: supportTickets.createdAt,
  }).from(supportTickets).where(and(
    eq(supportTickets.userId, userId),
    eq(supportTickets.category, "account"),
    inArray(supportTickets.subject, privacyRequestSubjects),
  )).orderBy(desc(supportTickets.createdAt)).limit(20);
  const exportRequestIds = rows
    .filter(row => getPrivacyRequestKind(row.kind) === "data_export")
    .map(row => row.id);
  const exportEvents = exportRequestIds.length ? await db.select({
    ticketId: supportTicketEvents.ticketId,
    detail: supportTicketEvents.detail,
  }).from(supportTicketEvents).where(and(
    inArray(supportTicketEvents.ticketId, exportRequestIds),
    eq(supportTicketEvents.action, "privacy_export_ready"),
  )).orderBy(desc(supportTicketEvents.createdAt)) : [];
  const exportExpiryByTicket = new Map<string, Date | null>();
  for (const event of exportEvents) {
    if (exportExpiryByTicket.has(event.ticketId)) continue;
    exportExpiryByTicket.set(event.ticketId, parsePrivacyExportExpiry(event.detail));
  }
  return rows.map(row => ({
    ...row,
    kind: getPrivacyRequestKind(row.kind),
    exportAvailableUntil: exportExpiryByTicket.get(row.id) ?? null,
  }));
}

export async function getMemberPrivacyExportAccess(userId: string, ticketId: string) {
  const [ticket] = await db.select({
    userId: supportTickets.userId,
    category: supportTickets.category,
    subject: supportTickets.subject,
  }).from(supportTickets).where(and(
    eq(supportTickets.id, ticketId),
    eq(supportTickets.userId, userId),
  )).limit(1);
  if (!ticket || ticket.category !== "account" || !privacyRequestSubjects.includes(ticket.subject)) return null;
  if (getPrivacyRequestKind(ticket.subject) !== "data_export") return null;
  const [event] = await db.select({
    detail: supportTicketEvents.detail,
  }).from(supportTicketEvents).where(and(
    eq(supportTicketEvents.ticketId, ticketId),
    eq(supportTicketEvents.action, "privacy_export_ready"),
  )).orderBy(desc(supportTicketEvents.createdAt)).limit(1);
  return {
    ticketId,
    exportAvailableUntil: event ? parsePrivacyExportExpiry(event.detail) : null,
  };
}

export async function recordMemberPrivacyExportDownload(userId: string, ticketId: string) {
  await db.insert(supportTicketEvents).values({
    id: randomUUID(),
    ticketId,
    actorId: userId,
    action: "privacy_export_downloaded",
    detail: "Member downloaded the approved account data export.",
    createdAt: new Date(),
  });
}

export async function createMemberPrivacyRequest(
  userId: string,
  kind: PrivacyRequestKind,
  language: PrivacyRequestLanguage,
) {
  const existing = await db.select({ id: supportTickets.id }).from(supportTickets).where(and(
    eq(supportTickets.userId, userId),
    eq(supportTickets.category, "account"),
    inArray(supportTickets.subject, subjectsByKind[kind]),
    inArray(supportTickets.status, activeStatuses),
  )).limit(1);
  if (existing.length) throw new ActivePrivacyRequestError();

  const copy = getPrivacyRequestCopy(kind, language);
  const id = randomUUID();
  const now = new Date();
  await db.transaction(async tx => {
    await tx.insert(supportTickets).values({
      id,
      userId,
      subject: copy.subject,
      category: "account",
      urgent: false,
      urgentAlertStatus: "not_applicable",
      language,
      status: "open",
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });
    await tx.insert(supportMessages).values({
      id: randomUUID(),
      ticketId: id,
      authorId: userId,
      authorRole: "member",
      body: copy.message,
      language,
      createdAt: now,
    });
    await tx.insert(supportTicketEvents).values({
      id: randomUUID(),
      ticketId: id,
      actorId: userId,
      action: "created",
      nextStatus: "open",
      detail: `Privacy request submitted: ${kind}.`,
      createdAt: now,
    });
  });
  return { id, kind, subject: copy.subject, status: "open" as const, createdAt: now, exportAvailableUntil: null };
}
