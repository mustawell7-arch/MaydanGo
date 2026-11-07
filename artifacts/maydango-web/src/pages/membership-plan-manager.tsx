import { useState, type FormEvent, type ReactNode } from 'react';
import {
  useAddMembershipPlan,
  useReplaceMembershipPlan,
} from '@workspace/api-client-react';
import type { LivePlan, PlanInput } from '@workspace/api-client-react';
import { Check, CircleAlert, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react';

type Language = 'en' | 'ar' | 'ku';
type PlanTerms = NonNullable<PlanInput['rules']['planTerms']>;
type Rules = PlanInput['rules'];
type LimitKey = 'facilityLimits' | 'categoryLimits' | 'partnerGroupLimits';
type NameListKey = 'cities' | 'facilities' | 'categories';

const copy: Record<Language, Record<string, string>> = {
  en: {
    title: 'Membership plans',
    intro: 'Set plan access and terms here. Checkout and payment collection remain off.',
    create: 'Create plan',
    edit: 'Edit',
    save: 'Save plan',
    cancel: 'Cancel',
    retry: 'Retry',
    loading: 'Loading plans…',
    loadError: 'Plans could not be loaded.',
    empty: 'No membership plans have been created.',
    name: 'Plan name',
    description: 'Description',
    descriptionEn: 'English',
    descriptionAr: 'Arabic',
    descriptionKu: 'Sorani Kurdish',
    tier: 'Membership tier',
    type: 'Plan type',
    paid: 'Paid',
    trial: 'Trial',
    corporate: 'Corporate',
    active: 'Publish as active',
    monthlyPrice: 'Monthly price (IQD)',
    duration: 'Plan duration (days)',
    trialDays: 'Trial period (days)',
    minContract: 'Minimum contract (months)',
    renewal: 'Renewal period (days)',
    cancellation: 'Cancellation notice (days)',
    autoRenew: 'Automatic renewal',
    pause: 'Pause allowance (days)',
    protection: 'Price protection (months)',
    promoPrice: 'Promotional price (IQD)',
    corporatePrice: 'Corporate price (IQD)',
    digital: 'Digital-content access',
    guestPasses: 'Guest passes per term',
    eventAccess: 'Event access included',
    additionalPayment: 'May access offerings requiring extra payment',
    rules: 'Visit and eligibility rules',
    quota: 'Total visits per term',
    dailyLimit: 'Daily visit limit',
    quotaMode: 'Quota sharing',
    shared: 'Shared',
    separate: 'Separate',
    physical: 'Physical visits',
    premium: 'Premium visits',
    live: 'Live and online visits',
    cities: 'Included cities',
    facilities: 'Included facilities',
    categories: 'Included activity categories',
    facilityLimits: 'Facility limits (name = visits)',
    categoryLimits: 'Activity limits (category = visits)',
    partnerGroupLimits: 'Partner-group limits (group = visits)',
    trialTypes: 'Trial activity types',
    corporateId: 'Organization ID',
    yes: 'Yes',
    no: 'No',
    saved: 'Plan saved.',
    saveError: 'The plan could not be saved. Check the values and try again.',
    invalidLimits: 'Enter each limit as name = whole number, one per line.',
    promotionalPriceError: 'The promotional price cannot exceed the monthly price.',
    paymentNote: 'Prices are configuration only. This does not activate checkout or collect payment.',
    activeLabel: 'Active',
    inactiveLabel: 'Inactive',
    futureOnly: 'Plan edits update future access grants. Existing grants keep their saved rules.',
  },
  ar: {
    title: 'خطط العضوية',
    intro: 'اضبط صلاحيات الخطط وشروطها هنا. إتمام الشراء وتحصيل الدفع متوقفان.',
    create: 'إنشاء خطة',
    edit: 'تعديل',
    save: 'حفظ الخطة',
    cancel: 'إلغاء',
    retry: 'إعادة المحاولة',
    loading: 'جارٍ تحميل الخطط…',
    loadError: 'تعذّر تحميل الخطط.',
    empty: 'لم يتم إنشاء خطط عضوية بعد.',
    name: 'اسم الخطة',
    description: 'الوصف',
    descriptionEn: 'الإنجليزية',
    descriptionAr: 'العربية',
    descriptionKu: 'الكردية السورانية',
    tier: 'فئة العضوية',
    type: 'نوع الخطة',
    paid: 'مدفوعة',
    trial: 'تجريبية',
    corporate: 'مؤسسية',
    active: 'نشر كخطة نشطة',
    monthlyPrice: 'السعر الشهري (دينار عراقي)',
    duration: 'مدة الخطة (أيام)',
    trialDays: 'مدة التجربة (أيام)',
    minContract: 'الحد الأدنى للعقد (أشهر)',
    renewal: 'فترة التجديد (أيام)',
    cancellation: 'مهلة الإلغاء (أيام)',
    autoRenew: 'التجديد التلقائي',
    pause: 'أيام الإيقاف المسموحة',
    protection: 'حماية السعر (أشهر)',
    promoPrice: 'السعر الترويجي (دينار عراقي)',
    corporatePrice: 'سعر المؤسسات (دينار عراقي)',
    digital: 'الوصول إلى المحتوى الرقمي',
    guestPasses: 'تصاريح الضيوف لكل فترة',
    eventAccess: 'تشمل دخول الفعاليات',
    additionalPayment: 'السماح بأنشطة تتطلب دفعاً إضافياً',
    rules: 'قواعد الزيارات والأهلية',
    quota: 'إجمالي الزيارات لكل فترة',
    dailyLimit: 'حد الزيارات اليومي',
    quotaMode: 'طريقة مشاركة الرصيد',
    shared: 'مشترك',
    separate: 'منفصل',
    physical: 'زيارات حضورية',
    premium: 'زيارات مميزة',
    live: 'زيارات مباشرة وأونلاين',
    cities: 'المدن المشمولة',
    facilities: 'المنشآت المشمولة',
    categories: 'فئات الأنشطة المشمولة',
    facilityLimits: 'حدود المنشآت (الاسم = الزيارات)',
    categoryLimits: 'حدود الأنشطة (الفئة = الزيارات)',
    partnerGroupLimits: 'حدود مجموعات الشركاء (المجموعة = الزيارات)',
    trialTypes: 'أنشطة فترة التجربة',
    corporateId: 'معرّف المؤسسة',
    yes: 'نعم',
    no: 'لا',
    saved: 'تم حفظ الخطة.',
    saveError: 'تعذّر حفظ الخطة. تحقق من القيم ثم أعد المحاولة.',
    invalidLimits: 'أدخل كل حد بصيغة الاسم = عدد صحيح، سطر لكل حد.',
    promotionalPriceError: 'لا يمكن أن يتجاوز السعر الترويجي السعر الشهري.',
    paymentNote: 'الأسعار إعدادات فقط. لن يتم تفعيل الشراء أو تحصيل أي مبلغ.',
    activeLabel: 'نشطة',
    inactiveLabel: 'متوقفة',
    futureOnly: 'تعديلات الخطة تنطبق على منح الوصول الجديدة. تحتفظ المنح الحالية بقواعدها المحفوظة.',
  },
  ku: {
    title: 'پلانەکانی ئەندامێتی',
    intro: 'دەستگەیشتن و مەرجەکانی پلان لێرە ڕێک بخە. کڕین و وەرگرتنی پارە هێشتا ناچالاکە.',
    create: 'دروستکردنی پلان',
    edit: 'دەستکاری',
    save: 'پلان پاشەکەوت بکە',
    cancel: 'هەڵوەشاندنەوە',
    retry: 'دووبارە هەوڵ بدەرەوە',
    loading: 'پلانەکان بار دەکرێن…',
    loadError: 'نەتوانرا پلانەکان بار بکرێن.',
    empty: 'هێشتا هیچ پلانی ئەندامێتی دروست نەکراوە.',
    name: 'ناوی پلان',
    description: 'وەسف',
    descriptionEn: 'ئینگلیزی',
    descriptionAr: 'عەرەبی',
    descriptionKu: 'کوردیی سۆرانی',
    tier: 'ئاستی ئەندامێتی',
    type: 'جۆری پلان',
    paid: 'پارەدار',
    trial: 'تاقیکردنەوە',
    corporate: 'دامەزراوەیی',
    active: 'وەک پلانی چالاک بڵاو بکەرەوە',
    monthlyPrice: 'نرخی مانگانە (دیناری عێراقی)',
    duration: 'ماوەی پلان (ڕۆژ)',
    trialDays: 'ماوەی تاقیکردنەوە (ڕۆژ)',
    minContract: 'کەمترین ماوەی گرێبەست (مانگ)',
    renewal: 'ماوەی نوێکردنەوە (ڕۆژ)',
    cancellation: 'ماوەی ئاگادارکردنەوەی هەڵوەشاندنەوە (ڕۆژ)',
    autoRenew: 'نوێکردنەوەی خۆکار',
    pause: 'ڕۆژە ڕێگەپێدراوەکانی وەستاندن',
    protection: 'پاراستنی نرخ (مانگ)',
    promoPrice: 'نرخی داشکاندن (دیناری عێراقی)',
    corporatePrice: 'نرخی دامەزراوە (دیناری عێراقی)',
    digital: 'دەستگەیشتن بە ناوەڕۆکی دیجیتاڵ',
    guestPasses: 'مۆڵەتی میوان بۆ هەر ماوەیەک',
    eventAccess: 'چوونەژوورەوەی بۆنەکان لەخۆدەگرێت',
    additionalPayment: 'ڕێگەدان بە چالاکیی پێویستی بە پارەی زیادە',
    rules: 'یاساکانی سەردان و شیاوی',
    quota: 'کۆی سەردان بۆ هەر ماوەیەک',
    dailyLimit: 'سنووری سەردانی ڕۆژانە',
    quotaMode: 'شێوازی بەکارهێنانی بڕ',
    shared: 'هاوبەش',
    separate: 'جیاواز',
    physical: 'سەردانی شوێنی',
    premium: 'سەردانی تایبەت',
    live: 'سەردانی ڕاستەوخۆ و ئۆنلاین',
    cities: 'شارە گونجاوەکان',
    facilities: 'شوێنە گونجاوەکان',
    categories: 'پۆلەکانی چالاکی گونجاو',
    facilityLimits: 'سنووری شوێن (ناو = ژمارەی سەردان)',
    categoryLimits: 'سنووری چالاکی (پۆل = سەردان)',
    partnerGroupLimits: 'سنووری گروپی هاوبەش (گروپ = سەردان)',
    trialTypes: 'جۆری چالاکیی تاقیکردنەوە',
    corporateId: 'ناسنامەی دامەزراوە',
    yes: 'بەڵێ',
    no: 'نەخێر',
    saved: 'پلانەکە پاشەکەوت کرا.',
    saveError: 'نەتوانرا پلانەکە پاشەکەوت بکرێت. نرخەکان بپشکنە و دووبارە هەوڵ بدەرەوە.',
    invalidLimits: 'هەر سنوورێک بە شێوەی ناو = ژمارەی تەواو بنووسە، هەر یەک لە دێڕێکدا.',
    promotionalPriceError: 'نرخی داشکاندن نابێت لە نرخی مانگانە زیاتر بێت.',
    paymentNote: 'نرخەکان تەنها بۆ ڕێکخستنن. کڕین چالاک ناکەن و پارە وەرناگرن.',
    activeLabel: 'چالاک',
    inactiveLabel: 'ناچالاک',
    futureOnly: 'گۆڕانکاریی پلان بۆ دەستگەیشتنی داهاتووە. دەستگەیشتنی ئێستا یاساکانی خۆی دەپارێزێت.',
  },
};

const inputClass = 'mt-1 w-full rounded-xl border border-[#d8d2c4] bg-white px-3 py-2.5 text-sm text-[#173d35] outline-none transition focus:border-[#174d43] focus:ring-2 focus:ring-[#174d43]/10';
const fieldClass = 'block text-xs font-semibold text-[#536b61]';

function freshPlan(): PlanInput {
  return {
    name: '',
    tier: 'M',
    kind: 'paid',
    durationDays: 30,
    active: false,
    priceIqd: null,
    rules: {
      quota: 0,
      dailyLimit: 0,
      quotaMode: 'separate',
      physicalQuota: 0,
      premiumQuota: 0,
      liveQuota: 0,
      cities: [],
      facilities: [],
      categories: [],
      facilityLimits: {},
      categoryLimits: {},
      partnerGroupLimits: {},
      trialAllowedTypes: ['physical', 'premium', 'live'],
      planTerms: {
        description: { en: '', ar: '', ku: '' },
        trialPeriodDays: 0,
        minimumContractMonths: 0,
        renewalPeriodDays: 30,
        cancellationPeriodDays: 0,
        automaticRenewal: false,
        pauseAllowanceDays: 0,
        priceProtectionMonths: 0,
        promotionalPriceIqd: null,
        corporatePriceIqd: null,
        digitalContentAccess: false,
        guestPasses: 0,
        eventAccess: false,
        additionalPaymentAllowed: false,
      },
    },
  };
}

function parseNames(value: string): string[] | undefined {
  const values = value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  return values.length ? [...new Set(values)] : undefined;
}

function showNames(values?: string[]) {
  return values?.join('\n') ?? '';
}

function parseLimits(value: string): Record<string, number> | undefined {
  const rows = value.split('\n').map((item) => item.trim()).filter(Boolean);
  if (!rows.length) return undefined;
  const result: Record<string, number> = {};
  for (const row of rows) {
    const splitAt = row.lastIndexOf('=');
    const name = row.slice(0, splitAt).trim();
    const rawLimit = row.slice(splitAt + 1).trim();
    const limit = Number(rawLimit);
    if (splitAt < 1 || !name || !/^\d+$/.test(rawLimit) || !Number.isSafeInteger(limit)) {
      throw new Error('invalid-limits');
    }
    result[name] = limit;
  }
  return result;
}

function showLimits(values?: Record<string, number>) {
  return Object.entries(values ?? {}).map(([name, limit]) => `${name} = ${limit}`).join('\n');
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={fieldClass}>{label}{children}</label>;
}

export default function MembershipPlanManager({
  plans,
  isLoading,
  isError,
  onRetry,
  onSaved,
  language,
}: {
  plans: LivePlan[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSaved: () => void | Promise<void>;
  language: Language;
}) {
  const t = (key: string) => copy[language][key] ?? copy.en[key] ?? key;
  const addPlan = useAddMembershipPlan();
  const replacePlan = useReplaceMembershipPlan();
  const [draft, setDraft] = useState<PlanInput>(freshPlan);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null);
  const [lists, setLists] = useState<Record<NameListKey, string>>({ cities: '', facilities: '', categories: '' });
  const [limits, setLimits] = useState<Record<LimitKey, string>>({
    facilityLimits: '', categoryLimits: '', partnerGroupLimits: '',
  });
  const terms = draft.rules.planTerms ?? freshPlan().rules.planTerms!;
  const saving = addPlan.isPending || replacePlan.isPending;

  const reset = () => {
    setDraft(freshPlan());
    setEditingId(null);
    setFormOpen(false);
    setLists({ cities: '', facilities: '', categories: '' });
    setLimits({ facilityLimits: '', categoryLimits: '', partnerGroupLimits: '' });
  };

  const beginCreate = () => {
    setDraft(freshPlan());
    setEditingId(null);
    setLists({ cities: '', facilities: '', categories: '' });
    setLimits({ facilityLimits: '', categoryLimits: '', partnerGroupLimits: '' });
    setFeedback(null);
    setFormOpen(true);
  };

  const beginEdit = (plan: LivePlan) => {
    const base = freshPlan();
    setDraft({
      ...base,
      ...plan,
      rules: {
        ...base.rules,
        ...plan.rules,
        planTerms: {
          ...base.rules.planTerms!,
          ...plan.rules.planTerms,
          description: {
            ...base.rules.planTerms!.description,
            ...plan.rules.planTerms?.description,
          },
        },
      },
    });
    setLists({
      cities: showNames(plan.rules.cities),
      facilities: showNames(plan.rules.facilities),
      categories: showNames(plan.rules.categories),
    });
    setLimits({
      facilityLimits: showLimits(plan.rules.facilityLimits),
      categoryLimits: showLimits(plan.rules.categoryLimits),
      partnerGroupLimits: showLimits(plan.rules.partnerGroupLimits),
    });
    setEditingId(plan.id);
    setFeedback(null);
    setFormOpen(true);
  };

  const updateRule = <K extends keyof Rules,>(key: K, value: Rules[K]) => {
    setDraft((current) => ({ ...current, rules: { ...current.rules, [key]: value } }));
  };
  const updateTerm = <K extends keyof PlanTerms,>(key: K, value: PlanTerms[K]) => {
    setDraft((current) => ({
      ...current,
      rules: {
        ...current.rules,
        planTerms: { ...(current.rules.planTerms ?? freshPlan().rules.planTerms!), [key]: value },
      },
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    let parsedLimits: Record<LimitKey, Record<string, number> | undefined>;
    try {
      parsedLimits = {
        facilityLimits: parseLimits(limits.facilityLimits),
        categoryLimits: parseLimits(limits.categoryLimits),
        partnerGroupLimits: parseLimits(limits.partnerGroupLimits),
      };
    } catch {
      setFeedback({ text: t('invalidLimits'), isError: true });
      return;
    }

    const cleanPrice = draft.kind === 'paid' ? draft.priceIqd : null;
    const promoPrice = terms.promotionalPriceIqd;
    if (promoPrice !== null && cleanPrice !== null && promoPrice > cleanPrice) {
      setFeedback({ text: t('promotionalPriceError'), isError: true });
      return;
    }
    const payload: PlanInput = {
      ...draft,
      priceIqd: cleanPrice,
      rules: {
        ...draft.rules,
        cities: parseNames(lists.cities),
        facilities: parseNames(lists.facilities),
        categories: parseNames(lists.categories),
        facilityLimits: parsedLimits.facilityLimits,
        categoryLimits: parsedLimits.categoryLimits,
        partnerGroupLimits: parsedLimits.partnerGroupLimits,
        planTerms: terms,
      },
    };

    try {
      if (editingId) await replacePlan.mutateAsync({ id: editingId, data: payload });
      else await addPlan.mutateAsync({ data: payload });
      setFeedback({ text: t('saved') });
      reset();
      await onSaved();
    } catch {
      setFeedback({ text: t('saveError'), isError: true });
    }
  };

  const orderedPlans = [...plans].sort((a, b) => a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name));

  return (
    <section className="space-y-5" data-testid="membership-plan-manager">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[#ded8c9] bg-[#fffdf7] p-5">
        <div>
          <h2 className="font-display text-xl font-bold text-[#173d35]">{t('title')}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#718078]">{t('intro')}</p>
        </div>
        {!formOpen && (
          <button onClick={beginCreate} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#174d43] px-4 py-2 text-xs font-bold text-[#fff9e9]" data-testid="button-create-plan">
            <Plus size={15} />{t('create')}
          </button>
        )}
      </header>

      {feedback && (
        <div role="status" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${feedback.isError ? 'border-[#e5c2b6] bg-[#fff9f4] text-[#9a4435]' : 'border-[#c8d9ca] bg-[#edf5ec] text-[#315e42]'}`}>
          {feedback.isError ? <CircleAlert size={16} /> : <Check size={16} />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(260px,.8fr)_minmax(0,1.6fr)]">
        <section className="overflow-hidden rounded-2xl border border-[#ded8c9] bg-[#fffdf7]" aria-label={t('title')}>
          <div className="border-b border-[#eee9de] px-5 py-4">
            <h3 className="text-sm font-bold text-[#173d35]">{t('title')}</h3>
            <p className="mt-1 text-xs text-[#718078]">{t('futureOnly')}</p>
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-[#718078]"><RefreshCw size={15} className="animate-spin" />{t('loading')}</div>
          ) : isError ? (
            <div className="p-6 text-sm text-[#9a4435]">{t('loadError')} <button onClick={onRetry} className="ms-2 underline">{t('retry')}</button></div>
          ) : orderedPlans.length ? (
            <ul className="divide-y divide-[#eee9de]">
              {orderedPlans.map((plan) => (
                <li key={plan.id} className="flex items-start justify-between gap-3 px-5 py-4" data-testid={`row-plan-${plan.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#29483e]">{plan.name}</p>
                    <p className="mt-1 text-xs text-[#718078]">{plan.tier} · {t(plan.kind)} · {plan.durationDays} {t('duration').split('(')[1]?.replace(')', '') ?? ''}</p>
                    {plan.priceIqd !== null && <p className="mt-1 text-xs font-semibold text-[#536b61]">{plan.priceIqd.toLocaleString(language === 'ar' ? 'ar-IQ' : language === 'ku' ? 'ckb-IQ' : 'en-IQ')} IQD</p>}
                    <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${plan.active ? 'bg-[#e4f0e4] text-[#315e42]' : 'bg-[#f1eddf] text-[#6b746c]'}`}>{t(plan.active ? 'activeLabel' : 'inactiveLabel')}</span>
                  </div>
                  <button onClick={() => beginEdit(plan)} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#d8d2c4] px-3 text-xs font-bold text-[#36564b] hover:bg-[#f1eddf]" data-testid={`button-edit-plan-${plan.id}`}>
                    <Pencil size={13} />{t('edit')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-sm text-[#718078]">{t('empty')}</p>
          )}
        </section>

        {formOpen && (
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5 rounded-2xl border border-[#ded8c9] bg-[#fffdf7] p-5" data-testid="form-membership-plan">
            <div className="flex items-start justify-between gap-3 border-b border-[#eee9de] pb-4">
              <div>
                <h3 className="text-sm font-bold text-[#173d35]">{editingId ? t('edit') : t('create')}</h3>
                <p className="mt-1 text-xs text-[#718078]">{t('paymentNote')}</p>
              </div>
              <button type="button" onClick={() => { reset(); setFeedback(null); }} aria-label={t('cancel')} className="rounded-lg p-2 text-[#718078] hover:bg-[#f1eddf]"><X size={16} /></button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('name')}><input required maxLength={160} value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} className={inputClass} /></Field>
              <Field label={t('tier')}><select value={draft.tier} onChange={(e) => setDraft((p) => ({ ...p, tier: e.target.value }))} className={inputClass}>
                {['M', 'L', 'XL'].map((tier) => <option key={tier} value={tier}>{tier}</option>)}
              </select></Field>
              <Field label={t('type')}><select value={draft.kind} onChange={(e) => setDraft((p) => ({ ...p, kind: e.target.value as PlanInput['kind'], priceIqd: e.target.value === 'paid' ? p.priceIqd : null }))} className={inputClass}>
                {(['paid', 'trial', 'corporate'] as const).map((kind) => <option key={kind} value={kind}>{t(kind)}</option>)}
              </select></Field>
              <Field label={t('duration')}><input type="number" min={1} max={366} step={1} required value={draft.durationDays} onChange={(e) => setDraft((p) => ({ ...p, durationDays: Number(e.target.value) }))} className={inputClass} /></Field>
              {draft.kind === 'paid' && <Field label={t('monthlyPrice')}><input type="number" min={1} max={1_000_000_000} step={1} required value={draft.priceIqd ?? ''} onChange={(e) => setDraft((p) => ({ ...p, priceIqd: e.target.value === '' ? null : Number(e.target.value) }))} className={inputClass} /></Field>}
              {draft.kind === 'corporate' && <Field label={t('corporateId')}><input required maxLength={160} value={draft.rules.corporateId ?? ''} onChange={(e) => updateRule('corporateId', e.target.value)} className={inputClass} /></Field>}
            </div>

            <fieldset className="rounded-xl border border-[#eee9de] p-4">
              <legend className="px-1 text-xs font-bold text-[#36564b]">{t('description')}</legend>
              <div className="grid gap-3 md:grid-cols-3">
                {(['en', 'ar', 'ku'] as const).map((locale) => {
                  const label = t(locale === 'en' ? 'descriptionEn' : locale === 'ar' ? 'descriptionAr' : 'descriptionKu');
                  return <Field key={locale} label={label}><textarea required maxLength={240} rows={3} value={terms.description[locale]} onChange={(e) => updateTerm('description', { ...terms.description, [locale]: e.target.value })} className={inputClass} /></Field>;
                })}
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-[#eee9de] p-4">
              <legend className="px-1 text-xs font-bold text-[#36564b]">{t('planTerms')}</legend>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label={t('trialDays')}><input type="number" min={0} max={366} value={terms.trialPeriodDays} onChange={(e) => updateTerm('trialPeriodDays', Number(e.target.value))} className={inputClass} /></Field>
                <Field label={t('minContract')}><input type="number" min={0} max={120} value={terms.minimumContractMonths} onChange={(e) => updateTerm('minimumContractMonths', Number(e.target.value))} className={inputClass} /></Field>
                <Field label={t('renewal')}><input type="number" min={1} max={366} value={terms.renewalPeriodDays} onChange={(e) => updateTerm('renewalPeriodDays', Number(e.target.value))} className={inputClass} /></Field>
                <Field label={t('cancellation')}><input type="number" min={0} max={366} value={terms.cancellationPeriodDays} onChange={(e) => updateTerm('cancellationPeriodDays', Number(e.target.value))} className={inputClass} /></Field>
                <Field label={t('pause')}><input type="number" min={0} max={366} value={terms.pauseAllowanceDays} onChange={(e) => updateTerm('pauseAllowanceDays', Number(e.target.value))} className={inputClass} /></Field>
                <Field label={t('protection')}><input type="number" min={0} max={120} value={terms.priceProtectionMonths} onChange={(e) => updateTerm('priceProtectionMonths', Number(e.target.value))} className={inputClass} /></Field>
                <Field label={t('promoPrice')}><input type="number" min={0} max={1_000_000_000} value={terms.promotionalPriceIqd ?? ''} onChange={(e) => updateTerm('promotionalPriceIqd', e.target.value === '' ? null : Number(e.target.value))} className={inputClass} /></Field>
                <Field label={t('corporatePrice')}><input type="number" min={0} max={1_000_000_000} value={terms.corporatePriceIqd ?? ''} onChange={(e) => updateTerm('corporatePriceIqd', e.target.value === '' ? null : Number(e.target.value))} className={inputClass} /></Field>
                <Field label={t('guestPasses')}><input type="number" min={0} max={10_000} value={terms.guestPasses} onChange={(e) => updateTerm('guestPasses', Number(e.target.value))} className={inputClass} /></Field>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {([
                  ['automaticRenewal', 'autoRenew'],
                  ['digitalContentAccess', 'digital'],
                  ['eventAccess', 'eventAccess'],
                  ['additionalPaymentAllowed', 'additionalPayment'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex min-h-11 items-center gap-2 rounded-lg bg-[#f7f4eb] px-3 text-xs font-semibold text-[#536b61]">
                    <input type="checkbox" checked={terms[key]} onChange={(e) => updateTerm(key, e.target.checked)} className="accent-[#174d43]" />
                    {t(label)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-[#eee9de] p-4">
              <legend className="px-1 text-xs font-bold text-[#36564b]">{t('rules')}</legend>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {([
                  ['quota', 'quota'], ['dailyLimit', 'dailyLimit'],
                  ['physicalQuota', 'physical'], ['premiumQuota', 'premium'], ['liveQuota', 'live'],
                ] as const).map(([key, label]) => <Field key={key} label={t(label)}>
                  <input type="number" min={0} max={100_000} value={draft.rules[key]} onChange={(e) => updateRule(key, Number(e.target.value))} className={inputClass} />
                </Field>)}
                <Field label={t('quotaMode')}><select value={draft.rules.quotaMode} onChange={(e) => updateRule('quotaMode', e.target.value as Rules['quotaMode'])} className={inputClass}>
                  <option value="shared">{t('shared')}</option><option value="separate">{t('separate')}</option>
                </select></Field>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {([
                  ['cities', 'cities'], ['facilities', 'facilities'], ['categories', 'categories'],
                ] as const).map(([key, label]) => <Field key={key} label={t(label)}>
                  <textarea rows={3} value={lists[key]} onChange={(e) => setLists((value) => ({ ...value, [key]: e.target.value }))} placeholder="One per line" className={inputClass} />
                </Field>)}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {([
                  ['facilityLimits', 'facilityLimits'],
                  ['categoryLimits', 'categoryLimits'],
                  ['partnerGroupLimits', 'partnerGroupLimits'],
                ] as const).map(([key, label]) => <Field key={key} label={t(label)}>
                  <textarea rows={3} value={limits[key]} onChange={(e) => setLimits((value) => ({ ...value, [key]: e.target.value }))} placeholder="Name = 4" className={inputClass} />
                </Field>)}
              </div>
              {draft.kind === 'trial' && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-[#536b61]">{t('trialTypes')}</p>
                  <div className="flex flex-wrap gap-3">
                    {(['physical', 'premium', 'live'] as const).map((value) => (
                      <label key={value} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#f7f4eb] px-3 text-xs text-[#536b61]">
                        <input
                          type="checkbox"
                          checked={(draft.rules.trialAllowedTypes ?? []).includes(value)}
                          onChange={(e) => {
                            const current = draft.rules.trialAllowedTypes ?? [];
                            updateRule('trialAllowedTypes', e.target.checked ? [...current, value] : current.filter((item) => item !== value));
                          }}
                          className="accent-[#174d43]"
                        />
                        {t(value)}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>

            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#eee9de] px-3 text-xs font-semibold text-[#536b61]">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft((p) => ({ ...p, active: e.target.checked }))} className="accent-[#174d43]" />
              {t('active')}
            </label>

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#eee9de] pt-4">
              <button type="button" onClick={() => { reset(); setFeedback(null); }} className="min-h-10 rounded-xl border border-[#d8d2c4] px-4 text-xs font-bold text-[#536b61]">{t('cancel')}</button>
              <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#174d43] px-4 text-xs font-bold text-[#fff9e9] disabled:opacity-50" data-testid="button-save-plan">
                <Save size={14} />{t('save')}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
