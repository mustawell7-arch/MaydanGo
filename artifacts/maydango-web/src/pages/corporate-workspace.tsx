import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useClerk } from '@clerk/react';
import {
  getGetCorporateOrganizationsQueryKey,
  getGetCorporatePortalQueryKey,
  useAcceptCorporateInvitation,
  useCreateCorporateOrganization,
  useGetCorporateOrganizations,
  useGetCorporatePortal,
  useInviteCorporateAdministrator,
  useInviteCorporateEmployees,
  useRemoveCorporateEmployee,
  useReissueCorporateEmployeeInvitation,
} from '@workspace/api-client-react';
import type { CorporateInvitationLink } from '@workspace/api-client-react';
import { AlertCircle, ArrowRight, Check, ChevronRight, Clipboard, Clock3, Copy, LockKeyhole, LogOut, Mail, Plus, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';

type Lang = 'en' | 'ar' | 'ku';
type CopyKey = keyof typeof words.en;
const words = {
  en: {
    brand: 'MaydanGo', label: 'CORPORATE WORKSPACE', adminLabel: 'PLATFORM ADMINISTRATION',
    title: 'A better rhythm at work.', subtitle: 'A private space for your organisation’s employee invitations and enrollment. Your roster stays within your company.',
    language: 'Language', signIn: 'Sign in to continue', signInBody: 'Your corporate workspace is private. Sign in with the account that was invited to access it.',
    signOut: 'Sign out', publicSite: 'MaydanGo home', access: 'Private by design', secure: 'Only your authorised company workspace is shown here.',
    adminTitle: 'Organisations, made clear.', adminIntro: 'Create an organisation and give its HR administrator a one-time invitation. Existing organisations can receive another HR invitation.',
    createOrg: 'Create an organisation', orgName: 'Organisation name', hrEmail: 'HR administrator work email', create: 'Create organisation', creating: 'Creating…',
    organisations: 'Organisations', noOrgs: 'No organisations yet', noOrgsText: 'Create the first organisation to issue a private HR invitation.',
    employees: 'employees', administrators: 'HR administrators', active: 'Active', suspended: 'Suspended', created: 'Created',
    inviteHr: 'Invite HR administrator', sendInvite: 'Create invitation link', cancel: 'Cancel', email: 'Work email', inviting: 'Creating link…',
    portalTitle: 'Your people, in one place.', portalIntro: 'Invite employees using their work email, keep your roster current, and view your own enrollment summary.',
    roster: 'Employee roster', inviteEmployees: 'Invite employees', addByEmail: 'Work email addresses', addHint: 'Enter one or more addresses, separated by commas, spaces, or new lines. Up to 100.',
    createLinks: 'Create invitation links', creatingLinks: 'Preparing links…', manualShare: 'These links are for you to share manually. MaydanGo does not send email.',
    noRoster: 'Your roster is ready to begin', noRosterText: 'Invite employees with their verified work email. Their access is checked when they sign in.',
    noEmployee: 'No employees in this roster yet.', statusInvited: 'Invitation pending', statusActive: 'Active', statusRemoved: 'Removed',
    invited: 'Invited', expires: 'Invitation expires', activated: 'Joined', reissue: 'Issue a fresh link', reissuing: 'Creating link…',
    remove: 'Remove employee', removeTitle: 'Remove this employee?', removeHint: 'This removes their company roster entry. It does not change their MaydanGo membership; an active company membership must be closed by MaydanGo first.',
    reason: 'Reason', reasonHint: 'At least 5 characters', confirmRemove: 'Confirm removal', removing: 'Removing…',
    yourEnrollment: 'Your organisation enrollment', membership: 'MaydanGo membership', noMembership: 'No membership summary is available for this enrollment.',
    membershipNote: 'Roster activation is separate from a MaydanGo membership grant.', enrollmentInvited: 'Invitation pending', enrollmentActive: 'Enrolled', enrollmentRemoved: 'Removed',
    tier: 'Tier', starts: 'Starts', ends: 'Ends', status: 'Status', noEnrollments: 'No organisation enrollment is linked to your account.',
    inviteSuccess: 'Invitation link ready', copy: 'Copy link', copied: 'Copied', expiresAt: 'Expires', tokenNotice: 'This one-time link is shown only now. Copy it before leaving this page.',
    createdSuccess: 'Organisation created. HR invitation link is ready.', orgSuccess: 'Organisation created successfully.',
    acceptTitle: 'You’ve been invited.', acceptIntro: 'Accept this one-time invitation to connect your account with the organisation. Sign in using the invited, verified email address.',
    accept: 'Accept invitation', accepting: 'Accepting…', accepted: 'Invitation accepted', acceptedText: 'Your access is ready. Continue to your corporate workspace.',
    continue: 'Open workspace', invalidToken: 'Invitation link missing', invalidTokenText: 'Open the complete invitation link shared with you.', signInInvite: 'Sign in to accept this invitation',
    loading: 'Loading your private workspace…', error: 'We could not load this workspace.', retry: 'Try again', failed: 'That could not be completed. Please try again.',
    noResults: 'No employee invitations were created.', privateNote: 'Employee details are visible only to your organisation’s authorised HR administrators.',
    roleNote: 'A user may have HR and employee access. Each view shows only the information needed for that role.',
    securityTitle: 'A clear boundary', securityText: 'HR sees the roster for their own organisation. Employees see only their own enrollment and membership summary.',
    copiedCount: 'links ready', orgLinkHint: 'HR invitations are one-time links. Share them only with the intended administrator.',
  },
  ar: {
    brand: 'MaydanGo', label: 'مساحة المؤسسات', adminLabel: 'إدارة المنصة',
    title: 'إيقاع أفضل في العمل.', subtitle: 'مساحة خاصة لدعوات موظفي مؤسستك وتسجيلهم. يبقى سجل الموظفين ضمن مؤسستك.',
    language: 'اللغة', signIn: 'سجّل الدخول للمتابعة', signInBody: 'مساحة مؤسستك خاصة. سجّل الدخول بالحساب الذي تلقى دعوة الوصول.',
    signOut: 'تسجيل الخروج', publicSite: 'الصفحة الرئيسية', access: 'خصوصية من البداية', secure: 'تظهر هنا مساحة مؤسستك المصرح بها فقط.',
    adminTitle: 'إدارة واضحة للمؤسسات.', adminIntro: 'أنشئ مؤسسة وامنح مسؤول الموارد البشرية فيها دعوة لمرة واحدة. ويمكن إصدار دعوة أخرى لمؤسسة قائمة.',
    createOrg: 'إنشاء مؤسسة', orgName: 'اسم المؤسسة', hrEmail: 'بريد مسؤول الموارد البشرية للعمل', create: 'إنشاء المؤسسة', creating: 'جارٍ الإنشاء…',
    organisations: 'المؤسسات', noOrgs: 'لا توجد مؤسسات بعد', noOrgsText: 'أنشئ المؤسسة الأولى لإصدار دعوة خاصة لمسؤول الموارد البشرية.',
    employees: 'موظفون', administrators: 'مسؤولو الموارد البشرية', active: 'نشطة', suspended: 'موقوفة', created: 'تاريخ الإنشاء',
    inviteHr: 'دعوة مسؤول موارد بشرية', sendInvite: 'إنشاء رابط الدعوة', cancel: 'إلغاء', email: 'بريد العمل', inviting: 'جارٍ إنشاء الرابط…',
    portalTitle: 'فريقك في مكان واحد.', portalIntro: 'ادعُ الموظفين باستخدام بريد العمل، وحافظ على تحديث السجل، واطّلع على ملخص تسجيلك أنت.',
    roster: 'سجل الموظفين', inviteEmployees: 'دعوة الموظفين', addByEmail: 'عناوين بريد العمل', addHint: 'أدخل عنواناً أو أكثر، وافصل بينها بفاصلة أو مسافة أو سطر جديد. حتى 100 عنوان.',
    createLinks: 'إنشاء روابط الدعوة', creatingLinks: 'جارٍ إعداد الروابط…', manualShare: 'شارك هذه الروابط يدوياً. لا ترسل MaydanGo رسائل بريد إلكتروني.',
    noRoster: 'سجلّك جاهز للبدء', noRosterText: 'ادعُ الموظفين باستخدام بريد العمل الذي تم التحقق منه. يتم التحقق من صلاحيتهم عند تسجيل الدخول.',
    noEmployee: 'لا يوجد موظفون في هذا السجل بعد.', statusInvited: 'الدعوة بانتظار القبول', statusActive: 'نشط', statusRemoved: 'تمت الإزالة',
    invited: 'تاريخ الدعوة', expires: 'تنتهي الدعوة', activated: 'انضم', reissue: 'إصدار رابط جديد', reissuing: 'جارٍ إنشاء الرابط…',
    remove: 'إزالة الموظف', removeTitle: 'إزالة هذا الموظف؟', removeHint: 'يؤدي ذلك إلى إزالة الموظف من سجل الشركة ولا يغيّر عضوية MaydanGo. يجب على MaydanGo إنهاء العضوية النشطة للشركة أولاً.',
    reason: 'السبب', reasonHint: '5 أحرف على الأقل', confirmRemove: 'تأكيد الإزالة', removing: 'جارٍ الإزالة…',
    yourEnrollment: 'تسجيلك في المؤسسة', membership: 'عضوية MaydanGo', noMembership: 'لا يتوفر ملخص عضوية لهذا التسجيل.',
    membershipNote: 'تفعيل سجل الموظف منفصل عن منح عضوية MaydanGo.', tier: 'الفئة', starts: 'تبدأ', ends: 'تنتهي', status: 'الحالة',
    enrollmentInvited: 'الدعوة بانتظار القبول', enrollmentActive: 'مسجل', enrollmentRemoved: 'تمت الإزالة', noEnrollments: 'لا يوجد تسجيل مؤسسة مرتبط بحسابك.',
    inviteSuccess: 'رابط الدعوة جاهز', copy: 'نسخ الرابط', copied: 'تم النسخ', expiresAt: 'ينتهي في', tokenNotice: 'يظهر هذا الرابط لمرة واحدة الآن فقط. انسخه قبل مغادرة الصفحة.',
    createdSuccess: 'تم إنشاء المؤسسة. رابط دعوة الموارد البشرية جاهز.', orgSuccess: 'تم إنشاء المؤسسة بنجاح.',
    acceptTitle: 'تلقيت دعوة.', acceptIntro: 'اقبل هذه الدعوة لمرة واحدة لربط حسابك بالمؤسسة. سجّل الدخول باستخدام البريد المدعو الذي تم التحقق منه.',
    accept: 'قبول الدعوة', accepting: 'جارٍ قبول الدعوة…', accepted: 'تم قبول الدعوة', acceptedText: 'أصبح الوصول جاهزاً. تابع إلى مساحة مؤسستك.',
    continue: 'فتح المساحة', invalidToken: 'رابط الدعوة غير موجود', invalidTokenText: 'افتح رابط الدعوة الكامل الذي تمت مشاركته معك.', signInInvite: 'سجّل الدخول لقبول الدعوة',
    loading: 'جارٍ تحميل مساحتك الخاصة…', error: 'تعذر تحميل هذه المساحة.', retry: 'أعد المحاولة', failed: 'تعذر إكمال العملية. حاول مرة أخرى.',
    noResults: 'لم يتم إنشاء دعوات للموظفين.', privateNote: 'لا تظهر تفاصيل الموظفين إلا لمسؤولي الموارد البشرية المخولين في مؤسستك.',
    roleNote: 'قد يكون للمستخدم صلاحية الموارد البشرية والموظف معاً. تعرض كل مساحة المعلومات اللازمة لدورها فقط.',
    securityTitle: 'حدود واضحة', securityText: 'يرى مسؤولو الموارد البشرية سجل مؤسستهم فقط. ويرى الموظف تسجيله وملخص عضويته فقط.',
    copiedCount: 'روابط جاهزة', orgLinkHint: 'روابط دعوة الموارد البشرية لمرة واحدة. شاركها مع المسؤول المقصود فقط.',
  },
  ku: {
    brand: 'MaydanGo', label: 'شوێنی دامەزراوە', adminLabel: 'بەڕێوەبردنی پلاتفۆرم',
    title: 'ڕێتمێکی باشتر لە کاردا.', subtitle: 'شوێنێکی تایبەت بۆ بانگهێشت و تۆمارکردنی کارمەندانی دامەزراوەکەت. تۆماری کارمەندان لە سنووری دامەزراوەکەتدا دەمێنێتەوە.',
    language: 'زمان', signIn: 'بچۆ ژوورەوە بۆ بەردەوامبوون', signInBody: 'شوێنی دامەزراوەکەت تایبەتە. بەو هەژمارە بچۆ ژوورەوە کە بانگهێشت کراوە.',
    signOut: 'چوونەدەرەوە', publicSite: 'ماڵپەڕی MaydanGo', access: 'تایبەتمەندی لە بنەڕەتەوە', secure: 'تەنها شوێنی ڕێگەپێدراوی دامەزراوەکەت لێرە پیشان دەدرێت.',
    adminTitle: 'بەڕێوەبردنی ڕوونی دامەزراوەکان.', adminIntro: 'دامەزراوەیەک دروست بکە و بانگهێشتێکی یەکجارە بۆ بەڕێوەبەری سەرچاوە مرۆییەکانی بنێرە. بۆ دامەزراوەی هەبوو بانگهێشتێکی نوێ دەر بکە.',
    createOrg: 'دروستکردنی دامەزراوە', orgName: 'ناوی دامەزراوە', hrEmail: 'ئیمەیڵی کاری بەڕێوەبەری HR', create: 'دروستکردنی دامەزراوە', creating: 'دروست دەکرێت…',
    organisations: 'دامەزراوەکان', noOrgs: 'هێشتا دامەزراوە نییە', noOrgsText: 'یەکەم دامەزراوە دروست بکە بۆ دەرکردنی بانگهێشتی تایبەتی HR.',
    employees: 'کارمەند', administrators: 'بەڕێوەبەری HR', active: 'چالاک', suspended: 'ڕاگیراو', created: 'دروستکراوە',
    inviteHr: 'بانگهێشتکردنی بەڕێوەبەری HR', sendInvite: 'دروستکردنی بەستەری بانگهێشت', cancel: 'پاشگەزبوونەوە', email: 'ئیمەیڵی کار', inviting: 'بەستەر دروست دەکرێت…',
    portalTitle: 'تیمت لە یەک شوێندا.', portalIntro: 'بە ئیمەیڵی کار بانگهێشتی کارمەندان بکە، تۆمارەکە بە نوێیی بهێڵەوە و پوختەی تۆماربوونی خۆت ببینە.',
    roster: 'تۆماری کارمەندان', inviteEmployees: 'بانگهێشتکردنی کارمەندان', addByEmail: 'ناونیشانی ئیمەیڵی کار', addHint: 'یەک یان چەند ناونیشان بنووسە و بە کۆما، بۆشایی یان دێڕ لێکیان جیا بکەرەوە. تا ١٠٠ ناونیشان.',
    createLinks: 'دروستکردنی بەستەری بانگهێشت', creatingLinks: 'بەستەرەکان ئامادە دەکرێن…', manualShare: 'ئەم بەستەرانە بە دەست بڵاو بکەرەوە. MaydanGo ئیمەیڵ نانێرێت.',
    noRoster: 'تۆمارەکەت ئامادەیە', noRosterText: 'کارمەندان بە ئیمەیڵی کاری پشتڕاستکراو بانگهێشت بکە. دەسەڵاتەکەیان کاتی چوونەژوورەوە دەپشکنرێت.',
    noEmployee: 'هێشتا کارمەندێک لەم تۆمارەدا نییە.', statusInvited: 'بانگهێشت چاوەڕوانە', statusActive: 'چالاک', statusRemoved: 'لابراوە',
    invited: 'بانگهێشتکراوە', expires: 'بانگهێشت کۆتایی دێت', activated: 'چالاکبوو', reissue: 'دەرکردنی بەستەری نوێ', reissuing: 'بەستەر دروست دەکرێت…',
    remove: 'لابردنی کارمەند', removeTitle: 'ئەم کارمەندە لاببەیت؟', removeHint: 'ئەمە کارمەند لە تۆماری کۆمپانیا لادەبات و ئەندامێتیی MaydanGo ناگۆڕێت. پێویستە سەرەتا MaydanGo ئەندامێتیی چالاکی کۆمپانیا کۆتایی پێبهێنێت.',
    reason: 'هۆکار', reasonHint: 'لانیکەم ٥ پیت', confirmRemove: 'پشتڕاستکردنەوەی لابردن', removing: 'لابردن…',
    yourEnrollment: 'تۆماربوونی تۆ لە دامەزراوە', membership: 'ئەندامێتی MaydanGo', noMembership: 'پوختەی ئەندامێتی بۆ ئەم تۆماربوونە بەردەست نییە.',
    membershipNote: 'چالاکبوونی تۆماری کارمەند جیاوازە لە بەخشینی ئەندامێتی MaydanGo.', tier: 'ئاست', starts: 'دەستپێدەکات', ends: 'کۆتایی دێت', status: 'دۆخ',
    enrollmentInvited: 'بانگهێشت چاوەڕوانە', enrollmentActive: 'تۆمارکراو', enrollmentRemoved: 'لابراوە', noEnrollments: 'هیچ تۆماربوونێکی دامەزراوە بە هەژمارەکەتەوە نەبەستراوە.',
    inviteSuccess: 'بەستەری بانگهێشت ئامادەیە', copy: 'کۆپیکردنی بەستەر', copied: 'کۆپی کرا', expiresAt: 'کۆتایی دێت', tokenNotice: 'ئەم بەستەرە تەنها ئێستا پیشان دەدرێت. پێش دەرچوون کۆپیی بکە.',
    createdSuccess: 'دامەزراوە دروستکرا. بەستەری بانگهێشتی HR ئامادەیە.', orgSuccess: 'دامەزراوە بە سەرکەوتوویی دروستکرا.',
    acceptTitle: 'بانگهێشت کراویت.', acceptIntro: 'ئەم بانگهێشتەی یەکجارە پەسەند بکە بۆ بەستنەوەی هەژمارەکەت بە دامەزراوە. بەو ئیمەیڵە بچۆ ژوورەوە کە بانگهێشت کراوە و پشتڕاستکراوە.',
    accept: 'پەسەندکردنی بانگهێشت', accepting: 'بانگهێشت پەسەند دەکرێت…', accepted: 'بانگهێشت پەسەند کرا', acceptedText: 'دەستگەیشتن ئامادەیە. بڕۆ بۆ شوێنی دامەزراوەکەت.',
    continue: 'کردنەوەی شوێن', invalidToken: 'بەستەری بانگهێشت نییە', invalidTokenText: 'بەستەری تەواوی بانگهێشتەکە بکەرەوە.', signInInvite: 'بچۆ ژوورەوە بۆ پەسەندکردنی بانگهێشت',
    loading: 'شوێنی تایبەت بار دەکرێت…', error: 'نەتوانرا ئەم شوێنە بار بکرێت.', retry: 'هەوڵدانەوە', failed: 'تەواوکردنی داواکە نەکرا. دووبارە هەوڵ بدەوە.',
    noResults: 'هیچ بانگهێشتێکی کارمەند دروست نەکرا.', privateNote: 'وردەکاری کارمەندان تەنها بۆ بەڕێوەبەرانی HRی ڕێگەپێدراوی دامەزراوەکەت دەردەکەوێت.',
    roleNote: 'بەکارهێنەر دەتوانێت دەسەڵاتی HR و کارمەندی هەبێت. هەر بینینێک تەنها زانیاریی پێویستی ئەو ڕۆڵە پیشان دەدات.',
    securityTitle: 'سنووری ڕوون', securityText: 'HR تەنها تۆماری دامەزراوەی خۆی دەبینێت. کارمەند تەنها تۆماربوون و پوختەی ئەندامێتی خۆی دەبینێت.',
    copiedCount: 'بەستەر ئامادە', orgLinkHint: 'بانگهێشتی HR یەکجارەیە. تەنها بۆ بەڕێوەبەری مەبەست بنێرە.',
  },
} satisfies Record<Lang, Record<string, string>>;
const direction = (lang: Lang) => lang === 'en' ? 'ltr' : 'rtl';
const savedLang = (): Lang => {
  const value = localStorage.getItem('maydango-partner-language');
  return value === 'ar' || value === 'ku' ? value : 'en';
};
const dateLabel = (value: string | null, lang: Lang) => value
  ? new Intl.DateTimeFormat(lang === 'en' ? 'en-IQ' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ', { dateStyle: 'medium', timeZone: 'Asia/Baghdad', numberingSystem: 'latn' }).format(new Date(value))
  : '—';
const inviteUrl = (token: string) => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/corporate-invite?token=${encodeURIComponent(token)}`;

function LanguageSelect({ lang, setLang }: { lang: Lang; setLang: (value: Lang) => void }) {
  return <label className="flex items-center gap-2 text-xs font-semibold text-[#65766e]"><span>{words[lang].language}</span><select data-testid="select-corporate-language" value={lang} onChange={event => { const next = event.target.value as Lang; localStorage.setItem('maydango-partner-language', next); setLang(next); }} className="rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-sm text-[#173d35]"><option value="en">English</option><option value="ar">العربية</option><option value="ku">کوردی</option></select></label>;
}

function Shell({ lang, setLang, admin = false, children }: { lang: Lang; setLang: (value: Lang) => void; admin?: boolean; children: ReactNode }) {
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();
  const c = words[lang];
  return <main dir={direction(lang)} className="corporate-shell min-h-[100dvh] bg-[#f3f1e8] px-4 py-5 text-[#173d35] sm:px-8 sm:py-8">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d9d5c8] pb-5">
        <Link href="/" className="inline-flex items-center gap-3 text-[#173d35] no-underline" data-testid="link-corporate-home">
          <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#174d43] text-[#fff9e9]"><span className="font-display text-xl font-extrabold">M</span></span>
          <span><span className="block font-display text-lg font-extrabold tracking-tight">{c.brand}</span><span className="block text-[9px] font-bold uppercase tracking-[.17em] text-[#aa6346]">{c.label}</span></span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4"><LanguageSelect lang={lang} setLang={setLang} />{isSignedIn && <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-[#61756c] hover:bg-[#e8e5da]" data-testid="button-corporate-signout"><LogOut size={15} /> <span className="hidden sm:inline">{c.signOut}</span></button>}</div>
      </header>
      <section className="relative overflow-hidden py-8 sm:py-12">
        <div className="pointer-events-none absolute -top-8 end-6 h-44 w-44 rounded-full border border-[#d6c7a8] opacity-60 sm:end-24 sm:h-64 sm:w-64" />
        <div className="pointer-events-none absolute -top-1 end-12 h-32 w-32 rounded-full border border-[#d6c7a8] opacity-50 sm:end-32 sm:h-48 sm:w-48" />
        <div className="relative max-w-3xl rise-in">
          <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[.2em] text-[#a05b3e]">{admin ? c.adminLabel : c.label}</p>
          <h1 className="font-display text-3xl font-extrabold leading-[1.1] tracking-[-.045em] sm:text-5xl">{admin ? c.adminTitle : c.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5d7067] sm:text-base">{admin ? c.adminIntro : c.subtitle}</p>
        </div>
      </section>
      {children}
      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[#d9d5c8] pt-5 text-xs text-[#76847b]">
        <span>IRAQ · KURDISTAN · WEST · SOUTH</span><Link href="/" className="font-semibold text-[#456258] hover:text-[#174d43]" data-testid="link-corporate-public-home">{c.publicSite}</Link>
      </footer>
    </div>
  </main>;
}

function Notice({ kind = 'info', children }: { kind?: 'info' | 'success' | 'error'; children: ReactNode }) {
  const style = kind === 'error' ? 'border-[#e6c5b8] bg-[#fff4ee] text-[#934635]' : kind === 'success' ? 'border-[#c9dcc8] bg-[#edf5e9] text-[#326448]' : 'border-[#ded9c9] bg-[#fffdf7] text-[#466257]';
  const Icon = kind === 'error' ? AlertCircle : kind === 'success' ? Check : ShieldCheck;
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-2xl border p-4 text-sm leading-6 ${style}`}><Icon size={18} className="mt-1 shrink-0" /><div>{children}</div></div>;
}

function AuthGate({ lang, setLang }: { lang: Lang; setLang: (value: Lang) => void }) {
  const c = words[lang];
  return <Shell lang={lang} setLang={setLang}><div className="mx-auto max-w-xl rounded-[28px] border border-[#ddd8ca] bg-[#fffdf7] p-6 shadow-[0_20px_60px_rgba(38,63,49,.06)] sm:p-9">
    <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[#e6ede3] text-[#174d43]"><LockKeyhole size={21} /></div>
    <h2 className="font-display text-2xl font-extrabold">{c.signIn}</h2><p className="mt-2 text-sm leading-6 text-[#68786f]">{c.signInBody}</p>
    <Link href={`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '') + window.location.search)}`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9] transition hover:bg-[#226556]" data-testid="link-corporate-signin">{c.signIn} <ArrowRight size={16} /></Link>
  </div></Shell>;
}

function LoadingState({ lang }: { lang: Lang }) {
  return <div className="space-y-4" aria-label={words[lang].loading} data-testid="loading-corporate-workspace"><div className="h-28 animate-pulse rounded-[24px] bg-[#e5e1d5]" /><div className="h-20 animate-pulse rounded-[24px] bg-[#e5e1d5]" /><div className="h-48 animate-pulse rounded-[24px] bg-[#e5e1d5]" /></div>;
}

function AdminOrganizations({ lang }: { lang: Lang }) {
  const c = words[lang];
  const client = useQueryClient();
  const query = useGetCorporateOrganizations({ query: { queryKey: getGetCorporateOrganizationsQueryKey(), retry: false } });
  const create = useCreateCorporateOrganization();
  const inviteAdmin = useInviteCorporateAdministrator();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [hrEmail, setHrEmail] = useState('');
  const [issuingFor, setIssuingFor] = useState('');
  const [issued, setIssued] = useState<CorporateInvitationLink | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: getGetCorporateOrganizationsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetCorporatePortalQueryKey() });
  };
  const createOrg = (event: FormEvent) => {
    event.preventDefault(); setError(''); setSuccess(''); setIssued(null);
    if (name.trim().length < 2 || !email.includes('@')) { setError(c.failed); return; }
    create.mutate({ data: { name: name.trim(), administratorEmail: email.trim() } }, {
      onSuccess: result => { setName(''); setEmail(''); setIssued(result.administratorInvitation); setSuccess(c.createdSuccess); invalidate(); },
      onError: () => setError(c.failed),
    });
  };
  const sendHrInvite = (event: FormEvent, id: string) => {
    event.preventDefault(); setError(''); setSuccess(''); setIssued(null);
    if (!hrEmail.includes('@')) { setError(c.failed); return; }
    inviteAdmin.mutate({ id, data: { email: hrEmail.trim() } }, {
      onSuccess: result => { setIssued(result); setHrEmail(''); setIssuingFor(''); invalidate(); },
      onError: () => setError(c.failed),
    });
  };
  return <div className="grid gap-6 lg:grid-cols-[.82fr_1.18fr]">
    <section className="rounded-[26px] border border-[#ded9cb] bg-[#fffdf7] p-5 shadow-[0_14px_40px_rgba(38,63,49,.04)] sm:p-7">
      <div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6ede3] text-[#174d43]"><Plus size={19} /></span><div><h2 className="font-display text-xl font-extrabold">{c.createOrg}</h2><p className="mt-1 text-xs leading-5 text-[#748178]">{c.orgLinkHint}</p></div></div>
      <form onSubmit={createOrg} className="space-y-4">
        <Field label={c.orgName} value={name} onChange={setName} placeholder="e.g. Erbil Design House" testId="input-corporate-org-name" required />
        <Field label={c.hrEmail} value={email} onChange={setEmail} type="email" placeholder="name@company.iq" testId="input-corporate-admin-email" required />
        <button disabled={create.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9] transition hover:bg-[#226556] disabled:opacity-60" data-testid="button-create-corporate-organization">{create.isPending ? c.creating : c.create}<ChevronRight size={16} /></button>
      </form>
      {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
      {success && issued && <div className="mt-4 space-y-3"><Notice kind="success">{success}</Notice><TokenCard item={issued} lang={lang} /></div>}
    </section>
    <section className="rounded-[26px] border border-[#ded9cb] bg-[#fffdf7] p-5 shadow-[0_14px_40px_rgba(38,63,49,.04)] sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#a05b3e]">{c.adminLabel}</p><h2 className="mt-1 font-display text-xl font-extrabold">{c.organisations}</h2></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f0ecdf] text-[#174d43]"><Users size={18} /></span></div>
      {query.isLoading ? <LoadingState lang={lang} /> : query.isError ? <div className="space-y-3"><Notice kind="error">{c.error}</Notice><button onClick={() => void query.refetch()} className="text-sm font-bold text-[#174d43] underline underline-offset-4">{c.retry}</button></div> : !query.data?.length ? <div className="rounded-2xl border border-dashed border-[#d5d0c2] bg-[#f8f6ee] px-5 py-8 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#e7eade] text-[#365d4c]"><Users size={19} /></div><p className="mt-4 font-bold">{c.noOrgs}</p><p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-[#758178]">{c.noOrgsText}</p></div> : <div className="space-y-3">{query.data.map(org => <article key={org.id} className="rounded-2xl border border-[#e4e0d5] bg-[#fbfaf4] p-4 transition hover:border-[#c8d4c7]" data-testid={`card-corporate-org-${org.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{org.name}</h3><p className="mt-1 text-xs text-[#7b867d]">{c.created} · {dateLabel(org.createdAt, lang)}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${org.status === 'active' ? 'bg-[#e5eee2] text-[#326448]' : 'bg-[#f3e5d8] text-[#995c35]'}`}>{org.status === 'active' ? c.active : c.suspended}</span></div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#e8e4d9] pt-3 text-xs text-[#67766d]"><span>{org.employeeCount} {c.employees}</span><span>{org.administratorCount} {c.administrators}</span></div>
        {issuingFor === org.id ? <form onSubmit={event => sendHrInvite(event, org.id)} className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={hrEmail} onChange={event => setHrEmail(event.target.value)} type="email" placeholder={c.email} aria-label={c.email} className="min-w-0 flex-1 rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm" data-testid={`input-hr-invite-${org.id}`} required /><button disabled={inviteAdmin.isPending} className="rounded-xl bg-[#174d43] px-4 py-2.5 text-xs font-bold text-[#fff9e9] disabled:opacity-60" data-testid={`button-send-hr-invite-${org.id}`}>{inviteAdmin.isPending ? c.inviting : c.sendInvite}</button><button type="button" onClick={() => setIssuingFor('')} aria-label={c.cancel} className="grid h-10 w-10 place-items-center rounded-xl border border-[#ded9cb] text-[#68786f]" data-testid={`button-cancel-hr-invite-${org.id}`}><X size={16} /></button></form> : <button onClick={() => { setIssuingFor(org.id); setError(''); setSuccess(''); setIssued(null); }} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#174d43] hover:text-[#a05b3e]" data-testid={`button-invite-hr-${org.id}`}><Mail size={14} />{c.inviteHr}<ArrowRight size={14} /></button>}
      </article>)}</div>}
      {issued && !success && <div className="mt-4"><TokenCard item={issued} lang={lang} /></div>}
    </section>
  </div>;
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false, testId }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean; testId: string }) {
  return <label className="block space-y-1.5 text-xs font-bold text-[#50675d]">{label}<input value={value} onChange={event => onChange(event.target.value)} type={type} placeholder={placeholder} required={required} className="w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3.5 py-3 text-sm font-medium text-[#173d35] placeholder:text-[#a4a99f]" data-testid={testId} /></label>;
}

function TokenCard({ item, lang }: { item: CorporateInvitationLink | { email: string; token: string; expiresAt: string; role?: string }; lang: Lang }) {
  const c = words[lang];
  const [copied, setCopied] = useState(false);
  const href = inviteUrl(item.token);
  return <div className="rounded-2xl border border-[#d8d2c4] bg-[#f6f4eb] p-4" data-testid="card-corporate-invitation-link">
    <div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e4ece1] text-[#174d43]"><Mail size={16} /></div><div className="min-w-0 flex-1"><p className="text-xs font-bold text-[#173d35]">{c.inviteSuccess}</p><p className="mt-1 break-all text-xs text-[#6d7b72]">{item.email}</p></div></div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input readOnly value={href} aria-label={c.copy} className="min-w-0 flex-1 rounded-lg border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-xs text-[#52685e]" data-testid="input-corporate-invite-url" /><button type="button" onClick={() => { void navigator.clipboard?.writeText(href).then(() => setCopied(true)).catch(() => setCopied(false)); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#174d43] px-3 py-2 text-xs font-bold text-[#fff9e9] hover:bg-[#226556]" data-testid="button-copy-corporate-invite"><Copy size={14} />{copied ? c.copied : c.copy}</button></div>
    <p className="mt-3 flex items-center gap-1.5 text-[11px] leading-5 text-[#737f75]"><Clock3 size={13} />{c.expiresAt} · {dateLabel(item.expiresAt, lang)}</p><p className="mt-2 text-[11px] leading-5 text-[#8a6548]">{c.tokenNotice}</p>
  </div>;
}

function PortalWorkspace({ lang, setLang }: { lang: Lang; setLang: (value: Lang) => void }) {
  const c = words[lang];
  const query = useGetCorporatePortal({ query: { queryKey: getGetCorporatePortalQueryKey(), retry: false } });
  const client = useQueryClient();
  const invite = useInviteCorporateEmployees();
  const reissue = useReissueCorporateEmployeeInvitation();
  const remove = useRemoveCorporateEmployee();
  const [emailText, setEmailText] = useState('');
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [links, setLinks] = useState<{ employeeId: string; id: string; email: string; token: string; expiresAt: string }[]>([]);
  const [oneLink, setOneLink] = useState<{ email: string; token: string; expiresAt: string } | null>(null);
  const [removingId, setRemovingId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: getGetCorporateOrganizationsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetCorporatePortalQueryKey() });
  };
  const inviteEmployees = (event: FormEvent) => {
    event.preventDefault(); setError(''); setSuccess(''); setLinks([]); setOneLink(null);
    const emails = [...new Set(emailText.split(/[\s,;]+/).map(value => value.trim().toLowerCase()).filter(Boolean))];
    if (!emails.length || emails.length > 100 || emails.some(value => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) { setError(c.failed); return; }
    const organization = query.data?.adminOrganizations.find(item => item.id === selectedOrganizationId) ?? query.data?.adminOrganizations[0];
    if (!organization) return;
    invite.mutate({ data: { organizationId: organization.id, emails } }, {
      onSuccess: result => { setEmailText(''); setLinks(result.invitations); setSuccess(`${result.invitations.length} ${c.copiedCount}`); invalidate(); },
      onError: () => setError(c.failed),
    });
  };
  const reissueInvite = (id: string) => {
    setError(''); setOneLink(null);
    reissue.mutate({ id }, { onSuccess: result => { setOneLink(result); invalidate(); }, onError: () => setError(c.failed) });
  };
  const removeEmployee = (event: FormEvent, id: string) => {
    event.preventDefault(); setError('');
    if (reason.trim().length < 5) { setError(c.failed); return; }
    remove.mutate({ id, data: { reason: reason.trim() } }, {
      onSuccess: () => { setRemovingId(''); setReason(''); setSuccess(c.statusRemoved); invalidate(); },
      onError: () => setError(c.failed),
    });
  };

  if (query.isLoading) return <Shell lang={lang} setLang={setLang}><LoadingState lang={lang} /></Shell>;
  if (query.isError) return <Shell lang={lang} setLang={setLang}><div className="max-w-xl"><Notice kind="error">{c.error}</Notice><button onClick={() => void query.refetch()} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#174d43]" data-testid="button-retry-corporate-portal"><RefreshCw size={15} />{c.retry}</button></div></Shell>;
  const orgs = query.data?.adminOrganizations ?? [];
  const enrollments = query.data?.myEnrollments ?? [];
  const primaryOrg = orgs.find(org => org.id === selectedOrganizationId) ?? orgs[0];
  const employeeRows = primaryOrg?.employees ?? [];
  const activeCount = employeeRows.filter(employee => employee.status === 'active').length;
  return <Shell lang={lang} setLang={setLang}>
    <div className="grid gap-6 lg:grid-cols-[1.45fr_.75fr]">
      <section className="space-y-5">
        {orgs.length > 0 && <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="rounded-[24px] bg-[#174d43] p-5 text-[#f8f4e8] sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#d6c69d]">{c.roster}</p>{orgs.length > 1 ? <select aria-label={c.organisations} value={primaryOrg.id} onChange={event => setSelectedOrganizationId(event.target.value)} className="mt-2 max-w-full rounded-lg border border-[#ffffff3b] bg-[#ffffff12] px-2 py-1.5 font-display text-lg font-extrabold text-[#f8f4e8]" data-testid="select-corporate-organization">{orgs.map(org => <option key={org.id} value={org.id} className="text-[#173d35]">{org.name}</option>)}</select> : <h2 className="mt-2 font-display text-2xl font-extrabold">{primaryOrg.name}</h2>}</div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ffffff1c]"><Users size={20} /></span></div>
            <div className="mt-5 flex gap-7"><div><p className="font-display text-3xl font-bold">{employeeRows.length}</p><p className="mt-1 text-xs text-[#cfdbd1]">{c.employees}</p></div><div className="border-s border-[#ffffff38] ps-6"><p className="font-display text-3xl font-bold">{activeCount}</p><p className="mt-1 text-xs text-[#cfdbd1]">{c.statusActive}</p></div></div>
          </div>
          <div className="flex flex-col justify-between rounded-[24px] border border-[#ded9cb] bg-[#fffdf7] p-5 sm:w-56"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7ede3] text-[#174d43]"><ShieldCheck size={19} /></div><div className="mt-4"><p className="text-sm font-bold">{c.securityTitle}</p><p className="mt-1 text-xs leading-5 text-[#748178]">{c.securityText}</p></div></div>
        </div>}
        {orgs.length > 0 && <section className="rounded-[26px] border border-[#ded9cb] bg-[#fffdf7] p-5 shadow-[0_14px_40px_rgba(38,63,49,.04)] sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#a05b3e]">{primaryOrg.name}</p><h2 className="mt-1 font-display text-xl font-extrabold">{c.inviteEmployees}</h2></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f0ecdf] text-[#174d43]"><Mail size={18} /></span></div>
          <form onSubmit={inviteEmployees}>
            <label className="block space-y-2 text-xs font-bold text-[#50675d]">{c.addByEmail}<textarea value={emailText} onChange={event => setEmailText(event.target.value)} rows={3} placeholder="employee@company.iq, colleague@company.iq" className="w-full resize-y rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3.5 py-3 text-sm font-medium text-[#173d35] placeholder:text-[#a4a99f]" data-testid="textarea-corporate-employee-emails" /><span className="block font-normal leading-5 text-[#7a867d]">{c.addHint}</span></label>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs text-[#748178]"><Clipboard size={14} />{c.manualShare}</p><button disabled={invite.isPending} className="inline-flex items-center gap-2 rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9] transition hover:bg-[#226556] disabled:opacity-60" data-testid="button-invite-corporate-employees">{invite.isPending ? c.creatingLinks : c.createLinks}<ArrowRight size={15} /></button></div>
          </form>
          {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
          {success && links.length > 0 && <div className="mt-4 space-y-3"><Notice kind="success">{success}</Notice><p className="text-xs leading-5 text-[#8a6548]">{c.tokenNotice}</p>{links.map(item => <TokenCard key={item.id} item={item} lang={lang} />)}</div>}
        </section>}
        {orgs.length > 0 && <section className="rounded-[26px] border border-[#ded9cb] bg-[#fffdf7] p-5 shadow-[0_14px_40px_rgba(38,63,49,.04)] sm:p-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#a05b3e]">{c.access}</p><h2 className="mt-1 font-display text-xl font-extrabold">{c.roster}</h2></div><span className="text-xs text-[#79847b]">{c.privateNote}</span></div>
          {employeeRows.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d5d0c2] bg-[#f8f6ee] p-6 text-center"><p className="font-bold">{c.noRoster}</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#758178]">{c.noRosterText}</p></div> : <div className="space-y-2">{employeeRows.map(employee => <article key={employee.id} className="rounded-2xl border border-[#e6e2d8] bg-[#fcfbf6] p-4" data-testid={`row-corporate-employee-${employee.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-sm font-bold text-[#23483d]">{employee.email}</p><p className="mt-1 text-[11px] text-[#77837a]">{c.invited} · {dateLabel(employee.invitedAt, lang)}{employee.activatedAt ? ` · ${c.activated} ${dateLabel(employee.activatedAt, lang)}` : ''}</p>{employee.status === 'invited' && employee.inviteExpiresAt && <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#8a6548]"><Clock3 size={12} />{c.expires} · {dateLabel(employee.inviteExpiresAt, lang)}</p>}</div><span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold ${employee.status === 'active' ? 'bg-[#e5eee2] text-[#326448]' : employee.status === 'invited' ? 'bg-[#f3ead9] text-[#916333]' : 'bg-[#eee9e2] text-[#7b7163]'}`}>{employee.status === 'active' ? c.statusActive : employee.status === 'invited' ? c.statusInvited : c.statusRemoved}</span></div>
            {employee.status !== 'removed' && <div className="mt-3 flex flex-wrap gap-2 border-t border-[#eeeae0] pt-3">{employee.status === 'invited' && employee.pendingInvitationId && <button onClick={() => reissueInvite(employee.pendingInvitationId!)} disabled={reissue.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9ded3] px-3 py-2 text-xs font-bold text-[#31594a] hover:bg-[#edf2e9] disabled:opacity-60" data-testid={`button-reissue-corporate-invite-${employee.id}`}><RefreshCw size={13} />{reissue.isPending ? c.reissuing : c.reissue}</button>}<button onClick={() => { setRemovingId(employee.id); setReason(''); setError(''); }} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-[#94604a] hover:bg-[#f8eee8]" data-testid={`button-remove-corporate-employee-${employee.id}`}><X size={13} />{c.remove}</button></div>}
            {removingId === employee.id && <form onSubmit={event => removeEmployee(event, employee.id)} className="mt-4 rounded-xl border border-[#e8d5c8] bg-[#fff8f3] p-4"><p className="text-sm font-bold text-[#824b39]">{c.removeTitle}</p><p className="mt-1 text-xs leading-5 text-[#836d60]">{c.removeHint}</p><label className="mt-3 block text-xs font-bold text-[#725749]">{c.reason}<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder={c.reasonHint} rows={2} className="mt-1.5 w-full rounded-lg border border-[#dfcabe] bg-[#fffdf7] px-3 py-2 text-sm" data-testid={`textarea-removal-reason-${employee.id}`} required minLength={5} maxLength={500} /></label><div className="mt-3 flex gap-2"><button disabled={remove.isPending} className="rounded-lg bg-[#934b39] px-4 py-2 text-xs font-bold text-white disabled:opacity-60" data-testid={`button-confirm-remove-${employee.id}`}>{remove.isPending ? c.removing : c.confirmRemove}</button><button type="button" onClick={() => setRemovingId('')} className="rounded-lg border border-[#ded3c9] px-4 py-2 text-xs font-bold text-[#795f51]" data-testid={`button-cancel-remove-${employee.id}`}>{c.cancel}</button></div></form>}
          </article>)}</div>}
          {error && !success && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
          {oneLink && <div className="mt-4"><TokenCard item={oneLink} lang={lang} /></div>}
          {success && links.length === 0 && !oneLink && <div className="mt-4"><Notice kind="success">{success}</Notice></div>}
        </section>}
        {orgs.length === 0 && <section className="rounded-[26px] border border-dashed border-[#d5d0c2] bg-[#fffdf7] p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#e7ede3] text-[#174d43]"><Users size={21} /></div><h2 className="mt-4 font-display text-xl font-extrabold">{c.noRoster}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#758178]">{c.noRosterText}</p><p className="mt-4 text-xs text-[#9a6946]">{c.roleNote}</p></section>}
      </section>
      <aside className="space-y-4">
        <section className="rounded-[26px] border border-[#ded9cb] bg-[#fffdf7] p-5 shadow-[0_14px_40px_rgba(38,63,49,.04)] sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f0ecdf] text-[#174d43]"><ShieldCheck size={18} /></span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a05b3e]">{c.access}</p><h2 className="font-display text-lg font-extrabold">{c.yourEnrollment}</h2></div></div>
          <p className="mt-4 text-xs leading-5 text-[#748178]">{c.securityText}</p>
          {enrollments.length === 0 ? <div className="mt-5 rounded-xl bg-[#f8f6ee] p-4 text-sm leading-6 text-[#78837a]">{c.noEnrollments}</div> : <div className="mt-4 space-y-3">{enrollments.map(enrollment => <article key={enrollment.id} className="rounded-2xl border border-[#e6e2d8] bg-[#fcfbf6] p-4" data-testid={`card-corporate-enrollment-${enrollment.id}`}><div className="flex items-start justify-between gap-2"><h3 className="font-bold">{enrollment.organizationName}</h3><span className="rounded-full bg-[#e5eee2] px-2.5 py-1 text-[10px] font-bold text-[#326448]">{enrollment.status === 'active' ? c.enrollmentActive : enrollment.status === 'invited' ? c.enrollmentInvited : c.enrollmentRemoved}</span></div><div className="mt-4 border-t border-[#e8e4d9] pt-3"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#a05b3e]">{c.membership}</p>{enrollment.membership ? <><p className="mt-2 text-sm font-bold">{enrollment.membership.tier}</p><p className="mt-1 text-xs text-[#77837a]">{c.status}: {enrollment.membership.status}</p><p className="mt-2 text-xs text-[#77837a]">{c.starts} · {dateLabel(enrollment.membership.startsAt, lang)}</p><p className="mt-1 text-xs text-[#77837a]">{c.ends} · {dateLabel(enrollment.membership.endsAt, lang)}</p></> : <p className="mt-2 text-xs leading-5 text-[#77837a]">{c.noMembership}</p>}</div></article>)}</div>}
          <div className="mt-4 rounded-xl bg-[#f4f1e7] p-3 text-[11px] leading-5 text-[#6c786f]">{c.membershipNote}</div>
        </section>
        <Notice><strong>{c.securityTitle}</strong><br />{c.roleNote}</Notice>
      </aside>
    </div>
  </Shell>;
}

function AcceptInvitation({ lang, setLang }: { lang: Lang; setLang: (value: Lang) => void }) {
  const c = words[lang];
  const { isLoaded, isSignedIn } = useAuth();
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const accept = useAcceptCorporateInvitation();
  const [result, setResult] = useState<{ organizationName: string } | null>(null);
  const [error, setError] = useState('');
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  if (!isLoaded || !isSignedIn) return <AuthGate lang={lang} setLang={setLang} />;
  const onAccept = () => {
    setError('');
    if (!token || token.length < 32) { setError(c.invalidTokenText); return; }
    accept.mutate({ data: { token } }, {
      onSuccess: response => { setResult({ organizationName: response.organizationName }); setLocation('/corporate-invite'); void client.invalidateQueries({ queryKey: getGetCorporatePortalQueryKey() }); void client.invalidateQueries({ queryKey: getGetCorporateOrganizationsQueryKey() }); },
      onError: () => setError(c.failed),
    });
  };
  return <Shell lang={lang} setLang={setLang}>
    <div className="mx-auto max-w-2xl rounded-[28px] border border-[#ded9cb] bg-[#fffdf7] p-6 shadow-[0_20px_60px_rgba(38,63,49,.06)] sm:p-9">
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[#e6ede3] text-[#174d43]"><Mail size={21} /></div>
      {result ? <><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#a05b3e]">{c.accepted}</p><h2 className="mt-2 font-display text-3xl font-extrabold">{result.organizationName}</h2><p className="mt-3 text-sm leading-6 text-[#6d7b72]">{c.acceptedText}</p><Link href="/corporate-portal" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9]" data-testid="link-corporate-continue">{c.continue}<ArrowRight size={16} /></Link></> : <><h2 className="font-display text-2xl font-extrabold">{token ? c.acceptTitle : c.invalidToken}</h2><p className="mt-2 text-sm leading-6 text-[#6d7b72]">{token ? c.acceptIntro : c.invalidTokenText}</p>{error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}<button onClick={onAccept} disabled={accept.isPending || !token} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9] transition hover:bg-[#226556] disabled:opacity-50" data-testid="button-accept-corporate-invitation">{accept.isPending ? c.accepting : c.accept}<ArrowRight size={16} /></button></>}
      <p className="mt-5 flex items-start gap-2 border-t border-[#e7e3d8] pt-4 text-xs leading-5 text-[#77837a]"><ShieldCheck className="mt-0.5 shrink-0" size={14} />{c.signInBody}</p>
    </div>
  </Shell>;
}

export function CorporateAdminPage() {
  const [lang, setLang] = useState<Lang>(savedLang);
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <main className="min-h-[100dvh] bg-[#f3f1e8] p-6"><div className="mx-auto max-w-6xl"><LoadingState lang={lang} /></div></main>;
  if (!isSignedIn) return <AuthGate lang={lang} setLang={setLang} />;
  return <Shell lang={lang} setLang={setLang} admin><AdminOrganizations lang={lang} /></Shell>;
}

export function CorporatePortalPage() {
  const [lang, setLang] = useState<Lang>(savedLang);
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <main className="min-h-[100dvh] bg-[#f3f1e8] p-6"><div className="mx-auto max-w-6xl"><LoadingState lang={lang} /></div></main>;
  if (!isSignedIn) return <AuthGate lang={lang} setLang={setLang} />;
  return <PortalWorkspace lang={lang} setLang={setLang} />;
}

export function CorporateInvitePage() {
  const [lang, setLang] = useState<Lang>(savedLang);
  return <AcceptInvitation lang={lang} setLang={setLang} />;
}
