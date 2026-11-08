import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import {
  getGetInstructorAccessRequestsQueryKey,
  getGetInstructorPortalQueryKey,
  useDecideInstructorAccessRequest,
  getGetInstructorSupportTicketQueryKey,
  getGetInstructorSupportTicketsQueryKey,
  useCreateInstructorSupportTicket,
  useGetInstructorAccessRequests,
  useGetInstructorPortal,
  useGetInstructorSupportTicket,
  useGetInstructorSupportTickets,
  useReplyInstructorSupportTicket,
  useSubmitInstructorAccessRequest,
} from '@workspace/api-client-react';
import type { PortalLanguage } from '@/pages/partner-operations';
import { AlertCircle, ArrowUpRight, CalendarDays, Check, Clock3, Dumbbell, LockKeyhole, MessageCircle, Plus, Send, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';

type Language = PortalLanguage;
type CopyKey = keyof typeof copy.en;

const copy = {
  en: {
    eyebrow: 'MAYDANGO · INSTRUCTOR ACCESS', title: 'Your teaching, on your terms.',
    intro: 'Request instructor access to the MaydanGo workspace. Permissions are assigned by an administrator and limited to the courses and sessions selected for you.',
    language: 'Language', access: 'Access status', requestAccess: 'Request access',
    requestIntro: 'Tell our team a little about your teaching or coaching work. Your note is reviewed by an administrator.',
    messageLabel: 'About your work', messageHint: 'Share your discipline, experience, and what you hope to contribute.',
    submit: 'Send access request', submitting: 'Sending request…', requestSent: 'Your request was sent.',
    pendingTitle: 'Under review', pendingText: 'Your request is with the MaydanGo team. You will see the decision here.',
    approvedTitle: 'Access approved', approvedText: 'Your access is limited to the items assigned below. You cannot view or manage other courses or sessions.',
    rejectedTitle: 'Request not approved', rejectedText: 'The team has reviewed your request. You can contact support if you would like clarification.',
    reason: 'Decision note', assignedCourses: 'Assigned courses', upcoming: 'Your upcoming sessions',
    noCourses: 'No courses have been assigned yet.', noSessions: 'No future sessions have been assigned.',
    summary: 'Course summary', instructor: 'Instructor', courseDetails: 'Course details',
    category: 'Category', level: 'Level', duration: 'minutes', published: 'Published', unpublished: 'Not published',
    location: 'Location', session: 'Session', event: 'Event', coach: 'Coaching', starts: 'Starts', ends: 'Ends',
    helpTitle: 'Speak with MaydanGo', helpText: 'Use the support panel for questions about instructor access or your assigned work.',
    supportAfterApproval: 'Instructor-team chat becomes available after your access is approved.',
    supportNew: 'New conversation', supportSubject: 'Subject', supportMessage: 'Message',
    supportStart: 'Start conversation', supportSend: 'Send message', supportSending: 'Sending…',
    supportSubjectHint: 'A short subject for your conversation', supportMessageHint: 'Tell the instructor team how they can help.',
    supportEmpty: 'No conversations yet. Start one to speak with the instructor team.',
    supportChoose: 'Choose a conversation to read and reply.',
    supportLoading: 'Loading conversations…', supportLoadError: 'Conversations could not be loaded.',
    supportThreadError: 'This conversation could not be loaded.',
    supportCreated: 'Your message was sent to the instructor team.',
    supportReplied: 'Your reply was sent.',
    supportRetry: 'Retry', supportYou: 'You', supportTeam: 'Instructor team',
    supportStatusOpen: 'Open', supportStatusProgress: 'In progress', supportStatusWaiting: 'Waiting for you',
    supportStatusResolved: 'Resolved', supportStatusClosed: 'Closed',
    supportValidation: 'Enter a subject of at least 4 characters and a message of at least 10 characters.',
    supportReplyValidation: 'Write a reply before sending.',
    supportFailure: 'The message could not be sent. Please try again.',
    loading: 'Loading your instructor workspace…', errorTitle: 'We could not load your access details.',
    retry: 'Try again', signIn: 'Sign in to continue', signedOut: 'You need to be signed in to view instructor access.',
    requestRequired: 'Please write at least 10 characters about your work.', genericFailure: 'The request could not be completed. Please try again.',
    adminEyebrow: 'MAYDANGO · ADMINISTRATION', adminTitle: 'Instructor access review',
    adminIntro: 'Review each request and assign only the courses and future sessions this instructor should be able to access.',
    adminQueue: 'Requests', pending: 'Pending', approved: 'Approved', rejected: 'Declined', submitted: 'Submitted',
    requestMessage: 'Instructor note', review: 'Review request', chooseRequest: 'Select a request to review.',
    assignCourses: 'Assign published courses', assignSessions: 'Assign future sessions',
    noCoursesAvailable: 'No published courses are available to assign.',
    noOfferingsAvailable: 'No future sessions are available to assign.',
    approve: 'Approve selected access', approving: 'Saving approval…',
    decline: 'Decline request', declining: 'Saving decision…', declineReason: 'Reason for declining',
    declineHint: 'Share a clear reason with the instructor (at least 5 characters).',
    approveSuccess: 'Access approved and assignments saved.', rejectSuccess: 'Request declined and reason saved.',
    selectAssignment: 'Choose any courses or sessions to assign. Nothing is shared beyond these selections.',
    emptyQueue: 'There are no instructor requests to review.',
    adminLoading: 'Loading instructor requests…', adminError: 'Instructor requests could not be loaded.',
    deniedTitle: 'Administrator access required',
    deniedText: 'This account is not authorized to review instructor access. The administrator permission is checked by MaydanGo’s server.',
    adminErrorGeneric: 'The request could not be completed. Please check the details and try again.',
    selectFirst: 'Choose a request from the list to see its details.',
  },
  ar: {
    eyebrow: 'مايدان جو · صلاحية المدرّب', title: 'قدّم ما تعلّمه بطريقتك.',
    intro: 'اطلب صلاحية المدرّب في مساحة MaydanGo. يحدد المدير الصلاحيات، وتقتصر على الدورات والجلسات التي يخصصها لك.',
    language: 'اللغة', access: 'حالة الصلاحية', requestAccess: 'طلب صلاحية',
    requestIntro: 'أخبر فريقنا قليلاً عن عملك في التدريب أو التعليم. يراجع المدير رسالتك.',
    messageLabel: 'نبذة عن عملك', messageHint: 'اذكر تخصصك وخبرتك وما ترغب في تقديمه.',
    submit: 'إرسال طلب الصلاحية', submitting: 'جارٍ إرسال الطلب…', requestSent: 'تم إرسال طلبك.',
    pendingTitle: 'قيد المراجعة', pendingText: 'يراجع فريق MaydanGo طلبك. ستظهر النتيجة هنا.',
    approvedTitle: 'تمت الموافقة على الصلاحية', approvedText: 'تقتصر صلاحيتك على العناصر المخصصة أدناه. لا يمكنك الاطلاع على دورات أو جلسات أخرى أو إدارتها.',
    rejectedTitle: 'لم تتم الموافقة على الطلب', rejectedText: 'راجع الفريق طلبك. يمكنك التواصل مع الدعم إذا رغبت في توضيح.',
    reason: 'ملاحظة القرار', assignedCourses: 'الدورات المخصصة', upcoming: 'جلساتك القادمة',
    noCourses: 'لم يتم تخصيص دورات بعد.', noSessions: 'لم يتم تخصيص جلسات مستقبلية.',
    summary: 'ملخص الدورة', instructor: 'المدرّب', courseDetails: 'تفاصيل الدورة',
    category: 'الفئة', level: 'المستوى', duration: 'دقيقة', published: 'منشورة', unpublished: 'غير منشورة',
    location: 'الموقع', session: 'جلسة', event: 'فعالية', coach: 'تدريب', starts: 'تبدأ', ends: 'تنتهي',
    helpTitle: 'تواصل مع MaydanGo', helpText: 'استخدم لوحة الدعم للاستفسار عن صلاحية المدرّب أو العمل المخصص لك.',
    supportAfterApproval: 'تتوفر محادثة فريق المدرّبين بعد الموافقة على صلاحيتك.',
    supportNew: 'محادثة جديدة', supportSubject: 'الموضوع', supportMessage: 'الرسالة',
    supportStart: 'بدء المحادثة', supportSend: 'إرسال الرسالة', supportSending: 'جارٍ الإرسال…',
    supportSubjectHint: 'عنوان قصير للمحادثة', supportMessageHint: 'أخبر فريق المدرّبين كيف يمكنهم مساعدتك.',
    supportEmpty: 'لا توجد محادثات بعد. ابدأ محادثة للتواصل مع فريق المدرّبين.',
    supportChoose: 'اختر محادثة لقراءتها والرد عليها.',
    supportLoading: 'جارٍ تحميل المحادثات…', supportLoadError: 'تعذر تحميل المحادثات.',
    supportThreadError: 'تعذر تحميل هذه المحادثة.',
    supportCreated: 'تم إرسال رسالتك إلى فريق المدرّبين.',
    supportReplied: 'تم إرسال ردك.',
    supportRetry: 'أعد المحاولة', supportYou: 'أنت', supportTeam: 'فريق المدرّبين',
    supportStatusOpen: 'مفتوح', supportStatusProgress: 'قيد المعالجة', supportStatusWaiting: 'بانتظار ردك',
    supportStatusResolved: 'تم الحل', supportStatusClosed: 'مغلق',
    supportValidation: 'أدخل موضوعاً من 4 أحرف على الأقل ورسالة من 10 أحرف على الأقل.',
    supportReplyValidation: 'اكتب رداً قبل الإرسال.',
    supportFailure: 'تعذر إرسال الرسالة. حاول مرة أخرى.',
    loading: 'جارٍ تحميل مساحة المدرّب…', errorTitle: 'تعذر تحميل تفاصيل صلاحيتك.',
    retry: 'أعد المحاولة', signIn: 'سجّل الدخول للمتابعة', signedOut: 'يجب تسجيل الدخول لعرض صلاحية المدرّب.',
    requestRequired: 'يرجى كتابة 10 أحرف على الأقل عن عملك.', genericFailure: 'تعذر إكمال الطلب. حاول مرة أخرى.',
    adminEyebrow: 'مايدان جو · الإدارة', adminTitle: 'مراجعة صلاحية المدرّبين',
    adminIntro: 'راجع كل طلب وخصص فقط الدورات والجلسات المستقبلية التي ينبغي للمدرّب الوصول إليها.',
    adminQueue: 'الطلبات', pending: 'قيد الانتظار', approved: 'تمت الموافقة', rejected: 'مرفوض', submitted: 'تاريخ الإرسال',
    requestMessage: 'رسالة المدرّب', review: 'مراجعة الطلب', chooseRequest: 'اختر طلباً لمراجعته.',
    assignCourses: 'تخصيص الدورات المنشورة', assignSessions: 'تخصيص الجلسات المستقبلية',
    noCoursesAvailable: 'لا توجد دورات منشورة متاحة للتخصيص.',
    noOfferingsAvailable: 'لا توجد جلسات مستقبلية متاحة للتخصيص.',
    approve: 'الموافقة على الصلاحيات المحددة', approving: 'جارٍ حفظ الموافقة…',
    decline: 'رفض الطلب', declining: 'جارٍ حفظ القرار…', declineReason: 'سبب الرفض',
    declineHint: 'اكتب سبباً واضحاً للمدرّب (5 أحرف على الأقل).',
    approveSuccess: 'تمت الموافقة على الصلاحية وحفظ التخصيصات.', rejectSuccess: 'تم رفض الطلب وحفظ السبب.',
    selectAssignment: 'اختر الدورات أو الجلسات التي تريد تخصيصها. لن تتم مشاركة أي عناصر أخرى.',
    emptyQueue: 'لا توجد طلبات مدرّبين للمراجعة.',
    adminLoading: 'جارٍ تحميل طلبات المدرّبين…', adminError: 'تعذر تحميل طلبات المدرّبين.',
    deniedTitle: 'صلاحية المدير مطلوبة',
    deniedText: 'هذا الحساب غير مخوّل لمراجعة صلاحيات المدرّبين. يتحقق خادم MaydanGo من صلاحية المدير.',
    adminErrorGeneric: 'تعذر إكمال الطلب. راجع التفاصيل وحاول مرة أخرى.',
    selectFirst: 'اختر طلباً من القائمة لعرض تفاصيله.',
  },
  ku: {
    eyebrow: 'مەیدانگۆ · دەسەڵاتی ڕاهێنەر', title: 'ئەوەی فێری دەکەیت بە شێوازی خۆت.',
    intro: 'داوای دەسەڵاتی ڕاهێنەری لە ناوچەی کاری MaydanGo بکە. بەڕێوەبەر دەسەڵاتەکان دیاری دەکات و تەنها بۆ ئەو کۆرس و وانانە دەبێت کە بۆت دیاری کراون.',
    language: 'زمان', access: 'دۆخی دەسەڵات', requestAccess: 'داوای دەسەڵات',
    requestIntro: 'کەمێک باسی کاری ڕاهێنان یان وانەوتنەوەت بۆ تیمەکەمان بکە. بەڕێوەبەر پەیامەکەت پێداچوونەوەی بۆ دەکات.',
    messageLabel: 'دەربارەی کارت', messageHint: 'پسپۆڕی، ئەزموون و ئەوەی دەتەوێت پێشکەشی بکەیت باس بکە.',
    submit: 'ناردنی داوای دەسەڵات', submitting: 'داواکە دەنێردرێت…', requestSent: 'داواکەت نێردرا.',
    pendingTitle: 'لە ژێر پێداچوونەوەدایە', pendingText: 'تیمی MaydanGo داواکەت دەبینێت. بڕیارەکە لێرە دەردەکەوێت.',
    approvedTitle: 'دەسەڵات پەسەند کرا', approvedText: 'دەسەڵاتت تەنها بۆ ئەو بابەتانەیە کە لە خوارەوە دیاریکراون. ناتوانیت کۆرس یان وانەی تر ببینیت یان بەڕێوەیان ببەیت.',
    rejectedTitle: 'داواکە پەسەند نەکرا', rejectedText: 'تیمەکە داواکەی پێداچوونەوە کرد. ئەگەر ڕوونکردنەوەت دەوێت دەتوانیت پەیوەندی بە پاڵپشتییەوە بکەیت.',
    reason: 'تێبینی بڕیار', assignedCourses: 'کۆرسە دیاریکراوەکان', upcoming: 'وانەکانی داهاتووت',
    noCourses: 'هێشتا هیچ کۆرسێکت بۆ دیاری نەکراوە.', noSessions: 'هێشتا هیچ وانەیەکی داهاتووت بۆ دیاری نەکراوە.',
    summary: 'پوختەی کۆرس', instructor: 'ڕاهێنەر', courseDetails: 'وردەکاری کۆرس',
    category: 'پۆل', level: 'ئاست', duration: 'خولەک', published: 'بڵاوکراوەتەوە', unpublished: 'بڵاونەکراوەتەوە',
    location: 'شوێن', session: 'وانە', event: 'بۆنە', coach: 'ڕاهێنان', starts: 'دەست پێدەکات', ends: 'کۆتایی دێت',
    helpTitle: 'پەیوەندی بە MaydanGo بکە', helpText: 'بۆ پرسیار دەربارەی دەسەڵاتی ڕاهێنەر یان کاری دیاریکراوت، پانێڵی پاڵپشتی بەکاربهێنە.',
    supportAfterApproval: 'گفتوگۆ لەگەڵ تیمی ڕاهێنەران دوای پەسەندکردنی دەسەڵاتەکەت بەردەست دەبێت.',
    supportNew: 'گفتوگۆی نوێ', supportSubject: 'بابەت', supportMessage: 'پەیام',
    supportStart: 'دەستپێکردنی گفتوگۆ', supportSend: 'ناردنی پەیام', supportSending: 'پەیام دەنێردرێت…',
    supportSubjectHint: 'ناونیشانێکی کورت بۆ گفتوگۆکەت', supportMessageHint: 'بە تیمی ڕاهێنەران بڵێ چۆن یارمەتیت بدەن.',
    supportEmpty: 'هێشتا هیچ گفتوگۆیەک نییە. گفتوگۆیەک دەست پێ بکە بۆ پەیوەندی بە تیمی ڕاهێنەران.',
    supportChoose: 'گفتوگۆیەک هەڵبژێرە بۆ خوێندنەوە و وەڵامدانەوە.',
    supportLoading: 'گفتوگۆکان بار دەکرێن…', supportLoadError: 'نەتوانرا گفتوگۆکان بار بکرێن.',
    supportThreadError: 'نەتوانرا ئەم گفتوگۆیە بار بکرێت.',
    supportCreated: 'پەیامەکەت بۆ تیمی ڕاهێنەران نێردرا.',
    supportReplied: 'وەڵامەکەت نێردرا.',
    supportRetry: 'هەوڵدانەوە', supportYou: 'تۆ', supportTeam: 'تیمی ڕاهێنەران',
    supportStatusOpen: 'کراوە', supportStatusProgress: 'لە پڕۆسەدایە', supportStatusWaiting: 'چاوەڕوانی وەڵامی تۆیە',
    supportStatusResolved: 'چارەسەرکرا', supportStatusClosed: 'داخراوە',
    supportValidation: 'بابەتێک بە لانیکەم ٤ پیت و پەیامێک بە لانیکەم ١٠ پیت بنووسە.',
    supportReplyValidation: 'پێش ناردن وەڵامێک بنووسە.',
    supportFailure: 'نەتوانرا پەیامەکە بنێردرێت. تکایە دووبارە هەوڵ بدەوە.',
    loading: 'ناوچەی کاری ڕاهێنەر بار دەکرێت…', errorTitle: 'نەتوانرا وردەکاری دەسەڵاتەکەت بار بکرێت.',
    retry: 'هەوڵدانەوە', signIn: 'بۆ بەردەوامبوون بچۆ ژوورەوە', signedOut: 'بۆ بینینی دەسەڵاتی ڕاهێنەر دەبێت بچیتە ژوورەوە.',
    requestRequired: 'تکایە لانیکەم ١٠ پیت دەربارەی کارت بنووسە.', genericFailure: 'تەواوکردنی داواکە نەکرا. تکایە دووبارە هەوڵ بدەوە.',
    adminEyebrow: 'مەیدانگۆ · بەڕێوەبەرایەتی', adminTitle: 'پێداچوونەوەی دەسەڵاتی ڕاهێنەران',
    adminIntro: 'هەر داواکارییەک بپشکنە و تەنها ئەو کۆرس و وانە داهاتووانە دیاری بکە کە ڕاهێنەر دەبێت دەستی پێیان بگات.',
    adminQueue: 'داواکارییەکان', pending: 'چاوەڕوان', approved: 'پەسەندکراو', rejected: 'ڕەتکراوەتەوە', submitted: 'نێردراوە',
    requestMessage: 'پەیامی ڕاهێنەر', review: 'پێداچوونەوەی داواکاری', chooseRequest: 'داواکارییەک هەڵبژێرە بۆ پێداچوونەوە.',
    assignCourses: 'دیاریکردنی کۆرسە بڵاوکراوەکان', assignSessions: 'دیاریکردنی وانە داهاتووەکان',
    noCoursesAvailable: 'هیچ کۆرسێکی بڵاوکراوە بۆ دیاریکردن نییە.',
    noOfferingsAvailable: 'هیچ وانەیەکی داهاتوو بۆ دیاریکردن نییە.',
    approve: 'پەسەندکردنی دەسەڵاتی دیاریکراو', approving: 'پەسەندکردن پاشەکەوت دەکرێت…',
    decline: 'ڕەتکردنەوەی داواکاری', declining: 'بڕیار پاشەکەوت دەکرێت…', declineReason: 'هۆکاری ڕەتکردنەوە',
    declineHint: 'هۆکارێکی ڕوون بۆ ڕاهێنەر بنووسە (لانیکەم ٥ پیت).',
    approveSuccess: 'دەسەڵات پەسەند کرا و دیاریکردنەکان پاشەکەوت کران.', rejectSuccess: 'داواکارییەکە ڕەتکرایەوە و هۆکارەکە پاشەکەوت کرا.',
    selectAssignment: 'هەر کۆرس یان وانەیەک هەڵبژێرە کە دەتەوێت دیاری بکرێت. هیچ شتێکی تر هاوبەش ناکرێت.',
    emptyQueue: 'هیچ داواکارییەکی ڕاهێنەر بۆ پێداچوونەوە نییە.',
    adminLoading: 'داواکارییەکانی ڕاهێنەران بار دەکرێن…', adminError: 'نەتوانرا داواکارییەکانی ڕاهێنەران بار بکرێن.',
    deniedTitle: 'دەسەڵاتی بەڕێوەبەر پێویستە',
    deniedText: 'ئەم هەژمارە ڕێگەی پێنەدراوە بۆ پێداچوونەوەی دەسەڵاتی ڕاهێنەران. سێرڤەری MaydanGo دەسەڵاتی بەڕێوەبەر دەپشکنێت.',
    adminErrorGeneric: 'تەواوکردنی داواکە نەکرا. وردەکارییەکان بپشکنە و دووبارە هەوڵ بدەوە.',
    selectFirst: 'داواکارییەک لە لیستەکە هەڵبژێرە بۆ بینینی وردەکارییەکانی.',
  },
} satisfies Record<Language, Record<string, string>>;

const t = (lang: Language, key: CopyKey) => copy[lang][key];
const languageDirection = (lang: Language) => lang === 'en' ? 'ltr' : 'rtl';
const locale = (lang: Language) => lang === 'en' ? 'en-IQ' : lang === 'ar' ? 'ar-IQ' : 'ckb-IQ';
const savedLanguage = (): Language => {
  if (typeof window === 'undefined') return 'en';
  const value = window.localStorage.getItem('maydango-partner-language');
  return value === 'ar' || value === 'ku' ? value : 'en';
};
const localized = (value: { en: string; ar: string; ku: string } | null | undefined, lang: Language, fallback = '') =>
  value?.[lang] || value?.en || fallback;
const dateText = (value: string, lang: Language) =>
  new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad', numberingSystem: 'latn' }).format(new Date(value));
const errorStatus = (error: unknown) => {
  if (!error || typeof error !== 'object') return undefined;
  const source = error as { status?: unknown; response?: { status?: unknown }; statusCode?: unknown };
  return source.status ?? source.statusCode ?? source.response?.status;
};

function LanguagePicker({ lang, onChange }: { lang: Language; onChange: (lang: Language) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-[#60756b]">
      <span>{t(lang, 'language')}</span>
      <select
        data-testid="select-language"
        aria-label={t(lang, 'language')}
        value={lang}
        onChange={event => onChange(event.target.value as Language)}
        className="rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-sm text-[#173d35]"
      >
        <option value="en">English</option>
        <option value="ar">العربية</option>
        <option value="ku">کوردی</option>
      </select>
    </label>
  );
}

function AccessPageFrame({ lang, onLanguage, admin = false, children }: {
  lang: Language; onLanguage: (lang: Language) => void; admin?: boolean; children: ReactNode;
}) {
  return (
    <main dir={languageDirection(lang)} className="min-h-[100dvh] bg-[#f4f1e7] px-4 py-7 text-[#173d35] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[#d8d2c4] pb-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#174d43] text-[#fff9e9]"><Dumbbell size={19} aria-hidden="true" /></span>
            <span className="font-display text-lg font-extrabold tracking-tight">MaydanGo</span>
          </div>
          <LanguagePicker lang={lang} onChange={onLanguage} />
        </header>
        <div className="mb-8 max-w-3xl">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[.19em] text-[#a05b3e]" data-testid={admin ? 'text-admin-eyebrow' : 'text-portal-eyebrow'}>
            {t(lang, admin ? 'adminEyebrow' : 'eyebrow')}
          </p>
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl" data-testid={admin ? 'text-admin-title' : 'text-portal-title'}>
            {t(lang, admin ? 'adminTitle' : 'title')}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#536b61] sm:text-base" data-testid={admin ? 'text-admin-intro' : 'text-portal-intro'}>
            {t(lang, admin ? 'adminIntro' : 'intro')}
          </p>
        </div>
        {children}
        <footer className="mt-12 border-t border-[#d8d2c4] pt-5 text-xs font-medium tracking-wide text-[#718077]">
          IRAQ · KURDISTAN · WEST · SOUTH
        </footer>
      </div>
    </main>
  );
}

function Notice({ tone, title, children, testId }: { tone: 'info' | 'success' | 'error'; title: string; children?: ReactNode; testId: string }) {
  const colors = tone === 'error'
    ? 'border-[#e4c3b7] bg-[#fff5f1] text-[#8f352a]'
    : tone === 'success'
      ? 'border-[#c8dec9] bg-[#eef5eb] text-[#2d6d4a]'
      : 'border-[#d8d2c4] bg-[#fffdf7] text-[#36564b]';
  const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? Check : ShieldCheck;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} data-testid={testId} className={`flex gap-3 rounded-2xl border p-4 ${colors}`}>
      <Icon className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
      <div><p className="text-sm font-bold">{title}</p>{children && <div className="mt-1 text-sm leading-6 opacity-90">{children}</div>}</div>
    </div>
  );
}

function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Loading">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-[#e7e2d5]" />)}
  </div>;
}

function InstructorSupportPanel({ lang }: { lang: Language }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const tickets = useGetInstructorSupportTickets({
    query: { queryKey: getGetInstructorSupportTicketsQueryKey(), retry: false },
  });
  const conversation = useGetInstructorSupportTicket(selectedId, {
    query: { enabled: !!selectedId, queryKey: getGetInstructorSupportTicketQueryKey(selectedId), retry: false },
  });
  const createTicket = useCreateInstructorSupportTicket();
  const replyTicket = useReplyInstructorSupportTicket();

  const startNew = () => {
    setIsCreating(true);
    setSelectedId('');
    setNotice('');
    setFormError('');
  };
  const createConversation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    if (subject.trim().length < 4 || message.trim().length < 10) {
      setFormError(t(lang, 'supportValidation'));
      return;
    }
    createTicket.mutate({
      data: { subject: subject.trim(), message: message.trim(), language: lang },
    }, {
      onSuccess: created => {
        setSubject('');
        setMessage('');
        setIsCreating(false);
        setSelectedId(created.id);
        setNotice(t(lang, 'supportCreated'));
        void queryClient.invalidateQueries({ queryKey: getGetInstructorSupportTicketsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetInstructorSupportTicketQueryKey(created.id) });
      },
      onError: () => setFormError(t(lang, 'supportFailure')),
    });
  };
  const sendReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    if (!reply.trim()) {
      setFormError(t(lang, 'supportReplyValidation'));
      return;
    }
    replyTicket.mutate({
      id: selectedId,
      data: { message: reply.trim(), language: lang },
    }, {
      onSuccess: updated => {
        setReply('');
        setNotice(t(lang, 'supportReplied'));
        void queryClient.invalidateQueries({ queryKey: getGetInstructorSupportTicketsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetInstructorSupportTicketQueryKey(updated.id) });
      },
      onError: () => setFormError(t(lang, 'supportFailure')),
    });
  };
  const statusCopy = (status: string) => {
    if (status === 'in_progress') return t(lang, 'supportStatusProgress');
    if (status === 'waiting_member') return t(lang, 'supportStatusWaiting');
    if (status === 'resolved') return t(lang, 'supportStatusResolved');
    if (status === 'closed') return t(lang, 'supportStatusClosed');
    return t(lang, 'supportStatusOpen');
  };

  return (
    <section data-testid="panel-instructor-support" className="overflow-hidden rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3dfd3] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9e5d7] text-[#174d43]"><MessageCircle size={17} aria-hidden="true" /></span>
          <div><h2 className="font-display text-lg font-bold">{t(lang, 'helpTitle')}</h2><p className="mt-0.5 text-xs leading-5 text-[#718077]">{t(lang, 'helpText')}</p></div>
        </div>
        {!isCreating && (
          <button data-testid="button-new-instructor-support" onClick={startNew} className="inline-flex items-center gap-1.5 rounded-full border border-[#174d43] px-3.5 py-2 text-xs font-bold text-[#174d43] hover:bg-[#edf3ec]">
            <Plus size={14} aria-hidden="true" /> {t(lang, 'supportNew')}
          </button>
        )}
      </div>
      <div className="p-4 sm:p-5">
        {notice && <div className="mb-4"><Notice tone="success" title={notice} testId="status-instructor-support-success" /></div>}
        {formError && <p role="alert" data-testid="status-instructor-support-error" className="mb-4 rounded-xl bg-[#fff5f1] px-3 py-2 text-xs leading-5 text-[#9a4435]">{formError}</p>}
        {tickets.isLoading ? (
          <div data-testid="loading-instructor-support" className="space-y-2"><div className="h-12 animate-pulse rounded-xl bg-[#e7e2d5]" /><div className="h-20 animate-pulse rounded-xl bg-[#e7e2d5]" /></div>
        ) : tickets.isError ? (
          <div className="rounded-2xl border border-[#e4c3b7] bg-[#fff5f1] p-4">
            <p className="text-sm font-bold text-[#8f352a]" data-testid="status-instructor-support-load-error">{t(lang, 'supportLoadError')}</p>
            <button data-testid="button-retry-instructor-support" onClick={() => void tickets.refetch()} className="mt-2 text-xs font-bold text-[#8f352a] underline underline-offset-4">{t(lang, 'supportRetry')}</button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(190px,.75fr)_minmax(0,1.5fr)]">
            <nav aria-label={t(lang, 'helpTitle')} className="space-y-2">
              {!tickets.data?.length && !isCreating ? (
                <div data-testid="empty-instructor-support" className="rounded-2xl border border-dashed border-[#d8d2c4] p-4 text-xs leading-5 text-[#718077]">{t(lang, 'supportEmpty')}</div>
              ) : tickets.data?.map(ticket => (
                <button key={ticket.id} data-testid={`button-instructor-support-ticket-${ticket.id}`} onClick={() => { setSelectedId(ticket.id); setIsCreating(false); setFormError(''); setNotice(''); }} aria-pressed={selectedId === ticket.id && !isCreating} className={`w-full rounded-xl border p-3 text-start ${selectedId === ticket.id && !isCreating ? 'border-[#174d43] bg-[#edf3ec]' : 'border-[#e3dfd3] bg-[#faf8f0] hover:border-[#b9c8bc]'}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold" data-testid={`text-instructor-support-subject-${ticket.id}`}>{ticket.subject}</span>
                    <span data-testid={`status-instructor-support-ticket-${ticket.id}`} className="shrink-0 rounded-full bg-[#e9e5d7] px-2 py-1 text-[9px] font-bold text-[#536b61]">{statusCopy(ticket.status)}</span>
                  </span>
                  <span className="mt-1 block text-[10px] text-[#718077]">{dateText(ticket.updatedAt, lang)}</span>
                </button>
              ))}
            </nav>

            <div className="min-w-0">
              {isCreating ? (
                <form data-testid="form-instructor-support-create" onSubmit={createConversation} className="rounded-2xl border border-[#e3dfd3] bg-[#faf8f0] p-4">
                  <h3 className="font-display text-base font-bold">{t(lang, 'supportNew')}</h3>
                  <label htmlFor="instructor-support-subject" className="mb-1.5 mt-4 block text-xs font-bold">{t(lang, 'supportSubject')}</label>
                  <input id="instructor-support-subject" data-testid="input-instructor-support-subject" value={subject} onChange={event => setSubject(event.target.value)} minLength={4} maxLength={100} required placeholder={t(lang, 'supportSubjectHint')} className="w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm" />
                  <label htmlFor="instructor-support-message" className="mb-1.5 mt-3 block text-xs font-bold">{t(lang, 'supportMessage')}</label>
                  <textarea id="instructor-support-message" data-testid="input-instructor-support-message" value={message} onChange={event => setMessage(event.target.value)} minLength={10} maxLength={5000} required rows={4} placeholder={t(lang, 'supportMessageHint')} className="w-full resize-y rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm leading-6" />
                  <button data-testid="button-create-instructor-support" type="submit" disabled={createTicket.isPending} className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#174d43] px-4 py-2.5 text-xs font-bold text-[#fff9e9] disabled:opacity-60">
                    <Send size={13} aria-hidden="true" />{createTicket.isPending ? t(lang, 'supportSending') : t(lang, 'supportStart')}
                  </button>
                </form>
              ) : selectedId ? (
                conversation.isLoading ? <div data-testid="loading-instructor-support-thread" className="space-y-2"><div className="h-8 w-2/3 animate-pulse rounded-xl bg-[#e7e2d5]" /><div className="h-24 animate-pulse rounded-xl bg-[#e7e2d5]" /></div> :
                conversation.isError ? <div className="rounded-2xl border border-[#e4c3b7] bg-[#fff5f1] p-4"><p className="text-sm font-bold text-[#8f352a]" data-testid="status-instructor-support-thread-error">{t(lang, 'supportThreadError')}</p><button data-testid="button-retry-instructor-support-thread" onClick={() => void conversation.refetch()} className="mt-2 text-xs font-bold text-[#8f352a] underline underline-offset-4">{t(lang, 'supportRetry')}</button></div> :
                conversation.data ? (
                  <div data-testid={`thread-instructor-support-${selectedId}`} className="rounded-2xl border border-[#e3dfd3] bg-[#faf8f0] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#e3dfd3] pb-3">
                      <div><h3 className="font-bold" data-testid={`text-instructor-support-thread-title-${selectedId}`}>{conversation.data.subject}</h3><p className="mt-1 text-[10px] text-[#718077]">{dateText(conversation.data.createdAt, lang)}</p></div>
                      <span className="rounded-full bg-[#e9e5d7] px-2.5 py-1 text-[10px] font-bold text-[#536b61]" data-testid={`status-instructor-support-thread-${selectedId}`}>{statusCopy(conversation.data.status)}</span>
                    </div>
                    <div className="max-h-80 space-y-3 overflow-y-auto py-4">
                      {conversation.data.messages.map(messageItem => {
                        const isTeam = messageItem.authorRole !== 'member';
                        return <article key={messageItem.id} data-testid={`message-instructor-support-${messageItem.id}`} className={`max-w-[92%] rounded-2xl p-3 text-sm leading-6 ${isTeam ? 'me-auto border border-[#d8d2c4] bg-[#fffdf7]' : 'ms-auto bg-[#174d43] text-[#fff9e9]'}`}>
                          <p className="mb-1 text-[10px] font-bold opacity-75">{isTeam ? t(lang, 'supportTeam') : t(lang, 'supportYou')} · {dateText(messageItem.createdAt, lang)}</p>
                          <p dir="auto" className="whitespace-pre-wrap">{messageItem.message}</p>
                        </article>;
                      })}
                    </div>
                    <form onSubmit={sendReply} className="border-t border-[#e3dfd3] pt-3">
                      <label htmlFor="instructor-support-reply" className="mb-1.5 block text-xs font-bold">{t(lang, 'supportMessage')}</label>
                      <textarea id="instructor-support-reply" data-testid="input-instructor-support-reply" value={reply} onChange={event => setReply(event.target.value)} maxLength={5000} required rows={3} placeholder={t(lang, 'supportMessageHint')} className="w-full resize-y rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm leading-6" />
                      <button data-testid="button-reply-instructor-support" type="submit" disabled={replyTicket.isPending || !reply.trim()} className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#174d43] px-4 py-2.5 text-xs font-bold text-[#fff9e9] disabled:opacity-50"><Send size={13} aria-hidden="true" />{replyTicket.isPending ? t(lang, 'supportSending') : t(lang, 'supportSend')}</button>
                    </form>
                  </div>
                ) : null
              ) : (
                <div data-testid="empty-selected-instructor-support" className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-[#d8d2c4] px-4 text-center text-xs leading-5 text-[#718077]">{t(lang, 'supportChoose')}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function InstructorPortalPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [lang, setLang] = useState<Language>(savedLanguage);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const portal = useGetInstructorPortal({
    query: { enabled: isLoaded && !!isSignedIn, queryKey: getGetInstructorPortalQueryKey(), retry: false },
  });
  const submitRequest = useSubmitInstructorAccessRequest();

  const changeLanguage = (next: Language) => {
    setLang(next);
    window.localStorage.setItem('maydango-partner-language', next);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('');
    setFormError('');
    if (message.trim().length < 10) {
      setFormError(t(lang, 'requestRequired'));
      return;
    }
    submitRequest.mutate({ data: { message: message.trim() } }, {
      onSuccess: () => {
        setNotice(t(lang, 'requestSent'));
        setMessage('');
        void queryClient.invalidateQueries({ queryKey: getGetInstructorPortalQueryKey() });
      },
      onError: () => setFormError(t(lang, 'genericFailure')),
    });
  };

  if (!isLoaded) return <AccessPageFrame lang={lang} onLanguage={changeLanguage}><Skeleton rows={4} /></AccessPageFrame>;
  if (!isSignedIn) return (
    <AccessPageFrame lang={lang} onLanguage={changeLanguage}>
      <section className="max-w-xl rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-6 shadow-sm sm:p-8">
        <Notice tone="info" title={t(lang, 'signedOut')} testId="status-instructor-signin-required" />
        <Link href="/sign-in?redirect_url=%2Finstructor-portal" data-testid="link-instructor-signin" className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9] hover:bg-[#226556]">
          {t(lang, 'signIn')} <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </AccessPageFrame>
  );

  return (
    <AccessPageFrame lang={lang} onLanguage={changeLanguage}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <section className="space-y-5">
          {portal.isLoading ? <Skeleton rows={4} /> : portal.isError ? (
            <section className="rounded-3xl border border-[#e4c3b7] bg-[#fffdf7] p-6">
              <Notice tone="error" title={t(lang, 'errorTitle')} testId="status-instructor-load-error">
                <button data-testid="button-retry-instructor-portal" onClick={() => void portal.refetch()} className="mt-2 font-bold underline underline-offset-4">{t(lang, 'retry')}</button>
              </Notice>
            </section>
          ) : portal.data ? (
            <>
              {notice && <Notice tone="success" title={notice} testId="status-instructor-success" />}
              {(portal.data.accessStatus === 'not_requested' || portal.data.accessStatus === 'rejected') && (
                <section className="rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-6 shadow-sm sm:p-8">
                  <div className="mb-5 flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f3eadb] text-[#a05b3e]"><LockKeyhole size={18} aria-hidden="true" /></span>
                    <div><h2 className="font-display text-xl font-bold">{t(lang, 'requestAccess')}</h2><p className="mt-1 text-sm leading-6 text-[#60756b]">{t(lang, 'requestIntro')}</p></div>
                  </div>
                  <form onSubmit={submit}>
                    <label htmlFor="instructor-access-message" className="mb-2 block text-sm font-bold">{t(lang, 'messageLabel')}</label>
                    <p className="mb-2 text-xs text-[#718077]">{t(lang, 'messageHint')}</p>
                    <textarea
                      id="instructor-access-message" data-testid="input-instructor-access-message"
                      value={message} onChange={event => setMessage(event.target.value)}
                      minLength={10} maxLength={1000} required rows={5}
                      className="w-full resize-y rounded-2xl border border-[#d8d2c4] bg-[#fffdf7] px-4 py-3 text-sm leading-6 text-[#173d35] placeholder:text-[#9b9a8b]"
                      placeholder={t(lang, 'messageHint')}
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-[#718077]">
                      {formError ? <span role="alert" data-testid="status-instructor-form-error" className="text-[#9a4435]">{formError}</span> : <span aria-hidden="true">&nbsp;</span>}
                      <span data-testid="text-instructor-message-count">{message.length}/1000</span>
                    </div>
                    <button data-testid="button-submit-instructor-access" type="submit" disabled={submitRequest.isPending} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9] transition hover:bg-[#226556] disabled:cursor-not-allowed disabled:opacity-60">
                      {submitRequest.isPending ? t(lang, 'submitting') : t(lang, 'submit')} <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
                  </form>
                </section>
              )}
              {portal.data.accessStatus === 'pending' && (
                <Notice tone="info" title={t(lang, 'pendingTitle')} testId="status-instructor-pending">
                  {t(lang, 'pendingText')}
                  {portal.data.request?.submittedAt && <p className="mt-2 text-xs">{t(lang, 'submitted')}: {dateText(portal.data.request.submittedAt, lang)}</p>}
                </Notice>
              )}
              {portal.data.accessStatus === 'rejected' && (
                <Notice tone="error" title={t(lang, 'rejectedTitle')} testId="status-instructor-rejected">
                  {t(lang, 'rejectedText')}
                  {portal.data.request?.decisionReason && <p className="mt-2"><strong>{t(lang, 'reason')}:</strong> {portal.data.request.decisionReason}</p>}
                </Notice>
              )}
              {portal.data.accessStatus === 'approved' && (
                <>
                  <Notice tone="success" title={t(lang, 'approvedTitle')} testId="status-instructor-approved">{t(lang, 'approvedText')}</Notice>
                  <section className="rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-6 shadow-sm sm:p-8">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#a05b3e]">{t(lang, 'courseDetails')}</p><h2 className="mt-1 font-display text-2xl font-bold">{t(lang, 'assignedCourses')}</h2></div>
                      <span className="rounded-full bg-[#e9e5d7] px-3 py-1 text-xs font-bold" data-testid="text-assigned-course-count">{portal.data.courses.length}</span>
                    </div>
                    {portal.data.courses.length === 0 ? (
                      <div data-testid="empty-assigned-courses" className="rounded-2xl border border-dashed border-[#d8d2c4] px-4 py-7 text-center text-sm text-[#718077]">{t(lang, 'noCourses')}</div>
                    ) : <div className="space-y-3">
                      {portal.data.courses.map(course => (
                        <article key={course.id} data-testid={`card-assigned-course-${course.id}`} className="rounded-2xl border border-[#e3dfd3] bg-[#faf8f0] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div><h3 className="font-bold" data-testid={`text-course-title-${course.id}`}>{localized(course.localizedTitle, lang, course.title)}</h3><p className="mt-1 text-xs text-[#718077]">{course.category} · {course.level} · {course.durationMinutes} {t(lang, 'duration')}</p></div>
                            <span data-testid={`status-course-published-${course.id}`} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${course.published ? 'bg-[#e1efdf] text-[#2d6d4a]' : 'bg-[#eeeadc] text-[#756e5b]'}`}>{course.published ? t(lang, 'published') : t(lang, 'unpublished')}</span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-[#536b61]">{localized(course.localizedSummary, lang)}</p>
                          <p className="mt-3 text-xs text-[#718077]"><span className="font-semibold">{t(lang, 'instructor')}:</span> {localized(course.localizedInstructor, lang)}</p>
                        </article>
                      ))}
                    </div>}
                  </section>
                  <section className="rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-6 shadow-sm sm:p-8">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#a05b3e]">{t(lang, 'starts')}</p><h2 className="mt-1 font-display text-2xl font-bold">{t(lang, 'upcoming')}</h2></div>
                      <CalendarDays className="text-[#174d43]" size={20} aria-hidden="true" />
                    </div>
                    {portal.data.upcomingSessions.length === 0 ? (
                      <div data-testid="empty-instructor-sessions" className="rounded-2xl border border-dashed border-[#d8d2c4] px-4 py-7 text-center text-sm text-[#718077]">{t(lang, 'noSessions')}</div>
                    ) : <div className="space-y-3">
                      {portal.data.upcomingSessions.map(item => (
                        <article key={item.id} data-testid={`card-instructor-session-${item.id}`} className="grid gap-3 rounded-2xl border border-[#e3dfd3] bg-[#faf8f0] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div><span className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a05b3e]">{t(lang, item.kind === 'event' ? 'event' : item.kind === 'coach' ? 'coach' : 'session')}</span><h3 className="mt-1 font-bold" data-testid={`text-instructor-session-title-${item.id}`}>{localized(item.localizedTitle, lang, item.title)}</h3><p className="mt-1 text-xs text-[#718077]">{item.facility} · {item.city}</p></div>
                          <div className="flex gap-3 text-xs text-[#536b61] sm:block sm:text-end"><p className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden="true" />{dateText(item.startsAt, lang)}</p><p className="mt-1">{t(lang, 'ends')}: {dateText(item.endsAt, lang)}</p></div>
                        </article>
                      ))}
                    </div>}
                  </section>
                </>
              )}
            </>
          ) : null}
        </section>
        <aside className="space-y-4">
          <div className="rounded-3xl border border-[#d8d2c4] bg-[#e9e5d7] p-5">
            <p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#a05b3e]">{t(lang, 'access')}</p>
            <p className="mt-2 font-display text-lg font-bold" data-testid="status-instructor-access">{portal.data ? t(lang, portal.data.accessStatus === 'not_requested' ? 'requestAccess' : portal.data.accessStatus === 'pending' ? 'pendingTitle' : portal.data.accessStatus === 'approved' ? 'approvedTitle' : 'rejectedTitle') : '—'}</p>
            <p className="mt-2 text-xs leading-5 text-[#60756b]">{t(lang, 'intro')}</p>
          </div>
          {portal.data?.accessStatus === 'approved' ? (
            <InstructorSupportPanel lang={lang} />
          ) : (
            <div data-testid="status-instructor-support-unavailable" className="rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e9e5d7] text-[#174d43]"><LockKeyhole size={16} aria-hidden="true" /></span>
                <p className="text-sm leading-6 text-[#60756b]">{t(lang, 'supportAfterApproval')}</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </AccessPageFrame>
  );
}

export function AdminInstructorAccessPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [lang, setLang] = useState<Language>(savedLanguage);
  const [selectedId, setSelectedId] = useState('');
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [offeringIds, setOfferingIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<{ success: boolean; text: string } | null>(null);
  const [formError, setFormError] = useState('');
  const requests = useGetInstructorAccessRequests({
    query: { enabled: isLoaded && !!isSignedIn, queryKey: getGetInstructorAccessRequestsQueryKey(), retry: false },
  });
  const decide = useDecideInstructorAccessRequest();
  const onLanguage = (next: Language) => {
    setLang(next);
    window.localStorage.setItem('maydango-partner-language', next);
  };
  const selected = requests.data?.requests.find(request => request.id === selectedId);
  const futureOfferings = (requests.data?.offerings ?? []).filter(item => new Date(item.startsAt).getTime() > Date.now());
  const availableCourses = (requests.data?.courses ?? []).filter(course => course.published);

  const selectRequest = (id: string) => {
    setSelectedId(id);
    setCourseIds([]);
    setOfferingIds([]);
    setReason('');
    setFormError('');
    setFeedback(null);
  };
  const toggle = (values: string[], setter: (values: string[]) => void, id: string) =>
    setter(values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
  const submitDecision = (decision: 'approve' | 'reject') => {
    if (!selected) return;
    setFormError('');
    setFeedback(null);
    if (decision === 'reject' && reason.trim().length < 5) {
      setFormError(t(lang, 'declineHint'));
      return;
    }
    decide.mutate({
      id: selected.id,
      data: {
        decision,
        courseIds: decision === 'approve' ? courseIds : [],
        offeringIds: decision === 'approve' ? offeringIds : [],
        ...(decision === 'reject' ? { reason: reason.trim() } : {}),
      },
    }, {
      onSuccess: () => {
        setFeedback({ success: true, text: t(lang, decision === 'approve' ? 'approveSuccess' : 'rejectSuccess') });
        setSelectedId('');
        setCourseIds([]);
        setOfferingIds([]);
        setReason('');
        void queryClient.invalidateQueries({ queryKey: getGetInstructorAccessRequestsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetInstructorPortalQueryKey() });
      },
      onError: () => setFormError(t(lang, 'adminErrorGeneric')),
    });
  };

  if (!isLoaded) return <AccessPageFrame admin lang={lang} onLanguage={onLanguage}><Skeleton rows={4} /></AccessPageFrame>;
  if (!isSignedIn) return (
    <AccessPageFrame admin lang={lang} onLanguage={onLanguage}>
      <section className="max-w-xl rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-6">
        <Notice tone="info" title={t(lang, 'signedOut')} testId="status-admin-signin-required" />
        <Link href="/sign-in?redirect_url=%2Fadmin%2Finstructor-access" data-testid="link-admin-signin" className="mt-5 inline-flex rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9]">{t(lang, 'signIn')}</Link>
      </section>
    </AccessPageFrame>
  );
  if (requests.isLoading) return <AccessPageFrame admin lang={lang} onLanguage={onLanguage}><Skeleton rows={5} /></AccessPageFrame>;
  if (requests.isError && errorStatus(requests.error) === 403) return (
    <AccessPageFrame admin lang={lang} onLanguage={onLanguage}>
      <Notice tone="error" title={t(lang, 'deniedTitle')} testId="status-admin-access-denied">{t(lang, 'deniedText')}</Notice>
    </AccessPageFrame>
  );
  if (requests.isError) return (
    <AccessPageFrame admin lang={lang} onLanguage={onLanguage}>
      <Notice tone="error" title={t(lang, 'adminError')} testId="status-admin-load-error">
        <button data-testid="button-retry-admin-requests" onClick={() => void requests.refetch()} className="mt-2 font-bold underline underline-offset-4">{t(lang, 'retry')}</button>
      </Notice>
    </AccessPageFrame>
  );

  return (
    <AccessPageFrame admin lang={lang} onLanguage={onLanguage}>
      <div className="grid gap-6 lg:grid-cols-[minmax(260px,.75fr)_minmax(0,1.4fr)]">
        <section className="overflow-hidden rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] shadow-sm">
          <div className="flex items-center justify-between border-b border-[#e3dfd3] px-5 py-4">
            <h2 className="font-display text-lg font-bold">{t(lang, 'adminQueue')}</h2>
            <span className="rounded-full bg-[#e9e5d7] px-2.5 py-1 text-xs font-bold" data-testid="text-admin-request-count">{requests.data?.requests.length ?? 0}</span>
          </div>
          {!requests.data?.requests.length ? (
            <div data-testid="empty-instructor-requests" className="p-6 text-sm leading-6 text-[#718077]">{t(lang, 'emptyQueue')}</div>
          ) : <div className="max-h-[720px] overflow-y-auto p-3">
            {requests.data.requests.map(request => (
              <button
                key={request.id} type="button" onClick={() => selectRequest(request.id)}
                data-testid={`button-select-instructor-request-${request.id}`}
                aria-pressed={selectedId === request.id}
                className={`mb-2 w-full rounded-2xl border p-4 text-start transition ${selectedId === request.id ? 'border-[#174d43] bg-[#edf3ec]' : 'border-transparent bg-[#faf8f0] hover:border-[#d8d2c4]'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="max-w-[190px] truncate text-sm font-bold" data-testid={`text-instructor-user-${request.id}`}>{request.userId}</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${request.status === 'pending' ? 'bg-[#f8ead2] text-[#8a5b20]' : request.status === 'approved' ? 'bg-[#e1efdf] text-[#2d6d4a]' : 'bg-[#f2dfd5] text-[#9a4435]'}`} data-testid={`status-instructor-request-${request.id}`}>{t(lang, request.status === 'pending' ? 'pending' : request.status === 'approved' ? 'approved' : 'rejected')}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#718077]">{request.message}</p>
                <p className="mt-2 text-[10px] text-[#718077]">{t(lang, 'submitted')}: {dateText(request.submittedAt, lang)}</p>
              </button>
            ))}
          </div>}
        </section>

        <section className="min-w-0 rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-5 shadow-sm sm:p-7">
          {feedback && <div className="mb-5"><Notice tone={feedback.success ? 'success' : 'error'} title={feedback.text} testId="status-admin-decision-feedback" /></div>}
          {!selected ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f3eadb] text-[#a05b3e]"><ShieldCheck size={21} aria-hidden="true" /></span>
              <h2 className="mt-4 font-display text-xl font-bold">{t(lang, 'review')}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#718077]">{t(lang, 'selectFirst')}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e3dfd3] pb-5">
                <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a05b3e]">{t(lang, 'review')}</p><h2 className="mt-1 font-display text-xl font-bold">{selected.userId}</h2><p className="mt-1 text-xs text-[#718077]">{t(lang, 'submitted')}: {dateText(selected.submittedAt, lang)}</p></div>
                <span className="rounded-full bg-[#f8ead2] px-3 py-1.5 text-xs font-bold text-[#8a5b20]" data-testid={`status-selected-request-${selected.id}`}>{t(lang, selected.status === 'pending' ? 'pending' : selected.status === 'approved' ? 'approved' : 'rejected')}</span>
              </div>
              <div className="mt-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#718077]">{t(lang, 'requestMessage')}</p>
                <p data-testid={`text-request-message-${selected.id}`} className="whitespace-pre-wrap rounded-2xl bg-[#f4f1e7] p-4 text-sm leading-7">{selected.message}</p>
              </div>
              {selected.status === 'pending' ? (
                <>
                  <p className="mb-4 mt-6 text-xs leading-5 text-[#718077]" data-testid="text-assignment-permissions-note">{t(lang, 'selectAssignment')}</p>
                  <div className="grid gap-5 xl:grid-cols-2">
                    <fieldset>
                      <legend className="mb-3 text-sm font-bold">{t(lang, 'assignCourses')}</legend>
                      {availableCourses.length === 0 ? <p data-testid="empty-available-courses" className="rounded-xl border border-dashed border-[#d8d2c4] p-4 text-xs leading-5 text-[#718077]">{t(lang, 'noCoursesAvailable')}</p> : <div className="space-y-2">
                        {availableCourses.map(course => (
                          <label key={course.id} data-testid={`option-assign-course-${course.id}`} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e3dfd3] bg-[#faf8f0] p-3 text-sm hover:border-[#174d43]">
                            <input data-testid={`checkbox-assign-course-${course.id}`} type="checkbox" checked={courseIds.includes(course.id)} onChange={() => toggle(courseIds, setCourseIds, course.id)} className="mt-1 accent-[#174d43]" />
                            <span><span className="block font-semibold">{localized(course.localizedTitle, lang, course.title)}</span><span className="mt-1 block text-xs text-[#718077]">{course.category}</span></span>
                          </label>
                        ))}
                      </div>}
                    </fieldset>
                    <fieldset>
                      <legend className="mb-3 text-sm font-bold">{t(lang, 'assignSessions')}</legend>
                      {futureOfferings.length === 0 ? <p data-testid="empty-available-sessions" className="rounded-xl border border-dashed border-[#d8d2c4] p-4 text-xs leading-5 text-[#718077]">{t(lang, 'noOfferingsAvailable')}</p> : <div className="max-h-80 space-y-2 overflow-y-auto">
                        {futureOfferings.map(item => (
                          <label key={item.id} data-testid={`option-assign-session-${item.id}`} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e3dfd3] bg-[#faf8f0] p-3 text-sm hover:border-[#174d43]">
                            <input data-testid={`checkbox-assign-session-${item.id}`} type="checkbox" checked={offeringIds.includes(item.id)} onChange={() => toggle(offeringIds, setOfferingIds, item.id)} className="mt-1 accent-[#174d43]" />
                            <span><span className="block font-semibold">{localized(item.localizedTitle, lang, item.title)}</span><span className="mt-1 block text-xs text-[#718077]">{item.facility} · {item.city}</span><span className="mt-1 block text-[10px] text-[#718077]">{dateText(item.startsAt, lang)}</span></span>
                          </label>
                        ))}
                      </div>}
                    </fieldset>
                  </div>
                  <label className="mt-6 block text-sm font-bold" htmlFor="instructor-decision-reason">{t(lang, 'declineReason')}</label>
                  <p className="mb-2 mt-1 text-xs text-[#718077]">{t(lang, 'declineHint')}</p>
                  <textarea id="instructor-decision-reason" data-testid="input-instructor-decline-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} rows={3} className="w-full rounded-2xl border border-[#d8d2c4] bg-[#fffdf7] px-4 py-3 text-sm leading-6" />
                  {formError && <p role="alert" data-testid="status-admin-form-error" className="mt-3 text-sm text-[#9a4435]">{formError}</p>}
                  <div className="mt-5 flex flex-wrap justify-end gap-3">
                    <button data-testid="button-decline-instructor-request" type="button" disabled={decide.isPending} onClick={() => submitDecision('reject')} className="rounded-full border border-[#b96750] px-5 py-3 text-sm font-bold text-[#9a4435] hover:bg-[#fff5f1] disabled:opacity-50">{decide.isPending ? t(lang, 'declining') : t(lang, 'decline')}</button>
                    <button data-testid="button-approve-instructor-request" type="button" disabled={decide.isPending} onClick={() => submitDecision('approve')} className="rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9] hover:bg-[#226556] disabled:opacity-50">{decide.isPending ? t(lang, 'approving') : t(lang, 'approve')}</button>
                  </div>
                </>
              ) : <Notice tone={selected.status === 'approved' ? 'success' : 'info'} title={t(lang, selected.status === 'approved' ? 'approvedTitle' : 'rejectedTitle')} testId="status-request-already-decided">{selected.status === 'approved' ? t(lang, 'approvedText') : t(lang, 'rejectedText')}</Notice>}
            </>
          )}
        </section>
      </div>
    </AccessPageFrame>
  );
}
