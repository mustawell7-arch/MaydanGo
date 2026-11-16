import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetInstructorContentDraftsForReviewQueryKey,
  getGetInstructorContentDraftsQueryKey,
  getGetInstructorPortalQueryKey,
  getGetPublicPlansQueryKey,
  getGetPublicInstructorProfilesQueryKey,
  useCompleteInstructorContentDraftUpload,
  useCreateInstructorContentDraft,
  useCreateInstructorContentDraftUpload,
  useDecideInstructorContentDraft,
  useGetInstructorContentDrafts,
  useGetInstructorContentDraftsForReview,
  useGetInstructorPortal,
  useGetPublicPlans,
  useSubmitInstructorContentDraft,
  useUpdateInstructorContentDraft,
} from '@workspace/api-client-react';
import type {
  InstructorContentDraft,
  InstructorContentDraftContentType,
  InstructorContentDraftInput,
  InstructorContentDraftPayload,
  InstructorContentReviewDraft,
} from '@workspace/api-client-react';
import {
  AlertCircle, Check, ChevronRight, CircleHelp, FileText,
  ImagePlus, LoaderCircle, Plus, RefreshCw, Send, ShieldCheck, Upload,
} from 'lucide-react';

type Language = 'en' | 'ar' | 'ku';
type DraftType = InstructorContentDraftContentType;

const labels = {
  en: {
    kicker: 'MAYDANGO / CONTENT STUDIO', title: 'Shape what you teach.',
    intro: 'Build a profile, course, or live-class proposal. Your work stays unpublished until the content team reviews it.',
    drafts: 'Your drafts', create: 'New draft', profile: 'Instructor profile', course: 'Digital course', live_class: 'Live-class proposal',
    loading: 'Loading your drafts', retry: 'Try again', empty: 'A clear place to begin.', emptyBody: 'Create a profile or propose a course or live class for review.',
    draft: 'Draft', submitted: 'Submitted', processing: 'Processing', changes_requested: 'Changes requested', rejected: 'Not approved', approved: 'Approved',
    save: 'Save draft', saving: 'Saving…', submit: 'Send for review', submitting: 'Sending…', saved: 'Draft saved.', sent: 'Sent to the content team.',
    jsonTitle: 'Content fields', jsonHint: 'Edit the complete API payload. English, Arabic and Sorani text fields are required for course and live-class content.',
    invalidJson: 'Check the JSON structure and required fields before saving.', failure: 'We could not save this change. Please try again.',
    reason: 'Review note', upload: 'Upload file', uploading: 'Uploading directly…', uploadDone: 'Upload complete. The file is attached to this draft.',
    uploadError: 'Upload failed. Try again with a supported file.', uploadHint: 'Choose an image, course recording, or supporting material. Files go directly to secure storage.',
    meetingLink: 'Secure meeting link', meetingLinkHint: 'Enter the HTTPS link. It is stored privately and shown as concealed text.',
    attachPhoto: 'Profile photo', attachRecording: 'Course recording', attachMaterial: 'Course material',
    addLesson: 'Add another lesson', removeLesson: 'Remove lesson', lesson: 'Lesson', lessonDuration: 'Duration (minutes)',
    recordingForLesson: 'Recording for lesson', recordingAttached: 'Recording attached', removeFile: 'Remove file',
    statusNote: 'Review status', unpublished: 'Nothing is public until approval.', livePending: 'MaydanGo approval is one step. The hosting partner must also approve before members can book.',
    adminTitle: 'Content review', adminIntro: 'Review instructor profiles, courses, and live-class proposals before they appear in public listings.',
    queue: 'Review queue', noQueue: 'Nothing is waiting for review.', select: 'Select a submission to inspect its full content.',
    approve: 'Approve', requestChanges: 'Request changes', reject: 'Reject', reasonHint: 'A clear note is required for changes or rejection (at least 5 characters).',
    decisionError: 'The review decision could not be saved.', decided: 'Decision saved.', partner: 'Approved partner', choosePartner: 'Select an approved partner',
    partnerPending: 'Partner review remains pending', noPartners: 'No approved partner options are available.',
    type: 'Content type', submittedBy: 'Instructor account', publicTitle: 'Published after approval', languages: 'English · العربية · کوردی',
    photoSelected: 'Profile photo attached', payload: 'Submitted content', attachedFiles: 'Attached files', openFile: 'Open uploaded file', search: 'Find a submission',
  },
  ar: {
    kicker: 'مايدان جو / استوديو المحتوى', title: 'قدّم ما تعلّمه بطريقتك.',
    intro: 'أنشئ ملفاً أو دورة أو مقترح حصة مباشرة. يبقى المحتوى غير منشور حتى يراجعه فريق المحتوى.',
    drafts: 'مسوداتك', create: 'مسودة جديدة', profile: 'ملف المدرّب', course: 'دورة رقمية', live_class: 'مقترح حصة مباشرة',
    loading: 'جارٍ تحميل المسودات', retry: 'حاول مجدداً', empty: 'بداية واضحة.', emptyBody: 'أنشئ ملفاً أو اقترح دورة أو حصة مباشرة للمراجعة.',
    draft: 'مسودة', submitted: 'مرسل', processing: 'قيد المعالجة', changes_requested: 'مطلوب تعديل', rejected: 'غير معتمد', approved: 'معتمد',
    save: 'حفظ المسودة', saving: 'جارٍ الحفظ…', submit: 'إرسال للمراجعة', submitting: 'جارٍ الإرسال…', saved: 'حُفظت المسودة.', sent: 'أُرسل المحتوى إلى فريق المراجعة.',
    jsonTitle: 'حقول المحتوى', jsonHint: 'حرر بيانات المحتوى كاملة. حقول النص بالإنجليزية والعربية والسورانية مطلوبة للدورات والحصص المباشرة.',
    invalidJson: 'تحقق من بنية JSON والحقول المطلوبة قبل الحفظ.', failure: 'تعذر حفظ التغيير. حاول مرة أخرى.',
    reason: 'ملاحظة المراجعة', upload: 'رفع ملف', uploading: 'جارٍ الرفع مباشرة…', uploadDone: 'اكتمل الرفع وأُرفق الملف بالمسودة.',
    uploadError: 'تعذر رفع الملف. حاول مجدداً بملف مدعوم.', uploadHint: 'اختر صورة أو تسجيلاً للدورة أو مادة مساندة. تُرفع الملفات مباشرة إلى التخزين الآمن.',
    meetingLink: 'رابط الاجتماع الآمن', meetingLinkHint: 'أدخل رابط HTTPS. يُحفظ بشكل خاص ويظهر كنص مخفي.',
    attachPhoto: 'صورة الملف', attachRecording: 'تسجيل الدورة', attachMaterial: 'مادة الدورة',
    addLesson: 'إضافة درس آخر', removeLesson: 'إزالة الدرس', lesson: 'الدرس', lessonDuration: 'المدة (بالدقائق)',
    recordingForLesson: 'تسجيل الدرس', recordingAttached: 'تم إرفاق التسجيل', removeFile: 'إزالة الملف',
    statusNote: 'حالة المراجعة', unpublished: 'لن يظهر المحتوى للعامة قبل اعتماده.', livePending: 'اعتماد MaydanGo خطوة أولى؛ ويجب أن يوافق الشريك المستضيف أيضاً قبل الحجز.',
    adminTitle: 'مراجعة المحتوى', adminIntro: 'راجع ملفات المدرّبين والدورات ومقترحات الحصص قبل ظهورها في القوائم العامة.',
    queue: 'قائمة المراجعة', noQueue: 'لا توجد عناصر بانتظار المراجعة.', select: 'اختر طلباً لعرض محتواه كاملاً.',
    approve: 'اعتماد', requestChanges: 'طلب تعديلات', reject: 'رفض', reasonHint: 'اكتب ملاحظة واضحة للتعديل أو الرفض (5 أحرف على الأقل).',
    decisionError: 'تعذر حفظ قرار المراجعة.', decided: 'حُفظ القرار.', partner: 'الشريك المعتمد', choosePartner: 'اختر شريكاً معتمداً',
    partnerPending: 'ما زالت مراجعة الشريك مطلوبة', noPartners: 'لا توجد خيارات شركاء معتمدين.',
    type: 'نوع المحتوى', submittedBy: 'حساب المدرّب', publicTitle: 'يُنشر بعد الاعتماد', languages: 'English · العربية · کوردی',
    photoSelected: 'صورة الملف مرفقة', payload: 'المحتوى المرسل', attachedFiles: 'الملفات المرفقة', openFile: 'فتح الملف المرفوع', search: 'ابحث في الطلبات',
  },
  ku: {
    kicker: 'مەیدانگۆ / ستۆدیۆی ناوەڕۆک', title: 'ئەوەی فێری دەکەیت پێشکەش بکە.',
    intro: 'پرۆفایل، کۆرس یان پێشنیاری وانەی ڕاستەوخۆ دروست بکە. ناوەڕۆکەکەت تا پێداچوونەوەی تیم بڵاوناکرێتەوە.',
    drafts: 'ڕەشنووسەکانت', create: 'ڕەشنووسی نوێ', profile: 'پرۆفایلی مامۆستا', course: 'کۆرسی دیجیتاڵ', live_class: 'پێشنیاری وانەی ڕاستەوخۆ',
    loading: 'ڕەشنووسەکان بار دەکرێن', retry: 'دووبارە هەوڵبدە', empty: 'شوێنێکی ڕوون بۆ دەستپێکردن.', emptyBody: 'پرۆفایلێک دروست بکە یان کۆرس و وانەیەک بۆ پێداچوونەوە پێشنیار بکە.',
    draft: 'ڕەشنووس', submitted: 'نێردراوە', processing: 'لە پڕۆسەدایە', changes_requested: 'داوای دەستکاریکردن', rejected: 'پەسەند نەکرا', approved: 'پەسەندکراو',
    save: 'پاشەکەوتی ڕەشنووس', saving: 'پاشەکەوت دەکرێت…', submit: 'ناردن بۆ پێداچوونەوە', submitting: 'دەنێردرێت…', saved: 'ڕەشنووسەکە پاشەکەوت کرا.', sent: 'ناوەڕۆک بۆ تیمی پێداچوونەوە نێردرا.',
    jsonTitle: 'خانەکانی ناوەڕۆک', jsonHint: 'هەموو بارکراوی API دەستکاری بکە. بۆ کۆرس و وانەی ڕاستەوخۆ خانەکانی ئینگلیزی، عەرەبی و سۆرانی پێویستن.',
    invalidJson: 'پێکهاتەی JSON و خانە پێویستەکان بپشکنە.', failure: 'پاشەکەوتکردنی ئەم گۆڕانکارییە نەکرا.',
    reason: 'تێبینیی پێداچوونەوە', upload: 'بارکردنی فایل', uploading: 'ڕاستەوخۆ بار دەکرێت…', uploadDone: 'بارکردن تەواو بوو و فایلەکە پەیوەست کرا.',
    uploadError: 'بارکردنی فایل سەرکەوتوو نەبوو. فایلێکی پشتگیریکراو تاقی بکەرەوە.', uploadHint: 'وێنە، تۆماری کۆرس یان مادەی یارمەتیدەر هەڵبژێرە. فایلەکان ڕاستەوخۆ بۆ شوێنی پارێزراو بار دەکرێن.',
    meetingLink: 'بەستەری پارێزراوی کۆبوونەوە', meetingLinkHint: 'بەستەری HTTPS بنووسە. بە شێوەی تایبەت پاشەکەوت دەکرێت و بە شێوەی شاراوە دەردەکەوێت.',
    attachPhoto: 'وێنەی پرۆفایل', attachRecording: 'تۆماری کۆرس', attachMaterial: 'مادەی کۆرس',
    addLesson: 'زیادکردنی وانەیەکی تر', removeLesson: 'سڕینەوەی وانە', lesson: 'وانە', lessonDuration: 'ماوە (خولەک)',
    recordingForLesson: 'تۆماری وانە', recordingAttached: 'تۆمار پەیوەست کرا', removeFile: 'سڕینەوەی فایل',
    statusNote: 'دۆخی پێداچوونەوە', unpublished: 'پێش پەسەندکردن ناوەڕۆک بۆ گشتی نابێت.', livePending: 'پەسەندکردنی MaydanGo هەنگاوێکە؛ هاوبەشی میواندار دەبێت پێش حجزکردنی ئەندامان ئەویش پەسەند بکات.',
    adminTitle: 'پێداچوونەوەی ناوەڕۆک', adminIntro: 'پرۆفایل، کۆرس و پێشنیاری وانەی ڕاستەوخۆ بپشکنە پێش ئەوەی لە لیستی گشتیدا دەرکەون.',
    queue: 'لیستی پێداچوونەوە', noQueue: 'هیچ بابەتێک چاوەڕوانی پێداچوونەوە ناکات.', select: 'بابەتێک هەڵبژێرە بۆ بینینی ناوەڕۆکی تەواو.',
    approve: 'پەسەندکردن', requestChanges: 'داوای دەستکاری', reject: 'ڕەتکردنەوە', reasonHint: 'بۆ دەستکاری یان ڕەتکردنەوە تێبینییەکی ڕوون بنووسە (لانیکەم ٥ پیت).',
    decisionError: 'پاشەکەوتکردنی بڕیاری پێداچوونەوە نەکرا.', decided: 'بڕیارەکە پاشەکەوت کرا.', partner: 'هاوبەشی پەسەندکراو', choosePartner: 'هاوبەشێکی پەسەندکراو هەڵبژێرە',
    partnerPending: 'پێداچوونەوەی هاوبەش هێشتا پێویستە', noPartners: 'هیچ هەڵبژاردەی هاوبەشی پەسەندکراو نییە.',
    type: 'جۆری ناوەڕۆک', submittedBy: 'هەژماری مامۆستا', publicTitle: 'دوای پەسەندکردن بڵاودەکرێتەوە', languages: 'English · العربية · کوردی',
    photoSelected: 'وێنەی پرۆفایل پەیوەستە', payload: 'ناوەڕۆکی نێردراو', attachedFiles: 'فایلە پەیوەستکراوەکان', openFile: 'کردنەوەی فایل', search: 'گەڕان لە داواکارییەکان',
  },
} as const;

function languageFromStorage(): Language {
  const value = typeof window === 'undefined' ? 'en' : window.localStorage.getItem('maydango-partner-language');
  return value === 'ar' || value === 'ku' ? value : 'en';
}

function initialPayload(type: DraftType): InstructorContentDraftPayload {
  if (type === 'profile') return { displayName: '', biography: '', qualifications: [], languages: [], specialties: [], photoUploadId: null };
  const localized = { en: '', ar: '', ku: '' };
  if (type === 'course') return {
    localizedTitle: localized, localizedSummary: localized, localizedInstructor: localized,
    category: '', level: 'all-levels', durationMinutes: 30, courseLanguages: ['en'], subtitleLanguages: [],
    requiredEquipment: null, disclaimers: null, supportingMaterials: null,
    lessons: [{ localizedTitle: localized, localizedContent: localized, durationMinutes: 10, recordingUploadId: null }],
    materials: [],
  };
  return {
    localizedTitle: localized, localizedDescription: localized, localizedInstructor: localized, city: '', category: '',
    startsAt: '', endsAt: '', cancellationDeadline: '', capacity: 20, tiers: [],
    difficultyLevel: 'all-levels', instructionLanguage: 'en', requiredEquipment: null, joinUrl: '',
  };
}

function parsePayload(type: DraftType, source: string): InstructorContentDraftPayload | null {
  try {
    const value = JSON.parse(source) as Record<string, unknown>;
    const localizedKeys = type === 'course'
      ? ['localizedTitle', 'localizedSummary', 'localizedInstructor']
      : type === 'live_class' ? ['localizedTitle', 'localizedDescription', 'localizedInstructor'] : [];
    const isLocalized = (item: unknown) => {
      const localized = item as Record<string, unknown> | undefined;
      return !!localized && ['en', 'ar', 'ku'].every((language) => typeof localized[language] === 'string' && String(localized[language]).trim());
    };
    for (const key of localizedKeys) if (!isLocalized(value[key])) return null;
    if (type === 'course') {
      if (!String(value.category ?? '').trim() || !Array.isArray(value.lessons) || value.lessons.length < 1) return null;
      if (!(value.lessons as Record<string, unknown>[]).every((lesson) => isLocalized(lesson.localizedTitle) && isLocalized(lesson.localizedContent))) return null;
      for (const key of ['requiredEquipment', 'disclaimers', 'supportingMaterials']) {
        if (value[key] !== null && !isLocalized(value[key])) return null;
      }
    }
    if (type === 'live_class') {
      if (!String(value.city ?? '').trim() || !String(value.category ?? '').trim() || !String(value.startsAt ?? '').trim()
        || !String(value.endsAt ?? '').trim() || !String(value.cancellationDeadline ?? '').trim()) return null;
      if (value.requiredEquipment !== null && !isLocalized(value.requiredEquipment)) return null;
      if (typeof value.joinUrl !== 'string') value.joinUrl = '';
    }
    if (type === 'profile' && (!String(value.displayName ?? '').trim() || !String(value.biography ?? '').trim())) return null;
    return value as unknown as InstructorContentDraftPayload;
  } catch { return null; }
}

function editorPayload(draft: { contentType: string; payload: unknown }) {
  const payload = JSON.parse(JSON.stringify(draft.payload)) as Record<string, unknown>;
  if (draft.contentType === 'live_class') delete payload.joinUrl;
  return JSON.stringify(payload, null, 2);
}

function reviewUploadIds(draft: InstructorContentReviewDraft) {
  const payload = draft.payload as unknown as Record<string, unknown>;
  const ids: string[] = [];
  if (draft.contentType === 'profile' && typeof payload.photoUploadId === 'string') ids.push(payload.photoUploadId);
  if (draft.contentType === 'course') {
    if (Array.isArray(payload.lessons)) {
      for (const lesson of payload.lessons) {
        if (lesson && typeof lesson === 'object'
          && typeof (lesson as Record<string, unknown>).recordingUploadId === 'string') {
          ids.push((lesson as Record<string, string>).recordingUploadId);
        }
      }
    }
    if (Array.isArray(payload.materials)) {
      for (const material of payload.materials) {
        if (material && typeof material === 'object'
          && typeof (material as Record<string, unknown>).uploadId === 'string') {
          ids.push((material as Record<string, string>).uploadId);
        }
      }
    }
  }
  return Array.from(new Set(ids));
}

type DraftObject = Record<string, any>;
function readDraftObject(source: string): DraftObject {
  try { return JSON.parse(source) as DraftObject; } catch { return {}; }
}

function LocalizedFields({ title, value, onChange, multiline = false }: {
  title: string;
  value: { en?: string; ar?: string; ku?: string } | undefined;
  onChange: (language: Language, text: string) => void;
  multiline?: boolean;
}) {
  const locales: { key: Language; label: string; direction: 'ltr' | 'rtl' }[] = [
    { key: 'en', label: 'English', direction: 'ltr' },
    { key: 'ar', label: 'العربية', direction: 'rtl' },
    { key: 'ku', label: 'کوردی', direction: 'rtl' },
  ];
  return <fieldset className="rounded-2xl border border-[#e3dfd3] bg-[#fbfaf5] p-4">
    <legend className="px-2 text-xs font-bold text-[#536b61]">{title}</legend>
    <div className="grid gap-3 md:grid-cols-3">{locales.map((locale) => {
      const Element = multiline ? 'textarea' : 'input';
      return <label key={locale.key} dir={locale.direction} className="block text-[11px] font-semibold text-[#718077]">
        {locale.label}
        <Element value={value?.[locale.key] ?? ''} onChange={(event) => onChange(locale.key, event.target.value)} rows={multiline ? 3 : undefined} className="mt-1.5 block min-h-10 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-sm font-normal text-[#173d35]" data-testid={`input-localized-${locale.key}`} />
      </label>;
    })}</div>
  </fieldset>;
}

function typeName(type: DraftType, lang: Language) { return labels[lang][type]; }
function localizedTitle(draft: { contentType: string; payload: unknown }, lang: Language) {
  const payload = draft.payload as unknown as Record<string, unknown>;
  const title = (payload.localizedTitle ?? payload.displayName) as { en?: string; ar?: string; ku?: string } | string | undefined;
  return typeof title === 'string' ? title : title?.[lang] || title?.en || labels[lang][draft.contentType as DraftType];
}
function langDir(lang: Language) { return lang === 'en' ? 'ltr' : 'rtl'; }

function StatusPill({ status, lang }: { status: string; lang: Language }) {
  const color = status === 'approved' ? 'bg-[#e2eee1] text-[#286046]' : status === 'rejected' ? 'bg-[#f8e7e1] text-[#954d39]' : status === 'changes_requested' ? 'bg-[#f7edd5] text-[#7b5a20]' : status === 'submitted' || status === 'processing' ? 'bg-[#e5edf0] text-[#405f6b]' : 'bg-[#eeeade] text-[#6e6858]';
  const label = labels[lang][status as keyof typeof labels.en] ?? status;
  return <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${color}`}>{label}</span>;
}

function WorkspaceFrame({ lang, admin, onLanguage, children }: { lang: Language; admin?: boolean; onLanguage?: (next: Language) => void; children: React.ReactNode }) {
  return <main dir={langDir(lang)} className="min-h-[100dvh] bg-[#f3f1e8] px-4 py-6 text-[#173d35] sm:px-8 sm:py-10">
    <div className="mx-auto max-w-7xl">
      <header className="mb-10 flex items-center justify-between border-b border-[#d8d2c4] pb-5">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#174d43] font-display text-lg font-bold text-[#fff9e9]">M</span><div><p className="font-display text-lg font-extrabold tracking-tight">MaydanGo</p><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#7a8075]">Iraq · Kurdistan · West · South</p></div></div>
        {onLanguage ? <label className="flex items-center gap-2 rounded-full border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-xs font-medium text-[#536b61]"><ShieldCheck size={14} /><span className="sr-only">Language</span><select value={lang} onChange={(event) => onLanguage(event.target.value as Language)} className="bg-transparent text-xs font-semibold outline-none"><option value="en">English</option><option value="ar">العربية</option><option value="ku">کوردی</option></select></label>
          : <div className="hidden items-center gap-2 rounded-full border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-xs font-medium text-[#536b61] sm:flex"><ShieldCheck size={14} /> {labels[lang].languages}</div>}
      </header>
      <div className="mb-8 max-w-3xl"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#a05b3e]">{labels[lang].kicker}</p><h1 className="font-display mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{admin ? labels[lang].adminTitle : labels[lang].title}</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[#60756b] sm:text-base">{admin ? labels[lang].adminIntro : labels[lang].intro}</p></div>
      {children}
      <footer className="mt-12 border-t border-[#d8d2c4] pt-5 text-[10px] font-semibold uppercase tracking-[.14em] text-[#818579]">MaydanGo · Content workspace</footer>
    </div>
  </main>;
}

function PayloadUpload({ draftId, type, onUploaded, lang, lessonCount = 0, recordingLessonIndex = 0, onRecordingLessonChange }: {
  draftId: string;
  type: DraftType;
  onUploaded: (id: string, purpose: string, fileName: string, sourceDraftId: string) => void;
  lang: Language;
  lessonCount?: number;
  recordingLessonIndex?: number;
  onRecordingLessonChange?: (index: number) => void;
}) {
  const queryClient = useQueryClient();
  const request = useCreateInstructorContentDraftUpload();
  const complete = useCompleteInstructorContentDraftUpload();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [purpose, setPurpose] = useState<'profile_photo' | 'course_recording' | 'course_material'>(type === 'profile' ? 'profile_photo' : 'course_recording');
  const strings = labels[lang];
  useEffect(() => {
    setPurpose(type === 'profile' ? 'profile_photo' : 'course_recording');
  }, [draftId, type]);
  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size < 1 || file.size > 524288000) {
      setError(true); setMessage(strings.uploadError); event.target.value = ''; return;
    }
    setBusy(true); setMessage(''); setError(false);
    try {
      const ticket = await request.mutateAsync({ id: draftId, data: { purpose, fileName: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size } });
      const response = await fetch(ticket.uploadURL, { method: 'PUT', headers: { 'Content-Type': ticket.contentType }, body: file });
      if (!response.ok) throw new Error('Upload did not complete');
      await complete.mutateAsync({ id: draftId, uploadId: ticket.uploadId });
      onUploaded(ticket.uploadId, purpose, file.name, draftId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetInstructorContentDraftsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetInstructorPortalQueryKey() }),
      ]);
      setMessage(`${strings.uploadDone} ${ticket.uploadId}`);
    } catch {
      setError(true); setMessage(strings.uploadError);
    } finally {
      setBusy(false); event.target.value = '';
    }
  };
  return <div className="mt-4 rounded-2xl border border-[#dedacd] bg-[#f8f6ef] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-bold">{strings.upload}</p><p className="mt-1 text-xs leading-5 text-[#718077]">{strings.uploadHint}</p></div>
      {type !== 'profile' && <select aria-label={strings.upload} value={purpose} onChange={(event) => setPurpose(event.target.value as typeof purpose)} className="rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-xs">
        <option value="course_recording">{strings.attachRecording}</option><option value="course_material">{strings.attachMaterial}</option>
      </select>}
      {type === 'course' && purpose === 'course_recording' && lessonCount > 0 && <label className="text-xs font-semibold text-[#60756b]">
        {strings.recordingForLesson}
        <select disabled={busy} value={recordingLessonIndex} onChange={(event) => onRecordingLessonChange?.(Number(event.target.value))} className="mt-1 block rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-xs disabled:opacity-50">
          {Array.from({ length: lessonCount }, (_, index) => <option key={index} value={index}>{strings.lesson} {index + 1}</option>)}
        </select>
      </label>}
      <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#174d43] px-4 py-2.5 text-xs font-bold text-[#fff9e9] ${busy ? 'opacity-60' : ''}`}>
        {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
        {busy ? strings.uploading : strings.upload}
        <input type="file" className="sr-only" disabled={busy} accept={purpose === 'profile_photo' ? 'image/*' : undefined} onChange={uploadFile} />
      </label>
    </div>
    {message && <p role={error ? 'alert' : 'status'} className={`mt-3 break-all text-xs ${error ? 'text-[#9a4435]' : 'text-[#2d6d4a]'}`}>{message}</p>}
    {busy && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e3dfd3]"><div className="h-full w-2/3 animate-pulse rounded-full bg-[#c67556]" /></div>}
  </div>;
}

function InstructorDrafts({ lang }: { lang: Language }) {
  const queryClient = useQueryClient();
  const query = useGetInstructorContentDrafts({ query: { queryKey: getGetInstructorContentDraftsQueryKey(), retry: false } });
  const create = useCreateInstructorContentDraft();
  const update = useUpdateInstructorContentDraft();
  const submit = useSubmitInstructorContentDraft();
  const plansQuery = useGetPublicPlans({ query: { queryKey: getGetPublicPlansQueryKey(), retry: false } });
  const [selected, setSelected] = useState<InstructorContentDraft | null>(null);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [type, setType] = useState<DraftType>('profile');
  const [recordingLessonIndex, setRecordingLessonIndex] = useState(0);
  const [json, setJson] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const strings = labels[lang];
  const canEdit = !selected || selected.status === 'draft' || selected.status === 'changes_requested';
  const drafts = query.data?.drafts ?? [];
  const activeTiers = useMemo(() => Array.from(new Set((plansQuery.data ?? []).map((plan) => plan.tier).filter(Boolean))), [plansQuery.data]);
  const draftValues = readDraftObject(json);
  const updateField = (path: (string | number)[], value: unknown) => {
    const next = readDraftObject(json);
    let cursor: DraftObject | unknown[] = next;
    for (const part of path.slice(0, -1)) cursor = (cursor as DraftObject)[part] as DraftObject;
    (cursor as DraftObject)[path[path.length - 1]] = value;
    setJson(JSON.stringify(next, null, 2));
  };
  const updateLocalized = (field: string, language: Language, value: string, nestedIndex?: number) => {
    updateField(nestedIndex === undefined ? [field, language] : ['lessons', nestedIndex, field, language], value);
  };

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetInstructorContentDraftsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetInstructorPortalQueryKey() }),
  ]);
  const startNew = () => { setSelected(null); setType('profile'); setMeetingUrl(''); setRecordingLessonIndex(0); setJson(JSON.stringify(initialPayload('profile'), null, 2)); setNotice(''); setError(''); };
  const saveDraft = async (send: boolean) => {
    const payload = parsePayload(type, json);
    if (!payload) { setError(strings.invalidJson); return; }
    if (type === 'live_class') {
      const liveClassPayload = payload as Extract<InstructorContentDraftPayload, { joinUrl: string }>;
      liveClassPayload.joinUrl = meetingUrl.trim();
      if (!/^https:\/\/\S+$/i.test(liveClassPayload.joinUrl)) { setError(strings.invalidJson); return; }
    }
    if (type === 'live_class') {
      const tiers = (payload as Extract<InstructorContentDraftPayload, { tiers: string[] }>).tiers;
      if (!tiers.length || tiers.some((tier) => !activeTiers.includes(tier))) { setError(strings.invalidJson); return; }
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const data: InstructorContentDraftInput = { contentType: type, payload };
      const saved = selected?.id
        ? await update.mutateAsync({ id: selected.id, data })
        : await create.mutateAsync({ data });
      setSelected(saved);
      if (saved.contentType === 'live_class') {
        setMeetingUrl((saved.payload as Extract<InstructorContentDraftPayload, { joinUrl: string }>).joinUrl);
      }
      if (send) {
        await submit.mutateAsync({ id: saved.id });
        setNotice(strings.sent);
      } else setNotice(strings.saved);
      await refresh();
    } catch { setError(strings.failure); }
    finally { setBusy(false); }
  };
  const addLesson = () => {
    const next = readDraftObject(json);
    const lessons = Array.isArray(next.lessons) ? next.lessons : [];
    lessons.push({
      localizedTitle: { en: '', ar: '', ku: '' },
      localizedContent: { en: '', ar: '', ku: '' },
      durationMinutes: 10,
      recordingUploadId: null,
    });
    next.lessons = lessons;
    setRecordingLessonIndex(lessons.length - 1);
    setJson(JSON.stringify(next, null, 2));
  };
  const removeLesson = (lessonIndex: number) => {
    const next = readDraftObject(json);
    const lessons = Array.isArray(next.lessons) ? next.lessons : [];
    if (lessons.length <= 1) return;
    lessons.splice(lessonIndex, 1);
    next.lessons = lessons;
    setRecordingLessonIndex((current) => Math.min(current, lessons.length - 1));
    setJson(JSON.stringify(next, null, 2));
  };
  const setUploadId = (uploadId: string, purpose: string, fileName: string, sourceDraftId: string) => {
    if (!selected?.id || selected.id !== sourceDraftId) return;
    const current = parsePayload(type, json) as Record<string, unknown> | null;
    if (!current) return;
    if (purpose === 'profile_photo') current.photoUploadId = uploadId;
    if (purpose === 'course_recording' && Array.isArray(current.lessons) && current.lessons[recordingLessonIndex]) {
      (current.lessons[recordingLessonIndex] as Record<string, unknown>).recordingUploadId = uploadId;
    }
    if (purpose === 'course_material') {
      const materials = Array.isArray(current.materials) ? current.materials as Record<string, unknown>[] : [];
      const title = fileName.replace(/\.[^.]+$/, '').trim().slice(0, 120) || fileName.slice(0, 120);
      materials.push({ title, uploadId });
      current.materials = materials;
    }
    setJson(JSON.stringify(current, null, 2));
  };
  const newType = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as DraftType;
    setType(next); setSelected(null); setMeetingUrl(''); setRecordingLessonIndex(0); setJson(JSON.stringify(initialPayload(next), null, 2)); setError(''); setNotice('');
  };

  return <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]" aria-label={strings.drafts}>
    <aside className="rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a05b3e]">{strings.drafts}</p><p className="mt-1 font-display text-xl font-bold">{drafts.length.toString().padStart(2, '0')}</p></div><button type="button" onClick={startNew} className="inline-flex items-center gap-2 rounded-full bg-[#174d43] px-4 py-2.5 text-xs font-bold text-[#fff9e9] hover:bg-[#226556]" data-testid="button-new-instructor-draft"><Plus size={15} />{strings.create}</button></div>
      {query.isLoading ? <div className="mt-6 space-y-3" aria-label={strings.loading}>{[0, 1, 2].map(item => <div key={item} className="h-20 animate-pulse rounded-2xl bg-[#eeeade]" />)}</div>
        : query.isError ? <div className="mt-6 rounded-2xl border border-[#e4c3b7] bg-[#fff5f1] p-4 text-sm text-[#8f352a]" role="alert"><p>{strings.failure}</p><button type="button" className="mt-3 inline-flex items-center gap-2 font-bold" onClick={() => void query.refetch()}><RefreshCw size={14} />{strings.retry}</button></div>
          : drafts.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-[#d8d2c4] px-4 py-7 text-center"><FileText className="mx-auto text-[#a05b3e]" size={22} /><p className="mt-3 text-sm font-bold">{strings.empty}</p><p className="mt-1 text-xs leading-5 text-[#718077]">{strings.emptyBody}</p></div>
             : <div className="mt-5 space-y-2">{drafts.map((draft) => <button key={draft.id} type="button" onClick={() => { setSelected(draft); setType(draft.contentType); setMeetingUrl(draft.contentType === 'live_class' ? (draft.payload as Extract<InstructorContentDraftPayload, { joinUrl: string }>).joinUrl : ''); setRecordingLessonIndex(0); setJson(editorPayload(draft)); setError(''); setNotice(''); }} className={`w-full rounded-2xl border p-4 text-start transition-colors ${selected?.id === draft.id ? 'border-[#174d43] bg-[#edf2e9]' : 'border-[#e3dfd3] bg-[#faf8f0] hover:border-[#b9c6b5]'}`} data-testid={`button-select-instructor-draft-${draft.id}`}>
        <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{localizedTitle(draft, lang)}</span><ChevronRight size={15} className="shrink-0 text-[#899187]" /></span><span className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-[#8b7564]">{strings[draft.contentType]}</span><StatusPill status={draft.status} lang={lang} /></span>
      </button>)}</div>}
    </aside>
    <div className="rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-5 shadow-sm sm:p-7">
      {!selected && !json ? <div className="flex min-h-72 flex-col items-center justify-center text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f3eadb] text-[#a05b3e]"><ImagePlus size={21} /></span><h2 className="mt-4 font-display text-xl font-bold">{strings.empty}</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#718077]">{strings.emptyBody}</p><button type="button" onClick={startNew} className="mt-5 rounded-full border border-[#174d43] px-5 py-2.5 text-sm font-bold text-[#174d43]">{strings.create}</button></div> : <>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e3dfd3] pb-5">
          <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a05b3e]">{selected ? strings.statusNote : strings.create}</p><h2 className="mt-1 font-display text-2xl font-bold">{selected ? localizedTitle(selected, lang) : strings.create}</h2>{selected?.decisionReason && <p className="mt-2 max-w-2xl rounded-xl bg-[#f7edd5] p-3 text-xs leading-5 text-[#745b2b]">{strings.reason}: {selected.decisionReason}</p>}</div>
          {selected && <StatusPill status={selected.status} lang={lang} />}
        </div>
        {notice && <p role="status" className="mt-4 rounded-xl border border-[#c8dec9] bg-[#eef5eb] p-3 text-sm text-[#2d6d4a]">{notice}</p>}
        {error && <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl border border-[#e4c3b7] bg-[#fff5f1] p-3 text-sm text-[#8f352a]"><AlertCircle size={16} />{error}</p>}
        {canEdit ? <>
          <div className="mt-5 space-y-4">
            {type === 'profile' ? <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-[#60756b]">Display name<input value={draftValues.displayName ?? ''} onChange={(event) => updateField(['displayName'], event.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal text-[#173d35]" data-testid="input-instructor-display-name" /></label>
                <label className="text-xs font-bold text-[#60756b]">Qualifications<input value={(draftValues.qualifications ?? []).join(', ')} onChange={(event) => updateField(['qualifications'], event.target.value.split(',').map((item: string) => item.trim()).filter(Boolean))} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal text-[#173d35]" placeholder="Separate entries with commas" /></label>
              </div>
              <label className="block text-xs font-bold text-[#60756b]">Biography<textarea value={draftValues.biography ?? ''} onChange={(event) => updateField(['biography'], event.target.value)} rows={4} className="mt-2 block w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] p-3 text-sm font-normal text-[#173d35]" data-testid="input-instructor-biography" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-[#60756b]">Languages<input value={(draftValues.languages ?? []).join(', ')} onChange={(event) => updateField(['languages'], event.target.value.split(',').map((item: string) => item.trim()).filter(Boolean))} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal text-[#173d35]" placeholder="English, Arabic, Sorani Kurdish" /></label>
                <label className="text-xs font-bold text-[#60756b]">Specialties<input value={(draftValues.specialties ?? []).join(', ')} onChange={(event) => updateField(['specialties'], event.target.value.split(',').map((item: string) => item.trim()).filter(Boolean))} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal text-[#173d35]" placeholder="Separate entries with commas" /></label>
              </div>
            </> : type === 'course' ? <>
              <LocalizedFields title="Course title · required in all three languages" value={draftValues.localizedTitle} onChange={(language, value) => updateLocalized('localizedTitle', language, value)} />
              <LocalizedFields title="Course summary · required in all three languages" value={draftValues.localizedSummary} onChange={(language, value) => updateLocalized('localizedSummary', language, value, undefined)} multiline />
              <LocalizedFields title="Instructor name · required in all three languages" value={draftValues.localizedInstructor} onChange={(language, value) => updateLocalized('localizedInstructor', language, value)} />
              <div className="space-y-4">
                {(draftValues.lessons ?? []).map((lesson: DraftObject, index: number) => <section key={index} className="rounded-2xl border border-[#e3dfd3] bg-[#faf8f0] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">{strings.lesson} {index + 1}</h3>
                    {(draftValues.lessons?.length ?? 0) > 1 && <button type="button" onClick={() => removeLesson(index)} className="text-xs font-semibold text-[#944632] underline underline-offset-4">{strings.removeLesson}</button>}
                  </div>
                  <LocalizedFields title={`${strings.lesson} ${index + 1} · ${strings.languages}`} value={lesson.localizedTitle} onChange={(language, value) => updateLocalized('localizedTitle', language, value, index)} />
                  <LocalizedFields title={`${strings.lesson} ${index + 1} content · ${strings.languages}`} value={lesson.localizedContent} onChange={(language, value) => updateLocalized('localizedContent', language, value, index)} multiline />
                  <label className="mt-3 block max-w-xs text-xs font-bold text-[#60756b]">{strings.lessonDuration}
                    <input type="number" min={1} max={10000} value={lesson.durationMinutes ?? 10} onChange={(event) => updateField(['lessons', index, 'durationMinutes'], Number(event.target.value))} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal" />
                  </label>
                  {lesson.recordingUploadId ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#eef5eb] px-3 py-2 text-xs text-[#2d6d4a]">
                    <span>{strings.recordingAttached} · {String(lesson.recordingUploadId).slice(0, 8)}</span>
                    <button type="button" onClick={() => updateField(['lessons', index, 'recordingUploadId'], null)} className="font-semibold underline underline-offset-4">{strings.removeFile}</button>
                  </div> : <p className="mt-3 text-xs text-[#718077]">{strings.attachRecording}</p>}
                </section>)}
                <button type="button" disabled={(draftValues.lessons?.length ?? 0) >= 200} onClick={addLesson} className="rounded-full border border-[#174d43] px-4 py-2 text-xs font-bold text-[#174d43] disabled:opacity-50">{strings.addLesson}</button>
              </div>
              {Array.isArray(draftValues.materials) && draftValues.materials.length > 0 && <div className="rounded-2xl border border-[#e3dfd3] bg-[#faf8f0] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[#718077]">{strings.attachMaterial}</p>
                <ul className="mt-2 space-y-2">{draftValues.materials.map((material: DraftObject, index: number) => <li key={String(material.uploadId)} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs">
                  <span className="truncate font-semibold">{material.title || material.uploadId}</span>
                  <button type="button" onClick={() => updateField(['materials'], draftValues.materials.filter((_: unknown, itemIndex: number) => itemIndex !== index))} className="shrink-0 font-semibold text-[#944632] underline underline-offset-4">{strings.removeFile}</button>
                </li>)}</ul>
              </div>}
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="text-xs font-bold text-[#60756b]">Category<input value={draftValues.category ?? ''} onChange={(event) => updateField(['category'], event.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-[#60756b]">Level<select value={draftValues.level ?? 'all-levels'} onChange={(event) => updateField(['level'], event.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="all-levels">All levels</option></select></label>
                <label className="text-xs font-bold text-[#60756b]">Duration (minutes)<input type="number" min={1} max={10000} value={draftValues.durationMinutes ?? 30} onChange={(event) => updateField(['durationMinutes'], Number(event.target.value))} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal" /></label>
              </div>
            </> : <>
              <LocalizedFields title="Live-class title · required in all three languages" value={draftValues.localizedTitle} onChange={(language, value) => updateLocalized('localizedTitle', language, value)} />
              <LocalizedFields title="Description · required in all three languages" value={draftValues.localizedDescription} onChange={(language, value) => updateLocalized('localizedDescription', language, value)} multiline />
              <LocalizedFields title="Instructor name · required in all three languages" value={draftValues.localizedInstructor} onChange={(language, value) => updateLocalized('localizedInstructor', language, value)} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-[#60756b]">City<input value={draftValues.city ?? ''} onChange={(event) => updateField(['city'], event.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-[#60756b]">Category<input value={draftValues.category ?? ''} onChange={(event) => updateField(['category'], event.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-[#60756b]">Starts at<input type="datetime-local" value={draftValues.startsAt?.slice(0, 16) ?? ''} onChange={(event) => updateField(['startsAt'], event.target.value ? new Date(event.target.value).toISOString() : '')} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-[#60756b]">Ends at<input type="datetime-local" value={draftValues.endsAt?.slice(0, 16) ?? ''} onChange={(event) => updateField(['endsAt'], event.target.value ? new Date(event.target.value).toISOString() : '')} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-[#60756b]">Cancellation deadline<input type="datetime-local" value={draftValues.cancellationDeadline?.slice(0, 16) ?? ''} onChange={(event) => updateField(['cancellationDeadline'], event.target.value ? new Date(event.target.value).toISOString() : '')} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal" /></label>
                <label className="text-xs font-bold text-[#60756b]">Capacity<input type="number" min={1} max={1000} value={draftValues.capacity ?? 20} onChange={(event) => updateField(['capacity'], Number(event.target.value))} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal" /></label>
              </div>
              <label className="mt-4 block text-xs font-bold text-[#60756b]">{strings.meetingLink}
                <input type="password" autoComplete="new-password" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} placeholder="https://…" className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm font-normal" data-testid="input-instructor-secure-meeting-link" />
              </label>
              <p className="mt-2 text-xs leading-5 text-[#718077]">{strings.meetingLinkHint}</p>
            </>}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(220px,.5fr)_1fr] sm:items-end">
            <label className="text-xs font-bold text-[#60756b]">{strings.type}<select disabled={!!selected} value={type} onChange={newType} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm text-[#173d35]">
              <option value="profile">{strings.profile}</option><option value="course">{strings.course}</option><option value="live_class">{strings.live_class}</option>
            </select></label>
            <p className="flex items-start gap-2 rounded-xl bg-[#f3f1e8] p-3 text-xs leading-5 text-[#60756b]"><CircleHelp size={15} className="mt-0.5 shrink-0" />{strings.jsonHint}</p>
          </div>
          {type === 'live_class' && <fieldset className="mt-5 rounded-2xl border border-[#dedacd] bg-[#f8f6ef] p-4">
            <legend className="px-2 text-sm font-bold">Membership tiers</legend>
            {plansQuery.isLoading ? <div className="h-8 animate-pulse rounded bg-[#e3dfd3]" aria-label={strings.loading} />
              : plansQuery.isError ? <div role="alert" className="flex items-center justify-between gap-3 text-xs text-[#9a4435]"><span>{strings.failure}</span><button type="button" onClick={() => void plansQuery.refetch()} className="font-bold underline">{strings.retry}</button></div>
                : activeTiers.length ? <div className="flex flex-wrap gap-2">{activeTiers.map((tier) => {
                  const current = parsePayload(type, json) as Extract<InstructorContentDraftPayload, { tiers: string[] }> | null;
                  const checked = current?.tiers.includes(tier) ?? false;
                  return <label key={tier} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-xs font-semibold">
                    <input type="checkbox" checked={checked} onChange={() => {
                      const next = parsePayload(type, json) as Extract<InstructorContentDraftPayload, { tiers: string[] }> | null;
                      if (!next) return;
                      next.tiers = checked ? next.tiers.filter((item) => item !== tier) : [...next.tiers, tier];
                      setJson(JSON.stringify(next, null, 2));
                    }} className="accent-[#174d43]" />{tier}
                  </label>;
                })}</div> : <p className="text-xs text-[#718077]">{strings.noPartners}</p>}
            <p className="mt-2 text-xs leading-5 text-[#718077]">Choose tiers from active public plans. They are checked again before submission.</p>
          </fieldset>}
          <details className="mt-5 rounded-2xl border border-[#d8d2c4] bg-[#f8f7f1] p-4">
            <summary className="cursor-pointer text-sm font-bold">{strings.jsonTitle} · advanced</summary>
            <p className="mt-2 text-xs leading-5 text-[#718077]">{strings.jsonHint}</p>
            <textarea aria-label={strings.jsonTitle} value={json} onChange={(event) => {
            const source = event.target.value;
            setJson(type === 'live_class' ? source.replace(/("joinUrl"\s*:\s*)"(?:\\.|[^"\\])*"/g, '$1""') : source);
          }} spellCheck={false} rows={22} className="mt-4 min-h-[420px] w-full resize-y rounded-xl border border-[#d8d2c4] bg-[#fffdf7] p-4 font-mono text-xs leading-6 text-[#254d43] focus:border-[#174d43]" data-testid="input-instructor-content-payload" />
          </details>
          {selected?.id && (type === 'profile' || type === 'course') && <PayloadUpload
            draftId={selected.id}
            type={type}
            lang={lang}
            lessonCount={type === 'course' ? draftValues.lessons?.length ?? 0 : 0}
            recordingLessonIndex={recordingLessonIndex}
            onRecordingLessonChange={setRecordingLessonIndex}
            onUploaded={setUploadId}
          />}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" disabled={busy || !parsePayload(type, json)} onClick={() => void saveDraft(false)} className="inline-flex items-center gap-2 rounded-full border border-[#174d43] px-5 py-3 text-sm font-bold text-[#174d43] disabled:opacity-50" data-testid="button-save-instructor-content-draft">{busy ? strings.saving : strings.save}</button>
            <button type="button" disabled={busy || !parsePayload(type, json)} onClick={() => void saveDraft(true)} className="inline-flex items-center gap-2 rounded-full bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9] disabled:opacity-50" data-testid="button-submit-instructor-content-draft">{busy ? strings.submitting : strings.submit}<Send size={15} /></button>
          </div>
        </> : <div className="mt-6 rounded-2xl bg-[#f3f1e8] p-5"><p className="text-sm font-bold">{strings.unpublished}</p>{selected?.contentType === 'live_class' && selected.status === 'approved' && <p className="mt-2 text-sm leading-6 text-[#60756b]">{strings.livePending}</p>}{selected && <pre className="mt-5 max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#fffdf7] p-4 font-mono text-xs leading-6 text-[#485e53]">{editorPayload(selected)}</pre>}</div>}
      </>}
    </div>
  </section>;
}

export function InstructorContentWorkspace({ lang: inheritedLanguage }: { lang?: Language }) {
  const [localLanguage, setLocalLanguage] = useState<Language>(languageFromStorage);
  const lang = inheritedLanguage ?? localLanguage;
  const changeLanguage = (next: Language) => {
    setLocalLanguage(next);
    window.localStorage.setItem('maydango-partner-language', next);
  };
  const portal = useGetInstructorPortal({ query: { queryKey: getGetInstructorPortalQueryKey(), retry: false } });
  return <WorkspaceFrame lang={lang} onLanguage={inheritedLanguage ? undefined : changeLanguage}>
    {portal.isLoading ? <div className="space-y-3 rounded-3xl bg-[#fffdf7] p-8" aria-label={labels[lang].loading}>{[0, 1, 2].map((item) => <div key={item} className="h-8 animate-pulse rounded bg-[#eeeade]" />)}</div>
      : portal.isError ? <div role="alert" className="rounded-3xl border border-[#e4c3b7] bg-[#fff5f1] p-6 text-sm text-[#8f352a]">{labels[lang].failure}<button type="button" onClick={() => void portal.refetch()} className="ms-4 font-bold underline">{labels[lang].retry}</button></div>
        : portal.data?.accessStatus === 'approved' ? <InstructorDrafts lang={lang} /> : <div className="rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-8 text-sm leading-7 text-[#536b61]">{labels[lang].unpublished}</div>}
  </WorkspaceFrame>;
}

export function AdminInstructorContentPage() {
  const [lang, setLang] = useState<Language>(languageFromStorage);
  const queryClient = useQueryClient();
  const queue = useGetInstructorContentDraftsForReview({ query: { queryKey: getGetInstructorContentDraftsForReviewQueryKey(), retry: false } });
  const decision = useDecideInstructorContentDraft();
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const strings = labels[lang];
  const drafts = queue.data?.drafts ?? [];
  const selected = drafts.find((draft) => draft.id === selectedId);
  const filtered = useMemo(() => drafts.filter((draft) => `${localizedTitle(draft, lang)} ${(draft as InstructorContentReviewDraft).instructorUserId} ${draft.contentType}`.toLowerCase().includes(search.toLowerCase())), [drafts, lang, search]);
  const decide = async (choice: 'approve' | 'request_changes' | 'reject') => {
    if (!selected) return;
    if (choice !== 'approve' && reason.trim().length < 5) { setError(strings.reasonHint); return; }
    if (choice === 'approve' && selected.contentType === 'live_class' && !partnerId) { setError(strings.choosePartner); return; }
    setError(''); setNotice('');
    try {
      const data = {
        decision: choice,
        ...(choice === 'approve' && selected.contentType === 'live_class' ? { partnerId } : {}),
        ...(choice !== 'approve' ? { reason: reason.trim() } : {}),
      } as const;
      const result = await decision.mutateAsync({ id: selected.id, data });
      setNotice(result.partnerReviewPending ? strings.partnerPending : strings.decided);
      setReason(''); setPartnerId('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetInstructorContentDraftsForReviewQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetInstructorContentDraftsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetInstructorPortalQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetPublicInstructorProfilesQueryKey() }),
      ]);
    } catch { setError(strings.decisionError); }
  };
  const changeLanguage = (next: Language) => {
    setLang(next);
    window.localStorage.setItem('maydango-partner-language', next);
  };
  return <WorkspaceFrame lang={lang} admin onLanguage={changeLanguage}>
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a05b3e]">{strings.queue}</p><p className="mt-1 font-display text-xl font-bold">{drafts.length.toString().padStart(2, '0')}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f3eadb] text-[#a05b3e]"><ShieldCheck size={19} /></span></div>
        <label className="mt-5 block"><span className="sr-only">{strings.search}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={strings.search} className="h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#faf8f0] px-4 text-sm" /></label>
        {queue.isLoading ? <div className="mt-5 space-y-3" aria-label={strings.loading}>{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-[#eeeade]" />)}</div>
          : queue.isError ? <div role="alert" className="mt-5 rounded-xl border border-[#e4c3b7] bg-[#fff5f1] p-4 text-sm text-[#8f352a]">{strings.failure}<button type="button" onClick={() => void queue.refetch()} className="ms-3 font-bold underline">{strings.retry}</button></div>
            : !filtered.length ? <div className="mt-5 rounded-2xl border border-dashed border-[#d8d2c4] p-8 text-center"><Check className="mx-auto text-[#577b5e]" size={24} /><p className="mt-3 text-sm font-semibold">{strings.noQueue}</p></div>
              : <div className="mt-5 space-y-2">{filtered.map((draft) => <button key={draft.id} type="button" onClick={() => { setSelectedId(draft.id); setReason(''); setError(''); setNotice(''); }} className={`w-full rounded-2xl border p-4 text-start ${selectedId === draft.id ? 'border-[#174d43] bg-[#edf2e9]' : 'border-[#e3dfd3] bg-[#faf8f0] hover:border-[#b9c6b5]'}`} data-testid={`button-review-instructor-content-${draft.id}`}>
                <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold">{localizedTitle(draft, lang)}</span><ChevronRight size={15} /></span><span className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-[#8b7564]">{strings[draft.contentType]}</span><span className="truncate text-[10px] text-[#718077]">{draft.instructorUserId}</span></span>
              </button>)}</div>}
      </aside>
      <section className="min-w-0 rounded-3xl border border-[#d8d2c4] bg-[#fffdf7] p-5 shadow-sm sm:p-7">
        {!selected ? <div className="flex min-h-80 flex-col items-center justify-center text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f3eadb] text-[#a05b3e]"><FileText size={21} /></span><p className="mt-4 max-w-sm text-sm leading-6 text-[#718077]">{strings.select}</p></div> : <>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e3dfd3] pb-5"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a05b3e]">{strings.type} · {strings[selected.contentType]}</p><h2 className="mt-1 font-display text-2xl font-bold">{localizedTitle(selected, lang)}</h2><p className="mt-2 text-xs text-[#718077]">{strings.submittedBy}: {selected.instructorUserId}</p></div><StatusPill status={selected.status} lang={lang} /></header>
          <div className="mt-5 rounded-xl bg-[#f3f1e8] p-4"><p className="text-sm font-bold">{strings.publicTitle}</p><p className="mt-1 text-xs text-[#718077]">{strings.unpublished}</p></div>
          <div className="mt-5"><p className="text-xs font-bold uppercase tracking-wide text-[#718077]">{strings.payload}</p><pre className="mt-2 max-h-[460px] overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-[#f8f7f1] p-5 font-mono text-xs leading-6 text-[#485e53]">{editorPayload(selected)}</pre></div>
          {reviewUploadIds(selected).length > 0 && <div className="mt-5 rounded-2xl border border-[#e3dfd3] bg-[#fbfaf5] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#718077]">{strings.attachedFiles}</p>
            {selected.contentType === 'profile' && typeof (selected.payload as unknown as Record<string, unknown>).photoUploadId === 'string' && <img
              src={`/api/operations/instructor-content-drafts/${selected.id}/uploads/${String((selected.payload as unknown as Record<string, unknown>).photoUploadId)}/file`}
              alt={strings.photoSelected}
              loading="lazy"
              className="mt-3 h-24 w-24 rounded-2xl object-cover"
            />}
            <ul className="mt-3 space-y-2">
              {reviewUploadIds(selected).map((uploadId) => <li key={uploadId}>
                <a href={`/api/operations/instructor-content-drafts/${selected.id}/uploads/${uploadId}/file`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#174d43] underline underline-offset-4">
                  {strings.openFile} · {uploadId.slice(0, 8)}
                </a>
              </li>)}
            </ul>
          </div>}
          {selected.status === 'submitted' || selected.status === 'processing' ? <div className="mt-6 border-t border-[#e3dfd3] pt-5">
            {selected.contentType === 'live_class' && <label className="mb-4 block text-xs font-bold">{strings.partner}<select value={partnerId} onChange={(event) => setPartnerId(event.target.value)} className="mt-2 block h-11 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 text-sm"><option value="">{strings.choosePartner}</option>{(queue.data?.partners ?? []).map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select>{!queue.data?.partners.length && <span className="mt-2 block font-normal text-[#9a4435]">{strings.noPartners}</span>}</label>}
            <label className="block text-xs font-bold">{strings.reason}<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} placeholder={strings.reasonHint} className="mt-2 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] p-3 text-sm" /></label>
            {error && <p role="alert" className="mt-3 text-sm text-[#9a4435]">{error}</p>}{notice && <p role="status" className="mt-3 rounded-xl bg-[#eef5eb] p-3 text-sm text-[#2d6d4a]">{notice}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={decision.isPending} onClick={() => void decide('reject')} className="rounded-full border border-[#a55343] px-4 py-2.5 text-xs font-bold text-[#944632] disabled:opacity-50">{strings.reject}</button>
              <button type="button" disabled={decision.isPending} onClick={() => void decide('request_changes')} className="rounded-full border border-[#bd9551] px-4 py-2.5 text-xs font-bold text-[#785c25] disabled:opacity-50">{strings.requestChanges}</button>
              <button type="button" disabled={decision.isPending} onClick={() => void decide('approve')} className="inline-flex items-center gap-2 rounded-full bg-[#174d43] px-5 py-2.5 text-xs font-bold text-[#fff9e9] disabled:opacity-50">{decision.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}{strings.approve}</button>
            </div>
          </div> : <div className="mt-5 rounded-xl border border-[#c8dec9] bg-[#eef5eb] p-4 text-sm text-[#2d6d4a]">{selected.contentType === 'live_class' && selected.status === 'approved' ? strings.livePending : strings.decided}</div>}
        </>}
      </section>
    </div>
  </WorkspaceFrame>;
}
