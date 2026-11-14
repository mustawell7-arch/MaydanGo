import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetFinanceAuditQueryKey,
  getGetFinanceOverviewQueryKey,
  useCreateFinanceInvoiceCorrection,
} from '@workspace/api-client-react';
import { FilePlus2, History } from 'lucide-react';

type Language = 'en' | 'ar' | 'ku';
type InvoiceType = 'customer' | 'partner';
type CorrectionType =
  | 'full_refund'
  | 'partial_refund'
  | 'incorrect_charge'
  | 'membership_cancellation'
  | 'event_cancellation'
  | 'duplicate_payment'
  | 'pricing_correction'
  | 'tax_correction';

export type CorrectionInvoiceOption = {
  invoiceType: InvoiceType;
  invoiceId: string;
  label: string;
  retentionUntil: string;
};

export type FinanceInvoiceCorrectionRow = {
  id: string;
  membershipBillingId: string | null;
  partnerInvoiceId: string | null;
  correctionType: CorrectionType;
  amountIqd: number | null;
  refundTransactionReference: string | null;
  reason: string;
  createdBy: string;
  createdAt: string;
  retentionUntil: string;
};

const correctionTypes: CorrectionType[] = [
  'full_refund',
  'partial_refund',
  'incorrect_charge',
  'membership_cancellation',
  'event_cancellation',
  'duplicate_payment',
  'pricing_correction',
  'tax_correction',
];

const copy: Record<Language, Record<string, string>> = {
  en: {
    title: 'Invoice corrections',
    retentionNotice: 'Finance invoices, tax details, and correction records are retained for at least 10 years. This is MaydanGo’s current choice, not confirmed legal advice; records are not deleted automatically.',
    correctionNotice: 'This records a correction only. It does not change the original invoice or send or refund money.',
    invoice: 'Original invoice',
    chooseInvoice: 'Choose an invoice',
    correctionType: 'Correction type',
    reason: 'Reason and details',
    amount: 'Credit amount (IQD, optional)',
    refundReference: 'Refund transaction reference (optional)',
    recordCorrection: 'Record correction',
    saved: 'Correction record saved.',
    failed: 'Could not save the correction record. Please retry.',
    empty: 'No invoice corrections have been recorded.',
    history: 'Correction history',
    type: 'Type',
    source: 'Invoice',
    staff: 'Recorded by',
    created: 'Recorded',
    retainUntil: 'Retained until',
    amountValue: 'Credit amount',
    refundRef: 'Refund reference',
    customer: 'Customer invoice',
    partner: 'Partner invoice',
    full_refund: 'Full refund',
    partial_refund: 'Partial refund',
    incorrect_charge: 'Incorrect charge',
    membership_cancellation: 'Membership cancellation',
    event_cancellation: 'Event cancellation',
    duplicate_payment: 'Duplicate payment',
    pricing_correction: 'Pricing correction',
    tax_correction: 'Tax correction',
  },
  ar: {
    title: 'تصحيحات الفواتير',
    retentionNotice: 'تُحتفظ بفواتير المالية وتفاصيل الضرائب وسجلات التصحيح لمدة لا تقل عن 10 سنوات. هذا اختيار MaydanGo الحالي وليس رأياً قانونياً مؤكداً؛ ولا تُحذف السجلات تلقائياً.',
    correctionNotice: 'يسجل هذا التصحيح فقط. لا يغيّر الفاتورة الأصلية ولا يرسل أموالاً أو يعيدها.',
    invoice: 'الفاتورة الأصلية',
    chooseInvoice: 'اختر فاتورة',
    correctionType: 'نوع التصحيح',
    reason: 'السبب والتفاصيل',
    amount: 'مبلغ الإشعار الدائن (دينار عراقي، اختياري)',
    refundReference: 'مرجع معاملة الاسترداد (اختياري)',
    recordCorrection: 'تسجيل التصحيح',
    saved: 'تم حفظ سجل التصحيح.',
    failed: 'تعذر حفظ سجل التصحيح. يرجى المحاولة مجدداً.',
    empty: 'لا توجد تصحيحات فواتير مسجلة.',
    history: 'سجل التصحيحات',
    type: 'النوع',
    source: 'الفاتورة',
    staff: 'سجله',
    created: 'تاريخ التسجيل',
    retainUntil: 'الاحتفاظ حتى',
    amountValue: 'مبلغ الإشعار الدائن',
    refundRef: 'مرجع الاسترداد',
    customer: 'فاتورة عميل',
    partner: 'فاتورة شريك',
    full_refund: 'استرداد كامل',
    partial_refund: 'استرداد جزئي',
    incorrect_charge: 'مبلغ محصّل بالخطأ',
    membership_cancellation: 'إلغاء العضوية',
    event_cancellation: 'إلغاء الفعالية',
    duplicate_payment: 'دفعة مكررة',
    pricing_correction: 'تصحيح السعر',
    tax_correction: 'تصحيح الضريبة',
  },
  ku: {
    title: 'چاکسازیی پسووڵەکان',
    retentionNotice: 'پسووڵە داراییەکان، وردەکاریی باج و تۆماری چاکسازی بۆ لانیکەم 10 ساڵ دەپارێزرێن. ئەمە بڕیاری ئێستای MaydanGo ـیە، نەک ڕاوێژی یاسایی پشتڕاستکراو؛ تۆمارەکان بە شێوەی خۆکار ناسڕدرێنەوە.',
    correctionNotice: 'ئەمە تەنها چاکسازییەک تۆمار دەکات. پسووڵەی ڕەسەن ناگۆڕێت و هیچ پارەیەک نانێرێت یان ناگەڕێنێتەوە.',
    invoice: 'پسووڵەی ڕەسەن',
    chooseInvoice: 'پسووڵەیەک هەڵبژێرە',
    correctionType: 'جۆری چاکسازی',
    reason: 'هۆکار و وردەکاری',
    amount: 'بڕی بڕوانامەی قەرز (دیناری عێراقی، ئارەزوومەندانە)',
    refundReference: 'ژمارەی بەدواداچوونی گەڕاندنەوە (ئارەزوومەندانە)',
    recordCorrection: 'تۆمارکردنی چاکسازی',
    saved: 'تۆماری چاکسازی پاشەکەوت کرا.',
    failed: 'نەتوانرا تۆماری چاکسازی پاشەکەوت بکرێت. تکایە دووبارە هەوڵ بدەرەوە.',
    empty: 'هیچ چاکسازییەکی پسووڵە تۆمار نەکراوە.',
    history: 'مێژووی چاکسازی',
    type: 'جۆر',
    source: 'پسووڵە',
    staff: 'تۆمارکەر',
    created: 'تۆمارکراوە',
    retainUntil: 'پاراستن تا',
    amountValue: 'بڕی بڕوانامەی قەرز',
    refundRef: 'ژمارەی گەڕاندنەوە',
    customer: 'پسووڵەی کڕیار',
    partner: 'پسووڵەی هاوبەش',
    full_refund: 'گەڕاندنەوەی تەواو',
    partial_refund: 'گەڕاندنەوەی بەشێک',
    incorrect_charge: 'پارەی بە هەڵە وەرگیراو',
    membership_cancellation: 'هەڵوەشاندنەوەی ئەندامێتی',
    event_cancellation: 'هەڵوەشاندنەوەی چالاکی',
    duplicate_payment: 'پارەدانی دووبارە',
    pricing_correction: 'چاکسازیی نرخ',
    tax_correction: 'چاکسازیی باج',
  },
};

const inputClass = 'w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2 text-sm text-[#173d35] outline-none focus:border-[#28695a] focus:ring-2 focus:ring-[#28695a]/15';
const formatDate = (value: string, language: Language) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const locale = language === 'ar' ? 'ar-IQ' : language === 'ku' ? 'ku-IQ' : 'en-IQ';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Baghdad' }).format(date);
};
const formatAmount = (value: number | null, language: Language) => value == null
  ? '—'
  : new Intl.NumberFormat(language === 'ar' ? 'ar-IQ' : language === 'ku' ? 'ku-IQ' : 'en-IQ').format(value);

export default function FinanceInvoiceCorrections({
  language,
  invoices,
  records,
}: {
  language: Language;
  invoices: CorrectionInvoiceOption[];
  records: FinanceInvoiceCorrectionRow[];
}) {
  const queryClient = useQueryClient();
  const mutation = useCreateFinanceInvoiceCorrection();
  const text = copy[language];
  const rtl = language !== 'en';
  const [invoiceId, setInvoiceId] = useState('');
  const [correctionType, setCorrectionType] = useState<CorrectionType>('tax_correction');
  const [reason, setReason] = useState('');
  const [amountIqd, setAmountIqd] = useState('');
  const [refundTransactionReference, setRefundTransactionReference] = useState('');
  const [feedback, setFeedback] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const source = invoices.find(invoice => `${invoice.invoiceType}:${invoice.invoiceId}` === invoiceId);
    if (!source || reason.trim().length < 5) return;
    mutation.mutate({
      data: {
        invoiceType: source.invoiceType,
        invoiceId: source.invoiceId,
        correctionType,
        ...(amountIqd ? { amountIqd: Number(amountIqd) } : {}),
        ...(refundTransactionReference.trim() ? { refundTransactionReference: refundTransactionReference.trim() } : {}),
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      },
    }, {
      onSuccess: async () => {
        setReason('');
        setAmountIqd('');
        setRefundTransactionReference('');
        setFeedback(text.saved);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetFinanceOverviewQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetFinanceAuditQueryKey() }),
        ]);
      },
      onError: () => setFeedback(text.failed),
    });
  };

  return <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-5">
    <p role="note" className="rounded-2xl border border-[#e1c38f] bg-[#fff5dc] p-4 text-sm leading-6 text-[#694e2e]" data-testid="finance-retention-notice">
      {text.retentionNotice}
    </p>

    <section className="rounded-2xl border border-[#ded8c9] bg-[#fffdf7] shadow-[0_8px_24px_rgba(39,61,49,.04)]">
      <div className="border-b border-[#eee9de] px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[#173d35]"><FilePlus2 size={16} />{text.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-[#738078]">{text.correctionNotice}</p>
      </div>
      <form onSubmit={submit} className="grid gap-3 p-5 sm:grid-cols-2">
        <label className="text-xs font-semibold sm:col-span-2">{text.invoice}
          <select required value={invoiceId} onChange={event => setInvoiceId(event.target.value)} className={`${inputClass} mt-1`} data-testid="select-correction-invoice">
            <option value="">{text.chooseInvoice}</option>
            {invoices.map(invoice => <option key={`${invoice.invoiceType}:${invoice.invoiceId}`} value={`${invoice.invoiceType}:${invoice.invoiceId}`}>{invoice.label} · {text.retainUntil}: {formatDate(invoice.retentionUntil, language)}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">{text.correctionType}
          <select value={correctionType} onChange={event => setCorrectionType(event.target.value as CorrectionType)} className={`${inputClass} mt-1`} data-testid="select-correction-type">
            {correctionTypes.map(type => <option key={type} value={type}>{text[type]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">{text.amount}
          <input type="number" min="1" max="1000000000" value={amountIqd} onChange={event => setAmountIqd(event.target.value)} className={`${inputClass} mt-1`} data-testid="input-correction-amount" />
        </label>
        <label className="text-xs font-semibold sm:col-span-2">{text.refundReference}
          <input maxLength={160} value={refundTransactionReference} onChange={event => setRefundTransactionReference(event.target.value)} className={`${inputClass} mt-1`} data-testid="input-correction-refund-reference" />
        </label>
        <label className="text-xs font-semibold sm:col-span-2">{text.reason}
          <textarea required minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className={`${inputClass} mt-1 min-h-24 resize-y`} data-testid="textarea-correction-reason" />
        </label>
        {feedback && <p role="status" className="text-sm text-[#315e42] sm:col-span-2" data-testid="status-correction-feedback">{feedback}</p>}
        <button type="submit" disabled={!invoiceId || reason.trim().length < 5 || mutation.isPending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#174d43] px-4 py-2 text-sm font-bold text-[#fff9e9] disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2" data-testid="button-record-correction">
          <FilePlus2 size={15} />{text.recordCorrection}
        </button>
      </form>
    </section>

    <section className="rounded-2xl border border-[#ded8c9] bg-[#fffdf7] shadow-[0_8px_24px_rgba(39,61,49,.04)]">
      <div className="flex items-center gap-2 border-b border-[#eee9de] px-5 py-4">
        <History size={16} className="text-[#a76445]" />
        <h2 className="text-sm font-bold text-[#173d35]">{text.history}</h2>
      </div>
      {records.length ? <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead><tr className="bg-[#f7f4eb] text-[10px] uppercase tracking-[.1em] text-[#78857c]">
            {[text.source, text.type, text.reason, text.amountValue, text.refundRef, text.staff, text.created, text.retainUntil].map(label => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}
          </tr></thead>
          <tbody>{records.map(record => {
            const invoiceType = record.membershipBillingId ? 'customer' : 'partner';
            const invoiceIdValue = record.membershipBillingId ?? record.partnerInvoiceId ?? '—';
            return <tr key={record.id} className="border-t border-[#eee9de]" data-testid={`row-invoice-correction-${record.id}`}>
              <td className="px-4 py-3"><span className="font-semibold">{text[invoiceType]}</span><span className="mt-1 block max-w-56 truncate font-mono text-[10px] text-[#78857c]" title={invoiceIdValue}>{invoiceIdValue}</span></td>
              <td className="px-4 py-3">{text[record.correctionType]}</td>
              <td className="max-w-64 whitespace-normal px-4 py-3">{record.reason}</td>
              <td className="px-4 py-3 font-mono">{formatAmount(record.amountIqd, language)}</td>
              <td className="px-4 py-3 font-mono">{record.refundTransactionReference || '—'}</td>
              <td className="px-4 py-3 font-mono">{record.createdBy}</td>
              <td className="px-4 py-3">{formatDate(record.createdAt, language)}</td>
              <td className="px-4 py-3">{formatDate(record.retentionUntil, language)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <p className="px-6 py-12 text-center text-sm text-[#738078]" data-testid="state-empty-corrections">{text.empty}</p>}
    </section>
  </div>;
}
