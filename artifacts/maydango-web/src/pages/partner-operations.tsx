import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { trackEvent } from '@/lib/analytics';
import { getPartnerPortalCopy, type PortalCopyLanguage } from '@/lib/partner-portal-copy';
import { CalendarClock, Download, FileText, MapPin, Plus, RefreshCw, Save, ShieldCheck, Upload, Wallet } from 'lucide-react';
import { FacilityCheckinQrManager } from '@/components/facility-checkin-qr-manager';
import {
  downloadPartnerInvoiceDocument, getGetAttendanceQueryKey, getGetOperationFacilitiesQueryKey, getGetPartnerInvoicesQueryKey,
  getGetOperationsQueryKey, getGetPartnerSettlementSummaryQueryKey, useCreateFacilityProfile,
  useCreateFacilityHoursOverride, useDeleteFacilityHoursOverride,
  useGetOperationFacilities, useGetPartnerInvoices, useGetPartnerSettlementSummary,
  useRequestPartnerInvoiceUploadUrl, useSetCheckinPolicy, useSubmitPartnerInvoice,
  useDeleteFacilityProfile, useUpdateFacilityProfile,
} from '@workspace/api-client-react';
import type {
  CheckinPolicy, FacilityHoursOverrideInput, FacilityOpeningDay, FacilityProfile, FacilityProfileInput, FacilityProfileUpdate,
  GetAttendance200RowsItem, LiveOffering, PartnerInvoiceInput, PartnerSettlementSummary,
} from '@workspace/api-client-react';

export type PortalLanguage = PortalCopyLanguage;
export type OperationsTab = 'facilities' | 'bookings' | 'settlements' | 'invoices';
type CopyKey = keyof typeof copy.en;
const copy = {
  en: {
    facilities: 'Facilities', addFacility: 'Add facility', edit: 'Edit details', save: 'Save changes', city: 'City', name: 'Facility name',
    district: 'District', address: 'Address', description: 'About this place', phone: 'Contact phone', website: 'Website', latitude: 'Latitude', longitude: 'Longitude',
    hours: 'Weekly opening hours', specialHours: 'Temporary closures and special hours', addSpecialHours: 'Add date override',
    overrideType: 'Override type', closedAllDay: 'Closed all day', specialSchedule: 'Special hours', reason: 'Reason shown to visitors',
    opens: 'Opens', closes: 'Closes', publishSpecialHours: 'Publish override', cancel: 'Cancel',
    specialHoursSaved: 'Special hours published.', specialHoursFailed: 'Could not publish this override. Check the dates and existing entries.',
    specialHoursRemoved: 'Special hours removed.', specialHoursRemoveFailed: 'Could not remove this override.',
    removeSpecialHoursConfirm: 'Remove this date override?', noSpecialHours: 'No temporary changes are scheduled.',
    closed: 'Closed', activities: 'Activities', amenities: 'Amenities', accessibility: 'Accessibility',
    saved: 'Facility details saved.', failed: 'Could not save these details. Please try again.', noFacilities: 'No facility records are available for this partner yet.',
    remove: 'Remove', removeConfirm: 'Remove this facility profile?', removed: 'Facility profile removed.', removeFailed: 'This facility cannot be removed while sessions use it.',
    bookings: 'Sessions & bookings', bookingIntro: 'Scheduled sessions and booking attendance, limited to your server-authorized partner scope.',
    noBookings: 'No bookings are currently listed.', starts: 'Starts', booking: 'Booking', attendance: 'Attendance', checkin: 'Check-in operations',
    settlements: 'Settlements', dateFrom: 'From', dateTo: 'To', verified: 'Verified visits', rejected: 'Rejected visits', onHold: 'On hold',
    summary: 'Settlement summary', facility: 'Facility', cityLabel: 'City', category: 'Category', access: 'Access type', visits: 'Visits',
    invoices: 'Invoices', invoiceIntro: 'Submit a PDF invoice for review. Documents stay private to your partner account and are kept for at least 10 years, pending local legal and accounting review.',
    invoiceNumber: 'Invoice number', amount: 'Amount (IQD)', issueDate: 'Issue date', periodStart: 'Period start', periodEnd: 'Period end', taxNumber: 'Tax number (optional)',
    pdf: 'Invoice PDF', submitInvoice: 'Upload and submit invoice', submitting: 'Uploading securely…', status: 'Status', document: 'Private document',
    noInvoices: 'No invoices have been submitted yet.', uploadError: 'The invoice could not be uploaded. Check the PDF and try again.', fileType: 'Choose a PDF file up to 10 MB.',
    loading: 'Loading records…', retry: 'Retry', policy: 'Check-in policy', radius: 'Radius (metres)', opensAt: 'Check-in opens', closesAt: 'Check-in closes',
    correction: 'Correction deadline', updatePolicy: 'Save check-in policy', selectFacility: 'Choose facility', review: 'Under review', submitted: 'Submitted',
    accepted: 'Accepted', declined: 'Rejected', settlementNote: 'Visit totals only. No settlement rates or payout controls are available here.',
    active: 'Active', draft: 'Draft',
    translationRequired: 'Complete every translation for each activity, amenity, or accessibility item.',
    configurePolicy: 'Configure attendance policy', policyReady: 'Attendance policy is already set and cannot be changed.',
    policySaved: 'Attendance policy saved for this session.', policyError: 'Check the location and session times. A configured policy cannot be replaced.',
    missingCoordinates: 'Add facility coordinates before setting the attendance policy.', bookingCount: 'Bookings',
    confirmed: 'Confirmed', reserved: 'Reserved', requested: 'Requested', pending: 'Pending', disputed: 'Disputed',
    noShow: 'No-show', notCheckedIn: 'Not checked in', cancelledStatus: 'Cancelled',
    requestRejected: 'Request declined', adminCancelledStatus: 'Cancelled by MaydanGo', voidedStatus: 'Voided',
  },
  ar: {
    facilities: 'المرافق', addFacility: 'إضافة مرفق', edit: 'تعديل التفاصيل', save: 'حفظ التغييرات', city: 'المدينة', name: 'اسم المرفق',
    district: 'المنطقة', address: 'العنوان', description: 'عن المكان', phone: 'هاتف التواصل', website: 'الموقع الإلكتروني', latitude: 'خط العرض', longitude: 'خط الطول',
    hours: 'ساعات العمل الأسبوعية', specialHours: 'الإغلاقات المؤقتة وساعات العمل الخاصة', addSpecialHours: 'إضافة تعديل مؤقت',
    overrideType: 'نوع التعديل', closedAllDay: 'مغلق طوال اليوم', specialSchedule: 'ساعات خاصة', reason: 'السبب الذي سيظهر للزوار',
    opens: 'يفتح', closes: 'يغلق', publishSpecialHours: 'نشر التعديل', cancel: 'إلغاء',
    specialHoursSaved: 'تم نشر ساعات العمل الخاصة.', specialHoursFailed: 'تعذر نشر التعديل. تحقق من التواريخ والتعديلات الموجودة.',
    specialHoursRemoved: 'تمت إزالة ساعات العمل الخاصة.', specialHoursRemoveFailed: 'تعذرت إزالة هذا التعديل.',
    removeSpecialHoursConfirm: 'هل تريد إزالة تعديل التواريخ هذا؟', noSpecialHours: 'لا توجد تغييرات مؤقتة مجدولة.',
    closed: 'مغلق', activities: 'الأنشطة', amenities: 'الخدمات', accessibility: 'إمكانية الوصول',
    saved: 'تم حفظ تفاصيل المرفق.', failed: 'تعذر حفظ التفاصيل. حاول مرة أخرى.', noFacilities: 'لا توجد مرافق مسجلة لهذا الشريك بعد.',
    remove: 'إزالة', removeConfirm: 'هل تريد إزالة ملف هذا المرفق؟', removed: 'تمت إزالة ملف المرفق.', removeFailed: 'لا يمكن إزالة هذا المرفق ما دامت هناك جلسات مرتبطة به.',
    bookings: 'الجلسات والحجوزات', bookingIntro: 'الجلسات المجدولة وحضور الحجوزات ضمن نطاق الشريك المصرح به من الخادم.',
    noBookings: 'لا توجد حجوزات مدرجة حالياً.', starts: 'يبدأ', booking: 'الحجز', attendance: 'الحضور', checkin: 'إدارة تسجيل الحضور',
    settlements: 'التسويات', dateFrom: 'من', dateTo: 'إلى', verified: 'الزيارات المؤكدة', rejected: 'الزيارات المرفوضة', onHold: 'قيد الانتظار',
    summary: 'ملخص التسوية', facility: 'المرفق', cityLabel: 'المدينة', category: 'الفئة', access: 'نوع الوصول', visits: 'الزيارات',
    invoices: 'الفواتير', invoiceIntro: 'أرسل فاتورة بصيغة PDF للمراجعة. تبقى المستندات خاصة بحساب الشريك ويُحتفظ بها 10 سنوات على الأقل، إلى حين مراجعة قانونية ومحاسبية محلية.',
    invoiceNumber: 'رقم الفاتورة', amount: 'المبلغ (دينار عراقي)', issueDate: 'تاريخ الإصدار', periodStart: 'بداية الفترة', periodEnd: 'نهاية الفترة', taxNumber: 'الرقم الضريبي (اختياري)',
    pdf: 'فاتورة PDF', submitInvoice: 'رفع الفاتورة وإرسالها', submitting: 'جارٍ الرفع بأمان…', status: 'الحالة', document: 'مستند خاص',
    noInvoices: 'لم يتم إرسال فواتير بعد.', uploadError: 'تعذر رفع الفاتورة. تحقق من ملف PDF وحاول مرة أخرى.', fileType: 'اختر ملف PDF بحجم لا يتجاوز 10 ميغابايت.',
    loading: 'جارٍ تحميل السجلات…', retry: 'إعادة المحاولة', policy: 'سياسة تسجيل الحضور', radius: 'النطاق (متر)', opensAt: 'بداية التسجيل', closesAt: 'نهاية التسجيل',
    correction: 'موعد إغلاق التصحيح', updatePolicy: 'حفظ سياسة الحضور', selectFacility: 'اختر المرفق', review: 'قيد المراجعة', submitted: 'تم الإرسال',
    accepted: 'مقبولة', declined: 'مرفوضة', settlementNote: 'إجمالي الزيارات فقط. لا تتوفر هنا نسب تسوية أو أدوات دفع.',
    active: 'نشط', draft: 'مسودة',
    translationRequired: 'أكمل الترجمات كلها لكل نشاط أو خدمة أو بند لإمكانية الوصول.',
    configurePolicy: 'إعداد سياسة الحضور', policyReady: 'تم إعداد سياسة الحضور ولا يمكن تغييرها.',
    policySaved: 'تم حفظ سياسة الحضور لهذه الجلسة.', policyError: 'تحقق من الموقع وأوقات الجلسة. لا يمكن استبدال السياسة بعد إعدادها.',
    missingCoordinates: 'أضف إحداثيات المرفق قبل إعداد سياسة الحضور.', bookingCount: 'الحجوزات',
    confirmed: 'مؤكد', reserved: 'محجوز', requested: 'مطلوب', pending: 'قيد الانتظار', disputed: 'متنازع عليه',
    noShow: 'لم يحضر', notCheckedIn: 'لم يسجل الحضور', cancelledStatus: 'ملغى',
    requestRejected: 'تم رفض الطلب', adminCancelledStatus: 'ألغاه فريق MaydanGo', voidedStatus: 'مبطل',
  },
  ku: {
    facilities: 'شوێنەکان', addFacility: 'شوێنێک زیاد بکە', edit: 'دەستکاری وردەکارییەکان', save: 'گۆڕانکارییەکان پاشەکەوت بکە', city: 'شار', name: 'ناوی شوێن',
    district: 'گەڕەک', address: 'ناونیشان', description: 'دەربارەی شوێنەکە', phone: 'تەلەفۆنی پەیوەندی', website: 'ماڵپەڕ', latitude: 'پانی', longitude: 'درێژی',
    hours: 'کاتژمێری کارکردنی هەفتانە', specialHours: 'داخستنە کاتییەکان و کاتژمێری تایبەت', addSpecialHours: 'زیادکردنی گۆڕانکاری کاتی',
    overrideType: 'جۆری گۆڕانکاری', closedAllDay: 'تەواوی ڕۆژ داخراوە', specialSchedule: 'کاتژمێری تایبەت', reason: 'هۆکارەکەی بۆ سەردانکەران پیشان دەدرێت',
    opens: 'دەکرێتەوە', closes: 'دادەخرێت', publishSpecialHours: 'بڵاوکردنەوەی گۆڕانکاری', cancel: 'پاشگەزبوونەوە',
    specialHoursSaved: 'کاتژمێری تایبەت بڵاوکرایەوە.', specialHoursFailed: 'بڵاوکردنەوەی ئەم گۆڕانکارییە سەرکەوتوو نەبوو. بەروارەکان و گۆڕانکارییەکانی پێشوو بپشکنە.',
    specialHoursRemoved: 'کاتژمێری تایبەت لابرا.', specialHoursRemoveFailed: 'لابردنی ئەم گۆڕانکارییە سەرکەوتوو نەبوو.',
    removeSpecialHoursConfirm: 'ئەم گۆڕانکارییەی بەروار لاببە؟', noSpecialHours: 'هیچ گۆڕانکارییەکی کاتی پلاندانەنراوە.',
    closed: 'داخراوە', activities: 'چالاکییەکان', amenities: 'خزمەتگوزارییەکان', accessibility: 'دەستگەیشتن',
    saved: 'وردەکارییەکانی شوێن پاشەکەوت کران.', failed: 'پاشەکەوتکردنی وردەکارییەکان سەرکەوتوو نەبوو. دووبارە هەوڵ بدە.', noFacilities: 'هێشتا هیچ شوێنێک بۆ ئەم هاوبەشە تۆمار نەکراوە.',
    remove: 'لابردن', removeConfirm: 'ئەم پڕۆفایلەی شوێن لاببە؟', removed: 'پڕۆفایلی شوێن لابرا.', removeFailed: 'تا کاتێک وانەکان ئەم شوێنە بەکاردەهێنن ناتوانرێت لاببرێت.',
    bookings: 'وانە و حجزەکان', bookingIntro: 'وانە پلاندانراوەکان و ئامادەبوونی حجزەکان لە سنووری هاوبەشی پشتڕاستکراو لەلایەن سێرڤەرەوە.',
    noBookings: 'ئێستا هیچ حجزێک نییە.', starts: 'دەستپێک', booking: 'حجز', attendance: 'ئامادەبوون', checkin: 'بەڕێوەبردنی ئامادەبوون',
    settlements: 'یەکلاکردنەوە', dateFrom: 'لە', dateTo: 'بۆ', verified: 'سەردانی پشتڕاستکراو', rejected: 'سەردانی ڕەتکراو', onHold: 'لە چاوەڕوانیدایە',
    summary: 'پوختەی یەکلاکردنەوە', facility: 'شوێن', cityLabel: 'شار', category: 'جۆر', access: 'جۆری دەستگەیشتن', visits: 'سەردان',
    invoices: 'پسووڵەکان', invoiceIntro: 'پسووڵەی PDF بنێرە بۆ پێداچوونەوە. بەڵگەنامەکان تایبەت بە هەژماری هاوبەش دەمێننەوە و بۆ لانیکەم 10 ساڵ دەپارێزرێن، تا پێداچوونەوەی یاسایی و ژمێریاریی ناوخۆیی.',
    invoiceNumber: 'ژمارەی پسووڵە', amount: 'بڕ (دیناری عێراقی)', issueDate: 'بەرواری دەرچوون', periodStart: 'دەستپێکی ماوە', periodEnd: 'کۆتایی ماوە', taxNumber: 'ژمارەی باج (ئارەزوومەندانە)',
    pdf: 'پسووڵەی PDF', submitInvoice: 'بارکردن و ناردنی پسووڵە', submitting: 'بە پارێزراوی بار دەکرێت…', status: 'دۆخ', document: 'بەڵگەنامەی تایبەت',
    noInvoices: 'هێشتا هیچ پسووڵەیەک نەنێردراوە.', uploadError: 'بارکردنی پسووڵە سەرکەوتوو نەبوو. PDF ـەکە بپشکنە و دووبارە هەوڵ بدە.', fileType: 'فایلی PDF تا 10 مێگابایت هەڵبژێرە.',
    loading: 'تۆمارەکان بار دەکرێن…', retry: 'دووبارە هەوڵ بدە', policy: 'ڕێسای ئامادەبوون', radius: 'مەودا (مەتر)', opensAt: 'دەستپێکی تۆمارکردن', closesAt: 'کۆتایی تۆمارکردن',
    correction: 'کۆتایی چاککردنەوە', updatePolicy: 'ڕێسای ئامادەبوون پاشەکەوت بکە', selectFacility: 'شوێنێک هەڵبژێرە', review: 'لە پێداچوونەوەدایە', submitted: 'نێردراوە',
    accepted: 'پەسەندکراوە', declined: 'ڕەتکراوەتەوە', settlementNote: 'تەنها کۆی سەردانەکان. ڕێژەی یەکلاکردنەوە یان کۆنترۆڵی پارەدان لێرە نییە.',
    active: 'چالاک', draft: 'ڕەشنووس',
    translationRequired: 'هەموو وەرگێڕانەکانی هەر چالاکی، خزمەتگوزاری یان خاڵی دەستگەیشتن تەواو بکە.',
    configurePolicy: 'ڕێسای ئامادەبوون ڕێک بخە', policyReady: 'ڕێسای ئامادەبوون دانراوە و ناتوانرێت بگۆڕدرێت.',
    policySaved: 'ڕێسای ئامادەبوون بۆ ئەم وانەیە پاشەکەوت کرا.', policyError: 'شوێن و کاتی وانەکە بپشکنە. ڕێسای دانراو ناتوانرێت بگۆڕدرێت.',
    missingCoordinates: 'پێش دانانی ڕێسای ئامادەبوون، خاڵەکانی شوێن زیاد بکە.', bookingCount: 'حجزەکان',
    confirmed: 'پشتڕاستکراوە', reserved: 'حجزکراوە', requested: 'داواکراوە', pending: 'لە چاوەڕوانیدایە', disputed: 'مشتومڕی لەسەرە',
    noShow: 'ئامادە نەبوو', notCheckedIn: 'ئامادەبوون تۆمار نەکراوە', cancelledStatus: 'هەڵوەشێنراوەتەوە',
    requestRejected: 'داواکارییەکە ڕەتکرایەوە', adminCancelledStatus: 'لە لایەن تیمی MaydanGo ـەوە هەڵوەشێنرایەوە', voidedStatus: 'هەڵوەشاوەتەوە',
  },
} as const;
const t = (lang: PortalLanguage, key: CopyKey) => getPartnerPortalCopy(lang, copy.en[key]) ?? copy[lang][key];
const inputClass = 'mt-1 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm text-[#173d35] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#174d43] px-4 py-2.5 text-sm font-semibold text-[#fff9e9] transition hover:bg-[#226556] disabled:opacity-50';
const quietClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[#d8d2c4] px-3 py-2 text-sm font-semibold text-[#36564b] hover:bg-[#f1eddf]';
const week = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const localizedWeek: Record<PortalLanguage, string[]> = {
  en: week.map(day => getPartnerPortalCopy('en', day) ?? day),
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day, index) => getPartnerPortalCopy('ar', week[index]) ?? day),
  ku: ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە'].map((day, index) => getPartnerPortalCopy('ku', week[index]) ?? day),
};
const localizedBlank = () => ({ en: '', ar: '', ku: '' });
const defaultHours = (): FacilityOpeningDay[] => week.map((_, day) => ({ day, closed: false, opensAt: '08:00', closesAt: '20:00' }));
const toBaghdadInput = (value: string) => value ? new Date(new Date(value).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16) : '';
const fromBaghdadInput = (value: string) => new Date(`${value}:00+03:00`).toISOString();
const emptyFacility = (partnerId: string): FacilityProfileInput => ({
  partnerId, city: '', facility: '', localizedName: localizedBlank(), localizedDistrict: localizedBlank(), localizedAddress: localizedBlank(), localizedDescription: localizedBlank(),
  activities: [], amenities: [], accessibility: [], openingHours: defaultHours(), contactPhone: null, websiteUrl: null, latitude: null, longitude: null,
});
function localizedField(label: string, value: { en: string; ar: string; ku: string }, onChange: (next: { en: string; ar: string; ku: string }) => void, multiline = false, required = false) {
  return <fieldset className="grid gap-2 sm:col-span-2"><legend className="mb-1 text-xs font-semibold text-[#51665e]">{label} · EN / AR / KU</legend><div className="grid gap-2 sm:grid-cols-3">{(['en', 'ar', 'ku'] as const).map(lang => {
    const C = multiline ? 'textarea' : 'input';
    return <label key={lang} className="min-w-0"><span className="sr-only">{label} {lang}</span><C dir={lang === 'en' ? 'ltr' : 'rtl'} required={required} rows={multiline ? 2 : undefined} maxLength={500} className={inputClass} value={value?.[lang] ?? ''} onChange={e => onChange({ ...value, [lang]: e.target.value })} /></label>;
  })}</div></fieldset>;
}
function localizedList(value: { en: string; ar: string; ku: string }[], onChange: (next: { en: string; ar: string; ku: string }[]) => void, _lang: PortalLanguage, label: string) {
  return <fieldset className="grid gap-2 sm:col-span-2"><legend className="mb-1 text-xs font-semibold text-[#51665e]">{label} · EN / AR / KU (one item per line)</legend><div className="grid gap-2 sm:grid-cols-3">{(['en', 'ar', 'ku'] as const).map(lang => <label key={lang}><span className="sr-only">{label} {lang}</span><textarea rows={3} dir={lang === 'en' ? 'ltr' : 'rtl'} className={inputClass} value={value.map(item => item[lang]).join('\n')} onChange={event => {
    const items = event.target.value.split('\n').slice(0, 30);
    const length = Math.max(items.length, value.length);
    const next = Array.from({ length }, (_, index) => ({
      en: value[index]?.en ?? '', ar: value[index]?.ar ?? '', ku: value[index]?.ku ?? '',
      [lang]: items[index] ?? '',
    })).filter(item => item.en.trim() || item.ar.trim() || item.ku.trim());
    onChange(next);
  }} /></label>)}</div></fieldset>;
}
function FacilityEditor({ partnerId, facility, lang, onClose, onSaved }: { partnerId: string; facility?: FacilityProfile; lang: PortalLanguage; onClose: () => void; onSaved: () => void }) {
  const client = useQueryClient();
  const create = useCreateFacilityProfile();
  const update = useUpdateFacilityProfile();
  const [form, setForm] = useState<FacilityProfileInput>(() => facility ? {
    partnerId,
    city: facility.city,
    facility: facility.facility,
    localizedName: facility.localizedName,
    localizedDistrict: facility.localizedDistrict,
    localizedAddress: facility.localizedAddress,
    localizedDescription: facility.localizedDescription,
    activities: facility.activities,
    amenities: facility.amenities,
    accessibility: facility.accessibility,
    openingHours: facility.openingHours.map(hour => ({ ...hour })),
    contactPhone: facility.contactPhone,
    websiteUrl: facility.websiteUrl,
    latitude: facility.latitude,
    longitude: facility.longitude,
  } : emptyFacility(partnerId));
  const [error, setError] = useState('');
  const pending = create.isPending || update.isPending;
  const set = <K extends keyof FacilityProfileInput>(key: K, value: FacilityProfileInput[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const setLocalized = (key: 'localizedName' | 'localizedDistrict' | 'localizedAddress' | 'localizedDescription', value: { en: string; ar: string; ku: string }) => set(key, value);
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError('');
    const localizedLists = [form.activities, form.amenities, form.accessibility];
    if (localizedLists.some(list => list.some(item =>
      [item.en, item.ar, item.ku].some(text => text.trim()) &&
      [item.en, item.ar, item.ku].some(text => !text.trim()),
    ))) {
      setError(t(lang, 'translationRequired'));
      return;
    }
    const { partnerId: _serverScopedPartnerId, ...profileUpdate } = form;
    const body: FacilityProfileUpdate = { ...profileUpdate, city: form.city.trim(), facility: form.facility.trim() };
    const done = () => {
      trackEvent('facility_profile_saved', { change_type: facility ? 'updated' : 'created', surface: 'partner_portal' });
      void client.invalidateQueries({ queryKey: getGetOperationFacilitiesQueryKey() });
      onSaved();
    };
    if (facility) update.mutate({ id: facility.id, data: body }, { onSuccess: done, onError: () => setError(t(lang, 'failed')) });
    else create.mutate({ data: form }, { onSuccess: done, onError: () => setError(t(lang, 'failed')) });
  };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102e27]/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form onSubmit={submit} dir={lang === 'en' ? 'ltr' : 'rtl'} className="max-h-[94dvh] w-full max-w-4xl space-y-4 overflow-auto rounded-t-3xl bg-[#f8f5eb] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
      <div className="flex items-center justify-between"><h2 className="font-display text-2xl font-bold text-[#173d35]">{facility ? t(lang, 'edit') : t(lang, 'addFacility')}</h2><button type="button" className={quietClass} onClick={onClose}>×</button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">{t(lang, 'city')}<input required maxLength={160} className={inputClass} value={form.city} onChange={e => set('city', e.target.value)} /></label>
        <label className="text-xs font-semibold">{t(lang, 'name')}<input required maxLength={160} className={inputClass} value={form.facility} onChange={e => set('facility', e.target.value)} /></label>
        {localizedField(t(lang, 'name'), form.localizedName, value => setLocalized('localizedName', value), false, true)}
        {localizedField(t(lang, 'district'), form.localizedDistrict, value => setLocalized('localizedDistrict', value), false, true)}
        {localizedField(t(lang, 'address'), form.localizedAddress, value => setLocalized('localizedAddress', value), false, true)}
        {localizedField(t(lang, 'description'), form.localizedDescription, value => setLocalized('localizedDescription', value), true, true)}
        {localizedList(form.activities, value => set('activities', value), lang, t(lang, 'activities'))}
        {localizedList(form.amenities, value => set('amenities', value), lang, t(lang, 'amenities'))}
        {localizedList(form.accessibility, value => set('accessibility', value), lang, t(lang, 'accessibility'))}
        <label className="text-xs font-semibold">{t(lang, 'phone')}<input className={inputClass} value={form.contactPhone ?? ''} onChange={e => set('contactPhone', e.target.value || null)} /></label>
        <label className="text-xs font-semibold">{t(lang, 'website')}<input type="url" className={inputClass} value={form.websiteUrl ?? ''} onChange={e => set('websiteUrl', e.target.value || null)} /></label>
        <label className="text-xs font-semibold">{t(lang, 'latitude')}<input type="number" step="any" min="-90" max="90" className={inputClass} value={form.latitude ?? ''} onChange={e => set('latitude', e.target.value ? Number(e.target.value) : null)} /></label>
        <label className="text-xs font-semibold">{t(lang, 'longitude')}<input type="number" step="any" min="-180" max="180" className={inputClass} value={form.longitude ?? ''} onChange={e => set('longitude', e.target.value ? Number(e.target.value) : null)} /></label>
      </div>
      <div><h3 className="mb-2 text-sm font-bold">{t(lang, 'hours')}</h3><div className="grid gap-2 sm:grid-cols-2">{form.openingHours.map((item, index) => <div key={item.day} className="flex items-center gap-2 rounded-xl bg-[#eeeadc] p-2"><span className="w-24 text-xs font-semibold">{localizedWeek[lang][item.day]}</span><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={item.closed} onChange={e => set('openingHours', form.openingHours.map((hour, i) => i === index ? { ...hour, closed: e.target.checked } : hour))} />{t(lang, 'closed')}</label><input aria-label={`${localizedWeek[lang][item.day]} opens`} disabled={item.closed} type="time" className={`${inputClass} mt-0`} value={item.opensAt ?? ''} onChange={e => set('openingHours', form.openingHours.map((hour, i) => i === index ? { ...hour, opensAt: e.target.value } : hour))} /><input aria-label={`${localizedWeek[lang][item.day]} closes`} disabled={item.closed} type="time" className={`${inputClass} mt-0`} value={item.closesAt ?? ''} onChange={e => set('openingHours', form.openingHours.map((hour, i) => i === index ? { ...hour, closesAt: e.target.value } : hour))} /></div>)}</div></div>
      {error && <p role="alert" className="text-sm text-[#9a4435]">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className={quietClass} onClick={onClose}>{t(lang, 'retry')}</button><button type="submit" disabled={pending} className={buttonClass}><Save size={15} />{pending ? t(lang, 'loading') : t(lang, 'save')}</button></div>
    </form>
  </div>;
}

function baghdadCalendarDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function formatOverrideDateRange(startDate: string, endDate: string, lang: PortalLanguage) {
  const locale = lang === 'ku' ? 'ckb-IQ' : lang === 'ar' ? 'ar-IQ' : 'en-IQ';
  const format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn' });
  const start = format.format(new Date(`${startDate}T00:00:00Z`));
  const end = format.format(new Date(`${endDate}T00:00:00Z`));
  return startDate === endDate ? start : `${start} – ${end}`;
}
function HoursOverrideEditor({ facilityId, lang, onClose, onSaved }: {
  facilityId: string; lang: PortalLanguage; onClose: () => void; onSaved: () => void;
}) {
  const client = useQueryClient();
  const create = useCreateFacilityHoursOverride();
  const today = baghdadCalendarDate();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [mode, setMode] = useState<'closed' | 'special'>('closed');
  const [opensAt, setOpensAt] = useState('09:00');
  const [closesAt, setClosesAt] = useState('17:00');
  const [localizedReason, setLocalizedReason] = useState({ en: '', ar: '', ku: '' });
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (endDate < startDate || Object.values(localizedReason).some(value => !value.trim())) {
      setError(t(lang, 'specialHoursFailed'));
      return;
    }
    const data: FacilityHoursOverrideInput = {
      startDate,
      endDate,
      closed: mode === 'closed',
      opensAt: mode === 'closed' ? null : opensAt,
      closesAt: mode === 'closed' ? null : closesAt,
      localizedReason,
    };
    create.mutate({ id: facilityId, data }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getGetOperationFacilitiesQueryKey() });
        void client.invalidateQueries({ queryKey: getGetOperationsQueryKey() });
        onSaved();
      },
      onError: () => setError(t(lang, 'specialHoursFailed')),
    });
  };
  return <form onSubmit={submit} dir={lang === 'en' ? 'ltr' : 'rtl'} className="mt-4 grid gap-3 rounded-2xl border border-[#d8d2c4] bg-[#f8f5eb] p-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold">{t(lang, 'dateFrom')}<input required type="date" min={today} className={inputClass} value={startDate} onChange={event => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value); }} /></label>
      <label className="text-xs font-semibold">{t(lang, 'dateTo')}<input required type="date" min={startDate || today} className={inputClass} value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      <label className="text-xs font-semibold sm:col-span-2">{t(lang, 'overrideType')}<select className={inputClass} value={mode} onChange={event => setMode(event.target.value as 'closed' | 'special')}><option value="closed">{t(lang, 'closedAllDay')}</option><option value="special">{t(lang, 'specialSchedule')}</option></select></label>
      {mode === 'special' && <>
        <label className="text-xs font-semibold">{t(lang, 'opens')}<input required type="time" className={inputClass} value={opensAt} onChange={event => setOpensAt(event.target.value)} /></label>
        <label className="text-xs font-semibold">{t(lang, 'closes')}<input required type="time" className={inputClass} value={closesAt} onChange={event => setClosesAt(event.target.value)} /></label>
      </>}
      <fieldset className="grid gap-2 sm:col-span-2"><legend className="text-xs font-semibold">{t(lang, 'reason')} · EN / AR / KU</legend><div className="grid gap-2 sm:grid-cols-3">{(['en', 'ar', 'ku'] as const).map(language => <label key={language}><span className="sr-only">{t(lang, 'reason')} {language}</span><textarea required maxLength={500} rows={2} dir={language === 'en' ? 'ltr' : 'rtl'} className={inputClass} value={localizedReason[language]} onChange={event => setLocalizedReason(previous => ({ ...previous, [language]: event.target.value }))} /></label>)}</div></fieldset>
    </div>
    {error && <p role="alert" className="text-sm text-[#9a4435]">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" className={quietClass} onClick={onClose}>{t(lang, 'cancel')}</button><button type="submit" disabled={create.isPending} className={buttonClass}><Save size={15} />{create.isPending ? t(lang, 'loading') : t(lang, 'publishSpecialHours')}</button></div>
  </form>;
}

function Facilities({ lang, partnerId, isAdmin, onNotice }: { lang: PortalLanguage; partnerId: string; isAdmin: boolean; onNotice: (message: string) => void }) {
  const facilities = useGetOperationFacilities({ query: { enabled: !!partnerId, queryKey: getGetOperationFacilitiesQueryKey() } });
  const client = useQueryClient();
  const remove = useDeleteFacilityProfile();
  const removeHours = useDeleteFacilityHoursOverride();
  const [editing, setEditing] = useState<FacilityProfile | 'new' | null>(null);
  const [hoursEditorFor, setHoursEditorFor] = useState<string | null>(null);
  const records = (facilities.data ?? []).filter(facility => isAdmin || facility.partnerId === partnerId);
  const removeFacility = (facility: FacilityProfile) => {
    if (!window.confirm(`${t(lang, 'removeConfirm')} ${facility.localizedName[lang] || facility.facility}?`)) return;
    remove.mutate({ id: facility.id }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getGetOperationFacilitiesQueryKey() });
        void client.invalidateQueries({ queryKey: getGetOperationsQueryKey() });
        onNotice(t(lang, 'removed'));
      },
      onError: () => onNotice(t(lang, 'removeFailed')),
    });
  };
  const removeHoursOverride = (facilityId: string, overrideId: string) => {
    if (!window.confirm(t(lang, 'removeSpecialHoursConfirm'))) return;
    removeHours.mutate({ id: facilityId, overrideId }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getGetOperationFacilitiesQueryKey() });
        void client.invalidateQueries({ queryKey: getGetOperationsQueryKey() });
        onNotice(t(lang, 'specialHoursRemoved'));
      },
      onError: () => onNotice(t(lang, 'specialHoursRemoveFailed')),
    });
  };
  return <section dir={lang === 'en' ? 'ltr' : 'rtl'}>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-[#687a71]">{t(lang, 'facilities')} · {records.length}</p></div>{!isAdmin && <button className={buttonClass} onClick={() => setEditing('new')}><Plus size={15} />{t(lang, 'addFacility')}</button>}</div>
    {facilities.isLoading ? <div className="h-36 animate-pulse rounded-3xl bg-[#e5e0d1]" /> : facilities.isError ? <button className={quietClass} onClick={() => void facilities.refetch()}><RefreshCw size={14} />{t(lang, 'retry')}</button> : records.length ? <div className="grid gap-4">{records.map(item => <article key={item.id} className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a76445]">{item.city} · {item.localizedDistrict[lang] || item.facility}</p><h2 className="mt-2 font-display text-2xl font-bold">{item.localizedName[lang] || item.facility}</h2><p className="mt-2 flex items-center gap-1 text-sm text-[#687a71]"><MapPin size={14} />{item.localizedAddress[lang] || item.city}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-[#687a71]">{item.localizedDescription[lang]}</p></div>{!isAdmin && <div className="flex gap-2"><button type="button" className={quietClass} onClick={() => setEditing(item)}>{t(lang, 'edit')}</button><button type="button" className={quietClass} disabled={remove.isPending} onClick={() => removeFacility(item)}>{t(lang, 'remove')}</button></div>}</div>
      <div className="mt-4 grid gap-3 border-t border-[#ece7d9] pt-4 md:grid-cols-2"><div><p className="mb-2 text-xs font-bold">{t(lang, 'hours')}</p><div className="grid grid-cols-2 gap-1 text-xs text-[#687a71]">{item.openingHours.map(hour => <span key={hour.day}>{localizedWeek[lang][hour.day]} · {hour.closed ? t(lang, 'closed') : `${hour.opensAt}–${hour.closesAt}`}</span>)}</div></div><div className="grid content-start gap-1 text-xs text-[#687a71]"><span>{t(lang, 'phone')}: {item.contactPhone || '—'}</span><span>{t(lang, 'website')}: {item.websiteUrl || '—'}</span>{item.latitude !== null && item.longitude !== null && <span>{item.latitude}, {item.longitude}</span>}</div></div>
      <section className="mt-4 border-t border-[#ece7d9] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">{t(lang, 'specialHours')}</h3>{!isAdmin && <button type="button" className={quietClass} onClick={() => setHoursEditorFor(hoursEditorFor === item.id ? null : item.id)}><CalendarClock size={14} />{t(lang, 'addSpecialHours')}</button>}</div>
        {item.specialHours.length ? <div className="mt-3 grid gap-2">{item.specialHours.map(override => <div key={override.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[#eeeadc] p-3">
          <div className="min-w-0"><p className="text-xs font-bold">{formatOverrideDateRange(override.startDate, override.endDate, lang)} · {override.closed ? t(lang, 'closedAllDay') : `${override.opensAt}–${override.closesAt}`}</p><p className="mt-1 text-xs leading-5 text-[#687a71]">{override.localizedReason[lang]}</p></div>
          {!isAdmin && <button type="button" className={quietClass} disabled={removeHours.isPending} onClick={() => removeHoursOverride(item.id, override.id)}>{t(lang, 'remove')}</button>}
        </div>)}</div> : <p className="mt-2 text-xs text-[#687a71]">{t(lang, 'noSpecialHours')}</p>}
        {hoursEditorFor === item.id && !isAdmin && <HoursOverrideEditor facilityId={item.id} lang={lang} onClose={() => setHoursEditorFor(null)} onSaved={() => { setHoursEditorFor(null); onNotice(t(lang, 'specialHoursSaved')); }} />}
      </section>
       <FacilityCheckinQrManager facility={item} lang={lang} />
      {item.activities.length > 0 && <div className="mt-4"><p className="mb-2 text-xs font-bold">{t(lang, 'activities')}</p><div className="flex flex-wrap gap-2">{item.activities.map((x, i) => <span key={i} className="rounded-full bg-[#eeeadc] px-3 py-1 text-xs">{x[lang]}</span>)}</div></div>}
      {item.amenities.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-bold">{t(lang, 'amenities')}</p><div className="flex flex-wrap gap-2">{item.amenities.map((x, i) => <span key={i} className="rounded-full bg-[#eeeadc] px-3 py-1 text-xs">{x[lang]}</span>)}</div></div>}
      {item.accessibility.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-bold">{t(lang, 'accessibility')}</p><div className="flex flex-wrap gap-2">{item.accessibility.map((x, i) => <span key={i} className="rounded-full bg-[#eeeadc] px-3 py-1 text-xs">{x[lang]}</span>)}</div></div>}
    </article>)}</div> : <div className="rounded-3xl border border-dashed border-[#d5cfbf] bg-[#fffdf7]/60 p-10 text-center"><h2 className="font-display text-xl font-bold">{t(lang, 'noFacilities')}</h2></div>}
    {editing && !isAdmin && <FacilityEditor partnerId={partnerId} facility={editing === 'new' ? undefined : editing} lang={lang} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onNotice(t(lang, 'saved')); }} />}
  </section>;
}

export function PartnerOperationsPanel({ tab, lang, partnerId, isAdmin, attendance, offerings, onNotice }: {
  tab: OperationsTab; lang: PortalLanguage; partnerId: string; isAdmin: boolean; attendance: GetAttendance200RowsItem[]; offerings: LiveOffering[]; onNotice: (message: string) => void;
}) {
  if (tab === 'facilities') return <Facilities lang={lang} partnerId={partnerId} isAdmin={isAdmin} onNotice={onNotice} />;
  if (tab === 'bookings') return <Bookings lang={lang} partnerId={partnerId} attendance={attendance} offerings={offerings} onNotice={onNotice} />;
  if (tab === 'settlements') return <Settlements lang={lang} isAdmin={isAdmin} onNotice={onNotice} />;
  return <Invoices lang={lang} isAdmin={isAdmin} onNotice={onNotice} />;
}
function Bookings({ lang, attendance, offerings, partnerId, onNotice }: { lang: PortalLanguage; attendance: GetAttendance200RowsItem[]; offerings: LiveOffering[]; partnerId: string; onNotice: (message: string) => void }) {
  const sorted = useMemo(() => [...offerings].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [offerings]);
  const facilityQuery = useGetOperationFacilities({ query: { enabled: !!partnerId, queryKey: getGetOperationFacilitiesQueryKey() } });
  const policyMutation = useSetCheckinPolicy();
  const client = useQueryClient();
  const [policySession, setPolicySession] = useState('');
  const [policyForm, setPolicyForm] = useState<CheckinPolicy | null>(null);
  const statusLabel = (value: string) => ({
    confirmed: t(lang, 'confirmed'), reserved: t(lang, 'reserved'), requested: t(lang, 'requested'),
    pending: t(lang, 'pending'), disputed: t(lang, 'disputed'), no_show: t(lang, 'noShow'),
    not_checked_in: t(lang, 'notCheckedIn'), partner_cancelled: t(lang, 'cancelledStatus'),
    cancelled: t(lang, 'cancelledStatus'), admin_cancelled: t(lang, 'adminCancelledStatus'),
    rejected: t(lang, 'requestRejected'), void: t(lang, 'voidedStatus'),
  }[value] ?? value.replaceAll('_', ' '));
  const submitPolicy = (event: FormEvent) => {
    event.preventDefault();
    const session = sorted.find(item => item.id === policySession);
    if (!session || !policyForm) return;
    policyMutation.mutate({ id: session.id, data: policyForm }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getGetOperationsQueryKey() });
        void client.invalidateQueries({ queryKey: getGetAttendanceQueryKey() });
        setPolicySession(''); setPolicyForm(null); onNotice(t(lang, 'saved'));
      },
        onError: () => { setPolicySession(''); setPolicyForm(null); onNotice(t(lang, 'policyError')); },
    });
  };
  return <section dir={lang === 'en' ? 'ltr' : 'rtl'}><div className="mb-5 rounded-2xl border border-[#ddd7c6] bg-[#f0ead9] p-4"><div className="flex items-center gap-2"><CalendarClock size={17} /><h2 className="font-display text-lg font-bold">{t(lang, 'bookings')}</h2></div><p className="mt-2 text-sm text-[#687a71]">{t(lang, 'bookingIntro')}</p></div><div className="grid gap-4 lg:grid-cols-2">{sorted.map(session => {
    const related = attendance.filter(row => row.title === session.title && row.facility === session.facility && row.startsAt === session.startsAt);
    const existingPolicy = session.checkinPolicy ?? related.find(row => row.policy)?.policy;
    const facility = facilityQuery.data?.find(item => item.partnerId === partnerId && item.city === session.city && item.facility === session.facility);
    const ended = new Date(session.endsAt).getTime() <= Date.now();
    const configure = () => {
      if (facility?.latitude == null || facility.longitude == null) { onNotice(t(lang, 'missingCoordinates')); return; }
      const start = new Date(session.startsAt).getTime();
      const end = new Date(session.endsAt).getTime();
      setPolicySession(session.id);
      setPolicyForm({
        latitude: facility.latitude, longitude: facility.longitude, radius: 100,
        opensAt: new Date(start - 15 * 60 * 1000).toISOString(),
        closesAt: new Date(end).toISOString(),
        correctionEndsAt: new Date(end + 24 * 60 * 60 * 1000).toISOString(),
      });
    };
    return <article key={session.id} className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5"><span className="rounded-full bg-[#e1efdf] px-2.5 py-1 text-[10px] font-bold text-[#2d6d4a]">{session.active ? t(lang, 'active') : t(lang, 'draft')}</span><h3 className="mt-3 font-display text-xl font-bold">{session.localizedTitle?.[lang] || session.title}</h3><p className="mt-1 text-sm text-[#687a71]">{session.facility} · {session.city} · {session.category}</p><p className="mt-3 text-xs text-[#75847c]">{t(lang, 'starts')}: {new Intl.DateTimeFormat(lang === 'en' ? 'en-IQ' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad', numberingSystem: 'latn' }).format(new Date(session.startsAt))}</p><p className="mt-3 border-t border-[#ece7d9] pt-3 text-xs font-semibold">{t(lang, 'bookingCount')}: {related.length}</p>
      {related.length > 0 && <ul className="mt-2 divide-y divide-[#ece7d9] rounded-xl bg-[#f7f4e9] px-3">{related.slice(0, 12).map(row => <li key={row.reservationId} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-xs"><span>{t(lang, 'booking')} · {statusLabel(row.bookingStatus)}</span><span>{t(lang, 'attendance')} · {statusLabel(row.status)}</span></li>)}</ul>}
      {session.accessType !== 'live' && !ended && !session.cancelledAt && <div className="mt-4 border-t border-[#ece7d9] pt-3">{existingPolicy ? <p className="text-xs font-semibold text-[#2d6d4a]">{t(lang, 'policyReady')}</p> : <button type="button" className={quietClass} onClick={configure}>{t(lang, 'configurePolicy')}</button>}
        {policySession === session.id && policyForm && <form onSubmit={submitPolicy} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">{t(lang, 'radius')}<input required min="25" max="800" type="number" className={inputClass} value={policyForm.radius} onChange={e => setPolicyForm({ ...policyForm, radius: Number(e.target.value) })} /></label>
          <label className="text-xs">{t(lang, 'opensAt')}<input required type="datetime-local" className={inputClass} value={toBaghdadInput(policyForm.opensAt)} onChange={e => setPolicyForm({ ...policyForm, opensAt: fromBaghdadInput(e.target.value) })} /></label>
          <label className="text-xs">{t(lang, 'closesAt')}<input required type="datetime-local" className={inputClass} value={toBaghdadInput(policyForm.closesAt)} onChange={e => setPolicyForm({ ...policyForm, closesAt: fromBaghdadInput(e.target.value) })} /></label>
          <label className="text-xs">{t(lang, 'correction')}<input required type="datetime-local" className={inputClass} value={toBaghdadInput(policyForm.correctionEndsAt)} onChange={e => setPolicyForm({ ...policyForm, correctionEndsAt: fromBaghdadInput(e.target.value) })} /></label>
          <button type="submit" disabled={policyMutation.isPending} className={`${buttonClass} sm:col-span-2`}>{policyMutation.isPending ? t(lang, 'loading') : t(lang, 'updatePolicy')}</button>
        </form>}</div>}
    </article>;
  })}</div>{!sorted.length && <div className="rounded-3xl border border-dashed border-[#d5cfbf] bg-[#fffdf7]/60 p-10 text-center"><p className="text-sm text-[#75847c]">{t(lang, 'noBookings')}</p></div>}</section>;
}
function Settlements({ lang, isAdmin, onNotice }: { lang: PortalLanguage; isAdmin: boolean; onNotice: (message: string) => void }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const params = useMemo(() => ({ from, to }), [from, to]);
  const query = useGetPartnerSettlementSummary(params, { query: { enabled: !isAdmin, queryKey: getGetPartnerSettlementSummaryQueryKey(params) } });
  const data: PartnerSettlementSummary | undefined = query.data;
  return <section dir={lang === 'en' ? 'ltr' : 'rtl'}><div className="mb-5 flex flex-wrap items-end gap-3 rounded-3xl bg-[#174d43] p-5 text-[#fff9e9]"><div className="mr-auto"><p className="text-xs uppercase tracking-[.16em] text-[#d4dfcf]">{t(lang, 'settlements')}</p><h2 className="mt-2 font-display text-2xl font-bold">{t(lang, 'summary')}</h2></div><label className="text-xs">{t(lang, 'dateFrom')}<input type="date" className={inputClass} value={from} onChange={e => setFrom(e.target.value)} /></label><label className="text-xs">{t(lang, 'dateTo')}<input type="date" className={inputClass} value={to} onChange={e => setTo(e.target.value)} /></label><button className="rounded-xl bg-[#fff9e9]/15 p-3" onClick={() => void query.refetch()} aria-label={t(lang, 'retry')}><RefreshCw size={16} /></button></div>
    {query.isLoading ? <div className="h-32 animate-pulse rounded-3xl bg-[#e5e0d1]" /> : query.isError ? <button className={quietClass} onClick={() => void query.refetch()}>{t(lang, 'retry')}</button> : data && <><div className="grid gap-3 sm:grid-cols-3">{([['verified', data.verifiedVisits], ['rejected', data.rejectedVisits], ['onHold', data.onHoldVisits]] as const).map(([key, value]) => <article key={key} className="rounded-2xl border border-[#ddd7c6] bg-[#fffdf7] p-5"><p className="text-xs text-[#687a71]">{t(lang, key)}</p><p className="mt-2 font-display text-3xl font-bold">{value.toLocaleString(lang === 'en' ? 'en-IQ' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ')}</p></article>)}</div><p className="mt-4 flex items-center gap-2 rounded-2xl bg-[#f0ead9] p-4 text-xs text-[#687a71]"><ShieldCheck size={15} />{t(lang, 'settlementNote')}</p><div className="mt-4 overflow-x-auto rounded-3xl border border-[#ddd7c6] bg-[#fffdf7]"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[#eeeadc] text-xs"><tr>{(['facility', 'cityLabel', 'category', 'access', 'verified', 'rejected', 'onHold'] as const).map(k => <th key={k} className="px-4 py-3">{t(lang, k)}</th>)}</tr></thead><tbody>{data.groups.map((row, i) => <tr key={`${row.facility}-${row.category}-${i}`} className="border-t border-[#ece7d9]"><td className="px-4 py-3 font-semibold">{row.facility}</td><td className="px-4 py-3">{row.city}</td><td className="px-4 py-3">{row.category}</td><td className="px-4 py-3">{row.accessType}</td><td className="px-4 py-3">{row.verifiedVisits}</td><td className="px-4 py-3">{row.rejectedVisits}</td><td className="px-4 py-3">{row.onHoldVisits}</td></tr>)}</tbody></table></div></>}{isAdmin && <p className="text-sm">{t(lang, 'failed')}</p>}</section>;
}

function Invoices({ lang, isAdmin, onNotice }: { lang: PortalLanguage; isAdmin: boolean; onNotice: (message: string) => void }) {
  const client = useQueryClient();
  const invoices = useGetPartnerInvoices({ query: { enabled: !isAdmin, queryKey: getGetPartnerInvoicesQueryKey() } });
  const requestUpload = useRequestPartnerInvoiceUploadUrl();
  const submit = useSubmitPartnerInvoice();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const statusText = (status: string) => status === 'accepted' ? t(lang, 'accepted') : status === 'rejected' ? t(lang, 'declined') : status === 'under_review' ? t(lang, 'review') : t(lang, 'submitted');
  const formSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!file || (file.type && file.type !== 'application/pdf') || !file.name.toLowerCase().endsWith('.pdf') || file.name.length > 180 || file.size < 1 || file.size > 10 * 1024 * 1024) { setError(t(lang, 'fileType')); return; }
    setBusy(true);
    try {
      const signed = await requestUpload.mutateAsync({ data: { fileName: file.name, size: file.size } });
      const put = await fetch(signed.uploadURL, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file });
      if (!put.ok) throw new Error('Storage upload failed');
      const payload: PartnerInvoiceInput = {
        invoiceNumber: String(form.get('invoiceNumber')).trim(), amountIqd: Number(form.get('amountIqd')),
        issuedAt: String(form.get('issuedAt')), periodStart: String(form.get('periodStart')), periodEnd: String(form.get('periodEnd')),
        taxNumber: String(form.get('taxNumber') || '').trim() || null, documentPath: signed.documentPath, documentName: file.name,
      };
      await submit.mutateAsync({ data: payload });
      trackEvent('partner_invoice_submitted', { document_type: 'pdf', surface: 'partner_portal' });
      await client.invalidateQueries({ queryKey: getGetPartnerInvoicesQueryKey() });
      formElement.reset(); setFile(null); onNotice(t(lang, 'submitted'));
    } catch { setError(t(lang, 'uploadError')); }
    finally { setBusy(false); }
  };
  const download = async (id: string, name: string) => {
    try {
      const blob = await downloadPartnerInvoiceDocument(id);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { onNotice(t(lang, 'uploadError')); }
  };
  return <section dir={lang === 'en' ? 'ltr' : 'rtl'}>
    <div className="mb-5 rounded-3xl bg-[#174d43] p-5 text-[#fff9e9]"><div className="flex items-center gap-2"><Wallet size={18} /><h2 className="font-display text-2xl font-bold">{t(lang, 'invoices')}</h2></div><p className="mt-2 max-w-2xl text-sm leading-6 text-[#d1dfd6]">{t(lang, 'invoiceIntro')}</p></div>
    {!isAdmin && <form onSubmit={formSubmit} className="grid gap-3 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:grid-cols-2"><label className="text-xs font-semibold">{t(lang, 'invoiceNumber')}<input required maxLength={100} name="invoiceNumber" className={inputClass} /></label><label className="text-xs font-semibold">{t(lang, 'amount')}<input required min="1" max="1000000000" type="number" name="amountIqd" className={inputClass} /></label><label className="text-xs font-semibold">{t(lang, 'issueDate')}<input required type="date" name="issuedAt" className={inputClass} /></label><label className="text-xs font-semibold">{t(lang, 'taxNumber')}<input maxLength={80} name="taxNumber" className={inputClass} /></label><label className="text-xs font-semibold">{t(lang, 'periodStart')}<input required type="date" name="periodStart" className={inputClass} /></label><label className="text-xs font-semibold">{t(lang, 'periodEnd')}<input required type="date" name="periodEnd" className={inputClass} /></label><label className="text-xs font-semibold sm:col-span-2">{t(lang, 'pdf')}<input required type="file" accept="application/pdf,.pdf" className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-[#eeeadc] file:px-3 file:py-2`} onChange={e => setFile(e.target.files?.[0] ?? null)} /><span className="mt-1 block font-normal text-[#75847c]">{t(lang, 'fileType')}</span></label>{error && <p role="alert" className="text-sm text-[#9a4435] sm:col-span-2">{error}</p>}<button className={`${buttonClass} sm:col-span-2`} disabled={busy || requestUpload.isPending || submit.isPending}><Upload size={15} />{busy ? t(lang, 'submitting') : t(lang, 'submitInvoice')}</button></form>}
    {invoices.isLoading ? <div className="mt-5 h-24 animate-pulse rounded-3xl bg-[#e5e0d1]" /> : invoices.isError ? <button className={`${quietClass} mt-5`} onClick={() => void invoices.refetch()}>{t(lang, 'retry')}</button> : invoices.data?.length ? <div className="mt-5 grid gap-3">{invoices.data.map(invoice => <article key={invoice.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-[#ddd7c6] bg-[#fffdf7] p-4 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><span className="rounded-xl bg-[#f0ead9] p-3"><FileText size={18} /></span><div><h3 className="font-bold">{invoice.invoiceNumber}</h3><p className="mt-1 text-xs text-[#687a71]">{invoice.amountIqd.toLocaleString()} IQD · {invoice.periodStart} – {invoice.periodEnd}</p><p className="mt-1 text-xs text-[#75847c]">{invoice.documentName} · {t(lang, 'status')}: {statusText(invoice.status)}</p></div></div><button className={quietClass} onClick={() => void download(invoice.id, invoice.documentName)}><Download size={15} />{t(lang, 'document')}</button></article>)}</div> : !isAdmin && <p className="mt-5 rounded-2xl bg-[#f0ead9] p-5 text-sm text-[#687a71]">{t(lang, 'noInvoices')}</p>}
  </section>;
}
