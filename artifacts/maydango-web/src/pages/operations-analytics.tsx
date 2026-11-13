import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, CalendarDays, Check, ChevronDown, Download, FileSpreadsheet, Printer,
  Moon, RefreshCw, ShieldCheck, Sun, TrendingUp,
} from 'lucide-react';
import {
  getGetOperationsAnalyticsQueryKey,
  useGetOperationsAnalytics,
} from '@workspace/api-client-react';
import type { OperationsAnalyticsResponse } from '@workspace/api-client-react';
import {
  Area, AreaChart, CartesianGrid, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

type Language = 'en' | 'ar' | 'ku';
type TranslationKey = keyof typeof copy.en;
type UnavailableMetric = OperationsAnalyticsResponse['unavailableMetrics'][number];

const copy = {
  en: {
    title: 'Operations analytics', subtitle: 'A reliable view of activity across your authorized MaydanGo scope.',
    scope: 'Authorized scope', admin: 'Administrator view', partnerView: 'Partner view',
    privacy: 'Aggregate insight only. No member identities or member-level records are shown.',
    operational: 'Operational metrics', financial: 'Financial reporting',
    operationalNote: 'Visits, bookings, attendance and engagement in the selected period.',
    deferredTitle: 'Financial metrics are deferred', deferred: 'Financial reporting will be available after the payments milestone. These figures are not represented as zero.',
    notTracked: 'Not tracked yet', notTrackedNote: 'Instructor, fraud, referral and promotion performance are not tracked yet.',
    refresh: 'Refresh', autoRefresh: 'Auto-refresh', off: 'Off', every5: 'Every 5 minutes', every15: 'Every 15 minutes', every60: 'Every hour',
    lastUpdated: 'Last updated', from: 'From · Baghdad date', to: 'To · Baghdad date', apply: 'Apply dates',
    period: 'Selected period', baghdad: 'Asia/Baghdad calendar dates',
    visits: 'Visits', physical: 'Physical check-ins', premium: 'Premium check-ins', liveBookings: 'Live class bookings',
    enrollments: 'Course enrollments', completions: 'Course completions', activeSubs: 'Active subscriptions',
    corporateMembers: 'Corporate active members', dailyVisits: 'Daily visits', monthlyVisits: 'Monthly visits',
    unique: 'Unique customers', repeat: 'Repeat customers', retention: 'Repeat-visit rate', noShow: 'No-show rate',
    cancellation: 'Cancellation rate', occupancy: 'Occupancy rate', rating: 'Average rating', ratingCount: 'Ratings',
    trendTitle: 'Activity over time', trendDesc: 'Daily visits, live bookings and course activity',
    facilityTitle: 'Facility performance', classTitle: 'Popular classes', courseTitle: 'Course performance',
    partnerTitle: 'Partner performance', location: 'Facility', city: 'City', bookings: 'Bookings',
    cancellations: 'Cancellations', noShows: 'No-shows', customers: 'Unique customers', completionRate: 'Completion rate',
    course: 'Course', class: 'Class', partner: 'Partner', exportCsv: 'Download chart data as CSV',
    noData: 'No rows were returned for this period.', loadError: 'Analytics could not be loaded.',
    retry: 'Try again', loading: 'Loading analytics', refreshLoading: 'Refreshing data…',
    exportAll: 'Export aggregate data for Excel', print: 'Print or save as PDF',
    chartDate: 'Date', trendVisits: 'Visits', trendBookings: 'Live bookings', trendEnroll: 'Enrollments', trendComplete: 'Completions',
    ratingBasis: 'ratings', noFinancialValues: 'Deferred', supported: 'Supported by aggregated service data',
    unavailable: 'Availability notes', accounting: 'Accounting-system export is not available until payment and accounting requirements are defined.',
    visitSplit: 'Check-in mix', checkinHelp: 'Physical and premium check-ins are operational counts.',
    courseActivity: 'Course activity', bookingsVisits: 'Bookings and visits', rank: 'Rank',
    switchDark: 'Switch to dark display', switchLight: 'Switch to light display',
    todayBaghdad: 'Today in Baghdad', monthBaghdad: 'Current month in Baghdad',
    repeatDefinition: 'Unique visitors with 2+ confirmed visits in this period.',
    noShowDefinition: 'No-shows ÷ confirmed or no-show attendance records.',
    cancellationDefinition: 'Cancelled bookings ÷ bookings created in this period.',
    occupancyDefinition: 'Confirmed visits ÷ capacity of scheduled sessions.',
  },
  ar: {
    title: 'تحليلات العمليات', subtitle: 'عرض موثوق للنشاط ضمن نطاق MaydanGo المصرح به.',
    scope: 'النطاق المصرح به', admin: 'عرض المدير', partnerView: 'عرض الشريك',
    privacy: 'بيانات مجمعة فقط. لا تظهر هويات الأعضاء أو سجلاتهم الفردية.',
    operational: 'المؤشرات التشغيلية', financial: 'التقارير المالية',
    operationalNote: 'الزيارات والحجوزات والحضور والتفاعل خلال الفترة المحددة.',
    deferredTitle: 'المؤشرات المالية مؤجلة', deferred: 'ستتوفر التقارير المالية بعد إنجاز مرحلة المدفوعات. لا تُمثل هذه القيم على أنها صفر.',
    notTracked: 'غير متتبعة بعد', notTrackedNote: 'أداء المدربين والاحتيال والإحالات والعروض الترويجية غير متتبع بعد.',
    refresh: 'تحديث', autoRefresh: 'التحديث التلقائي', off: 'إيقاف', every5: 'كل ٥ دقائق', every15: 'كل ١٥ دقيقة', every60: 'كل ساعة',
    lastUpdated: 'آخر تحديث', from: 'من · تاريخ بغداد', to: 'إلى · تاريخ بغداد', apply: 'تطبيق التواريخ',
    period: 'الفترة المحددة', baghdad: 'تواريخ تقويمية بتوقيت آسيا/بغداد',
    visits: 'الزيارات', physical: 'تسجيلات الحضور الحضورية', premium: 'تسجيلات الحضور المميزة', liveBookings: 'حجوزات الصفوف المباشرة',
    enrollments: 'التسجيلات في الدورات', completions: 'إكمال الدورات', activeSubs: 'الاشتراكات النشطة',
    corporateMembers: 'الأعضاء النشطون للمؤسسات', dailyVisits: 'الزيارات اليومية', monthlyVisits: 'الزيارات الشهرية',
    unique: 'الأعضاء الفريدون', repeat: 'الأعضاء المتكررون', retention: 'معدل تكرار الزيارة', noShow: 'معدل عدم الحضور',
    cancellation: 'معدل الإلغاء', occupancy: 'الإشغال', rating: 'متوسط التقييم', ratingCount: 'التقييمات',
    trendTitle: 'النشاط عبر الوقت', trendDesc: 'الزيارات اليومية والحجوزات المباشرة ونشاط الدورات',
    facilityTitle: 'أداء المرافق', classTitle: 'الصفوف الأكثر شعبية', courseTitle: 'أداء الدورات',
    partnerTitle: 'أداء الشركاء', location: 'المرفق', city: 'المدينة', bookings: 'الحجوزات',
    cancellations: 'الإلغاءات', noShows: 'عدم الحضور', customers: 'الأعضاء الفريدون', completionRate: 'معدل الإكمال',
    course: 'الدورة', class: 'الصف', partner: 'الشريك', exportCsv: 'تنزيل بيانات الرسم بصيغة CSV',
    noData: 'لا توجد صفوف للفترة المحددة.', loadError: 'تعذر تحميل التحليلات.',
    retry: 'أعد المحاولة', loading: 'جارٍ تحميل التحليلات', refreshLoading: 'جارٍ تحديث البيانات…',
    exportAll: 'تصدير البيانات المجمعة إلى Excel', print: 'طباعة أو حفظ بصيغة PDF',
    chartDate: 'التاريخ', trendVisits: 'الزيارات', trendBookings: 'الحجوزات المباشرة', trendEnroll: 'التسجيلات', trendComplete: 'الإكمالات',
    ratingBasis: 'تقييمات', noFinancialValues: 'مؤجل', supported: 'مدعوم ببيانات الخدمة المجمعة',
    unavailable: 'ملاحظات الإتاحة', accounting: 'تصدير نظام المحاسبة غير متاح إلى حين تحديد متطلبات الدفع والمحاسبة.',
    visitSplit: 'مزيج الحضور', checkinHelp: 'تسجيلات الحضور الحضورية والمميزة أعداد تشغيلية.',
    courseActivity: 'نشاط الدورات', bookingsVisits: 'الحجوزات والزيارات', rank: 'الترتيب',
    switchDark: 'التبديل إلى العرض الداكن', switchLight: 'التبديل إلى العرض الفاتح',
    todayBaghdad: 'اليوم بتوقيت بغداد', monthBaghdad: 'الشهر الحالي بتوقيت بغداد',
    repeatDefinition: 'الزوار الفريدون الذين سجلوا زيارتين مؤكدتين أو أكثر خلال هذه الفترة.',
    noShowDefinition: 'حالات عدم الحضور ÷ سجلات الحضور المؤكدة أو عدم الحضور.',
    cancellationDefinition: 'الحجوزات الملغاة ÷ الحجوزات المنشأة خلال هذه الفترة.',
    occupancyDefinition: 'الزيارات المؤكدة ÷ سعة الجلسات المجدولة.',
  },
  ku: {
    title: 'شیکاریی کارگێڕی', subtitle: 'بینینێکی متمانەپێکراو بۆ چالاکی لە چوارچێوەی ڕێپێدراوی MaydanGo.',
    scope: 'چوارچێوەی ڕێپێدراو', admin: 'بینینی بەڕێوەبەر', partnerView: 'بینینی هاوبەش',
    privacy: 'تەنها زانیاریی کۆکراوە. ناسنامە یان تۆماری تاکەکەسیی ئەندامان پیشان نادرێت.',
    operational: 'پێوەرە کارگێڕییەکان', financial: 'ڕاپۆرتی دارایی',
    operationalNote: 'سەردان، حجز، ئامادەبوون و بەشداری لە ماوەی دیاریکراودا.',
    deferredTitle: 'پێوەرە داراییەکان دواخراون', deferred: 'ڕاپۆرتی دارایی دوای تەواوبوونی قۆناغی پارەدان بەردەست دەبێت. ئەم نرخانە وەک سفر نیشان نادرێن.',
    notTracked: 'هێشتا چاودێری ناکرێت', notTrackedNote: 'کارایی ڕاهێنەر، ساختەکاری، ڕەوانەکردن و بانگەشە هێشتا چاودێری ناکرێت.',
    refresh: 'نوێکردنەوە', autoRefresh: 'نوێکردنەوەی خۆکار', off: 'ناچالاک', every5: 'هەر ٥ خولەک', every15: 'هەر ١٥ خولەک', every60: 'هەر کاتژمێرێک',
    lastUpdated: 'دوایین نوێکردنەوە', from: 'لە · بەرواری بەغدا', to: 'تا · بەرواری بەغدا', apply: 'جێبەجێکردنی بەروار',
    period: 'ماوەی هەڵبژێردراو', baghdad: 'بەرواری ڕۆژژمێریی بەغدا',
    visits: 'سەردانەکان', physical: 'ئامادەبوونی ڕووبەڕوو', premium: 'ئامادەبوونی تایبەت', liveBookings: 'حجزەکانی وانەی ڕاستەوخۆ',
    enrollments: 'تۆماربوون لە کۆرس', completions: 'تەواوکردنی کۆرس', activeSubs: 'ئەندامێتیی چالاک',
    corporateMembers: 'ئەندامانی چالاکی دامەزراوە', dailyVisits: 'سەردانی ڕۆژانە', monthlyVisits: 'سەردانی مانگانە',
    unique: 'ئەندامی جیاواز', repeat: 'ئەندامی دووبارە', retention: 'ڕێژەی دووبارەسەردان', noShow: 'ڕێژەی نەهاتن',
    cancellation: 'ڕێژەی هەڵوەشاندنەوە', occupancy: 'ڕێژەی پڕبوون', rating: 'تێکڕای هەڵسەنگاندن', ratingCount: 'هەڵسەنگاندنەکان',
    trendTitle: 'چالاکی بە درێژایی کات', trendDesc: 'سەردانی ڕۆژانە، حجزە ڕاستەوخۆکان و چالاکیی کۆرس',
    facilityTitle: 'کارایی شوێنەکان', classTitle: 'وانە بەناوبانگەکان', courseTitle: 'کارایی کۆرس',
    partnerTitle: 'کارایی هاوبەشان', location: 'شوێن', city: 'شار', bookings: 'حجزەکان',
    cancellations: 'هەڵوەشاندنەوەکان', noShows: 'نەهاتنەکان', customers: 'ئەندامی جیاواز', completionRate: 'ڕێژەی تەواوکردن',
    course: 'کۆرس', class: 'وانە', partner: 'هاوبەش', exportCsv: 'داگرتنی زانیاریی چارت بە CSV',
    noData: 'هیچ داتایەک بۆ ئەم ماوەیە نییە.', loadError: 'بارکردنی شیکارییەکان سەرکەوتوو نەبوو.',
    retry: 'دووبارە هەوڵ بدە', loading: 'بارکردنی شیکاری', refreshLoading: 'نوێکردنەوەی داتا…',
    exportAll: 'هەناردەکردنی داتای کۆکراوە بۆ Excel', print: 'چاپکردن یان پاشەکەوتکردن وەک PDF',
    chartDate: 'بەروار', trendVisits: 'سەردانەکان', trendBookings: 'حجزە ڕاستەوخۆکان', trendEnroll: 'تۆماربوون', trendComplete: 'تەواوکردن',
    ratingBasis: 'هەڵسەنگاندن', noFinancialValues: 'دواخراوە', supported: 'پشتگیریی کراوە بە داتای کۆکراوەی خزمەتگوزاری',
    unavailable: 'تێبینیی بەردەستبوون', accounting: 'هەناردەکردنی بۆ سیستەمی ژمێریاری تا دیاریکردنی پێداویستیی پارەدان و ژمێریاری بەردەست نابێت.',
    visitSplit: 'جۆری ئامادەبوون', checkinHelp: 'ئامادەبوونی ڕووبەڕوو و تایبەت ژمارەی کارگێڕییە.',
    courseActivity: 'چالاکیی کۆرس', bookingsVisits: 'حجز و سەردان', rank: 'پلە',
    switchDark: 'گۆڕین بۆ شێوازی تاریک', switchLight: 'گۆڕین بۆ شێوازی ڕووناک',
    todayBaghdad: 'ئەمڕۆ بە کاتی بەغدا', monthBaghdad: 'ئەم مانگە بە کاتی بەغدا',
    repeatDefinition: 'سەردانکەرانی جیاواز کە لەم ماوەیەدا دوو سەردانی پشتڕاستکراوە یان زیاتر هەیانە.',
    noShowDefinition: 'نەهاتن ÷ تۆمارەکانی ئامادەبوونی پشتڕاستکراوە یان نەهاتن.',
    cancellationDefinition: 'حجزە هەڵوەشێنراوەکان ÷ حجزە دروستکراوەکان لەم ماوەیەدا.',
    occupancyDefinition: 'سەردانی پشتڕاستکراوە ÷ گنجایشی وانە پلاندانراوەکان.',
  },
} as const;

const unavailableNames: Record<Language, Partial<Record<UnavailableMetric, string>>> = {
  en: {
    membership_sales: 'Membership sales', renewals: 'Renewals', membership_cancellations: 'Membership cancellations',
    churn: 'Churn', revenue: 'Revenue', failed_payments: 'Failed payments', partner_cost: 'Partner costs',
    gross_margin: 'Gross margin', event_revenue: 'Event revenue', instructor_performance: 'Instructor performance',
    referral_performance: 'Referral performance', promotion_performance: 'Promotion performance',
    fraud_alerts: 'Fraud alerts', refund_rate: 'Refund rate', chargeback_rate: 'Chargeback rate',
    estimated_earnings: 'Estimated earnings', accounting_export: 'Accounting export',
  },
  ar: {
    membership_sales: 'مبيعات الاشتراكات', renewals: 'التجديدات', membership_cancellations: 'إلغاءات الاشتراكات',
    churn: 'معدل فقدان الأعضاء', revenue: 'الإيرادات', failed_payments: 'المدفوعات الفاشلة', partner_cost: 'تكاليف الشركاء',
    gross_margin: 'هامش الربح الإجمالي', event_revenue: 'إيرادات الفعاليات', instructor_performance: 'أداء المدربين',
    referral_performance: 'أداء الإحالات', promotion_performance: 'أداء العروض الترويجية',
    fraud_alerts: 'تنبيهات الاحتيال', refund_rate: 'معدل الاسترداد', chargeback_rate: 'معدل الاعتراضات على المدفوعات',
    estimated_earnings: 'الأرباح التقديرية', accounting_export: 'تصدير المحاسبة',
  },
  ku: {
    membership_sales: 'فرۆشتنی ئەندامێتی', renewals: 'نوێکردنەوەکان', membership_cancellations: 'هەڵوەشاندنەوەی ئەندامێتی',
    churn: 'لەدەستدانی ئەندام', revenue: 'داهات', failed_payments: 'پارەدانی سەرنەکەوتوو', partner_cost: 'تێچووی هاوبەش',
    gross_margin: 'قازانجی گشتی', event_revenue: 'داهاتی بۆنەکان', instructor_performance: 'کارایی ڕاهێنەر',
    referral_performance: 'کارایی ڕەوانەکردن', promotion_performance: 'کارایی ئۆفەرەکان',
    fraud_alerts: 'ئاگادارکردنەوەی ساختەکاری', refund_rate: 'ڕێژەی گەڕاندنەوەی پارە', chargeback_rate: 'ڕێژەی ناڕەزایی لە پارەدان',
    estimated_earnings: 'داهاتی خەمڵێنراو', accounting_export: 'هەناردەی ژمێریاری',
  },
};

const intervals = [0, 5, 15, 60] as const;
const localeFor = (lang: Language) => lang === 'ar' ? 'ar-IQ' : lang === 'ku' ? 'ckb-IQ' : 'en-IQ';
const baghdadDate = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const baghdadDateOffset = (offset: number) => {
  const today = baghdadDate(new Date());
  const [year, month, day] = today.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset, 12));
  return date.toISOString().slice(0, 10);
};
const numberFormat = (value: number, lang: Language) => new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits: 1 }).format(value);
const pctFormat = (value: number | null, lang: Language) => value === null ? '—' : `${numberFormat(value, lang)}%`;
const safeCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const quote = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [keys.map(quote).join(','), ...rows.map(row => keys.map(key => quote(row[key])).join(','))].join('\r\n');
};
const downloadCsv = (name: string, rows: Record<string, unknown>[]) => {
  const blob = new Blob(['\ufeff', safeCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
const downloadExcel = (data: OperationsAnalyticsResponse) => {
  const sections: [string, Record<string, unknown>[]][] = [
    ['Summary', Object.entries(data.summary).map(([Metric, Value]) => ({ Metric, Value: Value ?? 'Not available' }))],
    ['Daily trend', data.trend],
    ['Facility performance', data.facilityPerformance],
    ['Popular classes', data.popularClasses],
    ['Course performance', data.coursePerformance],
    ...(data.role === 'partner_operations_admin' ? [['Partner performance', data.partnerPerformance] as [string, Record<string, unknown>[]]] : []),
  ];
  const escapeHtml = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  };
  const html = `<html><meta charset="utf-8"><body>${sections.map(([name, rows]) => `<h2>${escapeHtml(name)}</h2><table border="1"><thead><tr>${Object.keys(rows[0] ?? {}).map(key => `<th>${escapeHtml(key)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${Object.values(row).map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')}</body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'maydango-operations-aggregate.xls';
  link.click();
  URL.revokeObjectURL(url);
};

export function OperationsAnalytics({ language = 'en' }: { language?: Language }) {
  const t = (key: TranslationKey) => copy[language][key] as string;
  const metricLabel = (key: UnavailableMetric) => unavailableNames[language][key] ?? key.replaceAll('_', ' ');
  const [from, setFrom] = useState(() => {
    return baghdadDateOffset(-29);
  });
  const [to, setTo] = useState(() => baghdadDate(new Date()));
  const [appliedRange, setAppliedRange] = useState(() => {
    return { from: baghdadDateOffset(-29), to: baghdadDate(new Date()) };
  });
  const [autoMinutes, setAutoMinutes] = useState(0);
  const [darkMode, setDarkMode] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem('maydango-analytics-theme') === 'dark');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const params = useMemo(() => appliedRange, [appliedRange]);
  const query = useGetOperationsAnalytics(params, {
    query: {
      queryKey: getGetOperationsAnalyticsQueryKey(params),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchInterval: autoMinutes ? autoMinutes * 60 * 1000 : false,
      retry: false,
    },
  });
  const data = query.data;
  const busy = query.isLoading || query.isFetching;
  const dir = language === 'en' ? 'ltr' : 'rtl';
  const numberLocale = localeFor(language);
  const lastUpdated = query.dataUpdatedAt
    ? new Intl.DateTimeFormat(numberLocale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(query.dataUpdatedAt))
    : null;
  const summary = data?.summary;
  const chartPalette = { visits: '#174d43', bookings: '#d58a52', course: '#b49a51', muted: '#82918a', grid: '#e7e1d2' };
  const card = 'rounded-2xl border border-[#dfdacb] bg-[#fffdf7] p-4 sm:p-5';
  const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-xs font-semibold text-[#34564b] transition hover:bg-[#f3f0e5] disabled:opacity-50';
  const labelClass = 'mb-1.5 block text-[11px] font-semibold text-[#66776e]';

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, []);
  useEffect(() => {
    window.localStorage.setItem('maydango-analytics-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const exportRows = (section: string, rows: Record<string, unknown>[]) => downloadCsv(`maydango-${section}.csv`, rows);
  const csvButton = (section: string, rows: Record<string, unknown>[]) => rows.length > 0 && (
    <button type="button" data-testid={`button-export-${section}-csv`} aria-label={t('exportCsv')} title={t('exportCsv')}
      onClick={() => exportRows(section, rows)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#557065] hover:bg-[#f2efe4]">
      <Download size={15} />
    </button>
  );

  const metric = (title: TranslationKey, value: number | null | undefined, note?: string) => (
    <article key={title} data-testid={`metric-${title}`} className="min-h-[105px] rounded-xl border border-[#e6e0d2] bg-[#fffdf7] p-4">
      <p className="text-xs font-medium leading-5 text-[#66776e]">{t(title)}</p>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums text-[#174d43]">{value === null || value === undefined ? '—' : numberFormat(value, language)}</p>
      {note && <p className="mt-1 text-[10px] text-[#89948d]">{note}</p>}
    </article>
  );
  const rateMetric = (title: TranslationKey, value: number | null, note?: string) => (
    <article key={title} data-testid={`metric-${title}`} className="min-h-[105px] rounded-xl border border-[#e6e0d2] bg-[#fffdf7] p-4">
      <p className="text-xs font-medium leading-5 text-[#66776e]">{t(title)}</p>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums text-[#174d43]">{pctFormat(value, language)}</p>
      {note && <p className="mt-1 text-[10px] text-[#89948d]">{note}</p>}
    </article>
  );
  const sectionHeader = (title: TranslationKey, desc?: TranslationKey, action?: ReactNode) => (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><h3 className="font-display text-base font-bold text-[#214b40]">{t(title)}</h3>{desc && <p className="mt-1 text-xs leading-5 text-[#78857d]">{t(desc)}</p>}</div>
      {action}
    </div>
  );
  const renderTable = (headers: string[], rows: (string | number)[][], rowPrefix: string) => rows.length ? (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[610px] text-start text-sm">
        <thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`} className="border-b border-[#e7e1d2] px-2 py-2 text-start text-[10px] font-semibold uppercase tracking-wide text-[#829087]">{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${rowPrefix}-${index}`} data-testid={`row-${rowPrefix}-${index}`} className="border-b border-[#f0ecdf] last:border-0">
          {row.map((cell, cellIndex) => <td key={`${rowPrefix}-${index}-${cellIndex}`} className="px-2 py-3 text-[#40564c]">{cell}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
  ) : <div className="rounded-xl bg-[#f7f4e9] px-4 py-6 text-center text-sm text-[#78857d]">{t('noData')}</div>;
  const stateSkeleton = (height = 260) => (
    <div className="space-y-3 animate-pulse" style={{ minHeight: height }}>
      <div className="h-4 w-1/3 rounded bg-[#e9e4d7]" /><div className="h-3 w-4/5 rounded bg-[#f0ecdf]" />
      <div className="mt-8 h-36 rounded-xl bg-[#f0ecdf]" />
    </div>
  );

  return (
    <section dir={dir} lang={language === 'ku' ? 'ckb' : language} data-theme={darkMode ? 'dark' : 'light'} data-testid="operations-analytics" className="space-y-5 text-[#23473d]">
      <style>{`
        [data-testid="operations-analytics"][data-theme="dark"] { background:#101c18; color:#e5eee8; padding:1rem; border-radius:1.5rem; }
        [data-testid="operations-analytics"][data-theme="dark"] [class*="bg-[#fffdf7]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="bg-[#fffaf0]"] { background-color:#182922 !important; }
        [data-testid="operations-analytics"][data-theme="dark"] [class*="bg-[#f8f5eb]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="bg-[#f7f4e9]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="bg-[#f5f3eb]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="bg-[#f3f0e5]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="bg-[#f2efe4]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="bg-[#f0ecdf]"] { background-color:#20342c !important; }
        [data-testid="operations-analytics"][data-theme="dark"] [class*="text-[#23473d]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="text-[#40564c]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="text-[#214b40]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="text-[#174d43]"] { color:#e5eee8 !important; }
        [data-testid="operations-analytics"][data-theme="dark"] [class*="text-[#66776e]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="text-[#78857d]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="text-[#829087]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="text-[#687a71]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="text-[#89948d]"] { color:#b8c9bf !important; }
        [data-testid="operations-analytics"][data-theme="dark"] [class*="border-[#dfdacb]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="border-[#e6e0d2]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="border-[#e7e1d2]"],
        [data-testid="operations-analytics"][data-theme="dark"] [class*="border-[#d8d2c4]"] { border-color:#3a5146 !important; }
        [data-testid="operations-analytics"][data-theme="dark"] input { color-scheme:dark; }
        @media print {
          body * { visibility:hidden !important; }
          [data-testid="operations-analytics"], [data-testid="operations-analytics"] * { visibility:visible !important; }
          [data-testid="operations-analytics"] { position:absolute; inset:0; width:100%; padding:0 !important; border-radius:0 !important; background:#fff !important; color:#111 !important; }
          [data-testid="operations-analytics"] [class~="print:hidden"] { display:none !important; }
        }
      `}</style>
      <header className="rounded-3xl bg-[#174d43] p-5 text-[#fff9e9] sm:p-7">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#d6c58c]"><Activity size={14} /> MAYDANGO · OPERATIONS</div>
            <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{t('title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d3e1d8]">{t('subtitle')}</p>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#c5d8cc]"><ShieldCheck className="mt-0.5 shrink-0" size={15} />{t('privacy')}</p>
            {data && <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{t('scope')}: {data.scopeName}</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">{data.role === 'partner_operations_admin' ? t('admin') : t('partnerView')}</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5" dir="ltr">{data.period.from} — {data.period.to} · {data.period.timeZone}</span>
            </div>}
            {lastUpdated && <p className="mt-3 text-[10px] text-[#b5cabe]">{t('lastUpdated')}: {lastUpdated}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="relative" ref={menuRef}>
              <div className="flex overflow-hidden rounded-xl border border-white/20 bg-white/10">
                <button type="button" data-testid="button-analytics-refresh" onClick={() => void query.refetch()} disabled={query.isFetching}
                  className="inline-flex min-h-10 items-center gap-2 px-3 text-xs font-semibold hover:bg-white/10 disabled:opacity-60">
                  <RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} />{t('refresh')}
                </button>
                <span className="my-2 w-px bg-white/20" />
                <button type="button" data-testid="button-analytics-refresh-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}
                  className="inline-flex min-h-10 items-center px-2 hover:bg-white/10" aria-label={t('autoRefresh')}><ChevronDown size={14} /></button>
              </div>
              {menuOpen && <div className="absolute end-0 top-12 z-20 w-56 rounded-2xl border border-[#ddd7c6] bg-[#fffdf7] p-2 text-[#23473d] shadow-lg">
                <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-[#839087]">{t('autoRefresh')}</p>
                {intervals.map(minutes => {
                  const label = minutes === 0 ? t('off') : minutes === 5 ? t('every5') : minutes === 15 ? t('every15') : t('every60');
                  return <button key={minutes} type="button" data-testid={`button-auto-refresh-${minutes || 'off'}`} onClick={() => { setAutoMinutes(minutes); setMenuOpen(false); }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-start text-xs hover:bg-[#f2efe4]">
                    {label}{autoMinutes === minutes && <Check size={14} className="text-[#28695a]" />}
                  </button>;
                })}
              </div>}
            </div>
            {data && <button type="button" data-testid="button-export-aggregate-excel" title={t('exportAll')} onClick={() => downloadExcel(data)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-semibold hover:bg-white/15">
              <FileSpreadsheet size={14} />{t('exportAll')}
            </button>}
            <button type="button" data-testid="button-analytics-theme" title={darkMode ? t('switchLight') : t('switchDark')} aria-label={darkMode ? t('switchLight') : t('switchDark')}
              onClick={() => setDarkMode(value => !value)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 hover:bg-white/15">
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button type="button" data-testid="button-print-analytics" title={t('print')} onClick={() => window.print()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 hover:bg-white/15" aria-label={t('print')}><Printer size={15} /></button>
          </div>
        </div>
      </header>

      <form onSubmit={event => { event.preventDefault(); if (from && to && from <= to) setAppliedRange({ from, to }); }} className="flex flex-col gap-3 rounded-2xl border border-[#dfdacb] bg-[#f8f5eb] p-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 sm:max-w-[220px]"><label className={labelClass} htmlFor="analytics-from">{t('from')}</label>
          <input id="analytics-from" data-testid="input-analytics-from" type="date" required max={to} value={from} onChange={event => setFrom(event.target.value)} className="min-h-10 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm text-[#23473d]" /></div>
        <div className="min-w-0 flex-1 sm:max-w-[220px]"><label className={labelClass} htmlFor="analytics-to">{t('to')}</label>
          <input id="analytics-to" data-testid="input-analytics-to" type="date" required min={from} value={to} onChange={event => setTo(event.target.value)} className="min-h-10 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm text-[#23473d]" /></div>
        <div className="flex items-center gap-2 text-[10px] text-[#7b887f]"><CalendarDays size={14} />{t('baghdad')}</div>
        <button data-testid="button-apply-analytics-dates" className={button} disabled={!from || !to || from > to}><Check size={14} />{t('apply')}</button>
      </form>

      {query.isError && !data ? <div role="alert" data-testid="status-analytics-error" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8c9bc] bg-[#fff7f3] p-5 text-sm text-[#914839]">
        <span>{t('loadError')}</span><button data-testid="button-analytics-retry" type="button" onClick={() => void query.refetch()} className={button}>{t('retry')}</button>
      </div> : null}
      {busy && <div role="status" data-testid="status-analytics-loading" className="flex items-center gap-2 rounded-xl bg-[#f3f0e5] px-4 py-3 text-xs text-[#60756b]"><RefreshCw size={14} className="animate-spin" />{query.isLoading ? t('loading') : t('refreshLoading')}</div>}

      {(data || query.isLoading) && <>
        <section aria-labelledby="operational-title" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#b17a48]">01 / {t('operational')}</p>
              <h2 id="operational-title" className="mt-1 font-display text-xl font-bold">{t('operational')}</h2>
              <p className="mt-1 text-xs text-[#78857d]">{t('operationalNote')}</p></div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8efe7] px-3 py-1.5 text-[10px] font-semibold text-[#28695a]"><TrendingUp size={12} />{t('supported')}</span>
          </div>
          {summary ? <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {metric('visits', summary.visits)}
              {metric('physical', summary.physicalCheckIns)}
              {metric('premium', summary.premiumCheckIns)}
              {metric('liveBookings', summary.liveClassBookings)}
               {metric('dailyVisits', summary.dailyVisits, t('todayBaghdad'))}
               {metric('monthlyVisits', summary.monthlyVisits, t('monthBaghdad'))}
              {metric('unique', summary.uniqueCustomers)}
              {metric('repeat', summary.repeatCustomers)}
               {data?.role === 'partner_operations_admin' && metric('enrollments', summary.courseEnrollments)}
               {data?.role === 'partner_operations_admin' && metric('completions', summary.courseCompletions)}
              {data?.role === 'partner_operations_admin' && summary.activeSubscriptions !== null && metric('activeSubs', summary.activeSubscriptions)}
              {data?.role === 'partner_operations_admin' && summary.corporateActiveMembers !== null && metric('corporateMembers', summary.corporateActiveMembers)}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {rateMetric('retention', summary.retentionRate, t('repeatDefinition'))}
              {rateMetric('noShow', summary.noShowRate, t('noShowDefinition'))}
              {rateMetric('cancellation', summary.cancellationRate, t('cancellationDefinition'))}
              {rateMetric('occupancy', summary.occupancyRate, t('occupancyDefinition'))}
              {metric('rating', summary.averageRating, `${numberFormat(summary.ratingCount, language)} ${t('ratingBasis')} · / 5`)}
              {metric('ratingCount', summary.ratingCount)}
            </div>
          </> : stateSkeleton(240)}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr_.8fr]">
          <article className={card}>
            {sectionHeader('trendTitle', 'trendDesc', data && csvButton('daily-trend', data.trend))}
            {data ? data.trend.length ? <ResponsiveContainer width="100%" height={280} debounce={0}>
              <AreaChart data={data.trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs><linearGradient id="visitsWash" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartPalette.visits} stopOpacity={0.25} /><stop offset="100%" stopColor={chartPalette.visits} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 4" stroke={chartPalette.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: chartPalette.muted }} tickFormatter={value => new Intl.DateTimeFormat(numberLocale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: chartPalette.muted }} axisLine={false} tickLine={false} />
                <Tooltip isAnimationActive={false} cursor={{ fill: '#f4f0e5', stroke: 'none' }} labelFormatter={value => `${t('chartDate')}: ${String(value)}`} formatter={(value: number, name: string) => [numberFormat(value, language), name]} contentStyle={{ borderRadius: 12, border: '1px solid #dfdacb', fontSize: 12, background: '#fffdf7' }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                <Area type="monotone" dataKey="visits" name={t('trendVisits')} stroke={chartPalette.visits} strokeWidth={2.5} fill="url(#visitsWash)" isAnimationActive={false} />
                <Line type="monotone" dataKey="liveBookings" name={t('trendBookings')} stroke={chartPalette.bookings} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="courseEnrollments" name={t('trendEnroll')} stroke={chartPalette.course} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="courseCompletions" name={t('trendComplete')} stroke="#819b8c" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer> : <div className="py-10 text-center text-sm text-[#78857d]">{t('noData')}</div> : stateSkeleton(280)}
          </article>
          <article className={`${card} flex flex-col`}>
            {sectionHeader('visitSplit', undefined, data && csvButton('check-in-mix', [{ physicalCheckIns: data.summary.physicalCheckIns, premiumCheckIns: data.summary.premiumCheckIns }]))}
            <p className="mb-4 text-xs leading-5 text-[#78857d]">{t('checkinHelp')}</p>
            {summary ? <div className="my-auto space-y-5">
              {[{ label: 'physical' as const, value: summary.physicalCheckIns, color: '#174d43' }, { label: 'premium' as const, value: summary.premiumCheckIns, color: '#d58a52' }].map(item => {
                const total = summary.physicalCheckIns + summary.premiumCheckIns;
                const share = total ? (item.value / total) * 100 : 0;
                return <div key={item.label} data-testid={`checkin-${item.label}`}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="font-semibold">{t(item.label)}</span><span className="font-mono text-[#60756b]">{numberFormat(item.value, language)} <span className="text-[#929d95]">· {numberFormat(share, language)}%</span></span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#eee9dc]"><div className="h-full rounded-full transition-[width]" style={{ width: `${share}%`, backgroundColor: item.color }} /></div>
                </div>;
              })}
            </div> : stateSkeleton(200)}
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className={card}>
            {sectionHeader('facilityTitle', undefined, data && csvButton('facility-performance', data.facilityPerformance))}
            {data ? renderTable([t('location'), t('city'), t('visits'), t('customers'), t('bookings'), t('cancellations'), t('noShows'), t('occupancy'), t('rating')], data.facilityPerformance.map(row => [
              row.facility, row.city, numberFormat(row.visits, language), numberFormat(row.uniqueCustomers, language), numberFormat(row.bookings, language),
              numberFormat(row.cancellations, language), numberFormat(row.noShows, language), pctFormat(row.occupancyRate, language),
              row.averageRating === null ? '—' : `${numberFormat(row.averageRating, language)} / 5 · ${numberFormat(row.ratingCount, language)}`,
            ]), 'facility') : stateSkeleton(240)}
          </article>
          <article className={card}>
            {sectionHeader('classTitle', 'bookingsVisits', data && csvButton('popular-classes', data.popularClasses))}
            {data ? renderTable([t('rank'), t('class'), t('location'), t('city'), t('bookings'), t('visits'), t('occupancy')], data.popularClasses.map((row, index) => [
              numberFormat(index + 1, language), row.title, row.facility, row.city, numberFormat(row.bookings, language), numberFormat(row.visits, language), pctFormat(row.occupancyRate, language),
            ]), 'class') : stateSkeleton(240)}
          </article>
        </section>

        {data?.role === 'partner_operations_admin' && <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className={card}>
            {sectionHeader('courseTitle', 'courseActivity', data && csvButton('course-performance', data.coursePerformance))}
            {data ? renderTable([t('course'), t('enrollments'), t('completions'), t('completionRate')], data.coursePerformance.map(row => [
              row.title, numberFormat(row.enrollments, language), numberFormat(row.completions, language), pctFormat(row.completionRate, language),
            ]), 'course') : stateSkeleton(220)}
          </article>
          {data?.role === 'partner_operations_admin' && <article className={card}>
            {sectionHeader('partnerTitle', undefined, csvButton('partner-performance', data.partnerPerformance))}
            {renderTable([t('partner'), t('visits'), t('customers'), t('bookings'), t('cancellations'), t('noShows'), t('occupancy'), t('rating')], data.partnerPerformance.map(row => [
              row.partnerName, numberFormat(row.visits, language), numberFormat(row.uniqueCustomers, language), numberFormat(row.bookings, language),
              numberFormat(row.cancellations, language), numberFormat(row.noShows, language), pctFormat(row.occupancyRate, language),
              row.averageRating === null ? '—' : `${numberFormat(row.averageRating, language)} / 5 · ${numberFormat(row.ratingCount, language)}`,
            ]), 'partner')}
          </article>}
        </section>}

        {data && <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <article data-testid="financial-metrics-deferred" className="rounded-2xl border border-[#e7d8bb] bg-[#fbf5e8] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#a87b3f]">02 / {t('financial')}</p>
            <h3 className="mt-2 font-display text-lg font-bold text-[#634b2d]">{t('deferredTitle')}</h3>
            <p className="mt-2 text-sm leading-6 text-[#776649]">{t('deferred')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.unavailableMetrics.filter(value => ['membership_sales', 'renewals', 'membership_cancellations', 'churn', 'revenue', 'failed_payments', 'partner_cost', 'gross_margin', 'event_revenue', 'refund_rate', 'chargeback_rate', 'estimated_earnings'].includes(value)).map(metricName =>
                <span key={metricName} className="rounded-full border border-[#e6d7b8] bg-[#fffaf0] px-2.5 py-1 text-[10px] text-[#765d38]">{metricLabel(metricName)} · {t('noFinancialValues')}</span>)}
            </div>
            <p className="mt-4 border-t border-[#eadfc9] pt-3 text-[10px] leading-5 text-[#806c4d]">{t('accounting')}</p>
          </article>
          <article data-testid="unavailable-metrics" className="rounded-2xl border border-[#dfdacb] bg-[#f5f3eb] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#839087]">03 / {t('unavailable')}</p>
            <h3 className="mt-2 font-display text-lg font-bold text-[#36564b]">{t('notTracked')}</h3>
            <p className="mt-2 text-sm leading-6 text-[#78857d]">{t('notTrackedNote')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.unavailableMetrics.filter(value => ['instructor_performance', 'fraud_alerts', 'referral_performance', 'promotion_performance'].includes(value)).map(metricName =>
                <span key={metricName} className="rounded-full border border-[#e0ddcf] bg-[#fffdf7] px-2.5 py-1 text-[10px] text-[#68786f]">{metricLabel(metricName)} · {t('notTracked')}</span>)}
            </div>
          </article>
        </section>}
      </>}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ded9cb] pt-3 text-[10px] text-[#87928a]">
        <span>{t('privacy')}</span>
        {data && <span dir="ltr">{t('period')}: {data.period.from} — {data.period.to} · {data.period.timeZone}</span>}
      </footer>
    </section>
  );
}

export default OperationsAnalytics;
