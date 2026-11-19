import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetFraudInvestigationQueueQueryKey,
  useCreateFraudInvestigation,
  useGetFraudInvestigationQueue,
  useUpdateFraudInvestigation,
} from '@workspace/api-client-react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import type { PortalLanguage } from '@/pages/partner-operations';

const copy = {
  en: {
    title: 'Fraud and safety review',
    intro: 'Risk flags are prompts for review, not proof of wrongdoing. No account is suspended from this screen.',
    empty: 'No flagged QR activity is currently available for review.',
    loadError: 'Risk signals could not be loaded.',
    flagged: 'Flagged QR activity',
    accountReference: 'Account reference',
    open: 'Open investigation',
    openStatus: 'Open',
    underReview: 'Under review',
    resolvedNoAction: 'Resolved — no action',
    actionTaken: 'Resolved — action taken',
    beginReview: 'Begin review',
    decision: 'Review outcome',
    resolutionReason: 'Explain the outcome',
    chooseDecision: 'Choose an outcome',
    resolveNoAction: 'No further action',
    confirmActionTaken: 'Action taken',
    saveResolution: 'Save outcome',
    saved: 'Investigation updated.',
    saveError: 'The investigation could not be updated. Refresh and try again.',
    loading: 'Loading risk signals…',
    retry: 'Retry',
  },
  ar: {
    title: 'مراجعة الاحتيال والسلامة',
    intro: 'التنبيهات مؤشرات تستدعي المراجعة وليست دليلاً على مخالفة. لا يتم إيقاف أي حساب من هذه الصفحة.',
    empty: 'لا توجد حالياً أنشطة QR معلّمة للمراجعة.',
    loadError: 'تعذر تحميل مؤشرات المخاطر.',
    flagged: 'نشاط QR معلّم للمراجعة',
    accountReference: 'مرجع الحساب',
    open: 'فتح تحقيق',
    openStatus: 'مفتوح',
    underReview: 'قيد المراجعة',
    resolvedNoAction: 'أُغلق دون إجراء',
    actionTaken: 'أُغلق بعد اتخاذ إجراء',
    beginReview: 'بدء المراجعة',
    decision: 'نتيجة المراجعة',
    resolutionReason: 'اشرح النتيجة',
    chooseDecision: 'اختر النتيجة',
    resolveNoAction: 'لا يلزم إجراء إضافي',
    confirmActionTaken: 'تم اتخاذ إجراء',
    saveResolution: 'حفظ النتيجة',
    saved: 'تم تحديث التحقيق.',
    saveError: 'تعذر تحديث التحقيق. حدّث الصفحة ثم حاول مرة أخرى.',
    loading: 'جارٍ تحميل مؤشرات المخاطر…',
    retry: 'إعادة المحاولة',
  },
  ku: {
    title: 'پێداچوونەوەی ساختەکاری و سەلامەتی',
    intro: 'ئاگادارکردنەوەکان نیشانەی پێداچوونەوەن، نەک بەڵگەی هەڵەکاری. لەم پەڕەیەدا هیچ هەژمارێک ڕاناگیرێت.',
    empty: 'ئێستا هیچ چالاکی QR ـێکی نیشان‌کراو بۆ پێداچوونەوە نییە.',
    loadError: 'بارکردنی نیشانەکانی مەترسی سەرکەوتوو نەبوو.',
    flagged: 'چالاکی QR ـی نیشان‌کراو',
    accountReference: 'ناسنامەی هەژمار',
    open: 'کردنەوەی لێکۆڵینەوە',
    openStatus: 'کراوە',
    underReview: 'لە پێداچوونەوەدایە',
    resolvedNoAction: 'بەبێ هەنگاوی زیاتر کۆتایی پێهات',
    actionTaken: 'دوای هەنگاوی جێبەجێکراو کۆتایی پێهات',
    beginReview: 'دەستپێکردنی پێداچوونەوە',
    decision: 'ئەنجامی پێداچوونەوە',
    resolutionReason: 'ئەنجامەکە ڕوون بکەرەوە',
    chooseDecision: 'ئەنجامێک هەڵبژێرە',
    resolveNoAction: 'هەنگاوی زیاتر پێویست نییە',
    confirmActionTaken: 'هەنگاو جێبەجێ کراوە',
    saveResolution: 'پاشەکەوتکردنی ئەنجام',
    saved: 'لێکۆڵینەوەکە نوێکرایەوە.',
    saveError: 'نوێکردنەوەی لێکۆڵینەوەکە سەرکەوتوو نەبوو. پەڕەکە نوێ بکەرەوە و دووبارە هەوڵ بدە.',
    loading: 'نیشانەکانی مەترسی بار دەکرێن…',
    retry: 'دووبارە هەوڵ بدە',
  },
} as const;

type CopyKey = keyof typeof copy.en;
type ResolutionStatus = 'resolved_no_action' | 'action_taken';
const text = (lang: PortalLanguage, key: CopyKey) => copy[lang][key];
const inputClass = 'mt-1 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm text-[#173d35] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#174d43] px-4 py-2.5 text-sm font-semibold text-[#fff9e9] hover:bg-[#226556] disabled:opacity-50';

function dateLabel(value: string, lang: PortalLanguage) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : lang === 'ku' ? 'ckb-IQ' : 'en-IQ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Baghdad',
    numberingSystem: 'latn',
  }).format(new Date(value));
}

export function FraudInvestigationReview({ lang }: { lang: PortalLanguage }) {
  const queryClient = useQueryClient();
  const query = useGetFraudInvestigationQueue({
    query: { refetchOnMount: 'always', retry: false },
  });
  const createInvestigation = useCreateFraudInvestigation();
  const updateInvestigation = useUpdateFraudInvestigation();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetFraudInvestigationQueueQueryKey() });
    setNotice(text(lang, 'saved'));
    setError('');
  };
  const openInvestigation = async (sourceActivityId: string) => {
    setNotice('');
    setError('');
    try {
      await createInvestigation.mutateAsync({ data: { sourceActivityId } });
      await refresh();
    } catch {
      setError(text(lang, 'saveError'));
    }
  };
  const updateStatus = async (
    id: string,
    status: 'under_review' | ResolutionStatus,
    resolutionReason?: string,
  ) => {
    setNotice('');
    setError('');
    try {
      await updateInvestigation.mutateAsync({
        id,
        data: { status, ...(resolutionReason ? { resolutionReason } : {}) },
      });
      await refresh();
    } catch {
      setError(text(lang, 'saveError'));
    }
  };

  return <section dir={lang === 'en' ? 'ltr' : 'rtl'} aria-labelledby="fraud-review-title" className="rounded-3xl border border-[#e5b5a5] bg-[#fff5f1] p-5 sm:p-6" data-testid="section-fraud-investigations">
    <div className="flex items-start gap-3">
      <AlertTriangle size={19} className="mt-1 shrink-0 text-[#9a4435]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="fraud-review-title" className="font-display text-xl font-bold">{text(lang, 'title')}</h3>
          <button type="button" onClick={() => void query.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-[#d8d2c4] bg-white/70 px-3 py-2 text-xs font-semibold" aria-label={text(lang, 'retry')}>
            <RefreshCw size={14} />{text(lang, 'retry')}
          </button>
        </div>
        <p className="mt-1 text-sm leading-6 text-[#76564d]">{text(lang, 'intro')}</p>
        {notice && <p role="status" className="mt-3 rounded-xl bg-[#e1efdf] px-4 py-3 text-sm text-[#2d6d4a]">{notice}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-[#9a4435]">{error}</p>}

        {query.isLoading
          ? <p className="mt-4 rounded-xl bg-white/80 p-4 text-sm text-[#687a71]" role="status">{text(lang, 'loading')}</p>
          : query.isError || !query.data
            ? <p className="mt-4 rounded-xl bg-white/80 p-4 text-sm text-[#9a4435]" role="alert">{text(lang, 'loadError')}</p>
            : query.data.length
              ? <div className="mt-4 space-y-3">
                {query.data.map(signal => {
                  const statusLabel = signal.investigationStatus === 'open' ? text(lang, 'openStatus')
                    : signal.investigationStatus === 'under_review' ? text(lang, 'underReview')
                      : signal.investigationStatus === 'resolved_no_action' ? text(lang, 'resolvedNoAction')
                        : signal.investigationStatus === 'action_taken' ? text(lang, 'actionTaken')
                          : null;
                  return <article key={signal.activityId} className="rounded-2xl border border-[#ebd1c8] bg-white/85 p-4" data-testid="card-fraud-signal">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold">{signal.facilityName} · {signal.city}</h4>
                        <p className="mt-1 text-xs text-[#687a71]">{signal.partnerName} · {dateLabel(signal.occurredAt, lang)}</p>
                      </div>
                      <span className="rounded-full bg-[#f2dfd5] px-2.5 py-1 text-[10px] font-bold text-[#9a4435]">{text(lang, 'flagged')}</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[#40564c]">{signal.action}</p>
                    <p className="mt-1 text-sm leading-6 text-[#51665e]">{signal.reason}</p>
                    {signal.actorId && <p className="mt-2 break-all text-xs text-[#687a71]">{text(lang, 'accountReference')}: {signal.actorId.slice(0, 12)}…</p>}

                    {!signal.investigationId
                      ? <button type="button" disabled={createInvestigation.isPending} onClick={() => void openInvestigation(signal.activityId)} className={`${buttonClass} mt-4`} data-testid="button-open-fraud-investigation">
                        <ShieldAlert size={15} />{text(lang, 'open')}
                      </button>
                      : <div className="mt-4 border-t border-[#ece7d9] pt-4">
                        <span className="rounded-full bg-[#f1eddf] px-2.5 py-1 text-xs font-bold">{statusLabel}</span>
                        {signal.investigationStatus === 'open' && <button type="button" disabled={updateInvestigation.isPending} onClick={() => void updateStatus(signal.investigationId!, 'under_review')} className={`${buttonClass} mt-3 block`} data-testid="button-begin-fraud-review">
                          {text(lang, 'beginReview')}
                        </button>}
                        {signal.investigationStatus === 'under_review' && <form key={`${signal.investigationId}-${signal.investigationUpdatedAt}`} onSubmit={event => {
                          event.preventDefault();
                          const values = new FormData(event.currentTarget);
                          const decision = String(values.get('decision')) as ResolutionStatus;
                          const reason = String(values.get('resolutionReason') ?? '').trim();
                          void updateStatus(signal.investigationId!, decision, reason);
                        }} className="mt-3 grid gap-3">
                          <label className="text-xs font-semibold">{text(lang, 'decision')}<select name="decision" required defaultValue="" className={inputClass}>
                            <option value="" disabled>{text(lang, 'chooseDecision')}</option>
                            <option value="resolved_no_action">{text(lang, 'resolveNoAction')}</option>
                            <option value="action_taken">{text(lang, 'confirmActionTaken')}</option>
                          </select></label>
                          <label className="text-xs font-semibold">{text(lang, 'resolutionReason')}<textarea required minLength={10} maxLength={1000} name="resolutionReason" defaultValue={signal.resolutionReason ?? ''} rows={2} className={inputClass} /></label>
                          <button type="submit" disabled={updateInvestigation.isPending} className={buttonClass}>{text(lang, 'saveResolution')}</button>
                        </form>}
                        {signal.resolutionReason && <p className="mt-3 rounded-xl bg-[#f7f4e9] p-3 text-xs leading-5"><strong>{text(lang, 'resolutionReason')}:</strong> {signal.resolutionReason}</p>}
                      </div>}
                  </article>;
                })}
              </div>
              : <p className="mt-4 rounded-xl bg-white/80 p-4 text-sm text-[#51665e]" data-testid="text-no-fraud-signals">{text(lang, 'empty')}</p>}
      </div>
    </div>
  </section>;
}
