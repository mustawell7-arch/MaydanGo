import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, Check, Clock3, Download, Headphones, Languages, MessageSquareText, Paperclip, RefreshCw, Shield, UserRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Link } from 'wouter';
import {
  getGetSupportStaffAgentsQueryKey,
  getGetSupportStaffTicketAttachmentsQueryKey,
  getGetSupportStaffTicketRelatedRecordsQueryKey,
  getGetSupportStaffTicketQueryKey,
  getGetSupportStaffTicketsQueryKey,
  useGetSupportStaffAgents,
  useGetSupportStaffTicketAttachments,
  useGetSupportStaffTicketRelatedRecords,
  useGetSupportStaffTicket,
  useGetSupportStaffTickets,
  useCreateSupportStaffTicketLink,
  useDeleteSupportStaffTicketLink,
  useAddSupportStaffInternalNote,
  useReplySupportStaffTicket,
  usePrepareSupportStaffPrivacyExport,
  useUpdateSupportStaffTicket,
  type SupportTicketStatus,
  type SupportTicketLinkType,
  type SupportedLanguage,
} from '@workspace/api-client-react';
import { downloadSupportStaffFile, supportAttachmentType, uploadSupportStaffAttachments } from '@/lib/support-attachments';
import { SupportCaseEscalations } from '@/components/support-case-escalations';
import { SupportResponseTemplateManager, SupportResponseTemplatePicker } from '@/components/support-response-templates';

type Lang = 'en' | 'ar' | 'ku';
type StatusFilter = 'all' | SupportTicketStatus;

const words: Record<Lang, Record<string, string>> = {
  en: {
    eyebrow: 'MAYDANGO · OPERATIONS', title: 'Support desk', subtitle: 'A clear view of member and partner requests across Iraq.',
    escalated: 'Case escalated', escalationCloseHint: 'Resolve the case escalation before closing this ticket.',
    queue: 'Ticket queue', inbox: 'tickets', all: 'All tickets', open: 'Open', in_progress: 'In progress', waiting_member: 'Waiting on member', resolved: 'Resolved', closed: 'Closed',
    urgent: 'Urgent', overdue: 'Overdue', member: 'Member', partner: 'Partner', safety: 'Safety', booking: 'Booking', account: 'Account', access: 'Access', other: 'Other',
    selectTicket: 'Choose a ticket', selectHint: 'Select a request to review its conversation, alert outcome and audit history.',
    conversation: 'Conversation', timeline: 'Activity history', assigned: 'Assigned to', unassigned: 'Unassigned', assign: 'Assign to…', status: 'Status',
    reply: 'Public reply', replyHint: 'This message will be visible to the member or partner.', replyPlaceholder: 'Write a clear, helpful response…', send: 'Send reply', sending: 'Sending…',
    internalNote: 'Internal note', internalNoteHint: 'Only authorized staff can see this. It is not sent to the member.', internalNotePlaceholder: 'Write a note for the support team…',
    saveInternalNote: 'Save internal note', savingInternalNote: 'Saving…', internalOnly: 'STAFF ONLY', internalNoteSent: 'Internal note saved.', internalNoteError: 'Internal note could not be saved. Try again.',
    relatedRecords: 'Related bookings and check-ins', relatedRecordsHint: 'Only records belonging to this member are available.',
    selectRelatedRecord: 'Select a booking or check-in…', bookingRecord: 'Booking', checkinRecord: 'Check-in',
    noRelatedRecords: 'No recent bookings or check-ins were found.', linkRecord: 'Link record', linkingRecord: 'Linking…', unlinkRecord: 'Remove link',
    relatedRecordLinked: 'Record linked to this ticket.', relatedRecordUnlinked: 'Link removed.', relatedRecordError: 'The record link could not be saved.',
    attachments: 'Attachments', downloadAttachment: 'Download attachment', attachmentDownloadError: 'The attachment could not be downloaded.',
    addAttachments: 'Add files to this reply', attachmentHint: 'Up to 3 files, 10 MB each. PDF, JPEG, PNG, or WebP.',
    attachmentLimit: 'Choose no more than 3 files.', attachmentInvalid: 'Choose a supported file up to 10 MB.',
    attachmentUploadError: 'Your reply was sent, but a file could not be attached. Retry the upload below.',
    attachmentUploadSuccess: 'Attachment uploaded.', removeAttachment: 'Remove', retryAttachmentUpload: 'Retry file upload',
    loading: 'Loading support queue', retry: 'Retry', loadError: 'The support queue could not be loaded.', detailError: 'This ticket could not be loaded.', empty: 'No tickets in this view', emptyHint: 'Try another status filter or check again shortly.',
    denied: 'Access restricted', deniedText: 'Only authorized MaydanGo support staff and administrators can view this work surface.',
    alert: 'Urgent alert outcome', alertPending: 'Push alert is pending.', alertAccepted: 'Push delivery was accepted by the notification service. This does not confirm it was seen.',
    alertFallback: 'Push delivery needs follow-up. A push can fail; there is no external email fallback.', alertNone: 'No urgent push alert applies to this request.',
    alertOverdue: 'Urgent response is overdue. Review the request and follow your safety procedures.',
    noMessages: 'No messages yet.', noEvents: 'No recorded activity yet.', failedReply: 'Reply could not be sent. Try again.', updateError: 'Update could not be saved. Try again.', replySent: 'Reply sent.',
    memberLabel: 'Member', supportLabel: 'Support', adminLabel: 'Administrator', language: 'Language', customerId: 'Member ID',
    event: 'Update', assignedEvent: 'Assignment changed', statusEvent: 'Status changed',
    alertNote: 'Push notifications can fail or remain unconfirmed. There is no external email fallback. Follow the established safety process for urgent reports.',
    security: 'Staff access only', refresh: 'Refresh queue', lastActivity: 'Last activity', noAgent: 'Unassigned',
    signIn: 'Sign in to open the support desk', signInHint: 'This workspace is limited to authorized MaydanGo support staff.',
    privacyExportTitle: 'Secure account data export', privacyExportVerify: 'I verified this member’s identity in the private support conversation.',
    privacyExportHelp: 'Once approved, the member can download their own data for 24 hours.',
    privacyExportPrepare: 'Approve download for 24 hours', privacyExportPreparing: 'Preparing…',
    privacyExportApproved: 'Download approved until', privacyExportPrepared: 'The secure data copy is ready for 24 hours.',
    privacyExportError: 'The export could not be prepared. Resolve any active escalation and retry.',
  },
  ar: {
    eyebrow: 'ميدان جو · العمليات', title: 'مكتب الدعم', subtitle: 'عرض واضح لطلبات الأعضاء والشركاء في أنحاء العراق.',
    escalated: 'طلب مصعّد', escalationCloseHint: 'عالج التصعيد قبل إغلاق هذا الطلب.',
    queue: 'قائمة الطلبات', inbox: 'طلبات', all: 'كل الطلبات', open: 'مفتوح', in_progress: 'قيد المعالجة', waiting_member: 'بانتظار العضو', resolved: 'تم الحل', closed: 'مغلق',
    urgent: 'عاجل', overdue: 'متأخر', member: 'عضو', partner: 'شريك', safety: 'السلامة', booking: 'الحجز', account: 'الحساب', access: 'الوصول', other: 'أخرى',
    selectTicket: 'اختر طلباً', selectHint: 'اختر طلباً لمراجعة المحادثة ونتيجة التنبيه وسجل النشاط.',
    conversation: 'المحادثة', timeline: 'سجل النشاط', assigned: 'مسند إلى', unassigned: 'غير مسند', assign: 'إسناد إلى…', status: 'الحالة',
    reply: 'رد علني', replyHint: 'ستظهر هذه الرسالة للعضو أو الشريك.', replyPlaceholder: 'اكتب رداً واضحاً ومفيداً…', send: 'إرسال الرد', sending: 'جارٍ الإرسال…',
    internalNote: 'ملاحظة داخلية', internalNoteHint: 'يراها فريق الدعم المعتمد فقط، ولا تُرسل إلى العضو.', internalNotePlaceholder: 'اكتب ملاحظة لفريق الدعم…',
    saveInternalNote: 'حفظ الملاحظة الداخلية', savingInternalNote: 'جارٍ الحفظ…', internalOnly: 'للموظفين فقط', internalNoteSent: 'تم حفظ الملاحظة الداخلية.', internalNoteError: 'تعذر حفظ الملاحظة الداخلية. حاول مرة أخرى.',
    relatedRecords: 'الحجوزات وتسجيلات الحضور المرتبطة', relatedRecordsHint: 'تظهر هنا سجلات هذا العضو فقط.',
    selectRelatedRecord: 'اختر حجزاً أو تسجيلاً للحضور…', bookingRecord: 'حجز', checkinRecord: 'تسجيل حضور',
    noRelatedRecords: 'لم يتم العثور على حجوزات أو تسجيلات حضور حديثة.', linkRecord: 'ربط السجل', linkingRecord: 'جارٍ الربط…', unlinkRecord: 'إزالة الربط',
    relatedRecordLinked: 'تم ربط السجل بهذا الطلب.', relatedRecordUnlinked: 'تمت إزالة الربط.', relatedRecordError: 'تعذر حفظ ربط السجل.',
    attachments: 'المرفقات', downloadAttachment: 'تنزيل المرفق', attachmentDownloadError: 'تعذر تنزيل المرفق.',
    addAttachments: 'إضافة ملفات إلى هذا الرد', attachmentHint: 'حتى 3 ملفات، 10 ميغابايت لكل ملف. PDF أو JPEG أو PNG أو WebP.',
    attachmentLimit: 'اختر 3 ملفات كحد أقصى.', attachmentInvalid: 'اختر ملفاً مدعوماً بحجم لا يتجاوز 10 ميغابايت.',
    attachmentUploadError: 'أُرسل الرد، لكن تعذر إرفاق ملف. أعد محاولة الرفع أدناه.',
    attachmentUploadSuccess: 'تم رفع المرفق.', removeAttachment: 'إزالة', retryAttachmentUpload: 'إعادة رفع الملف',
    loading: 'جارٍ تحميل قائمة الدعم', retry: 'إعادة المحاولة', loadError: 'تعذر تحميل قائمة الدعم.', detailError: 'تعذر تحميل هذا الطلب.', empty: 'لا توجد طلبات في هذا العرض', emptyHint: 'جرّب تصفية حالة أخرى أو أعد التحقق بعد قليل.',
    denied: 'الوصول مقيّد', deniedText: 'يمكن لموظفي دعم ميدان جو المعتمدين والمسؤولين فقط عرض مساحة العمل هذه.',
    alert: 'نتيجة التنبيه العاجل', alertPending: 'التنبيه الفوري قيد الانتظار.', alertAccepted: 'قبلت خدمة الإشعارات إرسال التنبيه. هذا لا يؤكد أن أحداً قد شاهده.',
    alertFallback: 'يتطلب إرسال التنبيه متابعة. قد يفشل الإشعار الفوري؛ ولا يوجد بديل عبر البريد الإلكتروني الخارجي.', alertNone: 'لا ينطبق تنبيه فوري عاجل على هذا الطلب.',
    alertOverdue: 'تجاوز طلب عاجل وقت الاستجابة. راجع الطلب واتبع إجراءات السلامة المعتمدة.',
    noMessages: 'لا توجد رسائل بعد.', noEvents: 'لا يوجد نشاط مسجل بعد.', failedReply: 'تعذر إرسال الرد. حاول مرة أخرى.', updateError: 'تعذر حفظ التحديث. حاول مرة أخرى.', replySent: 'تم إرسال الرد.',
    memberLabel: 'العضو', supportLabel: 'الدعم', adminLabel: 'المسؤول', language: 'اللغة', customerId: 'معرّف العضو',
    event: 'تحديث', assignedEvent: 'تغيير الإسناد', statusEvent: 'تغيير الحالة',
    alertNote: 'قد تفشل الإشعارات الفورية أو تبقى دون تأكيد. لا يوجد بديل عبر البريد الإلكتروني الخارجي. اتبع إجراءات السلامة المعتمدة للبلاغات العاجلة.',
    security: 'للموظفين المعتمدين فقط', refresh: 'تحديث القائمة', lastActivity: 'آخر نشاط', noAgent: 'غير مسند',
    signIn: 'سجّل الدخول لفتح مكتب الدعم', signInHint: 'مساحة العمل هذه مخصصة لموظفي دعم ميدان جو المعتمدين.',
    privacyExportTitle: 'نسخة آمنة من بيانات الحساب', privacyExportVerify: 'تحققت من هوية هذا العضو في محادثة الدعم الخاصة.',
    privacyExportHelp: 'بعد الموافقة، يستطيع العضو تنزيل بياناته خلال 24 ساعة.',
    privacyExportPrepare: 'الموافقة على التنزيل لمدة 24 ساعة', privacyExportPreparing: 'جارٍ التجهيز…',
    privacyExportApproved: 'التنزيل معتمد حتى', privacyExportPrepared: 'أصبحت نسخة البيانات الآمنة جاهزة لمدة 24 ساعة.',
    privacyExportError: 'تعذر تجهيز النسخة. عالج أي تصعيد نشط ثم حاول مرة أخرى.',
  },
  ku: {
    eyebrow: 'مەیدان گۆ · کارگێڕی', title: 'مێزی پشتگیری', subtitle: 'بینینێکی ڕوون بۆ داواکاریی ئەندامان و هاوبەشان لە سەرانسەری عێراق.',
    escalated: 'داواکاری ئاستبەرزکراوەتەوە', escalationCloseHint: 'پێش داخستنی داواکاری، ئاستبەرزکردنەوەکە چارەسەر بکە.',
    queue: 'ڕیزی داواکارییەکان', inbox: 'داواکاری', all: 'هەموو داواکارییەکان', open: 'کراوە', in_progress: 'لە پێشچووندایە', waiting_member: 'چاوەڕوانی ئەندام', resolved: 'چارەسەرکرا', closed: 'داخرا',
    urgent: 'پەلە', overdue: 'دواکەوتوو', member: 'ئەندام', partner: 'هاوبەش', safety: 'سەلامەتی', booking: 'حجزکردن', account: 'هەژمار', access: 'دەستگەیشتن', other: 'هیتر',
    selectTicket: 'داواکارییەک هەڵبژێرە', selectHint: 'داواکارییەک هەڵبژێرە بۆ پێداچوونەوەی گفتوگۆ، ئەنجامی ئاگادارکردنەوە و مێژووی کار.',
    conversation: 'گفتوگۆ', timeline: 'مێژووی چالاکی', assigned: 'سپێردراوە بە', unassigned: 'نەسپێردراوە', assign: 'بسپێرە بە…', status: 'دۆخ',
    reply: 'وەڵامی گشتی', replyHint: 'ئەم نامەیە بۆ ئەندام یان هاوبەش دەردەکەوێت.', replyPlaceholder: 'وەڵامێکی ڕوون و یارمەتیدەر بنووسە…', send: 'ناردنی وەڵام', sending: 'لە ناردندایە…',
    internalNote: 'تێبینی ناوخۆیی', internalNoteHint: 'تەنها تیمی پشتگیریی ڕێگەپێدراو دەیبینێت و بۆ ئەندام نانێردرێت.', internalNotePlaceholder: 'تێبینییەک بۆ تیمی پشتگیری بنووسە…',
    saveInternalNote: 'پاشەکەوتکردنی تێبینی ناوخۆیی', savingInternalNote: 'لە پاشەکەوتکردندایە…', internalOnly: 'تەنها بۆ کارمەندان', internalNoteSent: 'تێبینی ناوخۆیی پاشەکەوت کرا.', internalNoteError: 'پاشەکەوتکردنی تێبینی سەرکەوتوو نەبوو. دووبارە هەوڵ بدەوە.',
    relatedRecords: 'حجز و تۆمارەکانی هاتنەژوورەوە', relatedRecordsHint: 'تەنها تۆمارەکانی ئەم ئەندامە لێرە دەردەکەون.',
    selectRelatedRecord: 'حجز یان تۆماری هاتنەژوورەوە هەڵبژێرە…', bookingRecord: 'حجز', checkinRecord: 'تۆماری هاتنەژوورەوە',
    noRelatedRecords: 'هیچ حجز یان تۆمارێکی نوێی هاتنەژوورەوە نەدۆزرایەوە.', linkRecord: 'بەستنەوەی تۆمار', linkingRecord: 'لە بەستنەوەدایە…', unlinkRecord: 'لابردنی بەستنەوە',
    relatedRecordLinked: 'تۆمارەکە بە داواکارییەکەوە بەسترا.', relatedRecordUnlinked: 'بەستنەوەکە لابرا.', relatedRecordError: 'پاشەکەوتکردنی بەستنەوەی تۆمار سەرکەوتوو نەبوو.',
    attachments: 'هاوپێچەکان', downloadAttachment: 'داگرتنی هاوپێچ', attachmentDownloadError: 'داگرتنی هاوپێچ سەرکەوتوو نەبوو.',
    addAttachments: 'زیادکردنی فایل بۆ ئەم وەڵامە', attachmentHint: 'تا ٣ فایل، هەر یەکە ١٠ مێگابایت. PDF، JPEG، PNG یان WebP.',
    attachmentLimit: 'تەنها تا ٣ فایل هەڵبژێرە.', attachmentInvalid: 'فایلێکی پشتگیریکراو تا ١٠ مێگابایت هەڵبژێرە.',
    attachmentUploadError: 'وەڵامەکە نێردرا، بەڵام فایلێک هاوپێچ نەکرا. لە خوارەوە دووبارە هەوڵ بدەوە.',
    attachmentUploadSuccess: 'هاوپێچەکە بارکرا.', removeAttachment: 'لابردن', retryAttachmentUpload: 'دووبارە بارکردنی فایل',
    loading: 'بارکردنی ڕیزی پشتگیری', retry: 'هەوڵدانەوە', loadError: 'بارکردنی ڕیزی پشتگیری سەرکەوتوو نەبوو.', detailError: 'بارکردنی ئەم داواکارییە سەرکەوتوو نەبوو.', empty: 'هیچ داواکارییەک لەم بینینەدا نییە', emptyHint: 'پاڵاوتنی دۆخێکی تر تاقی بکەرەوە یان کەمێک دواتر بگەڕێوە.',
    denied: 'دەستگەیشتن سنووردارە', deniedText: 'تەنها تیمی پشتگیری و بەڕێوەبەرانی ڕێگەپێدراوی مەیدان گۆ دەتوانن ئەم شوێنی کارە ببینن.',
    alert: 'ئەنجامی ئاگادارکردنەوەی پەلە', alertPending: 'ئاگادارکردنەوەی پۆش لە چاوەڕوانیدایە.', alertAccepted: 'خزمەتگوزاری ئاگادارکردنەوە ناردنی پەسەند کرد. ئەمە دڵنیایی نادات کە کەسێک بینیبێتی.',
    alertFallback: 'ناردنی پۆش پێویستی بە بەدواداچوون هەیە. ئاگادارکردنەوەی پۆش دەکرێت سەرنەکەوێت؛ هیچ جێگرەوەی ئیمەیڵی دەرەکی نییە.', alertNone: 'هیچ ئاگادارکردنەوەیەکی پەلە بۆ ئەم داواکارییە پەیوەندیدار نییە.',
    alertOverdue: 'داواکارییەکی پەلە لە وەڵامدانەوە دواکەوتووە. داواکارییەکە بپشکنە و ڕێکارەکانی سەلامەتی جێبەجێ بکە.',
    noMessages: 'هێشتا هیچ نامەیەک نییە.', noEvents: 'هێشتا هیچ چالاکییەکی تۆمارکراو نییە.', failedReply: 'ناردنی وەڵام سەرکەوتوو نەبوو. دووبارە هەوڵ بدەوە.', updateError: 'پاشەکەوتکردنی نوێکاری سەرکەوتوو نەبوو. دووبارە هەوڵ بدەوە.', replySent: 'وەڵام نێردرا.',
    memberLabel: 'ئەندام', supportLabel: 'پشتگیری', adminLabel: 'بەڕێوەبەر', language: 'زمان', customerId: 'ناسنامەی ئەندام',
    event: 'نوێکردنەوە', assignedEvent: 'گۆڕینی سپاردن', statusEvent: 'گۆڕینی دۆخ',
    alertNote: 'ئاگادارکردنەوەی پۆش دەکرێت سەرنەکەوێت یان پشتڕاست نەکرێتەوە. هیچ جێگرەوەی ئیمەیڵی دەرەکی نییە. بۆ ڕاپۆرتی پەلە ڕێکاری سەلامەتی جێبەجێ بکە.',
    security: 'تەنها بۆ کارمەندانی ڕێگەپێدراو', refresh: 'نوێکردنەوەی ڕیز', lastActivity: 'دوایین چالاکی', noAgent: 'نەسپێردراو',
    signIn: 'بچۆ ژوورەوە بۆ کردنەوەی مێزی پشتگیری', signInHint: 'ئەم شوێنی کارە تەنها بۆ تیمی ڕێگەپێدراوی پشتگیریی MaydanGo ـە.',
    privacyExportTitle: 'کۆپیی پارێزراوی داتای هەژمار', privacyExportVerify: 'ناسنامەی ئەم ئەندامەم لە گفتوگۆی تایبەتی پشتگیری پشتڕاست کردووەتەوە.',
    privacyExportHelp: 'دوای پەسەندکردن، ئەندام دەتوانێت داتاکانی خۆی بۆ ٢٤ کاتژمێر دابگرێت.',
    privacyExportPrepare: 'پەسەندکردنی داگرتن بۆ ٢٤ کاتژمێر', privacyExportPreparing: 'ئامادە دەکرێت…',
    privacyExportApproved: 'داگرتن پەسەندکراوە تا', privacyExportPrepared: 'کۆپیی پارێزراوی داتا بۆ ٢٤ کاتژمێر ئامادەیە.',
    privacyExportError: 'ئامادەکردنی کۆپییەکە سەرکەوتوو نەبوو. هەر ئاستبەرزکردنەوەیەکی چالاک چارەسەر بکە و دووبارە هەوڵ بدەوە.',
  },
};

const statusKeys: SupportTicketStatus[] = ['open', 'in_progress', 'waiting_member', 'resolved', 'closed'];
const langName: Record<Lang, string> = { en: 'English', ar: 'العربية', ku: 'کوردی' };
const dateLabel = (value: string, lang: Lang) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-IQ' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ', {
    timeZone: 'Asia/Baghdad', dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
};
const ticketLanguage = (language: string): Lang => language === 'ar' || language === 'ku' ? language : 'en';
const errorStatus = (error: unknown) => {
  const value = error as { status?: number; response?: { status?: number }; cause?: { status?: number } } | undefined;
  return value?.status ?? value?.response?.status ?? value?.cause?.status;
};
const field = 'rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm text-[#173d35] outline-none transition focus:border-[#28695a] focus:ring-2 focus:ring-[#28695a]/15';
const replySchema = z.object({ message: z.string().trim().min(1).max(5000) });
type ReplyValues = z.infer<typeof replySchema>;

export function SupportDeskPage() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const client = useQueryClient();
  const [language, setLanguage] = useState<Lang>('en');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [internalNoteText, setInternalNoteText] = useState('');
  const [identityVerified, setIdentityVerified] = useState(false);
  const [relatedRecordChoice, setRelatedRecordChoice] = useState('');
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [pendingAttachmentMessageId, setPendingAttachmentMessageId] = useState('');
  const replyForm = useForm<ReplyValues>({
    resolver: zodResolver(replySchema),
    defaultValues: { message: '' },
  });
  const replyText = replyForm.watch('message');
  const t = words[language];
  const rtl = language !== 'en';
  const params = filter === 'all' ? undefined : { status: filter };
  const queue = useGetSupportStaffTickets(params, { query: { queryKey: getGetSupportStaffTicketsQueryKey(params), refetchInterval: 15_000, retry: false, enabled: isLoaded && isSignedIn } });
  const agentsQuery = useGetSupportStaffAgents({ query: { queryKey: getGetSupportStaffAgentsQueryKey(), retry: false, enabled: isLoaded && isSignedIn } });
  const detail = useGetSupportStaffTicket(selectedId, { query: { enabled: !!selectedId && isLoaded && isSignedIn, queryKey: getGetSupportStaffTicketQueryKey(selectedId), refetchInterval: 20_000, retry: false } });
  const relatedRecordsQuery = useGetSupportStaffTicketRelatedRecords(selectedId, {
    query: { enabled: !!selectedId && isLoaded && isSignedIn, queryKey: getGetSupportStaffTicketRelatedRecordsQueryKey(selectedId), refetchInterval: 30_000, retry: false },
  });
  const attachmentsQuery = useGetSupportStaffTicketAttachments(selectedId, {
    query: { enabled: !!selectedId && isLoaded && isSignedIn, queryKey: getGetSupportStaffTicketAttachmentsQueryKey(selectedId), refetchInterval: 20_000, retry: false },
  });
  const update = useUpdateSupportStaffTicket();
  const addInternalNote = useAddSupportStaffInternalNote();
  const createRelatedRecordLink = useCreateSupportStaffTicketLink();
  const deleteRelatedRecordLink = useDeleteSupportStaffTicketLink();
  const reply = useReplySupportStaffTicket();
  const preparePrivacyExportMutation = usePrepareSupportStaffPrivacyExport();
  const tickets = queue.data ?? [];
  const agents = agentsQuery.data ?? [];
  const authorized = !!userId && agents.some(agent => agent.userId === userId && (agent.role === 'customer_support_admin' || agent.role === 'support' || agent.role === 'super_admin'));
  const isAdmin = !!userId && agents.some(agent => agent.userId === userId && (agent.role === 'customer_support_admin' || agent.role === 'super_admin'));
  const active = detail.data;
  const hasActiveEscalation = tickets.some(ticket => ticket.id === selectedId && ticket.hasActiveEscalation);
  const relatedRecords = relatedRecordsQuery.data?.records ?? [];
  const privacyExportExpiry = active?.privacyExportAvailableUntil
    ? new Date(String(active.privacyExportAvailableUntil))
    : null;
  const privacyExportIsReady = !!privacyExportExpiry
    && Number.isFinite(privacyExportExpiry.getTime())
    && privacyExportExpiry.getTime() > Date.now();

  useEffect(() => {
    if (!queue.isSuccess) return;
    if (!selectedId && tickets.length) setSelectedId(tickets[0].id);
    if (selectedId && !tickets.some(ticket => ticket.id === selectedId)) setSelectedId(tickets[0]?.id ?? '');
  }, [queue.isSuccess, selectedId, tickets]);

  const sortedTickets = useMemo(() => [...tickets].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (!!a.hasActiveEscalation !== !!b.hasActiveEscalation) return a.hasActiveEscalation ? -1 : 1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  }), [tickets]);
  const refresh = () => void queue.refetch();
  const downloadAttachment = async (attachmentId: string, fileName: string) => {
    if (!selectedId) return;
    setDownloadingAttachmentId(attachmentId);
    setFeedback('');
    try {
      await downloadSupportStaffFile(selectedId, attachmentId, fileName);
    } catch {
      setFeedback('download-error');
    } finally {
      setDownloadingAttachmentId('');
    }
  };
  const updateTicket = (data: { status?: SupportTicketStatus; assignedTo?: string | null }) => {
    if (!selectedId) return;
    setFeedback('');
    update.mutate({ id: selectedId, data }, {
      onSuccess: async () => {
        await Promise.all([
          client.invalidateQueries({ queryKey: getGetSupportStaffTicketsQueryKey() }),
          client.invalidateQueries({ queryKey: getGetSupportStaffTicketQueryKey(selectedId) }),
        ]);
        setFeedback('saved');
      },
      onError: () => setFeedback('error'),
    });
  };
  const approvePrivacyExport = async () => {
    if (!selectedId || !identityVerified) return;
    setFeedback('');
    try {
      await preparePrivacyExportMutation.mutateAsync({
        id: selectedId,
        data: { identityVerified: true },
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: getGetSupportStaffTicketsQueryKey() }),
        client.invalidateQueries({ queryKey: getGetSupportStaffTicketQueryKey(selectedId) }),
      ]);
      setIdentityVerified(false);
      setFeedback('privacy-export-prepared');
    } catch {
      setFeedback('privacy-export-error');
    }
  };
  const sendReply = async (values: ReplyValues) => {
    if (!selectedId || !values.message.trim()) return;
    setFeedback('');
    setAttachmentBusy(true);
    try {
      const updated = await reply.mutateAsync({
        id: selectedId,
        data: { message: values.message.trim(), language: (active?.language ?? language) as SupportedLanguage },
      });
      const latestMessage = [...updated.messages].reverse().find(message =>
        !message.isInternal && message.authorId === userId && message.authorRole !== 'member',
      );
      let attachmentFailed = false;
      if (attachmentFiles.length && latestMessage?.id) {
        const filesRemaining = [...attachmentFiles];
        try {
          await uploadSupportStaffAttachments(selectedId, latestMessage.id, [...filesRemaining], uploaded => {
            const index = filesRemaining.indexOf(uploaded);
            if (index >= 0) filesRemaining.splice(index, 1);
            setAttachmentFiles([...filesRemaining]);
          });
          setPendingAttachmentMessageId('');
        } catch {
          attachmentFailed = true;
          setAttachmentFiles([...filesRemaining]);
          setPendingAttachmentMessageId(latestMessage.id);
        }
      } else {
        setAttachmentFiles([]);
        setPendingAttachmentMessageId('');
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: getGetSupportStaffTicketsQueryKey() }),
        client.invalidateQueries({ queryKey: getGetSupportStaffTicketQueryKey(selectedId) }),
        client.invalidateQueries({ queryKey: getGetSupportStaffTicketAttachmentsQueryKey(selectedId) }),
      ]);
      replyForm.reset({ message: '' });
      setFeedback(attachmentFailed ? 'attachment-error' : 'sent');
    } catch {
      setFeedback('reply-error');
    } finally {
      setAttachmentBusy(false);
    }
  };
  const saveInternalNote = async () => {
    const message = internalNoteText.trim();
    if (!selectedId || !message) return;
    setFeedback('');
    try {
      const updated = await addInternalNote.mutateAsync({ id: selectedId, data: { message } });
      client.setQueryData(getGetSupportStaffTicketQueryKey(selectedId), updated);
      await client.invalidateQueries({ queryKey: getGetSupportStaffTicketQueryKey(selectedId) });
      setInternalNoteText('');
      setFeedback('note-sent');
    } catch {
      setFeedback('note-error');
    }
  };
  const refreshRelatedRecords = async () => {
    if (!selectedId) return;
    await client.invalidateQueries({ queryKey: getGetSupportStaffTicketRelatedRecordsQueryKey(selectedId) });
  };
  const linkRelatedRecord = async () => {
    const record = relatedRecords.find(item => `${item.recordType}:${item.id}` === relatedRecordChoice);
    if (!selectedId || !record || record.linkId) return;
    setFeedback('');
    try {
      const updated = await createRelatedRecordLink.mutateAsync({
        id: selectedId,
        data: { recordType: record.recordType as SupportTicketLinkType, recordId: record.id },
      });
      client.setQueryData(getGetSupportStaffTicketRelatedRecordsQueryKey(selectedId), updated);
      await refreshRelatedRecords();
      setRelatedRecordChoice('');
      setFeedback('related-linked');
    } catch {
      setFeedback('related-error');
    }
  };
  const unlinkRelatedRecord = async (linkId: string) => {
    if (!selectedId) return;
    setFeedback('');
    try {
      const updated = await deleteRelatedRecordLink.mutateAsync({ id: selectedId, linkId });
      client.setQueryData(getGetSupportStaffTicketRelatedRecordsQueryKey(selectedId), updated);
      await refreshRelatedRecords();
      setFeedback('related-unlinked');
    } catch {
      setFeedback('related-error');
    }
  };
  const retryAttachmentUpload = async () => {
    if (!selectedId || !pendingAttachmentMessageId || !attachmentFiles.length) return;
    setAttachmentBusy(true);
    setFeedback('');
    const filesRemaining = [...attachmentFiles];
    try {
      await uploadSupportStaffAttachments(selectedId, pendingAttachmentMessageId, [...filesRemaining], uploaded => {
        const index = filesRemaining.indexOf(uploaded);
        if (index >= 0) filesRemaining.splice(index, 1);
        setAttachmentFiles([...filesRemaining]);
      });
      setPendingAttachmentMessageId('');
      await client.invalidateQueries({ queryKey: getGetSupportStaffTicketAttachmentsQueryKey(selectedId) });
      setFeedback('attachment-uploaded');
    } catch {
      setAttachmentFiles([...filesRemaining]);
      setFeedback('attachment-error');
    } finally {
      setAttachmentBusy(false);
    }
  };
  const roleLabel = (role: string) => role === 'member' ? t.memberLabel : role === 'customer_support_admin' || role === 'super_admin' ? t.adminLabel : t.supportLabel;
  const statusLabel = (status: string) => t[status] ?? status;

  if (!isLoaded) return <main className="min-h-[100dvh] bg-[#f4f1e8] p-5" data-testid="support-loading"><div className="mx-auto max-w-7xl animate-pulse space-y-5"><div className="h-5 w-36 rounded bg-[#e3dece]" /><div className="h-12 w-64 rounded bg-[#e3dece]" /><div className="h-[65vh] rounded-3xl bg-[#e9e4d7]" /></div></main>;
  if (!isSignedIn) return <main dir={rtl ? 'rtl' : 'ltr'} className="grid min-h-[100dvh] place-items-center bg-[#f4f1e8] p-5" data-testid="support-signin">
    <section className="max-w-md rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-8 text-center shadow-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e7eee4] text-[#174d43]"><Headphones /></div>
      <h1 className="mt-5 font-display text-2xl font-bold text-[#173d35]">{t.signIn}</h1>
      <p className="mt-2 text-sm leading-6 text-[#60756b]">{t.signInHint}</p>
      <Link href={`/sign-in?redirect_url=${encodeURIComponent('/support-desk')}`} className="mt-6 inline-flex rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9]" data-testid="link-support-signin">{t.signIn}</Link>
    </section>
  </main>;
  const queue403 = errorStatus(queue.error) === 403;
  const agent403 = errorStatus(agentsQuery.error) === 403;
  if (queue403 || agent403 || (!agentsQuery.isLoading && agentsQuery.isSuccess && !authorized)) {
    return <main dir={rtl ? 'rtl' : 'ltr'} className="grid min-h-[100dvh] place-items-center bg-[#f4f1e8] p-5" data-testid="support-denied"><div className="max-w-md rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-8 text-center shadow-sm"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f5e9e2] text-[#99513d]"><Shield /></div><h1 className="mt-5 font-display text-2xl font-bold text-[#173d35]">{t.denied}</h1><p className="mt-2 text-sm leading-6 text-[#60756b]">{t.deniedText}</p></div></main>;
  }
  if (agentsQuery.isError) return <main dir={rtl ? 'rtl' : 'ltr'} className="grid min-h-[100dvh] place-items-center bg-[#f4f1e8] p-5" data-testid="support-agents-error"><div role="alert" className="max-w-md rounded-3xl border border-[#e4c3b7] bg-[#fffdf7] p-7 text-center"><AlertTriangle className="mx-auto text-[#9a4435]" /><p className="mt-3 text-sm text-[#805d55]">{t.loadError}</p><button data-testid="button-retry-agents" onClick={() => void agentsQuery.refetch()} className="mt-4 rounded-full bg-[#174d43] px-5 py-2 text-sm font-bold text-[#fff9e9]">{t.retry}</button></div></main>;
  if (queue.isError) return <main dir={rtl ? 'rtl' : 'ltr'} className="grid min-h-[100dvh] place-items-center bg-[#f4f1e8] p-5" data-testid="support-error"><div role="alert" className="max-w-md rounded-3xl border border-[#e4c3b7] bg-[#fffdf7] p-7 text-center"><AlertTriangle className="mx-auto text-[#9a4435]" /><p className="mt-3 text-sm text-[#805d55]">{t.loadError}</p><button data-testid="button-retry-queue" onClick={refresh} className="mt-4 rounded-full bg-[#174d43] px-5 py-2 text-sm font-bold text-[#fff9e9]">{t.retry}</button></div></main>;

  return <main dir={rtl ? 'rtl' : 'ltr'} className="min-h-[100dvh] bg-[#f4f1e8] text-[#173d35]" data-testid="support-desk-page">
    <header className="border-b border-[#ded8c9] bg-[#fbf9f2]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-7 lg:px-10">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#174d43] text-[#f8f3e4]"><Headphones size={20} /></div><div><p className="text-[10px] font-bold tracking-[.19em] text-[#a76445]">{t.eyebrow}</p><h1 className="mt-1 font-display text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">{t.title}</h1></div></div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-[#d9d4c6] bg-[#f3f0e5] px-3 py-2 text-xs font-semibold text-[#536b61] sm:inline-flex"><Shield size={14} />{t.security}</span>
          <label className="sr-only" htmlFor="support-language">{t.language}</label>
          <select id="support-language" data-testid="select-support-language" value={language} onChange={e => setLanguage(e.target.value as Lang)} className={`${field} py-2 text-xs font-semibold`}>
            <option value="en">{langName.en}</option><option value="ar">{langName.ar}</option><option value="ku">{langName.ku}</option>
          </select>
          <button type="button" data-testid="button-refresh-queue" onClick={refresh} aria-label={t.refresh} className="inline-flex items-center gap-2 rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-xs font-semibold text-[#36564b] transition hover:bg-[#f1eddf]"><RefreshCw size={14} className={queue.isFetching ? 'animate-spin' : ''}/><span className="hidden sm:inline">{t.refresh}</span></button>
        </div>
      </div>
      <div className="mx-auto max-w-[1600px] px-4 pb-5 sm:px-7 lg:px-10"><p className="text-sm text-[#687a71]">{t.subtitle}</p></div>
    </header>

    {isAdmin && <SupportResponseTemplateManager language={language}/>}
    <div className="mx-auto grid max-w-[1600px] gap-5 px-3 py-5 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-10 lg:py-7">
      <aside className="overflow-hidden rounded-3xl border border-[#ded8c9] bg-[#fbf9f2] shadow-[0_12px_36px_rgba(48,63,53,.04)]" aria-label={t.queue}>
        <div className="border-b border-[#e4dfd2] p-5">
          <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">{t.queue}</h2><span data-testid="text-ticket-count" className="rounded-full bg-[#e7eee4] px-2.5 py-1 text-[11px] font-bold text-[#36564b]">{tickets.length} {t.inbox}</span></div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {(['all', ...statusKeys] as StatusFilter[]).map(key => <button key={key} type="button" data-testid={`filter-ticket-${key}`} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-bold transition ${filter === key ? 'bg-[#174d43] text-[#fff9e9]' : 'bg-[#f0ede3] text-[#60756b] hover:bg-[#e6e1d3]'}`}>{key === 'all' ? t.all : statusLabel(key)}</button>)}
          </div>
        </div>
        <div className="max-h-[74vh] overflow-y-auto p-2">
          {queue.isLoading ? <div className="space-y-2 p-2" data-testid="support-queue-skeleton">{[1,2,3,4,5].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#eeeadf]" />)}</div>
            : sortedTickets.length ? sortedTickets.map(ticket => <button type="button" key={ticket.id} data-testid={`ticket-row-${ticket.id}`} aria-current={selectedId === ticket.id ? 'true' : undefined} disabled={attachmentBusy} onClick={() => { setSelectedId(ticket.id); setIdentityVerified(false); setInternalNoteText(''); setRelatedRecordChoice(''); setAttachmentFiles([]); setPendingAttachmentMessageId(''); replyForm.reset({ message: '' }); setFeedback(''); }} className={`mb-1 w-full rounded-2xl border p-3.5 text-start transition hover:bg-[#f5f2e9] disabled:cursor-wait disabled:opacity-60 ${selectedId === ticket.id ? 'border-[#9db3a4] bg-[#eef2e9] shadow-[inset_3px_0_0_#28695a]' : 'border-transparent bg-transparent'}`}>
              <div className="flex items-start justify-between gap-3"><span data-testid={`text-ticket-subject-${ticket.id}`} className="min-w-0 break-words text-sm font-bold leading-5 text-[#29483e]">{ticket.subject}</span>{ticket.urgent && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f7e7df] px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[#934638]"><AlertTriangle size={11}/>{t.urgent}</span>}</div>
              {ticket.urgentOverdue && <span data-testid={`badge-ticket-overdue-${ticket.id}`} className="mt-2 inline-flex rounded-full bg-[#9a4435] px-2 py-1 text-[9px] font-bold text-white">{t.overdue}</span>}
              {ticket.hasActiveEscalation && <span data-testid={`badge-case-escalated-${ticket.id}`} className="mt-2 inline-flex rounded-full bg-[#f4ddc6] px-2 py-1 text-[9px] font-bold text-[#80533e]">{t.escalated}</span>}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#75847c]"><span className="rounded-full bg-[#e9e5d7] px-2 py-1 font-semibold text-[#536b61]">{t[ticket.category] ?? ticket.category}</span><span>{langName[ticketLanguage(ticket.language)]}</span><span className="ms-auto inline-flex items-center gap-1"><Clock3 size={11}/>{dateLabel(ticket.lastMessageAt, language)}</span></div>
              <div className="mt-2 flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${ticket.status === 'resolved' || ticket.status === 'closed' ? 'bg-[#e6eee5] text-[#45694f]' : 'bg-[#f0ede3] text-[#596f65]'}`}>{statusLabel(ticket.status)}</span><span className="max-w-28 truncate text-[10px] text-[#75847c]">{ticket.assignedTo ? `${t.assigned}: ${ticket.assignedTo}` : t.unassigned}</span></div>
            </button>) : <div className="px-5 py-12 text-center" data-testid="support-empty"><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[#eeeadf] text-[#64796d]"><MessageSquareText size={19}/></div><p className="mt-3 text-sm font-bold">{t.empty}</p><p className="mt-1 text-xs leading-5 text-[#75847c]">{t.emptyHint}</p></div>}
        </div>
      </aside>

      <section className="min-w-0 overflow-hidden rounded-3xl border border-[#ded8c9] bg-[#fbf9f2] shadow-[0_12px_36px_rgba(48,63,53,.04)]" aria-label={t.conversation}>
        {!selectedId ? <div className="grid min-h-[68vh] place-items-center p-8 text-center" data-testid="support-no-selection"><div><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e9e5d7] text-[#536b61]"><MessageSquareText /></div><h2 className="mt-4 font-display text-xl font-bold">{t.selectTicket}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-[#75847c]">{t.selectHint}</p></div></div>
          : detail.isLoading ? <div className="space-y-4 p-6" data-testid="support-detail-skeleton"><div className="h-8 w-2/3 animate-pulse rounded bg-[#e9e4d7]"/><div className="h-24 animate-pulse rounded-2xl bg-[#e9e4d7]"/><div className="h-64 animate-pulse rounded-2xl bg-[#e9e4d7]"/></div>
          : detail.isError || !active ? <div role="alert" className="m-5 rounded-2xl border border-[#e4c3b7] bg-[#fff5f1] p-5 text-sm text-[#805d55]" data-testid="support-detail-error"><p>{errorStatus(detail.error) === 403 ? t.deniedText : t.detailError}</p><button type="button" data-testid="button-retry-detail" onClick={() => void detail.refetch()} className="mt-3 font-bold text-[#174d43]">{t.retry}</button></div>
          : <div className="flex min-h-[68vh] flex-col">
            <div className="border-b border-[#e4dfd2] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#a76445]">{active.id} · {t[active.category] ?? active.category}</p><h2 data-testid={`text-active-subject-${active.id}`} className="mt-2 break-words font-display text-xl font-extrabold leading-snug sm:text-2xl">{active.subject}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><span data-testid={`status-active-ticket-${active.id}`} className="rounded-full bg-[#e8eee5] px-2.5 py-1 text-[10px] font-bold text-[#36564b]">{statusLabel(active.status)}</span>{active.urgent && <span className="inline-flex items-center gap-1 rounded-full bg-[#f7e7df] px-2.5 py-1 text-[10px] font-bold text-[#934638]"><AlertTriangle size={12}/>{t.urgent}</span>}{active.urgentOverdue && <span className="rounded-full bg-[#9a4435] px-2.5 py-1 text-[10px] font-bold text-white">{t.overdue}</span>}<span className="inline-flex items-center gap-1 text-[10px] text-[#75847c]"><Languages size={12}/>{langName[ticketLanguage(active.language)]}</span></div>
                </div>
                <div className="grid min-w-[190px] gap-3 sm:grid-cols-2 lg:min-w-[280px]">
                  <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#718078]">{t.assigned}<select data-testid={`select-assignee-${active.id}`} value={active.assignedTo ?? ''} disabled={update.isPending || hasActiveEscalation} onChange={e => updateTicket({ assignedTo: e.target.value || null })} className={`${field} w-full text-xs normal-case tracking-normal`}><option value="">{t.noAgent}</option>{agents.map(agent => <option key={agent.userId} value={agent.userId}>{agent.userId} · {agent.role}</option>)}</select></label>
                  <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#718078]">{t.status}<select data-testid={`select-status-${active.id}`} value={active.status} disabled={update.isPending} onChange={e => updateTicket({ status: e.target.value as SupportTicketStatus })} className={`${field} w-full text-xs normal-case tracking-normal`}>{statusKeys.map(s => <option key={s} value={s} disabled={hasActiveEscalation && ['resolved', 'closed'].includes(s)}>{statusLabel(s)}</option>)}</select>{hasActiveEscalation && <span className="normal-case tracking-normal">{t.escalationCloseHint}</span>}</label>
                </div>
              </div>
              {active.urgent && <div data-testid={`alert-outcome-${active.id}`} className={`mt-4 flex items-start gap-3 rounded-2xl border p-3.5 ${active.urgentAlertStatus === 'fallback_required' || active.urgentOverdue ? 'border-[#e4c3b7] bg-[#fff5f1] text-[#805d55]' : 'border-[#e2d9bd] bg-[#f6f0dd] text-[#675e43]'}`}>
                <AlertTriangle size={17} className="mt-0.5 shrink-0"/><div><p className="text-xs font-bold">{t.alert}{active.urgentOverdue ? ` · ${t.overdue}` : ''}</p><p className="mt-1 text-xs leading-5">{active.urgentOverdue ? t.alertOverdue : active.urgentAlertStatus === 'pending' ? t.alertPending : active.urgentAlertStatus === 'accepted' ? t.alertAccepted : active.urgentAlertStatus === 'fallback_required' ? t.alertFallback : t.alertNone}</p><p className="mt-1.5 text-[10px] leading-4 opacity-80">{t.alertNote}</p></div>
              </div>}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-[#75847c]"><span className="inline-flex items-center gap-1.5"><UserRound size={12}/>{t.customerId}: {active.memberUserId}</span><span className="inline-flex items-center gap-1.5"><Clock3 size={12}/>{t.lastActivity}: {dateLabel(active.lastMessageAt, language)}</span></div>
              {feedback && <p role="status" data-testid="status-ticket-action" className={`mt-3 text-xs font-semibold ${['error', 'reply-error', 'note-error', 'related-error', 'attachment-error', 'attachment-invalid', 'attachment-limit', 'download-error', 'privacy-export-error'].includes(feedback) ? 'text-[#9a4435]' : 'text-[#28695a]'}`}>
                {feedback === 'sent' ? t.replySent : feedback === 'reply-error' ? t.failedReply : feedback === 'error' ? t.updateError : feedback === 'saved' ? <><Check size={12} className="inline"/> {t.event}</> : feedback === 'note-sent' ? t.internalNoteSent : feedback === 'note-error' ? t.internalNoteError : feedback === 'related-linked' ? t.relatedRecordLinked : feedback === 'related-unlinked' ? t.relatedRecordUnlinked : feedback === 'related-error' ? t.relatedRecordError : feedback === 'attachment-error' ? t.attachmentUploadError : feedback === 'attachment-invalid' ? t.attachmentInvalid : feedback === 'attachment-limit' ? t.attachmentLimit : feedback === 'attachment-uploaded' ? t.attachmentUploadSuccess : feedback === 'download-error' ? t.attachmentDownloadError : feedback === 'privacy-export-prepared' ? t.privacyExportPrepared : feedback === 'privacy-export-error' ? t.privacyExportError : ''}
               </p>}
            </div>

            <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_250px]">
              <section className="flex min-h-[360px] min-w-0 flex-col border-b border-[#e4dfd2] lg:border-b-0 lg:border-e" aria-label={t.conversation}>
                <div className="flex items-center justify-between border-b border-[#e9e4d8] px-5 py-3.5"><h3 className="text-xs font-extrabold uppercase tracking-[.12em] text-[#536b61]">{t.conversation}</h3><span className="text-[10px] text-[#8a958d]">{active.messages.length}</span></div>
                <ol className="flex-1 space-y-3 overflow-y-auto bg-[#f6f3eb] p-4 sm:p-5" aria-live="polite">
                  {active.messages.length ? active.messages.map(message => {
                    const fromMember = message.authorRole === 'member';
                    const internal = message.isInternal;
                    const messageAttachments = attachmentsQuery.data?.filter(file => file.messageId === message.id) ?? [];
                    return <li key={message.id} data-testid={`message-${message.id}`} className={`max-w-[92%] rounded-2xl border px-4 py-3 ${internal ? 'mx-auto w-full border-[#e5d29a] bg-[#fff8df]' : fromMember ? 'me-auto border-[#d8e2d5] bg-[#e9f0e6]' : 'ms-auto border-[#e2dccd] bg-[#fffdf7]'}`}>
                      {internal && <p className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#8a6721]"><Shield size={12}/>{t.internalOnly}</p>}
                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#29483e]">{message.message}</p><p className="mt-2 text-[10px] text-[#75847c]">{roleLabel(message.authorRole)} · {dateLabel(message.createdAt, language)} · {langName[ticketLanguage(message.language)]}</p>
                      {messageAttachments.length > 0 && <div className="mt-3 space-y-1.5 border-t border-[#d8e2d5] pt-2">
                        <p className="text-[10px] font-bold text-[#536b61]">{t.attachments}</p>
                        {messageAttachments.map(file => <button key={file.id} type="button" data-testid={`button-download-support-attachment-${file.id}`} disabled={downloadingAttachmentId === file.id} onClick={() => void downloadAttachment(file.id, file.fileName)} className="flex max-w-full items-center gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-start text-xs font-semibold text-[#28695a] hover:bg-white disabled:opacity-50">
                          <Paperclip size={13} className="shrink-0" /><span className="truncate">{file.fileName}</span><Download size={13} className="shrink-0" />
                        </button>)}
                      </div>}
                    </li>;
                  }) : <li data-testid="support-no-messages" className="py-10 text-center text-sm text-[#75847c]">{t.noMessages}</li>}
                </ol>
                <Form {...replyForm}><form onSubmit={replyForm.handleSubmit(sendReply)} className="border-t border-[#e4dfd2] bg-[#fbf9f2] p-4 sm:p-5">
                  <div className="mb-2 flex items-end justify-between gap-3"><div><h3 className="text-xs font-extrabold text-[#36564b]">{t.reply}</h3><p className="mt-1 text-[10px] text-[#75847c]">{t.replyHint}</p></div><span className="text-[10px] tabular-nums text-[#8a958d]">{replyText.length}/5000</span></div>
                  <SupportResponseTemplatePicker language={ticketLanguage(active.language)} disabled={attachmentBusy || !!pendingAttachmentMessageId}
                    onInsert={body => {
                      const draft = replyForm.getValues('message').trim();
                      const next = draft ? `${draft}\n\n${body}` : body;
                      if (next.length > 5000) return false;
                      replyForm.setValue('message', next, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                      return true;
                    }}/>
                  <FormField control={replyForm.control} name="message" render={({ field: replyField }) => <FormItem>
                    <FormLabel className="sr-only">{t.reply}</FormLabel>
                     <FormControl><Textarea {...replyField} data-testid="textarea-support-reply" disabled={attachmentBusy || !!pendingAttachmentMessageId} maxLength={5000} rows={3} placeholder={t.replyPlaceholder} className={`${field} w-full resize-y leading-6 placeholder:text-[#9a9f96]`} /></FormControl>
                    <FormMessage />
                  </FormItem>} />
                   <div className="mt-3">
                     <label htmlFor="support-reply-attachments" className="block text-xs font-semibold text-[#51665e]">{t.addAttachments}
                       <input id="support-reply-attachments" data-testid="input-support-reply-attachments" type="file" multiple disabled={attachmentBusy || !!pendingAttachmentMessageId}
                         accept="application/pdf,image/jpeg,image/png,image/webp"
                         onChange={event => {
                           const chosen = Array.from(event.currentTarget.files ?? []);
                           event.currentTarget.value = '';
                           if (attachmentFiles.length + chosen.length > 3) { setFeedback('attachment-limit'); return; }
                           if (chosen.some(file => !supportAttachmentType(file) || file.size < 1 || file.size > 10 * 1024 * 1024)) { setFeedback('attachment-invalid'); return; }
                           setFeedback('');
                           setAttachmentFiles(current => [...current, ...chosen]);
                         }}
                         className={`${field} mt-1.5 w-full p-2 text-xs file:mr-3 file:rounded-full file:border-0 file:bg-[#e7eee4] file:px-3 file:py-1.5 file:text-xs file:font-bold disabled:opacity-60`} />
                     </label>
                     <p className="mt-1 text-[10px] leading-4 text-[#75847c]">{t.attachmentHint}</p>
                     {attachmentFiles.map((file, index) => <div key={`${file.name}-${index}`} className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-[#f2efe4] px-3 py-2 text-xs">
                       <span className="truncate">{file.name}</span>
                       <button type="button" aria-label={`${t.removeAttachment}: ${file.name}`} disabled={attachmentBusy} onClick={() => {
                         const remaining = attachmentFiles.filter((_, fileIndex) => fileIndex !== index);
                         setAttachmentFiles(remaining);
                         if (!remaining.length) setPendingAttachmentMessageId('');
                       }} className="shrink-0 font-bold text-[#8f3f32] disabled:opacity-50">{t.removeAttachment}</button>
                     </div>)}
                     {pendingAttachmentMessageId && attachmentFiles.length > 0 && <button type="button" data-testid="button-retry-support-attachments" disabled={attachmentBusy}
                       onClick={() => void retryAttachmentUpload()} className="mt-2 rounded-full border border-[#a76445] px-3 py-2 text-xs font-bold text-[#8f3f32] disabled:opacity-50">
                       {attachmentBusy ? t.sending : t.retryAttachmentUpload}
                     </button>}
                   </div>
                   <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] text-[#75847c]">{langName[ticketLanguage(active.language)]}</span><button type="submit" data-testid="button-send-support-reply" disabled={reply.isPending || attachmentBusy || !!pendingAttachmentMessageId || !replyText.trim()} className="inline-flex items-center gap-2 rounded-full bg-[#174d43] px-4 py-2.5 text-xs font-bold text-[#fff9e9] transition hover:bg-[#226556] disabled:cursor-not-allowed disabled:opacity-45">{reply.isPending || attachmentBusy ? t.sending : t.send}<ArrowUpRight size={14}/></button></div>
                </form></Form>
                <form onSubmit={event => { event.preventDefault(); void saveInternalNote(); }} className="border-t border-[#eadcb7] bg-[#fff9e8] p-4 sm:p-5">
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <div><h3 className="text-xs font-extrabold text-[#795d23]">{t.internalNote}</h3><p className="mt-1 text-[10px] leading-4 text-[#87754f]">{t.internalNoteHint}</p></div>
                    <span className="text-[10px] tabular-nums text-[#9a895f]">{internalNoteText.length}/5000</span>
                  </div>
                  <Textarea aria-label={t.internalNote} value={internalNoteText} onChange={event => setInternalNoteText(event.currentTarget.value)} data-testid="textarea-support-internal-note"
                    disabled={addInternalNote.isPending} maxLength={5000} rows={2} placeholder={t.internalNotePlaceholder}
                    className="w-full resize-y rounded-xl border border-[#e5d29a] bg-[#fffdf7] px-3 py-2.5 text-sm leading-6 text-[#4d442e] outline-none transition focus:border-[#b18a37] focus:ring-2 focus:ring-[#b18a37]/15 placeholder:text-[#9a8d6d] disabled:opacity-60" />
                  <div className="mt-3 flex justify-end">
                    <button type="submit" data-testid="button-save-support-internal-note" disabled={addInternalNote.isPending || !internalNoteText.trim()}
                      className="inline-flex items-center gap-2 rounded-full border border-[#b18a37] bg-[#f4e9c8] px-4 py-2.5 text-xs font-bold text-[#674f1d] transition hover:bg-[#eddfb7] disabled:cursor-not-allowed disabled:opacity-45">
                      {addInternalNote.isPending ? t.savingInternalNote : t.saveInternalNote}<Check size={14}/>
                    </button>
                  </div>
                </form>
              </section>

              <aside className="p-4 sm:p-5" aria-label={t.timeline}>
                {active.privacyRequestKind === 'data_export' && <section className="mb-6 rounded-2xl border border-[#d8e2d5] bg-[#f1f4eb] p-3.5" data-testid="support-privacy-export">
                  <h3 className="text-xs font-extrabold text-[#36564b]">{t.privacyExportTitle}</h3>
                  {privacyExportIsReady && privacyExportExpiry ? <p className="mt-2 text-[10px] leading-5 text-[#536b61]" role="status">
                    {t.privacyExportApproved}: {dateLabel(privacyExportExpiry.toISOString(), language)}
                  </p> : <>
                    <p className="mt-2 text-[10px] leading-5 text-[#75847c]">{t.privacyExportHelp}</p>
                    <label className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-[#536b61]">
                      <input type="checkbox" checked={identityVerified} onChange={event => setIdentityVerified(event.currentTarget.checked)} />
                      <span>{t.privacyExportVerify}</span>
                    </label>
                    <button type="button" data-testid="button-prepare-privacy-export" disabled={!identityVerified || preparePrivacyExportMutation.isPending || hasActiveEscalation}
                      onClick={() => void approvePrivacyExport()}
                      className="mt-3 w-full rounded-full bg-[#174d43] px-3 py-2 text-[10px] font-bold text-[#fff9e9] disabled:cursor-not-allowed disabled:opacity-45">
                      {preparePrivacyExportMutation.isPending ? t.privacyExportPreparing : t.privacyExportPrepare}
                    </button>
                  </>}
                </section>}
                <SupportCaseEscalations key={active.id} ticketId={active.id} ticketStatus={active.status} agents={agents} userId={userId!} language={language}/>
                <section className="mb-6 rounded-2xl border border-[#d8e2d5] bg-[#f1f4eb] p-3.5" data-testid="support-related-records">
                  <h3 className="text-xs font-extrabold text-[#36564b]">{t.relatedRecords}</h3>
                  <p className="mt-1 text-[10px] leading-4 text-[#75847c]">{t.relatedRecordsHint}</p>
                  {relatedRecordsQuery.isLoading ? <p className="mt-3 text-[10px] text-[#75847c]">{t.loading}</p>
                    : relatedRecordsQuery.isError ? <p role="alert" className="mt-3 text-[10px] text-[#9a4435]">{t.relatedRecordError}</p>
                      : <>
                        <div className="mt-3 space-y-2">
                          {relatedRecords.filter(record => record.linkId).map(record => <div key={record.linkId} className="rounded-xl border border-[#d8e2d5] bg-[#fffdf7] p-2.5">
                            <p className="break-words text-[11px] font-bold text-[#36564b]">{record.recordType === 'booking' ? t.bookingRecord : t.checkinRecord}: {record.title}</p>
                            <p className="mt-1 text-[10px] leading-4 text-[#75847c]">{record.facility} · {dateLabel(record.occurredAt, language)} · {record.status}</p>
                            <button type="button" data-testid={`button-unlink-related-record-${record.linkId}`} disabled={deleteRelatedRecordLink.isPending}
                              onClick={() => void unlinkRelatedRecord(record.linkId!)} className="mt-2 text-[10px] font-bold text-[#8f3f32] underline-offset-2 hover:underline disabled:opacity-50">{t.unlinkRecord}</button>
                          </div>)}
                          {!relatedRecords.length && <p className="text-[10px] leading-4 text-[#75847c]">{t.noRelatedRecords}</p>}
                        </div>
                        <form onSubmit={event => { event.preventDefault(); void linkRelatedRecord(); }} className="mt-3 border-t border-[#dbe3d7] pt-3">
                          <label htmlFor="support-related-record-select" className="block text-[10px] font-semibold text-[#536b61]">{t.selectRelatedRecord}</label>
                          <select id="support-related-record-select" data-testid="select-support-related-record" value={relatedRecordChoice} onChange={event => setRelatedRecordChoice(event.currentTarget.value)}
                            disabled={createRelatedRecordLink.isPending || relatedRecordsQuery.isLoading}
                            className={`${field} mt-1.5 w-full px-2.5 py-2 text-[10px]`}>
                            <option value="">{t.selectRelatedRecord}</option>
                            {relatedRecords.filter(record => !record.linkId).map(record => <option key={`${record.recordType}:${record.id}`} value={`${record.recordType}:${record.id}`}>
                              {record.recordType === 'booking' ? t.bookingRecord : t.checkinRecord} · {record.title} · {record.facility} · {dateLabel(record.occurredAt, language)}
                            </option>)}
                          </select>
                          <button type="submit" data-testid="button-link-support-related-record" disabled={!relatedRecordChoice || createRelatedRecordLink.isPending}
                            className="mt-2 w-full rounded-full bg-[#174d43] px-3 py-2 text-[10px] font-bold text-[#fff9e9] transition hover:bg-[#226556] disabled:cursor-not-allowed disabled:opacity-45">
                            {createRelatedRecordLink.isPending ? t.linkingRecord : t.linkRecord}
                          </button>
                        </form>
                      </>}
                </section>
                <h3 className="text-xs font-extrabold uppercase tracking-[.12em] text-[#536b61]">{t.timeline}</h3>
                {active.events.length ? <ol className="mt-4 space-y-0" data-testid={`ticket-timeline-${active.id}`}>{active.events.map((event, index) => <li key={`${event.createdAt}-${index}`} data-testid={`ticket-event-${active.id}-${index}`} className="relative border-s border-[#d8d2c4] pb-5 ps-4 last:border-transparent last:pb-0"><span className="absolute -start-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#fbf9f2] bg-[#6c8877]"/><p className="text-xs font-bold text-[#36564b]">{event.previousStatus !== event.nextStatus ? t.statusEvent : event.previousAssignee !== event.nextAssignee ? t.assignedEvent : event.action || t.event}</p><p className="mt-1 text-[10px] leading-4 text-[#75847c]">{event.detail || event.action}</p><p className="mt-1 text-[9px] text-[#919b93]">{dateLabel(event.createdAt, language)} · {event.actorId}</p></li>)}</ol> : <p data-testid="support-no-events" className="mt-4 text-xs leading-5 text-[#75847c]">{t.noEvents}</p>}
                <div className="mt-6 rounded-2xl border border-[#e4dfd2] bg-[#f5f2e9] p-3.5"><div className="flex items-center gap-2 text-[#536b61]"><Shield size={14}/><p className="text-[10px] font-extrabold">{t.security}</p></div><p className="mt-2 text-[10px] leading-5 text-[#75847c]">{t.alertNote}</p></div>
              </aside>
            </div>
          </div>}
      </section>
    </div>
  </main>;
}

export default SupportDeskPage;
