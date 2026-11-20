import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOperationFacilitiesQueryKey,
  getGetOperationsQueryKey,
  useCreateFacilityProfile,
  useDeleteFacilityProfile,
  useGetOperationFacilities,
  useUpdateFacilityProfile,
} from '@workspace/api-client-react';
import type { FacilityOpeningDay, FacilityProfile, FacilityProfileInput, FacilityProfileUpdate, LocalizedFacilityText, Partner } from '@workspace/api-client-react';
import { AlertTriangle, Clock3, MapPin, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { FacilityMediaFields } from '@/components/facility-media-fields';

type Language = keyof LocalizedFacilityText;
type ProfileForm = Omit<FacilityProfileInput, 'partnerId'>;
const languages: { key: Language; label: string; dir?: 'rtl' }[] = [
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'Iraqi Arabic', dir: 'rtl' },
  { key: 'ku', label: 'Sorani Kurdish', dir: 'rtl' },
];
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const field = 'mt-1 w-full rounded-xl border border-[#d8d2c4] bg-[#fffdf7] px-3.5 py-2.5 text-sm text-[#173d35] placeholder:text-[#8b9288] focus:border-[#28695a] focus:outline-none focus:ring-2 focus:ring-[#28695a]/15';
const blankText = (): LocalizedFacilityText => ({ en: '', ar: '', ku: '' });
const trimLocalized = (value: LocalizedFacilityText): LocalizedFacilityText => ({ en: value.en.trim(), ar: value.ar.trim(), ku: value.ku.trim() });
const blankHours = (): FacilityOpeningDay[] => days.map((_, day) => ({ day, closed: true, opensAt: null, closesAt: null }));
const blankForm = (): ProfileForm => ({
  city: '', facility: '', localizedName: blankText(), localizedDistrict: blankText(), localizedAddress: blankText(),
  localizedDescription: blankText(), activities: [], amenities: [], accessibility: [], openingHours: blankHours(),
  contactPhone: null, websiteUrl: null, logoUrl: null, coverImageUrl: null, galleryImageUrls: [], promotionalVideoUrl: null,
  latitude: null, longitude: null,
});
const formFromProfile = (profile: FacilityProfile): ProfileForm => ({
  city: profile.city, facility: profile.facility, localizedName: { ...profile.localizedName }, localizedDistrict: { ...profile.localizedDistrict },
  localizedAddress: { ...profile.localizedAddress }, localizedDescription: { ...profile.localizedDescription },
  activities: profile.activities.map(item => ({ ...item })), amenities: profile.amenities.map(item => ({ ...item })),
  accessibility: profile.accessibility.map(item => ({ ...item })),
  openingHours: [...profile.openingHours].sort((a, b) => a.day - b.day).map(item => ({ ...item })),
  contactPhone: profile.contactPhone, websiteUrl: profile.websiteUrl, logoUrl: profile.logoUrl,
  coverImageUrl: profile.coverImageUrl, galleryImageUrls: profile.galleryImageUrls,
  promotionalVideoUrl: profile.promotionalVideoUrl, latitude: profile.latitude, longitude: profile.longitude,
});
const displayName = (profile: FacilityProfile) => profile.localizedName.en || profile.facility;

function TextField({ label, value, onChange, required = false, testId, multiline = false, dir }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; testId: string; multiline?: boolean; dir?: 'rtl';
}) {
  return <label className="block text-xs font-semibold text-[#51665e]">{label}{multiline
    ? <textarea data-testid={testId} dir={dir} required={required} maxLength={500} rows={3} className={field} value={value} onChange={event => onChange(event.target.value)} />
    : <input data-testid={testId} dir={dir} required={required} maxLength={500} className={field} value={value} onChange={event => onChange(event.target.value)} />}</label>;
}

function LocalizedFields({ title, value, onChange, multiline = false, testPrefix }: {
  title: string; value: LocalizedFacilityText; onChange: (next: LocalizedFacilityText) => void; multiline?: boolean; testPrefix: string;
}) {
  return <fieldset className="rounded-2xl border border-[#e3ddce] bg-[#fffdf7]/70 p-4">
    <legend className="px-1 text-sm font-bold text-[#36564b]">{title}</legend>
    <p className="mb-3 text-[11px] leading-5 text-[#75847c]">Enter each version yourself. MaydanGo does not translate venue details.</p>
    <div className="grid gap-3 md:grid-cols-3">{languages.map(language => <TextField key={language.key} label={language.label} required value={value[language.key]} testId={`${testPrefix}-${language.key}`} dir={language.dir} multiline={multiline} onChange={text => onChange({ ...value, [language.key]: text })} />)}</div>
  </fieldset>;
}

function LocalizedList({ title, value, onChange, testPrefix }: {
  title: string; value: LocalizedFacilityText[]; onChange: (next: LocalizedFacilityText[]) => void; testPrefix: string;
}) {
  return <fieldset className="rounded-2xl border border-[#e3ddce] bg-[#fffdf7]/70 p-4">
    <div className="flex items-center justify-between gap-3"><div><legend className="text-sm font-bold text-[#36564b]">{title}</legend><p className="mt-1 text-[11px] text-[#75847c]">Up to 30 entries, each in all three languages.</p></div><button data-testid={`add-${testPrefix}`} type="button" disabled={value.length >= 30} onClick={() => onChange([...value, blankText()])} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold text-[#28695a] hover:bg-[#eeeadc] disabled:opacity-40"><Plus size={14} />Add</button></div>
    {value.length ? <div className="mt-4 space-y-3">{value.map((entry, index) => <div data-testid={`row-${testPrefix}-${index}`} key={`${testPrefix}-${index}`} className="rounded-xl bg-[#f5f1e6] p-3">
      <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a76445]">Entry {index + 1}</span><button data-testid={`remove-${testPrefix}-${index}`} type="button" aria-label={`Remove ${title} entry ${index + 1}`} onClick={() => onChange(value.filter((_, position) => position !== index))} className="rounded-full p-1.5 text-[#9a4435] hover:bg-[#f2dfd5]"><X size={14} /></button></div>
      <div className="grid gap-2 md:grid-cols-3">{languages.map(language => <input key={language.key} aria-label={`${title} entry ${index + 1}, ${language.label}`} data-testid={`input-${testPrefix}-${index}-${language.key}`} maxLength={500} dir={language.dir} placeholder={language.label} className={field} value={entry[language.key]} onChange={event => onChange(value.map((item, position) => position === index ? { ...item, [language.key]: event.target.value } : item))} />)}</div>
    </div>)}</div> : <p className="mt-3 text-xs text-[#879187]">No details added yet.</p>}
  </fieldset>;
}

function ProfileEditor({ profile, partners, partnerId, isAdmin, onClose, onSaved }: {
  profile: FacilityProfile | null; partners: Partner[]; partnerId: string | null; isAdmin: boolean; onClose: () => void; onSaved: () => void;
}) {
  const create = useCreateFacilityProfile();
  const update = useUpdateFacilityProfile();
  const [form, setForm] = useState<ProfileForm>(() => profile ? formFromProfile(profile) : blankForm());
  const [selectedPartner, setSelectedPartner] = useState(profile?.partnerId ?? partnerId ?? '');
  const [message, setMessage] = useState('');
  const pending = create.isPending || update.isPending;
  const setField = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => setForm(current => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPartner) { setMessage('Choose an approved partner before saving this facility.'); return; }
    if ((form.latitude === null) !== (form.longitude === null)) { setMessage('Enter both latitude and longitude, or leave both blank.'); return; }
    if ((form.galleryImageUrls?.length ?? 0) > 12) { setMessage('Use no more than 12 gallery image links.'); return; }
    const invalidList = [form.activities, form.amenities, form.accessibility].some(entries => entries.some(entry => [entry.en, entry.ar, entry.ku].some(text => !text.trim())));
    if (invalidList) { setMessage('Complete all three language fields for each list entry, or remove the unfinished entry.'); return; }
    const data = {
      ...form,
      city: form.city.trim(),
      facility: form.facility.trim(),
      localizedName: trimLocalized(form.localizedName),
      localizedDistrict: trimLocalized(form.localizedDistrict),
      localizedAddress: trimLocalized(form.localizedAddress),
      localizedDescription: trimLocalized(form.localizedDescription),
      activities: form.activities.map(entry => ({ en: entry.en.trim(), ar: entry.ar.trim(), ku: entry.ku.trim() })),
      amenities: form.amenities.map(entry => ({ en: entry.en.trim(), ar: entry.ar.trim(), ku: entry.ku.trim() })),
      accessibility: form.accessibility.map(entry => ({ en: entry.en.trim(), ar: entry.ar.trim(), ku: entry.ku.trim() })),
      contactPhone: form.contactPhone?.trim() || null,
      websiteUrl: form.websiteUrl?.trim() || null,
      openingHours: form.openingHours.map(row => row.closed ? { day: row.day, closed: true, opensAt: null, closesAt: null } : row),
    };
    const saved = () => {
      trackEvent('facility_profile_saved', { change_type: profile ? 'updated' : 'created', surface: 'admin_facilities' });
      onSaved();
      onClose();
    };
    if (profile) update.mutate({ id: profile.id, data: data as FacilityProfileUpdate }, { onSuccess: saved, onError: () => setMessage('The facility could not be updated. Check the details and retry.') });
    else create.mutate({ data: { ...data, partnerId: selectedPartner } as FacilityProfileInput }, { onSuccess: saved, onError: () => setMessage('The facility could not be created. Check the details and retry.') });
  };
  const updateHours = (day: number, patch: Partial<FacilityOpeningDay>) => setField('openingHours', form.openingHours.map(item => item.day === day ? { ...item, ...patch } : item));
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#102e27]/50 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="facility-editor-title" className="max-h-[96dvh] w-full overflow-y-auto rounded-t-[1.7rem] bg-[#f8f5eb] p-5 shadow-2xl sm:max-w-4xl sm:rounded-[1.7rem] sm:p-8">
      <header className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#a76445]">Venue directory</p><h2 id="facility-editor-title" className="mt-2 font-display text-2xl font-bold text-[#173d35]">{profile ? 'Edit facility profile' : 'Add a facility profile'}</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-[#687a71]">Members rely on these details to choose a place with confidence. Keep the three language versions complete and accurate.</p></div><button data-testid="close-facility-editor" type="button" aria-label="Close editor" onClick={onClose} className="rounded-full p-2 hover:bg-[#ebe6d8]"><X size={19} /></button></header>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {isAdmin && <label className="block text-xs font-semibold text-[#51665e]">Partner<select data-testid="select-facility-partner" required className={field} value={selectedPartner} onChange={event => setSelectedPartner(event.target.value)}><option value="">Choose an approved partner</option>{partners.filter(item => item.approved).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-[#51665e]">City<input data-testid="input-facility-city" required maxLength={160} className={field} value={form.city} onChange={event => setField('city', event.target.value)} /></label><label className="block text-xs font-semibold text-[#51665e]">Facility name<input data-testid="input-facility-name" required maxLength={160} className={field} value={form.facility} onChange={event => setField('facility', event.target.value)} /></label></div>
        <LocalizedFields title="Public name" value={form.localizedName} onChange={value => setField('localizedName', value)} testPrefix="facility-name" />
        <LocalizedFields title="District" value={form.localizedDistrict} onChange={value => setField('localizedDistrict', value)} testPrefix="facility-district" />
        <LocalizedFields title="Street address" value={form.localizedAddress} onChange={value => setField('localizedAddress', value)} testPrefix="facility-address" />
        <LocalizedFields title="Description" value={form.localizedDescription} onChange={value => setField('localizedDescription', value)} testPrefix="facility-description" multiline />
        <div className="grid gap-3 lg:grid-cols-3"><LocalizedList title="Activities" value={form.activities} onChange={value => setField('activities', value)} testPrefix="activities" /><LocalizedList title="Amenities" value={form.amenities} onChange={value => setField('amenities', value)} testPrefix="amenities" /><LocalizedList title="Accessibility" value={form.accessibility} onChange={value => setField('accessibility', value)} testPrefix="accessibility" /></div>
        <FacilityMediaFields
          value={form}
          lang="en"
          inputClass={field}
          onChange={(key, value) => setField(key, value as ProfileForm[typeof key])}
        />
        <section className="rounded-2xl border border-[#e3ddce] bg-[#fffdf7]/70 p-4"><div className="flex items-center gap-2"><Clock3 size={16} className="text-[#a76445]" /><h3 className="text-sm font-bold text-[#36564b]">Opening hours</h3></div><p className="mt-1 text-[11px] text-[#75847c]">Sunday first. Closed days are saved without times.</p><div className="mt-3 divide-y divide-[#ece7d9]">{days.map((day, index) => { const row = form.openingHours.find(item => item.day === index) ?? blankHours()[index]; return <div key={day} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto_1fr_1fr] sm:items-center"><span data-testid={`text-opening-day-${index}`} className="text-xs font-semibold">{day}</span><label className="flex items-center gap-2 text-xs text-[#687a71]"><input data-testid={`checkbox-closed-${index}`} type="checkbox" checked={row.closed} onChange={event => updateHours(index, event.target.checked ? { closed: true, opensAt: null, closesAt: null } : { closed: false, opensAt: '09:00', closesAt: '17:00' })} className="accent-[#174d43]" />Closed</label><input data-testid={`input-opens-${index}`} aria-label={`${day} opens at`} type="time" required={!row.closed} disabled={row.closed} className={field} value={row.opensAt ?? ''} onChange={event => updateHours(index, { opensAt: event.target.value || null })} /><input data-testid={`input-closes-${index}`} aria-label={`${day} closes at`} type="time" required={!row.closed} disabled={row.closed} className={field} value={row.closesAt ?? ''} onChange={event => updateHours(index, { closesAt: event.target.value || null })} /></div>; })}</div></section>
        <section className="rounded-2xl border border-[#e3ddce] bg-[#fffdf7]/70 p-4"><h3 className="text-sm font-bold text-[#36564b]">Contact and map pin <span className="font-normal text-[#879187]">· optional</span></h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-[#51665e]">Contact phone<input data-testid="input-facility-phone" type="tel" maxLength={40} className={field} value={form.contactPhone ?? ''} onChange={event => setField('contactPhone', event.target.value || null)} /></label><label className="block text-xs font-semibold text-[#51665e]">Website URL<input data-testid="input-facility-website" type="url" maxLength={2048} placeholder="https://" className={field} value={form.websiteUrl ?? ''} onChange={event => setField('websiteUrl', event.target.value || null)} /></label><label className="block text-xs font-semibold text-[#51665e]">Latitude<input data-testid="input-facility-latitude" type="number" min="-90" max="90" step="any" className={field} value={form.latitude ?? ''} onChange={event => setField('latitude', event.target.value === '' ? null : Number(event.target.value))} /></label><label className="block text-xs font-semibold text-[#51665e]">Longitude<input data-testid="input-facility-longitude" type="number" min="-180" max="180" step="any" className={field} value={form.longitude ?? ''} onChange={event => setField('longitude', event.target.value === '' ? null : Number(event.target.value))} /></label></div></section>
        {message && <p data-testid="status-facility-form" role="alert" className="rounded-xl border border-[#e4c3b7] bg-[#fff5f1] px-4 py-3 text-sm text-[#9a4435]">{message}</p>}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#e3ddce] bg-[#f8f5eb] py-3"><button data-testid="cancel-facility-form" type="button" onClick={onClose} className="rounded-xl border border-[#d8d2c4] px-4 py-2.5 text-sm font-semibold text-[#36564b] hover:bg-[#f1eddf]">Cancel</button><button data-testid="submit-facility-form" type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[#174d43] px-4 py-2.5 text-sm font-semibold text-[#fff9e9] hover:bg-[#226556] disabled:opacity-50"><Plus size={15} />{pending ? 'Saving…' : profile ? 'Save changes' : 'Create facility'}</button></div>
      </form>
    </section>
  </div>;
}

export function FacilityProfiles({ isAdmin, partnerId, partners }: { isAdmin: boolean; partnerId: string | null; partners: Partner[] }) {
  const client = useQueryClient();
  const facilities = useGetOperationFacilities({ query: { queryKey: getGetOperationFacilitiesQueryKey(), retry: false } });
  const remove = useDeleteFacilityProfile();
  const [editor, setEditor] = useState<FacilityProfile | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<FacilityProfile | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const refreshRelated = () => {
    void client.invalidateQueries({ queryKey: getGetOperationFacilitiesQueryKey() });
    void client.invalidateQueries({ queryKey: getGetOperationsQueryKey() });
  };
  const confirmRemoval = () => {
    if (!confirmDelete) return;
    remove.mutate({ id: confirmDelete.id }, {
      onSuccess: () => { refreshRelated(); setNotice(`${displayName(confirmDelete)} was removed from facility profiles.`); setConfirmDelete(null); setError(''); },
      onError: () => { setError('This facility could not be removed. It may have changed; refresh and try again.'); setConfirmDelete(null); },
    });
  };
  return <section>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="max-w-2xl text-sm leading-6 text-[#687a71]">Maintain the venue details members use to choose where to move. Every language version is entered by your team.</p></div><button data-testid="add-facility-profile" type="button" onClick={() => setEditor(null)} className="inline-flex items-center gap-2 rounded-xl bg-[#174d43] px-4 py-2.5 text-sm font-semibold text-[#fff9e9] hover:bg-[#226556]"><Plus size={16} />Add facility</button></div>
    {notice && <div data-testid="status-facility-success" role="status" className="mb-4 flex items-center justify-between rounded-xl border border-[#c8d8c3] bg-[#edf4e8] px-4 py-3 text-sm text-[#365f43]">{notice}<button data-testid="dismiss-facility-success" type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={15} /></button></div>}
    {error && <div data-testid="status-facility-error" role="alert" className="mb-4 flex items-center justify-between rounded-xl border border-[#e4c3b7] bg-[#fff5f1] px-4 py-3 text-sm text-[#9a4435]">{error}<button data-testid="dismiss-facility-error" type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
    {facilities.isLoading ? <div data-testid="loading-facility-profiles" className="space-y-3" aria-label="Loading facility profiles"><div className="h-36 animate-pulse rounded-3xl bg-[#e5e0d1]" /><div className="h-36 animate-pulse rounded-3xl bg-[#e5e0d1]" /></div>
      : facilities.isError ? <div data-testid="error-facility-profiles" role="alert" className="rounded-3xl border border-[#e4c3b7] bg-[#fff7f3] p-7"><p className="font-display text-lg font-bold text-[#173d35]">Facility profiles are unavailable</p><p className="mt-2 text-sm text-[#687a71]">The server did not return venue records. Your saved information has not been changed.</p><button data-testid="retry-facility-profiles" type="button" onClick={() => void facilities.refetch()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#d8d2c4] px-4 py-2 text-sm font-semibold text-[#36564b]"><RefreshCw size={14} />Try again</button></div>
      : facilities.data?.length ? <div className="grid gap-4">{facilities.data.map(profile => <article data-testid={`card-facility-${profile.id}`} key={profile.id} className="rounded-3xl border border-[#ddd7c6] bg-[#fffdf7] p-5 sm:p-6"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e1efdf] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#2d6d4a]">Profile maintained</span><span data-testid={`text-facility-city-${profile.id}`} className="text-[10px] font-bold uppercase tracking-wide text-[#a76445]">{profile.city}</span></div><h2 data-testid={`text-facility-name-${profile.id}`} className="mt-3 font-display text-xl font-bold">{displayName(profile)}</h2><p data-testid={`text-facility-address-${profile.id}`} className="mt-1 text-sm text-[#687a71]">{profile.localizedDistrict.en} · {profile.localizedAddress.en}</p><p data-testid={`text-facility-summary-${profile.id}`} className="mt-3 line-clamp-2 text-sm leading-6 text-[#75847c]">{profile.localizedDescription.en}</p><div className="mt-4 flex flex-wrap gap-2">{profile.activities.slice(0, 3).map((activity, index) => <span data-testid={`tag-facility-activity-${profile.id}-${index}`} key={`${profile.id}-activity-${index}`} className="rounded-full bg-[#f0ead9] px-2.5 py-1 text-[10px] font-semibold text-[#536b61]">{activity.en}</span>)}{profile.activities.length > 3 && <span className="rounded-full bg-[#f0ead9] px-2.5 py-1 text-[10px] text-[#536b61]">+{profile.activities.length - 3} activities</span>}</div><p data-testid={`text-facility-updated-${profile.id}`} className="mt-4 text-[10px] text-[#879187]">Updated {new Intl.DateTimeFormat('en-IQ', { dateStyle: 'medium', timeZone: 'Asia/Baghdad' }).format(new Date(profile.updatedAt))}</p></div><div className="flex shrink-0 gap-2"><button data-testid={`edit-facility-${profile.id}`} type="button" onClick={() => setEditor(profile)} className="inline-flex items-center gap-2 rounded-xl border border-[#d8d2c4] px-3 py-2.5 text-sm font-semibold text-[#36564b] hover:bg-[#f1eddf]"><Pencil size={15} />Edit</button><button data-testid={`delete-facility-${profile.id}`} type="button" onClick={() => { setConfirmDelete(profile); setError(''); }} className="inline-flex items-center gap-2 rounded-xl border border-[#d9a89a] bg-[#fff5f1] px-3 py-2.5 text-sm font-semibold text-[#9a4435] hover:bg-[#ffe8e0]"><Trash2 size={15} />Remove</button></div></div></article>)}</div>
      : <div data-testid="empty-facility-profiles" className="rounded-3xl border border-dashed border-[#d5cfbf] bg-[#fffdf7]/70 p-8 text-center sm:p-12"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f0ead9] text-[#a76445]"><MapPin size={21} /></div><h2 className="mt-4 font-display text-xl font-bold text-[#173d35]">No facility profiles yet</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#75847c]">Add a venue when you are ready. Nothing is published or assumed until your team enters and saves its details.</p><button data-testid="empty-add-facility" type="button" onClick={() => setEditor(null)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#174d43] px-4 py-2.5 text-sm font-semibold text-[#fff9e9]"><Plus size={15} />Add your first facility</button></div>}
    {editor !== undefined && <ProfileEditor profile={editor} partners={partners} partnerId={partnerId} isAdmin={isAdmin} onClose={() => setEditor(undefined)} onSaved={() => { refreshRelated(); setNotice(editor ? 'Facility profile updated.' : 'Facility profile created.'); setError(''); }} />}
    {confirmDelete && <div className="fixed inset-0 z-[60] grid place-items-center bg-[#102e27]/50 p-4 backdrop-blur-sm"><section role="alertdialog" aria-modal="true" aria-labelledby="remove-facility-title" className="w-full max-w-md rounded-3xl border border-[#e5d3c8] bg-[#fffdf7] p-6 shadow-2xl"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f2dfd5] text-[#9a4435]"><AlertTriangle size={19} /></div><h2 id="remove-facility-title" className="mt-4 font-display text-xl font-bold text-[#173d35]">Remove this facility profile?</h2><p data-testid="text-delete-facility-name" className="mt-2 text-sm font-semibold text-[#36564b]">{displayName(confirmDelete)}</p><p className="mt-2 text-sm leading-6 text-[#687a71]">This will remove the facility record from this operations workspace. This action cannot be undone.</p>{error && <p role="alert" className="mt-3 text-sm text-[#9a4435]">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button data-testid="cancel-delete-facility" type="button" onClick={() => setConfirmDelete(null)} className="rounded-xl border border-[#d8d2c4] px-4 py-2.5 text-sm font-semibold text-[#36564b]">Keep profile</button><button data-testid="confirm-delete-facility" type="button" disabled={remove.isPending} onClick={confirmRemoval} className="inline-flex items-center gap-2 rounded-xl bg-[#9a4435] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Trash2 size={15} />{remove.isPending ? 'Removing…' : 'Remove facility'}</button></div></section></div>}
  </section>;
}
