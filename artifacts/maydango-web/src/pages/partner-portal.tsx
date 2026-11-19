import { Children, cloneElement, isValidElement, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMemberSupportTicketQueryKey, getGetMemberSupportTicketsQueryKey, getGetOperationFacilitiesQueryKey, getGetOperationsQueryKey, useAddLiveOffering, useAddPartner, useApprovePartner, useCancelLiveOffering, useCancelRecurringOfferingSeries, useChangeLiveOffering, useChangeRecurringOfferingSeries, useCreateRecurringOfferings, useCreateMemberSupportTicket, useGetAttendance, useGetMemberSupportTicket, useGetMemberSupportTickets, useGetOperationFacilities, useGetOfferingWaitlist, useGetOperations, useRecordManualCheckin, useReplyMemberSupportTicket, useReviewAttendance, useRespondToOfferingCorrection, useReviewOfferingApproval, useRequestOfferingImageUploadUrl, useSubmitLiveOffering, useUpdatePartnerActivityApprovalMode, useSetOfferingCheckinPolicy } from '@workspace/api-client-react';
import type { GetAttendanceQueryResult, OfferingApprovalStatus, OfferingInput, OfferingSessionStatus, OfferingUpdate, PartnerInput, RecordManualCheckinBody, ReviewAttendanceBody, RecurringOfferingsInput, RecurringScheduleMode, LiveOffering, OfferingCheckinPolicyInput } from '@workspace/api-client-react';
import { getGetMemberSupportTicketAttachmentsQueryKey, useGetMemberSupportTicketAttachments } from '@workspace/api-client-react';
import { downloadMemberSupportFile, supportAttachmentType, uploadMemberSupportAttachments } from '@/lib/support-attachments';
import { uploadGuardianConsentImage } from '@/lib/guardian-consent-documents';
import { useAuth, useClerk } from '@clerk/react';
import { trackEvent } from '@/lib/analytics';
import { Link, Redirect } from 'wouter';
import { Activity, ArrowLeft, ArrowUpRight, CalendarDays, Check, CircleAlert, ClipboardCheck, Clock3, Dumbbell, FileText, LogOut, MapPin, Megaphone, Plus, RefreshCw, ShieldCheck, Star, TrendingUp, Users, Wallet, X } from 'lucide-react';
import { FacilityProfiles } from '@/pages/facility-profiles';
import { FacilityQualityControl } from '@/pages/facility-quality-control';
import { FacilityReviewsPortal } from '@/pages/facility-reviews-portal';
import { PartnerMarketingCenter } from '@/pages/partner-marketing-center';
import OperationsAnalytics from '@/pages/operations-analytics';
import { PartnerOperationsPanel, type OperationsTab, type PortalLanguage } from '@/pages/partner-operations';
import { PartnerStaffManagement } from '@/pages/partner-staff-management';
import { formatPartnerPortalNumber, formatPartnerPortalSentence, getPartnerPortalCopy, splitLocalizedCommaList } from '@/lib/partner-portal-copy';

type Tab = 'overview' | 'offerings' | 'attendance' | 'waitlist' | 'partners' | 'support' | 'quality' | 'reviews' | 'marketing' | 'analytics' | 'staff' | OperationsTab;
type ReviewAction = ReviewAttendanceBody['action'];
const approvalStatusLabels: Record<OfferingApprovalStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  published: 'Published',
  suspended: 'Suspended',
  rejected: 'Rejected',
  archived: 'Archived',
};
const approvalStatusStyles: Record<OfferingApprovalStatus, string> = {
  draft: 'bg-[#eeeadc] text-[#756e5b]',
  submitted: 'bg-[#e3ebf4] text-[#355b7a]',
  under_review: 'bg-[#e3ebf4] text-[#355b7a]',
  changes_requested: 'bg-[#f8ead2] text-[#8a5b20]',
  approved: 'bg-[#e1efdf] text-[#2d6d4a]',
  published: 'bg-[#e1efdf] text-[#2d6d4a]',
  suspended: 'bg-[#f8ead2] text-[#8a5b20]',
  rejected: 'bg-[#f2dfd5] text-[#9a4435]',
  archived: 'bg-[#eeeadc] text-[#756e5b]',
};
const sessionStatusLabels: Record<OfferingSessionStatus, string> = {
  draft: 'Draft session',
  scheduled: 'Scheduled',
  open_for_booking: 'Open for booking',
  fully_booked: 'Fully booked',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
};
const sessionStatusStyles: Record<OfferingSessionStatus, string> = {
  draft: 'bg-[#eeeadc] text-[#756e5b]',
  scheduled: 'bg-[#e3ebf4] text-[#355b7a]',
  open_for_booking: 'bg-[#e1efdf] text-[#2d6d4a]',
  fully_booked: 'bg-[#f8ead2] text-[#8a5b20]',
  in_progress: 'bg-[#e3ebf4] text-[#355b7a]',
  completed: 'bg-[#eeeadc] text-[#756e5b]',
  cancelled: 'bg-[#f2dfd5] text-[#9a4435]',
  suspended: 'bg-[#f8ead2] text-[#8a5b20]',
};
const approvalReviewTargets: Record<OfferingApprovalStatus, OfferingApprovalStatus[]> = {
  draft: ['archived'],
  submitted: ['under_review', 'changes_requested', 'approved', 'rejected', 'archived'],
  under_review: ['changes_requested', 'approved', 'rejected', 'archived'],
  changes_requested: ['under_review', 'rejected', 'archived'],
  approved: ['published', 'changes_requested', 'rejected', 'archived'],
  published: ['suspended', 'archived'],
  suspended: ['approved', 'archived'],
  rejected: ['archived'],
  archived: [],
};
const approvalReasonRequired = (status: OfferingApprovalStatus) =>
  status === 'changes_requested' || status === 'rejected' || status === 'archived' || status === 'suspended';
const portalDateLocale = (lang: PortalLanguage) => lang === 'ar' ? 'ar-IQ' : lang === 'ku' ? 'ckb-IQ' : 'en-IQ';
const savedPortalLanguage = (): PortalLanguage => {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem('maydango-partner-language');
  return saved === 'ar' || saved === 'ku' ? saved : 'en';
};
const formatDate = (value: string, lang: PortalLanguage = savedPortalLanguage()) => new Intl.DateTimeFormat(portalDateLocale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad', numberingSystem: 'latn' }).format(new Date(value));
const localIso = (value: string) => new Date(`${value}:00+03:00`).toISOString();
const portalLabels: Record<PortalLanguage, Record<string, string>> = {
  en: { overview: 'Overview', offerings: 'Offerings', attendance: 'Attendance', waitlist: 'Waiting list', partners: 'Partners', support: 'Help & safety', quality: 'Facility quality', reviews: 'Reviews & ratings', marketing: 'Marketing centre', analytics: 'Analytics', facilities: 'Facilities', bookings: 'Sessions & bookings', settlements: 'Settlements', invoices: 'Invoices', staff: 'Staff and roles', greeting: 'Good to see you.', attendanceTitle: 'Attendance review', approvals: 'Partner approvals', workspace: 'Partner operations', language: 'Language', guardianRequired: 'Guardian consent required', ageUnknown: 'Birth date needs verification', guardianOnSiteCheck: 'I verified guardian consent in person at the venue.', guardianPhoto: 'Consent photo (JPEG, PNG, or WebP; up to 10 MB)', uploadGuardianPhoto: 'Upload consent copy', guardianUploaded: 'Copy uploaded. Only Super Admin can open it; it is deleted 90 days after the visit.', guardianWaiting: 'Upload becomes available after the member checks in.', guardianUploadFailed: 'Could not upload the consent copy. Check the image and try again.', guardianNeedUpload: 'Confirm the on-site check and select an image before uploading.', guardianUploading: 'Uploading…', guardianQueueTitle: 'Guardian consent checks', guardianQueueDescription: 'Check consent at the venue. Copies go through the private partner portal and are deleted 90 days after the visit.' },
  ar: { overview: 'نظرة عامة', offerings: 'العروض', attendance: 'الحضور', waitlist: 'قائمة الانتظار', partners: 'الشركاء', support: 'الدعم والسلامة', quality: 'جودة المرافق', reviews: 'التقييمات والمراجعات', marketing: 'مركز التسويق', analytics: 'التحليلات', facilities: 'المرافق', bookings: 'الجلسات والحجوزات', settlements: 'التسويات', invoices: 'الفواتير', staff: 'الموظفون والصلاحيات', greeting: 'سعيدون بعودتك.', attendanceTitle: 'مراجعة الحضور', approvals: 'اعتماد الشركاء', workspace: 'عمليات الشركاء', language: 'اللغة', guardianRequired: 'مطلوب موافقة ولي الأمر', ageUnknown: 'يجب التحقق من تاريخ الميلاد', guardianOnSiteCheck: 'تحققت من موافقة ولي الأمر حضورياً في المرفق.', guardianPhoto: 'صورة الموافقة (JPEG أو PNG أو WebP، حتى 10 MB)', uploadGuardianPhoto: 'رفع نسخة الموافقة', guardianUploaded: 'تم رفع النسخة. يستطيع Super Admin فقط الاطلاع عليها، وتُحذف بعد 90 يوماً من الزيارة.', guardianWaiting: 'يصبح الرفع متاحاً بعد تسجيل حضور العضو.', guardianUploadFailed: 'تعذر رفع نسخة الموافقة. تحقق من الصورة وحاول مجدداً.', guardianNeedUpload: 'أكد التحقق في المرفق واختر صورة قبل الرفع.', guardianUploading: 'جارٍ الرفع…', guardianQueueTitle: 'التحقق من موافقة ولي الأمر', guardianQueueDescription: 'تحقق من الموافقة في المرفق. تُرفع النسخة عبر بوابة الشريك الخاصة وتُحذف بعد 90 يوماً من الزيارة.' },
  ku: { overview: 'پوختە', offerings: 'پێشکەشکراوەکان', attendance: 'ئامادەبوون', waitlist: 'لیستی چاوەڕوانی', partners: 'هاوبەشەکان', support: 'یارمەتی و سەلامەتی', quality: 'کوالێتی شوێنەکان', reviews: 'هەڵسەنگاندن و بۆچوون', marketing: 'ناوەندی بازاڕکردن', analytics: 'شیکاری', facilities: 'شوێنەکان', bookings: 'وانە و حجزەکان', settlements: 'یەکلاکردنەوە', invoices: 'پسووڵەکان', staff: 'کارمەند و دەسەڵاتەکان', greeting: 'بەخێربێیتەوە.', attendanceTitle: 'پێداچوونەوەی ئامادەبوون', approvals: 'پەسەندکردنی هاوبەش', workspace: 'بەڕێوەبردنی هاوبەش', language: 'زمان', guardianRequired: 'ڕەزامەندیی سەرپەرشتیار پێویستە', ageUnknown: 'پێویستە تەمەنی ئەندام پشتڕاست بکرێتەوە', guardianOnSiteCheck: 'لە شوێنەکەدا ڕەزامەندیی سەرپەرشتیارم بە ڕووی خۆم پشتڕاست کردەوە.', guardianPhoto: 'وێنەی ڕەزامەندی (JPEG، PNG یان WebP؛ تا 10 MB)', uploadGuardianPhoto: 'بارکردنی وێنەی ڕەزامەندی', guardianUploaded: 'وێنەکە بارکرا. تەنها Super Admin دەتوانێت بیبینێت؛ 90 ڕۆژ دوای سەردان دەسڕدرێتەوە.', guardianWaiting: 'دوای تۆمارکردنی حزووری ئەندام دەتوانرێت وێنەکە بار بکرێت.', guardianUploadFailed: 'بارکردنی وێنەی ڕەزامەندی سەرکەوتوو نەبوو. وێنەکە بپشکنە و دووبارە هەوڵ بدە.', guardianNeedUpload: 'پشتڕاستکردنەوەی شوێنەکە بکە و پێش بارکردن وێنەیەک هەڵبژێرە.', guardianUploading: 'وێنەکە بار دەکرێت…', guardianQueueTitle: 'پشکنینی ڕەزامەندیی سەرپەرشتیار', guardianQueueDescription: 'لە شوێنەکەدا ڕەزامەندی بپشکنە. وێنەکە لە ڕێگەی پۆرتاڵی تایبەتی هاوبەش بار دەکرێت و 90 ڕۆژ دوای سەردان دەسڕدرێتەوە.' },
};
const portalLabel = (lang: PortalLanguage, key: string) => {
  const source = portalLabels.en[key] ?? key;
  return getPartnerPortalCopy(lang, source) ?? (lang === 'en' ? source : portalLabels[lang][key] ?? key);
};

type GuardianConsentRow = GetAttendanceQueryResult["rows"][number];

function GuardianConsentQueue({ rows, lang, onUploaded }: {
  rows: GuardianConsentRow[];
  lang: PortalLanguage;
  onUploaded: () => void;
}) {
  const relevant = rows.filter(row => row.guardianConsentState && row.guardianConsentState !== "not_required");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  if (!relevant.length) return null;

  const submit = async (attendanceId: string) => {
    if (!checked[attendanceId] || !files[attendanceId]) {
      setFeedback(portalLabel(lang, "guardianNeedUpload"));
      return;
    }
    setBusyId(attendanceId);
    setFeedback("");
    try {
      await uploadGuardianConsentImage(attendanceId, files[attendanceId]!);
      setFiles(current => ({ ...current, [attendanceId]: null }));
      setChecked(current => ({ ...current, [attendanceId]: false }));
      onUploaded();
      setFeedback(portalLabel(lang, "guardianUploaded"));
    } catch {
      setFeedback(portalLabel(lang, "guardianUploadFailed"));
    } finally {
      setBusyId(null);
    }
  };

  return <section className="mb-5 rounded-3xl border border-[#dfc99e] bg-[#fffaf0] p-5" aria-labelledby="guardian-consent-queue-title">
    <h2 id="guardian-consent-queue-title" className="font-display text-lg font-bold text-[#173d35]">{portalLabel(lang, "guardianQueueTitle")}</h2>
    <p className="mt-1 text-xs leading-5 text-[#687a71]">{portalLabel(lang, "guardianQueueDescription")}</p>
    <div className="mt-4 grid gap-3">
      {relevant.map(row => {
        const id = row.reference;
        return <article key={row.reservationId} className="rounded-2xl border border-[#e8e0cf] bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#a76445]">{row.facility} · {formatDate(row.startsAt, lang)}</p>
          <p className="mt-1 font-semibold text-[#173d35]">{row.title}</p>
          {row.guardianConsentState === "age_unknown" && <p className="mt-2 text-xs text-[#9a4435]">{portalLabel(lang, "ageUnknown")}</p>}
          {row.guardianConsentState === "uploaded" && <p className="mt-2 text-xs leading-5 text-[#315e42]">{portalLabel(lang, "guardianUploaded")}</p>}
          {row.guardianConsentState === "required" && <>
            <p className="mt-2 text-xs font-semibold text-[#8a5b20]">{portalLabel(lang, "guardianRequired")}</p>
            {(!id || row.status !== "pending") ? <p className="mt-2 text-xs text-[#687a71]">{portalLabel(lang, "guardianWaiting")}</p> : <div className="mt-3 grid gap-3">
              <label className="flex items-start gap-2 text-xs leading-5 text-[#36564b]">
                <input type="checkbox" checked={!!checked[id]} onChange={event => setChecked(current => ({ ...current, [id]: event.target.checked }))} className="mt-0.5 accent-[#174d43]" />
                <span>{portalLabel(lang, "guardianOnSiteCheck")}</span>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-[#51665e]">
                <span>{portalLabel(lang, "guardianPhoto")}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => setFiles(current => ({ ...current, [id]: event.target.files?.[0] ?? null }))} className="block w-full rounded-xl border border-[#d8d2c4] bg-white p-2 text-xs" />
              </label>
              <button type="button" disabled={busyId === id} onClick={() => void submit(id)} className="w-fit rounded-xl bg-[#174d43] px-4 py-2.5 text-xs font-bold text-[#fff9e9] disabled:cursor-wait disabled:opacity-50">
                {busyId === id ? portalLabel(lang, "guardianUploading") : portalLabel(lang, "uploadGuardianPhoto")}
              </button>
            </div>}
          </>}
        </article>;
      })}
    </div>
    {feedback && <p className="mt-3 rounded-xl bg-[#edf4ee] p-3 text-xs text-[#36564b]" role="status">{feedback}</p>}
  </section>;
}
const localizedPhrases: Record<Exclude<PortalLanguage, 'en'>, Record<string, string>> = {
  ar: {
    'English': 'الإنجليزية', 'MAYDANGO · IRAQ': 'MaydanGo · العراق',
    'MaydanGo support': 'دعم MaydanGo', 'Help & safety': 'الدعم والسلامة', 'Support request': 'طلب دعم',
    'Loading…': 'جارٍ التحميل…', 'Support history could not be loaded.': 'تعذر تحميل سجل الدعم.',
    'Send a support request or report a safety concern.': 'أرسل طلب دعم أو أبلغ عن مشكلة تتعلق بالسلامة.',
    'Select a request to read the conversation and reply to MaydanGo support.': 'اختر طلباً لقراءة المحادثة والرد على دعم MaydanGo.',
    'Loading conversation…': 'جارٍ تحميل المحادثة…', 'Conversation could not be loaded.': 'تعذر تحميل المحادثة.',
    'Your support conversation': 'محادثة الدعم', 'You': 'أنت',
    'Write a reply': 'اكتب رداً', 'Send reply': 'إرسال الرد', 'Reply sent.': 'تم إرسال الرد.',
    'Could not send the reply. Please try again.': 'تعذر إرسال الرد. حاول مرة أخرى.',
    'Refresh conversation': 'تحديث المحادثة',
    'Support topic': 'موضوع الدعم', 'Booking question': 'استفسار عن حجز', 'Safety concern': 'مشكلة تتعلق بالسلامة', 'Other support': 'دعم آخر',
    'Urgent safety concern': 'بلاغ سلامة عاجل',
    'Urgent safety reports are prioritized in the MaydanGo support queue. MaydanGo attempts push alerts for authorized support staff with notifications enabled, but delivery can fail; email backup is not connected. This form is not an emergency service; contact local emergency services if someone is in immediate danger.': 'تُعطى بلاغات السلامة العاجلة أولوية في قائمة دعم MaydanGo. تحاول MaydanGo إرسال تنبيه فوري لموظفي الدعم المخوّلين الذين فعّلوا الإشعارات، لكن قد لا يصل التنبيه؛ ولم يتم ربط بريد إلكتروني احتياطي. هذا النموذج ليس خدمة طوارئ؛ اتصل بخدمات الطوارئ المحلية إذا كان هناك خطر فوري.',
    'Subject': 'الموضوع', 'Booking reference (optional)': 'مرجع الحجز (اختياري)', 'Describe what happened or how we can help': 'اشرح ما حدث أو كيف يمكننا مساعدتك',
    'Use the reservation reference when available. Include only details needed to review the report.': 'استخدم مرجع الحجز عند توفره. أضف فقط التفاصيل اللازمة لمراجعة البلاغ.',
    'Send to MaydanGo support': 'إرسال إلى دعم MaydanGo', 'Sending…': 'جارٍ الإرسال…', 'Support request sent.': 'تم إرسال طلب الدعم.',
    'Could not send the request. Please try again.': 'تعذر إرسال الطلب. حاول مرة أخرى.', 'Your recent support requests': 'طلبات الدعم الأخيرة',
    'No support requests yet.': 'لا توجد طلبات دعم حتى الآن.', 'Open': 'مفتوح', 'In progress': 'قيد المعالجة', 'Waiting for you': 'بانتظار ردك', 'Resolved': 'تم الحل', 'Closed': 'مغلق',
    'session': 'جلسة', 'event': 'فعالية', 'coach': 'تدريب',
    'confirm': 'تأكيد', 'dispute': 'اعتراض', 'accept request': 'قبول الطلب', 'Reject request': 'رفض الطلب',
    'resolve confirm': 'حل الاعتراض: تأكيد', 'resolve void': 'حل الاعتراض: إبطال',
    'void': 'إبطال', 'lock': 'قفل', 'locked': 'مقفل', 'manual.checkin': 'تسجيل حضور بمساعدة الموظف',
    'partner cancelled': 'ألغاه الشريك', 'offer accepted': 'تم قبول العرض', 'offer declined': 'تم رفض العرض',
    'Audit history ·': 'سجل التدقيق ·', '— audit reason (at least 5 characters)': '— سبب المراجعة (5 أحرف على الأقل)',
    '· Group': '· المجموعة',
    'Close form': 'إغلاق النموذج', 'Partner': 'الشريك', 'Choose a partner': 'اختر شريكاً',
    'Session': 'جلسة', 'Event': 'فعالية', 'Coaching': 'تدريب',
    'Additional dates · YYYY-MM-DD, one per line': 'تواريخ إضافية · YYYY-MM-DD، تاريخ واحد في كل سطر',
    'Skip dates or holidays · YYYY-MM-DD, one per line': 'تجاوز التواريخ أو العطلات · YYYY-MM-DD، تاريخ واحد في كل سطر',
    'Repeat until · inclusive': 'تكرار حتى · شامل التاريخ',
    'At': 'في', 'local time · inclusive through': 'بالتوقيت المحلي · شاملاً حتى',
    'Conflict date:': 'التاريخ المتعارض:',
    'Use tiers configured for your offering': 'استخدم فئات العضوية المحددة لهذا العرض',
    'Join URL (optional)': 'رابط الانضمام (اختياري)',
    'Portal access is not enabled': 'لم يتم تفعيل الوصول إلى البوابة',
    'Your MaydanGo account is signed in, but it does not have an approved partner or administrator role. No partner or attendance information is available for this account.': 'تم تسجيل الدخول إلى حساب MaydanGo، لكن الحساب لا يملك دور شريك أو مدير معتمداً. لا تتوفر لهذا الحساب معلومات عن الشركاء أو الحضور.',
    'Public website': 'الموقع العام', 'Public MaydanGo site': 'موقع MaydanGo العام',
    'Could not load operations': 'تعذر تحميل عمليات الشركاء',
    'The MaydanGo operations service did not respond. Your partner scope has not been loaded.': 'لم تستجب خدمة عمليات MaydanGo، ولم يتم تحميل نطاق الشريك الخاص بك.',
    'Try again': 'أعد المحاولة', 'Portal navigation': 'التنقل في البوابة',
    'Sign out': 'تسجيل الخروج', 'Finance desk': 'قسم المالية', 'Exit': 'خروج',
    'Dismiss notice': 'إغلاق الإشعار', 'Of': 'من', 'server-listed offerings': 'العروض المدرجة على الخادم',
    'Partner activity': 'أنشطة الشريك', 'roster records': 'سجلات الحضور',
    'Partner:': 'الشريك:', 'Review reason': 'سبب المراجعة',
    'Describe the correction or provide the requested details.': 'اشرح التصحيح أو أضف التفاصيل المطلوبة.',
    'Required for corrections, rejection, or archiving.': 'مطلوب عند طلب التصحيح أو الرفض أو الأرشفة.',
    'Close': 'إغلاق', 'No offerings returned': 'لم تُرجع أي عروض',
    'Create an offering to start managing your available sessions and events.': 'أنشئ عرضاً لبدء إدارة الجلسات والفعاليات المتاحة.',
    'Retry': 'إعادة المحاولة', 'Refresh': 'تحديث',
    'MaydanGo partner operations': 'عمليات شركاء MaydanGo', 'Iraq local time': 'التوقيت المحلي للعراق',
    'Sunday': 'الأحد', 'Monday': 'الاثنين', 'Tuesday': 'الثلاثاء', 'Wednesday': 'الأربعاء',
    'Thursday': 'الخميس', 'Friday': 'الجمعة', 'Saturday': 'السبت',
    'could not be completed. The server did not accept the change.': 'تعذر إكمال العملية. لم يقبل الخادم التغيير.',
    'Partner review': 'مراجعة الشريك', 'Offering update': 'تحديث العرض', 'Activity submission': 'إرسال النشاط',
    'Correction response': 'الرد على التصحيح',
    'Cancellation': 'الإلغاء', 'Attendance review': 'مراجعة الحضور',
    'Add valid session start, end, and cancellation times. The end must be after the start.': 'أدخل أوقات بدء الجلسة وانتهائها وآخر موعد للإلغاء بصورة صحيحة. يجب أن يكون وقت الانتهاء بعد وقت البدء.',
    'Choose a shared facility record before creating this offering.': 'اختر سجل مرفق مشتركاً قبل إنشاء هذا العرض.',
    'Live online offerings need a title and description in English, Iraqi Arabic, and Sorani.': 'تحتاج العروض المباشرة عبر الإنترنت إلى عنوان ووصف بالإنجليزية والعربية العراقية والكردية السورانية.',
    'Live online offerings require a secure HTTPS join URL.': 'تتطلب العروض المباشرة عبر الإنترنت رابط انضمام آمناً باستخدام HTTPS.',
    'Enter a response of at least five characters.': 'أدخل رداً لا يقل عن خمسة أحرف.',
    'Choose a different administrator decision.': 'اختر قراراً إدارياً مختلفاً.',
    'Enter a start, end, and cancellation deadline.': 'أدخل وقت البدء والانتهاء وآخر موعد للإلغاء.',
    'Offering schedule saved.': 'تم حفظ جدول العرض.',
    'Attendance review recorded.': 'تم تسجيل مراجعة الحضور.',
    'Booking request rejected.': 'تم رفض طلب الحجز وإبلاغ العضو.',
    'Select a partner before creating this offering.': 'اختر شريكاً قبل إنشاء هذا العرض.',
    'Choose a valid first session date.': 'اختر تاريخاً صحيحاً لأول جلسة.',
    'Choose an inclusive repeat-until date.': 'اختر تاريخاً صحيحاً لنهاية التكرار ويشمل ذلك اليوم.',
    'The repeat-until date must be on or after the first session date.': 'يجب أن يكون تاريخ نهاية التكرار في يوم الجلسة الأولى أو بعدها.',
    'The repeat-until date must be within 90 calendar days of the first session.': 'يجب ألا يتجاوز تاريخ نهاية التكرار 90 يوماً تقويمياً من تاريخ الجلسة الأولى.',
    'Use valid dates within the schedule range.': 'استخدم تواريخ صحيحة ضمن نطاق الجدول.',
    'Choose a daily interval from 1 to 30 days.': 'اختر فاصلاً يومياً من يوم إلى 30 يوماً.',
    'Choose at least one weekday for the recurring sessions.': 'اختر يوماً واحداً من أيام الأسبوع على الأقل للجلسات المتكررة.',
    'Choose a custom interval from 1 to 12 weeks.': 'اختر فاصلاً مخصصاً من أسبوع إلى 12 أسبوعاً.',
    'Add no more than 89 dates; the first date is included automatically.': 'أضف 89 تاريخاً كحد أقصى؛ تتم إضافة التاريخ الأول تلقائياً.',
    'This schedule creates more than 90 occurrences. Choose fewer dates or an earlier end date.': 'ينشئ هذا الجدول أكثر من 90 موعداً. اختر تواريخ أقل أو تاريخ نهاية أسبق.',
    'No sessions match the selected weekdays and date range.': 'لا توجد جلسات تطابق أيام الأسبوع ونطاق التواريخ المحددين.',
    'This schedule conflicts with an existing offering. Adjust the dates or weekdays and try again.': 'يتعارض هذا الجدول مع عرض قائم. عدّل التواريخ أو أيام الأسبوع وحاول مرة أخرى.',
    'The offering could not be saved. Check the details and try again.': 'تعذر حفظ العرض. راجع التفاصيل وحاول مرة أخرى.',
    'reserved': 'محجوز', 'requested': 'مطلوب', 'admin cancelled': 'ألغاه المدير',
    'not checked in': 'لم يُسجل الحضور', 'confirmed': 'مؤكد', 'pending': 'قيد الانتظار',
    'disputed': 'مُعترض عليه', 'no show': 'لم يحضر', 'waiting': 'بانتظار الدور',
    'offered': 'تم تقديم عرض', 'accepted': 'مقبول', 'expired': 'منتهي الصلاحية',
    'Waiting-list position': 'ترتيب قائمة الانتظار', 'remaining': 'متبقٍ',
    'Operations desk': 'مكتب العمليات', 'Partner workspace': 'مساحة عمل الشريك',
    'Review the partner and offering records returned for your administrator account.': 'راجع سجلات الشركاء والعروض المتاحة لحساب المدير.',
    'Partner access': 'صلاحية الشريك', 'Administrator access': 'صلاحية المدير', 'Workspace': 'مساحة العمل', 'Server-scoped access': 'الوصول محدد من الخادم',
    'Your MaydanGo space': 'مساحتك في MaydanGo', 'A clear view of partner activity and attendance.': 'عرض واضح لنشاط الشريك والحضور.',
    'Bring your sessions and community into view.': 'أدر جلساتك ومجتمعك من مكان واحد.', 'Manage the live opportunities and attendance roster assigned to your partner account.': 'أدر الفرص المتاحة وسجل الحضور المرتبط بحساب الشريك.',
    'Active offerings': 'العروض النشطة', 'Manage offerings': 'إدارة العروض', 'Next on the roster': 'القادم في سجل الحضور',
    'Attendance records in your server scope': 'سجلات الحضور ضمن نطاق الخادم', 'View all': 'عرض الكل', 'Roster unavailable · Retry': 'تعذر تحميل السجل · أعد المحاولة',
    'No attendance records were returned for this scope.': 'لا توجد سجلات حضور لهذا النطاق.', 'Scoped by the server': 'النطاق محدد من الخادم',
    'Your account role and partner boundary come from the operations service. Actions are checked again by MaydanGo when saved.': 'يحدد نظام العمليات دور الحساب ونطاق الشريك. وتتحقق MaydanGo من الصلاحيات مجدداً عند الحفظ.',
    'Administrator': 'مدير', 'Partner operator': 'مشغل شريك', 'Create and maintain opportunities from the authorized operations record.': 'أنشئ الفرص وأدرها من سجل العمليات المصرح به.',
    'New offering': 'عرض جديد', 'Cancelled': 'ملغى', 'Active': 'نشط', 'Draft': 'مسودة',
    'Submitted': 'مُرسل للمراجعة', 'Under review': 'قيد المراجعة', 'Changes requested': 'التعديلات مطلوبة', 'Published': 'منشور', 'Rejected': 'مرفوض', 'Archived': 'مؤرشف', 'Pending activity review': 'مراجعة النشاط معلقة',
    'Submit for review': 'إرسال للمراجعة', 'Awaiting review': 'بانتظار المراجعة', 'Administrator decision': 'قرار المدير', 'Decision reason': 'سبب القرار',
    'Save decision': 'حفظ القرار', 'Partner response': 'رد الشريك', 'Respond and resubmit': 'الرد وإعادة الإرسال', 'Latest partner response': 'آخر رد من الشريك',
    'Choose a decision': 'اختر قراراً', 'A reason is required for this decision.': 'يجب إدخال سبب لهذا القرار.',
    'Create a recurring schedule': 'إنشاء جدول متكرر', 'Each occurrence becomes a separate bookable session. Dates and times use Iraq time.': 'كل موعد يصبح جلسة مستقلة قابلة للحجز. التواريخ والأوقات حسب توقيت العراق.',
    'Repeat pattern': 'نمط التكرار', 'Daily': 'يومي', 'Weekly': 'أسبوعي', 'Custom interval': 'فترة مخصصة', 'Selected dates': 'تواريخ محددة',
    'Repeat on': 'التكرار في', 'Selected-date preview': 'معاينة التواريخ المحددة', 'Baghdad-time preview': 'معاينة بتوقيت بغداد',
    'The first session date is included automatically.': 'يُضاف تاريخ الجلسة الأولى تلقائياً.',
    'Up to 90 calendar days and no more than 90 occurrences.': 'حتى 90 يوماً تقويمياً وبحد أقصى 90 موعداً.',
    'Some session dates overlap existing offerings. Review the highlighted dates and try again.': 'تتعارض بعض تواريخ الجلسات مع عروض قائمة. راجع التواريخ المظللة وحاول مرة أخرى.',
    'Future series cancellation results.': 'نتائج إلغاء الجلسات المستقبلية.',
    'Cancelled dates:': 'التواريخ الملغاة:',
    'No future sessions were cancelled.': 'لم يتم إلغاء أي جلسات مستقبلية.',
    'Left unchanged because of bookings or attendance:': 'بقيت دون تغيير بسبب وجود حجوزات أو حضور:',
    'Edit session': 'تعديل الجلسة', 'Edit future series': 'تعديل الجلسات القادمة', 'Recurring series': 'سلسلة متكررة',
    'Cancel session': 'إلغاء الجلسة', 'Cancel future series': 'إلغاء الجلسات القادمة',
    'Changes apply to this and all remaining future sessions. Reservations stay attached to their sessions. A session with an attendance record cannot have its date changed. Moving the selected date shifts the remaining dates by the same amount.': 'تُطبّق التغييرات على هذه الجلسة وكل الجلسات المستقبلية. تبقى الحجوزات مرتبطة بالجلسة نفسها. لا يمكن تغيير تاريخ جلسة لها سجل حضور. تغيير تاريخ الجلسة المحددة يزيح تواريخ الجلسات المتبقية بالمقدار نفسه.',
    'Make draft': 'تحويل إلى مسودة', 'Activate': 'تفعيل', 'Cancel': 'إلغاء', 'Capacity': 'السعة', 'Save': 'حفظ',
    'Activity setting': 'مكان النشاط', 'Choose a setting': 'اختر مكان النشاط', 'Indoors': 'داخلي', 'Outdoors': 'خارجي',
    'Waitlist offer window (minutes)': 'مدة عرض قائمة الانتظار (دقيقة)', 'Save offer window': 'حفظ مدة العرض', 'Waitlist and offers': 'قائمة الانتظار والعروض',
    'Loading waitlist…': 'جارٍ تحميل قائمة الانتظار…', 'Waitlist unavailable. No member account details are shown.': 'تعذرت إتاحة قائمة الانتظار. لا تُعرض بيانات حسابات الأعضاء.',
    'No waitlist entries have been recorded.': 'لا توجد سجلات في قائمة الانتظار.', 'View the live queue for your upcoming offerings. The server shares queue order and timing only; member identities stay private in this view.': 'اعرض قائمة الانتظار المباشرة لعروضك القادمة. يعرض الخادم ترتيب الانتظار وتوقيته فقط؛ وتبقى هويات الأعضاء خاصة.',
    'Joined': 'تاريخ الانضمام', 'Position': 'الترتيب', 'No one is waiting': 'لا يوجد أشخاص في الانتظار',
    'Active queues for your upcoming offerings will appear here.': 'ستظهر هنا قوائم الانتظار النشطة لعروضك القادمة.',
    'Review reservations in the server-scoped roster. Member names are not returned or displayed; each decision requires a reason and is recorded by the service.': 'راجع الحجوزات ضمن سجل الخادم. لا تُعرض أسماء الأعضاء؛ ويتطلب كل قرار سبباً يسجله النظام.',
    'Attendance roster unavailable': 'تعذر تحميل سجل الحضور', 'Roster is clear': 'لا توجد سجلات حضور', 'No attendance rows were returned for this account.': 'لم تُعرض سجلات حضور لهذا الحساب.',
    'Locked': 'مقفل', 'Settlement eligible': 'مؤهل للتسوية', 'Reservation': 'الحجز', 'Checked in': 'تم تسجيل الحضور',
    'staff-assisted audit': 'تسجيل بمساعدة الموظف', 'repeat use noted': 'تمت الإشارة إلى تكرار الاستخدام', 'Verify member code': 'تحقق من رمز العضو',
    'Shared facility': 'المرفق المشترك', 'Loading shared facilities…': 'جارٍ تحميل المرافق المشتركة…',
    'Choose a shared facility': 'اختر مرفقاً مشتركاً', 'Create a shared facility record before adding sessions.': 'أنشئ سجل مرفق مشترك قبل إضافة الجلسات.',
    'New activities are saved as drafts and must be approved by an administrator before publishing.': 'تُحفظ الأنشطة الجديدة كمسودات، ويجب أن يعتمدها المدير قبل نشرها.',
    'Draft · awaiting administrator review': 'مسودة · بانتظار مراجعة المدير',
    'Saved as draft. An administrator must approve and publish the activity.': 'تم حفظ المسودة. يجب أن يعتمد المدير النشاط وينشره.',
    'Confirm': 'تأكيد', 'Mark no-show': 'تسجيل عدم الحضور', 'Dispute': 'اعتراض', 'Resolve: confirm': 'حل الاعتراض: تأكيد',
    'Resolve: void': 'حل الاعتراض: إلغاء', 'Accept request': 'قبول الطلب',
    'Manual check-in recorded by the server.': 'تم تسجيل الحضور اليدوي بواسطة الخادم.', 'Offering created.': 'تم إنشاء العرض.',
    'Audit history': 'سجل التدقيق', 'Record the reason for this decision': 'اذكر سبب هذا القرار', 'Dismiss': 'إغلاق', 'Recording…': 'جارٍ التسجيل…',
    'Record review': 'تسجيل المراجعة', 'Administrator action': 'إجراء إداري', 'Add partner record': 'إضافة سجل شريك',
    'Provide all three identifiers directly. No partner owner or group is inferred.': 'أدخل المعرّفات الثلاثة مباشرة. لا يتم استنتاج مالك الشريك أو مجموعته.',
    'Partner name': 'اسم الشريك', 'Group ID': 'معرّف المجموعة', 'Owner user ID': 'معرّف المستخدم المالك', 'Create partner': 'إنشاء شريك',
    'Partner ID': 'معرّف الشريك', 'Group': 'المجموعة', 'Approved': 'معتمد', 'Pending': 'قيد الانتظار',
    'Revoke approval': 'إلغاء الاعتماد', 'Approve partner': 'اعتماد الشريك', 'Partner record created.': 'تم إنشاء سجل الشريك.',
    'Partner operations': 'عمليات الشريك', 'Create an offering': 'إنشاء عرض', 'Offering title': 'عنوان العرض', 'Format': 'الصيغة', 'City': 'المدينة', 'Facility': 'المرفق', 'Category': 'الفئة', 'Access': 'نوع الوصول', 'In person': 'حضوري', 'Premium': 'مميز', 'Live online': 'مباشر عبر الإنترنت',
    'Online class details': 'تفاصيل الجلسة عبر الإنترنت', 'Provide translations for all three supported languages and a secure HTTPS access link.': 'أضف الترجمات باللغات الثلاث ورابط وصول آمن عبر HTTPS.',
    'Title · English': 'العنوان · الإنجليزية', 'Title · Iraqi Arabic': 'العنوان · العربية العراقية', 'Title · Sorani Kurdish': 'العنوان · الكردية السورانية', 'Description · English': 'الوصف · الإنجليزية',
    'Description · Iraqi Arabic': 'الوصف · العربية العراقية', 'Description · Sorani Kurdish': 'الوصف · الكردية السورانية', 'Starts at': 'وقت البدء', 'Ends at': 'وقت الانتهاء',
    'Cancellation deadline': 'آخر موعد للإلغاء', 'Waitlist offers expire after': 'تنتهي عروض قائمة الانتظار بعد', 'minutes.': 'دقيقة.', 'Gender access': 'إتاحة النوع الاجتماعي',
    'All': 'الجميع', 'Female': 'نساء', 'Male': 'رجال', 'Minimum age': 'الحد الأدنى للعمر', 'Maximum age (optional)': 'الحد الأقصى للعمر (اختياري)',
    'Membership tiers (comma separated)': 'فئات العضوية (افصل بينها بفاصلة)', 'Publish as active': 'نشر كعرض نشط', 'Create offering': 'إنشاء العرض',
    'Verify member check-in code': 'تحقق من رمز حضور العضو', 'The member must request this short-lived code from their own reservation. This verifies the code only; the server still enforces the attendance policy.': 'يطلب العضو هذا الرمز المؤقت من حجزه. يتحقق الرمز فقط؛ ويظل الخادم مسؤولاً عن تطبيق سياسة الحضور.',
    '8-digit member code': 'رمز العضو من 8 أرقام', 'Audit reason (at least 5 characters)': 'سبب التدقيق (5 أحرف على الأقل)', 'Verifying…': 'جارٍ التحقق…',
     'Verify and record arrival': 'تحقق وسجل الوصول', 'The server did not accept this code. It may be invalid, expired, or the attempt limit may have been reached. Ask the member to request a fresh code from their own reservation; staff cannot issue codes.': 'لم يقبل الخادم الرمز. قد يكون غير صالح أو منتهي الصلاحية أو تم بلوغ حد المحاولات. اطلب من العضو إصدار رمز جديد من حجزه؛ لا يمكن للموظفين إصدار الرموز.',
     'Booking model': 'نظام الحجز', 'Advance booking required': 'الحجز المسبق مطلوب', 'Open access · walk in': 'دخول مفتوح · دون حجز مسبق',
     'Resource booking': 'حجز مورد', 'Resource name · English': 'اسم المورد · الإنجليزية', 'Resource name · Iraqi Arabic': 'اسم المورد · العربية العراقية', 'Resource name · Sorani Kurdish': 'اسم المورد · الكردية السورانية',
     'Name the court, room, or other resource being reserved. Use the same English name for every time slot for that resource.': 'اكتب اسم الملعب أو الغرفة أو المورد المراد حجزه. استخدم الاسم الإنجليزي نفسه لكل موعد لهذا المورد.',
     'Each named resource accepts one booking at a time. Overlapping reservations for the same resource are blocked.': 'يقبل كل مورد محدد حجزاً واحداً في الوقت نفسه. تُمنع الحجوزات المتداخلة للمورد نفسه.',
     'Enter the resource name in English, Iraqi Arabic, and Sorani.': 'أدخل اسم المورد بالإنجليزية والعربية العراقية والكردية السورانية.',
     'Resource bookings are saved as drafts until check-in is configured and the activity is reviewed.': 'تُحفظ حجوزات الموارد كمسودات حتى إعداد تسجيل الحضور ومراجعة النشاط.',
     'Resource booking check-in': 'تسجيل حضور حجز المورد',
     'Resource:': 'المورد:',
     'One reservation': 'حجز واحد',
     'A walk-in or resource-booking in-person session is required.': 'يلزم اختيار نشاط حضوري للدخول المباشر أو لحجز مورد.',
     'This resource is already reserved for an overlapping time. Choose another time.': 'تم حجز هذا المورد في موعد متداخل. اختر موعداً آخر.',
     'Members can start a visit during the published access window without booking ahead. Set a check-in location and window before submitting this activity for review.': 'يمكن للأعضاء بدء الزيارة خلال فترة الدخول المنشورة دون حجز مسبق. حدّد موقع الحضور ووقته قبل إرسال النشاط للمراجعة.',
     'Maximum visits during this access window': 'الحد الأقصى للزيارات خلال فترة الدخول',
     'Members may cancel a walk-in reservation until the access window closes, but not after check-in begins.': 'يمكن للعضو إلغاء تسجيل الدخول حتى إغلاق فترة الدخول، لكن لا يمكن الإلغاء بعد بدء تسجيل الحضور.',
     'Open-access activities stay as drafts until check-in is configured and the activity is reviewed.': 'تبقى أنشطة الدخول المفتوح كمسودات حتى إعداد تسجيل الحضور ومراجعة النشاط.',
     'Update visit limit': 'تحديث حد الزيارات',
     'The published access window and check-in location stay fixed. Create a replacement activity to change those details.': 'تبقى فترة الدخول المنشورة وموقع تسجيل الحضور ثابتين. أنشئ نشاطاً بديلاً لتغيير هذه التفاصيل.',
     'Enter a whole-number visit limit of at least 1.': 'أدخل حداً للزيارات كرقم صحيح لا يقل عن 1.',
     'Walk-in visit limit saved.': 'تم حفظ حد الزيارات المباشرة.',
     'Walk-in access and check-in': 'الدخول المباشر وتسجيل الحضور',
     'Use the facility entrance coordinates. Members scan a single-use QR displayed by staff; location supports check-in, and partner confirmation records attendance.': 'استخدم إحداثيات مدخل المرفق. يمسح العضو رمز QR لمرة واحدة يعرضه الموظف؛ ويدعم الموقع التحقق من الوصول، بينما يؤكد الشريك تسجيل الحضور.',
     'Latitude': 'خط العرض', 'Longitude': 'خط الطول', 'Check-in radius · metres': 'نطاق تسجيل الحضور · متر',
     'Check-in opens at': 'يبدأ تسجيل الحضور في', 'Check-in closes at': 'ينتهي تسجيل الحضور في', 'Attendance corrections due by': 'آخر موعد لتصحيح الحضور',
    'Save check-in details': 'حفظ تفاصيل تسجيل الحضور', 'Check-in details saved. Members can start walk-in visits only during this window.': 'تم حفظ تفاصيل تسجيل الحضور. يمكن للأعضاء بدء الزيارة المباشرة خلال هذه الفترة فقط.',
    'Check-in details saved. Members can reserve and check in to this resource.': 'تم حفظ تفاصيل تسجيل الحضور. يمكن للأعضاء حجز هذا المورد وتسجيل حضورهم.',
     'Check-in details could not be saved. Verify the coordinates and access times, then try again.': 'تعذر حفظ تفاصيل تسجيل الحضور. تحقق من الإحداثيات والأوقات ثم حاول مجدداً.',
  },
  ku: {
    'English': 'ئینگلیزی', 'MAYDANGO · IRAQ': 'MaydanGo · عێراق',
    'MaydanGo support': 'پشتگیریی MaydanGo', 'Help & safety': 'یارمەتی و سەلامەتی', 'Support request': 'داواکاریی پشتگیری',
    'Loading…': 'باردەکرێت…', 'Support history could not be loaded.': 'نەتوانرا مێژووی پشتگیری باربکرێت.',
    'Send a support request or report a safety concern.': 'داواکاریی پشتگیری بنێرە یان کێشەیەکی سەلامەتی ڕاپۆرت بکە.',
    'Select a request to read the conversation and reply to MaydanGo support.': 'داواکارییەک هەڵبژێرە بۆ خوێندنەوەی گفتوگۆکە و وەڵامدانەوەی پشتگیریی MaydanGo.',
    'Loading conversation…': 'گفتوگۆکە بار دەکرێت…', 'Conversation could not be loaded.': 'نەتوانرا گفتوگۆکە باربکرێت.',
    'Your support conversation': 'گفتوگۆی پشتگیریت', 'You': 'تۆ',
    'Write a reply': 'وەڵامێک بنووسە', 'Send reply': 'وەڵام بنێرە', 'Reply sent.': 'وەڵامەکە نێردرا.',
    'Could not send the reply. Please try again.': 'نەتوانرا وەڵامەکە بنێردرێت. تکایە دووبارە هەوڵ بدە.',
    'Refresh conversation': 'گفتوگۆکە نوێ بکەرەوە',
    'Support topic': 'بابەتی پشتگیری', 'Booking question': 'پرسیاری حجز', 'Safety concern': 'کێشەی سەلامەتی', 'Other support': 'پشتگیریی تر',
    'Urgent safety concern': 'ڕاپۆرتی پەلەیی سەلامەتی',
    'Urgent safety reports are prioritized in the MaydanGo support queue. MaydanGo attempts push alerts for authorized support staff with notifications enabled, but delivery can fail; email backup is not connected. This form is not an emergency service; contact local emergency services if someone is in immediate danger.': 'ڕاپۆرتە عاجلەکانی سەلامەتی لە لیستی پشتگیریی MaydanGo پێشینەیان پێدەدرێت. MaydanGo هەوڵ دەدات ئاگادارکردنەوەی پەیام بۆ کارمەندانی ڕێگەپێدراوی پشتگیری کە ئاگادارکردنەوەیان چالاکە بنێرێت، بەڵام گەیشتنیان مسۆگەر نییە؛ جێگرەوەی ئیمەیڵ پەیوەست نەکراوە. ئەم فۆڕمە خزمەتگوزاریی فریاکەوتن نییە؛ ئەگەر مەترسییەکی دەستبەجێ هەیە، پەیوەندی بە خزمەتگوزارییەکانی فریاکەوتنی ناوخۆیی بکە.',
    'Subject': 'بابەت', 'Booking reference (optional)': 'ژمارەی حجز (ئارەزوومەندانە)', 'Describe what happened or how we can help': 'ڕوون بکەرەوە چی ڕوویدا یان چۆن دەتوانین یارمەتیت بدەین',
    'Use the reservation reference when available. Include only details needed to review the report.': 'ئەگەر بەردەست بوو ژمارەی حجز بەکاربهێنە. تەنها ئەو وردەکارییانە بنووسە کە بۆ پێداچوونەوەی ڕاپۆرتەکە پێویستن.',
    'Send to MaydanGo support': 'بۆ پشتگیریی MaydanGo بنێرە', 'Sending…': 'دەنێردرێت…', 'Support request sent.': 'داواکاریی پشتگیری نێردرا.',
    'Could not send the request. Please try again.': 'نەتوانرا داواکارییەکە بنێردرێت. تکایە دووبارە هەوڵ بدە.', 'Your recent support requests': 'داواکارییەکانی دوایی پشتگیریت',
    'No support requests yet.': 'هێشتا هیچ داواکارییەکی پشتگیری نییە.', 'Open': 'کراوە', 'In progress': 'لە پڕۆسەدایە', 'Waiting for you': 'چاوەڕێی وەڵامی تۆیە', 'Resolved': 'چارەسەر کرا', 'Closed': 'داخراوە',
    'session': 'وانە', 'event': 'چالاکی', 'coach': 'ڕاهێنان',
    'confirm': 'پشتڕاستکردنەوە', 'dispute': 'ناڕەزایی', 'accept request': 'داواکاری قبوڵ بکە', 'Reject request': 'داواکاری ڕەت بکەوە',
    'resolve confirm': 'چارەسەری ناڕەزایی: پشتڕاستکردنەوە', 'resolve void': 'چارەسەری ناڕەزایی: هەڵوەشاندنەوە',
    'void': 'هەڵوەشاندنەوە', 'lock': 'داخستن', 'locked': 'داخراوە', 'manual.checkin': 'تۆمارکردن بە یارمەتی کارمەند',
    'partner cancelled': 'لە لایەن هاوبەشەوە هەڵوەشێنراوەتەوە', 'offer accepted': 'ئۆفەرەکە قبوڵکرا', 'offer declined': 'ئۆفەرەکە ڕەتکرایەوە',
    'Audit history ·': 'مێژووی پشکنین ·', '— audit reason (at least 5 characters)': '— هۆکاری پشکنین (لانیکەم 5 پیت)',
    '· Group': '· گروپ',
    'Close form': 'فۆڕمەکە دابخە', 'Partner': 'هاوبەش', 'Choose a partner': 'هاوبەشێک هەڵبژێرە',
    'Session': 'وانە', 'Event': 'چالاکی', 'Coaching': 'ڕاهێنان',
    'Additional dates · YYYY-MM-DD, one per line': 'بەرواری زیادە · YYYY-MM-DD، هەر بەروارێک لە دێڕێکدا',
    'Skip dates or holidays · YYYY-MM-DD, one per line': 'بەروار یان پشوو بسڕەوە · YYYY-MM-DD، هەر بەروارێک لە دێڕێکدا',
    'Repeat until · inclusive': 'دووبارەبوونەوە تا · بەرواری کۆتایی لەخۆدەگرێت',
    'At': 'لە', 'local time · inclusive through': 'بە کاتی ناوخۆیی · تاخۆی لەخۆدەگرێت',
    'Conflict date:': 'بەرواری ناکۆک:',
    'Use tiers configured for your offering': 'ئاستەکانی ئەندامێتی دیاریکراو بۆ ئەم پێشکەشکراوە بەکاربهێنە',
    'Join URL (optional)': 'بەستەری بەشداری (ئارەزوومەندانە)',
    'Portal access is not enabled': 'دەستگەیشتن بە پۆرتاڵ چالاک نەکراوە',
    'Your MaydanGo account is signed in, but it does not have an approved partner or administrator role. No partner or attendance information is available for this account.': 'چوویتە ژوورەوەی هەژماری MaydanGo، بەڵام ئەم هەژمارە ڕۆڵی هاوبەش یان بەڕێوەبەری پەسەندکراوی نییە. هیچ زانیارییەک لەبارەی هاوبەش یان ئامادەبوون بۆ ئەم هەژمارە بەردەست نییە.',
    'Public website': 'ماڵپەڕی گشتی', 'Public MaydanGo site': 'ماڵپەڕی گشتیی MaydanGo',
    'Could not load operations': 'نەتوانرا بەڕێوەبردن باربکرێت',
    'The MaydanGo operations service did not respond. Your partner scope has not been loaded.': 'خزمەتگوزاریی بەڕێوەبردنی MaydanGo وەڵامی نەدایەوە و سنووری هاوبەشەکەت بارنەکرا.',
    'Try again': 'دووبارە هەوڵ بدە', 'Portal navigation': 'گەڕان لە پۆرتاڵ',
    'Sign out': 'چوونەدەرەوە', 'Finance desk': 'بەشی دارایی', 'Exit': 'دەرچوون',
    'Dismiss notice': 'ئاگادارکردنەوە دابخە', 'Of': 'لە', 'server-listed offerings': 'پێشکەشکراوە تۆمارکراوەکانی سێرڤەر',
    'Partner activity': 'چالاکیی هاوبەش', 'roster records': 'تۆمارەکانی ئامادەبوون',
    'Partner:': 'هاوبەش:', 'Review reason': 'هۆکاری پێداچوونەوە',
    'Describe the correction or provide the requested details.': 'چاکسازییەکە ڕوون بکەرەوە یان وردەکاریی داواکراو بنووسە.',
    'Required for corrections, rejection, or archiving.': 'بۆ چاکسازی، ڕەتکردنەوە یان ئەرشیفکردن پێویستە.',
    'Close': 'داخستن', 'No offerings returned': 'هیچ پێشکەشکراوێک نەگەڕایەوە',
    'Create an offering to start managing your available sessions and events.': 'پێشکەشکراوێک دروست بکە بۆ دەستپێکردنی بەڕێوەبردنی وانە و چالاکییە بەردەستەکانت.',
    'Retry': 'دووبارە هەوڵ بدە', 'Refresh': 'نوێکردنەوە',
    'MaydanGo partner operations': 'بەڕێوەبردنی هاوبەشەکانی MaydanGo', 'Iraq local time': 'کاتی ناوخۆیی عێراق',
    'Sunday': 'یەکشەممە', 'Monday': 'دووشەممە', 'Tuesday': 'سێشەممە', 'Wednesday': 'چوارشەممە',
    'Thursday': 'پێنجشەممە', 'Friday': 'هەینی', 'Saturday': 'شەممە',
    'could not be completed. The server did not accept the change.': 'تەواو نەکرا؛ سێرڤەر گۆڕانکارییەکەی قبوڵ نەکرد.',
    'Partner review': 'پێداچوونەوەی هاوبەش', 'Offering update': 'نوێکردنەوەی پێشکەشکراو', 'Activity submission': 'ناردنی چالاکی',
    'Correction response': 'وەڵامی چاکسازی',
    'Cancellation': 'هەڵوەشاندنەوە', 'Attendance review': 'پێداچوونەوەی ئامادەبوون',
    'Add valid session start, end, and cancellation times. The end must be after the start.': 'کاتی دروستی دەستپێک، کۆتایی و کۆتا کاتی هەڵوەشاندنەوە بنووسە. کاتی کۆتایی دەبێت دوای دەستپێک بێت.',
    'Choose a shared facility record before creating this offering.': 'پێش دروستکردنی ئەم پێشکەشکراوە تۆماری شوێنێکی هاوبەش هەڵبژێرە.',
    'Live online offerings need a title and description in English, Iraqi Arabic, and Sorani.': 'پێشکەشکراوی ئۆنلاین پێویستی بە ناونیشان و وەسف بە ئینگلیزی، عەرەبی عێراقی و کوردیی سۆرانی هەیە.',
    'Live online offerings require a secure HTTPS join URL.': 'پێشکەشکراوی ئۆنلاین پێویستی بە بەستەری پارێزراوی HTTPS هەیە.',
    'Enter a response of at least five characters.': 'وەڵامێک بنووسە کە لانیکەم پێنج پیت بێت.',
    'Choose a different administrator decision.': 'بڕیارێکی جیاوازی بەڕێوەبەر هەڵبژێرە.',
    'Enter a start, end, and cancellation deadline.': 'کاتی دەستپێک، کۆتایی و کۆتا کاتی هەڵوەشاندنەوە بنووسە.',
    'Offering schedule saved.': 'خشتەی پێشکەشکراو پاشەکەوت کرا.',
    'Attendance review recorded.': 'پێداچوونەوەی ئامادەبوون تۆمارکرا.',
    'Booking request rejected.': 'داواکاریی حجز ڕەتکرایەوە و ئەندام ئاگادار کرایەوە.',
    'Select a partner before creating this offering.': 'پێش دروستکردنی ئەم پێشکەشکراوە هاوبەشێک هەڵبژێرە.',
    'Choose a valid first session date.': 'بەروارێکی دروست بۆ یەکەمین وانە هەڵبژێرە.',
    'Choose an inclusive repeat-until date.': 'بەرواری کۆتایی دووبارەبوونەوە هەڵبژێرە کە ئەو ڕۆژەش لەخۆبگرێت.',
    'The repeat-until date must be on or after the first session date.': 'بەرواری کۆتایی دووبارەبوونەوە دەبێت لە یەکەمین وانە یان دوای ئەوە بێت.',
    'The repeat-until date must be within 90 calendar days of the first session.': 'بەرواری کۆتایی دووبارەبوونەوە دەبێت لە 90 ڕۆژی ساڵنامەیی یەکەمین وانەدا بێت.',
    'Use valid dates within the schedule range.': 'بەرواری دروست لە ناو مەودای خشتەکەدا بەکاربهێنە.',
    'Choose a daily interval from 1 to 30 days.': 'ماوەیەکی ڕۆژانە لە 1 تا 30 ڕۆژ هەڵبژێرە.',
    'Choose at least one weekday for the recurring sessions.': 'لانیکەم ڕۆژێکی هەفتە بۆ وانە دووبارەبووەکان هەڵبژێرە.',
    'Choose a custom interval from 1 to 12 weeks.': 'ماوەیەکی تایبەت لە 1 تا 12 هەفتە هەڵبژێرە.',
    'Add no more than 89 dates; the first date is included automatically.': 'زۆرترین 89 بەروار زیاد بکە؛ بەرواری یەکەم خۆکارانە زیاد دەکرێت.',
    'This schedule creates more than 90 occurrences. Choose fewer dates or an earlier end date.': 'ئەم خشتەیە زیاتر لە 90 وانە دروست دەکات. بەرواری کەمتر یان کۆتایییەکی زووتر هەڵبژێرە.',
    'No sessions match the selected weekdays and date range.': 'هیچ وانەیەک لەگەڵ ڕۆژەکانی هەفتە و مەودای بەرواری هەڵبژێردراو ناگونجێت.',
    'This schedule conflicts with an existing offering. Adjust the dates or weekdays and try again.': 'ئەم خشتەیە لەگەڵ پێشکەشکراوێکی تر ناکۆکە. بەروار یان ڕۆژەکانی هەفتە بگۆڕە و دووبارە هەوڵ بدە.',
    'The offering could not be saved. Check the details and try again.': 'پێشکەشکراوەکە پاشەکەوت نەکرا. وردەکارییەکان بپشکنە و دووبارە هەوڵ بدە.',
    'reserved': 'حجزکراو', 'requested': 'داواکراو', 'admin cancelled': 'لە لایەن بەڕێوەبەرەوە هەڵوەشێنراوەتەوە',
    'no show': 'ئامادە نەبوو', 'waiting': 'چاوەڕوانە',
    'offered': 'ئۆفەر کراوە', 'accepted': 'قبوڵکراو', 'expired': 'بەسەرچوو',
    'Waiting-list position': 'ڕیزی لیستی چاوەڕوانی', 'remaining': 'ماوە',
    'Operations desk': 'میزی بەڕێوەبردن', 'Partner workspace': 'شوێنی کاری هاوبەش',
    'Review the partner and offering records returned for your administrator account.': 'تۆمارەکانی هاوبەش و پێشکەشکراو بۆ هەژماری بەڕێوەبەرت بپشکنە.',
    'Partner access': 'دەستگەیشتنی هاوبەش', 'Administrator access': 'دەستگەیشتنی بەڕێوەبەر', 'Workspace': 'شوێنی کار', 'Server-scoped access': 'دەستگەیشتن بە سنووری سێرڤەر',
    'Your MaydanGo space': 'شوێنی تۆ لە MaydanGo', 'A clear view of partner activity and attendance.': 'بینینێکی ڕوون بۆ چالاکی و ئامادەبوونی هاوبەش.',
    'Bring your sessions and community into view.': 'وانە و کۆمەڵگەکەت لە یەک شوێن بەڕێوەببە.', 'Manage the live opportunities and attendance roster assigned to your partner account.': 'دەرفەتە بەردەستەکان و تۆماری ئامادەبوونی پەیوەست بە هەژماری هاوبەشەکەت بەڕێوەببە.',
    'Active offerings': 'پێشکەشکراوە چالاکەکان', 'Manage offerings': 'بەڕێوەبردنی پێشکەشکراوەکان', 'Next on the roster': 'داهاتوو لە تۆماری ئامادەبوون',
    'Attendance records in your server scope': 'تۆمارەکانی ئامادەبوون لە سنووری سێرڤەر', 'View all': 'هەمووی ببینە', 'Roster unavailable · Retry': 'تۆمار بەردەست نییە · دووبارە هەوڵ بدە',
    'No attendance records were returned for this scope.': 'هیچ تۆمارێکی ئامادەبوون بۆ ئەم سنوورە نەگەڕایەوە.', 'Scoped by the server': 'سنوورەکە لەلایەن سێرڤەرەوە دیاریکراوە',
    'Your account role and partner boundary come from the operations service. Actions are checked again by MaydanGo when saved.': 'ڕۆڵی هەژمار و سنووری هاوبەش لە خزمەتگوزاریی بەڕێوەبردنەوە دێت. MaydanGo لە کاتی پاشەکەوتکردندا دووبارە پشتڕاستی دەکاتەوە.',
    'Administrator': 'بەڕێوەبەر', 'Partner operator': 'بەڕێوەبەری هاوبەش', 'Create and maintain opportunities from the authorized operations record.': 'دەرفەتەکان لە تۆماری ڕێگەپێدراوی بەڕێوەبردن دروست و بەڕێوەببە.',
    'New offering': 'پێشکەشکراوی نوێ', 'Cancelled': 'هەڵوەشێنراوەتەوە', 'Active': 'چالاک', 'Draft': 'ڕەشنووس',
    'Submitted': 'نێردراوە بۆ پێداچوونەوە', 'Under review': 'لەژێر پێداچوونەوەدایە', 'Changes requested': 'داوای چاکسازی کراوە', 'Published': 'بڵاوکراوەتەوە', 'Rejected': 'ڕەتکراوەتەوە', 'Archived': 'ئەرشیف کراوە', 'Pending activity review': 'پێداچوونەوەی چالاکی چاوەڕوانە',
    'Submit for review': 'بینێرە بۆ پێداچوونەوە', 'Awaiting review': 'چاوەڕوانی پێداچوونەوە', 'Administrator decision': 'بڕیاری بەڕێوەبەر', 'Decision reason': 'هۆکاری بڕیار',
    'Save decision': 'بڕیار پاشەکەوت بکە', 'Partner response': 'وەڵامی هاوبەش', 'Respond and resubmit': 'وەڵام بدەوە و دووبارە بینێرە', 'Latest partner response': 'دوایین وەڵامی هاوبەش',
    'Choose a decision': 'بڕیارێک هەڵبژێرە', 'A reason is required for this decision.': 'هۆکارێک بۆ ئەم بڕیارە پێویستە.',
    'Create a recurring schedule': 'خشتەیەکی دووبارەبوو دروست بکە', 'Each occurrence becomes a separate bookable session. Dates and times use Iraq time.': 'هەر جارێک وانەیەکی جیاواز و حجزکراوە. بەروار و کات بە کاتی عێراقە.',
    'Repeat pattern': 'شێوازی دووبارەبوونەوە', 'Daily': 'ڕۆژانە', 'Weekly': 'هەفتانە', 'Custom interval': 'ماوەی تایبەت', 'Selected dates': 'بەروارە هەڵبژێردراوەکان',
    'Repeat on': 'دووبارە بکەرەوە لە', 'Selected-date preview': 'پێشبینینی بەروارە هەڵبژێردراوەکان', 'Baghdad-time preview': 'پێشبینین بە کاتی بەغدا',
    'The first session date is included automatically.': 'بەرواری یەکەمین وانە خۆکارانە زیاد دەکرێت.',
    'Up to 90 calendar days and no more than 90 occurrences.': 'تا 90 ڕۆژی ساڵنامەیی و زۆرترین 90 جار.',
    'Some session dates overlap existing offerings. Review the highlighted dates and try again.': 'هەندێک بەرواری وانە لەگەڵ پێشکەشکراوەکانی تر دەکەوێتە سەر یەک. بەروارە نیشان‌کراوەکان بپشکنە و دووبارە هەوڵ بدە.',
    'Future series cancellation results.': 'ئەنجامی هەڵوەشاندنەوەی وانە داهاتووەکان.',
    'Cancelled dates:': 'بەروارە هەڵوەشاوەکان:',
    'No future sessions were cancelled.': 'هیچ وانەیەکی داهاتوو هەڵنەوەشایەوە.',
    'Left unchanged because of bookings or attendance:': 'بەهۆی حجز یان ئامادەبوونەوە بە بێ گۆڕان مایەوە:',
    'Edit session': 'دەستکاریی وانە', 'Edit future series': 'دەستکاریی زنجیرەی داهاتوو', 'Recurring series': 'زنجیرەی دووبارەبوو',
    'Cancel session': 'وانە هەڵبوەشێنەوە', 'Cancel future series': 'زنجیرەی داهاتوو هەڵبوەشێنەوە',
    'Changes apply to this and all remaining future sessions. Reservations stay attached to their sessions. A session with an attendance record cannot have its date changed. Moving the selected date shifts the remaining dates by the same amount.': 'گۆڕانکارییەکان بۆ ئەم وانە و هەموو وانە داهاتووەکان جێبەجێ دەبن. حجزەکان بە هەمان وانەوە دەمێننەوە. بەرواری وانەیەک کە تۆماری ئامادەبوونی هەیە ناگۆڕدرێت. گۆڕینی بەرواری وانەی دیاریکراو بەروارەکانی داهاتوو بە هەمان بڕ دەگوازێتەوە.',
    'Make draft': 'بیکە بە ڕەشنووس', 'Activate': 'چالاکی بکە', 'Cancel': 'هەڵوەشاندنەوە', 'Capacity': 'توانا', 'Save': 'پاشەکەوت',
    'Activity setting': 'شوێنی چالاکی', 'Choose a setting': 'شوێنی چالاکی هەڵبژێرە', 'Indoors': 'لەناوەوە', 'Outdoors': 'لەدەرەوە',
    'Waitlist offer window (minutes)': 'ماوەی ئۆفەری لیستی چاوەڕوانی (خولەک)', 'Save offer window': 'ماوەی ئۆفەر پاشەکەوت بکە', 'Waitlist and offers': 'لیستی چاوەڕوانی و ئۆفەرەکان',
    'Loading waitlist…': 'لیستی چاوەڕوانی بار دەکرێت…', 'Waitlist unavailable. No member account details are shown.': 'لیستی چاوەڕوانی بەردەست نییە. وردەکاریی هەژماری ئەندامان نیشان نادرێت.',
    'No waitlist entries have been recorded.': 'هیچ تۆمارێک لە لیستی چاوەڕوانی نییە.', 'View the live queue for your upcoming offerings. The server shares queue order and timing only; member identities stay private in this view.': 'ڕیزی چاوەڕوانیی پێشکەشکراوە داهاتووەکان ببینە. سێرڤەر تەنها ڕیز و کات پیشان دەدات؛ ناسنامەی ئەندامان تایبەت دەمێنێتەوە.',
    'Joined': 'بەشداری کرد', 'Position': 'ڕیز', 'No one is waiting': 'کەس چاوەڕوان نییە',
    'Active queues for your upcoming offerings will appear here.': 'ڕیزە چالاکەکانی پێشکەشکراوە داهاتووەکان لێرە دەردەکەون.',
    'Review reservations in the server-scoped roster. Member names are not returned or displayed; each decision requires a reason and is recorded by the service.': 'حجزەکان لە تۆماری سنوورداری سێرڤەر بپشکنە. ناوی ئەندامان نیشان نادرێت؛ هەر بڕیارێک هۆکار و تۆمارکردنی خزمەتگوزاری دەوێت.',
    'Attendance roster unavailable': 'تۆماری ئامادەبوون بەردەست نییە', 'Roster is clear': 'تۆماری ئامادەبوون پاکە', 'No attendance rows were returned for this account.': 'هیچ تۆمارێکی ئامادەبوون بۆ ئەم هەژمارە نەگەڕایەوە.',
    'Locked': 'داخراوە', 'Settlement eligible': 'شایستەی یەکلاکردنەوە', 'Reservation': 'حجز', 'Checked in': 'ئامادەبوون تۆمارکرا',
    'staff-assisted audit': 'تۆمارکردن بە یارمەتی کارمەند', 'repeat use noted': 'دووبارە بەکارهێنان تۆمارکرا', 'Verify member code': 'کۆدی ئەندام پشتڕاست بکەرەوە',
    'Shared facility': 'شوێنی هاوبەش', 'Loading shared facilities…': 'شوێنە هاوبەشەکان بار دەکرێن…',
    'Choose a shared facility': 'شوێنێکی هاوبەش هەڵبژێرە', 'Create a shared facility record before adding sessions.': 'پێش زیادکردنی وانەکان، تۆماری شوێنی هاوبەش دروست بکە.',
    'New activities are saved as drafts and must be approved by an administrator before publishing.': 'چالاکییە نوێیەکان وەک ڕەشنووس پاشەکەوت دەکرێن و پێش بڵاوکردنەوە دەبێت لەلایەن بەڕێوەبەرەوە پەسەند بکرێن.',
    'Draft · awaiting administrator review': 'ڕەشنووس · چاوەڕێی پێداچوونەوەی بەڕێوەبەر',
    'Saved as draft. An administrator must approve and publish the activity.': 'ڕەشنووس پاشەکەوت کرا. بەڕێوەبەر دەبێت چالاکییەکە پەسەند و بڵاوی بکاتەوە.',
    'Confirm': 'پشتڕاستکردنەوە', 'Mark no-show': 'تۆمارکردنی ئامادەنەبوون', 'Dispute': 'ناڕەزایی', 'Resolve: confirm': 'چارەسەری ناڕەزایی: پشتڕاستکردنەوە',
    'Resolve: void': 'چارەسەری ناڕەزایی: هەڵوەشاندنەوە', 'Accept request': 'داواکاری قبوڵ بکە',
    'Manual check-in recorded by the server.': 'تۆماری دەستیی ئامادەبوون لەلایەن سێرڤەرەوە کرایەوە.', 'Offering created.': 'پێشکەشکراو دروستکرا.',
    'not checked in': 'ئامادەبوون تۆمار نەکراوە', 'confirmed': 'پشتڕاستکراوە', 'pending': 'لە چاوەڕوانیدایە', 'disputed': 'مشتومڕی لەسەرە',
    'Audit history': 'مێژووی پشکنین', 'Record the reason for this decision': 'هۆکاری ئەم بڕیارە بنووسە', 'Dismiss': 'داخستن', 'Recording…': 'تۆمار دەکرێت…',
    'Record review': 'پێداچوونەوە تۆمار بکە', 'Administrator action': 'کرداری بەڕێوەبەر', 'Add partner record': 'تۆماری هاوبەش زیاد بکە',
    'Provide all three identifiers directly. No partner owner or group is inferred.': 'هەر سێ ناسێنەرەکە ڕاستەوخۆ بنووسە. خاوەن یان گروپی هاوبەش پێشبینی ناکرێت.',
    'Partner name': 'ناوی هاوبەش', 'Group ID': 'ناسێنەری گروپ', 'Owner user ID': 'ناسێنەری بەکارهێنەری خاوەن', 'Create partner': 'هاوبەش دروست بکە',
    'Partner ID': 'ناسێنەری هاوبەش', 'Group': 'گروپ', 'Approved': 'پەسەندکراوە', 'Pending': 'لە چاوەڕوانیدایە',
    'Revoke approval': 'پەسەندکردن هەڵبوەشێنەوە', 'Approve partner': 'هاوبەش پەسەند بکە', 'Partner record created.': 'تۆماری هاوبەش دروستکرا.',
    'Partner operations': 'بەڕێوەبردنی هاوبەش', 'Create an offering': 'پێشکەشکراوێک دروست بکە', 'Offering title': 'ناونیشانی پێشکەشکراو', 'Format': 'شێواز', 'City': 'شار', 'Facility': 'شوێن', 'Category': 'جۆر', 'Access': 'جۆری دەستگەیشتن', 'In person': 'ڕووبەڕوو', 'Premium': 'تایبەت', 'Live online': 'ئۆنلاین بە ڕاستەوخۆ',
    'Online class details': 'وردەکاریی وانەی ئۆنلاین', 'Provide translations for all three supported languages and a secure HTTPS access link.': 'وەرگێڕان بۆ هەموو سێ زمانەکە و بەستەری پارێزراوی HTTPS دابین بکە.',
    'Title · English': 'ناونیشان · ئینگلیزی', 'Title · Iraqi Arabic': 'ناونیشان · عەرەبی عێراقی', 'Title · Sorani Kurdish': 'ناونیشان · کوردیی سۆرانی', 'Description · English': 'وەسف · ئینگلیزی',
    'Description · Iraqi Arabic': 'وەسف · عەرەبی عێراقی', 'Description · Sorani Kurdish': 'وەسف · کوردیی سۆرانی', 'Starts at': 'کاتی دەستپێک', 'Ends at': 'کاتی کۆتایی',
    'Cancellation deadline': 'کۆتا کاتی هەڵوەشاندنەوە', 'Waitlist offers expire after': 'ئۆفەری لیستی چاوەڕوانی بەسەر دەچێت دوای', 'minutes.': 'خولەک.', 'Gender access': 'دەستگەیشتنی ڕەگەز',
    'All': 'هەمووان', 'Female': 'ئافرەت', 'Male': 'پیاو', 'Minimum age': 'کەمترین تەمەن', 'Maximum age (optional)': 'زۆرترین تەمەن (ئارەزوومەندانە)',
    'Membership tiers (comma separated)': 'ئاستەکانی ئەندامێتی (بە کۆما جیا بکەرەوە)', 'Publish as active': 'وەک چالاک بڵاو بکەرەوە', 'Create offering': 'پێشکەشکراو دروست بکە',
    'Verify member check-in code': 'کۆدی ئامادەبوونی ئەندام پشتڕاست بکەرەوە', 'The member must request this short-lived code from their own reservation. This verifies the code only; the server still enforces the attendance policy.': 'ئەندام دەبێت ئەم کۆدە کورت‌ماوەیە لە حجزەکەی خۆی داوا بکات. تەنها کۆدەکە پشتڕاست دەکاتەوە؛ سێرڤەر هێشتا ڕێسای ئامادەبوون جێبەجێ دەکات.',
    '8-digit member code': 'کۆدی 8 ژمارەیی ئەندام', 'Audit reason (at least 5 characters)': 'هۆکاری پشکنین (لانیکەم 5 پیت)', 'Verifying…': 'پشتڕاست دەکرێتەوە…',
    'Verify and record arrival': 'پشتڕاستی بکەرەوە و گەیشتن تۆمار بکە', 'The server did not accept this code. It may be invalid, expired, or the attempt limit may have been reached. Ask the member to request a fresh code from their own reservation; staff cannot issue codes.': 'سێرڤەر کۆدەکەی قبوڵ نەکرد. لەوانەیە هەڵە، بەسەرچوو یان ژمارەی هەوڵ تەواو بووبێت. داوا لە ئەندام بکە کۆدی نوێ لە حجزەکەی خۆی وەربگرێت؛ کارمەند ناتوانێت کۆد دابین بکات.',
    'Booking model': 'مۆدێلی حجز', 'Advance booking required': 'حجزی پێشوەختە پێویستە', 'Open access · walk in': 'چوونەژوورەوەی کراوە · بێ حجزی پێشوەختە',
    'Resource booking': 'حجزکردنی سەرچاوە', 'Resource name · English': 'ناوی سەرچاوە · ئینگلیزی', 'Resource name · Iraqi Arabic': 'ناوی سەرچاوە · عەرەبیی عێراقی', 'Resource name · Sorani Kurdish': 'ناوی سەرچاوە · کوردیی سۆرانی',
    'Name the court, room, or other resource being reserved. Use the same English name for every time slot for that resource.': 'ناوی یاریگا، ژوور یان سەرچاوەی حجزکراو بنووسە. بۆ هەموو کاتەکانی هەمان سەرچاوە هەمان ناوی ئینگلیزی بەکاربهێنە.',
    'Each named resource accepts one booking at a time. Overlapping reservations for the same resource are blocked.': 'هەر سەرچاوەیەکی ناونراو لە هەر کاتێکدا تەنها یەک حجز وەردەگرێت. حجزە هاوکاتەکانی هەمان سەرچاوە ڕێگرییان لێ دەکرێت.',
    'Enter the resource name in English, Iraqi Arabic, and Sorani.': 'ناوی سەرچاوە بە ئینگلیزی، عەرەبیی عێراقی و سۆرانی بنووسە.',
    'Resource bookings are saved as drafts until check-in is configured and the activity is reviewed.': 'حجزەکانی سەرچاوە وەک ڕەشنووس پاشەکەوت دەکرێن تا پشکنینی گەیشتن ڕێکبخرێت و چالاکییەکە پێداچوونەوەی بۆ بکرێت.',
    'Resource booking check-in': 'پشکنینی گەیشتن بۆ حجزکردنی سەرچاوە',
    'Resource:': 'سەرچاوە:',
    'One reservation': 'یەک حجز',
    'A walk-in or resource-booking in-person session is required.': 'پێویستە چالاکییەکە بۆ چوونەژوورەوەی ڕاستەوخۆ یان حجزکردنی سەرچاوەیەکی ڕاستەوخۆ بێت.',
    'This resource is already reserved for an overlapping time. Choose another time.': 'ئەم سەرچاوەیە لە کاتێکی هاوکاتدا حجزکراوە. کاتێکی تر هەڵبژێرە.',
    'Members can start a visit during the published access window without booking ahead. Set a check-in location and window before submitting this activity for review.': 'ئەندامان دەتوانن لە ماوەی چوونەژوورەوەی بڵاوکراوەدا بێ حجزی پێشوەختە سەردانێک دەست پێبکەن. پێش ناردنی چالاکییەکە بۆ پێداچوونەوە، شوێن و کاتی پشکنینی گەیشتن دیاری بکە.',
    'Maximum visits during this access window': 'زۆرترین ژمارەی سەردان لەم ماوەیەدا',
    'Members may cancel a walk-in reservation until the access window closes, but not after check-in begins.': 'ئەندام دەتوانێت حجزەی چوونەژوورەوە هەڵبوەشێنێتەوە تا ماوەکە دادەخرێت، بەڵام دوای دەستپێکردنی پشکنینی گەیشتن نا.',
    'Open-access activities stay as drafts until check-in is configured and the activity is reviewed.': 'چالاکییەکانی چوونەژوورەوەی کراوە وەک ڕەشنووس دەمێننەوە تا پشکنینی گەیشتن ڕێکبخرێت و چالاکییەکە پێداچوونەوەی بۆ بکرێت.',
    'Update visit limit': 'نوێکردنەوەی سنووری سەردان',
    'The published access window and check-in location stay fixed. Create a replacement activity to change those details.': 'ماوەی بڵاوکراوە و شوێنی پشکنینی گەیشتن ناگۆڕێن. بۆ گۆڕینی ئەم وردەکارییانە چالاکییەکی جێگرەوە دروست بکە.',
    'Enter a whole-number visit limit of at least 1.': 'سنووری سەردان بە ژمارەیەکی تەواو و لانیکەم 1 بنووسە.',
    'Walk-in visit limit saved.': 'سنووری سەردانی ڕاستەوخۆ پاشەکەوت کرا.',
    'Walk-in access and check-in': 'چوونەژوورەوەی ڕاستەوخۆ و پشکنینی گەیشتن',
    'Use the facility entrance coordinates. Members scan a single-use QR displayed by staff; location supports check-in, and partner confirmation records attendance.': 'ئایندینەکانی دەروازەی شوێنەکە بەکاربهێنە. ئەندامان QRی یەکجار بەکارهێنان کە کارمەند پیشانی دەدات دەسکانن؛ شوێن پشتگیری پشکنینی گەیشتن دەکات و پشتڕاستکردنەوەی هاوبەش ئامادەبوون تۆمار دەکات.',
    'Latitude': 'هێڵی پانی', 'Longitude': 'هێڵی درێژی', 'Check-in radius · metres': 'مەودای پشکنینی گەیشتن · مەتر',
    'Check-in opens at': 'پشکنینی گەیشتن لەم کاتەوە دەست پێدەکات', 'Check-in closes at': 'پشکنینی گەیشتن لەم کاتەدا دادەخرێت', 'Attendance corrections due by': 'کۆتا کاتی ڕاستکردنەوەی ئامادەبوون',
    'Save check-in details': 'زانیاریی پشکنینی گەیشتن پاشەکەوت بکە', 'Check-in details saved. Members can start walk-in visits only during this window.': 'زانیاریی پشکنینی گەیشتن پاشەکەوت کرا. ئەندامان تەنها لەم ماوەیەدا دەتوانن سەردانی ڕاستەوخۆ دەست پێبکەن.',
    'Check-in details saved. Members can reserve and check in to this resource.': 'زانیاریی پشکنینی گەیشتن پاشەکەوت کرا. ئەندامان دەتوانن ئەم سەرچاوەیە حجز بکەن و گەیشتنیان تۆمار بکەن.',
    'Check-in details could not be saved. Verify the coordinates and access times, then try again.': 'نەتوانرا زانیاریی پشکنینی گەیشتن پاشەکەوت بکرێت. ئایندین و کاتەکان بپشکنە و دووبارە هەوڵ بدە.',
  },
};
function portalText(lang: PortalLanguage, value: string): string {
  const trimmed = value.trim();
  const translated = getPartnerPortalCopy(lang, trimmed)
    ?? (lang === 'en' ? trimmed : localizedPhrases[lang][trimmed]);
  if (!translated) return value;
  const start = value.indexOf(trimmed);
  return `${value.slice(0, start)}${translated}${value.slice(start + trimmed.length)}`;
}
function LocalizedContent({ lang, children }: { lang: PortalLanguage; children: ReactNode }) {
  return <>{Children.map(children, child => {
    if (typeof child === 'string') return portalText(lang, child);
    if (isValidElement<{ children?: ReactNode }>(child)) {
      const localizedProps = Object.fromEntries(Object.entries(child.props).map(([key, value]) =>
        [key, typeof value === 'string' ? portalText(lang, value) : value]));
      return cloneElement(child, { ...localizedProps, children: <LocalizedContent lang={lang}>{child.props.children}</LocalizedContent> });
    }
    return child;
  })}</>;
}

function fieldClass() {
  return 'mt-1 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3.5 py-2.5 text-sm text-[#173d35] placeholder:text-[#8b9288] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15';
}
function LabelField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-[#51665e]">{label}{children}</label>;
}
function Button({ children, onClick, kind = 'primary', disabled = false, type = 'button' }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'quiet' | 'danger'; disabled?: boolean; type?: 'button' | 'submit' }) {
  const style = kind === 'primary' ? 'bg-[#174d43] text-[#fff9e9] hover:bg-[#226556]' : kind === 'danger' ? 'border border-[#d9a89a] bg-[#fff5f1] text-[#9a4435] hover:bg-[#ffe8e0]' : 'border border-[#d8d2c4] bg-transparent text-[#36564b] hover:bg-[#f1eddf]';
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${style}`}>{children}</button>;
}

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dateOnlyFromLocalInput = (value: string) => value.slice(0, 10);
const shiftCalendarDate = (date: string, amount: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
};
const calendarDay = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
};
const dateLabelBaghdad = (date: string, lang: PortalLanguage = savedPortalLanguage()) => new Intl.DateTimeFormat(portalDateLocale(lang), { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Baghdad', numberingSystem: 'latn' }).format(new Date(`${date}T12:00:00+03:00`));
const dateTimeInputBaghdad = (value: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const dateList = (value: string) => [...new Set(value.split(/[,\u060c\s]+/).map(item => item.trim()).filter(Boolean))].sort();
const validCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

function OfferingForm({ partnerId, partners, isAdmin, lang, onClose, onSaved }: { partnerId: string; partners: { id: string; name: string }[]; isAdmin: boolean; lang: PortalLanguage; onClose: () => void; onSaved: () => void }) {
  const add = useAddLiveOffering();
  const addRecurring = useCreateRecurringOfferings();
  const requestImageUpload = useRequestOfferingImageUploadUrl();
  const facilitiesQuery = useGetOperationFacilities({ query: { enabled: true, queryKey: getGetOperationFacilitiesQueryKey() } });
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RecurringScheduleMode>('weekly');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [repeatInterval, setRepeatInterval] = useState('1');
  const [bulkDates, setBulkDates] = useState('');
  const [excludedDates, setExcludedDates] = useState('');
  const [conflictingDates, setConflictingDates] = useState<string[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState(partnerId);
  const [form, setForm] = useState({
    title: '', kind: 'session' as OfferingInput['kind'], bookingModel: 'booking_required' as NonNullable<OfferingInput['bookingModel']>, facilityProfileId: '', city: '', facility: '', category: '', accessType: 'physical' as OfferingInput['accessType'],
    environment: '', startsAt: '', endsAt: '', cancellationDeadline: '', bookingCutoffMinutes: '0', capacity: '', waitlistOfferMinutes: '30', gender: 'all' as NonNullable<OfferingInput['gender']>, minAge: '', maxAge: '', joinUrl: '', tiers: '', instructions: '', active: false,
    localizedTitleEn: '', localizedTitleAr: '', localizedTitleKu: '',
    localizedDescriptionEn: '', localizedDescriptionAr: '', localizedDescriptionKu: '',
    localizedInstructorEn: '', localizedInstructorAr: '', localizedInstructorKu: '',
    difficultyLevel: 'all-levels' as NonNullable<OfferingInput['difficultyLevel']>,
    instructionLanguage: 'mixed' as NonNullable<OfferingInput['instructionLanguage']>,
    requiredEquipmentEn: '', requiredEquipmentAr: '', requiredEquipmentKu: '',
    resourceNameEn: '', resourceNameAr: '', resourceNameKu: '',
  });
  const facilityRecords = (facilitiesQuery.data ?? []).filter(item => item.partnerId === selectedPartnerId);
  const selectedFacility = facilityRecords.find(item => item.id === form.facilityProfileId);
  const update = (key: keyof typeof form, value: string | boolean) => {
    setForm(current => ({ ...current, [key]: value }));
    setConflictingDates([]);
  };
  const firstDate = dateOnlyFromLocalInput(form.startsAt);
  const maxRepeatDate = firstDate ? shiftCalendarDate(firstDate, 90) : '';
  const previewDates = useMemo(() => {
    if (!firstDate || !repeatUntil || !validCalendarDate(firstDate) || !validCalendarDate(repeatUntil) || repeatUntil < firstDate) return [];
    const excluded = new Set(dateList(excludedDates));
    if (repeatMode === 'dates') {
      return [...new Set([firstDate, ...dateList(bulkDates)])]
        .filter(date => validCalendarDate(date) && date >= firstDate && date <= repeatUntil && !excluded.has(date))
        .sort()
        .slice(0, 91);
    }
    const dates: string[] = [];
    const interval = Number(repeatInterval);
    const firstSunday = shiftCalendarDate(firstDate, -calendarDay(firstDate));
    for (let current = firstDate; current <= repeatUntil && dates.length <= 90; current = shiftCalendarDate(current, 1)) {
      const dayOffset = Math.round((Date.parse(`${current}T12:00:00Z`) - Date.parse(`${firstDate}T12:00:00Z`)) / 86_400_000);
      const weekOffset = Math.floor((Date.parse(`${current}T12:00:00Z`) - Date.parse(`${firstSunday}T12:00:00Z`)) / (7 * 86_400_000));
      const matches = repeatMode === 'daily'
        ? dayOffset % interval === 0
        : weekdays.includes(calendarDay(current)) && (repeatMode === 'weekly' || weekOffset % interval === 0);
      if (matches && !excluded.has(current)) dates.push(current);
    }
    return dates;
  }, [firstDate, repeatUntil, repeatMode, repeatInterval, weekdays, bulkDates, excludedDates]);
  const repeatDaySpan = firstDate && repeatUntil ? Math.round((Date.parse(`${repeatUntil}T12:00:00Z`) - Date.parse(`${firstDate}T12:00:00Z`)) / 86400000) : 0;
  const additionalDateList = dateList(bulkDates);
  const exclusionDateList = dateList(excludedDates);
  const invalidDateList = [...additionalDateList, ...exclusionDateList].some(date =>
    !validCalendarDate(date) || date < firstDate || date > repeatUntil);
  const recurrenceIssue = recurring
    ? !firstDate || !validCalendarDate(firstDate) ? 'Choose a valid first session date.'
      : !repeatUntil ? 'Choose an inclusive repeat-until date.'
        : repeatUntil < firstDate ? 'The repeat-until date must be on or after the first session date.'
          : repeatDaySpan > 90 ? 'The repeat-until date must be within 90 calendar days of the first session.'
            : invalidDateList ? 'Use valid dates within the schedule range.'
              : repeatMode === 'daily' && (!Number.isInteger(Number(repeatInterval)) || Number(repeatInterval) < 1 || Number(repeatInterval) > 30) ? 'Choose a daily interval from 1 to 30 days.'
                : (repeatMode === 'weekly' || repeatMode === 'custom') && !weekdays.length ? 'Choose at least one weekday for the recurring sessions.'
                  : repeatMode === 'custom' && (!Number.isInteger(Number(repeatInterval)) || Number(repeatInterval) < 1 || Number(repeatInterval) > 12) ? 'Choose a custom interval from 1 to 12 weeks.'
                    : repeatMode === 'dates' && additionalDateList.length > 89 ? 'Add no more than 89 dates; the first date is included automatically.'
                      : previewDates.length > 90 ? 'This schedule creates more than 90 occurrences. Choose fewer dates or an earlier end date.'
              : previewDates.length === 0 ? 'No sessions match the selected weekdays and date range.'
                : '' : '';
  const pending = add.isPending || addRecurring.isPending || requestImageUpload.isPending || uploadingImage;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setConflictingDates([]);
    if (pending) return;
    if (!form.startsAt || !form.endsAt || (form.bookingModel !== 'open_access' && !form.cancellationDeadline) || Date.parse(`${form.endsAt}:00+03:00`) <= Date.parse(`${form.startsAt}:00+03:00`)) {
      setMessage('Add valid session start, end, and cancellation times. The end must be after the start.');
      return;
    }
    if (recurring && recurrenceIssue) { setMessage(recurrenceIssue); return; }
    if (!selectedPartnerId) { setMessage('Select a partner before creating this offering.'); return; }
    if (!selectedFacility) { setMessage('Choose a shared facility record before creating this offering.'); return; }
    if (!selectedFacility.activities.length) { setMessage('Add at least one activity to the facility profile before creating an offering.'); return; }
    const isLive = form.accessType === 'live';
    if (!isLive && form.environment !== 'indoor' && form.environment !== 'outdoor') { setMessage('Choose whether this in-person activity is indoors or outdoors.'); return; }
    if (isLive && [form.localizedTitleEn, form.localizedTitleAr, form.localizedTitleKu, form.localizedDescriptionEn, form.localizedDescriptionAr, form.localizedDescriptionKu, form.localizedInstructorEn, form.localizedInstructorAr, form.localizedInstructorKu, form.requiredEquipmentEn, form.requiredEquipmentAr, form.requiredEquipmentKu].some(value => !value.trim())) {
      setMessage('Live online offerings need a title, description, instructor name, and equipment details in English, Iraqi Arabic, and Sorani.');
      return;
    }
    if (isLive && !/^https:\/\//i.test(form.joinUrl.trim())) {
      setMessage('Live online offerings require a secure HTTPS join URL.');
      return;
    }
    if (form.bookingModel === 'resource_booking'
      && [form.resourceNameEn, form.resourceNameAr, form.resourceNameKu].some(value => !value.trim())) {
      setMessage('Enter the resource name in English, Iraqi Arabic, and Sorani.');
      return;
    }
    if (selectedImage && (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedImage.type) || selectedImage.size > 10 * 1024 * 1024)) {
      setMessage('Choose a JPEG, PNG, or WebP image no larger than 10 MB.');
      return;
    }
    let imagePath: string | null = null;
    if (selectedImage) {
      setUploadingImage(true);
      try {
        const upload = await requestImageUpload.mutateAsync({
          data: {
            partnerId: selectedPartnerId,
            uploadId: crypto.randomUUID(),
            contentType: selectedImage.type as 'image/jpeg' | 'image/png' | 'image/webp',
            size: selectedImage.size,
          },
        });
        const uploaded = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': selectedImage.type },
          body: selectedImage,
        });
        if (!uploaded.ok) throw new Error('Activity image upload failed.');
        imagePath = upload.imagePath;
      } catch {
        setMessage('The image could not be uploaded. Check the file and try again.');
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }
    const data: OfferingInput = {
      partnerId: selectedPartnerId, title: form.title.trim(), kind: form.kind, city: selectedFacility.city, facility: selectedFacility.facility, category: form.category.trim(),
      accessType: form.accessType, environment: isLive ? null : form.environment as 'indoor' | 'outdoor', tiers: splitLocalizedCommaList(form.tiers),
      ...(form.kind === 'session' && !isLive ? { bookingModel: form.bookingModel } : {}),
      ...(form.bookingModel === 'resource_booking' ? {
        resourceName: { en: form.resourceNameEn.trim(), ar: form.resourceNameAr.trim(), ku: form.resourceNameKu.trim() },
      } : {}),
      startsAt: localIso(form.startsAt), endsAt: localIso(form.endsAt),
      cancellationDeadline: localIso(form.bookingModel === 'open_access' ? form.endsAt : form.cancellationDeadline),
      bookingCutoffMinutes: Number(form.bookingCutoffMinutes), instructions: form.instructions.trim() || null,
      imagePath,
      capacity: form.bookingModel === 'resource_booking' ? 1 : Number(form.capacity), waitlistOfferMinutes: Number(form.waitlistOfferMinutes),
      gender: form.gender, ...(form.minAge ? { minAge: Number(form.minAge) } : {}), maxAge: form.maxAge ? Number(form.maxAge) : null,
      joinUrl: form.joinUrl.trim() || null, active: isAdmin && form.active,
      ...(isLive ? {
        localizedTitle: { en: form.localizedTitleEn.trim(), ar: form.localizedTitleAr.trim(), ku: form.localizedTitleKu.trim() },
        localizedDescription: { en: form.localizedDescriptionEn.trim(), ar: form.localizedDescriptionAr.trim(), ku: form.localizedDescriptionKu.trim() },
        localizedInstructor: { en: form.localizedInstructorEn.trim(), ar: form.localizedInstructorAr.trim(), ku: form.localizedInstructorKu.trim() },
        difficultyLevel: form.difficultyLevel,
        instructionLanguage: form.instructionLanguage,
        requiredEquipment: { en: form.requiredEquipmentEn.trim(), ar: form.requiredEquipmentAr.trim(), ku: form.requiredEquipmentKu.trim() },
      } : {}),
    };
    const onSuccess = () => { onSaved(); onClose(); };
    const onError = (error: unknown) => {
      const candidate = error as { status?: number; response?: { status?: number }; message?: string; data?: unknown };
      const status = candidate?.status ?? candidate?.response?.status;
      const errorData = candidate?.data && typeof candidate.data === 'object'
        ? candidate.data as { conflictingDates?: unknown }
        : undefined;
      const dates = Array.isArray(errorData?.conflictingDates)
        ? [...new Set(errorData.conflictingDates.filter((date): date is string => typeof date === 'string' && validCalendarDate(date)))].sort()
        : [];
      if (status === 409 && dates.length) {
        setConflictingDates(dates);
        setMessage('');
        return;
      }
      setMessage(status === 409
        ? 'This schedule conflicts with an existing offering. Adjust the dates or weekdays and try again.'
        : candidate?.message || 'The offering could not be saved. Check the details and try again.');
    };
    if (recurring) {
      const recurringData: RecurringOfferingsInput = {
        template: { ...data },
        schedule: {
          mode: repeatMode,
          repeatUntil,
          interval: Number(repeatInterval),
          ...((repeatMode === 'weekly' || repeatMode === 'custom') ? { weekdays: [...weekdays].sort((a, b) => a - b) } : {}),
          ...(repeatMode === 'dates' ? { dates: additionalDateList } : {}),
          ...(exclusionDateList.length ? { excludedDates: exclusionDateList } : {}),
        },
      };
      addRecurring.mutate({ data: recurringData }, { onSuccess, onError });
    } else {
      add.mutate({ data }, { onSuccess, onError });
    }
  };
  const dateInput = (key: 'startsAt' | 'endsAt' | 'cancellationDeadline', label: string) => <LabelField label={label}><input required type="datetime-local" className={fieldClass()} value={form[key]} onChange={e => update(key, e.target.value)} /></LabelField>;
  return <LocalizedContent lang={lang}><div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102e27]/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="offering-form-title" className="max-h-[94dvh] w-full overflow-y-auto rounded-t-[1.8rem] bg-[#f8f5eb] p-5 shadow-2xl sm:max-w-3xl sm:rounded-[1.8rem] sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#a76445]">Partner operations</p><h2 id="offering-form-title" className="mt-2 font-display text-2xl font-bold text-[#173d35]">Create an offering</h2></div><button onClick={onClose} aria-label="Close form" className="rounded-full p-2 hover:bg-[#ebe6d8]"><X size={19} /></button></div>
      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        {isAdmin && <LabelField label="Partner"><select required className={fieldClass()} value={selectedPartnerId} onChange={e => { setSelectedPartnerId(e.target.value); setForm(current => ({ ...current, facilityProfileId: '', city: '', facility: '' })); setMessage(''); setConflictingDates([]); }}><option value="">Choose a partner</option>{partners.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></LabelField>}
        <LabelField label="Offering title"><input required maxLength={160} className={fieldClass()} value={form.title} onChange={e => update('title', e.target.value)} /></LabelField>
        <LabelField label="Format"><select data-testid="select-offering-kind" className={fieldClass()} value={form.kind} onChange={e => {
          const kind = e.target.value as OfferingInput['kind'];
          setForm(current => ({ ...current, kind, ...(kind !== 'session' ? { bookingModel: 'booking_required' } : {}) }));
          if (kind !== 'session') { setRecurring(false); setWeekdays([]); setRepeatUntil(''); }
        }}><option value="session">Session</option><option value="event">Event</option><option value="coach">Coaching</option></select></LabelField>
        <LabelField label="Shared facility"><select required className={fieldClass()} value={form.facilityProfileId} disabled={facilitiesQuery.isLoading || !facilityRecords.length} onChange={e => {
          const next = facilityRecords.find(item => item.id === e.target.value);
          setForm(current => ({ ...current, facilityProfileId: e.target.value, city: next?.city ?? '', facility: next?.facility ?? '', category: next?.activities[0]?.en ?? '' }));
        }}><option value="">{facilitiesQuery.isLoading ? 'Loading shared facilities…' : 'Choose a shared facility'}</option>{facilityRecords.map(item => <option key={item.id} value={item.id}>{item.localizedName[lang] || item.facility} · {item.city}</option>)}</select>{!facilitiesQuery.isLoading && facilityRecords.length === 0 && <span className="mt-1 block text-[11px] font-normal text-[#9a4435]">Create a shared facility record before adding sessions.</span>}{selectedFacility && <span className="mt-1 block text-[11px] font-normal text-[#75847c]">{selectedFacility.localizedAddress[lang]}</span>}</LabelField>
        <LabelField label="Approved activity category">{selectedFacility?.activities.length ? <select required className={fieldClass()} value={form.category} onChange={e => update('category', e.target.value)}><option value="">Choose a facility activity</option>{selectedFacility.activities.map(activity => <option key={activity.en} value={activity.en}>{activity[lang] || activity.en}</option>)}</select> : <p className="rounded-xl bg-[#f2dfd5] px-3 py-2 text-xs leading-5 text-[#9a4435]">Add activity categories to this facility profile before creating an offering.</p>}</LabelField>
        <LabelField label="Access"><select className={fieldClass()} value={form.accessType} onChange={e => {
          const accessType = e.target.value as OfferingInput['accessType'];
          setForm(current => ({ ...current, accessType, ...(accessType === 'live' && ['open_access', 'resource_booking'].includes(current.bookingModel) ? { bookingModel: 'booking_required' } : {}) }));
          if (accessType === 'live') { setRecurring(false); setWeekdays([]); setRepeatUntil(''); }
          setMessage(''); setConflictingDates([]);
        }}><option value="physical">In person</option><option value="premium">Premium</option><option value="live">Live online</option></select></LabelField>
        {form.accessType !== 'live' && <LabelField label={portalText(lang, 'Activity setting')}><select required className={fieldClass()} value={form.environment} onChange={e => update('environment', e.target.value)}><option value="">{portalText(lang, 'Choose a setting')}</option><option value="indoor">{portalText(lang, 'Indoors')}</option><option value="outdoor">{portalText(lang, 'Outdoors')}</option></select></LabelField>}
        {form.kind === 'session' && form.accessType !== 'live' && <LabelField label={portalText(lang, 'Booking model')}>
          <select className={fieldClass()} value={form.bookingModel} onChange={event => {
            const bookingModel = event.target.value as NonNullable<OfferingInput['bookingModel']>;
            setForm(current => ({ ...current, bookingModel, bookingCutoffMinutes: '0',
              active: ['open_access', 'resource_booking'].includes(bookingModel) ? false : current.active,
              ...(bookingModel === 'resource_booking' ? { capacity: '1' } : {}),
            }));
            if (['open_access', 'resource_booking'].includes(bookingModel)) { setRecurring(false); setWeekdays([]); setRepeatUntil(''); }
            setMessage(''); setConflictingDates([]);
          }}>
            <option value="booking_required">{portalText(lang, 'Advance booking required')}</option>
            <option value="open_access">{portalText(lang, 'Open access · walk in')}</option>
            <option value="resource_booking">{portalText(lang, 'Resource booking')}</option>
          </select>
        </LabelField>}
        {form.bookingModel === 'open_access' && <p className="rounded-xl border border-[#d8c6a5] bg-[#fff8e8] px-4 py-3 text-xs leading-5 text-[#715533] sm:col-span-2">{portalText(lang, 'Members can start a visit during the published access window without booking ahead. Set a check-in location and window before submitting this activity for review.')}</p>}
        {form.bookingModel === 'resource_booking' && <>
          <p className="rounded-xl border border-[#c8d8ca] bg-[#eef5ed] px-4 py-3 text-xs leading-5 text-[#36564b] sm:col-span-2">{portalText(lang, 'Name the court, room, or other resource being reserved. Use the same English name for every time slot for that resource.')}</p>
          <div className="grid gap-3 rounded-2xl border border-[#d8d2c4] bg-[#f2efe4] p-4 sm:col-span-2 sm:grid-cols-3">
            <LabelField label={portalText(lang, 'Resource name · English')}><input required maxLength={240} className={fieldClass()} value={form.resourceNameEn} onChange={e => update('resourceNameEn', e.target.value)} /></LabelField>
            <LabelField label={portalText(lang, 'Resource name · Iraqi Arabic')}><input required maxLength={240} dir="rtl" className={fieldClass()} value={form.resourceNameAr} onChange={e => update('resourceNameAr', e.target.value)} /></LabelField>
            <LabelField label={portalText(lang, 'Resource name · Sorani Kurdish')}><input required maxLength={240} dir="rtl" className={fieldClass()} value={form.resourceNameKu} onChange={e => update('resourceNameKu', e.target.value)} /></LabelField>
          </div>
          <p className="rounded-xl bg-[#f2efe4] px-4 py-3 text-xs leading-5 text-[#687a71] sm:col-span-2">{portalText(lang, 'Each named resource accepts one booking at a time. Overlapping reservations for the same resource are blocked.')}</p>
        </>}
        {form.accessType === 'live' && <div className="rounded-2xl border border-[#dbcbb1] bg-[#f2ebda] p-4 sm:col-span-2">
          <p className="text-sm font-bold text-[#36564b]">Online class details</p>
          <p className="mt-1 text-xs leading-5 text-[#687a71]">Provide translations for all three supported languages and a secure HTTPS access link.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <LabelField label="Title · English"><input required maxLength={240} className={fieldClass()} value={form.localizedTitleEn} onChange={e => update('localizedTitleEn', e.target.value)} /></LabelField>
            <LabelField label="Title · Iraqi Arabic"><input required maxLength={240} dir="rtl" className={fieldClass()} value={form.localizedTitleAr} onChange={e => update('localizedTitleAr', e.target.value)} /></LabelField>
            <LabelField label="Title · Sorani Kurdish"><input required maxLength={240} dir="rtl" className={fieldClass()} value={form.localizedTitleKu} onChange={e => update('localizedTitleKu', e.target.value)} /></LabelField>
            <LabelField label="Description · English"><textarea required maxLength={240} rows={3} className={fieldClass()} value={form.localizedDescriptionEn} onChange={e => update('localizedDescriptionEn', e.target.value)} /></LabelField>
            <LabelField label="Description · Iraqi Arabic"><textarea required maxLength={240} rows={3} dir="rtl" className={fieldClass()} value={form.localizedDescriptionAr} onChange={e => update('localizedDescriptionAr', e.target.value)} /></LabelField>
            <LabelField label="Description · Sorani Kurdish"><textarea required maxLength={240} rows={3} dir="rtl" className={fieldClass()} value={form.localizedDescriptionKu} onChange={e => update('localizedDescriptionKu', e.target.value)} /></LabelField>
            <LabelField label="Instructor name · English"><input required maxLength={240} className={fieldClass()} value={form.localizedInstructorEn} onChange={e => update('localizedInstructorEn', e.target.value)} /></LabelField>
            <LabelField label="Instructor name · Iraqi Arabic"><input required maxLength={240} dir="rtl" className={fieldClass()} value={form.localizedInstructorAr} onChange={e => update('localizedInstructorAr', e.target.value)} /></LabelField>
            <LabelField label="Instructor name · Sorani Kurdish"><input required maxLength={240} dir="rtl" className={fieldClass()} value={form.localizedInstructorKu} onChange={e => update('localizedInstructorKu', e.target.value)} /></LabelField>
            <LabelField label="Difficulty"><select className={fieldClass()} value={form.difficultyLevel} onChange={e => update('difficultyLevel', e.target.value)}><option value="all-levels">All levels</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></LabelField>
            <LabelField label="Class language"><select className={fieldClass()} value={form.instructionLanguage} onChange={e => update('instructionLanguage', e.target.value)}><option value="en">English</option><option value="ar">Iraqi Arabic</option><option value="ku">Sorani Kurdish</option><option value="mixed">Mixed</option></select></LabelField>
            <span className="hidden sm:block" />
            <LabelField label="Required equipment · English"><textarea required maxLength={240} rows={2} className={fieldClass()} value={form.requiredEquipmentEn} onChange={e => update('requiredEquipmentEn', e.target.value)} /></LabelField>
            <LabelField label="Required equipment · Iraqi Arabic"><textarea required maxLength={240} rows={2} dir="rtl" className={fieldClass()} value={form.requiredEquipmentAr} onChange={e => update('requiredEquipmentAr', e.target.value)} /></LabelField>
            <LabelField label="Required equipment · Sorani Kurdish"><textarea required maxLength={240} rows={2} dir="rtl" className={fieldClass()} value={form.requiredEquipmentKu} onChange={e => update('requiredEquipmentKu', e.target.value)} /></LabelField>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#687a71]">MaydanGo staff assign the instructor’s account access after approval. The name above is the member-facing display name.</p>
        </div>}
        {dateInput('startsAt', 'Starts at')}{dateInput('endsAt', 'Ends at')}{form.bookingModel === 'open_access'
          ? <p className="rounded-xl bg-[#f2efe4] px-4 py-3 text-xs leading-5 text-[#687a71]">{portalText(lang, 'Members may cancel a walk-in reservation until the access window closes, but not after check-in begins.')}</p>
          : dateInput('cancellationDeadline', 'Cancellation deadline')}
        {form.bookingModel !== 'open_access' && <LabelField label="Booking cutoff · minutes before start"><input required min="0" max="10080" step="15" type="number" className={fieldClass()} value={form.bookingCutoffMinutes} onChange={e => update('bookingCutoffMinutes', e.target.value)} /><span className="mt-1 block text-[11px] font-normal text-[#75847c]">Set 0 to allow booking until the activity starts.</span></LabelField>}
        <LabelField label="Participant instructions"><textarea maxLength={2000} rows={3} className={fieldClass()} value={form.instructions} onChange={e => update('instructions', e.target.value)} placeholder="Arrival, clothing, equipment, or preparation information" /></LabelField>
        <LabelField label="Activity image · JPEG, PNG, or WebP"><input type="file" accept="image/jpeg,image/png,image/webp" className={fieldClass()} onChange={e => setSelectedImage(e.target.files?.[0] ?? null)} /><span className="mt-1 block text-[11px] font-normal text-[#75847c]">Optional, up to 10 MB. Draft images stay private until the activity is published.</span>{selectedImage && <span className="mt-1 block text-[11px] font-semibold text-[#36564b]">{selectedImage.name}</span>}</LabelField>
         {form.kind === 'session' && !['open_access', 'resource_booking'].includes(form.bookingModel) && <div className="rounded-2xl border border-[#d8d2c4] bg-[#f2efe4] p-4 sm:col-span-2" data-testid="panel-recurring-schedule">
          <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-[#36564b]">
            <input data-testid="toggle-recurring-session" type="checkbox" checked={recurring} onChange={event => { setRecurring(event.target.checked); setMessage(''); setConflictingDates([]); }} className="mt-0.5 accent-[#174d43]" />
            <span><span className="block">Create a recurring schedule</span><span className="mt-1 block text-xs font-normal leading-5 text-[#75847c]">Each occurrence becomes a separate bookable session. Dates and times use Iraq time.</span></span>
          </label>
          {recurring && <div className="mt-4 space-y-4">
            <LabelField label="Repeat pattern"><select data-testid="select-repeat-mode" className={fieldClass()} value={repeatMode} onChange={event => { setRepeatMode(event.target.value as RecurringScheduleMode); setMessage(''); setConflictingDates([]); }}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="custom">Custom interval</option><option value="dates">Selected dates</option>
            </select></LabelField>
            {(repeatMode === 'daily' || repeatMode === 'custom') && <LabelField label={repeatMode === 'daily' ? 'Interval · days' : 'Interval · weeks'}>
              <input data-testid="input-repeat-interval" required type="number" min="1" max={repeatMode === 'daily' ? 30 : 12} className={fieldClass()} value={repeatInterval} onChange={event => { setRepeatInterval(event.target.value); setMessage(''); setConflictingDates([]); }} />
            </LabelField>}
            {(repeatMode === 'weekly' || repeatMode === 'custom') && <fieldset>
              <legend className="text-xs font-semibold text-[#51665e]">Repeat on</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {weekdayNames.map((day, index) => <label key={day} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${weekdays.includes(index) ? 'border-[#28695a] bg-[#e1ece5] text-[#174d43]' : 'border-[#d8d2c4] bg-[#fffdf7] text-[#687a71]'}`}>
                  <input data-testid={`weekday-${index}`} type="checkbox" checked={weekdays.includes(index)} onChange={event => { setWeekdays(current => event.target.checked ? [...current, index].sort((a, b) => a - b) : current.filter(value => value !== index)); setMessage(''); setConflictingDates([]); }} className="accent-[#174d43]" />
                  {day}
                </label>)}
              </div>
            </fieldset>}
            {repeatMode === 'dates' && <LabelField label="Additional dates · YYYY-MM-DD, one per line">
              <textarea data-testid="input-bulk-dates" rows={3} className={fieldClass()} value={bulkDates} onChange={event => { setBulkDates(event.target.value); setMessage(''); setConflictingDates([]); }} placeholder="2099-01-12&#10;2099-01-19" />
              <span className="mt-1 block text-[11px] font-normal text-[#75847c]">The first session date is included automatically.</span>
            </LabelField>}
            <LabelField label="Skip dates or holidays · YYYY-MM-DD, one per line">
              <textarea data-testid="input-excluded-dates" rows={2} className={fieldClass()} value={excludedDates} onChange={event => { setExcludedDates(event.target.value); setMessage(''); setConflictingDates([]); }} placeholder="2099-01-14" />
            </LabelField>
            <LabelField label="Repeat until · inclusive"><input data-testid="input-repeat-until" required={recurring} type="date" min={firstDate || undefined} max={maxRepeatDate || undefined} className={fieldClass()} value={repeatUntil} onChange={event => { setRepeatUntil(event.target.value); setMessage(''); setConflictingDates([]); }} /><span className="mt-1 block text-[11px] font-normal text-[#75847c]">Up to 90 calendar days and no more than 90 occurrences.</span></LabelField>
            {recurrenceIssue ? <p data-testid="status-recurring-validation" role="status" className="rounded-xl border border-[#e0c4b9] bg-[#fff7f3] px-3 py-2 text-xs leading-5 text-[#9a4435]">{recurrenceIssue}</p> : <div data-testid="status-recurring-preview" className="rounded-xl border border-[#cfddcf] bg-[#f8fbf4] p-3">
              <div className="flex items-baseline justify-between gap-3"><p className="text-xs font-bold text-[#36564b]">{repeatMode === 'dates' ? 'Selected-date preview' : 'Baghdad-time preview'}</p><p className="font-mono text-xs font-bold text-[#174d43]">{previewDates.length} {previewDates.length === 1 ? 'occurrence' : 'occurrences'}</p></div>
              <p className="mt-1 text-[11px] text-[#75847c]">{formatPartnerPortalSentence(lang, 'recurringPreview', { time: form.startsAt.slice(11) || '—', date: repeatUntil ? dateLabelBaghdad(repeatUntil, lang) : '—' })}</p>
              {conflictingDates.length > 0 && <p data-testid="status-conflicting-dates" role="alert" className="mt-2 rounded-lg bg-[#fff0e9] px-2.5 py-2 text-[11px] leading-5 text-[#9a4435]">Some session dates overlap existing offerings. Review the highlighted dates and try again.</p>}
              {previewDates.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{previewDates.map(date => {
                const isConflict = conflictingDates.includes(date);
                return <span key={date} data-testid={`preview-date-${date}`} data-conflict={isConflict ? 'true' : undefined} className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${isConflict ? 'bg-[#f6ddd3] text-[#9a4435] ring-1 ring-[#d89e8d]' : 'bg-[#e7eee4] text-[#36564b]'}`}>{isConflict && <span className="sr-only">Conflict date: </span>}{dateLabelBaghdad(date, lang)}</span>;
              })}</div>}
            </div>}
          </div>}
        </div>}
        {form.bookingModel === 'resource_booking'
          ? <p className="rounded-xl bg-[#f2efe4] px-4 py-3 text-xs leading-5 text-[#687a71]">{portalText(lang, 'One reservation')}</p>
          : <LabelField label={form.bookingModel === 'open_access' ? portalText(lang, 'Maximum visits during this access window') : 'Capacity'}><input required min="1" type="number" className={fieldClass()} value={form.capacity} onChange={e => update('capacity', e.target.value)} /></LabelField>}
        {!['open_access', 'resource_booking'].includes(form.bookingModel) && <LabelField label="Waitlist offer window (minutes)"><input required min="5" max="1440" type="number" className={fieldClass()} value={form.waitlistOfferMinutes} onChange={e => update('waitlistOfferMinutes', e.target.value)} /></LabelField>}
        <LabelField label="Gender access"><select className={fieldClass()} value={form.gender} onChange={e => update('gender', e.target.value)}><option value="all">All</option><option value="female">Female</option><option value="male">Male</option></select></LabelField>
        <LabelField label="Minimum age"><input type="number" min="0" className={fieldClass()} value={form.minAge} onChange={e => update('minAge', e.target.value)} /></LabelField>
        <LabelField label="Maximum age (optional)"><input type="number" min="0" className={fieldClass()} value={form.maxAge} onChange={e => update('maxAge', e.target.value)} /></LabelField>
        <LabelField label="Membership tiers (comma separated)"><input required placeholder="Use tiers configured for your offering" className={fieldClass()} value={form.tiers} onChange={e => update('tiers', e.target.value)} /></LabelField>
        <LabelField label="Join URL (optional)"><input type="url" className={fieldClass()} value={form.joinUrl} onChange={e => update('joinUrl', e.target.value)} /></LabelField>
        {isAdmin && !['open_access', 'resource_booking'].includes(form.bookingModel) ? <label className="flex items-center gap-3 rounded-xl bg-[#eeeadc] px-4 py-3 text-sm font-medium text-[#36564b] sm:col-span-2"><input type="checkbox" checked={form.active} onChange={e => update('active', e.target.checked)} className="accent-[#174d43]" />Publish as active</label>
          : <p className="rounded-xl bg-[#eeeadc] px-4 py-3 text-sm text-[#36564b] sm:col-span-2">{form.bookingModel === 'open_access'
            ? portalText(lang, 'Open-access activities stay as drafts until check-in is configured and the activity is reviewed.')
            : form.bookingModel === 'resource_booking'
              ? portalText(lang, 'Resource bookings are saved as drafts until check-in is configured and the activity is reviewed.')
            : 'New activities are saved as drafts. Submit them to apply this partner’s activity-review mode.'}</p>}
         {message && <p data-testid="status-offering-error" role="alert" className="text-sm text-[#a33d2e] sm:col-span-2">{message}</p>}
         <div className="flex justify-end gap-3 pt-2 sm:col-span-2"><Button kind="quiet" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending || Boolean(recurrenceIssue)}><Plus size={16} />{uploadingImage ? 'Uploading image…' : pending ? 'Saving…' : recurring ? 'Create recurring sessions' : 'Create offering'}</Button></div>
      </form>
    </section>
  </div></LocalizedContent>;
}

function OfferingCheckinPolicyForm({ item, lang }: { item: LiveOffering; lang: PortalLanguage }) {
  const client = useQueryClient();
  const savePolicy = useSetOfferingCheckinPolicy();
  const [values, setValues] = useState({
    latitude: '', longitude: '', radius: '150', opensAt: '', closesAt: '', correctionEndsAt: '',
  });
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    const policy = item.checkinPolicy ?? undefined;
    const correctionDefault = new Date(Date.parse(item.endsAt) + 24 * 60 * 60 * 1000).toISOString();
    setValues({
      latitude: policy ? String(policy.latitude) : '',
      longitude: policy ? String(policy.longitude) : '',
      radius: policy ? String(policy.radius) : '150',
      opensAt: dateTimeInputBaghdad(policy?.opensAt ?? item.startsAt),
      closesAt: dateTimeInputBaghdad(policy?.closesAt ?? item.endsAt),
      correctionEndsAt: dateTimeInputBaghdad(policy?.correctionEndsAt ?? correctionDefault),
    });
    setFeedback('');
  }, [item.id, item.startsAt, item.endsAt, item.checkinPolicy]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback('');
    const latitude = Number(values.latitude);
    const longitude = Number(values.longitude);
    const radius = Number(values.radius);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isInteger(radius)) {
      setFeedback(portalText(lang, 'Check-in details could not be saved. Verify the coordinates and access times, then try again.'));
      return;
    }
    const data: OfferingCheckinPolicyInput = {
      latitude, longitude, radius,
      opensAt: localIso(values.opensAt),
      closesAt: localIso(values.closesAt),
      correctionEndsAt: localIso(values.correctionEndsAt),
    };
    try {
      await savePolicy.mutateAsync({ id: item.id, data });
      await client.invalidateQueries({ queryKey: getGetOperationsQueryKey() });
      setFeedback(portalText(lang, item.bookingModel === 'resource_booking'
        ? 'Check-in details saved. Members can reserve and check in to this resource.'
        : 'Check-in details saved. Members can start walk-in visits only during this window.'));
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message
        : 'Check-in details could not be saved. Verify the coordinates and access times, then try again.';
      setFeedback(portalText(lang, message));
    }
  };

  return <LocalizedContent lang={lang}><form onSubmit={submit} className="mt-4 rounded-2xl border border-[#d8c6a5] bg-[#fff8e8] p-4">
    <h3 className="text-sm font-bold text-[#36564b]">{portalText(lang, item.bookingModel === 'resource_booking' ? 'Resource booking check-in' : 'Walk-in access and check-in')}</h3>
    <p className="mt-1 text-xs leading-5 text-[#687a71]">{portalText(lang, 'Use the facility entrance coordinates. Members scan a single-use QR displayed by staff; location supports check-in, and partner confirmation records attendance.')}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <LabelField label={portalText(lang, 'Latitude')}><input required type="number" min="-90" max="90" step="any" className={fieldClass()} value={values.latitude} onChange={event => setValues(current => ({ ...current, latitude: event.target.value }))} /></LabelField>
      <LabelField label={portalText(lang, 'Longitude')}><input required type="number" min="-180" max="180" step="any" className={fieldClass()} value={values.longitude} onChange={event => setValues(current => ({ ...current, longitude: event.target.value }))} /></LabelField>
      <LabelField label={portalText(lang, 'Check-in radius · metres')}><input required type="number" min="25" max="800" step="1" className={fieldClass()} value={values.radius} onChange={event => setValues(current => ({ ...current, radius: event.target.value }))} /></LabelField>
      <LabelField label={portalText(lang, 'Check-in opens at')}><input required type="datetime-local" className={fieldClass()} value={values.opensAt} onChange={event => setValues(current => ({ ...current, opensAt: event.target.value }))} /></LabelField>
      <LabelField label={portalText(lang, 'Check-in closes at')}><input required type="datetime-local" className={fieldClass()} value={values.closesAt} onChange={event => setValues(current => ({ ...current, closesAt: event.target.value }))} /></LabelField>
      <LabelField label={portalText(lang, 'Attendance corrections due by')}><input required type="datetime-local" className={fieldClass()} value={values.correctionEndsAt} onChange={event => setValues(current => ({ ...current, correctionEndsAt: event.target.value }))} /></LabelField>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={savePolicy.isPending}>{savePolicy.isPending ? portalText(lang, 'Saving…') : portalText(lang, 'Save check-in details')}</Button>
      {item.checkinPolicy && <span className="text-xs font-semibold text-[#315e42]">{portalText(lang, 'Check-in details saved.')}</span>}
    </div>
    {feedback && <p role="status" className="mt-3 rounded-xl bg-white/80 p-3 text-xs leading-5 text-[#36564b]">{feedback}</p>}
  </form></LocalizedContent>;
}

function ManualCheckinForm({ reservationId, lang, onClose, onSuccess }: { reservationId: string; lang: PortalLanguage; onClose: () => void; onSuccess: () => void }) {
  const recordCheckin = useRecordManualCheckin();
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const data: RecordManualCheckinBody = { code, reason: reason.trim() };
    recordCheckin.mutate({ id: reservationId, data }, {
      onSuccess: () => {
        setCode('');
        setReason('');
        onSuccess();
      },
      onError: () => {
        setCode('');
        setMessage('The server did not accept this code. It may be invalid, expired, or the attempt limit may have been reached. Ask the member to request a fresh code from their own reservation; staff cannot issue codes.');
      },
    });
  };
  return <LocalizedContent lang={lang}><form onSubmit={submit} className="mt-4 rounded-2xl border border-[#dbcbb1] bg-[#f2ebda] p-4">
    <p className="text-sm font-bold text-[#36564b]">Verify member check-in code</p>
    <p className="mt-1 text-xs leading-5 text-[#687a71]">The member must request this short-lived code from their own reservation. This verifies the code only; the server still enforces the attendance policy.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <LabelField label="8-digit member code"><input required autoComplete="off" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} className={fieldClass()} /></LabelField>
      <LabelField label="Audit reason (at least 5 characters)"><input required minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className={fieldClass()} /></LabelField>
    </div>
    {message && <p role="alert" className="mt-3 text-xs leading-5 text-[#9a4435]">{message}</p>}
    <div className="mt-3 flex justify-end gap-2"><Button kind="quiet" onClick={onClose}>Dismiss</Button><Button type="submit" disabled={recordCheckin.isPending || code.length !== 8 || reason.trim().length < 5}>{recordCheckin.isPending ? 'Verifying…' : 'Verify and record arrival'}</Button></div>
  </form></LocalizedContent>;
}

type PartnerSupportCategory = 'booking' | 'safety' | 'other';
const partnerSupportStatusLabels: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_member: 'Waiting for you',
  resolved: 'Resolved',
  closed: 'Closed',
};
function partnerSupportSubject(lang: PortalLanguage, subject: string) {
  if (subject.startsWith('Partner safety report: ')) {
    return `${portalText(lang, 'Safety concern')}: ${subject.slice('Partner safety report: '.length)}`;
  }
  if (subject.startsWith('Partner support: ')) {
    return `${portalText(lang, 'Support request')}: ${subject.slice('Partner support: '.length)}`;
  }
  return subject;
}

export function PartnerSupportPanel({
  lang,
  conductReportReference,
  onConductReportSent,
}: {
  lang: PortalLanguage;
  conductReportReference?: string;
  onConductReportSent?: () => void;
}) {
  const client = useQueryClient();
  const tickets = useGetMemberSupportTickets({ query: { retry: false } });
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const conversation = useGetMemberSupportTicket(selectedTicketId ?? '', {
    query: { enabled: !!selectedTicketId, retry: false, refetchInterval: 30_000 },
  });
  const ticketAttachments = useGetMemberSupportTicketAttachments(selectedTicketId ?? '', {
    query: { enabled: !!selectedTicketId, queryKey: getGetMemberSupportTicketAttachmentsQueryKey(selectedTicketId ?? ''), retry: false, refetchInterval: 30_000 },
  });
  const createTicket = useCreateMemberSupportTicket();
  const replyTicket = useReplyMemberSupportTicket();
  const [category, setCategory] = useState<PartnerSupportCategory>('booking');
  const [urgentSafety, setUrgentSafety] = useState(false);
  const [subject, setSubject] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyNotice, setReplyNotice] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState('');
  useEffect(() => {
    if (!conductReportReference) return;
    setCategory('safety');
    setSubject('Member conduct report');
    setReference(conductReportReference);
    setMessage('');
    setUrgentSafety(false);
  }, [conductReportReference]);
  const attachmentCopy = lang === 'ar'
    ? { add: 'إضافة صور أو ملفات', hint: 'حتى 3 ملفات، 10 ميغابايت لكل ملف. PDF أو JPEG أو PNG أو WebP.', limit: 'يمكن إرفاق 3 ملفات كحد أقصى بالرسالة الواحدة.', failed: 'أُرسل الطلب أو الرد، لكن تعذر رفع أحد الملفات. أرفقه مرة أخرى في رد جديد.', remove: 'إزالة الملف', download: 'تنزيل المرفق' }
    : lang === 'ku'
      ? { add: 'زیادکردنی وێنە یان فایل', hint: 'تا ٣ فایل، هەر یەکە ١٠ مێگابایت. PDF، JPEG، PNG یان WebP.', limit: 'تەنها تا ٣ فایل لە پەیامێکدا دەتوانرێت دابنرێت.', failed: 'داواکاری یان وەڵامەکە نێردرا، بەڵام فایلێک بار نەکرا. لە وەڵامێکی نوێدا دووبارە بیخە ناوەوە.', remove: 'سڕینەوەی فایل', download: 'داگرتنی هاوپێچ' }
      : { add: 'Add photos or files', hint: 'Up to 3 files, 10 MB each. PDF, JPEG, PNG, or WebP.', limit: 'Attach no more than 3 files to one message.', failed: 'The request or reply was sent, but a file did not upload. Add it again in a new reply.', remove: 'Remove file', download: 'Download attachment' };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const prefix = category === 'safety' ? 'Partner safety report: ' : 'Partner support: ';
    const referenceDetails = reference.trim() ? `Booking reference: ${reference.trim()}\n\n` : '';
    setNotice('');
    setAttachmentsBusy(true);
    try {
      const created = await createTicket.mutateAsync({
        data: {
          subject: `${prefix}${subject.trim()}`,
          category,
          urgent: urgentSafety,
          message: `Partner portal submission\n${referenceDetails}${message.trim()}`,
          language: lang,
        },
      });
      let attachmentFailed = false;
      if (attachmentFiles.length && created.messages[0]?.id) {
        try { await uploadMemberSupportAttachments(created.id, created.messages[0].id, attachmentFiles); }
        catch { attachmentFailed = true; }
      }
      await client.invalidateQueries({ queryKey: getGetMemberSupportTicketsQueryKey() });
      setSelectedTicketId(created.id);
      setCategory('booking');
      setUrgentSafety(false);
      setSubject('');
      setReference('');
      setMessage('');
      setAttachmentFiles([]);
      onConductReportSent?.();
      setNotice(attachmentFailed ? attachmentCopy.failed : 'Support request sent.');
    } catch {
      setNotice('Could not send the request. Please try again.');
    } finally {
      setAttachmentsBusy(false);
    }
  };

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    const ticketId = selectedTicketId;
    const body = replyText.trim();
    const ticketLanguage = conversation.data?.language;
    if (!ticketId || !body || !ticketLanguage) return;
    setReplyNotice('');
    setAttachmentsBusy(true);
    try {
      const updated = await replyTicket.mutateAsync({ id: ticketId, data: { message: body, language: ticketLanguage } });
      const lastMessage = updated.messages[updated.messages.length - 1];
      let attachmentFailed = false;
      if (replyFiles.length && lastMessage?.id) {
        try { await uploadMemberSupportAttachments(ticketId, lastMessage.id, replyFiles); }
        catch { attachmentFailed = true; }
      }
      client.setQueryData(getGetMemberSupportTicketQueryKey(ticketId), updated);
      await Promise.all([
        client.invalidateQueries({ queryKey: getGetMemberSupportTicketsQueryKey() }),
        client.invalidateQueries({ queryKey: getGetMemberSupportTicketAttachmentsQueryKey(ticketId) }),
      ]);
      setReplyText('');
      setReplyFiles([]);
      setReplyNotice(attachmentFailed ? attachmentCopy.failed : 'Reply sent.');
    } catch {
      setReplyNotice('Could not send the reply. Please try again.');
    } finally {
      setAttachmentsBusy(false);
    }
  };
  const downloadAttachment = async (attachmentId: string, fileName: string) => {
    if (!selectedTicketId) return;
    setDownloadingAttachmentId(attachmentId);
    try { await downloadMemberSupportFile(selectedTicketId, attachmentId, fileName); }
    catch { setReplyNotice('Attachment could not be downloaded.'); }
    finally { setDownloadingAttachmentId(''); }
  };

  return <LocalizedContent lang={lang}><section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
    <form onSubmit={submit} className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-7" data-testid="partner-support-form">
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a76445]">MaydanGo support</p>
      <h2 className="mt-2 font-display text-xl font-bold">Help & safety</h2>
      <p className="mt-2 text-sm leading-6 text-[#687a71]">Contact support, report member misconduct, or raise a safety concern. Include a booking reference when relevant.</p>
      <div className="mt-5 grid gap-4">
        <label className="block text-xs font-semibold text-[#51665e]">Support topic
          <select value={category} onChange={event => {
            const next = event.target.value as PartnerSupportCategory;
            setCategory(next);
            if (next !== 'safety') setUrgentSafety(false);
          }} className={fieldClass()} data-testid="select-partner-support-topic">
            <option value="booking">Booking question</option>
            <option value="safety">Safety or conduct report</option>
            <option value="other">Other support</option>
          </select>
        </label>
        {category === 'safety' && <div className="rounded-2xl border border-[#e5b8a6] bg-[#fff5f0] p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[#8f3f32]">
            <input type="checkbox" checked={urgentSafety} onChange={event => setUrgentSafety(event.target.checked)} className="h-4 w-4 accent-[#9a4435]" />
            Urgent safety concern
          </label>
          <p className="mt-2 text-xs leading-5 text-[#805d55]">{portalText(lang, 'Urgent safety reports are prioritized in the MaydanGo support queue. MaydanGo attempts push alerts for authorized support staff with notifications enabled, but delivery can fail; email backup is not connected. This form is not an emergency service; contact local emergency services if someone is in immediate danger.')}</p>
        </div>}
        <label className="block text-xs font-semibold text-[#51665e]">Subject
          <input required minLength={4} maxLength={90} value={subject} onChange={event => setSubject(event.target.value)} className={fieldClass()} data-testid="input-partner-support-subject" />
        </label>
        <label className="block text-xs font-semibold text-[#51665e]">Booking reference (optional)
          <input maxLength={100} value={reference} onChange={event => setReference(event.target.value)} className={fieldClass()} data-testid="input-partner-support-reference" />
        </label>
        <label className="block text-xs font-semibold text-[#51665e]">Describe what happened or how we can help
          <textarea required minLength={10} maxLength={4500} rows={5} value={message} onChange={event => setMessage(event.target.value)} className={`${fieldClass()} resize-y`} data-testid="textarea-partner-support-message" />
        </label>
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[#51665e]">{attachmentCopy.add}
            <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" data-testid="input-partner-support-attachments"
              onChange={event => {
                const chosen = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                if (attachmentFiles.length + chosen.length > 3) { setNotice(attachmentCopy.limit); return; }
                if (chosen.some(file => !supportAttachmentType(file) || file.size < 1 || file.size > 10 * 1024 * 1024)) {
                  setNotice(attachmentCopy.hint); return;
                }
                setAttachmentFiles(current => [...current, ...chosen]);
              }} className={`${fieldClass()} file:mr-3 file:rounded-full file:border-0 file:bg-[#e7eee4] file:px-3 file:py-1.5 file:text-xs file:font-bold`} />
          </label>
          <p className="text-[11px] leading-5 text-[#75847c]">{attachmentCopy.hint}</p>
          {attachmentFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#f2efe4] px-3 py-2 text-xs">
            <span className="truncate">{file.name}</span>
            <button type="button" aria-label={`${attachmentCopy.remove}: ${file.name}`} onClick={() => setAttachmentFiles(current => current.filter((_, itemIndex) => itemIndex !== index))} className="shrink-0 font-bold text-[#8f3f32]">{attachmentCopy.remove}</button>
          </div>)}
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[#75847c]">Use the reservation reference when available. Include only details needed to review the report.</p>
      {notice && <p role="status" className="mt-3 text-sm text-[#36564b]" data-testid="status-partner-support">{notice}</p>}
      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={createTicket.isPending || attachmentsBusy || subject.trim().length < 4 || message.trim().length < 10}>
          {createTicket.isPending || attachmentsBusy ? 'Sending…' : 'Send to MaydanGo support'}
        </Button>
      </div>
    </form>
    <div className="space-y-5">
      <section className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-7" aria-labelledby="partner-support-history">
        <h2 id="partner-support-history" className="font-display text-xl font-bold">Your recent support requests</h2>
        {tickets.isLoading ? <p className="mt-4 text-sm text-[#75847c]">Loading…</p>
          : tickets.isError ? <div role="alert" className="mt-4 rounded-xl bg-[#fff7f3] p-4 text-sm text-[#9a4435]">
            <p>Support history could not be loaded.</p>
            <button type="button" className="mt-2 font-bold" onClick={() => void tickets.refetch()}>Retry</button>
          </div>
          : tickets.data?.length ? <ul className="mt-4 divide-y divide-[#ece7d9]">
            {tickets.data.slice(0, 8).map(ticket => <li key={ticket.id} data-testid={`partner-support-ticket-${ticket.id}`}>
              <button type="button" aria-expanded={selectedTicketId === ticket.id}
                onClick={() => { setSelectedTicketId(selectedTicketId === ticket.id ? null : ticket.id); setReplyText(''); setReplyFiles([]); setReplyNotice(''); }}
                className={`flex w-full items-start justify-between gap-3 rounded-xl py-3 text-left ${selectedTicketId === ticket.id ? 'bg-[#f2ebda] px-3' : ''}`}>
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold text-[#36564b]">{partnerSupportSubject(lang, ticket.subject)}</span>
                  <span className="mt-1 block text-[10px] text-[#75847c]">{formatDate(ticket.lastMessageAt, lang)}</span>
                  {ticket.urgent && <span className="mt-1 inline-block rounded-full bg-[#9a4435] px-2 py-1 text-[10px] font-bold text-white">Urgent safety concern</span>}
                </span>
                <span className="shrink-0 rounded-full bg-[#e7eee4] px-2.5 py-1 text-[10px] font-bold text-[#36564b]">
                  {portalText(lang, partnerSupportStatusLabels[ticket.status] ?? ticket.status)}
                </span>
              </button>
            </li>)}
          </ul> : <p className="mt-4 text-sm text-[#75847c]">No support requests yet.</p>}
      </section>
      {selectedTicketId && <section className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-7" aria-labelledby="partner-support-conversation">
        <div className="flex items-center justify-between gap-3">
          <h2 id="partner-support-conversation" className="font-display text-xl font-bold">Your support conversation</h2>
          <button type="button" className="text-xs font-bold text-[#28695a]" onClick={() => void conversation.refetch()}>Refresh conversation</button>
        </div>
        {conversation.isLoading ? <p className="mt-4 text-sm text-[#75847c]">Loading conversation…</p>
          : conversation.isError || !conversation.data ? <div role="alert" className="mt-4 rounded-xl bg-[#fff7f3] p-4 text-sm text-[#9a4435]">
            <p>Conversation could not be loaded.</p>
            <button type="button" className="mt-2 font-bold" onClick={() => void conversation.refetch()}>Retry</button>
          </div> : <>
            <div className="mt-4 flex items-center gap-2">
              <span className="rounded-full bg-[#e7eee4] px-2.5 py-1 text-[10px] font-bold text-[#36564b]">
                {portalText(lang, partnerSupportStatusLabels[conversation.data.status] ?? conversation.data.status)}
              </span>
              {conversation.data.urgent && <span className="rounded-full bg-[#9a4435] px-2.5 py-1 text-[10px] font-bold text-white">Urgent safety concern</span>}
              <span className="text-xs text-[#75847c]">{partnerSupportSubject(lang, conversation.data.subject)}</span>
            </div>
            <ol className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-2xl bg-[#f7f4eb] p-3 sm:p-4" aria-live="polite">
              {conversation.data.messages.map(item => {
                const mine = item.authorRole === 'member';
                const messageFiles = ticketAttachments.data?.filter(file => file.messageId === item.id) ?? [];
                return <li key={item.id} className={`max-w-[92%] rounded-2xl p-3 ${mine ? 'ml-auto bg-[#e1efdf]' : 'mr-auto bg-white'}`}>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#36564b]">{item.message}</p>
                  <p className="mt-2 text-[10px] text-[#75847c]">{portalText(lang, mine ? 'You' : 'MaydanGo support')} · {formatDate(item.createdAt, lang)}</p>
                  {messageFiles.map(file => <button key={file.id} type="button" data-testid={`button-download-partner-support-attachment-${file.id}`} disabled={downloadingAttachmentId === file.id}
                    onClick={() => void downloadAttachment(file.id, file.fileName)} className="mt-2 block max-w-full truncate rounded-lg bg-white/70 px-2.5 py-1.5 text-start text-xs font-semibold text-[#28695a] disabled:opacity-50">
                    {attachmentCopy.download}: {file.fileName}
                  </button>)}
                </li>;
              })}
            </ol>
            <form onSubmit={sendReply} className="mt-4">
              <label className="block text-xs font-semibold text-[#51665e]">Write a reply
                <textarea required minLength={1} maxLength={5000} rows={3} value={replyText} onChange={event => setReplyText(event.target.value)}
                  className={`${fieldClass()} resize-y`} data-testid="textarea-partner-support-reply" />
              </label>
              <label className="mt-3 block text-xs font-semibold text-[#51665e]">{attachmentCopy.add}
                <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" data-testid="input-partner-support-reply-attachments"
                  onChange={event => {
                    const chosen = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = '';
                    if (replyFiles.length + chosen.length > 3) { setReplyNotice(attachmentCopy.limit); return; }
                    if (chosen.some(file => !supportAttachmentType(file) || file.size < 1 || file.size > 10 * 1024 * 1024)) {
                      setReplyNotice(attachmentCopy.hint); return;
                    }
                    setReplyFiles(current => [...current, ...chosen]);
                  }} className={`${fieldClass()} file:mr-3 file:rounded-full file:border-0 file:bg-[#e7eee4] file:px-3 file:py-1.5 file:text-xs file:font-bold`} />
              </label>
              <p className="mt-1 text-[11px] text-[#75847c]">{attachmentCopy.hint}</p>
              {replyFiles.map((file, index) => <div key={`${file.name}-${index}`} className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-[#f2efe4] px-3 py-2 text-xs">
                <span className="truncate">{file.name}</span>
                <button type="button" aria-label={`${attachmentCopy.remove}: ${file.name}`} onClick={() => setReplyFiles(current => current.filter((_, itemIndex) => itemIndex !== index))} className="shrink-0 font-bold text-[#8f3f32]">{attachmentCopy.remove}</button>
              </div>)}
              {replyNotice && <p role="status" className={`mt-2 text-sm ${replyNotice === 'Reply sent.' ? 'text-[#36564b]' : 'text-[#9a4435]'}`} data-testid="status-partner-support-reply">{replyNotice}</p>}
              <div className="mt-3 flex justify-end">
                <Button type="submit" disabled={replyTicket.isPending || attachmentsBusy || !replyText.trim()}>
                  {replyTicket.isPending || attachmentsBusy ? 'Sending…' : 'Send reply'}
                </Button>
              </div>
            </form>
          </>}
      </section>}
      {!selectedTicketId && <p className="text-xs leading-5 text-[#75847c]">Select a request to read the conversation and reply to MaydanGo support.</p>}
    </div>
  </section></LocalizedContent>;
}

function WaitlistPanel({ offeringId, lang }: { offeringId: string; lang: PortalLanguage }) {
  const [open, setOpen] = useState(false);
  const waitlist = useGetOfferingWaitlist(offeringId, { query: { enabled: open, refetchInterval: 30_000 } });
  return <LocalizedContent lang={lang}><section className="mt-5 border-t border-[#ece7d9] pt-4">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="flex w-full items-center justify-between gap-3 text-left text-sm font-bold text-[#28695a]">
      <span>Waitlist and offers</span>
      <span className="rounded-full bg-[#eeeadc] px-2.5 py-1 text-[10px] text-[#536b61]">{waitlist.data?.length ?? '—'}</span>
    </button>
    {open ? waitlist.isLoading ? <p className="mt-3 text-xs text-[#75847c]">Loading waitlist…</p>
      : waitlist.isError ? <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#fff7f3] p-3 text-xs text-[#9a4435]">
        <span>Waitlist unavailable. No member account details are shown.</span>
        <button type="button" onClick={() => void waitlist.refetch()} className="font-bold">Retry</button>
      </div>
      : waitlist.data?.length ? <ol className="mt-3 divide-y divide-[#ece7d9]">
        {waitlist.data.map(entry => <li key={entry.id} className="flex items-center justify-between gap-4 py-3">
          <div>
            <p className="text-xs font-bold text-[#36564b]">#{entry.queuePosition} · {entry.status.replaceAll('_', ' ')}</p>
            <p className="mt-1 text-[10px] text-[#75847c]">Joined {formatDate(entry.createdAt, lang)}{entry.offerExpiresAt ? ` · offer ends ${formatDate(entry.offerExpiresAt, lang)}` : ''}</p>
          </div>
        </li>)}
      </ol> : <p className="mt-3 rounded-xl bg-[#f5f1e6] p-3 text-xs text-[#75847c]">No waitlist entries have been recorded.</p> : null}
  </section></LocalizedContent>;
}

export default function PartnerPortal() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const client = useQueryClient();
  const operations = useGetOperations({ query: { retry: false, enabled: isLoaded && isSignedIn, refetchInterval: 30_000 } });
  const role = operations.data?.role;
  const isOperationsAdmin = role === 'partner_operations_admin' || role === 'super_admin';
  const isPartnerOwner = role === 'partner';
  const isPartnerManager = role === 'partner_manager';
  const isPartnerReception = role === 'partner_reception';
  const isPartnerFinance = role === 'partner_finance';
  const canManageSessions = isOperationsAdmin || isPartnerOwner || isPartnerManager;
  const canManageAttendance = isOperationsAdmin || isPartnerOwner || isPartnerManager || isPartnerReception;
  const canManagePartnerOperations = isOperationsAdmin || isPartnerOwner || isPartnerManager;
  const canViewPartnerFinance = isPartnerOwner || isPartnerFinance;
  const canViewReports = isOperationsAdmin || isPartnerOwner || isPartnerManager;
  const canManageMarketing = isPartnerOwner;
  const attendance = useGetAttendance({ query: { retry: false, enabled: isLoaded && isSignedIn && canManageAttendance } });
  const addPartner = useAddPartner();
  const approvePartner = useApprovePartner();
  const updatePartnerActivityApprovalMode = useUpdatePartnerActivityApprovalMode();
  const updateOffering = useChangeLiveOffering();
  const cancelOffering = useCancelLiveOffering();
  const updateOfferingSeries = useChangeRecurringOfferingSeries();
  const cancelOfferingSeries = useCancelRecurringOfferingSeries();
  const submitOffering = useSubmitLiveOffering();
  const respondToCorrection = useRespondToOfferingCorrection();
  const reviewOfferingApproval = useReviewOfferingApproval();
  const review = useReviewAttendance();
  const [language, setLanguage] = useState<PortalLanguage>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('maydango-partner-language') : null;
    return saved === 'ar' || saved === 'ku' ? saved : 'en';
  });
  const [tab, setTab] = useState<Tab>('overview');
  const [conductReportReference, setConductReportReference] = useState('');
  useEffect(() => {
    if (isPartnerReception && !['attendance', 'overview', 'support'].includes(tab)) setTab('attendance');
    if (isPartnerFinance && !['settlements', 'invoices', 'support'].includes(tab)) setTab('settlements');
    if (isPartnerManager && tab === 'staff') setTab('overview');
  }, [isPartnerFinance, isPartnerManager, isPartnerReception, tab]);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<{ id: string; scope: 'session' | 'series' } | null>(null);
  const [reviewing, setReviewing] = useState<{ id: string; action: ReviewAction } | null>(null);
  const [manualChecking, setManualChecking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [seriesCancellationResult, setSeriesCancellationResult] = useState<{ cancelledDates: string[]; preservedDates: string[] } | null>(null);
  const [partnerForm, setPartnerForm] = useState<PartnerInput>({ name: '', groupId: '', ownerUserId: '' });
  const offerings = operations.data?.offerings ?? [];
  const waitlist = operations.data?.waitlist ?? [];
  const rows = attendance.data?.rows ?? [];
  const activeOfferings = useMemo(() => offerings.filter(item => item.approvalStatus === 'published' && !item.cancelledAt).length, [offerings]);
  const awaitingOfferings = useMemo(() => offerings.filter(item => ['submitted', 'under_review', 'changes_requested', 'approved'].includes(item.approvalStatus) && !item.cancelledAt).length, [offerings]);
  const cancelledOfferings = useMemo(() => offerings.filter(item => !!item.cancelledAt).length, [offerings]);
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: getGetOperationsQueryKey() });
    void client.invalidateQueries({ queryKey: ['/api/attendance'] });
  };
  const changeLanguage = (next: PortalLanguage) => {
    setLanguage(next);
    window.localStorage.setItem('maydango-partner-language', next);
  };

  if (!isLoaded) return <main className="min-h-[100dvh] bg-[#f3f0e5] p-6"><div className="mx-auto max-w-6xl animate-pulse"><div className="h-16 w-64 rounded-xl bg-[#e2dece]" /><div className="mt-8 h-64 rounded-3xl bg-[#e2dece]" /></div></main>;
  if (!isSignedIn) return <Redirect to="/" />;
  const apiStatus = (operations.error as { status?: number } | null)?.status;
  if (operations.isError && (apiStatus === 401 || apiStatus === 403)) return <LocalizedContent lang={language}><main className="grid min-h-[100dvh] place-items-center bg-[#f3f0e5] p-5"><section className="max-w-lg rounded-[2rem] border border-[#ddd7c6] bg-[#fffdf7] p-8 text-center shadow-sm"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f2dfd5] text-[#9a4435]"><ShieldCheck /></div><h1 className="mt-5 font-display text-3xl font-bold text-[#173d35]">Portal access is not enabled</h1><p className="mt-3 text-sm leading-6 text-[#61736b]">Your MaydanGo account is signed in, but it does not have an approved partner or administrator role. No partner or attendance information is available for this account.</p><div className="mt-6 flex justify-center gap-3"><Link href="/" className="rounded-xl border border-[#d8d2c4] px-4 py-2.5 text-sm font-semibold text-[#36564b]">Public website</Link><Button onClick={() => signOut({ redirectUrl: '/' })}><LogOut size={15} />Sign out</Button></div></section></main></LocalizedContent>;
  if (operations.isError) return <LocalizedContent lang={language}><main className="grid min-h-[100dvh] place-items-center bg-[#f3f0e5] p-5"><section className="max-w-md rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-8 text-center"><CircleAlert className="mx-auto text-[#a76445]" size={30} /><h1 className="mt-4 font-display text-2xl font-bold text-[#173d35]">Could not load operations</h1><p className="mt-2 text-sm text-[#61736b]">The MaydanGo operations service did not respond. Your partner scope has not been loaded.</p><Button onClick={() => { void operations.refetch(); }}><RefreshCw size={15} />Try again</Button></section></main></LocalizedContent>;
  if (operations.isLoading || !operations.data) return <main className="min-h-[100dvh] bg-[#f3f0e5] p-6"><div className="mx-auto max-w-6xl animate-pulse"><div className="h-16 w-64 rounded-xl bg-[#e2dece]" /><div className="mt-8 h-64 rounded-3xl bg-[#e2dece]" /></div></main>;

  if (String(operations.data.role) === 'marketing_admin') return <Redirect to="/admin/sponsored-placements" />;
  const isAdmin = isOperationsAdmin;
  const isSuperAdmin = role === 'super_admin';
  const partner = operations.data.partners.find(item => item.id === operations.data.partnerId);
  const title = isAdmin ? 'Operations desk' : partner?.name ?? 'Partner workspace';
  const mutationError = (label: string) => setNotice(formatPartnerPortalSentence(language, 'mutationFailed', { action: portalText(language, label) }));
  const handleApproval = (id: string, approved: boolean) => approvePartner.mutate({ id, data: { approved } }, { onSuccess: invalidate, onError: () => mutationError('Partner review') });
  const handleActivityApprovalMode = (id: string, activityApprovalMode: 'platform_default' | 'activity_approval_required' | 'trusted_direct_publish') =>
    updatePartnerActivityApprovalMode.mutate({ id, data: { activityApprovalMode } }, {
      onSuccess: () => { invalidate(); setNotice('Partner activity publishing mode updated.'); },
      onError: () => mutationError('Partner publishing mode'),
    });
  const handleStatus = (id: string, capacity: number, waitlistOfferMinutes?: number) => {
    const data: OfferingUpdate = { capacity, ...(waitlistOfferMinutes === undefined ? {} : { waitlistOfferMinutes }) };
    updateOffering.mutate({ id, data }, { onSuccess: invalidate, onError: () => mutationError('Offering update') });
  };
  const submitForReview = (id: string) => submitOffering.mutate({ id }, {
    onSuccess: invalidate,
    onError: () => mutationError('Activity submission'),
  });
  const saveCorrectionResponse = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const response = String(new FormData(event.currentTarget).get('response') ?? '').trim();
    if (response.length < 5) {
      setNotice('Enter a response of at least five characters.');
      return;
    }
    respondToCorrection.mutate({ id, data: { response } }, {
      onSuccess: invalidate,
      onError: () => mutationError('Correction response'),
    });
  };
  const saveApprovalDecision = (event: FormEvent<HTMLFormElement>, item: (typeof offerings)[number]) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const status = String(values.get('status') ?? '') as OfferingApprovalStatus;
    const reason = String(values.get('reason') ?? '').trim();
    if (!status || status === item.approvalStatus) {
      setNotice('Choose a different administrator decision.');
      return;
    }
    if (approvalReasonRequired(status) && reason.length < 5) {
      setNotice('A reason is required for this decision.');
      return;
    }
    reviewOfferingApproval.mutate({
      id: item.id,
      data: { status, ...(reason ? { reason } : {}) },
    }, {
      onSuccess: invalidate,
      onError: () => mutationError('Administrator decision'),
    });
  };
  const saveOfferingEdit = (event: FormEvent<HTMLFormElement>, item: (typeof offerings)[number], scope: 'session' | 'series') => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (item.bookingModel === 'open_access') {
      const capacity = Number(values.get('capacity'));
      if (!Number.isInteger(capacity) || capacity < 1) {
        setNotice('Enter a whole-number visit limit of at least 1.');
        return;
      }
      updateOffering.mutate({ id: item.id, data: { capacity } }, {
        onSuccess: () => { invalidate(); setEditing(null); setNotice('Walk-in visit limit saved.'); },
        onError: () => mutationError('Offering update'),
      });
      return;
    }
    const start = String(values.get('startsAt') || '');
    const end = String(values.get('endsAt') || '');
    const deadline = String(values.get('cancellationDeadline') || '');
    const environment = String(values.get('environment') || '');
    if (!start || !end || !deadline) {
      setNotice('Enter a start, end, and cancellation deadline.');
      return;
    }
    if (item.accessType !== 'live' && environment !== 'indoor' && environment !== 'outdoor') {
      setNotice('Choose whether this in-person activity is indoors or outdoors.');
      return;
    }
    const data: OfferingUpdate = {
      capacity: Number(values.get('capacity')),
      ...(item.accessType !== 'live' ? { environment: environment as 'indoor' | 'outdoor' } : {}),
      startsAt: localIso(start),
      endsAt: localIso(end),
      cancellationDeadline: localIso(deadline),
    };
    const callbacks = {
      onSuccess: () => { invalidate(); setEditing(null); setNotice('Offering schedule saved.'); },
      onError: () => mutationError('Offering update'),
    };
    if (scope === 'series') updateOfferingSeries.mutate({ id: item.id, data }, callbacks);
    else updateOffering.mutate({ id: item.id, data }, callbacks);
  };
  const cancelOfferingScope = (item: (typeof offerings)[number], series: boolean) => {
    const confirmation = series
      ? language === 'ar'
        ? `هل تريد إلغاء الجلسات المستقبلية المؤهلة في «${item.title}»؟ ستبقى الجلسات التي لديها حجوزات أو حضور دون تغيير.`
        : language === 'ku'
          ? `وانە داهاتووە گونجاوەکان لە «${item.title}» هەڵبوەشێنرێنەوە؟ ئەو وانانەی حجز یان ئامادەبوونیان هەیە بە بێ گۆڕان دەمێننەوە.`
          : `Cancel eligible future sessions in “${item.title}”? Sessions with reservations or attendance will remain unchanged.`
      : `Cancel the session “${item.title}”? Reservations will be released and members notified. This cannot be undone.`;
    if (!window.confirm(confirmation)) return;
    if (series) {
      cancelOfferingSeries.mutate({ id: item.id }, {
        onSuccess: result => {
          invalidate();
          setSeriesCancellationResult(result);
          setNotice('Future series cancellation results.');
        },
        onError: () => mutationError('Cancellation'),
      });
    } else {
      cancelOffering.mutate({ id: item.id }, { onSuccess: invalidate, onError: () => mutationError('Cancellation') });
    }
  };
  const runReview = (event: FormEvent) => {
    event.preventDefault();
    if (!reviewing || reason.trim().length < 5) return;
    review.mutate({ id: reviewing.id, data: { action: reviewing.action, reason: reason.trim() } }, {
      onSuccess: () => {
        trackEvent('attendance_decision_recorded', { action: reviewing.action, surface: 'partner_portal' });
        invalidate();
        setReviewing(null);
        setReason('');
        setNotice(reviewing.action === 'reject_request' ? 'Booking request rejected.' : 'Attendance review recorded.');
      },
      onError: () => mutationError('Attendance review'),
    });
  };
  const actionLabel: Record<string, string> = { confirm: 'Confirm', no_show: 'Mark no-show', dispute: 'Dispute', resolve_confirm: 'Resolve: confirm', resolve_void: 'Resolve: void', accept_request: 'Accept request', reject_request: 'Reject request' };
  const navigationItems = [
    ...(!isPartnerFinance && !isPartnerReception ? [['overview', Activity]] as const : []),
    ...(canManageSessions ? [['offerings', Dumbbell], ['waitlist', Clock3], ['bookings', CalendarDays]] as const : []),
    ...(canManageAttendance ? [['attendance', CalendarDays]] as const : []),
    ...(canManagePartnerOperations ? [['facilities', MapPin], ['analytics', TrendingUp], ['quality', ClipboardCheck], ['reviews', Star]] as const : []),
    ...(canViewPartnerFinance ? [['settlements', Wallet], ['invoices', FileText]] as const : []),
    ...(isAdmin ? [['partners', Users]] as const : []),
    ...(isPartnerOwner ? [['staff', Users]] as const : []),
    ...(canManageMarketing ? [['marketing', Megaphone]] as const : []),
    ['support', CircleAlert] as const,
  ];
  return <main dir={language === 'en' ? 'ltr' : 'rtl'} lang={portalDateLocale(language)} className={`min-h-[100dvh] bg-[#f3f0e5] text-[#173d35] ${language !== 'en' ? 'rtl-copy' : ''}`}>
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b border-[#dcd6c6] bg-[#e9e5d7] px-5 py-4 lg:sticky lg:top-0 lg:h-[100dvh] lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
         <Link href="/" className="inline-flex items-center gap-3"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="MaydanGo" className="h-10 w-10" /><span className="font-display text-lg font-bold tracking-tight">MaydanGo<span className="block font-sans text-[9px] font-bold uppercase tracking-[.18em] text-[#a76445]">{portalLabel(language, 'workspace')}</span></span></Link>
        <div className="mt-8 hidden rounded-2xl bg-[#f8f5eb] p-4 lg:block"><p className="text-[9px] font-bold uppercase tracking-[.17em] text-[#a76445]">Workspace</p><p className="mt-2 truncate text-sm font-bold">{title}</p><p className="mt-1 text-xs text-[#687a71]">{isAdmin ? 'Administrator access' : 'Partner access'}</p></div>
        <nav aria-label="Portal navigation" className="mt-5 flex gap-2 overflow-x-auto lg:mt-8 lg:flex-col">
           {navigationItems.map(([id, Icon]) => <button data-testid={`tab-${id}`} key={id} onClick={() => { if (id === 'support') setConductReportReference(''); setTab(id as Tab); }} aria-current={tab === id ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition ${tab === id ? 'bg-[#174d43] text-[#fff9e9]' : 'text-[#536b61] hover:bg-[#dedaca]'}`}><Icon size={16} />{portalLabel(language, id)}{id === 'waitlist' ? ` · ${waitlist.length}` : ''}</button>)}
          {isAdmin && <Link data-testid="link-admin-corporate" href="/admin/corporate" className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-[#536b61] transition hover:bg-[#dedaca]"><Users size={16} />{language === 'ar' ? 'بوابة الشركات' : language === 'ku' ? 'پۆرتاڵی کۆمپانیاکان' : 'Corporate portal'}</Link>}
           {isAdmin && <Link data-testid="link-admin-partner-onboarding" href="/admin/partner-onboarding" className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-[#536b61] transition hover:bg-[#dedaca]"><Users size={16} />{language === 'ar' ? 'طلبات الشراكة' : language === 'ku' ? 'داواکارییەکانی هاوبەشی' : 'Partner applications'}</Link>}
          {isAdmin && <Link data-testid="link-support-desk-admin" href="/support-desk" className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-[#536b61] transition hover:bg-[#dedaca]"><Users size={16} />{language === 'ar' ? 'مكتب الدعم' : language === 'ku' ? 'مێزی پشتگیری' : 'Support desk'}</Link>}
          {isAdmin && <Link data-testid="link-admin-instructor-access" href="/admin/instructor-access" className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-[#536b61] transition hover:bg-[#dedaca]"><Users size={16} />{language === 'ar' ? 'طلبات المدربين' : language === 'ku' ? 'داواکارییەکانی ڕاهێنەران' : 'Instructor access'}</Link>}
          <button data-testid="tab-quality" type="button" onClick={() => setTab('quality')} aria-current={tab === 'quality' ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition ${tab === 'quality' ? 'bg-[#174d43] text-[#fff9e9]' : 'text-[#536b61] hover:bg-[#dedaca]'}`}><ClipboardCheck size={16} />{portalLabel(language, 'quality')}</button>
          <button data-testid="tab-reviews" type="button" onClick={() => setTab('reviews')} aria-current={tab === 'reviews' ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition ${tab === 'reviews' ? 'bg-[#174d43] text-[#fff9e9]' : 'text-[#536b61] hover:bg-[#dedaca]'}`}><Star size={16} />{portalLabel(language, 'reviews')}</button>
          {(String(role) === 'marketing_admin' || role === 'super_admin') && <Link data-testid="link-sponsored-placements" href="/admin/sponsored-placements" className="flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-[#536b61] transition hover:bg-[#dedaca]"><Megaphone size={16} />{language === 'ar' ? 'مواضع الترويج' : language === 'ku' ? 'شوێنەکانی ڕیکلام' : 'Sponsored placements'}</Link>}
        </nav>
         <div className="mt-8 hidden border-t border-[#d6d0bf] pt-5 lg:block">{role === 'super_admin' && <Link href="/super-admin" className="mb-4 flex items-center gap-2 text-xs font-semibold text-[#174d43] hover:text-[#28695a]" data-testid="link-super-admin-console">Super Admin console</Link>}{isAdmin && <Link href="/finance" className="mb-4 flex items-center gap-2 text-xs font-semibold text-[#174d43] hover:text-[#28695a]"><Wallet size={14} />Finance desk</Link>}<Link href="/" className="flex items-center gap-2 text-xs font-semibold text-[#63766d] hover:text-[#174d43]"><ArrowLeft size={14} />Public MaydanGo site</Link><button onClick={() => signOut({ redirectUrl: '/' })} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#63766d] hover:text-[#9a4435]"><LogOut size={14} />Sign out</button></div>
      </aside>
      <section className="min-w-0 px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
        <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.21em] text-[#a76445]">MAYDANGO · IRAQ</p><h1 className="mt-2 font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">{portalLabel(language, tab === 'overview' ? 'greeting' : tab === 'attendance' ? 'attendanceTitle' : tab === 'partners' ? 'approvals' : tab)}</h1><p className="mt-2 text-sm text-[#687a71]">{title}</p></div><div className="flex items-center gap-2"><label className="text-[10px] font-bold text-[#687a71]">{portalLabel(language, 'language')}<select aria-label={portalLabel(language, 'language')} value={language} onChange={e => changeLanguage(e.target.value as PortalLanguage)} className="ml-2 rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-2.5 py-2 text-xs text-[#173d35]"><option value="en">English</option><option value="ar">العربية العراقية</option><option value="ku">کوردیی سۆرانی</option></select></label><div className="flex items-center gap-2 lg:hidden"><Button kind="quiet" onClick={() => signOut({ redirectUrl: '/' })}><LogOut size={15} />Exit</Button></div><div className="hidden items-center gap-2 rounded-full border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-xs font-semibold text-[#536b61] sm:flex"><span className="h-2 w-2 rounded-full bg-[#4a8a69]" />Server-scoped access</div></div></header>
        <LocalizedContent lang={language}>
          {notice && <div role="status" className="mx-auto mt-5 flex max-w-6xl items-start justify-between gap-4 rounded-xl border border-[#d8c6a5] bg-[#fff8e8] px-4 py-3 text-sm text-[#715533]"><div className="min-w-0"><p>{notice}</p>{notice === 'Future series cancellation results.' && seriesCancellationResult && <div className="mt-2 grid gap-1 text-xs leading-5">
            {seriesCancellationResult.cancelledDates.length > 0 ? <p><strong>Cancelled dates:</strong> {seriesCancellationResult.cancelledDates.map(date => dateLabelBaghdad(date, language)).join(', ')}</p> : <p>No future sessions were cancelled.</p>}
            {seriesCancellationResult.preservedDates.length > 0 && <p><strong>Left unchanged because of bookings or attendance:</strong> {seriesCancellationResult.preservedDates.map(date => dateLabelBaghdad(date, language)).join(', ')}</p>}
          </div>}</div><button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15} /></button></div>}
        <div className="mx-auto mt-8 max-w-6xl">
          {tab === 'facilities' && isAdmin && <FacilityProfiles isAdmin partnerId={operations.data.partnerId} partners={operations.data.partners} />}
          {tab === 'overview' && (canManagePartnerOperations || isAdmin) && <div>
            <div className="grid gap-4 sm:grid-cols-3"><article className="rounded-3xl bg-[#174d43] p-5 text-[#fff9e9] sm:col-span-2 sm:p-7"><div className="flex items-start justify-between"><span className="text-xs font-semibold uppercase tracking-[.16em] text-[#d4dfcf]">Your MaydanGo space</span><Activity size={19} className="text-[#e1a17e]" /></div><p className="mt-9 max-w-lg font-display text-2xl font-semibold leading-tight sm:text-3xl">{isAdmin ? 'A clear view of partner activity and attendance.' : 'Bring your sessions and community into view.'}</p><p className="mt-3 max-w-lg text-sm leading-6 text-[#d1dfd6]">{isAdmin ? 'Review the partner and offering records returned for your administrator account.' : 'Manage the live opportunities and attendance roster assigned to your partner account.'}</p></article>
               <article className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#6e8077]">Active offerings</p><p className="mt-4 font-display text-4xl font-bold">{formatPartnerPortalNumber(language, activeOfferings)}</p><p className="mt-2 text-xs text-[#75847c]">{formatPartnerPortalSentence(language, 'activeListings', { active: formatPartnerPortalNumber(language, activeOfferings), total: formatPartnerPortalNumber(language, offerings.length) })}</p><button onClick={() => setTab('offerings')} className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#28695a]">Manage offerings<ArrowUpRight size={13} /></button></article></div>
             {!isAdmin && <section data-testid="activity-approval-summary" aria-label={portalLabel(language, 'offerings')} className="mt-5 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
               <div className="flex flex-wrap items-center justify-between gap-3">
                 <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a76445]">Partner activity</p><h2 className="mt-1 font-display text-xl font-bold">{portalLabel(language, 'offerings')}</h2></div>
                 <button data-testid="button-view-activity-status" type="button" onClick={() => setTab('offerings')} className="inline-flex items-center gap-1 text-xs font-bold text-[#28695a]">Manage offerings<ArrowUpRight size={13} /></button>
               </div>
               <div className="mt-4 grid gap-3 sm:grid-cols-3">
                 {[
                  { id: 'awaiting-review', label: 'Pending activity review', count: awaitingOfferings, tone: 'bg-[#f5f1e6] text-[#756e5b]' },
                   { id: 'published', label: 'Active', count: activeOfferings, tone: 'bg-[#e1efdf] text-[#2d6d4a]' },
                   { id: 'cancelled', label: 'Cancelled', count: cancelledOfferings, tone: 'bg-[#f2dfd5] text-[#9a4435]' },
                 ].map(status => <article data-testid={`status-offering-approval-${status.id}`} key={status.id} className="rounded-2xl border border-[#ece7d9] p-4">
                   <p className="text-xs font-semibold text-[#687a71]">{status.label}</p>
                   <p className={`mt-3 inline-flex min-w-10 justify-center rounded-full px-3 py-1 font-display text-2xl font-bold ${status.tone}`}>{status.count.toLocaleString(language === 'en' ? 'en-IQ' : language === 'ar' ? 'ar-IQ' : 'ckb-IQ')}</p>
                 </article>)}
               </div>
             </section>}
            <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_.8fr]"><article className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-display text-xl font-bold">Next on the roster</h2><p className="mt-1 text-xs text-[#75847c]">Attendance records in your server scope</p></div><button onClick={() => setTab('attendance')} className="text-xs font-bold text-[#28695a]">View all</button></div>{attendance.isLoading ? <div className="mt-5 h-16 animate-pulse rounded-xl bg-[#eeeadc]" /> : attendance.isError ? <button className="mt-5 text-sm font-semibold text-[#9a4435]" onClick={() => void attendance.refetch()}>Roster unavailable · Retry</button> : rows.length ? <div className="mt-4 divide-y divide-[#ece7d9]">{rows.slice(0, 4).map(row => <div key={row.reservationId} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{row.title}</p><p className="mt-1 text-xs text-[#75847c]">{row.facility} · {formatDate(row.startsAt)}</p></div><span className="rounded-full bg-[#eeeadc] px-2.5 py-1 text-[10px] font-bold text-[#536b61]">{row.status.replaceAll('_', ' ')}</span></div>)}</div> : <p className="mt-5 rounded-xl bg-[#f5f1e6] p-4 text-sm text-[#75847c]">No attendance records were returned for this scope.</p>}</article>
              <article className="rounded-3xl border border-[#ddd7c6] bg-[#f0ead9] p-5 sm:p-6"><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-[#28695a]" /><h2 className="font-display text-xl font-bold">Scoped by the server</h2></div><p className="mt-3 text-sm leading-6 text-[#62756b]">Your account role and partner boundary come from the operations service. Actions are checked again by MaydanGo when saved.</p><p className="mt-5 text-[10px] font-bold uppercase tracking-[.16em] text-[#a76445]">{isAdmin ? 'Administrator' : 'Partner operator'} · {rows.length} roster records</p></article></div>
          </div>}
            {tab === 'offerings' && canManageSessions && <section>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div><p className="text-sm text-[#75847c]">Create and maintain opportunities from the authorized operations record.</p></div>
                <Button onClick={() => setShowCreate(true)}><Plus size={16} />New offering</Button>
              </div>
              {offerings.length ? <div className="grid gap-4">{offerings.map(item => <article key={item.id} className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                       <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${item.cancelledAt ? approvalStatusStyles.archived : approvalStatusStyles[item.approvalStatus]}`}>{item.cancelledAt ? 'Cancelled' : approvalStatusLabels[item.approvalStatus]}</span>
                       {item.sessionStatus && item.sessionStatus !== 'draft' && !item.cancelledAt && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${sessionStatusStyles[item.sessionStatus]}`}>{sessionStatusLabels[item.sessionStatus]}</span>}
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#a76445]">{item.kind}</span>
                       {item.bookingModel === 'open_access' && <span className="rounded-full bg-[#e1ece5] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#28695a]">{portalText(language, 'Open access · walk in')}</span>}
                        {item.bookingModel === 'resource_booking' && <span className="rounded-full bg-[#e1ece5] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#28695a]">{portalText(language, 'Resource booking')}</span>}
                      {item.recurrenceGroupId && <span className="rounded-full bg-[#e9e5d7] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#536b61]">Recurring series</span>}
                    </div>
                    <h2 className="mt-3 font-display text-xl font-bold">{item.localizedTitle?.[language] || item.title}</h2>
                    <p className="mt-1 text-sm text-[#687a71]">{item.facility}, {item.city} · {item.category}</p>
                     {item.bookingModel === 'resource_booking' && item.resourceName && <p className="mt-1 text-sm font-semibold text-[#36564b]">{portalText(language, 'Resource:')} {item.resourceName[language]}</p>}
                    {item.accessType !== 'live' && <p className="mt-1 text-xs text-[#75847c]">{portalText(language, 'Activity setting')}: {item.environment ? portalText(language, item.environment === 'indoor' ? 'Indoors' : 'Outdoors') : portalText(language, 'Choose a setting')}</p>}
                    {item.imageUrl && <img src={item.imageUrl} alt={item.localizedTitle?.[language] || item.title} loading="lazy" referrerPolicy="no-referrer" className="mt-3 aspect-[16/8] max-h-48 w-full rounded-xl object-cover sm:max-w-sm" />}
                    {item.instructions && <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[#687a71]">{item.instructions}</p>}
                    <p className="mt-3 text-xs text-[#75847c]">{formatDate(item.startsAt)} – {formatDate(item.endsAt)}{item.remaining !== undefined ? ` · ${item.remaining} remaining` : ''}</p>
                {!['open_access', 'resource_booking'].includes(item.bookingModel) && <p className="mt-2 text-xs text-[#75847c]">Waitlist offers expire after {item.waitlistOfferMinutes ?? 30} minutes.</p>}
                    {isAdmin && item.partnerName && <p className="mt-2 text-xs text-[#75847c]">Partner: {item.partnerName}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!item.cancelledAt && <>
                      {item.bookingModel !== 'resource_booking' && <Button kind="quiet" onClick={() => setEditing({ id: item.id, scope: 'session' })}>{item.bookingModel === 'open_access' ? portalText(language, 'Update visit limit') : 'Edit session'}</Button>}
                      {item.recurrenceGroupId && item.bookingModel !== 'resource_booking' && <Button kind="quiet" onClick={() => setEditing({ id: item.id, scope: 'series' })}>Edit future series</Button>}
                      {!isAdmin && item.approvalStatus === 'draft' && <Button kind="quiet" onClick={() => submitForReview(item.id)} disabled={submitOffering.isPending}>Submit for review</Button>}
                      <Button kind="danger" onClick={() => cancelOfferingScope(item, false)}>Cancel session</Button>
                      {item.recurrenceGroupId && <Button kind="danger" onClick={() => cancelOfferingScope(item, true)}>Cancel future series</Button>}
                    </>}
                  </div>
                </div>
                {item.approvalReason && <div className="mt-4 rounded-2xl border border-[#e5d4b3] bg-[#fbf3e4] p-4 text-sm leading-6 text-[#725626]"><strong>Review reason</strong><p className="mt-1">{item.approvalReason}</p></div>}
                {isAdmin && item.partnerResponse && <div className="mt-3 rounded-2xl border border-[#d6e1d8] bg-[#edf4ee] p-4 text-sm leading-6 text-[#36564b]"><strong>Latest partner response</strong><p className="mt-1">{item.partnerResponse}</p></div>}
                {!isAdmin && ['submitted', 'under_review'].includes(item.approvalStatus) && <p className="mt-4 rounded-2xl bg-[#e3ebf4] p-4 text-sm text-[#355b7a]">Awaiting review</p>}
                {!isAdmin && item.approvalStatus === 'changes_requested' && !item.cancelledAt && <form className="mt-4 grid gap-3 rounded-2xl bg-[#f8ead2] p-4" onSubmit={event => saveCorrectionResponse(event, item.id)}>
                  <label className="grid gap-1.5 text-sm font-medium"><span>Partner response</span><textarea required minLength={5} maxLength={1000} name="response" rows={3} className={fieldClass()} placeholder="Describe the correction or provide the requested details." /></label>
                  <Button type="submit" disabled={respondToCorrection.isPending}>Respond and resubmit</Button>
                </form>}
                {isAdmin && !item.cancelledAt && approvalReviewTargets[item.approvalStatus].length > 0 && <form className="mt-4 grid gap-3 rounded-2xl bg-[#f2efe4] p-4 sm:grid-cols-[1fr_2fr_auto]" onSubmit={event => saveApprovalDecision(event, item)}>
                  <label className="grid gap-1.5 text-sm font-medium"><span>Administrator decision</span><select required name="status" defaultValue="" className={fieldClass()}><option value="" disabled>Choose a decision</option>{approvalReviewTargets[item.approvalStatus].map(status => <option key={status} value={status}>{approvalStatusLabels[status]}</option>)}</select></label>
                  <label className="grid gap-1.5 text-sm font-medium"><span>Decision reason</span><textarea name="reason" rows={2} maxLength={1000} defaultValue={item.approvalReason ?? ''} className={fieldClass()} placeholder="Required for correction, rejection, suspension, or archiving." /></label>
                  <Button type="submit" disabled={reviewOfferingApproval.isPending}>Save decision</Button>
                </form>}
                {editing?.id === item.id && item.bookingModel === 'open_access' && <form className="mt-5 grid gap-3 rounded-2xl bg-[#f2efe4] p-4 sm:grid-cols-2" onSubmit={event => saveOfferingEdit(event, item, 'session')}>
                  <p className="text-xs leading-5 text-[#687a71] sm:col-span-2">{portalText(language, 'The published access window and check-in location stay fixed. Create a replacement activity to change those details.')}</p>
                  <LabelField label={portalText(language, 'Maximum visits during this access window')}><input required min="1" name="capacity" defaultValue={item.capacity} type="number" className={fieldClass()} /></LabelField>
                  <div className="flex items-end gap-2"><Button type="submit" disabled={updateOffering.isPending}>Save</Button><Button kind="quiet" onClick={() => setEditing(null)}>Close</Button></div>
                </form>}
                {editing?.id === item.id && !['open_access', 'resource_booking'].includes(item.bookingModel) && <form className="mt-5 grid gap-3 rounded-2xl bg-[#f2efe4] p-4 sm:grid-cols-2" onSubmit={event => saveOfferingEdit(event, item, editing?.id === item.id ? editing.scope : 'session')}>
                  {editing.scope === 'series' && <p className="text-xs leading-5 text-[#687a71] sm:col-span-2">Changes apply to this and all remaining future sessions. Reservations stay attached to their sessions. A session with an attendance record cannot have its date changed. Moving the selected date shifts the remaining dates by the same amount.</p>}
                  <LabelField label="Starts at"><input required name="startsAt" type="datetime-local" defaultValue={dateTimeInputBaghdad(item.startsAt)} className={fieldClass()} /></LabelField>
                  <LabelField label="Ends at"><input required name="endsAt" type="datetime-local" defaultValue={dateTimeInputBaghdad(item.endsAt)} className={fieldClass()} /></LabelField>
                  <LabelField label="Cancellation deadline"><input required name="cancellationDeadline" type="datetime-local" defaultValue={dateTimeInputBaghdad(item.cancellationDeadline)} className={fieldClass()} /></LabelField>
                  <LabelField label="Capacity"><input required min="1" name="capacity" defaultValue={item.capacity} type="number" className={fieldClass()} /></LabelField>
                  {item.accessType !== 'live' && <LabelField label={portalText(language, 'Activity setting')}><select required name="environment" defaultValue={item.environment ?? ''} className={fieldClass()}><option value="" disabled>{portalText(language, 'Choose a setting')}</option><option value="indoor">{portalText(language, 'Indoors')}</option><option value="outdoor">{portalText(language, 'Outdoors')}</option></select></LabelField>}
                  <div className="flex items-end gap-2"><Button type="submit" disabled={updateOffering.isPending || updateOfferingSeries.isPending}>Save</Button><Button kind="quiet" onClick={() => setEditing(null)}>Close</Button></div>
                </form>}
                {!item.cancelledAt && !['open_access', 'resource_booking'].includes(item.bookingModel) && <form className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-[#f2efe4] p-4" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); handleStatus(item.id, item.capacity, Number(data.get('waitlistOfferMinutes'))); }}>
                  <LabelField label="Waitlist offer window (minutes)"><input required min="5" max="1440" name="waitlistOfferMinutes" defaultValue={item.waitlistOfferMinutes ?? 30} type="number" className={fieldClass()} /></LabelField>
                  <Button type="submit" disabled={updateOffering.isPending}>Save offer window</Button>
                </form>}
                {['open_access', 'resource_booking'].includes(item.bookingModel) && !item.cancelledAt && <OfferingCheckinPolicyForm item={item} lang={language} />}
                {!['open_access', 'resource_booking'].includes(item.bookingModel) && <WaitlistPanel offeringId={item.id} lang={language} />}
              </article>)}</div> : <div className="rounded-3xl border border-dashed border-[#d5cfbf] bg-[#fffdf7]/60 p-10 text-center"><Dumbbell className="mx-auto text-[#a76445]" /><h2 className="mt-4 font-display text-xl font-bold">No offerings returned</h2><p className="mt-2 text-sm text-[#75847c]">Create an offering to start managing your available sessions and events.</p></div>}
            </section>}
          {tab === 'waitlist' && canManageSessions && <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <p className="max-w-2xl text-sm leading-6 text-[#687a71]">View the live queue for your upcoming offerings. The server shares queue order and timing only; member identities stay private in this view.</p>
              <Button kind="quiet" onClick={() => void operations.refetch()}><RefreshCw size={15} />Refresh</Button>
            </div>
            {waitlist.length ? <div className="grid gap-3">{waitlist.map(entry => (
              <article key={entry.id} className="flex flex-col justify-between gap-4 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#a76445]">{formatDate(entry.startsAt)} · {entry.facility}, {entry.city}</p>
                  <h2 className="mt-2 font-display text-lg font-bold">{entry.localizedTitle?.[language] || entry.title}</h2>
                  <p className="mt-1 text-xs text-[#75847c]">Joined {formatDate(entry.joinedAt)}</p>
                </div>
                <span aria-label={`${portalText(language, 'Waiting-list position')} ${entry.position}`} className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-[#e1efdf] px-3 py-2 text-xs font-bold text-[#2d6d4a]">
                  <Clock3 size={14} />Position {entry.position}
                </span>
              </article>
            ))}</div> : <div className="rounded-3xl border border-dashed border-[#d5cfbf] bg-[#fffdf7]/60 p-10 text-center">
              <Clock3 className="mx-auto text-[#a76445]" /><h2 className="mt-4 font-display text-xl font-bold">No one is waiting</h2>
              <p className="mt-2 text-sm text-[#75847c]">Active queues for your upcoming offerings will appear here.</p>
            </div>}
          </section>}
          {tab === 'support' && <PartnerSupportPanel
            lang={language}
            conductReportReference={conductReportReference}
            onConductReportSent={() => setConductReportReference('')}
          />}
          {tab === 'attendance' && (isPartnerOwner || isPartnerManager || isPartnerReception) && <GuardianConsentQueue rows={rows} lang={language} onUploaded={() => { void attendance.refetch(); }} />}
           {tab === 'attendance' && canManageAttendance && <section><div className="mb-5 flex items-end justify-between"><p className="max-w-2xl text-sm leading-6 text-[#687a71]">Review bookings in your server-scoped roster. Member identity and membership details are shown only to authorized staff; every attendance decision is recorded.</p><Button kind="quiet" onClick={() => void attendance.refetch()}><RefreshCw size={15} />Refresh</Button></div>{attendance.isLoading ? <div className="h-48 animate-pulse rounded-3xl bg-[#e5e0d1]" /> : attendance.isError ? <div role="alert" className="rounded-3xl border border-[#e0c4b9] bg-[#fff7f3] p-7"><p className="font-semibold">Attendance roster unavailable</p><Button onClick={() => void attendance.refetch()}>Retry</Button></div> : rows.length ? <div className="grid gap-4">{rows.map(row => {
            const state = `${row.status} ${row.bookingStatus}`.toLowerCase();
             const actions: ReviewAction[] = state.includes('disput')
               ? isAdmin ? ['resolve_confirm', 'resolve_void'] : []
               : row.bookingStatus === 'requested' ? ['accept_request', 'reject_request']
               : row.bookingStatus !== 'reserved' ? []
                : row.status === 'pending' ? isPartnerReception ? ['confirm'] : ['confirm', 'dispute']
                : ['confirmed', 'no_show'].includes(row.status) ? isPartnerReception ? [] : ['dispute']
               : row.status === 'not_checked_in' && row.policy && Date.now() >= Date.parse(row.policy.closesAt) ? ['no_show'] : [];
            const attendanceDetails = row as typeof row & { manualCheckin?: boolean; manualRepeatUse?: boolean };
            const hasCurrentPolicyWindow = row.policy !== undefined && Number.isFinite(Date.parse(row.policy.opensAt)) && Number.isFinite(Date.parse(row.policy.closesAt)) && Date.now() >= Date.parse(row.policy.opensAt) && Date.now() <= Date.parse(row.policy.closesAt);
             const canManualCheckin = canManageAttendance && !isAdmin && !row.locked && row.status === 'not_checked_in' && row.bookingStatus === 'reserved' && hasCurrentPolicyWindow;
             return <article key={row.reservationId} className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#eeeadc] px-2.5 py-1 text-[10px] font-bold text-[#536b61]">Booking · {row.bookingStatus.replaceAll('_', ' ')}</span><span className="rounded-full bg-[#e3ebf4] px-2.5 py-1 text-[10px] font-bold text-[#355b7a]">Attendance · {row.status.replaceAll('_', ' ')}</span>{row.locked && <span className="rounded-full bg-[#f2dfd5] px-2.5 py-1 text-[10px] font-bold text-[#9a4435]">Locked</span>}{row.settlementEligible && <span className="rounded-full bg-[#e1efdf] px-2.5 py-1 text-[10px] font-bold text-[#2d6d4a]">Settlement eligible</span>}</div><div className="mt-3 flex items-center gap-3" data-testid={`attendance-member-${row.reservationId}`}>{row.customerImageUrl ? <img src={row.customerImageUrl} alt="" referrerPolicy="no-referrer" className="h-11 w-11 rounded-full object-cover" /> : <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e9e5d7] font-bold text-[#536b61]">{(row.customerName || 'M').slice(0, 1).toUpperCase()}</span>}<div><p className="font-semibold">{row.customerName || 'Member'}</p><p className="text-xs text-[#75847c]">{row.membershipPlan ? `Membership plan / tier: ${row.membershipPlan}` : 'Membership plan / tier: unavailable'}</p></div></div><h2 className="mt-3 font-display text-lg font-bold">{row.title}</h2><p className="mt-1 text-sm text-[#687a71]">{row.facility} · {formatDate(row.startsAt)}</p><p className="mt-2 font-mono text-[10px] text-[#8b9288]">Reservation {row.reference || row.reservationId}</p>{row.checkedInAt && <p className="mt-2 text-xs text-[#687a71]">Checked in {formatDate(row.checkedInAt)}{attendanceDetails.manualCheckin ? ' · staff-assisted audit' : ''}{attendanceDetails.manualRepeatUse ? ' · repeat use noted' : ''}</p>}</div><div className="flex flex-wrap items-center gap-2">{!row.locked && actions.map(action => <Button key={action} kind={action === 'dispute' || action === 'no_show' || action === 'resolve_void' ? 'quiet' : 'primary'} onClick={() => { setReviewing({ id: row.reservationId, action }); setReason(''); }}>{actionLabel[action]}</Button>)}{canManualCheckin && <Button kind="quiet" onClick={() => setManualChecking(row.reservationId)}>Verify member code</Button>}{!isAdmin && <Button kind="quiet" onClick={() => { setConductReportReference(''); setTab('support'); setNotice(''); }}>Contact support</Button>}{!isAdmin && <Button kind="quiet" onClick={() => { setConductReportReference(row.reservationId); setTab('support'); }}>Report misconduct</Button>}</div></div>{manualChecking === row.reservationId && <ManualCheckinForm reservationId={row.reservationId} lang={language} onClose={() => setManualChecking(null)} onSuccess={() => { setManualChecking(null); invalidate(); setNotice('Manual check-in recorded by the server.'); }} />}{row.events.length > 0 && <details className="mt-4 border-t border-[#ece7d9] pt-3"><summary className="cursor-pointer text-xs font-bold text-[#536b61]">Audit history · {row.events.length}</summary><ul className="mt-3 space-y-2">{row.events.map((event, index) => <li key={`${event.createdAt}-${index}`} className="text-xs text-[#687a71]"><span className="font-semibold">{event.action.replaceAll('_', ' ')}</span> · {event.reason} · {formatDate(event.createdAt)}</li>)}</ul></details>}
              {reviewing?.id === row.reservationId && <form onSubmit={runReview} className="mt-4 rounded-2xl bg-[#f2efe4] p-4"><label className="block text-xs font-semibold text-[#51665e]">{actionLabel[reviewing.action]} — audit reason (at least 5 characters)<textarea required minLength={5} maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)} className={fieldClass()} placeholder="Record the reason for this decision" /></label><div className="mt-3 flex justify-end gap-2"><Button kind="quiet" onClick={() => setReviewing(null)}>Dismiss</Button><Button type="submit" disabled={review.isPending || reason.trim().length < 5}>{review.isPending ? 'Recording…' : 'Record review'}</Button></div></form>}</article>;
          })}</div> : <div className="rounded-3xl border border-dashed border-[#d5cfbf] bg-[#fffdf7]/60 p-10 text-center"><CalendarDays className="mx-auto text-[#a76445]" /><h2 className="mt-4 font-display text-xl font-bold">Roster is clear</h2><p className="mt-2 text-sm text-[#75847c]">No attendance rows were returned for this account.</p></div>}</section>}
          {tab === 'partners' && isAdmin && <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
            <form className="h-fit rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5" onSubmit={event => { event.preventDefault(); addPartner.mutate({ data: partnerForm }, { onSuccess: () => { invalidate(); setPartnerForm({ name: '', groupId: '', ownerUserId: '' }); setNotice('Partner record created.'); }, onError: () => mutationError('Partner creation') }); }}>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a76445]">Administrator action</p>
              <h2 className="mt-2 font-display text-xl font-bold">Add partner record</h2>
              <p className="mt-2 text-xs leading-5 text-[#75847c]">Provide all three identifiers directly. No partner owner or group is inferred.</p>
              <div className="mt-4 grid gap-3">
                <LabelField label="Partner name"><input required className={fieldClass()} value={partnerForm.name} onChange={e => setPartnerForm({ ...partnerForm, name: e.target.value })} /></LabelField>
                <LabelField label="Group ID"><input required className={fieldClass()} value={partnerForm.groupId} onChange={e => setPartnerForm({ ...partnerForm, groupId: e.target.value })} /></LabelField>
                <LabelField label="Owner user ID"><input required className={fieldClass()} value={partnerForm.ownerUserId} onChange={e => setPartnerForm({ ...partnerForm, ownerUserId: e.target.value })} /></LabelField>
                <Button type="submit" disabled={addPartner.isPending}><Plus size={15} />Create partner</Button>
              </div>
            </form>
            <div className="grid content-start gap-3">
              {operations.data.partners.map(partnerItem => <article key={partnerItem.id} className="flex flex-col justify-between gap-4 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg font-bold">{partnerItem.name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${partnerItem.approved ? 'bg-[#e1efdf] text-[#2d6d4a]' : 'bg-[#f2dfd5] text-[#9a4435]'}`}>{partnerItem.approved ? 'Approved' : 'Pending'}</span>
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-[#8b9288]">
                    <span>{portalText(language, 'Partner ID')} {partnerItem.id}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{portalText(language, 'Group ID')} {partnerItem.groupId}</span>
                  </p>
                  {isSuperAdmin && <div className="mt-3 max-w-md">
                    <label className="text-xs font-semibold text-[#536b61]">Activity publishing mode
                      <select aria-label={`Activity publishing mode for ${partnerItem.name}`} value={partnerItem.activityApprovalMode ?? 'platform_default'} disabled={updatePartnerActivityApprovalMode.isPending} onChange={event => handleActivityApprovalMode(partnerItem.id, event.target.value as 'platform_default' | 'activity_approval_required' | 'trusted_direct_publish')} className={`mt-1 ${fieldClass()}`}>
                        <option value="platform_default">Use platform default</option>
                        <option value="activity_approval_required">Review every activity</option>
                        <option value="trusted_direct_publish">Trusted direct publishing</option>
                      </select>
                    </label>
                    <p className="mt-1 text-[11px] leading-5 text-[#75847c]">Partner onboarding approval remains required in every mode. The platform default follows the global activity-review setting; trusted publishing removes the second review for approved partners.</p>
                  </div>}
                </div>
                <Button kind={partnerItem.approved ? 'quiet' : 'primary'} disabled={approvePartner.isPending} onClick={() => handleApproval(partnerItem.id, !partnerItem.approved)}>
                  {partnerItem.approved ? <X size={15} /> : <Check size={15} />}{partnerItem.approved ? 'Revoke approval' : 'Approve partner'}
                </Button>
              </article>)}
            </div>
          </section>}
          {tab === 'quality' && canManagePartnerOperations && <FacilityQualityControl lang={language} />}
          {tab === 'reviews' && canManagePartnerOperations && <FacilityReviewsPortal language={language} isAdmin={isAdmin} />}
          {tab === 'marketing' && canManageMarketing && <PartnerMarketingCenter language={language} offerings={offerings} />}
          {tab === 'analytics' && canViewReports && <OperationsAnalytics language={language} />}
          {tab === 'staff' && isPartnerOwner && <PartnerStaffManagement language={language} />}
          {!isAdmin && ((canManagePartnerOperations && (['facilities', 'bookings'] as OperationsTab[]).includes(tab as OperationsTab))
            || (canViewPartnerFinance && (['settlements', 'invoices'] as OperationsTab[]).includes(tab as OperationsTab))) &&
            <PartnerOperationsPanel tab={tab as OperationsTab} lang={language} partnerId={operations.data.partnerId ?? ''} isAdmin={false} attendance={rows} offerings={offerings} onNotice={setNotice} />}
        </div>
        <footer className="mx-auto mt-12 flex max-w-6xl items-center justify-between border-t border-[#ddd7c6] pt-5 text-[10px] font-semibold uppercase tracking-[.14em] text-[#879187]"><span>MaydanGo partner operations</span><span className="flex items-center gap-1"><Clock3 size={12} /> Iraq local time</span></footer>
         </LocalizedContent>
      </section>
    </div>
     {showCreate && <OfferingForm partnerId={isAdmin ? '' : operations.data.partnerId ?? ''} partners={operations.data.partners.filter(item => item.approved)} isAdmin={isAdmin} lang={language} onClose={() => setShowCreate(false)} onSaved={() => { invalidate(); setNotice(isAdmin ? 'Offering created.' : 'Saved as draft. Submit it to apply this partner’s activity-review mode.'); }} />}
  </main>;
}
