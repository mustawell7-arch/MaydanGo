import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetFacilityQualityControlQueryKey, useCreateFacilityQualityAssessment,
  useCreateFacilityQualityIncident, useGetFacilityQualityControl,
  useUpdateFacilityQualityAssessment, useUpdateFacilityQualityIncident,
} from '@workspace/api-client-react';
import type {
  FacilityHygieneChecklist, FacilityQualityAssessment, FacilityQualityAssessmentInput,
  FacilityQualityIncidentInput, FacilityQualityIncidentUpdate, FacilitySafetyChecklist,
} from '@workspace/api-client-react';
import { AlertTriangle, ClipboardCheck, FileCheck2, RefreshCw, ShieldAlert } from 'lucide-react';
import type { PortalLanguage } from '@/pages/partner-operations';

type CheckStatus = 'pass' | 'action_required' | 'not_applicable';
type AssessmentStatus = 'approved' | 'action_required' | 'suspended';
type IncidentType = FacilityQualityIncidentInput['incidentType'];
type IncidentStatus = FacilityQualityIncidentUpdate['status'];
type CopyKey = keyof typeof copy.en;

const copy = {
  en: {
    title: 'Facility quality & safety',
    intro: 'Track inspections, licence and insurance dates, corrective actions, and partner-reported incidents.',
    newInspection: 'Record an inspection',
    inspectionHistory: 'Inspection history',
    reportIncident: 'Report an incident',
    incidentHistory: 'Incident reports',
    facility: 'Facility',
    chooseFacility: 'Choose a facility',
    reviewedOn: 'Inspection date',
    nextReview: 'Next review',
    licenceExpiry: 'Licence expiry',
    insuranceExpiry: 'Insurance expiry',
    status: 'Status',
    approved: 'Approved',
    actionRequired: 'Action required',
    suspended: 'Temporarily suspended',
    findings: 'Inspection findings',
    correctiveAction: 'Corrective action',
    correctiveDue: 'Corrective-action due date',
    hygiene: 'Hygiene checklist',
    safety: 'Safety checklist',
    cleanliness: 'Cleanliness',
    changingAreas: 'Changing areas',
    showers: 'Showers',
    waterSanitation: 'Water and sanitation',
    emergencyExits: 'Emergency exits',
    firstAid: 'First aid',
    equipmentCondition: 'Equipment condition',
    incidentPlan: 'Incident plan',
    pass: 'Passed',
    notApplicable: 'Not applicable',
    saveInspection: 'Save inspection',
    incidentType: 'Incident type',
    safetyIncident: 'Safety',
    hygieneIncident: 'Hygiene',
    equipmentIncident: 'Equipment',
    facilityIncident: 'Facility',
    otherIncident: 'Other',
    occurredAt: 'When did it occur?',
    description: 'What happened?',
    privacyWarning: 'Do not include member names, medical details, or guardian information. This is not an emergency service.',
    sendIncident: 'Submit report',
    open: 'Open',
    underReview: 'Under review',
    resolved: 'Resolved',
    resolution: 'Resolution or next action',
    saveFollowUp: 'Save follow-up',
    emptyAssessments: 'No facility inspections have been recorded.',
    emptyIncidents: 'No incident reports have been submitted.',
    loading: 'Loading quality records…',
    retry: 'Retry',
    loadError: 'Quality records could not be loaded.',
    saveError: 'The change could not be saved. Please check the details and try again.',
    saved: 'Quality record saved.',
    due: 'Due',
    expired: 'Expired',
    checklistRequired: 'Mark every checklist item before saving.',
    chooseStatus: 'Choose a status',
  },
  ar: {
    title: 'جودة المرافق وسلامتها',
    intro: 'تابع التفتيش وتواريخ الترخيص والتأمين والإجراءات التصحيحية وبلاغات الشركاء.',
    newInspection: 'تسجيل تفتيش',
    inspectionHistory: 'سجل التفتيش',
    reportIncident: 'الإبلاغ عن حادث',
    incidentHistory: 'بلاغات الحوادث',
    facility: 'المرفق',
    chooseFacility: 'اختر مرفقاً',
    reviewedOn: 'تاريخ التفتيش',
    nextReview: 'موعد التفتيش التالي',
    licenceExpiry: 'انتهاء الترخيص',
    insuranceExpiry: 'انتهاء التأمين',
    status: 'الحالة',
    approved: 'مستوفٍ',
    actionRequired: 'يتطلب إجراءً',
    suspended: 'موقوف مؤقتاً',
    findings: 'ملاحظات التفتيش',
    correctiveAction: 'الإجراء التصحيحي',
    correctiveDue: 'موعد الإجراء التصحيحي',
    hygiene: 'قائمة النظافة',
    safety: 'قائمة السلامة',
    cleanliness: 'النظافة العامة',
    changingAreas: 'أماكن تبديل الملابس',
    showers: 'الاستحمام',
    waterSanitation: 'المياه والصرف الصحي',
    emergencyExits: 'مخارج الطوارئ',
    firstAid: 'الإسعافات الأولية',
    equipmentCondition: 'حالة المعدات',
    incidentPlan: 'خطة التعامل مع الحوادث',
    pass: 'مستوفٍ',
    notApplicable: 'لا ينطبق',
    saveInspection: 'حفظ التفتيش',
    incidentType: 'نوع الحادث',
    safetyIncident: 'سلامة',
    hygieneIncident: 'نظافة',
    equipmentIncident: 'معدات',
    facilityIncident: 'المرفق',
    otherIncident: 'أخرى',
    occurredAt: 'متى وقع؟',
    description: 'ماذا حدث؟',
    privacyWarning: 'لا تذكر أسماء الأعضاء أو التفاصيل الطبية أو معلومات الأوصياء. هذا النموذج ليس لخدمات الطوارئ.',
    sendIncident: 'إرسال البلاغ',
    open: 'مفتوح',
    underReview: 'قيد المراجعة',
    resolved: 'تمت المعالجة',
    resolution: 'المعالجة أو الخطوة التالية',
    saveFollowUp: 'حفظ المتابعة',
    emptyAssessments: 'لم يُسجل أي تفتيش للمرافق بعد.',
    emptyIncidents: 'لم يتم إرسال بلاغات حوادث بعد.',
    loading: 'جارٍ تحميل سجلات الجودة…',
    retry: 'إعادة المحاولة',
    loadError: 'تعذر تحميل سجلات الجودة.',
    saveError: 'تعذر حفظ التغيير. تحقق من التفاصيل وحاول مرة أخرى.',
    saved: 'تم حفظ سجل الجودة.',
    due: 'مستحق',
    expired: 'منتهي',
    checklistRequired: 'حدد حالة كل بند في القائمة قبل الحفظ.',
    chooseStatus: 'اختر الحالة',
  },
  ku: {
    title: 'کوالێتی و سەلامەتی شوێنەکان',
    intro: 'پشکنین، بەرواری مۆڵەت و بیمە، چاکسازییەکان و ڕاپۆرتی ڕووداوەکانی هاوبەشەکان بەڕێوەببە.',
    newInspection: 'تۆمارکردنی پشکنین',
    inspectionHistory: 'مێژووی پشکنین',
    reportIncident: 'ڕاپۆرتکردنی ڕووداو',
    incidentHistory: 'ڕاپۆرتی ڕووداوەکان',
    facility: 'شوێن',
    chooseFacility: 'شوێنێک هەڵبژێرە',
    reviewedOn: 'بەرواری پشکنین',
    nextReview: 'پشکنینی داهاتوو',
    licenceExpiry: 'بەسەرچوونی مۆڵەت',
    insuranceExpiry: 'بەسەرچوونی بیمە',
    status: 'دۆخ',
    approved: 'پەسەندکراوە',
    actionRequired: 'پێویستی بە چاکسازییە',
    suspended: 'کاتییەوە ڕاگیراوە',
    findings: 'تێبینییەکانی پشکنین',
    correctiveAction: 'چاکسازی',
    correctiveDue: 'بەرواری کۆتایی چاکسازی',
    hygiene: 'لیستی پاکوخاوێنی',
    safety: 'لیستی سەلامەتی',
    cleanliness: 'پاکوخاوێنی',
    changingAreas: 'شوێنی گۆڕینی جل',
    showers: 'حەمام',
    waterSanitation: 'ئاو و پاکوخاوێنی',
    emergencyExits: 'دەرگاکانی فریاکەوتن',
    firstAid: 'یارمەتیی سەرەتایی',
    equipmentCondition: 'دۆخی کەرەستەکان',
    incidentPlan: 'پلانی ڕووداو',
    pass: 'پەسەندکراوە',
    notApplicable: 'پەیوەندیدار نییە',
    saveInspection: 'پاشەکەوتکردنی پشکنین',
    incidentType: 'جۆری ڕووداو',
    safetyIncident: 'سەلامەتی',
    hygieneIncident: 'پاکوخاوێنی',
    equipmentIncident: 'کەرەستە',
    facilityIncident: 'شوێن',
    otherIncident: 'هیتر',
    occurredAt: 'کەی ڕوویدا؟',
    description: 'چی ڕوویدا؟',
    privacyWarning: 'ناوی ئەندام، زانیاری پزیشکی یان زانیاری سەرپەرشتیار مەنووسە. ئەمە خزمەتگوزاری فریاکەوتن نییە.',
    sendIncident: 'ناردنی ڕاپۆرت',
    open: 'کراوە',
    underReview: 'لە پێداچوونەوەدایە',
    resolved: 'چارەسەرکراوە',
    resolution: 'چارەسەر یان هەنگاوی داهاتوو',
    saveFollowUp: 'پاشەکەوتکردنی بەدواداچوون',
    emptyAssessments: 'هێشتا هیچ پشکنینێکی شوێن تۆمار نەکراوە.',
    emptyIncidents: 'هێشتا هیچ ڕاپۆرتێکی ڕووداو نەنێردراوە.',
    loading: 'تۆمارەکانی کوالێتی بار دەکرێن…',
    retry: 'دووبارە هەوڵ بدە',
    loadError: 'بارکردنی تۆمارەکانی کوالێتی سەرکەوتوو نەبوو.',
    saveError: 'پاشەکەوتکردن سەرکەوتوو نەبوو. وردەکارییەکان بپشکنە و دووبارە هەوڵ بدە.',
    saved: 'تۆماری کوالێتی پاشەکەوت کرا.',
    due: 'ماوەکەی تەواوە',
    expired: 'بەسەرچووە',
    checklistRequired: 'پێش پاشەکەوتکردن، دۆخی هەموو خاڵەکان دیاری بکە.',
    chooseStatus: 'دۆخێک هەڵبژێرە',
  },
} as const;

const t = (lang: PortalLanguage, key: CopyKey) => copy[lang][key];
const inputClass = 'mt-1 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3 py-2.5 text-sm text-[#173d35] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#174d43] px-4 py-2.5 text-sm font-semibold text-[#fff9e9] hover:bg-[#226556] disabled:opacity-50';
const hygieneKeys = ['cleanliness', 'changingAreas', 'showers', 'waterSanitation'] as const;
const safetyKeys = ['emergencyExits', 'firstAid', 'equipmentCondition', 'incidentPlan'] as const;
const checklistLabels: Record<typeof hygieneKeys[number] | typeof safetyKeys[number], CopyKey> = {
  cleanliness: 'cleanliness', changingAreas: 'changingAreas', showers: 'showers', waterSanitation: 'waterSanitation',
  emergencyExits: 'emergencyExits', firstAid: 'firstAid', equipmentCondition: 'equipmentCondition', incidentPlan: 'incidentPlan',
};
const incidentOptions: [IncidentType, CopyKey][] = [
  ['safety', 'safetyIncident'], ['hygiene', 'hygieneIncident'], ['equipment', 'equipmentIncident'],
  ['facility', 'facilityIncident'], ['other', 'otherIncident'],
];
const dateInput = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const baghdadDateTimeInput = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (key: string) => parts.find(item => item.type === key)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
};
const localBaghdadIso = (value: string) => new Date(`${value}:00+03:00`).toISOString();
const dateLabel = (value: string | null, lang: PortalLanguage) => value
  ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : lang === 'ku' ? 'ckb-IQ' : 'en-IQ', {
    dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
  : '—';
const expiryWarning = (value: string | null, lang: PortalLanguage) => {
  if (!value) return null;
  const daysRemaining = Math.floor((Date.parse(`${value.slice(0, 10)}T00:00:00Z`) - Date.parse(`${dateInput(new Date())}T00:00:00Z`)) / 86_400_000);
  if (daysRemaining < 0) return t(lang, 'expired');
  if (daysRemaining <= 30) return t(lang, 'due');
  return null;
};

function StatusSelect({ value, onChange, lang }: { value: CheckStatus; onChange: (value: CheckStatus) => void; lang: PortalLanguage }) {
  return <select className={inputClass} value={value} onChange={event => onChange(event.target.value as CheckStatus)}>
    <option value="action_required">{t(lang, 'actionRequired')}</option>
    <option value="pass">{t(lang, 'pass')}</option>
    <option value="not_applicable">{t(lang, 'notApplicable')}</option>
  </select>;
}

export function FacilityQualityControl({ lang, isAdmin }: { lang: PortalLanguage; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const query = useGetFacilityQualityControl({ query: { refetchOnMount: 'always', retry: false } });
  const createAssessment = useCreateFacilityQualityAssessment();
  const updateAssessment = useUpdateFacilityQualityAssessment();
  const createIncident = useCreateFacilityQualityIncident();
  const updateIncident = useUpdateFacilityQualityIncident();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [status, setStatus] = useState<AssessmentStatus>('action_required');
  const [hygiene, setHygiene] = useState<FacilityHygieneChecklist>({
    cleanliness: 'action_required', changingAreas: 'action_required', showers: 'action_required', waterSanitation: 'action_required',
  });
  const [safety, setSafety] = useState<FacilitySafetyChecklist>({
    emergencyExits: 'action_required', firstAid: 'action_required', equipmentCondition: 'action_required', incidentPlan: 'action_required',
  });
  const [incidentFacility, setIncidentFacility] = useState('');
  const [incidentType, setIncidentType] = useState<IncidentType>('safety');
  const [occurredAt, setOccurredAt] = useState(() => baghdadDateTimeInput(new Date()));

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetFacilityQualityControlQueryKey() });
    setError('');
    setNotice(t(lang, 'saved'));
  };
  const submitAssessment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const formElement = event.currentTarget;
    const values = new FormData(formElement);
    if ([...Object.values(hygiene), ...Object.values(safety)].some(value => !value)) {
      setError(t(lang, 'checklistRequired'));
      return;
    }
    const input: FacilityQualityAssessmentInput = {
      facilityId,
      reviewedOn: String(values.get('reviewedOn') ?? ''),
      nextReviewOn: String(values.get('nextReviewOn') ?? '') || null,
      licenceExpiresOn: String(values.get('licenceExpiresOn') ?? '') || null,
      insuranceExpiresOn: String(values.get('insuranceExpiresOn') ?? '') || null,
      hygieneChecklist: hygiene,
      safetyChecklist: safety,
      status,
      findings: String(values.get('findings') ?? '').trim(),
      correctiveAction: String(values.get('correctiveAction') ?? '').trim() || null,
      correctiveDueOn: String(values.get('correctiveDueOn') ?? '') || null,
    };
    try {
      await createAssessment.mutateAsync({ data: input });
      await invalidate();
      formElement.reset();
      setStatus('action_required');
      setHygiene({ cleanliness: 'action_required', changingAreas: 'action_required', showers: 'action_required', waterSanitation: 'action_required' });
      setSafety({ emergencyExits: 'action_required', firstAid: 'action_required', equipmentCondition: 'action_required', incidentPlan: 'action_required' });
    } catch {
      setError(t(lang, 'saveError'));
    }
  };
  const submitIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const formElement = event.currentTarget;
    const values = new FormData(formElement);
    const input: FacilityQualityIncidentInput = {
      facilityId: incidentFacility,
      incidentType,
      occurredAt: localBaghdadIso(occurredAt),
      description: String(values.get('description') ?? '').trim(),
    };
    try {
      await createIncident.mutateAsync({ data: input });
      await invalidate();
      formElement.reset();
      setOccurredAt(baghdadDateTimeInput(new Date()));
    } catch {
      setError(t(lang, 'saveError'));
    }
  };
  const submitAssessmentFollowUp = async (event: FormEvent<HTMLFormElement>, item: FacilityQualityAssessment) => {
    event.preventDefault();
    setError('');
    const values = new FormData(event.currentTarget);
    try {
      await updateAssessment.mutateAsync({
        id: item.id,
        data: {
          status: String(values.get('status')) as AssessmentStatus,
          correctiveAction: String(values.get('correctiveAction') ?? '').trim() || null,
          correctiveDueOn: String(values.get('correctiveDueOn') ?? '') || null,
        },
      });
      await invalidate();
    } catch {
      setError(t(lang, 'saveError'));
    }
  };
  const submitIncidentFollowUp = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    setError('');
    const values = new FormData(event.currentTarget);
    const statusValue = String(values.get('status')) as IncidentStatus;
    const resolution = String(values.get('resolution') ?? '').trim() || null;
    try {
      await updateIncident.mutateAsync({ id, data: { status: statusValue, resolution } });
      await invalidate();
    } catch {
      setError(t(lang, 'saveError'));
    }
  };

  if (query.isLoading) return <p className="rounded-2xl bg-[#fffdf7] p-6 text-sm text-[#687a71]" role="status">{t(lang, 'loading')}</p>;
  if (query.isError || !query.data) return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#fff7f3] p-5 text-sm text-[#9a4435]"><span>{t(lang, 'loadError')}</span><button type="button" className="inline-flex items-center gap-2 font-semibold" onClick={() => void query.refetch()}><RefreshCw size={14} />{t(lang, 'retry')}</button></div>;

  const facilities = query.data.facilities;
  const statusLabel = (value: AssessmentStatus) => t(lang, value === 'approved' ? 'approved' : value === 'suspended' ? 'suspended' : 'actionRequired');
  const incidentStatusLabel = (value: IncidentStatus) => t(lang, value === 'resolved' ? 'resolved' : value === 'under_review' ? 'underReview' : 'open');
  const assessmentSelect = (item: FacilityQualityAssessment) => (
    <form key={`${item.id}-${item.updatedAt}`} onSubmit={event => void submitAssessmentFollowUp(event, item)} className="mt-4 grid gap-3 border-t border-[#ece7d9] pt-4 sm:grid-cols-3">
      <label className="text-xs font-semibold">{t(lang, 'status')}<select name="status" defaultValue={item.status} className={inputClass}>
        <option value="approved">{t(lang, 'approved')}</option><option value="action_required">{t(lang, 'actionRequired')}</option><option value="suspended">{t(lang, 'suspended')}</option>
      </select></label>
      <label className="text-xs font-semibold">{t(lang, 'correctiveDue')}<input name="correctiveDueOn" type="date" defaultValue={item.correctiveDueOn ?? ''} className={inputClass} /></label>
      <label className="text-xs font-semibold sm:col-span-3">{t(lang, 'correctiveAction')}<textarea name="correctiveAction" maxLength={2000} rows={2} defaultValue={item.correctiveAction ?? ''} className={inputClass} /></label>
      <button className={buttonClass} disabled={updateAssessment.isPending}><FileCheck2 size={15} />{t(lang, 'saveFollowUp')}</button>
    </form>
  );

  return <section dir={lang === 'en' ? 'ltr' : 'rtl'} className="space-y-6">
    <header className="rounded-3xl bg-[#174d43] p-6 text-[#fff9e9] sm:p-8">
      <div className="flex items-center gap-3"><ClipboardCheck size={22} /><div><h2 className="font-display text-2xl font-bold">{t(lang, 'title')}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#d1dfd6]">{t(lang, 'intro')}</p></div></div>
    </header>
    {notice && <p role="status" className="rounded-xl bg-[#e1efdf] px-4 py-3 text-sm text-[#2d6d4a]">{notice}</p>}
    {error && <p role="alert" className="rounded-xl bg-[#fff7f3] px-4 py-3 text-sm text-[#9a4435]">{error}</p>}

    <div className="grid gap-6 xl:grid-cols-2">
      {isAdmin && <form onSubmit={event => void submitAssessment(event)} className="grid content-start gap-4 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
        <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a76445]">{t(lang, 'newInspection')}</p><h3 className="mt-2 font-display text-xl font-bold">{t(lang, 'hygiene')} · {t(lang, 'safety')}</h3></div>
        <label className="text-xs font-semibold">{t(lang, 'facility')}<select required value={facilityId} onChange={event => setFacilityId(event.target.value)} className={inputClass}><option value="">{t(lang, 'chooseFacility')}</option>{facilities.map(item => <option key={item.id} value={item.id}>{item.facility} · {item.city}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">{t(lang, 'reviewedOn')}<input required type="date" name="reviewedOn" defaultValue={dateInput(new Date())} className={inputClass} /></label>
          <label className="text-xs font-semibold">{t(lang, 'nextReview')}<input type="date" name="nextReviewOn" className={inputClass} /></label>
          <label className="text-xs font-semibold">{t(lang, 'licenceExpiry')}<input type="date" name="licenceExpiresOn" className={inputClass} /></label>
          <label className="text-xs font-semibold">{t(lang, 'insuranceExpiry')}<input type="date" name="insuranceExpiresOn" className={inputClass} /></label>
        </div>
        <fieldset className="grid gap-3 rounded-2xl bg-[#f7f4e9] p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-bold">{t(lang, 'hygiene')}</legend>
          {hygieneKeys.map(key => <label key={key} className="text-xs font-semibold">{t(lang, checklistLabels[key])}<StatusSelect lang={lang} value={hygiene[key]} onChange={value => setHygiene(current => ({ ...current, [key]: value }))} /></label>)}
        </fieldset>
        <fieldset className="grid gap-3 rounded-2xl bg-[#f7f4e9] p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-bold">{t(lang, 'safety')}</legend>
          {safetyKeys.map(key => <label key={key} className="text-xs font-semibold">{t(lang, checklistLabels[key])}<StatusSelect lang={lang} value={safety[key]} onChange={value => setSafety(current => ({ ...current, [key]: value }))} /></label>)}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">{t(lang, 'status')}<select value={status} onChange={event => setStatus(event.target.value as AssessmentStatus)} className={inputClass}><option value="action_required">{t(lang, 'actionRequired')}</option><option value="approved">{t(lang, 'approved')}</option><option value="suspended">{t(lang, 'suspended')}</option></select></label>
          <label className="text-xs font-semibold">{t(lang, 'correctiveDue')}<input name="correctiveDueOn" type="date" className={inputClass} /></label>
        </div>
        <label className="text-xs font-semibold">{t(lang, 'findings')}<textarea required minLength={5} maxLength={2000} name="findings" rows={3} className={inputClass} /></label>
        <label className="text-xs font-semibold">{t(lang, 'correctiveAction')}<textarea name="correctiveAction" maxLength={2000} rows={2} className={inputClass} /></label>
        <button type="submit" disabled={!facilityId || createAssessment.isPending} className={buttonClass}><ClipboardCheck size={15} />{t(lang, 'saveInspection')}</button>
      </form>}

      {!isAdmin && <form onSubmit={event => void submitIncident(event)} className="grid content-start gap-4 rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
        <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a76445]">{t(lang, 'reportIncident')}</p><h3 className="mt-2 font-display text-xl font-bold">{t(lang, 'incidentType')}</h3></div>
        <label className="text-xs font-semibold">{t(lang, 'facility')}<select required value={incidentFacility} onChange={event => setIncidentFacility(event.target.value)} className={inputClass}><option value="">{t(lang, 'chooseFacility')}</option>{facilities.map(item => <option key={item.id} value={item.id}>{item.facility} · {item.city}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">{t(lang, 'incidentType')}<select value={incidentType} onChange={event => setIncidentType(event.target.value as IncidentType)} className={inputClass}>{incidentOptions.map(([value, label]) => <option key={value} value={value}>{t(lang, label)}</option>)}</select></label>
          <label className="text-xs font-semibold">{t(lang, 'occurredAt')}<input required type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} className={inputClass} /></label>
        </div>
        <label className="text-xs font-semibold">{t(lang, 'description')}<textarea required minLength={10} maxLength={2000} name="description" rows={4} className={inputClass} /></label>
        <p className="flex gap-2 rounded-xl bg-[#fff4e5] p-3 text-xs leading-5 text-[#76532d]"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{t(lang, 'privacyWarning')}</p>
        <button type="submit" disabled={!incidentFacility || createIncident.isPending} className={buttonClass}><ShieldAlert size={15} />{t(lang, 'sendIncident')}</button>
      </form>}

      <section className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
        <h3 className="font-display text-xl font-bold">{t(lang, 'inspectionHistory')}</h3>
        <div className="mt-4 space-y-3">
          {query.data.assessments.length ? query.data.assessments.map(item => <article key={item.id} className="rounded-2xl border border-[#e7e1d4] bg-[#fbf9f1] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-bold">{item.facility} · {item.city}</h4><p className="mt-1 text-xs text-[#687a71]">{t(lang, 'reviewedOn')}: {dateLabel(item.reviewedOn, lang)}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.status === 'approved' ? 'bg-[#e1efdf] text-[#2d6d4a]' : item.status === 'suspended' ? 'bg-[#f2dfd5] text-[#9a4435]' : 'bg-[#fff0d6] text-[#8a5b20]'}`}>{statusLabel(item.status)}</span></div>
            <p className="mt-3 text-sm leading-6 text-[#51665e]">{item.findings}</p>
            <div className="mt-3 grid gap-2 text-xs text-[#687a71] sm:grid-cols-2">
              <p>{t(lang, 'nextReview')}: {dateLabel(item.nextReviewOn, lang)}</p>
              <p>{t(lang, 'licenceExpiry')}: {dateLabel(item.licenceExpiresOn, lang)}{expiryWarning(item.licenceExpiresOn, lang) && <span className="ml-2 rounded-full bg-[#f2dfd5] px-2 py-1 font-bold text-[#9a4435]">{expiryWarning(item.licenceExpiresOn, lang)}</span>}</p>
              <p>{t(lang, 'insuranceExpiry')}: {dateLabel(item.insuranceExpiresOn, lang)}{expiryWarning(item.insuranceExpiresOn, lang) && <span className="ml-2 rounded-full bg-[#f2dfd5] px-2 py-1 font-bold text-[#9a4435]">{expiryWarning(item.insuranceExpiresOn, lang)}</span>}</p>
              {item.correctiveDueOn && <p>{t(lang, 'correctiveDue')}: {dateLabel(item.correctiveDueOn, lang)}</p>}
            </div>
            {item.correctiveAction && <p className="mt-2 rounded-xl bg-[#f1eddf] p-3 text-xs leading-5"><strong>{t(lang, 'correctiveAction')}:</strong> {item.correctiveAction}</p>}
            {isAdmin && assessmentSelect(item)}
          </article>) : <p className="rounded-xl bg-[#f7f4e9] p-4 text-sm text-[#75847c]">{t(lang, 'emptyAssessments')}</p>}
        </div>
      </section>
    </div>

    <section className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6">
      <h3 className="font-display text-xl font-bold">{t(lang, 'incidentHistory')}</h3>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {query.data.incidents.length ? query.data.incidents.map(item => <article key={item.id} className="rounded-2xl border border-[#e7e1d4] bg-[#fbf9f1] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-bold">{item.facility} · {item.city}</h4><p className="mt-1 text-xs text-[#687a71]">{t(lang, incidentOptions.find(([value]) => value === item.incidentType)?.[1] ?? 'otherIncident')} · {dateLabel(item.occurredAt, lang)}</p></div><span className="rounded-full bg-[#f1eddf] px-2.5 py-1 text-[10px] font-bold">{incidentStatusLabel(item.status)}</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#51665e]">{item.description}</p>
          {item.resolution && <p className="mt-2 rounded-xl bg-[#e1efdf] p-3 text-xs leading-5"><strong>{t(lang, 'resolution')}:</strong> {item.resolution}</p>}
          {isAdmin && <form key={`${item.id}-${item.updatedAt}`} onSubmit={event => void submitIncidentFollowUp(event, item.id)} className="mt-4 grid gap-3 border-t border-[#ece7d9] pt-4 sm:grid-cols-2">
            <label className="text-xs font-semibold">{t(lang, 'status')}<select name="status" defaultValue={item.status} className={inputClass}><option value="open">{t(lang, 'open')}</option><option value="under_review">{t(lang, 'underReview')}</option><option value="resolved">{t(lang, 'resolved')}</option></select></label>
            <label className="text-xs font-semibold sm:col-span-2">{t(lang, 'resolution')}<textarea name="resolution" maxLength={2000} rows={2} defaultValue={item.resolution ?? ''} className={inputClass} /></label>
            <button className={buttonClass} disabled={updateIncident.isPending}>{t(lang, 'saveFollowUp')}</button>
          </form>}
        </article>) : <p className="rounded-xl bg-[#f7f4e9] p-4 text-sm text-[#75847c] lg:col-span-2">{t(lang, 'emptyIncidents')}</p>}
      </div>
    </section>
  </section>;
}
