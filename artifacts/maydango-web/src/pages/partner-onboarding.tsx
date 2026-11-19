import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import {
  downloadPartnerApplicationDocument,
  getGetMyPartnerApplicationQueryKey,
  getGetPartnerOnboardingApplicationQueryKey,
  getGetPartnerOnboardingApplicationsQueryKey,
  useCompletePartnerApplicationUpload,
  useGetMyPartnerApplication,
  useGetPartnerOnboardingApplication,
  useGetPartnerOnboardingApplications,
  useRequestPartnerApplicationUploadUrl,
  useSubmitPartnerApplication,
  useReviewPartnerApplicationDocument,
  useCreatePartnerOnboardingInspection,
  useUpdateMyPartnerApplication,
  useUpdatePartnerOnboardingStatus,
} from '@workspace/api-client-react';
import type {
  PartnerApplication,
  PartnerApplicationDocument,
  PartnerApplicationInput,
  PartnerApplicationHours,
  PartnerApplicationUploadInput,
  PartnerOnboardingChecklistStatus,
  PartnerOnboardingHygieneChecklist,
  PartnerOnboardingInspection,
  PartnerOnboardingInspectionInput,
  PartnerOnboardingSafetyChecklist,
  PartnerOnboardingStatus,
} from '@workspace/api-client-react';
import {
  ArrowDownToLine,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  FileText,
  LockKeyhole,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';

const statuses: PartnerOnboardingStatus[] = [
  'application_received', 'under_review', 'additional_documents_required', 'commercial_negotiation',
  'contract_issued', 'contract_signed', 'facility_setup', 'qr_code_issued',
  'staff_training_completed', 'test_checkin_completed', 'approved', 'live', 'rejected',
];
const labels: Record<PartnerOnboardingStatus, string> = {
  application_received: 'Application received',
  under_review: 'Under review',
  additional_documents_required: 'Additional documents required',
  commercial_negotiation: 'Commercial discussion',
  contract_issued: 'Agreement issued',
  contract_signed: 'Agreement signed',
  facility_setup: 'Facility setup',
  qr_code_issued: 'Check-in code issued',
  staff_training_completed: 'Staff training completed',
  test_checkin_completed: 'Test check-in completed',
  approved: 'Approved',
  live: 'Live on MaydanGo',
  rejected: 'Not proceeding',
};
const documentNames: Record<PartnerApplicationDocument['documentType'], string> = {
  business_registration: 'Business registration',
  tax_document: 'Tax document',
  licence: 'Licence',
  insurance: 'Insurance',
  facility_image: 'Facility image',
  supporting_document: 'Supporting document',
};
const uploadTypes: PartnerApplicationUploadInput['documentType'][] = [
  'business_registration', 'tax_document', 'licence', 'insurance', 'facility_image', 'supporting_document',
];
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const activityOptions = ['Fitness', 'Gym', 'Swimming', 'Yoga', 'Pilates', 'Martial arts', 'Dance', 'Outdoor activities', 'Team sports', 'Other'];
const stageOrder: PartnerOnboardingStatus[] = statuses.filter(status => status !== 'rejected');
const allowedNextStatuses: Record<PartnerOnboardingStatus, PartnerOnboardingStatus[]> = {
  application_received: ['under_review', 'additional_documents_required', 'rejected'],
  under_review: ['additional_documents_required', 'commercial_negotiation', 'rejected'],
  additional_documents_required: ['under_review', 'rejected'],
  commercial_negotiation: ['additional_documents_required', 'contract_issued', 'rejected'],
  contract_issued: ['additional_documents_required', 'contract_signed'],
  contract_signed: ['additional_documents_required', 'facility_setup'],
  facility_setup: ['qr_code_issued', 'additional_documents_required'],
  qr_code_issued: ['staff_training_completed', 'additional_documents_required'],
  staff_training_completed: ['test_checkin_completed', 'additional_documents_required'],
  test_checkin_completed: ['approved', 'additional_documents_required'],
  approved: ['live'],
  live: [],
  rejected: [],
};

const emptyHours = (): PartnerApplicationHours[] => dayNames.map((_, day) => ({ day, closed: false, opensAt: '08:00', closesAt: '20:00' }));
const initialForm = (): PartnerApplicationInput => ({
  applicantName: '', contactPhone: '', legalBusinessName: '', facilityName: '', address: '', city: '',
  district: '', latitude: null, longitude: null, businessRegistrationReference: '', taxReference: '',
  activityCategories: [], openingHours: emptyHours(), capacity: null, pricingDetails: '',
});
const asForm = (application: PartnerApplication): PartnerApplicationInput => ({
  applicantName: application.applicantName, contactPhone: application.contactPhone,
  legalBusinessName: application.legalBusinessName, facilityName: application.facilityName,
  address: application.address, city: application.city, district: application.district ?? '',
  latitude: application.latitude ?? null, longitude: application.longitude ?? null,
  businessRegistrationReference: application.businessRegistrationReference ?? '',
  taxReference: application.taxReference ?? '', activityCategories: application.activityCategories,
  openingHours: application.openingHours, capacity: application.capacity ?? null,
  pricingDetails: application.pricingDetails ?? '',
});
const formatDate = (date: string) => new Intl.DateTimeFormat('en-IQ', { dateStyle: 'medium', timeZone: 'Asia/Baghdad' }).format(new Date(date));
const errorStatus = (error: unknown) => (error as { status?: number; response?: { status?: number } } | null)?.status ?? (error as { response?: { status?: number } } | null)?.response?.status;

function Shell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return <main className="min-h-[100dvh] bg-[#f3f0e7] text-[#193c34]">
    <header className="border-b border-[#d9d5c8] bg-[#fbfaf5]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#174d43] text-[#f9f3df]"><Building2 size={20} /></div>
          <div><p className="font-display text-lg font-extrabold tracking-tight">MaydanGo</p><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#728078]">Partner onboarding · Iraq</p></div>
        </div>
        <span className="rounded-full border border-[#d8d4c7] px-3 py-1.5 text-xs font-semibold text-[#60736b]">{admin ? 'Operations desk' : 'Partner application'}</span>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10 md:py-12">{children}</div>
    <footer className="border-t border-[#d9d5c8] px-5 py-5 text-center text-xs text-[#728078]">MaydanGo welcomes partner facilities across Iraq, including Kurdistan, the south and the west.</footer>
  </main>;
}

function Section({ number, title, description, children }: { number: string; title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-[#dfdccf] bg-[#fbfaf5] p-5 shadow-[0_8px_28px_rgba(38,54,42,.035)] md:p-7">
    <div className="mb-6 flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e8eddf] text-xs font-bold text-[#285b4c]">{number}</span><div><h2 className="font-display text-xl font-bold">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-[#718078]">{description}</p>}</div></div>
    {children}
  </section>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[#34544a]"><span>{label}</span>{children}{hint && <span className="text-xs font-normal leading-5 text-[#7a8981]">{hint}</span>}</label>;
}
const inputClass = 'w-full rounded-xl border border-[#d8d5ca] bg-[#fffef9] px-3.5 py-3 text-sm text-[#193c34] placeholder:text-[#9aa49d] focus:border-[#4f8370] focus:outline-none focus:ring-2 focus:ring-[#4f8370]/15 disabled:opacity-60';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#174d43] px-5 py-3 text-sm font-bold text-[#fff9e9] transition hover:bg-[#226556] disabled:cursor-not-allowed disabled:opacity-50';
const mutedButton = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[#d8d5ca] bg-[#fbfaf5] px-4 py-2.5 text-sm font-semibold text-[#34544a] hover:bg-[#f1efe5] disabled:opacity-50';

function AccessMessage({ admin = false, denied = false }: { admin?: boolean; denied?: boolean }) {
  return <Shell admin={admin}><div className="mx-auto max-w-xl rounded-3xl border border-[#dfdccf] bg-[#fbfaf5] p-8 text-center">
    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e8eddf] text-[#285b4c]">{denied ? <ShieldCheck /> : <LockKeyhole />}</div>
    <h1 className="mt-5 font-display text-2xl font-bold">{denied ? 'This view is not available' : 'Sign in to continue'}</h1>
    <p className="mt-2 text-sm leading-6 text-[#718078]">{denied ? 'Your account could not access this onboarding information. MaydanGo checks access on the service; if you believe this is an error, contact the team.' : 'Sign in to your MaydanGo account to view or submit a partner application.'}</p>
    {!denied && <a className={`${buttonClass} mt-6`} href="/sign-in">Continue to sign in <ArrowRight size={16} /></a>}
  </div></Shell>;
}

function ApplicantStatus({ app, history }: { app: PartnerApplication; history: { id: string; toStatus: PartnerOnboardingStatus; fromStatus: PartnerOnboardingStatus | null; note: string | null; createdAt: string; actorKind: string }[] }) {
  const currentIdx = stageOrder.indexOf(app.status);
  return <Section number="✓" title="Application progress" description="We will update this timeline as your application moves forward.">
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-[#e5eee5] px-3 py-1.5 text-xs font-bold text-[#315d43]">{labels[app.status]}</span>
      <span className="text-xs text-[#7a8981]">Submitted {formatDate(app.createdAt)}</span>
    </div>
    {app.statusNote && <p className="mb-5 rounded-xl border border-[#e7d7b8] bg-[#fff8e9] p-4 text-sm leading-6 text-[#755d36]">{app.statusNote}</p>}
    <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
      {stageOrder.map((status, index) => {
        const complete = currentIdx > index || app.status === 'live';
        const active = status === app.status;
        return <div key={status} className="flex gap-3 py-2.5">
          <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${complete ? 'bg-[#174d43] text-white' : active ? 'border-2 border-[#bd754d] bg-[#fff8f0] text-[#bd754d]' : 'border border-[#dedbcf] bg-[#f7f5ed] text-transparent'}`}>{complete ? <Check size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span>
          <span className={`text-xs leading-5 ${active ? 'font-bold text-[#193c34]' : complete ? 'text-[#526a5e]' : 'text-[#9aa49d]'}`}>{labels[status]}</span>
        </div>;
      })}
    </div>
    {app.status === 'rejected' && <p className="mt-4 text-sm text-[#8d4b3e]">The team has recorded that this application will not proceed at this time.</p>}
    {history.length > 0 && <div className="mt-6 border-t border-[#e8e5db] pt-5"><h3 className="text-xs font-bold uppercase tracking-[.14em] text-[#76847c]">Status history</h3><ol className="mt-3 space-y-3">{history.map(event => <li key={event.id} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#bd754d]" /><div><p className="font-semibold">{labels[event.toStatus]}</p><p className="mt-0.5 text-xs text-[#7a8981]">{formatDate(event.createdAt)} · {event.actorKind === 'team' ? 'MaydanGo team' : 'Applicant'}</p>{event.note && <p className="mt-1 text-xs leading-5 text-[#64776d]">{event.note}</p>}</div></li>)}</ol></div>}
  </Section>;
}

type ChecklistDraft<T extends object> = { [K in keyof T]: PartnerOnboardingChecklistStatus | '' };
type InspectionCheckKey = keyof PartnerOnboardingHygieneChecklist | keyof PartnerOnboardingSafetyChecklist;

const emptyHygieneChecklist = (): ChecklistDraft<PartnerOnboardingHygieneChecklist> => ({
  cleanliness: '',
  changingAreas: '',
  showers: '',
  waterSanitation: '',
});
const emptySafetyChecklist = (): ChecklistDraft<PartnerOnboardingSafetyChecklist> => ({
  emergencyExits: '',
  firstAid: '',
  equipmentCondition: '',
  incidentPlan: '',
});
const inspectionCheckLabels: Record<InspectionCheckKey, string> = {
  cleanliness: 'Cleanliness',
  changingAreas: 'Changing areas',
  showers: 'Showers',
  waterSanitation: 'Water and sanitation',
  emergencyExits: 'Emergency exits',
  firstAid: 'First aid',
  equipmentCondition: 'Equipment condition',
  incidentPlan: 'Incident plan',
};
const hygieneCheckKeys: (keyof PartnerOnboardingHygieneChecklist)[] = [
  'cleanliness', 'changingAreas', 'showers', 'waterSanitation',
];
const safetyCheckKeys: (keyof PartnerOnboardingSafetyChecklist)[] = [
  'emergencyExits', 'firstAid', 'equipmentCondition', 'incidentPlan',
];
const checklistStatusLabel = (status: PartnerOnboardingChecklistStatus) => status === 'pass'
  ? 'Passed'
  : status === 'action_required' ? 'Action required' : 'Not applicable';
const baghdadDate = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

function InspectionHistory({ inspections }: { inspections: PartnerOnboardingInspection[] }) {
  if (inspections.length === 0) return null;
  return <Section number="✓" title="Facility inspection history" description="The inspection outcome and any required corrective action are shared with the applicant.">
    <ol className="space-y-3">
      {inspections.map(inspection => <li key={inspection.id} className="rounded-xl border border-[#e4e1d7] bg-[#fffef9] p-4" data-testid={`inspection-history-${inspection.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">{formatDate(inspection.inspectedOn)}</p>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${inspection.status === 'approved' ? 'bg-[#e5eee5] text-[#315d43]' : 'bg-[#fff1e6] text-[#8b5631]'}`}>
            {inspection.status === 'approved' ? 'Approved' : 'Corrective action required'}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-[#53685e]">{inspection.findings}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([
            { group: 'Hygiene', checklist: inspection.hygieneChecklist },
            { group: 'Safety', checklist: inspection.safetyChecklist },
          ] as const).map(({ group, checklist }) => <div key={group} className="rounded-lg bg-[#f3f1e9] p-3">
            <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#7a8981]">{group}</h4>
            <ul className="space-y-1.5">{Object.entries(checklist).map(([key, status]) => <li key={key} className="flex justify-between gap-2 text-xs">
              <span>{inspectionCheckLabels[key as InspectionCheckKey]}</span>
              <span className={status === 'action_required' ? 'font-semibold text-[#8b5631]' : 'text-[#718078]'}>{checklistStatusLabel(status as PartnerOnboardingChecklistStatus)}</span>
            </li>)}</ul>
          </div>)}
        </div>
        {inspection.correctiveAction && <div className="mt-3 rounded-lg border border-[#eadcc0] bg-[#fff8e9] p-3">
          <p className="text-xs font-bold text-[#715533]">Corrective action</p>
          <p className="mt-1 text-sm leading-5 text-[#715533]">{inspection.correctiveAction}</p>
          {inspection.correctiveDueOn && <p className="mt-1 text-xs text-[#806944]">Due {formatDate(inspection.correctiveDueOn)}</p>}
        </div>}
      </li>)}
    </ol>
  </Section>;
}

function InspectionChecklistFields<K extends string>({
  title,
  keys,
  labels,
  values,
  onChange,
}: {
  title: string;
  keys: readonly K[];
  labels: Record<K, string>;
  values: Record<K, PartnerOnboardingChecklistStatus | ''>;
  onChange: (key: K, value: PartnerOnboardingChecklistStatus | '') => void;
}) {
  return <fieldset className="rounded-xl border border-[#dedbd1] bg-[#fffef9] p-3">
    <legend className="px-1 text-xs font-bold">{title}</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      {keys.map(key => <Field key={key} label={labels[key]}>
        <select
          data-testid={`select-onboarding-inspection-${key}`}
          className={inputClass}
          required
          value={values[key]}
          onChange={event => onChange(key, event.target.value as PartnerOnboardingChecklistStatus | '')}
        >
          <option value="">Choose result</option>
          <option value="pass">Passed</option>
          <option value="action_required">Action required</option>
          <option value="not_applicable">Not applicable</option>
        </select>
      </Field>)}
    </div>
  </fieldset>;
}

export function PartnerApplicationPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const query = useGetMyPartnerApplication({ query: { enabled: isLoaded && isSignedIn, retry: false } });
  const submit = useSubmitPartnerApplication();
  const update = useUpdateMyPartnerApplication();
  const requestUpload = useRequestPartnerApplicationUploadUrl();
  const completeUpload = useCompletePartnerApplicationUpload();
  const [form, setForm] = useState<PartnerApplicationInput>(initialForm);
  const [initialized, setInitialized] = useState(false);
  const [startingNewApplication, setStartingNewApplication] = useState(false);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [busyType, setBusyType] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const response = query.data;
  const savedApplication = response?.application ?? null;
  const app = startingNewApplication ? null : savedApplication;
  useEffect(() => {
    if (app && !initialized) {
      setForm(asForm(app));
      setInitialized(true);
    }
  }, [app?.id, initialized]);
  if (!isLoaded) return <Shell><div className="mx-auto max-w-3xl animate-pulse space-y-5"><div className="h-10 w-1/3 rounded-xl bg-[#e4e1d6]" /><div className="h-56 rounded-2xl bg-[#e4e1d6]" /><div className="h-48 rounded-2xl bg-[#e4e1d6]" /></div></Shell>;
  if (!isSignedIn) return <AccessMessage />;
  if (query.isLoading) return <Shell><div className="mx-auto max-w-3xl animate-pulse space-y-5"><div className="h-10 w-1/3 rounded-xl bg-[#e4e1d6]" /><div className="h-56 rounded-2xl bg-[#e4e1d6]" /><div className="h-48 rounded-2xl bg-[#e4e1d6]" /></div></Shell>;
  if (query.isError && errorStatus(query.error) === 403) return <AccessMessage denied />;
  const setField = <K extends keyof PartnerApplicationInput>(key: K, value: PartnerApplicationInput[K]) => setForm(current => ({ ...current, [key]: value }));
  const editable = !app || app.status === 'additional_documents_required';
  const canUpload = Boolean(app && ['application_received', 'additional_documents_required'].includes(app.status));
  const patchHours = (day: number, patch: Partial<PartnerApplicationHours>) => setField('openingHours', form.openingHours.map(item => item.day === day ? { ...item, ...patch } : item));
  const saveApplication = async (event: FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.activityCategories.length) { setFormError('Choose at least one activity category.'); return; }
    if ((form.latitude === null) !== (form.longitude === null)) { setFormError('Enter both map coordinates, or leave both blank.'); return; }
    const payload: PartnerApplicationInput = {
      ...form,
      district: form.district || null,
      latitude: form.latitude === null || Number.isNaN(form.latitude) ? null : Number(form.latitude),
      longitude: form.longitude === null || Number.isNaN(form.longitude) ? null : Number(form.longitude),
      businessRegistrationReference: form.businessRegistrationReference || null,
      taxReference: form.taxReference || null,
      capacity: form.capacity === null || Number.isNaN(form.capacity) ? null : Number(form.capacity),
      pricingDetails: form.pricingDetails || null,
    };
    try {
      const result = app ? await update.mutateAsync({ id: app.id, data: payload }) : await submit.mutateAsync({ data: payload });
      await queryClient.invalidateQueries({ queryKey: getGetMyPartnerApplicationQueryKey() });
      setForm(asForm(result.application));
      setInitialized(true);
      setStartingNewApplication(false);
      setNotice('Your application details have been saved.');
    } catch (error) {
      setFormError(errorStatus(error) === 401 ? 'Your session has ended. Sign in again and retry.' : 'We could not save your application. Please check the fields and try again.');
    }
  };
  const upload = async (type: PartnerApplicationUploadInput['documentType']) => {
    const file = files[type];
    if (!app || !file) return;
    if (file.size > 10 * 1024 * 1024) { setFormError('Each file must be no larger than 10 MB.'); return; }
    if ((type === 'licence' || type === 'insurance') && !expiries[type]) { setFormError('Add an expiry date for licences and insurance documents.'); return; }
    const allowed: PartnerApplicationUploadInput['contentType'][] = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type as PartnerApplicationUploadInput['contentType'])) { setFormError('Choose a PDF, JPEG, PNG or WebP file.'); return; }
    setBusyType(type); setFormError(''); setNotice('');
    try {
      const signed = await requestUpload.mutateAsync({ id: app.id, data: {
        documentName: file.name.slice(0, 180), documentType: type,
        contentType: file.type as PartnerApplicationUploadInput['contentType'], size: file.size,
        expiresOn: type === 'licence' || type === 'insurance' ? expiries[type] : null,
      } });
      const put = await fetch(signed.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error('Upload did not complete');
      await completeUpload.mutateAsync({ id: app.id, documentId: signed.id });
      await queryClient.invalidateQueries({ queryKey: getGetMyPartnerApplicationQueryKey() });
      setFiles(current => ({ ...current, [type]: null }));
      setNotice(`${documentNames[type]} uploaded privately.`);
    } catch (error) {
      setFormError(errorStatus(error) === 401 ? 'Your session has ended. Sign in again and retry.' : 'The file could not be uploaded. Please try again.');
    } finally { setBusyType(null); }
  };
  const mutationPending = submit.isPending || update.isPending;
  const documents = response?.documents ?? [];
  return <Shell>
    <div className="mb-8 grid gap-7 lg:grid-cols-[1fr_300px] lg:items-end">
      <div><p className="mb-3 text-xs font-bold uppercase tracking-[.23em] text-[#b36a44]">A thoughtful start, wherever you are</p><h1 className="font-display max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">Let’s get to know your facility.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[#66786f]">Share the details our team needs to review your partnership application. Facilities and activities from across Iraq are welcome.</p></div>
      <aside className="rounded-2xl border border-[#d8d5ca] bg-[#e9eee4] p-5"><div className="flex gap-3"><MapPin size={18} className="mt-0.5 shrink-0 text-[#285b4c]" /><p className="text-sm leading-6 text-[#52675d]">From Kurdistan to the south and west, MaydanGo works with facilities rooted in their local communities.</p></div></aside>
    </div>
    {query.isError && <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-[#e4c3b7] bg-[#fff5f1] p-4 text-sm text-[#8f4436]" role="alert"><span>{errorStatus(query.error) === 401 ? 'Your session could not be verified. Sign in again to access your application.' : 'We could not load your application.'}</span>{errorStatus(query.error) === 401 ? <a href="/sign-in" className="font-bold underline">Sign in</a> : <button type="button" className={mutedButton} onClick={() => void query.refetch()}><RefreshCw size={15} /> Retry</button>}</div>}
    {app && <div className="mb-6"><ApplicantStatus app={app} history={response?.history ?? []} /></div>}
    {app && <div className="mb-6"><InspectionHistory inspections={response?.inspections ?? []} /></div>}
    {savedApplication?.status === 'rejected' && !startingNewApplication && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e4c3b7] bg-[#fff5f1] p-4"><p className="text-sm text-[#8f4436]">You can submit a new application with updated details.</p><button data-testid="button-new-application" type="button" className={mutedButton} onClick={() => { setForm(initialForm()); setInitialized(false); setStartingNewApplication(true); setNotice(''); setFormError(''); }}>Start a new application <ArrowRight size={15} /></button></div>}
    <form onSubmit={saveApplication} className="grid gap-5">
      <Section number="01" title="Your business and facility" description="Use the names and contact details your team can verify with you.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Applicant name"><input data-testid="input-applicant-name" className={inputClass} required minLength={2} value={form.applicantName} onChange={e => setField('applicantName', e.target.value)} disabled={!editable} /></Field>
          <Field label="Contact phone"><input data-testid="input-contact-phone" className={inputClass} required type="tel" value={form.contactPhone} onChange={e => setField('contactPhone', e.target.value)} disabled={!editable} /></Field>
          <Field label="Legal business name"><input data-testid="input-legal-business" className={inputClass} required value={form.legalBusinessName} onChange={e => setField('legalBusinessName', e.target.value)} disabled={!editable} /></Field>
          <Field label="Facility name"><input data-testid="input-facility-name" className={inputClass} required value={form.facilityName} onChange={e => setField('facilityName', e.target.value)} disabled={!editable} /></Field>
          <Field label="City"><input data-testid="input-city" className={inputClass} required placeholder="For example, Sulaymaniyah" value={form.city} onChange={e => setField('city', e.target.value)} disabled={!editable} /></Field>
          <Field label="District (optional)"><input data-testid="input-district" className={inputClass} value={form.district ?? ''} onChange={e => setField('district', e.target.value)} disabled={!editable} /></Field>
          <div className="md:col-span-2"><Field label="Facility address"><textarea data-testid="input-address" className={`${inputClass} min-h-24 resize-y`} required value={form.address} onChange={e => setField('address', e.target.value)} disabled={!editable} /></Field></div>
          <Field label="Latitude (optional)" hint="Provide latitude and longitude together."><input data-testid="input-latitude" className={inputClass} type="number" step="any" value={form.latitude ?? ''} onChange={e => setField('latitude', e.target.value === '' ? null : Number(e.target.value))} disabled={!editable} /></Field>
          <Field label="Longitude (optional)"><input data-testid="input-longitude" className={inputClass} type="number" step="any" value={form.longitude ?? ''} onChange={e => setField('longitude', e.target.value === '' ? null : Number(e.target.value))} disabled={!editable} /></Field>
          <Field label="Business registration reference (optional)"><input data-testid="input-registration-reference" className={inputClass} value={form.businessRegistrationReference ?? ''} onChange={e => setField('businessRegistrationReference', e.target.value)} disabled={!editable} /></Field>
          <Field label="Tax reference (optional)"><input data-testid="input-tax-reference" className={inputClass} value={form.taxReference ?? ''} onChange={e => setField('taxReference', e.target.value)} disabled={!editable} /></Field>
        </div>
      </Section>
      <Section number="02" title="Activities and capacity" description="Select the activities offered at this facility. You can describe pricing for context; it is not an agreement.">
        <fieldset disabled={!editable}><legend className="mb-3 text-sm font-semibold text-[#34544a]">Activity categories</legend><div className="flex flex-wrap gap-2">{activityOptions.map(category => {
          const checked = form.activityCategories.includes(category);
          return <label key={category} className={`cursor-pointer rounded-full border px-3.5 py-2 text-xs font-semibold transition ${checked ? 'border-[#174d43] bg-[#e5eee5] text-[#285b4c]' : 'border-[#dad7cc] bg-[#fffef9] text-[#65776e]'}`}><input className="sr-only" type="checkbox" checked={checked} onChange={() => setField('activityCategories', checked ? form.activityCategories.filter(value => value !== category) : [...form.activityCategories, category])} />{category}</label>;
        })}</div></fieldset>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Capacity (optional)" hint="Maximum number of people the facility can accommodate."><input data-testid="input-capacity" className={inputClass} type="number" min="1" value={form.capacity ?? ''} onChange={e => setField('capacity', e.target.value ? Number(e.target.value) : null)} disabled={!editable} /></Field>
          <Field label="Pricing details (optional)" hint="Add a brief note if useful. Final commercial terms are discussed separately."><textarea data-testid="input-pricing-details" className={`${inputClass} min-h-24 resize-y`} maxLength={2000} value={form.pricingDetails ?? ''} onChange={e => setField('pricingDetails', e.target.value)} disabled={!editable} /></Field>
        </div>
      </Section>
      <Section number="03" title="Opening hours" description="Set the usual local hours for each day. Closed days do not need opening or closing times.">
        <div className="divide-y divide-[#e9e6dc]">{dayNames.map((day, index) => {
          const hour = form.openingHours.find(item => item.day === index) ?? { day: index, closed: false, opensAt: '08:00', closesAt: '20:00' };
          return <div key={day} className="grid items-center gap-3 py-3 sm:grid-cols-[1fr_110px_1fr_1fr]">
            <span className="text-sm font-semibold">{day}</span>
            <label className="flex items-center gap-2 text-xs text-[#66786f]"><input data-testid={`input-closed-${index}`} type="checkbox" checked={hour.closed} disabled={!editable} onChange={e => patchHours(index, { closed: e.target.checked, opensAt: e.target.checked ? null : '08:00', closesAt: e.target.checked ? null : '20:00' })} className="accent-[#174d43]" />Closed</label>
            <Field label="Opens"><input data-testid={`input-opens-${index}`} className={inputClass} type="time" value={hour.opensAt ?? ''} disabled={!editable || hour.closed} onChange={e => patchHours(index, { opensAt: e.target.value || null })} /></Field>
            <Field label="Closes"><input data-testid={`input-closes-${index}`} className={inputClass} type="time" value={hour.closesAt ?? ''} disabled={!editable || hour.closed} onChange={e => patchHours(index, { closesAt: e.target.value || null })} /></Field>
          </div>;
        })}</div>
      </Section>
      {formError && <p role="alert" className="rounded-xl border border-[#e4c3b7] bg-[#fff5f1] p-4 text-sm text-[#8f4436]">{formError}</p>}
      {notice && <p role="status" className="rounded-xl border border-[#cbdcc9] bg-[#edf4ee] p-4 text-sm text-[#315d43]">{notice}</p>}
      {editable && <div className="flex flex-wrap items-center justify-between gap-4"><p className="max-w-xl text-xs leading-5 text-[#7a8981]">Your details and uploads are shared privately with authorized MaydanGo staff for application review.</p><button data-testid="button-save-application" className={buttonClass} type="submit" disabled={mutationPending}>{mutationPending ? 'Saving application…' : app ? 'Save application details' : 'Submit application'} <ArrowRight size={16} /></button></div>}
    </form>
      {app && <div className="mt-7"><Section number="04" title="Private documents and facility images" description="Upload clear copies for review. Files are limited to PDF, JPEG, PNG or WebP and 10 MB each. Licences and insurance require an expiry date.">
      <div className="grid gap-3 md:grid-cols-2">{uploadTypes.map(type => {
         const doc = documents.find(item => item.documentType === type);
        const selectedFile = files[type];
        const expiryNeeded = type === 'licence' || type === 'insurance';
        return <article key={type} className="rounded-xl border border-[#e4e1d7] bg-[#fffef9] p-4">
          <div className="flex items-start justify-between gap-3"><div className="flex gap-2.5"><FileText size={17} className="mt-0.5 text-[#557968]" /><div><h3 className="text-sm font-bold">{documentNames[type]}</h3>{doc && <p className="mt-1 text-xs text-[#76847c]">{doc.documentName} · {doc.status.replaceAll('_', ' ')}</p>}</div></div>{doc && <span className="text-[10px] font-bold uppercase tracking-wide text-[#557968]">{doc.status === 'approved' ? 'Accepted' : doc.status === 'rejected' ? 'Needs attention' : 'Received'}</span>}</div>
           {!canUpload ? null : <div className="mt-4 grid gap-3">
            {expiryNeeded && <Field label="Expiry date"><input data-testid={`input-expiry-${type}`} className={inputClass} type="date" value={expiries[type] ?? ''} onChange={e => setExpiries(current => ({ ...current, [type]: e.target.value }))} /></Field>}
            <input data-testid={`input-file-${type}`} type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={e => setFiles(current => ({ ...current, [type]: e.target.files?.[0] ?? null }))} className="block w-full text-xs text-[#65776e] file:mr-3 file:rounded-lg file:border-0 file:bg-[#e8eddf] file:px-3 file:py-2 file:font-semibold file:text-[#285b4c]" />
            <button type="button" data-testid={`button-upload-${type}`} className={mutedButton} disabled={!selectedFile || busyType !== null} onClick={() => void upload(type)}>{busyType === type ? 'Uploading securely…' : <><Upload size={15} /> Upload {documentNames[type].toLowerCase()}</>}</button>
          </div>}
        </article>;
      })}</div>
      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#738178]"><LockKeyhole size={14} className="mt-0.5 shrink-0" />Uploads are private and provided only for this application review.</p>
    </Section></div>}
    {app && documents.length > 0 && <div className="mt-5 rounded-xl border border-[#dfdccf] bg-[#fbfaf5] p-4 text-xs text-[#718078]">Uploaded items: {documents.length}. {documents.filter(item => item.reviewNote).map(item => `${documentNames[item.documentType]}: ${item.reviewNote}`).join(' · ')}</div>}
  </Shell>;
}

export function PartnerOnboardingAdminPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useGetPartnerOnboardingApplications({ query: { enabled: isLoaded && isSignedIn, retry: false } });
  const [selectedId, setSelectedId] = useState('');
  const detailQuery = useGetPartnerOnboardingApplication(selectedId, { query: { enabled: isLoaded && isSignedIn && !!selectedId, retry: false, queryKey: getGetPartnerOnboardingApplicationQueryKey(selectedId) } });
  const updateStatus = useUpdatePartnerOnboardingStatus();
  const createInspection = useCreatePartnerOnboardingInspection();
  const reviewDocument = useReviewPartnerApplicationDocument();
  const [targetStatus, setTargetStatus] = useState<PartnerOnboardingStatus | ''>('');
  const [note, setNote] = useState('');
  const [inspectionDate, setInspectionDate] = useState(baghdadDate);
  const [inspectionFindings, setInspectionFindings] = useState('');
  const [inspectionHygiene, setInspectionHygiene] = useState(emptyHygieneChecklist);
  const [inspectionSafety, setInspectionSafety] = useState(emptySafetyChecklist);
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [correctiveDueOn, setCorrectiveDueOn] = useState('');
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [downloadBusy, setDownloadBusy] = useState('');
  const applications = listQuery.data ?? [];
  const current = detailQuery.data;
  const latestInspection = current?.inspections[0] ?? null;
  const hasApprovedInspection = latestInspection?.status === 'approved';
  const availableStatuses = useMemo(() => current
    ? allowedNextStatuses[current.application.status].filter(status =>
      !['approved', 'live'].includes(status) || hasApprovedInspection)
    : [], [current, hasApprovedInspection]);
  if (!isLoaded) return <Shell admin><div className="animate-pulse space-y-5"><div className="h-10 w-1/3 rounded-xl bg-[#e4e1d6]" /><div className="h-64 rounded-2xl bg-[#e4e1d6]" /></div></Shell>;
  if (!isSignedIn) return <AccessMessage admin />;
  if (listQuery.isLoading) return <Shell admin><div className="animate-pulse space-y-5"><div className="h-10 w-1/3 rounded-xl bg-[#e4e1d6]" /><div className="h-64 rounded-2xl bg-[#e4e1d6]" /></div></Shell>;
  if (listQuery.isError && errorStatus(listQuery.error) === 403) return <AccessMessage admin denied />;
  const download = async (document: PartnerApplicationDocument) => {
    if (!selectedId) return;
    setDownloadBusy(document.id); setActionError('');
    try {
      const blob = await downloadPartnerApplicationDocument(selectedId, document.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url; link.download = document.documentName; link.click();
       window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setActionError(errorStatus(error) === 403 ? 'You do not have permission to download this document.' : 'The document could not be downloaded.'); }
    finally { setDownloadBusy(''); }
  };
  const reviewFile = async (document: PartnerApplicationDocument, status: 'approved' | 'rejected') => {
    if (!current) return;
    const reviewNote = documentNotes[document.id]?.trim() ?? '';
    if (reviewNote.length < 4) {
      setActionError('Add a clear review note of at least four characters.');
      return;
    }
    setActionError('');
    setFeedback('');
    try {
      await reviewDocument.mutateAsync({
        id: current.application.id,
        documentId: document.id,
        data: { status, note: reviewNote },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetPartnerOnboardingApplicationQueryKey(current.application.id) }),
        queryClient.invalidateQueries({ queryKey: getGetPartnerOnboardingApplicationsQueryKey() }),
      ]);
      setDocumentNotes(notes => ({ ...notes, [document.id]: '' }));
      setFeedback(status === 'approved' ? 'Document accepted.' : 'Document declined; the application is now awaiting the requested information.');
    } catch (error) {
      setActionError(errorStatus(error) === 403
        ? 'The service did not authorize this review.'
        : 'The document review could not be saved. Please check the application stage and try again.');
    }
  };
  const recordInspection = async (event: FormEvent) => {
    event.preventDefault();
    if (!current) return;
    setActionError('');
    setFeedback('');
    const hygieneValues = Object.values(inspectionHygiene);
    const safetyValues = Object.values(inspectionSafety);
    if ([...hygieneValues, ...safetyValues].some(value => !value)) {
      setActionError('Complete every hygiene and safety checklist item.');
      return;
    }
    if (inspectionFindings.trim().length < 4) {
      setActionError('Add clear inspection findings.');
      return;
    }
    const needsCorrectiveAction = [...hygieneValues, ...safetyValues].includes('action_required');
    if (needsCorrectiveAction && (correctiveAction.trim().length < 4 || !correctiveDueOn || correctiveDueOn < inspectionDate)) {
      setActionError('Add a corrective action and a due date on or after the inspection date.');
      return;
    }
    const payload: PartnerOnboardingInspectionInput = {
      inspectedOn: inspectionDate,
      hygieneChecklist: inspectionHygiene as PartnerOnboardingHygieneChecklist,
      safetyChecklist: inspectionSafety as PartnerOnboardingSafetyChecklist,
      status: needsCorrectiveAction ? 'action_required' : 'approved',
      findings: inspectionFindings.trim(),
      correctiveAction: needsCorrectiveAction ? correctiveAction.trim() : null,
      correctiveDueOn: needsCorrectiveAction ? correctiveDueOn : null,
    };
    try {
      await createInspection.mutateAsync({ id: current.application.id, data: payload });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetPartnerOnboardingApplicationQueryKey(current.application.id) }),
        queryClient.invalidateQueries({ queryKey: getGetPartnerOnboardingApplicationsQueryKey() }),
      ]);
      setInspectionDate(baghdadDate());
      setInspectionFindings('');
      setInspectionHygiene(emptyHygieneChecklist());
      setInspectionSafety(emptySafetyChecklist());
      setCorrectiveAction('');
      setCorrectiveDueOn('');
      setFeedback('Inspection recorded in the application history.');
    } catch (error) {
      setActionError(errorStatus(error) === 403
        ? 'The service did not authorize this inspection.'
        : errorStatus(error) === 409
          ? 'An inspection cannot be added after an application is live or rejected.'
          : 'The inspection could not be recorded. Check the date and checklist details.');
    }
  };
  const advance = async (event: FormEvent) => {
    event.preventDefault(); setActionError(''); setFeedback('');
    if (!current || !targetStatus || note.trim().length < 4) { setActionError('Choose a permitted next status and enter a note of at least four characters.'); return; }
    if (!availableStatuses.includes(targetStatus)) { setActionError('That status is not an available next step for this application.'); return; }
    try {
      await updateStatus.mutateAsync({ id: current.application.id, data: { status: targetStatus, note: note.trim() } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetPartnerOnboardingApplicationQueryKey(current.application.id) }),
        queryClient.invalidateQueries({ queryKey: getGetPartnerOnboardingApplicationsQueryKey() }),
      ]);
      setTargetStatus(''); setNote(''); setFeedback('Application status updated.');
    } catch (error) {
      setActionError(errorStatus(error) === 403
        ? 'The service did not authorize this action.'
        : errorStatus(error) === 409
          ? 'Record an approved facility inspection before approving or launching this partner.'
          : 'The status could not be updated. Confirm the permitted next step and try again.');
    }
  };
  return <Shell admin>
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-3 text-xs font-bold uppercase tracking-[.23em] text-[#b36a44]">Authorized staff · partner onboarding</p><h1 className="font-display text-4xl font-bold tracking-tight">Application review</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#66786f]">Review the submitted facility details, read status history, and move an application only to an available next step.</p></div><button data-testid="button-refresh-applications" className={mutedButton} type="button" onClick={() => void listQuery.refetch()}><RefreshCw size={15} /> Refresh list</button></div>
    {listQuery.isError && <div className="mb-5 rounded-xl border border-[#e4c3b7] bg-[#fff5f1] p-4 text-sm text-[#8f4436]" role="alert">Applications could not be loaded. <button className="ml-2 underline" type="button" onClick={() => void listQuery.refetch()}>Retry</button></div>}
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <aside className="overflow-hidden rounded-2xl border border-[#dfdccf] bg-[#fbfaf5]">
        <div className="border-b border-[#e5e2d8] px-5 py-4"><h2 className="font-display text-lg font-bold">Applications <span className="ml-1 text-sm font-medium text-[#7b8981]">({applications.length})</span></h2><p className="mt-1 text-xs text-[#7b8981]">Choose a record to review.</p></div>
        {!listQuery.isError && applications.length === 0 ? <div className="p-8 text-center"><Building2 className="mx-auto text-[#819189]" size={25} /><p className="mt-3 text-sm font-semibold">No applications to review</p><p className="mt-1 text-xs leading-5 text-[#7b8981]">New submissions will appear in this list.</p></div> : <div className="max-h-[70dvh] overflow-y-auto">{applications.map(item => <button data-testid={`button-select-application-${item.id}`} key={item.id} type="button" onClick={() => { setSelectedId(item.id); setActionError(''); setFeedback(''); setTargetStatus(''); }} className={`w-full border-b border-[#ece9e0] px-5 py-4 text-left transition hover:bg-[#f2f1e9] ${item.id === selectedId ? 'bg-[#eaf0e7]' : ''}`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.facilityName}</p><p className="mt-1 truncate text-xs text-[#728078]">{item.legalBusinessName}</p></div><ChevronRight size={16} className="mt-1 shrink-0 text-[#8a978f]" /></div>
          <div className="mt-3 flex items-center justify-between gap-2"><span className="rounded-full bg-[#edf0e7] px-2.5 py-1 text-[10px] font-bold text-[#526b5c]">{labels[item.status]}</span><span className="text-[10px] text-[#89958e]">{formatDate(item.updatedAt)}</span></div>
        </button>)}</div>}
      </aside>
      <section className="min-h-[400px] rounded-2xl border border-[#dfdccf] bg-[#fbfaf5] p-5 md:p-7">
        {!selectedId ? <div className="grid min-h-[360px] place-items-center text-center"><div><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e8eddf] text-[#285b4c]"><FileText /></div><h2 className="mt-4 font-display text-xl font-bold">Select an application</h2><p className="mt-2 max-w-sm text-sm leading-6 text-[#718078]">The application details and review actions will appear here.</p></div></div>
        : detailQuery.isLoading ? <div className="animate-pulse space-y-4"><div className="h-8 w-1/2 rounded-lg bg-[#e4e1d6]" /><div className="h-40 rounded-xl bg-[#e4e1d6]" /><div className="h-32 rounded-xl bg-[#e4e1d6]" /></div>
        : detailQuery.isError ? <div className="rounded-xl border border-[#e4c3b7] bg-[#fff5f1] p-5 text-sm text-[#8f4436]">{errorStatus(detailQuery.error) === 403 ? 'This account is not authorized to review this application.' : errorStatus(detailQuery.error) === 401 ? 'Your session could not be verified. Sign in again to continue.' : 'This application detail could not be loaded.'} <button className="ml-2 underline" type="button" onClick={() => void detailQuery.refetch()}>Retry</button></div>
        : current && <div>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e6e3d9] pb-5"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#b36a44]">{current.application.city}{current.application.district ? ` · ${current.application.district}` : ''}</p><h2 className="mt-2 font-display text-2xl font-bold">{current.application.facilityName}</h2><p className="mt-1 text-sm text-[#718078]">{current.application.legalBusinessName}</p></div><span className="rounded-full bg-[#e5eee5] px-3 py-1.5 text-xs font-bold text-[#315d43]">{labels[current.application.status]}</span></div>
           {actionError && <p role="alert" className="mt-4 rounded-lg border border-[#e4c3b7] bg-[#fff5f1] p-3 text-xs font-semibold text-[#984c3e]">{actionError}</p>}
           {feedback && <p role="status" className="mt-4 rounded-lg border border-[#cbdcc9] bg-[#edf4ee] p-3 text-xs font-semibold text-[#315d43]">{feedback}</p>}
          <div className="grid gap-x-8 gap-y-5 py-6 sm:grid-cols-2">
            {[
              ['Applicant', current.application.applicantName], ['Verified account email', current.application.contactEmail],
              ['Contact phone', current.application.contactPhone],
              ['Address', `${current.application.address}${current.application.district ? `, ${current.application.district}` : ''}, ${current.application.city}`],
              ['Map coordinates', current.application.latitude !== null && current.application.longitude !== null ? `${current.application.latitude}, ${current.application.longitude}` : 'Not provided'],
              ['Registration reference', current.application.businessRegistrationReference || 'Not provided'],
              ['Tax reference', current.application.taxReference || 'Not provided'],
              ['Activity categories', current.application.activityCategories.join(', ')],
              ['Capacity', current.application.capacity ?? 'Not provided'],
              ['Pricing details', current.application.pricingDetails || 'Not provided'],
            ].map(([label, value]) => <div key={label}><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#87938c]">{label}</p><p className="mt-1 text-sm leading-6 text-[#34544a]">{value}</p></div>)}
          </div>
          <div className="border-t border-[#e6e3d9] py-5"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Clock3 size={16} className="text-[#557968]" /> Weekly hours</h3><div className="grid gap-2 sm:grid-cols-2">{current.application.openingHours.map(hour => <div key={hour.day} className="flex justify-between rounded-lg bg-[#f3f1e9] px-3 py-2 text-xs"><span className="font-semibold">{dayNames[hour.day]}</span><span className="text-[#718078]">{hour.closed ? 'Closed' : `${hour.opensAt ?? '—'}–${hour.closesAt ?? '—'}`}</span></div>)}</div></div>
           {current.application.status === 'approved' && <div className="rounded-xl border border-[#d8c6a5] bg-[#fff8e8] p-4 text-xs leading-5 text-[#715533]">Before marking this application live, create at least one facility profile in the partner operations portal.</div>}
           {['staff_training_completed', 'test_checkin_completed'].includes(current.application.status) && <div className="rounded-xl border border-[#d8c6a5] bg-[#fff8e8] p-4 text-xs leading-5 text-[#715533]">The test check-in status is a workflow checkpoint. Complete the planned on-site and device/radius checks at the end before advancing.</div>}
           <div className="border-t border-[#e6e3d9] py-5"><h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><LockKeyhole size={16} className="text-[#557968]" /> Private documents</h3>
             {current.documents.length === 0 ? <p className="rounded-lg bg-[#f3f1e9] p-4 text-xs text-[#718078]">No documents have been uploaded.</p> : <div className="grid gap-3">{current.documents.map(doc => <article key={doc.id} className="rounded-xl border border-[#e4e1d7] bg-[#fffef9] p-3">
               <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-bold">{documentNames[doc.documentType]}</p><p className="mt-1 truncate text-[10px] text-[#7b8981]">{doc.documentName} · {doc.status.replaceAll('_', ' ')}{doc.expiresOn ? ` · expires ${formatDate(doc.expiresOn)}` : ''}</p>{doc.reviewNote && <p className="mt-1 text-xs leading-5 text-[#9a4435]">{doc.reviewNote}</p>}</div><button data-testid={`button-download-document-${doc.id}`} type="button" className={mutedButton} disabled={!!downloadBusy} onClick={() => void download(doc)} aria-label={`Download ${doc.documentName}`}>{downloadBusy === doc.id ? 'Loading…' : <ArrowDownToLine size={15} />}</button></div>
               {doc.status === 'submitted' && <div className="mt-3 border-t border-[#ece9e0] pt-3"><label className="block text-[10px] font-bold uppercase tracking-[.12em] text-[#87938c]">Review note<textarea data-testid={`input-document-review-${doc.id}`} className={`${inputClass} mt-1 min-h-16`} minLength={4} maxLength={1000} value={documentNotes[doc.id] ?? ''} onChange={e => setDocumentNotes(notes => ({ ...notes, [doc.id]: e.target.value }))} placeholder="Explain the decision and any required correction." /></label><div className="mt-2 flex flex-wrap gap-2"><button data-testid={`button-approve-document-${doc.id}`} type="button" className={mutedButton} disabled={reviewDocument.isPending} onClick={() => void reviewFile(doc, 'approved')}><Check size={14} />Accept document</button><button data-testid={`button-reject-document-${doc.id}`} type="button" className="inline-flex items-center gap-2 rounded-lg border border-[#e2c7be] px-3 py-2 text-xs font-semibold text-[#914d40] hover:bg-[#fff4f0]" disabled={reviewDocument.isPending} onClick={() => void reviewFile(doc, 'rejected')}>Request replacement</button></div></div>}
             </article>)}</div>}
          </div>
          <div className="border-t border-[#e6e3d9] py-5">
            <div className="mb-4 flex items-start gap-2.5"><ClipboardCheck size={17} className="mt-0.5 shrink-0 text-[#557968]" /><div><h3 className="text-sm font-bold">Initial facility inspection</h3><p className="mt-1 text-xs leading-5 text-[#718078]">Record hygiene and safety findings before approving or launching this partner. Every inspection is retained in the application history.</p></div></div>
            {(current.application.status === 'test_checkin_completed' || current.application.status === 'approved')
              && !hasApprovedInspection
              && <p className="mb-4 rounded-xl border border-[#eadcc0] bg-[#fff8e9] p-3 text-xs leading-5 text-[#715533]" role="status">An approved inspection is required before this application can be approved or launched.</p>}
            <InspectionHistory inspections={current.inspections} />
            {!['live', 'rejected'].includes(current.application.status) && <form onSubmit={recordInspection} className="rounded-xl bg-[#f3f1e9] p-4 md:p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Inspection date"><input data-testid="input-onboarding-inspection-date" className={inputClass} type="date" required value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} /></Field>
                <Field label="Inspection findings"><textarea data-testid="input-onboarding-inspection-findings" className={`${inputClass} min-h-12`} required minLength={4} maxLength={2000} value={inspectionFindings} onChange={e => setInspectionFindings(e.target.value)} placeholder="Summarize the inspection." /></Field>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InspectionChecklistFields
                  title="Hygiene checklist"
                  keys={hygieneCheckKeys}
                  labels={inspectionCheckLabels}
                  values={inspectionHygiene}
                  onChange={(key, value) => setInspectionHygiene(currentValues => ({ ...currentValues, [key]: value }))}
                />
                <InspectionChecklistFields
                  title="Safety checklist"
                  keys={safetyCheckKeys}
                  labels={inspectionCheckLabels}
                  values={inspectionSafety}
                  onChange={(key, value) => setInspectionSafety(currentValues => ({ ...currentValues, [key]: value }))}
                />
              </div>
              {[...Object.values(inspectionHygiene), ...Object.values(inspectionSafety)].includes('action_required') && <div className="mt-4 grid gap-4 rounded-xl border border-[#eadcc0] bg-[#fff8e9] p-3 md:grid-cols-2">
                <Field label="Corrective action"><textarea data-testid="input-onboarding-corrective-action" className={`${inputClass} min-h-20`} required minLength={4} maxLength={2000} value={correctiveAction} onChange={e => setCorrectiveAction(e.target.value)} /></Field>
                <Field label="Corrective-action due date"><input data-testid="input-onboarding-corrective-due" className={inputClass} type="date" required min={inspectionDate} value={correctiveDueOn} onChange={e => setCorrectiveDueOn(e.target.value)} /></Field>
              </div>}
              <p className="mt-3 text-xs leading-5 text-[#718078]">Outcome: {[...Object.values(inspectionHygiene), ...Object.values(inspectionSafety)].includes('action_required') ? 'Corrective action required' : 'Approved after all checklist items are completed'}</p>
              <button data-testid="button-record-onboarding-inspection" type="submit" className={`${mutedButton} mt-3`} disabled={createInspection.isPending}>{createInspection.isPending ? 'Saving inspection…' : 'Record inspection'}</button>
            </form>}
          </div>
          <div className="border-t border-[#e6e3d9] py-5"><h3 className="mb-3 text-sm font-bold">Status history</h3>{current.history.length === 0 ? <p className="text-xs text-[#7b8981]">No status changes recorded.</p> : <ol className="space-y-3">{current.history.map(event => <li key={event.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#bd754d]" /><div><p className="text-xs font-semibold">{labels[event.toStatus]}</p><p className="mt-1 text-[10px] text-[#839088]">{formatDate(event.createdAt)} · {event.actorKind === 'team' ? 'MaydanGo team' : 'Applicant'}</p>{event.note && <p className="mt-1 text-xs leading-5 text-[#64776d]">{event.note}</p>}</div></li>)}</ol>}</div>
          {availableStatuses.length > 0 && <form onSubmit={advance} className="rounded-2xl bg-[#eef1e8] p-4 md:p-5">
            <h3 className="text-sm font-bold">Review action</h3><p className="mt-1 text-xs leading-5 text-[#718078]">Only available next steps are shown. The service validates permission and transition rules when saved.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.5fr]">
              <Field label="Next status"><select data-testid="select-next-status" className={inputClass} value={targetStatus} onChange={e => setTargetStatus(e.target.value as PartnerOnboardingStatus | '')}><option value="">Choose next status</option>{availableStatuses.map(status => <option key={status} value={status}>{labels[status]}</option>)}</select></Field>
              <Field label="Review note"><textarea data-testid="input-review-note" className={`${inputClass} min-h-[48px]`} required minLength={4} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="Record the reason or next steps." /></Field>
            </div>
            <button data-testid="button-update-status" type="submit" className={`${buttonClass} mt-4`} disabled={!targetStatus || updateStatus.isPending}>{updateStatus.isPending ? 'Updating…' : <>Save review action <ArrowRight size={15} /></>}</button>
          </form>}
        </div>}
      </section>
    </div>
  </Shell>;
}
