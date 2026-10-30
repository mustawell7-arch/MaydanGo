import { Children, cloneElement, isValidElement, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetOperationFacilitiesQueryKey, getGetOperationsQueryKey, useAddLiveOffering, useAddPartner, useApprovePartner, useCancelLiveOffering, useChangeLiveOffering, useCreateRecurringOfferings, useGetAttendance, useGetOperationFacilities, useGetOfferingWaitlist, useGetOperations, useRecordManualCheckin, useReviewAttendance, useReviewOffering, useSubmitOffering } from '@workspace/api-client-react';
import type { OfferingInput, OfferingUpdate, PartnerInput, RecordManualCheckinBody, ReviewAttendanceBody, RecurringOfferingsInput, OfferingReviewAction } from '@workspace/api-client-react';
import { useAuth, useClerk } from '@clerk/react';
import { Link, Redirect } from 'wouter';
import { Activity, ArrowLeft, ArrowUpRight, CalendarDays, Check, CircleAlert, Clock3, Dumbbell, FileText, LogOut, MapPin, Plus, RefreshCw, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import { FacilityProfiles } from '@/pages/facility-profiles';
import { PartnerOperationsPanel, type OperationsTab, type PortalLanguage } from '@/pages/partner-operations';

type Tab = 'overview' | 'offerings' | 'attendance' | 'waitlist' | 'partners' | OperationsTab;
type ReviewAction = ReviewAttendanceBody['action'];
const formatDate = (value: string) => new Intl.DateTimeFormat('en-IQ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(value));
const localIso = (value: string) => new Date(`${value}:00+03:00`).toISOString();
const portalLabels: Record<PortalLanguage, Record<string, string>> = {
  en: { overview: 'Overview', offerings: 'Offerings', attendance: 'Attendance', waitlist: 'Waiting list', partners: 'Partners', facilities: 'Facilities', bookings: 'Sessions & bookings', settlements: 'Settlements', invoices: 'Invoices', greeting: 'Good to see you.', attendanceTitle: 'Attendance review', approvals: 'Partner approvals', workspace: 'Partner operations', language: 'Language' },
  ar: { overview: 'نظرة عامة', offerings: 'العروض', attendance: 'الحضور', waitlist: 'قائمة الانتظار', partners: 'الشركاء', facilities: 'المرافق', bookings: 'الجلسات والحجوزات', settlements: 'التسويات', invoices: 'الفواتير', greeting: 'سعيدون بعودتك.', attendanceTitle: 'مراجعة الحضور', approvals: 'اعتماد الشركاء', workspace: 'عمليات الشركاء', language: 'اللغة' },
  ku: { overview: 'پوختە', offerings: 'پێشکەشکراوەکان', attendance: 'ئامادەبوون', waitlist: 'لیستی چاوەڕوانی', partners: 'هاوبەشەکان', facilities: 'شوێنەکان', bookings: 'وانە و حجزەکان', settlements: 'یەکلاکردنەوە', invoices: 'پسووڵەکان', greeting: 'بەخێربێیتەوە.', attendanceTitle: 'پێداچوونەوەی ئامادەبوون', approvals: 'پەسەندکردنی هاوبەش', workspace: 'بەڕێوەبردنی هاوبەش', language: 'زمان' },
};
const portalLabel = (lang: PortalLanguage, key: string) => portalLabels[lang][key] ?? key;
const reviewActionLabels: Record<OfferingReviewAction, string> = {
  start_review: 'Start review', request_changes: 'Request changes', approve: 'Approve',
  reject: 'Reject', publish: 'Publish', suspend: 'Suspend', archive: 'Archive',
};
const reviewActionsByStatus: Record<string, OfferingReviewAction[]> = {
  draft: ['archive'],
  submitted: ['start_review', 'archive'],
  under_review: ['request_changes', 'approve', 'reject', 'archive'],
  changes_requested: ['archive'],
  approved: ['publish', 'archive'],
  published: ['suspend', 'archive'],
  suspended: ['publish', 'archive'],
  rejected: ['archive'],
  archived: [],
};
const readableStatus = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const localizedPhrases: Record<Exclude<PortalLanguage, 'en'>, Record<string, string>> = {
  ar: {
    'Partner access': 'صلاحية الشريك', 'Administrator access': 'صلاحية المدير', 'Workspace': 'مساحة العمل', 'Server-scoped access': 'الوصول محدد من الخادم',
    'Your MaydanGo space': 'مساحتك في MaydanGo', 'A clear view of partner activity and attendance.': 'عرض واضح لنشاط الشريك والحضور.',
    'Bring your sessions and community into view.': 'أدر جلساتك ومجتمعك من مكان واحد.', 'Manage the live opportunities and attendance roster assigned to your partner account.': 'أدر الفرص المتاحة وسجل الحضور المرتبط بحساب الشريك.',
    'Active offerings': 'العروض النشطة', 'Manage offerings': 'إدارة العروض', 'Next on the roster': 'القادم في سجل الحضور',
    'Attendance records in your server scope': 'سجلات الحضور ضمن نطاق الخادم', 'View all': 'عرض الكل', 'Roster unavailable · Retry': 'تعذر تحميل السجل · أعد المحاولة',
    'No attendance records were returned for this scope.': 'لا توجد سجلات حضور لهذا النطاق.', 'Scoped by the server': 'النطاق محدد من الخادم',
    'Your account role and partner boundary come from the operations service. Actions are checked again by MaydanGo when saved.': 'يحدد نظام العمليات دور الحساب ونطاق الشريك. وتتحقق MaydanGo من الصلاحيات مجدداً عند الحفظ.',
    'Administrator': 'مدير', 'Partner operator': 'مشغل شريك', 'Create and maintain opportunities from the authorized operations record.': 'أنشئ الفرص وأدرها من سجل العمليات المصرح به.',
    'New offering': 'عرض جديد', 'Cancelled': 'ملغى', 'Active': 'نشط', 'Draft': 'مسودة', 'Capacity / state': 'السعة / الحالة',
    'Make draft': 'تحويل إلى مسودة', 'Activate': 'تفعيل', 'Cancel': 'إلغاء', 'Capacity': 'السعة', 'Save': 'حفظ',
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
    'Saved as draft. Submit it for administrator review to continue.': 'تم حفظ المسودة. أرسلها إلى المدير للمراجعة للمتابعة.',
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
  },
  ku: {
    'Partner access': 'دەستگەیشتنی هاوبەش', 'Administrator access': 'دەستگەیشتنی بەڕێوەبەر', 'Workspace': 'شوێنی کار', 'Server-scoped access': 'دەستگەیشتن بە سنووری سێرڤەر',
    'Your MaydanGo space': 'شوێنی تۆ لە MaydanGo', 'A clear view of partner activity and attendance.': 'بینینێکی ڕوون بۆ چالاکی و ئامادەبوونی هاوبەش.',
    'Bring your sessions and community into view.': 'وانە و کۆمەڵگەکەت لە یەک شوێن بەڕێوەببە.', 'Manage the live opportunities and attendance roster assigned to your partner account.': 'دەرفەتە بەردەستەکان و تۆماری ئامادەبوونی پەیوەست بە هەژماری هاوبەشەکەت بەڕێوەببە.',
    'Active offerings': 'پێشکەشکراوە چالاکەکان', 'Manage offerings': 'بەڕێوەبردنی پێشکەشکراوەکان', 'Next on the roster': 'داهاتوو لە تۆماری ئامادەبوون',
    'Attendance records in your server scope': 'تۆمارەکانی ئامادەبوون لە سنووری سێرڤەر', 'View all': 'هەمووی ببینە', 'Roster unavailable · Retry': 'تۆمار بەردەست نییە · دووبارە هەوڵ بدە',
    'No attendance records were returned for this scope.': 'هیچ تۆمارێکی ئامادەبوون بۆ ئەم سنوورە نەگەڕایەوە.', 'Scoped by the server': 'سنوورەکە لەلایەن سێرڤەرەوە دیاریکراوە',
    'Your account role and partner boundary come from the operations service. Actions are checked again by MaydanGo when saved.': 'ڕۆڵی هەژمار و سنووری هاوبەش لە خزمەتگوزاریی بەڕێوەبردنەوە دێت. MaydanGo لە کاتی پاشەکەوتکردندا دووبارە پشتڕاستی دەکاتەوە.',
    'Administrator': 'بەڕێوەبەر', 'Partner operator': 'بەڕێوەبەری هاوبەش', 'Create and maintain opportunities from the authorized operations record.': 'دەرفەتەکان لە تۆماری ڕێگەپێدراوی بەڕێوەبردن دروست و بەڕێوەببە.',
    'New offering': 'پێشکەشکراوی نوێ', 'Cancelled': 'هەڵوەشێنراوەتەوە', 'Active': 'چالاک', 'Draft': 'ڕەشنووس', 'Capacity / state': 'توانا / دۆخ',
    'Make draft': 'بیکە بە ڕەشنووس', 'Activate': 'چالاکی بکە', 'Cancel': 'هەڵوەشاندنەوە', 'Capacity': 'توانا', 'Save': 'پاشەکەوت',
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
    'Saved as draft. Submit it for administrator review to continue.': 'ڕەشنووس پاشەکەوت کرا. بۆ بەردەوامبوون بینێرە بۆ پێداچوونەوەی بەڕێوەبەر.',
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
    '8-digit member code': 'کۆدی ٨ ژمارەیی ئەندام', 'Audit reason (at least 5 characters)': 'هۆکاری پشکنین (لانیکەم ٥ پیت)', 'Verifying…': 'پشتڕاست دەکرێتەوە…',
    'Verify and record arrival': 'پشتڕاستی بکەرەوە و گەیشتن تۆمار بکە', 'The server did not accept this code. It may be invalid, expired, or the attempt limit may have been reached. Ask the member to request a fresh code from their own reservation; staff cannot issue codes.': 'سێرڤەر کۆدەکەی قبوڵ نەکرد. لەوانەیە هەڵە، بەسەرچوو یان ژمارەی هەوڵ تەواو بووبێت. داوا لە ئەندام بکە کۆدی نوێ لە حجزەکەی خۆی وەربگرێت؛ کارمەند ناتوانێت کۆد دابین بکات.',
  },
};
function LocalizedContent({ lang, children }: { lang: PortalLanguage; children: ReactNode }) {
  if (lang === 'en') return <>{children}</>;
  return <>{Children.map(children, child => {
    if (typeof child === 'string') return localizedPhrases[lang][child] ?? child;
    if (isValidElement<{ children?: ReactNode }>(child)) return cloneElement(child, { children: <LocalizedContent lang={lang}>{child.props.children}</LocalizedContent> });
    return child;
  })}</>;
}

function fieldClass() {
  return 'mt-1 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3.5 py-2.5 text-sm text-[#173d35] placeholder:text-[#8b9288] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15';
}
function LabelField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-[#51665e]">{label}{children}</label>;
}
function Button({ children, onClick, kind = 'primary', disabled = false, type = 'button', testId }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'quiet' | 'danger'; disabled?: boolean; type?: 'button' | 'submit'; testId?: string }) {
  const style = kind === 'primary' ? 'bg-[#174d43] text-[#fff9e9] hover:bg-[#226556]' : kind === 'danger' ? 'border border-[#d9a89a] bg-[#fff5f1] text-[#9a4435] hover:bg-[#ffe8e0]' : 'border border-[#d8d2c4] bg-transparent text-[#36564b] hover:bg-[#f1eddf]';
  return <button data-testid={testId} type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${style}`}>{children}</button>;
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
const dateLabelBaghdad = (date: string) => new Intl.DateTimeFormat('en-IQ', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Baghdad' }).format(new Date(`${date}T12:00:00+03:00`));

function OfferingForm({ partnerId, partners, isAdmin, lang, onClose, onSaved }: { partnerId: string; partners: { id: string; name: string }[]; isAdmin: boolean; lang: PortalLanguage; onClose: () => void; onSaved: () => void }) {
  const add = useAddLiveOffering();
  const addRecurring = useCreateRecurringOfferings();
  const facilitiesQuery = useGetOperationFacilities({ query: { enabled: true, queryKey: getGetOperationFacilitiesQueryKey() } });
  const [message, setMessage] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState(partnerId);
  const [form, setForm] = useState({
    title: '', kind: 'session' as OfferingInput['kind'], facilityProfileId: '', city: '', facility: '', category: '', accessType: 'physical' as OfferingInput['accessType'],
    startsAt: '', endsAt: '', cancellationDeadline: '', capacity: '', waitlistOfferMinutes: '30', gender: 'all' as NonNullable<OfferingInput['gender']>, minAge: '', maxAge: '', joinUrl: '', tiers: '', active: false,
    localizedTitleEn: '', localizedTitleAr: '', localizedTitleKu: '',
    localizedDescriptionEn: '', localizedDescriptionAr: '', localizedDescriptionKu: '',
  });
  const facilityRecords = (facilitiesQuery.data ?? []).filter(item => item.partnerId === selectedPartnerId);
  const selectedFacility = facilityRecords.find(item => item.id === form.facilityProfileId);
  const update = (key: keyof typeof form, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  const firstDate = dateOnlyFromLocalInput(form.startsAt);
  const maxRepeatDate = firstDate ? shiftCalendarDate(firstDate, 90) : '';
  const previewDates = useMemo(() => {
    if (!firstDate || !repeatUntil || !weekdays.length || repeatUntil < firstDate) return [];
    const dates: string[] = [];
    for (let current = firstDate; current <= repeatUntil && dates.length <= 90; current = shiftCalendarDate(current, 1)) {
      if (weekdays.includes(calendarDay(current))) dates.push(current);
    }
    return dates;
  }, [firstDate, repeatUntil, weekdays]);
  const repeatDaySpan = firstDate && repeatUntil ? Math.round((Date.parse(`${repeatUntil}T12:00:00Z`) - Date.parse(`${firstDate}T12:00:00Z`)) / 86400000) : 0;
  const recurrenceIssue = recurring
    ? !weekdays.length ? 'Choose at least one weekday for the recurring sessions.'
      : !repeatUntil ? 'Choose an inclusive repeat-until date.'
        : repeatUntil < firstDate ? 'The repeat-until date must be on or after the first session date.'
          : repeatDaySpan > 90 ? 'The repeat-until date must be within 90 calendar days of the first session.'
            : previewDates.length > 90 ? 'This schedule creates more than 90 occurrences. Choose fewer weekdays or an earlier end date.'
              : previewDates.length === 0 ? 'No sessions match the selected weekdays and date range.'
                : '' : '';
  const pending = add.isPending || addRecurring.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    if (pending) return;
    if (!form.startsAt || !form.endsAt || !form.cancellationDeadline || Date.parse(`${form.endsAt}:00+03:00`) <= Date.parse(`${form.startsAt}:00+03:00`)) {
      setMessage('Add valid session start, end, and cancellation times. The end must be after the start.');
      return;
    }
    if (recurring && recurrenceIssue) { setMessage(recurrenceIssue); return; }
    if (!selectedPartnerId) { setMessage('Select a partner before creating this offering.'); return; }
    if (!selectedFacility) { setMessage('Choose a shared facility record before creating this offering.'); return; }
    const isLive = form.accessType === 'live';
    if (isLive && [form.localizedTitleEn, form.localizedTitleAr, form.localizedTitleKu, form.localizedDescriptionEn, form.localizedDescriptionAr, form.localizedDescriptionKu].some(value => !value.trim())) {
      setMessage('Live online offerings need a title and description in English, Iraqi Arabic, and Sorani.');
      return;
    }
    if (isLive && !/^https:\/\//i.test(form.joinUrl.trim())) {
      setMessage('Live online offerings require a secure HTTPS join URL.');
      return;
    }
    const data: OfferingInput = {
      partnerId: selectedPartnerId, title: form.title.trim(), kind: form.kind, city: selectedFacility.city, facility: selectedFacility.facility, category: form.category.trim(),
      accessType: form.accessType, tiers: form.tiers.split(',').map(item => item.trim()).filter(Boolean),
      startsAt: localIso(form.startsAt), endsAt: localIso(form.endsAt), cancellationDeadline: localIso(form.cancellationDeadline),
      capacity: Number(form.capacity), waitlistOfferMinutes: Number(form.waitlistOfferMinutes),
      gender: form.gender, ...(form.minAge ? { minAge: Number(form.minAge) } : {}), maxAge: form.maxAge ? Number(form.maxAge) : null,
      joinUrl: form.joinUrl.trim() || null, active: isAdmin && form.active,
      ...(isLive ? {
        localizedTitle: { en: form.localizedTitleEn.trim(), ar: form.localizedTitleAr.trim(), ku: form.localizedTitleKu.trim() },
        localizedDescription: { en: form.localizedDescriptionEn.trim(), ar: form.localizedDescriptionAr.trim(), ku: form.localizedDescriptionKu.trim() },
      } : {}),
    };
    const onSuccess = () => { onSaved(); onClose(); };
    const onError = (error: unknown) => {
      const candidate = error as { status?: number; response?: { status?: number }; message?: string };
      const status = candidate?.status ?? candidate?.response?.status;
      setMessage(status === 409
        ? 'This schedule conflicts with an existing offering. Adjust the dates or weekdays and try again.'
        : candidate?.message || 'The offering could not be saved. Check the details and try again.');
    };
    if (recurring) {
      const recurringData: RecurringOfferingsInput = { template: { ...data }, schedule: { repeatUntil, weekdays: [...weekdays].sort((a, b) => a - b) } };
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
        {isAdmin && <LabelField label="Partner"><select required className={fieldClass()} value={selectedPartnerId} onChange={e => { setSelectedPartnerId(e.target.value); setForm(current => ({ ...current, facilityProfileId: '', city: '', facility: '' })); }}><option value="">Choose a partner</option>{partners.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></LabelField>}
        <LabelField label="Offering title"><input required maxLength={160} className={fieldClass()} value={form.title} onChange={e => update('title', e.target.value)} /></LabelField>
        <LabelField label="Format"><select data-testid="select-offering-kind" className={fieldClass()} value={form.kind} onChange={e => { update('kind', e.target.value); if (e.target.value !== 'session') { setRecurring(false); setWeekdays([]); setRepeatUntil(''); } }}><option value="session">Session</option><option value="event">Event</option><option value="coach">Coaching</option></select></LabelField>
        <LabelField label="Shared facility"><select required className={fieldClass()} value={form.facilityProfileId} disabled={facilitiesQuery.isLoading || !facilityRecords.length} onChange={e => {
          const next = facilityRecords.find(item => item.id === e.target.value);
          setForm(current => ({ ...current, facilityProfileId: e.target.value, city: next?.city ?? '', facility: next?.facility ?? '' }));
        }}><option value="">{facilitiesQuery.isLoading ? 'Loading shared facilities…' : 'Choose a shared facility'}</option>{facilityRecords.map(item => <option key={item.id} value={item.id}>{item.localizedName[lang] || item.facility} · {item.city}</option>)}</select>{!facilitiesQuery.isLoading && facilityRecords.length === 0 && <span className="mt-1 block text-[11px] font-normal text-[#9a4435]">Create a shared facility record before adding sessions.</span>}{selectedFacility && <span className="mt-1 block text-[11px] font-normal text-[#75847c]">{selectedFacility.localizedAddress[lang]}</span>}</LabelField>
        <LabelField label="Category"><input required className={fieldClass()} value={form.category} onChange={e => update('category', e.target.value)} /></LabelField>
        <LabelField label="Access"><select className={fieldClass()} value={form.accessType} onChange={e => update('accessType', e.target.value)}><option value="physical">In person</option><option value="premium">Premium</option><option value="live">Live online</option></select></LabelField>
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
          </div>
        </div>}
        {dateInput('startsAt', 'Starts at')}{dateInput('endsAt', 'Ends at')}{dateInput('cancellationDeadline', 'Cancellation deadline')}
        {form.kind === 'session' && <div className="rounded-2xl border border-[#d8d2c4] bg-[#f2efe4] p-4 sm:col-span-2" data-testid="panel-recurring-schedule">
          <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-[#36564b]">
            <input data-testid="toggle-recurring-session" type="checkbox" checked={recurring} onChange={event => { setRecurring(event.target.checked); setMessage(''); }} className="mt-0.5 accent-[#174d43]" />
            <span><span className="block">Repeat this session weekly</span><span className="mt-1 block text-xs font-normal leading-5 text-[#75847c]">Each date becomes a separate offering. Dates and times are interpreted in Asia/Baghdad.</span></span>
          </label>
          {recurring && <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-xs font-semibold text-[#51665e]">Repeat on</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {weekdayNames.map((day, index) => <label key={day} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${weekdays.includes(index) ? 'border-[#28695a] bg-[#e1ece5] text-[#174d43]' : 'border-[#d8d2c4] bg-[#fffdf7] text-[#687a71]'}`}>
                  <input data-testid={`weekday-${index}`} type="checkbox" checked={weekdays.includes(index)} onChange={event => { setWeekdays(current => event.target.checked ? [...current, index].sort((a, b) => a - b) : current.filter(value => value !== index)); setMessage(''); }} className="accent-[#174d43]" />
                  {day}
                </label>)}
              </div>
            </fieldset>
            <LabelField label="Repeat until · inclusive"><input data-testid="input-repeat-until" required={recurring} type="date" min={firstDate || undefined} max={maxRepeatDate || undefined} className={fieldClass()} value={repeatUntil} onChange={event => { setRepeatUntil(event.target.value); setMessage(''); }} /><span className="mt-1 block text-[11px] font-normal text-[#75847c]">Up to 90 calendar days after the first date, and no more than 90 occurrences.</span></LabelField>
            {recurrenceIssue ? <p data-testid="status-recurring-validation" role="status" className="rounded-xl border border-[#e0c4b9] bg-[#fff7f3] px-3 py-2 text-xs leading-5 text-[#9a4435]">{recurrenceIssue}</p> : <div data-testid="status-recurring-preview" className="rounded-xl border border-[#cfddcf] bg-[#f8fbf4] p-3">
              <div className="flex items-baseline justify-between gap-3"><p className="text-xs font-bold text-[#36564b]">Baghdad-time preview</p><p className="font-mono text-xs font-bold text-[#174d43]">{previewDates.length} {previewDates.length === 1 ? 'occurrence' : 'occurrences'}</p></div>
              <p className="mt-1 text-[11px] text-[#75847c]">At {form.startsAt.slice(11) || '—'} local time · inclusive through {repeatUntil ? dateLabelBaghdad(repeatUntil) : '—'}</p>
              {previewDates.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{previewDates.map(date => <span key={date} data-testid={`preview-date-${date}`} className="rounded-lg bg-[#e7eee4] px-2 py-1 text-[10px] font-semibold text-[#36564b]">{dateLabelBaghdad(date)}</span>)}</div>}
            </div>}
          </div>}
        </div>}
        <LabelField label="Capacity"><input required min="1" type="number" className={fieldClass()} value={form.capacity} onChange={e => update('capacity', e.target.value)} /></LabelField>
        <LabelField label="Waitlist offer window (minutes)"><input required min="5" max="1440" type="number" className={fieldClass()} value={form.waitlistOfferMinutes} onChange={e => update('waitlistOfferMinutes', e.target.value)} /></LabelField>
        <LabelField label="Gender access"><select className={fieldClass()} value={form.gender} onChange={e => update('gender', e.target.value)}><option value="all">All</option><option value="female">Female</option><option value="male">Male</option></select></LabelField>
        <LabelField label="Minimum age"><input type="number" min="0" className={fieldClass()} value={form.minAge} onChange={e => update('minAge', e.target.value)} /></LabelField>
        <LabelField label="Maximum age (optional)"><input type="number" min="0" className={fieldClass()} value={form.maxAge} onChange={e => update('maxAge', e.target.value)} /></LabelField>
        <LabelField label="Membership tiers (comma separated)"><input required placeholder="Use tiers configured for your offering" className={fieldClass()} value={form.tiers} onChange={e => update('tiers', e.target.value)} /></LabelField>
        <LabelField label="Join URL (optional)"><input type="url" className={fieldClass()} value={form.joinUrl} onChange={e => update('joinUrl', e.target.value)} /></LabelField>
        {isAdmin ? <label className="flex items-center gap-3 rounded-xl bg-[#eeeadc] px-4 py-3 text-sm font-medium text-[#36564b] sm:col-span-2"><input type="checkbox" checked={form.active} onChange={e => update('active', e.target.checked)} className="accent-[#174d43]" />Publish as active</label> : <p className="rounded-xl bg-[#eeeadc] px-4 py-3 text-sm text-[#36564b] sm:col-span-2">New activities are saved as drafts and must be approved by an administrator before publishing.</p>}
         {message && <p data-testid="status-offering-error" role="alert" className="text-sm text-[#a33d2e] sm:col-span-2">{message}</p>}
         <div className="flex justify-end gap-3 pt-2 sm:col-span-2"><Button kind="quiet" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending || Boolean(recurrenceIssue)}><Plus size={16} />{pending ? 'Saving…' : recurring ? 'Create recurring sessions' : 'Create offering'}</Button></div>
      </form>
    </section>
  </div></LocalizedContent>;
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
            <p className="mt-1 text-[10px] text-[#75847c]">Joined {formatDate(entry.createdAt)}{entry.offerExpiresAt ? ` · offer ends ${formatDate(entry.offerExpiresAt)}` : ''}</p>
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
  const attendance = useGetAttendance({ query: { retry: false, enabled: isLoaded && isSignedIn && operations.data?.role !== 'finance' } });
  const addPartner = useAddPartner();
  const approvePartner = useApprovePartner();
  const updateOffering = useChangeLiveOffering();
  const submitOffering = useSubmitOffering();
  const reviewOffering = useReviewOffering();
  const cancelOffering = useCancelLiveOffering();
  const review = useReviewAttendance();
  const [language, setLanguage] = useState<PortalLanguage>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('maydango-partner-language') : null;
    return saved === 'ar' || saved === 'ku' ? saved : 'en';
  });
  const [tab, setTab] = useState<Tab>('overview');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ id: string; action: ReviewAction } | null>(null);
  const [manualChecking, setManualChecking] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [partnerForm, setPartnerForm] = useState<PartnerInput>({ name: '', groupId: '', ownerUserId: '' });
  const role = operations.data?.role;
  const offerings = operations.data?.offerings ?? [];
  const waitlist = operations.data?.waitlist ?? [];
  const rows = attendance.data?.rows ?? [];
  const activeOfferings = useMemo(() => offerings.filter(item => item.active && !item.cancelledAt).length, [offerings]);
  const awaitingOfferings = useMemo(() => offerings.filter(item => ['submitted', 'under_review'].includes(item.activityStatus)).length, [offerings]);
  const changesRequestedOfferings = useMemo(() => offerings.filter(item => item.activityStatus === 'changes_requested').length, [offerings]);
  const approvedOfferings = useMemo(() => offerings.filter(item => item.activityStatus === 'approved').length, [offerings]);
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
  if (operations.data?.role === 'finance') return <Redirect to="/finance" />;
  const apiStatus = (operations.error as { status?: number } | null)?.status;
  if (operations.isError && (apiStatus === 401 || apiStatus === 403)) return <main className="grid min-h-[100dvh] place-items-center bg-[#f3f0e5] p-5"><section className="max-w-lg rounded-[2rem] border border-[#ddd7c6] bg-[#fffdf7] p-8 text-center shadow-sm"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f2dfd5] text-[#9a4435]"><ShieldCheck /></div><h1 className="mt-5 font-display text-3xl font-bold text-[#173d35]">Portal access is not enabled</h1><p className="mt-3 text-sm leading-6 text-[#61736b]">Your MaydanGo account is signed in, but it does not have an approved partner or administrator role. No partner or attendance information is available for this account.</p><div className="mt-6 flex justify-center gap-3"><Link href="/" className="rounded-xl border border-[#d8d2c4] px-4 py-2.5 text-sm font-semibold text-[#36564b]">Public website</Link><Button onClick={() => signOut({ redirectUrl: '/' })}><LogOut size={15} />Sign out</Button></div></section></main>;
  if (operations.isError) return <main className="grid min-h-[100dvh] place-items-center bg-[#f3f0e5] p-5"><section className="max-w-md rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-8 text-center"><CircleAlert className="mx-auto text-[#a76445]" size={30} /><h1 className="mt-4 font-display text-2xl font-bold text-[#173d35]">Could not load operations</h1><p className="mt-2 text-sm text-[#61736b]">The MaydanGo operations service did not respond. Your partner scope has not been loaded.</p><Button onClick={() => { void operations.refetch(); }}><RefreshCw size={15} />Try again</Button></section></main>;
  if (operations.isLoading || !operations.data) return <main className="min-h-[100dvh] bg-[#f3f0e5] p-6"><div className="mx-auto max-w-6xl animate-pulse"><div className="h-16 w-64 rounded-xl bg-[#e2dece]" /><div className="mt-8 h-64 rounded-3xl bg-[#e2dece]" /></div></main>;

  const isAdmin = role === 'admin';
  const partner = operations.data.partners.find(item => item.id === operations.data.partnerId);
  const title = isAdmin ? 'Operations desk' : partner?.name ?? 'Partner workspace';
  const mutationError = (label: string) => setNotice(`${label} could not be completed. The server did not accept the change.`);
  const handleApproval = (id: string, approved: boolean) => approvePartner.mutate({ id, data: { approved } }, { onSuccess: invalidate, onError: () => mutationError('Partner review') });
  const handleStatus = (id: string, capacity: number, waitlistOfferMinutes?: number) => {
    const data: OfferingUpdate = { capacity, ...(waitlistOfferMinutes === undefined ? {} : { waitlistOfferMinutes }) };
    updateOffering.mutate({ id, data }, { onSuccess: invalidate, onError: () => mutationError('Offering update') });
  };
  const submitActivityForReview = (id: string) => submitOffering.mutate({ id }, {
    onSuccess: () => { invalidate(); setNotice('Activity submitted for administrator review.'); },
    onError: () => mutationError('Activity submission'),
  });
  const runActivityReview = (id: string, action: OfferingReviewAction) => {
    const needsReason = ['request_changes', 'reject', 'suspend', 'archive'].includes(action);
    const enteredReason = needsReason ? window.prompt(`Reason for ${action.replaceAll('_', ' ')} (at least 5 characters):`) : null;
    if (needsReason && (!enteredReason || enteredReason.trim().length < 5)) {
      setNotice('Enter a reason of at least 5 characters to continue.');
      return;
    }
    reviewOffering.mutate({
      id,
      data: { action, ...(enteredReason ? { reason: enteredReason.trim() } : {}) },
    }, {
      onSuccess: result => {
        invalidate();
        setNotice(`Activity status updated to ${result.activityStatus.replaceAll('_', ' ')}.`);
      },
      onError: () => mutationError('Activity review'),
    });
  };
  const runReview = (event: FormEvent) => {
    event.preventDefault();
    if (!reviewing || reason.trim().length < 5) return;
    review.mutate({ id: reviewing.id, data: { action: reviewing.action, reason: reason.trim() } }, {
      onSuccess: () => { invalidate(); setReviewing(null); setReason(''); setNotice('Attendance review recorded.'); },
      onError: () => mutationError('Attendance review'),
    });
  };
  const actionLabel: Record<string, string> = { confirm: 'Confirm', no_show: 'Mark no-show', dispute: 'Dispute', resolve_confirm: 'Resolve: confirm', resolve_void: 'Resolve: void', accept_request: 'Accept request' };
  return <main dir={language === 'en' ? 'ltr' : 'rtl'} lang={language} className={`min-h-[100dvh] bg-[#f3f0e5] text-[#173d35] ${language !== 'en' ? 'rtl-copy' : ''}`}>
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b border-[#dcd6c6] bg-[#e9e5d7] px-5 py-4 lg:sticky lg:top-0 lg:h-[100dvh] lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
         <Link href="/" className="inline-flex items-center gap-3"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="MaydanGo" className="h-10 w-10" /><span className="font-display text-lg font-bold tracking-tight">MaydanGo<span className="block font-sans text-[9px] font-bold uppercase tracking-[.18em] text-[#a76445]">{portalLabel(language, 'workspace')}</span></span></Link>
        <div className="mt-8 hidden rounded-2xl bg-[#f8f5eb] p-4 lg:block"><p className="text-[9px] font-bold uppercase tracking-[.17em] text-[#a76445]">Workspace</p><p className="mt-2 truncate text-sm font-bold">{title}</p><p className="mt-1 text-xs text-[#687a71]">{isAdmin ? 'Administrator access' : 'Partner access'}</p></div>
        <nav aria-label="Portal navigation" className="mt-5 flex gap-2 overflow-x-auto lg:mt-8 lg:flex-col">
          {([['overview', Activity], ['offerings', Dumbbell], ['attendance', CalendarDays], ['waitlist', Clock3], ['facilities', MapPin], ...(isAdmin ? [['partners', Users]] as const : [['bookings', CalendarDays], ['settlements', Wallet], ['invoices', FileText]] as const)] as const).map(([id, Icon]) => <button data-testid={`tab-${id}`} key={id} onClick={() => setTab(id as Tab)} aria-current={tab === id ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition ${tab === id ? 'bg-[#174d43] text-[#fff9e9]' : 'text-[#536b61] hover:bg-[#dedaca]'}`}><Icon size={16} />{portalLabel(language, id)}{id === 'waitlist' ? ` · ${waitlist.length}` : ''}</button>)}
        </nav>
         <div className="mt-8 hidden border-t border-[#d6d0bf] pt-5 lg:block">{isAdmin && <Link href="/finance" className="mb-4 flex items-center gap-2 text-xs font-semibold text-[#174d43] hover:text-[#28695a]"><Wallet size={14} />Finance desk</Link>}<Link href="/" className="flex items-center gap-2 text-xs font-semibold text-[#63766d] hover:text-[#174d43]"><ArrowLeft size={14} />Public MaydanGo site</Link><button onClick={() => signOut({ redirectUrl: '/' })} className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#63766d] hover:text-[#9a4435]"><LogOut size={14} />Sign out</button></div>
      </aside>
      <section className="min-w-0 px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
        <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.21em] text-[#a76445]">MAYDANGO · IRAQ</p><h1 className="mt-2 font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">{portalLabel(language, tab === 'overview' ? 'greeting' : tab === 'attendance' ? 'attendanceTitle' : tab === 'partners' ? 'approvals' : tab)}</h1><p className="mt-2 text-sm text-[#687a71]">{title}</p></div><div className="flex items-center gap-2"><label className="text-[10px] font-bold text-[#687a71]">{portalLabel(language, 'language')}<select aria-label={portalLabel(language, 'language')} value={language} onChange={e => changeLanguage(e.target.value as PortalLanguage)} className="ml-2 rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-2.5 py-2 text-xs text-[#173d35]"><option value="en">English</option><option value="ar">العربية العراقية</option><option value="ku">کوردیی سۆرانی</option></select></label><div className="flex items-center gap-2 lg:hidden"><Button kind="quiet" onClick={() => signOut({ redirectUrl: '/' })}><LogOut size={15} />Exit</Button></div><div className="hidden items-center gap-2 rounded-full border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-xs font-semibold text-[#536b61] sm:flex"><span className="h-2 w-2 rounded-full bg-[#4a8a69]" />Server-scoped access</div></div></header>
        <LocalizedContent lang={language}>
          {notice && <div role="status" className="mx-auto mt-5 flex max-w-6xl items-center justify-between rounded-xl border border-[#d8c6a5] bg-[#fff8e8] px-4 py-3 text-sm text-[#715533]">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15} /></button></div>}
        <div className="mx-auto mt-8 max-w-6xl">
          {tab === 'facilities' && isAdmin && <FacilityProfiles isAdmin partnerId={operations.data.partnerId} partners={operations.data.partners} />}
          {tab === 'overview' && <div>
            <div className="grid gap-4 sm:grid-cols-3"><article className="rounded-3xl bg-[#174d43] p-5 text-[#fff9e9] sm:col-span-2 sm:p-7"><div className="flex items-start justify-between"><span className="text-xs font-semibold uppercase tracking-[.16em] text-[#d4dfcf]">Your MaydanGo space</span><Activity size={19} className="text-[#e1a17e]" /></div><p className="mt-9 max-w-lg font-display text-2xl font-semibold leading-tight sm:text-3xl">{isAdmin ? 'A clear view of partner activity and attendance.' : 'Bring your sessions and community into view.'}</p><p className="mt-3 max-w-lg text-sm leading-6 text-[#d1dfd6]">{isAdmin ? 'Review the partner and offering records returned for your administrator account.' : 'Manage the live opportunities and attendance roster assigned to your partner account.'}</p></article>
              <article className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#6e8077]">Active offerings</p><p className="mt-4 font-display text-4xl font-bold">{activeOfferings}</p><p className="mt-2 text-xs text-[#75847c]">Of {offerings.length} server-listed offerings</p><button onClick={() => setTab('offerings')} className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#28695a]">Manage offerings<ArrowUpRight size={13} /></button></article></div>
             {!isAdmin && <section data-testid="activity-approval-summary" aria-label={portalLabel(language, 'offerings')} className="mt-5 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
               <div className="flex flex-wrap items-center justify-between gap-3">
                 <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a76445]">Partner activity</p><h2 className="mt-1 font-display text-xl font-bold">{portalLabel(language, 'offerings')}</h2></div>
                 <button data-testid="button-view-activity-status" type="button" onClick={() => setTab('offerings')} className="inline-flex items-center gap-1 text-xs font-bold text-[#28695a]">Manage offerings<ArrowUpRight size={13} /></button>
               </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
                 {[
                    { id: 'awaiting-review', label: 'Submitted / under review', count: awaitingOfferings, tone: 'bg-[#f5f1e6] text-[#756e5b]' },
                    { id: 'changes-requested', label: 'Changes requested', count: changesRequestedOfferings, tone: 'bg-[#fff1e5] text-[#a76445]' },
                    { id: 'approved', label: 'Approved', count: approvedOfferings, tone: 'bg-[#e8f0f3] text-[#426879]' },
                    { id: 'published', label: 'Published', count: activeOfferings, tone: 'bg-[#e1efdf] text-[#2d6d4a]' },
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
            {tab === 'offerings' && <section><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[#75847c]">Create and maintain opportunities from the authorized operations record.</p></div><Button onClick={() => setShowCreate(true)}><Plus size={16} />New offering</Button></div>{offerings.length ? <div className="grid gap-4">{offerings.map(item => {
              const actions = reviewActionsByStatus[item.activityStatus] ?? [];
              const canSubmit = !isAdmin && ['draft', 'changes_requested'].includes(item.activityStatus) && !item.cancelledAt;
              const activityTone = item.activityStatus === 'published' ? 'bg-[#e1efdf] text-[#2d6d4a]' : item.activityStatus === 'approved' ? 'bg-[#e8f0f3] text-[#426879]' : ['rejected', 'suspended'].includes(item.activityStatus) ? 'bg-[#f2dfd5] text-[#9a4435]' : item.activityStatus === 'changes_requested' ? 'bg-[#fff1e5] text-[#a76445]' : 'bg-[#eeeadc] text-[#756e5b]';
              return <article key={item.id} className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span data-testid={`offering-activity-status-${item.id}`} className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${item.cancelledAt ? 'bg-[#f2dfd5] text-[#9a4435]' : activityTone}`}>{item.cancelledAt ? 'Cancelled' : readableStatus(item.activityStatus)}</span>
                      <span data-testid={`offering-session-status-${item.id}`} className="rounded-full bg-[#f2efe4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#536b61]">{readableStatus(item.sessionStatus)}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-[#a76445]">{item.kind}</span>
                    </div>
                    <h2 className="mt-3 font-display text-xl font-bold">{item.localizedTitle?.[language] || item.title}</h2>
                    <p className="mt-1 text-sm text-[#687a71]">{item.facility}, {item.city} · {item.category}</p>
                    <p className="mt-3 text-xs text-[#75847c]">{formatDate(item.startsAt)} – {formatDate(item.endsAt)}{item.remaining !== undefined ? ` · ${item.remaining} remaining` : ''}</p>
                    <p className="mt-2 text-xs text-[#75847c]">Waitlist offers expire after {item.waitlistOfferMinutes ?? 30} minutes.</p>
                    {item.reviewNote && <p data-testid={`offering-review-note-${item.id}`} className="mt-3 rounded-xl border border-[#e4cdb5] bg-[#fff7eb] px-3 py-2 text-xs leading-5 text-[#715533]"><strong>Administrator note:</strong> {item.reviewNote}</p>}
                    {isAdmin && item.partnerName && <p className="mt-2 text-xs text-[#75847c]">Partner: {item.partnerName}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!item.cancelledAt && <Button kind="quiet" onClick={() => setEditing(item.id)}>Edit details</Button>}
                    {canSubmit && <Button testId={`submit-offering-${item.id}`} onClick={() => submitActivityForReview(item.id)} disabled={submitOffering.isPending}><Check size={15} />Submit for review</Button>}
                    {isAdmin && !item.cancelledAt && actions.map(action => <Button key={action} testId={`review-offering-${action}-${item.id}`} kind={action === 'reject' || action === 'suspend' || action === 'archive' ? 'danger' : 'quiet'} onClick={() => runActivityReview(item.id, action)} disabled={reviewOffering.isPending}>{reviewActionLabels[action]}</Button>)}
                    {!item.cancelledAt && <Button kind="danger" onClick={() => { if (window.confirm(`Cancel “${item.title}”? Cancelling releases existing reservations and notifies members. This cannot be undone.`)) cancelOffering.mutate({ id: item.id }, { onSuccess: invalidate, onError: () => mutationError('Cancellation') }); }}>Cancel</Button>}
                  </div>
                </div>
                {editing === item.id && <form className="mt-5 grid gap-3 rounded-2xl bg-[#f2efe4] p-4 sm:grid-cols-2" onSubmit={event => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);
                  const title = { en: String(fields.get('titleEn') ?? '').trim(), ar: String(fields.get('titleAr') ?? '').trim(), ku: String(fields.get('titleKu') ?? '').trim() };
                  const description = { en: String(fields.get('descriptionEn') ?? '').trim(), ar: String(fields.get('descriptionAr') ?? '').trim(), ku: String(fields.get('descriptionKu') ?? '').trim() };
                  const hasTitle = Object.values(title).some(Boolean);
                  const hasDescription = Object.values(description).some(Boolean);
                  const titleChanged = hasTitle && (!item.localizedTitle || title.en !== item.localizedTitle.en || title.ar !== item.localizedTitle.ar || title.ku !== item.localizedTitle.ku);
                  const descriptionChanged = hasDescription && (!item.localizedDescription || description.en !== item.localizedDescription.en || description.ar !== item.localizedDescription.ar || description.ku !== item.localizedDescription.ku);
                  const joinUrl = String(fields.get('joinUrl') ?? '').trim();
                  const joinUrlChanged = joinUrl !== (item.joinUrl ?? '');
                  if ((hasTitle && Object.values(title).some(value => !value)) || (hasDescription && Object.values(description).some(value => !value))) {
                    setNotice('When editing localized content, provide English, Iraqi Arabic, and Sorani Kurdish together.');
                    return;
                  }
                  const update: OfferingUpdate = {
                    capacity: Number(fields.get('capacity')),
                    waitlistOfferMinutes: Number(fields.get('waitlistOfferMinutes')),
                    ...(titleChanged ? { localizedTitle: title } : {}),
                    ...(descriptionChanged ? { localizedDescription: description } : {}),
                    ...(joinUrlChanged ? { joinUrl: joinUrl || null } : {}),
                  };
                  updateOffering.mutate({ id: item.id, data: update }, {
                    onSuccess: () => { invalidate(); setEditing(null); setNotice('Offering details saved.'); },
                    onError: () => mutationError('Offering update'),
                  });
                }}>
                  <LabelField label="Capacity"><input required min="1" name="capacity" defaultValue={item.capacity} type="number" className={fieldClass()} /></LabelField>
                  <LabelField label="Waitlist offer window (minutes)"><input required min="5" max="1440" name="waitlistOfferMinutes" defaultValue={item.waitlistOfferMinutes ?? 30} type="number" className={fieldClass()} /></LabelField>
                  <LabelField label="Title · English"><input maxLength={240} name="titleEn" defaultValue={item.localizedTitle?.en ?? ''} placeholder={item.title} className={fieldClass()} /></LabelField>
                  <LabelField label="Title · Iraqi Arabic"><input maxLength={240} name="titleAr" defaultValue={item.localizedTitle?.ar ?? ''} dir="rtl" className={fieldClass()} /></LabelField>
                  <LabelField label="Title · Sorani Kurdish"><input maxLength={240} name="titleKu" defaultValue={item.localizedTitle?.ku ?? ''} dir="rtl" className={fieldClass()} /></LabelField>
                  <LabelField label="Join URL (optional)"><input type="url" name="joinUrl" defaultValue={item.joinUrl ?? ''} className={fieldClass()} /></LabelField>
                  <LabelField label="Description · English"><textarea maxLength={240} rows={3} name="descriptionEn" defaultValue={item.localizedDescription?.en ?? ''} className={fieldClass()} /></LabelField>
                  <LabelField label="Description · Iraqi Arabic"><textarea maxLength={240} rows={3} name="descriptionAr" defaultValue={item.localizedDescription?.ar ?? ''} dir="rtl" className={fieldClass()} /></LabelField>
                  <LabelField label="Description · Sorani Kurdish"><textarea maxLength={240} rows={3} name="descriptionKu" defaultValue={item.localizedDescription?.ku ?? ''} dir="rtl" className={fieldClass()} /></LabelField>
                  <div className="flex items-end gap-2"><Button type="submit" disabled={updateOffering.isPending}>Save changes</Button><Button kind="quiet" onClick={() => setEditing(null)}>Close</Button></div>
                </form>}
                {!item.cancelledAt && <form className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-[#f2efe4] p-4" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); handleStatus(item.id, item.capacity, Number(data.get('waitlistOfferMinutes'))); }}>
                <LabelField label="Waitlist offer window (minutes)"><input required min="5" max="1440" name="waitlistOfferMinutes" defaultValue={item.waitlistOfferMinutes ?? 30} type="number" className={fieldClass()} /></LabelField>
                <Button type="submit" disabled={updateOffering.isPending}>Save offer window</Button>
              </form>}
              <WaitlistPanel offeringId={item.id} lang={language} />
            </article>;
            })}</div> : <div className="rounded-3xl border border-dashed border-[#d5cfbf] bg-[#fffdf7]/60 p-10 text-center"><Dumbbell className="mx-auto text-[#a76445]" /><h2 className="mt-4 font-display text-xl font-bold">No offerings returned</h2><p className="mt-2 text-sm text-[#75847c]">Create an offering to start managing your available sessions and events.</p></div>}</section>}
          {tab === 'waitlist' && <section>
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
                <span aria-label={`Waiting-list position ${entry.position}`} className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-[#e1efdf] px-3 py-2 text-xs font-bold text-[#2d6d4a]">
                  <Clock3 size={14} />Position {entry.position}
                </span>
              </article>
            ))}</div> : <div className="rounded-3xl border border-dashed border-[#d5cfbf] bg-[#fffdf7]/60 p-10 text-center">
              <Clock3 className="mx-auto text-[#a76445]" /><h2 className="mt-4 font-display text-xl font-bold">No one is waiting</h2>
              <p className="mt-2 text-sm text-[#75847c]">Active queues for your upcoming offerings will appear here.</p>
            </div>}
          </section>}
          {tab === 'attendance' && <section><div className="mb-5 flex items-end justify-between"><p className="max-w-2xl text-sm leading-6 text-[#687a71]">Review reservations in the server-scoped roster. Member names are not returned or displayed; each decision requires a reason and is recorded by the service.</p><Button kind="quiet" onClick={() => void attendance.refetch()}><RefreshCw size={15} />Refresh</Button></div>{attendance.isLoading ? <div className="h-48 animate-pulse rounded-3xl bg-[#e5e0d1]" /> : attendance.isError ? <div role="alert" className="rounded-3xl border border-[#e0c4b9] bg-[#fff7f3] p-7"><p className="font-semibold">Attendance roster unavailable</p><Button onClick={() => void attendance.refetch()}>Retry</Button></div> : rows.length ? <div className="grid gap-4">{rows.map(row => {
            const state = `${row.status} ${row.bookingStatus}`.toLowerCase();
            const actions: ReviewAction[] = state.includes('disput') ? role === 'admin' ? ['resolve_confirm', 'resolve_void'] : [] : state.includes('request') ? ['accept_request', 'dispute'] : ['confirm', 'no_show', 'dispute'];
            const attendanceDetails = row as typeof row & { manualCheckin?: boolean; manualRepeatUse?: boolean };
            const hasCurrentPolicyWindow = row.policy !== undefined && Number.isFinite(Date.parse(row.policy.opensAt)) && Number.isFinite(Date.parse(row.policy.closesAt)) && Date.now() >= Date.parse(row.policy.opensAt) && Date.now() <= Date.parse(row.policy.closesAt);
            const canManualCheckin = role === 'partner' && !row.locked && row.status === 'not_checked_in' && row.bookingStatus === 'reserved' && hasCurrentPolicyWindow;
            return <article key={row.reservationId} className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#eeeadc] px-2.5 py-1 text-[10px] font-bold text-[#536b61]">{row.status.replaceAll('_', ' ')}</span>{row.locked && <span className="rounded-full bg-[#f2dfd5] px-2.5 py-1 text-[10px] font-bold text-[#9a4435]">Locked</span>}{row.settlementEligible && <span className="rounded-full bg-[#e1efdf] px-2.5 py-1 text-[10px] font-bold text-[#2d6d4a]">Settlement eligible</span>}</div><h2 className="mt-3 font-display text-lg font-bold">{row.title}</h2><p className="mt-1 text-sm text-[#687a71]">{row.facility} · {formatDate(row.startsAt)}</p><p className="mt-2 font-mono text-[10px] text-[#8b9288]">Reservation {row.reference || row.reservationId}</p>{row.checkedInAt && <p className="mt-2 text-xs text-[#687a71]">Checked in {formatDate(row.checkedInAt)}{attendanceDetails.manualCheckin ? ' · staff-assisted audit' : ''}{attendanceDetails.manualRepeatUse ? ' · repeat use noted' : ''}</p>}</div><div className="flex flex-wrap items-center gap-2">{!row.locked && actions.map(action => <Button key={action} kind={action === 'dispute' || action === 'no_show' || action === 'resolve_void' ? 'quiet' : 'primary'} onClick={() => { setReviewing({ id: row.reservationId, action }); setReason(''); }}>{actionLabel[action]}</Button>)}{canManualCheckin && <Button kind="quiet" onClick={() => setManualChecking(row.reservationId)}>Verify member code</Button>}</div></div>{manualChecking === row.reservationId && <ManualCheckinForm reservationId={row.reservationId} lang={language} onClose={() => setManualChecking(null)} onSuccess={() => { setManualChecking(null); invalidate(); setNotice('Manual check-in recorded by the server.'); }} />}{row.events.length > 0 && <details className="mt-4 border-t border-[#ece7d9] pt-3"><summary className="cursor-pointer text-xs font-bold text-[#536b61]">Audit history · {row.events.length}</summary><ul className="mt-3 space-y-2">{row.events.map((event, index) => <li key={`${event.createdAt}-${index}`} className="text-xs text-[#687a71]"><span className="font-semibold">{event.action.replaceAll('_', ' ')}</span> · {event.reason} · {formatDate(event.createdAt)}</li>)}</ul></details>}
              {reviewing?.id === row.reservationId && <form onSubmit={runReview} className="mt-4 rounded-2xl bg-[#f2efe4] p-4"><label className="block text-xs font-semibold text-[#51665e]">{actionLabel[reviewing.action]} — audit reason (at least 5 characters)<textarea required minLength={5} maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)} className={fieldClass()} placeholder="Record the reason for this decision" /></label><div className="mt-3 flex justify-end gap-2"><Button kind="quiet" onClick={() => setReviewing(null)}>Dismiss</Button><Button type="submit" disabled={review.isPending || reason.trim().length < 5}>{review.isPending ? 'Recording…' : 'Record review'}</Button></div></form>}</article>;
          })}</div> : <div className="rounded-3xl border border-dashed border-[#d5cfbf] bg-[#fffdf7]/60 p-10 text-center"><CalendarDays className="mx-auto text-[#a76445]" /><h2 className="mt-4 font-display text-xl font-bold">Roster is clear</h2><p className="mt-2 text-sm text-[#75847c]">No attendance rows were returned for this account.</p></div>}</section>}
          {tab === 'partners' && isAdmin && <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><form className="h-fit rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5" onSubmit={event => { event.preventDefault(); addPartner.mutate({ data: partnerForm }, { onSuccess: () => { invalidate(); setPartnerForm({ name: '', groupId: '', ownerUserId: '' }); setNotice('Partner record created.'); }, onError: () => mutationError('Partner creation') }); }}><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a76445]">Administrator action</p><h2 className="mt-2 font-display text-xl font-bold">Add partner record</h2><p className="mt-2 text-xs leading-5 text-[#75847c]">Provide all three identifiers directly. No partner owner or group is inferred.</p><div className="mt-4 grid gap-3"><LabelField label="Partner name"><input required className={fieldClass()} value={partnerForm.name} onChange={e => setPartnerForm({ ...partnerForm, name: e.target.value })} /></LabelField><LabelField label="Group ID"><input required className={fieldClass()} value={partnerForm.groupId} onChange={e => setPartnerForm({ ...partnerForm, groupId: e.target.value })} /></LabelField><LabelField label="Owner user ID"><input required className={fieldClass()} value={partnerForm.ownerUserId} onChange={e => setPartnerForm({ ...partnerForm, ownerUserId: e.target.value })} /></LabelField><Button type="submit" disabled={addPartner.isPending}><Plus size={15} />Create partner</Button></div></form><div className="grid content-start gap-3">{operations.data.partners.map(partnerItem => <article key={partnerItem.id} className="flex flex-col justify-between gap-4 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><h3 className="font-display text-lg font-bold">{partnerItem.name}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${partnerItem.approved ? 'bg-[#e1efdf] text-[#2d6d4a]' : 'bg-[#f2dfd5] text-[#9a4435]'}`}>{partnerItem.approved ? 'Approved' : 'Pending'}</span></div><p className="mt-2 font-mono text-[10px] text-[#8b9288]">Partner ID {partnerItem.id} · Group {partnerItem.groupId}</p></div><Button kind={partnerItem.approved ? 'quiet' : 'primary'} disabled={approvePartner.isPending} onClick={() => handleApproval(partnerItem.id, !partnerItem.approved)}>{partnerItem.approved ? <X size={15} /> : <Check size={15} />}{partnerItem.approved ? 'Revoke approval' : 'Approve partner'}</Button></article>)}</div></section>}
          {!isAdmin && (['facilities', 'bookings', 'settlements', 'invoices'] as OperationsTab[]).includes(tab as OperationsTab) && <PartnerOperationsPanel tab={tab as OperationsTab} lang={language} partnerId={operations.data.partnerId ?? ''} isAdmin={false} attendance={rows} offerings={offerings} onNotice={setNotice} />}
        </div>
        <footer className="mx-auto mt-12 flex max-w-6xl items-center justify-between border-t border-[#ddd7c6] pt-5 text-[10px] font-semibold uppercase tracking-[.14em] text-[#879187]"><span>MaydanGo partner operations</span><span className="flex items-center gap-1"><Clock3 size={12} /> Iraq local time</span></footer>
         </LocalizedContent>
      </section>
    </div>
     {showCreate && <OfferingForm partnerId={isAdmin ? '' : operations.data.partnerId ?? ''} partners={operations.data.partners.filter(item => item.approved)} isAdmin={isAdmin} lang={language} onClose={() => setShowCreate(false)} onSaved={() => { invalidate(); setNotice(isAdmin ? 'Offering created.' : 'Saved as draft. Submit it for administrator review to continue.'); }} />}
  </main>;
}
