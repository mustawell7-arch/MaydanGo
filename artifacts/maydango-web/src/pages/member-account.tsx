import { useEffect, useState, type FormEvent } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getGetMemberAccountSummaryQueryKey,
  getGetMemberConsentsQueryKey,
  getMemberPrivacyRequestExport,
  getGetMemberPrivacyRequestsQueryKey,
  useCreateMemberPrivacyRequest,
  useGetMemberConsents,
  useGetMemberAccountSummary,
  useGetMemberPrivacyRequests,
  useSaveMemberConsents,
} from "@workspace/api-client-react";
import { Link, Redirect } from "wouter";

type Language = "en" | "ar" | "ku";

function isMemberConsentRequired(error: unknown) {
  return error instanceof ApiError && !!error.data && typeof error.data === "object"
    && "code" in error.data && error.data.code === "MEMBER_CONSENT_REQUIRED";
}

const copy: Record<Language, Record<string, string>> = {
  en: {
    title: "Your MaydanGo account",
    intro: "Review your membership and bookings, update your name, or find help.",
    accessRestrictionTitle: "Some account actions are temporarily unavailable",
    accessRestrictionBody: "You can still sign in and contact MaydanGo. Your bookings and records are kept and are not cancelled automatically. If you have questions or an upcoming visit, contact us.",
    accessRestrictionContact: "Email MaydanGo support",
    accessRestrictionHelp: "Visit the Help Center",
    profile: "Account details",
    firstName: "First name",
    lastName: "Last name",
    email: "Email address",
    save: "Save name",
    saving: "Saving…",
    profileSaved: "Your name was updated.",
    profileError: "We could not update your name. Please try again.",
    membership: "Membership",
    plans: "View membership plans",
    noMembership: "No membership is linked to this account yet.",
    previewMembership: "Sample preview only — this does not grant live access.",
    tier: "Plan",
    status: "Status",
    ends: "Ends",
    bookings: "Your bookings",
    noBookings: "No bookings are linked to this account yet.",
    booked: "Reserved",
    cancelled: "Cancelled",
    recorded: "Recorded",
    sampleBooking: "Sample record — not a live booking.",
    bookingsError: "We could not load your bookings right now.",
    retry: "Try again",
    loading: "Loading your account…",
    payments: "Invoices and payment history",
    paymentsNote: "These records are not available on the website yet. Membership checkout and payment history remain disabled.",
    mobileTitle: "Use the mobile app for member experiences",
    mobileNote: "The mobile app remains the intended place for QR scanning, GPS check-in, push notifications, live-class participation, and your membership card.",
    privacyTitle: "Privacy requests",
    privacyIntro: "Request a copy of your account information, or ask MaydanGo to review account deletion.",
    privacyNotice: "Support staff verify your identity first. Once approved, the download is available for 24 hours. It excludes payment details, passwords, device tokens, private class links, support messages, and staff-only notes.",
    privacyExport: "Request a copy of my data",
    privacyExporting: "Sending request…",
    privacyExportReady: "Your data copy is downloading.",
    privacyExportError: "We could not download your data copy. It may not be approved or its 24-hour window may have expired.",
    privacyDataActive: "You already have an open data-copy request.",
    privacyDownload: "Download copy",
    privacyDownloadUntil: "Available until",
    privacyDelete: "Request account deletion",
    privacyDeleteNotice: "Account deletion requests are reviewed by authorized support staff. They are not immediate; identity verification and record-retention review may be needed.",
    privacyActive: "You already have an open account-deletion request.",
    privacyHistory: "Request history",
    privacyNone: "No privacy requests yet.",
    privacySent: "Your request was sent to MaydanGo support.",
    privacyError: "The request could not be sent. Please try again.",
    privacyLoadError: "Privacy requests could not be loaded.",
    privacyFollowUp: "For follow-up, contact MaydanGo at",
    consentsTitle: "Consent and policy choices",
    consentsIntro: "Current draft versions are shown below. Required service consent is separate from optional marketing updates.",
    termsChoice: "I agree to the current MaydanGo Terms of Use (required)",
    privacyChoice: "I agree to the current MaydanGo Privacy Policy (required)",
    marketingChoice: "Send me occasional MaydanGo news and offers (optional)",
    readTerms: "Read terms",
    readPrivacy: "Read privacy notice",
    policyVersion: "Current version",
    consentSave: "Save choices",
    consentSaving: "Saving choices…",
    consentSaved: "Your choices were recorded.",
    consentError: "Your choices could not be saved. Please try again.",
    consentPolicyChanged: "A policy changed while you were reviewing it. Read the latest version and submit your choices again.",
    readPolicyVersion: "Read this version",
    consentLoadError: "Consent history could not be loaded.",
    consentHistory: "Consent history",
    consentNoHistory: "No consent choices have been recorded yet.",
    consentAccepted: "Accepted",
    consentDeclined: "Declined",
    consentRequiredHint: "Both required choices must be accepted for member services. Marketing updates remain optional.",
    help: "Visit Help",
    backToPlans: "Explore plans",
    signIn: "Sign in to view your account",
  },
  ar: {
    title: "حسابك في MaydanGo",
    intro: "راجع عضويتك وحجوزاتك، حدّث اسمك، أو اعثر على المساعدة.",
    accessRestrictionTitle: "بعض إجراءات الحساب غير متاحة مؤقتاً",
    accessRestrictionBody: "لا يزال بإمكانك تسجيل الدخول والتواصل مع فريق MaydanGo. تبقى حجوزاتك وسجلاتك محفوظة ولا تُلغى تلقائياً. إذا كان لديك استفسار أو حجز قادم، تواصل معنا.",
    accessRestrictionContact: "تواصل مع دعم MaydanGo",
    accessRestrictionHelp: "زيارة مركز المساعدة",
    profile: "تفاصيل الحساب",
    firstName: "الاسم الأول",
    lastName: "اسم العائلة",
    email: "البريد الإلكتروني",
    save: "حفظ الاسم",
    saving: "جارٍ الحفظ…",
    profileSaved: "تم تحديث اسمك.",
    profileError: "تعذر تحديث اسمك. حاول مرة أخرى.",
    membership: "العضوية",
    plans: "عرض خطط العضوية",
    noMembership: "لا توجد عضوية مرتبطة بهذا الحساب حتى الآن.",
    previewMembership: "معاينة تجريبية فقط — لا تمنح وصولاً فعلياً.",
    tier: "الخطة",
    status: "الحالة",
    ends: "تنتهي",
    bookings: "حجوزاتك",
    noBookings: "لا توجد حجوزات مرتبطة بهذا الحساب حتى الآن.",
    booked: "محجوز",
    cancelled: "ملغى",
    recorded: "مسجل",
    sampleBooking: "سجل تجريبي — ليس حجزاً فعلياً.",
    bookingsError: "تعذر تحميل حجوزاتك الآن.",
    retry: "حاول مرة أخرى",
    loading: "جارٍ تحميل حسابك…",
    payments: "الفواتير وسجل المدفوعات",
    paymentsNote: "هذه السجلات غير متاحة على الموقع حالياً. شراء العضوية وسجل المدفوعات ما زالا غير مفعّلين.",
    mobileTitle: "تجارب الأعضاء في تطبيق الهاتف",
    mobileNote: "يبقى تطبيق الهاتف المكان المقصود لمسح رمز QR وتسجيل الحضور عبر GPS والإشعارات الفورية والمشاركة في الصفوف المباشرة وبطاقة العضوية.",
    privacyTitle: "طلبات الخصوصية",
    privacyIntro: "اطلب نسخة من معلومات حسابك، أو اطلب من MaydanGo مراجعة حذف الحساب.",
    privacyNotice: "يتحقق فريق الدعم من هويتك أولاً. بعد الموافقة، يتاح التنزيل لمدة 24 ساعة. لا تتضمن النسخة تفاصيل الدفع أو كلمات المرور أو رموز الأجهزة أو روابط الصفوف الخاصة أو رسائل الدعم أو ملاحظات الموظفين الداخلية.",
    privacyExport: "طلب نسخة من بياناتي",
    privacyExporting: "جارٍ إرسال الطلب…",
    privacyExportReady: "جارٍ تنزيل نسخة بياناتك.",
    privacyExportError: "تعذر تنزيل نسخة البيانات. قد لا يكون الطلب قد اعتُمد أو ربما انتهت مهلة الـ24 ساعة.",
    privacyDataActive: "لديك طلب مفتوح للحصول على نسخة من البيانات.",
    privacyDownload: "تنزيل النسخة",
    privacyDownloadUntil: "متاحة حتى",
    privacyDelete: "طلب حذف الحساب",
    privacyDeleteNotice: "يراجع فريق الدعم المخوّل طلبات حذف الحساب. لا يتم الحذف فوراً؛ وقد يلزم التحقق من الهوية ومراجعة السجلات التي يجب الاحتفاظ بها.",
    privacyActive: "لديك طلب مفتوح لمراجعة حذف الحساب.",
    privacyHistory: "سجل الطلبات",
    privacyNone: "لا توجد طلبات خصوصية حتى الآن.",
    privacySent: "تم إرسال طلبك إلى دعم MaydanGo.",
    privacyError: "تعذر إرسال الطلب. حاول مرة أخرى.",
    privacyLoadError: "تعذر تحميل طلبات الخصوصية.",
    privacyFollowUp: "للمتابعة، تواصل مع MaydanGo عبر",
    consentsTitle: "الموافقة وخيارات السياسات",
    consentsIntro: "تظهر أدناه إصدارات المسودات الحالية. الموافقة المطلوبة للخدمة منفصلة عن الرسائل التسويقية الاختيارية.",
    termsChoice: "أوافق على شروط استخدام MaydanGo الحالية (مطلوب)",
    privacyChoice: "أوافق على سياسة خصوصية MaydanGo الحالية (مطلوب)",
    marketingChoice: "أرغب في تلقي أخبار وعروض MaydanGo أحياناً (اختياري)",
    readTerms: "قراءة الشروط",
    readPrivacy: "قراءة إشعار الخصوصية",
    policyVersion: "الإصدار الحالي",
    consentSave: "حفظ الخيارات",
    consentSaving: "جارٍ حفظ الخيارات…",
    consentSaved: "تم تسجيل خياراتك.",
    consentError: "تعذر حفظ خياراتك. حاول مرة أخرى.",
    consentPolicyChanged: "تغيّرت إحدى السياسات أثناء مراجعتها. اقرأ الإصدار الحالي ثم أرسل خياراتك مجدداً.",
    readPolicyVersion: "قراءة هذا الإصدار",
    consentLoadError: "تعذر تحميل سجل الموافقات.",
    consentHistory: "سجل الموافقات",
    consentNoHistory: "لم تُسجل أي خيارات موافقة بعد.",
    consentAccepted: "موافق عليه",
    consentDeclined: "غير موافق عليه",
    consentRequiredHint: "يلزم قبول الخيارين المطلوبين لاستخدام خدمات الأعضاء. تظل الرسائل التسويقية اختيارية.",
    help: "زيارة المساعدة",
    backToPlans: "استكشف الخطط",
    signIn: "سجّل الدخول لعرض حسابك",
  },
  ku: {
    title: "هەژماری MaydanGo ـی تۆ",
    intro: "ئەندامێتی و حجزەکانت ببینە، ناوت نوێ بکەرەوە، یان یارمەتی بدۆزەوە.",
    accessRestrictionTitle: "هەندێک کردار لە هەژمارەکەتدا بە کاتی ناچالاکن",
    accessRestrictionBody: "هێشتا دەتوانیت بچیتە ژوورەوە و پەیوەندی بە تیمی MaydanGo بکەیت. حجز و تۆمارەکانت دەپارێزرێن و بە شێوەی ئۆتۆماتیکی هەڵناوەشێنرێن. بۆ زانیاری زیاتر یان پرسیار لەبارەی حجزێکی داهاتوو، پەیوەندیمان پێوە بکە.",
    accessRestrictionContact: "پەیوەندی بە پشتگیریی MaydanGo بکە",
    accessRestrictionHelp: "سەردانی ناوەندی یارمەتی",
    profile: "وردەکاریی هەژمار",
    firstName: "ناوی یەکەم",
    lastName: "ناوی خێزان",
    email: "ئیمەیڵ",
    save: "ناوەکە پاشەکەوت بکە",
    saving: "پاشەکەوت دەکرێت…",
    profileSaved: "ناوەکەت نوێ کرایەوە.",
    profileError: "نەتوانرا ناوەکەت نوێ بکرێتەوە. دووبارە هەوڵ بدەوە.",
    membership: "ئەندامێتی",
    plans: "بینینی پلانەکانی ئەندامێتی",
    noMembership: "هێشتا هیچ ئەندامێتییەک بەستراوەتەوە بەو هەژمارە.",
    previewMembership: "تەنها پێشبینینی نموونەییە — دەستگەیشتنی ڕاستەقینە نادات.",
    tier: "پلان",
    status: "بارودۆخ",
    ends: "کۆتایی دێت",
    bookings: "حجزەکانت",
    noBookings: "هێشتا هیچ حجزێک بەستراوەتەوە بەو هەژمارە.",
    booked: "حجزکراوە",
    cancelled: "هەڵوەشێنراوەتەوە",
    recorded: "تۆمارکراوە",
    sampleBooking: "تۆماری نموونەییە — حجزێکی ڕاستەقینە نییە.",
    bookingsError: "ئێستا نەتوانرا حجزەکانت باربکرێن.",
    retry: "دووبارە هەوڵ بدەوە",
    loading: "هەژمارەکەت بار دەکرێت…",
    payments: "پسووڵە و مێژووی پارەدان",
    paymentsNote: "ئەم تۆمارانە هێشتا لە ماڵپەڕەکە بەردەست نین. کڕینی ئەندامێتی و مێژووی پارەدان ناچالاکن.",
    mobileTitle: "ئەزموونی ئەندامان لە ئەپی مۆبایل",
    mobileNote: "ئەپی مۆبایل شوێنی سەرەکیی پێشنیارکراوە بۆ سکانی QR، حزووری GPS، ئاگادارکردنەوە، بەشداری لە وانەی ڕاستەوخۆ و کارتی ئەندامێتی.",
    privacyTitle: "داواکارییەکانی تایبەتمەندی",
    privacyIntro: "داوای کۆپیی زانیاریی هەژمارەکەت بکە، یان داوای پێداچوونەوە بۆ سڕینەوەی هەژمارەکەت بکە.",
    privacyNotice: "تیمی پشتگیری سەرەتا ناسنامەکەت پشتڕاست دەکاتەوە. دوای پەسەندکردن، داگرتنەکە بۆ ٢٤ کاتژمێر بەردەستە. وردەکاریی پارەدان، وشەی نهێنی، تۆکنی ئامێر، بەستەری وانەی تایبەت، پەیامەکانی پشتگیری و تێبینیی ناوخۆی کارمەندان تێدا نییە.",
    privacyExport: "داوای کۆپیی داتاکەم بکە",
    privacyExporting: "داواکاری دەنێردرێت…",
    privacyExportReady: "کۆپیی داتاکەت دادەبەزێت.",
    privacyExportError: "داگرتنی کۆپیی داتاکەت سەرکەوتوو نەبوو. لەوانەیە پەسەند نەکرابێت یان ماوەی ٢٤ کاتژمێرەکە تەواو بووبێت.",
    privacyDataActive: "داواکارییەکی کراوەتەوەت هەیە بۆ کۆپیی داتا.",
    privacyDownload: "داگرتنی کۆپی",
    privacyDownloadUntil: "بەردەستە تا",
    privacyDelete: "داوای سڕینەوەی هەژمار بکە",
    privacyDeleteNotice: "تیمی پشتگیریی ڕێگەپێدراو داواکاریی سڕینەوەی هەژمار پێداچوونەوەی بۆ دەکات. سڕینەوە دەستبەجێ نییە؛ لەوانەیە پشتڕاستکردنەوەی ناسنامە و پێداچوونەوەی تۆمارە پێویستەکان بکرێت.",
    privacyActive: "داواکاریی پێداچوونەوەی سڕینەوەی هەژمارێکی کراوەتەوەت هەیە.",
    privacyHistory: "مێژووی داواکارییەکان",
    privacyNone: "هێشتا هیچ داواکارییەکی تایبەتمەندی نییە.",
    privacySent: "داواکارییەکەت بۆ تیمی پشتگیریی MaydanGo نێردرا.",
    privacyError: "ناردنی داواکارییەکە سەرکەوتوو نەبوو. دووبارە هەوڵ بدەوە.",
    privacyLoadError: "بارکردنی داواکارییەکانی تایبەتمەندی سەرکەوتوو نەبوو.",
    privacyFollowUp: "بۆ بەدواداچوون، پەیوەندی بە MaydanGo بکە لە ڕێگەی",
    consentsTitle: "ڕەزامەندی و هەڵبژاردەکانی سیاسەت",
    consentsIntro: "وەشانی ڕەشنووسی ئێستا لە خوارەوە پیشان دراوە. ڕەزامەندیی پێویستی خزمەتگوزاری جیاوازە لە نوێکاریی بازاڕکردنی ئارەزوومەندانە.",
    termsChoice: "ڕازیم بە مەرجەکانی بەکارهێنانی ئێستای MaydanGo (پێویستە)",
    privacyChoice: "ڕازیم بە ئاگاداریی تایبەتمەندیی ئێستای MaydanGo (پێویستە)",
    marketingChoice: "هەواڵ و پێشکەشکردنی MaydanGo جاروبار بۆم بنێرە (ئارەزوومەندانە)",
    readTerms: "خوێندنەوەی مەرجەکان",
    readPrivacy: "خوێندنەوەی ئاگاداریی تایبەتمەندی",
    policyVersion: "وەشانی ئێستا",
    consentSave: "پاشەکەوتکردنی هەڵبژاردەکان",
    consentSaving: "هەڵبژاردەکان پاشەکەوت دەکرێن…",
    consentSaved: "هەڵبژاردەکانت تۆمار کران.",
    consentError: "نەتوانرا هەڵبژاردەکانت پاشەکەوت بکرێن. دووبارە هەوڵ بدەوە.",
    consentPolicyChanged: "سیاسەتێک لە کاتی پێداچوونەوەتدا گۆڕا. وەشانی نوێ بخوێنەوە و دووبارە هەڵبژاردەکانت بنێرە.",
    readPolicyVersion: "خوێندنەوەی ئەم وەشانە",
    consentLoadError: "نەتوانرا مێژووی ڕەزامەندی باربکرێت.",
    consentHistory: "مێژووی ڕەزامەندی",
    consentNoHistory: "هێشتا هیچ هەڵبژاردەیەکی ڕەزامەندی تۆمار نەکراوە.",
    consentAccepted: "پەسەندکراوە",
    consentDeclined: "پەسەند نەکراوە",
    consentRequiredHint: "بۆ بەکارهێنانی خزمەتگوزاریی ئەندامان پێویستە هەردوو هەڵبژاردەی پێویست پەسەند بکرێن. نوێکاریی بازاڕکردن ئارەزوومەندانەیە.",
    help: "سەردانی یارمەتی",
    backToPlans: "پلانەکان ببینە",
    signIn: "بچۆ ژوورەوە بۆ بینینی هەژمارەکەت",
  },
};

const locale: Record<Language, string> = { en: "en-IQ", ar: "ar-IQ", ku: "ckb-IQ" };
const privacyStatusLabel: Record<Language, Record<string, string>> = {
  en: { open: "Open", in_progress: "In progress", waiting_member: "Waiting for you", resolved: "Resolved", closed: "Closed" },
  ar: { open: "مفتوح", in_progress: "قيد المعالجة", waiting_member: "بانتظار ردك", resolved: "تم الحل", closed: "مغلق" },
  ku: { open: "کراوە", in_progress: "لە پێشچووندایە", waiting_member: "چاوەڕوانی وەڵامی تۆ", resolved: "چارەسەرکرا", closed: "داخرا" },
};

function formatIraqDate(value: string, language: Language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale[language], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Baghdad",
  }).format(date);
}

export default function MemberAccountPage({ language }: { language: Language }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const queryClient = useQueryClient();
  const summary = useGetMemberAccountSummary({
    query: {
      queryKey: [...getGetMemberAccountSummaryQueryKey(), user?.id ?? "signed-out"],
      enabled: isLoaded && userLoaded && isSignedIn === true && !!user?.id,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const privacyRequests = useGetMemberPrivacyRequests({
    query: { enabled: isLoaded && isSignedIn === true, retry: false, refetchInterval: 30_000 },
  });
  const consents = useGetMemberConsents({
    query: { enabled: isLoaded && isSignedIn === true, retry: false, refetchInterval: 30_000 },
  });
  const createPrivacyRequest = useCreateMemberPrivacyRequest();
  const saveConsents = useSaveMemberConsents();
  const t = copy[language];
  const memberConsentRequired = summary.isError && isMemberConsentRequired(summary.error);
  const rtl = language !== "en";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState("");
  const [privacyExportMessage, setPrivacyExportMessage] = useState("");
  const [exportingData, setExportingData] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [consentMessage, setConsentMessage] = useState("");
  const [consentError, setConsentError] = useState(false);
  const activePrivacyRequest = privacyRequests.data?.find(request =>
    request.kind === "account_deletion" &&
    ["open", "in_progress", "waiting_member"].includes(request.status)
  );
  const activeDataRequest = privacyRequests.data?.find(request =>
    request.kind === "data_export" &&
    ["open", "in_progress", "waiting_member"].includes(request.status)
  );

  useEffect(() => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
  }, [user?.id, user?.firstName, user?.lastName]);

  useEffect(() => {
    setTermsAccepted(consents.data?.currentChoices.termsOfUse === "accepted");
    setPrivacyAccepted(consents.data?.currentChoices.privacyPolicy === "accepted");
    setMarketingConsent(consents.data?.currentChoices.marketing === "accepted");
  }, [
    consents.data?.currentChoices.termsOfUse,
    consents.data?.currentChoices.privacyPolicy,
    consents.data?.currentChoices.marketing,
  ]);

  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousContent = existing?.content;
    const robots = existing ?? document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex,nofollow";
    if (!existing) document.head.appendChild(robots);
    return () => {
      if (existing) existing.content = previousContent ?? "";
      else robots.remove();
    };
  }, []);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !firstName.trim()) return;
    setSaving(true);
    setProfileMessage("");
    setProfileError(false);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      await user.reload();
      setProfileMessage(t.profileSaved);
    } catch {
      setProfileMessage(t.profileError);
      setProfileError(true);
    } finally {
      setSaving(false);
    }
  }

  async function submitPrivacyRequest(kind: "data_export" | "account_deletion") {
    setPrivacyMessage("");
    try {
      await createPrivacyRequest.mutateAsync({ data: { kind, language } });
      await queryClient.invalidateQueries({ queryKey: getGetMemberPrivacyRequestsQueryKey() });
      setPrivacyMessage(t.privacySent);
    } catch {
      await queryClient.invalidateQueries({ queryKey: getGetMemberPrivacyRequestsQueryKey() });
      setPrivacyMessage(t.privacyError);
    }
  }

  async function submitConsentChoices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConsentMessage("");
    setConsentError(false);
    const termsVersion = consents.data?.policies.find(policy => policy.purpose === "terms_of_use")?.version;
    const privacyVersion = consents.data?.policies.find(policy => policy.purpose === "privacy_policy")?.version;
    if (!termsVersion || !privacyVersion) {
      setConsentMessage(t.consentError);
      setConsentError(true);
      return;
    }
    try {
      await saveConsents.mutateAsync({
        data: {
          termsOfUseAccepted: termsAccepted,
          privacyPolicyAccepted: privacyAccepted,
          marketingConsent,
          termsVersion,
          privacyVersion,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetMemberConsentsQueryKey() });
      setConsentMessage(t.consentSaved);
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: unknown }).status : undefined;
      const policyChanged = status === 409;
      if (policyChanged) await queryClient.invalidateQueries({ queryKey: getGetMemberConsentsQueryKey() });
      setConsentMessage(policyChanged ? t.consentPolicyChanged : t.consentError);
      setConsentError(true);
    }
  }

  async function downloadAccountData(requestId: string) {
    setPrivacyExportMessage("");
    setExportingData(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again to download your data.");
      const data = await getMemberPrivacyRequestExport(requestId, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `maydango-account-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPrivacyExportMessage(t.privacyExportReady);
    } catch {
      setPrivacyExportMessage(t.privacyExportError);
    } finally {
      setExportingData(false);
    }
  }

  if (!isLoaded || !userLoaded) {
    return <section className="mx-auto max-w-6xl px-5 py-16 text-center" aria-live="polite">{t.loading}</section>;
  }
  if (!isSignedIn) return <Redirect to="/sign-in?redirect_url=%2Faccount" />;

  return (
    <section className={`mx-auto max-w-6xl px-5 py-10 md:py-16 ${rtl ? "text-right" : ""}`} dir={rtl ? "rtl" : "ltr"}>
      <header className="mb-8 max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">MaydanGo</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-foreground md:text-5xl">{t.title}</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{t.intro}</p>
      </header>

      {summary.data?.accessRestricted && (
        <aside
          className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm sm:p-6"
          role="status"
          aria-live="polite"
          aria-labelledby="account-restriction-heading"
          data-testid="status-account-restricted"
        >
          <h2 id="account-restriction-heading" className="font-display text-xl font-bold">{t.accessRestrictionTitle}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6">{t.accessRestrictionBody}</p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
            <a href="mailto:maydangoing@gmail.com" className="underline underline-offset-2" data-testid="link-access-restriction-contact">
              {t.accessRestrictionContact}
            </a>
            <Link href="/help" className="underline underline-offset-2" data-testid="link-access-restriction-help">
              {t.accessRestrictionHelp}
            </Link>
          </div>
        </aside>
      )}

      <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="account-profile-heading">
            <h2 id="account-profile-heading" className="font-display text-2xl font-bold">{t.profile}</h2>
            <form onSubmit={saveName} className="mt-5 space-y-4">
              <label className="block text-sm font-semibold">
                {t.firstName}
                <input className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-normal" value={firstName} onChange={event => setFirstName(event.target.value)} required autoComplete="given-name" />
              </label>
              <label className="block text-sm font-semibold">
                {t.lastName}
                <input className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 font-normal" value={lastName} onChange={event => setLastName(event.target.value)} autoComplete="family-name" />
              </label>
              <label className="block text-sm font-semibold">
                {t.email}
                <input className="mt-2 w-full rounded-xl border border-border bg-muted px-4 py-3 font-normal text-muted-foreground" value={user?.primaryEmailAddress?.emailAddress ?? ""} readOnly />
              </label>
              <button type="submit" disabled={saving || !firstName.trim()} className="rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? t.saving : t.save}
              </button>
              {profileMessage && <p role={profileError ? "alert" : "status"} className={`text-sm ${profileError ? "text-destructive" : "text-primary"}`}>{profileMessage}</p>}
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="account-membership-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 id="account-membership-heading" className="font-display text-2xl font-bold">{t.membership}</h2>
              <Link href="/membership-plans" className="text-sm font-bold text-primary underline-offset-4 hover:underline">{t.plans}</Link>
            </div>
            {summary.isLoading ? <p className="mt-4 text-sm text-muted-foreground">{t.loading}</p>
              : summary.isError ? <div className="mt-4">
                <p className="text-sm text-destructive" role="alert">
                  {memberConsentRequired ? t.consentRequiredHint : t.bookingsError}
                </p>
                {memberConsentRequired ? <a href="#account-consents-heading" className="mt-2 inline-block text-sm font-bold text-primary underline-offset-4 hover:underline">
                  {t.consentsTitle}
                </a> : null}
              </div>
                : summary.data?.memberships.length ? <ul className="mt-5 space-y-3">
                  {summary.data.memberships.map((membership, index) => {
                    const preview = membership.scope === "preview";
                    return <li key={`${membership.scope}-${membership.tier}-${index}`} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{preview ? t.previewMembership : `${t.tier}: ${membership.tier}`}</strong>
                        {!preview && <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{membership.status}</span>}
                      </div>
                      {!preview && <p className="mt-2 text-sm text-muted-foreground">{t.ends}: {formatIraqDate(membership.endsAt, language)}</p>}
                    </li>;
                  })}
                </ul> : <p className="mt-4 text-sm leading-6 text-muted-foreground">{t.noMembership}</p>}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="account-bookings-heading">
            <h2 id="account-bookings-heading" className="font-display text-2xl font-bold">{t.bookings}</h2>
            {summary.isLoading ? <p className="mt-4 text-sm text-muted-foreground">{t.loading}</p>
              : summary.isError ? <div className="mt-4">
                <p className="text-sm text-destructive" role="alert">
                  {memberConsentRequired ? t.consentRequiredHint : t.bookingsError}
                </p>
                {!memberConsentRequired ? <button type="button" onClick={() => void summary.refetch()} className="mt-3 text-sm font-bold text-primary underline-offset-4 hover:underline">{t.retry}</button> : null}
              </div>
                : summary.data?.bookings.length ? <ul className="mt-5 space-y-3">
                  {[...summary.data.bookings].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).map(booking => {
                    const preview = booking.scope === "preview";
                    const title = booking.localizedTitle?.[language] || booking.title;
                    const status = booking.status.includes("cancel") ? t.cancelled : booking.status === "reserved" ? t.booked : t.recorded;
                    return <li key={booking.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="font-bold">{title}</h3>
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{preview ? t.sampleBooking : status}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{booking.facility} · {booking.city}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{formatIraqDate(booking.startsAt, language)}</p>
                    </li>;
                  })}
                </ul> : <p className="mt-4 text-sm leading-6 text-muted-foreground">{t.noBookings}</p>}
          </section>

          <section className="rounded-2xl border border-border bg-[#f2e8d9] p-5 sm:p-7" aria-labelledby="account-payments-heading">
            <h2 id="account-payments-heading" className="font-display text-xl font-bold">{t.payments}</h2>
            <p className="mt-2 text-sm leading-6">{t.paymentsNote}</p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="account-consents-heading">
            <h2 id="account-consents-heading" className="font-display text-xl font-bold">{t.consentsTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.consentsIntro}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
              <Link href={consents.data?.policies.find(policy => policy.purpose === "terms_of_use")?.documentPath ?? "/legal"} className="text-primary underline underline-offset-2">{t.readTerms}</Link>
              <Link href={consents.data?.policies.find(policy => policy.purpose === "privacy_policy")?.documentPath ?? "/privacy"} className="text-primary underline underline-offset-2">{t.readPrivacy}</Link>
              <Link href="/membership-terms-draft?version=draft-0.1" className="text-primary underline underline-offset-2">Membership terms draft · draft-0.1 (English; not active)</Link>
            </div>
            {consents.isLoading ? <p className="mt-4 text-sm text-muted-foreground" role="status">{t.loading}</p>
              : consents.isError ? <p className="mt-4 text-sm text-destructive" role="alert">{t.consentLoadError}</p>
                : <>
                  <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                    {consents.data?.policies.map(policy => (
                      <p key={policy.purpose}>{policy.purpose.replaceAll("_", " ")} · {t.policyVersion}: {policy.version}</p>
                    ))}
                  </div>
                  <p className="mt-4 rounded-xl bg-muted p-3 text-sm leading-6">{t.consentRequiredHint}</p>
                  <form onSubmit={event => void submitConsentChoices(event)} className="mt-4 space-y-3">
                    <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
                      <input type="checkbox" required checked={termsAccepted} disabled={consents.data?.currentChoices.termsOfUse === "accepted"} onChange={event => setTermsAccepted(event.target.checked)} className="mt-1" />
                      <span>{t.termsChoice}</span>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
                      <input type="checkbox" required checked={privacyAccepted} disabled={consents.data?.currentChoices.privacyPolicy === "accepted"} onChange={event => setPrivacyAccepted(event.target.checked)} className="mt-1" />
                      <span>{t.privacyChoice}</span>
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
                      <input type="checkbox" checked={marketingConsent} onChange={event => setMarketingConsent(event.target.checked)} className="mt-1" />
                      <span>{t.marketingChoice}</span>
                    </label>
                    <button type="submit" disabled={saveConsents.isPending || consents.isLoading} className="rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
                      {saveConsents.isPending ? t.consentSaving : t.consentSave}
                    </button>
                    {consentMessage && <p className={`text-sm ${consentError ? "text-destructive" : "text-primary"}`} role={consentError ? "alert" : "status"}>{consentMessage}</p>}
                  </form>
                  <div className="mt-5 border-t border-border pt-4">
                    <h3 className="font-semibold">{t.consentHistory}</h3>
                    {consents.data?.history.length ? <ul className="mt-3 space-y-2">
                      {consents.data.history.map(record => (
                        <li key={record.id} className="rounded-xl border border-border p-3 text-sm">
                          <div className="flex flex-wrap justify-between gap-2">
                            <span className="font-medium">{record.purpose.replaceAll("_", " ")} · {record.policyVersion}</span>
                            <span className="text-muted-foreground">{record.choice === "accepted" ? t.consentAccepted : t.consentDeclined}</span>
                          </div>
                          <time className="mt-1 block text-xs text-muted-foreground">{formatIraqDate(record.recordedAt, language)}</time>
                          {record.documentPath && <Link href={record.documentPath} className="mt-2 inline-flex text-xs font-semibold text-primary underline underline-offset-2">{t.readPolicyVersion}</Link>}
                        </li>
                      ))}
                    </ul> : <p className="mt-2 text-sm text-muted-foreground">{t.consentNoHistory}</p>}
                  </div>
                </>}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="account-privacy-heading">
            <h2 id="account-privacy-heading" className="font-display text-xl font-bold">{t.privacyTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.privacyIntro}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.privacyNotice}</p>
            <button
              type="button"
              disabled={createPrivacyRequest.isPending || privacyRequests.isLoading || !!activeDataRequest}
              onClick={() => void submitPrivacyRequest("data_export")}
              className="mt-4 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="privacy-request-export"
            >
              {createPrivacyRequest.isPending ? t.privacyExporting : t.privacyExport}
            </button>
            {activeDataRequest && (
              <p className="mt-3 rounded-xl bg-muted p-3 text-sm" role="status">
                {t.privacyDataActive} <span className="font-semibold">{privacyStatusLabel[language][activeDataRequest.status] ?? activeDataRequest.status}</span>
              </p>
            )}
            {privacyExportMessage && <p className="mt-3 text-sm text-primary" role="status">{privacyExportMessage}</p>}
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.privacyDeleteNotice}</p>
            {activePrivacyRequest ? (
              <p className="mt-4 rounded-xl bg-muted p-3 text-sm" role="status">
                {t.privacyActive} <span className="font-semibold">{privacyStatusLabel[language][activePrivacyRequest.status] ?? activePrivacyRequest.status}</span>
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={createPrivacyRequest.isPending || privacyRequests.isLoading}
                  onClick={() => void submitPrivacyRequest("account_deletion")}
                  className="rounded-full border border-border px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="privacy-request-delete"
                >
                  {t.privacyDelete}
                </button>
              </div>
            )}
            {privacyMessage && <p className="mt-3 text-sm text-primary" role="status">{privacyMessage}</p>}
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="font-semibold">{t.privacyHistory}</h3>
              {privacyRequests.isLoading ? <p className="mt-2 text-sm text-muted-foreground">{t.loading}</p>
                : privacyRequests.isError ? <p className="mt-2 text-sm text-destructive" role="alert">{t.privacyLoadError}</p>
                  : privacyRequests.data?.length ? <ul className="mt-3 space-y-2">
                    {privacyRequests.data.map(request => (
                      <li key={request.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                        <span className="font-medium">{request.subject}</span>
                        <span className="text-muted-foreground">{privacyStatusLabel[language][request.status] ?? request.status} · {formatIraqDate(request.createdAt, language)}</span>
                        {request.kind === "data_export" && request.exportAvailableUntil
                          && new Date(String(request.exportAvailableUntil)).getTime() > Date.now() && (
                          <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                            <span className="text-xs text-muted-foreground">{t.privacyDownloadUntil} {formatIraqDate(String(request.exportAvailableUntil), language)}</span>
                            <button type="button" disabled={exportingData} onClick={() => void downloadAccountData(request.id)}
                              className="rounded-full border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-60"
                              data-testid={`privacy-download-data-${request.id}`}>
                              {exportingData ? t.privacyExporting : t.privacyDownload}
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul> : <p className="mt-2 text-sm text-muted-foreground">{t.privacyNone}</p>}
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {t.privacyFollowUp}{" "}
                <a className="font-semibold underline underline-offset-2" href="mailto:maydangoing@gmail.com">maydangoing@gmail.com</a>.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-primary p-5 text-primary-foreground sm:p-7" aria-labelledby="account-mobile-heading">
            <h2 id="account-mobile-heading" className="font-display text-xl font-bold">{t.mobileTitle}</h2>
            <p className="mt-2 text-sm leading-6 opacity-90">{t.mobileNote}</p>
          </section>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/help" className="rounded-full border border-border bg-card px-5 py-3 text-sm font-bold hover:bg-muted">{t.help}</Link>
        <Link href="/membership-plans" className="rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">{t.backToPlans}</Link>
      </div>
    </section>
  );
}
