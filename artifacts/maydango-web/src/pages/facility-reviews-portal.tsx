import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOperationsFacilityReviewsQueryKey, useGetOperationsFacilityReviews,
  useModerateFacilityReview, useRespondToFacilityReview, useSetFacilityReviewPrivilege,
} from '@workspace/api-client-react';
import type { OperationsFacilityReview } from '@workspace/api-client-react';
import { AlertTriangle, Flag, MessageSquareText, RefreshCw, Shield, Star } from 'lucide-react';
import type { PortalLanguage } from '@/pages/partner-operations';

const copy = {
  en: {
    title: 'Facility reviews',
    intro: 'Reviews are limited to confirmed visits. Keep responses respectful and do not request personal details.',
    allReviews: 'Recent reviews',
    noReviews: 'No reviews are available yet.',
    loadError: 'Reviews could not be loaded.',
    retry: 'Retry',
    status: 'Status',
    published: 'Published',
    hidden: 'Hidden',
    removed: 'Removed',
    reviewBy: 'Member reference',
    verified: 'Confirmed visit',
    reports: 'Reports',
    noReports: 'No reports',
    abusive: 'Abusive content',
    personal_information: 'Personal information',
    misleading: 'Misleading',
    other: 'Other',
    open: 'Open',
    reviewed: 'Reviewed',
    moderation: 'Moderation decision',
    reason: 'Decision reason',
    reasonHint: 'Explain the moderation decision',
    saveModeration: 'Save decision',
    partnerResponse: 'Partner response',
    responseHint: 'Reply publicly and avoid identifying the member.',
    response: 'Response',
    saveResponse: 'Publish response',
    updateResponse: 'Update response',
    suspend: 'Suspend review access',
    restore: 'Restore review access',
    privilegeReason: 'Reason for access decision',
    privilegeHint: 'Record a brief reason',
    saved: 'Review decision saved.',
    responseSaved: 'Partner response saved.',
    privilegeSaved: 'Review access updated.',
    saveError: 'The change could not be saved. Check the details and retry.',
    rating: 'Overall rating',
    noComment: 'This member left a rating without a written comment.',
    categoryRatings: 'Category ratings',
    cleanliness: 'Cleanliness',
    staff: 'Staff',
    equipment: 'Equipment',
    instructor: 'Instructor',
    facilities: 'Facilities',
    informationAccuracy: 'Information accuracy',
  },
  ar: {
    title: 'تقييمات المرافق',
    intro: 'تُسمح التقييمات بعد تأكيد الزيارة. ليكن الرد محترماً ولا تطلب معلومات شخصية.',
    allReviews: 'أحدث التقييمات',
    noReviews: 'لا توجد تقييمات بعد.',
    loadError: 'تعذر تحميل التقييمات.',
    retry: 'إعادة المحاولة',
    status: 'الحالة',
    published: 'منشور',
    hidden: 'مخفي',
    removed: 'تمت إزالته',
    reviewBy: 'مرجع العضو',
    verified: 'زيارة مؤكدة',
    reports: 'البلاغات',
    noReports: 'لا توجد بلاغات',
    abusive: 'محتوى مسيء',
    personal_information: 'معلومات شخصية',
    misleading: 'مضلل',
    other: 'أخرى',
    open: 'مفتوح',
    reviewed: 'تمت مراجعته',
    moderation: 'قرار الإشراف',
    reason: 'سبب القرار',
    reasonHint: 'اشرح قرار الإشراف',
    saveModeration: 'حفظ القرار',
    partnerResponse: 'رد الشريك',
    responseHint: 'اكتب رداً عاماً ولا تكشف هوية العضو.',
    response: 'الرد',
    saveResponse: 'نشر الرد',
    updateResponse: 'تحديث الرد',
    suspend: 'تعليق حق التقييم',
    restore: 'إعادة حق التقييم',
    privilegeReason: 'سبب قرار الصلاحية',
    privilegeHint: 'اكتب سبباً مختصراً',
    saved: 'تم حفظ قرار التقييم.',
    responseSaved: 'تم حفظ رد الشريك.',
    privilegeSaved: 'تم تحديث صلاحية التقييم.',
    saveError: 'تعذر حفظ التغيير. تحقق من التفاصيل وحاول مرة أخرى.',
    rating: 'التقييم العام',
    noComment: 'أرسل العضو تقييماً دون تعليق مكتوب.',
    categoryRatings: 'تقييم الفئات',
    cleanliness: 'النظافة',
    staff: 'الموظفون',
    equipment: 'المعدات',
    instructor: 'المدرب',
    facilities: 'المرافق',
    informationAccuracy: 'دقة المعلومات',
  },
  ku: {
    title: 'هەڵسەنگاندنی شوێنەکان',
    intro: 'تەنها دوای پشتڕاستکردنەوەی سەردان ڕێگە بە هەڵسەنگاندن دەدرێت. بە ڕێزەوە وەڵام بدە و زانیاری کەسی داوا مەکە.',
    allReviews: 'نوێترین هەڵسەنگاندنەکان',
    noReviews: 'هێشتا هیچ هەڵسەنگاندنێک نییە.',
    loadError: 'بارکردنی هەڵسەنگاندنەکان سەرکەوتوو نەبوو.',
    retry: 'دووبارە هەوڵ بدە',
    status: 'دۆخ',
    published: 'بڵاوکراوەتەوە',
    hidden: 'شاردراوەتەوە',
    removed: 'لابراوە',
    reviewBy: 'ناسنامەی ئەندام',
    verified: 'سەردانی پشتڕاستکراو',
    reports: 'ڕاپۆرتەکان',
    noReports: 'هیچ ڕاپۆرتێک نییە',
    abusive: 'ناوەڕۆکی سووکایەتی',
    personal_information: 'زانیاری کەسی',
    misleading: 'گومڕاکەر',
    other: 'هیتر',
    open: 'کراوە',
    reviewed: 'پێداچوونەوەی بۆ کراوە',
    moderation: 'بڕیاری چاودێری',
    reason: 'هۆکاری بڕیار',
    reasonHint: 'هۆکاری بڕیاری چاودێری بنووسە',
    saveModeration: 'پاشەکەوتکردنی بڕیار',
    partnerResponse: 'وەڵامی هاوبەش',
    responseHint: 'وەڵامێکی گشتی بنووسە و ناسنامەی ئەندام ئاشکرا مەکە.',
    response: 'وەڵام',
    saveResponse: 'بڵاوکردنەوەی وەڵام',
    updateResponse: 'نوێکردنەوەی وەڵام',
    suspend: 'ڕاگرتنی مافی هەڵسەنگاندن',
    restore: 'گەڕاندنەوەی مافی هەڵسەنگاندن',
    privilegeReason: 'هۆکاری بڕیاری ماف',
    privilegeHint: 'هۆکارێکی کورت بنووسە',
    saved: 'بڕیاری هەڵسەنگاندن پاشەکەوت کرا.',
    responseSaved: 'وەڵامی هاوبەش پاشەکەوت کرا.',
    privilegeSaved: 'مافی هەڵسەنگاندن نوێکرایەوە.',
    saveError: 'پاشەکەوتکردن سەرکەوتوو نەبوو. وردەکارییەکان بپشکنە.',
    rating: 'هەڵسەنگاندنی گشتی',
    noComment: 'ئەندامەکە هەڵسەنگاندنی ناردووە بەبێ کۆمێنت.',
    categoryRatings: 'هەڵسەنگاندنی پۆلەکان',
    cleanliness: 'پاکوخاوێنی',
    staff: 'کارمەندان',
    equipment: 'کەرەستەکان',
    instructor: 'ڕاهێنەر',
    facilities: 'شوێن و خزمەتگوزارییەکان',
    informationAccuracy: 'دروستی زانیاری',
  },
} as const;
type CopyKey = keyof typeof copy.en;
const t = (language: PortalLanguage, key: CopyKey) => copy[language][key];
const inputClass = 'mt-1 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm text-[#173d35] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15';
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#174d43] px-4 py-2 text-xs font-semibold text-[#fff9e9] hover:bg-[#226556] disabled:opacity-50';
const locale = (language: PortalLanguage) => language === 'ar' ? 'ar-IQ' : language === 'ku' ? 'ckb-IQ' : 'en-IQ';
const formatDate = (value: string, language: PortalLanguage) => new Intl.DateTimeFormat(locale(language), {
  dateStyle: 'medium', timeZone: 'Asia/Baghdad', numberingSystem: 'latn',
}).format(new Date(value));

export function FacilityReviewsPortal({ language, isAdmin }: { language: PortalLanguage; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const query = useGetOperationsFacilityReviews({ query: { refetchOnMount: 'always', retry: false } });
  const moderate = useModerateFacilityReview();
  const respond = useRespondToFacilityReview();
  const setPrivilege = useSetFacilityReviewPrivilege();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const invalidate = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: getGetOperationsFacilityReviewsQueryKey() });
    setNotice(message);
    setError('');
  };

  const submitModeration = async (event: FormEvent<HTMLFormElement>, item: OperationsFacilityReview) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await moderate.mutateAsync({
        id: item.id,
        data: {
          status: String(values.get('status')) as OperationsFacilityReview['status'],
          reason: String(values.get('reason') ?? '').trim(),
        },
      });
      await invalidate(t(language, 'saved'));
    } catch {
      setError(t(language, 'saveError'));
    }
  };
  const submitResponse = async (event: FormEvent<HTMLFormElement>, item: OperationsFacilityReview) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await respond.mutateAsync({ id: item.id, data: { response: String(values.get('response') ?? '').trim() } });
      await invalidate(t(language, 'responseSaved'));
    } catch {
      setError(t(language, 'saveError'));
    }
  };
  const submitPrivilege = async (event: FormEvent<HTMLFormElement>, item: OperationsFacilityReview) => {
    event.preventDefault();
    if (!item.reviewerUserId) return;
    const values = new FormData(event.currentTarget);
    try {
      await setPrivilege.mutateAsync({
        userId: item.reviewerUserId,
        data: {
          suspended: !item.reviewPrivilegeSuspended,
          reason: String(values.get('reason') ?? '').trim(),
        },
      });
      await invalidate(t(language, 'privilegeSaved'));
    } catch {
      setError(t(language, 'saveError'));
    }
  };

  if (query.isLoading) return <p data-testid="status-reviews-loading" className="rounded-2xl bg-[#fffdf7] p-6 text-sm text-[#687a71]" role="status">{t(language, 'allReviews')}…</p>;
  if (query.isError || !query.data) return <div data-testid="status-reviews-error" role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#fff7f3] p-5 text-sm text-[#9a4435]"><span>{t(language, 'loadError')}</span><button data-testid="button-reviews-retry" type="button" className="inline-flex items-center gap-2 font-semibold" onClick={() => void query.refetch()}><RefreshCw size={14} />{t(language, 'retry')}</button></div>;

  const statusText = (status: OperationsFacilityReview['status']) => t(language, status);
  const reportText = (reason: OperationsFacilityReview['reports'][number]['reason']) => t(language, reason);
  return <section dir={language === 'en' ? 'ltr' : 'rtl'} className="space-y-5">
    <header className="rounded-3xl bg-[#174d43] p-6 text-[#fff9e9] sm:p-8">
      <div className="flex items-center gap-3"><Star size={22} /><div><h2 className="font-display text-2xl font-bold">{t(language, 'title')}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#d1dfd6]">{t(language, 'intro')}</p></div></div>
    </header>
    {notice && <p role="status" className="rounded-xl bg-[#e1efdf] px-4 py-3 text-sm text-[#2d6d4a]">{notice}</p>}
    {error && <p role="alert" className="rounded-xl bg-[#fff7f3] px-4 py-3 text-sm text-[#9a4435]">{error}</p>}
    <h3 data-testid="text-reviews-title" className="font-display text-xl font-bold">{t(language, 'allReviews')}</h3>
    {query.data.reviews.length ? query.data.reviews.map(item => <article data-testid={`card-review-${item.id}`} key={item.id} className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-bold">{item.facility} · {item.city}</h4>
          <p data-testid={`text-review-rating-${item.id}`} className="mt-1 flex items-center gap-1.5 text-xs text-[#687a71]"><Star size={13} fill="currentColor" />{t(language, 'rating')}: {item.overallRating}/5 · {formatDate(item.createdAt, language)}</p>
        </div>
        <span data-testid={`status-review-${item.id}`} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.status === 'published' ? 'bg-[#e1efdf] text-[#2d6d4a]' : item.status === 'hidden' ? 'bg-[#fff0d6] text-[#8a5b20]' : 'bg-[#f2dfd5] text-[#9a4435]'}`}>{statusText(item.status)}</span>
      </div>
      {item.reviewerUserId && isAdmin && <p data-testid={`text-reviewer-reference-${item.id}`} className="mt-3 font-mono text-[10px] text-[#687a71]">{t(language, 'reviewBy')}: {item.reviewerUserId}</p>}
      {item.content ? <p data-testid={`text-review-content-${item.id}`} className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#51665e]">{item.content}</p> : <p className="mt-3 text-xs italic text-[#687a71]">{t(language, 'noComment')}</p>}
      <div className="mt-3 rounded-xl bg-[#f7f4e9] p-3">
        <p className="text-[10px] font-bold text-[#687a71]">{t(language, 'categoryRatings')}</p>
        <div data-testid={`ratings-review-${item.id}`} className="mt-2 flex flex-wrap gap-2 text-[10px] text-[#51665e]">
          {Object.entries(item.categoryRatings).filter(([, value]) => value !== null).map(([key, value]) => <span key={key} className="rounded-full bg-white px-2.5 py-1">{t(language, key as CopyKey)}: {value}/5</span>)}
        </div>
      </div>
      {item.reportCount > 0 && <div className="mt-4 rounded-2xl border border-[#e5c7aa] bg-[#fff8ef] p-4">
        <p data-testid={`text-report-count-${item.id}`} className="flex items-center gap-2 text-sm font-bold text-[#76532d]"><Flag size={15} />{t(language, 'reports')} · {item.reportCount}</p>
        <div className="mt-3 space-y-2">{item.reports.map(report => <div data-testid={`card-report-${report.id}`} key={report.id} className="rounded-xl bg-white/70 p-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{reportText(report.reason)}</span><span className="text-[#687a71]">{t(language, report.status)} · {formatDate(report.createdAt, language)}</span></div>
          {report.details && <p className="mt-2 leading-5 text-[#51665e]">{report.details}</p>}
        </div>)}</div>
      </div>}
      {isAdmin && item.reviewerUserId && <form key={`${item.id}-${item.updatedAt}`} onSubmit={event => void submitPrivilege(event, item)} className="mt-4 flex flex-wrap items-end gap-3 border-t border-[#ece7d9] pt-4">
        <label className="min-w-56 flex-1 text-xs font-semibold">{t(language, 'privilegeReason')}<input data-testid={`input-review-privilege-reason-${item.id}`} name="reason" required minLength={5} maxLength={500} placeholder={t(language, 'privilegeHint')} className={inputClass} /></label>
        <button data-testid={`button-review-privilege-${item.id}`} className={`${buttonClass} ${item.reviewPrivilegeSuspended ? 'bg-[#8a5b20] hover:bg-[#76532d]' : 'bg-[#9a4435] hover:bg-[#7f392d]'}`} disabled={setPrivilege.isPending}>
          <Shield size={14} />{item.reviewPrivilegeSuspended ? t(language, 'restore') : t(language, 'suspend')}
        </button>
      </form>}
      {isAdmin && <form key={`moderation-${item.id}-${item.updatedAt}`} onSubmit={event => void submitModeration(event, item)} className="mt-4 grid gap-3 border-t border-[#ece7d9] pt-4 sm:grid-cols-2">
        <label className="text-xs font-semibold">{t(language, 'status')}<select data-testid={`select-review-status-${item.id}`} name="status" defaultValue={item.status} className={inputClass}><option value="published">{t(language, 'published')}</option><option value="hidden">{t(language, 'hidden')}</option><option value="removed">{t(language, 'removed')}</option></select></label>
        <label className="text-xs font-semibold">{t(language, 'reason')}<input data-testid={`input-review-moderation-reason-${item.id}`} name="reason" required minLength={5} maxLength={500} defaultValue={item.moderationReason ?? ''} placeholder={t(language, 'reasonHint')} className={inputClass} /></label>
        <button data-testid={`button-moderate-review-${item.id}`} className={buttonClass} disabled={moderate.isPending}><AlertTriangle size={14} />{t(language, 'saveModeration')}</button>
      </form>}
      {!isAdmin && <form key={`response-${item.id}-${item.updatedAt}`} onSubmit={event => void submitResponse(event, item)} className="mt-4 grid gap-3 border-t border-[#ece7d9] pt-4">
        <label className="text-xs font-semibold">{t(language, 'partnerResponse')}<textarea data-testid={`input-partner-review-response-${item.id}`} name="response" required minLength={5} maxLength={2000} rows={3} defaultValue={item.partnerResponse ?? ''} placeholder={t(language, 'responseHint')} className={inputClass} /></label>
        <button data-testid={`button-partner-review-response-${item.id}`} className={buttonClass} disabled={respond.isPending}><MessageSquareText size={14} />{item.partnerResponse ? t(language, 'updateResponse') : t(language, 'saveResponse')}</button>
      </form>}
    </article>) : <p data-testid="empty-facility-reviews" className="rounded-2xl bg-[#fffdf7] p-6 text-sm text-[#75847c]">{t(language, 'noReviews')}</p>}
  </section>;
}
