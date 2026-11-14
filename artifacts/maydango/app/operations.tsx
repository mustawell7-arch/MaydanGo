import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMemberCoursesQueryKey,
  getGetOperationCoursesQueryKey,
  requestMembershipRefund,
  useAddLearningLesson,
  useCreateLearningCourse,
  useGetOperationCourses,
  useUpdateLearningCourse,
  type CourseAdminRecord,
  type CourseInput,
  type CourseMetadataInput,
  type LessonInput,
} from '@workspace/api-client-react';
import { Text as LocalizedText, TextInput as LocalizedTextInput, Pressable as LocalizedPressable, Ionicons } from '@/components/Localized';
import { ScreenShell, ScreenHeader } from '@/components/ScreenShell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { dateTime, errorCopy, localize } from '@/lib/content';
import { localizePartnerOperationsReview, splitPartnerOperationsList } from '@/lib/partner-operations-copy';
import { HttpError, useAuthedResource, type Operations, type Offering, type Plan, type Rules } from '@/lib/live-api';

type Tab = 'offerings' | 'plans' | 'partners' | 'access' | 'courses';
type Colors = ReturnType<typeof useColors>;
const Text = (props: React.ComponentProps<typeof LocalizedText>) => <LocalizedText {...props} copyMode="partner-operations-review" />;
const TextInput = (props: React.ComponentProps<typeof LocalizedTextInput>) => <LocalizedTextInput {...props} copyMode="partner-operations-review" />;
const Pressable = (props: React.ComponentProps<typeof LocalizedPressable>) => <LocalizedPressable {...props} copyMode="partner-operations-review" />;
const csv = splitPartnerOperationsList;
const limits = (s: string): Record<string, number> | null => {
  const out: Record<string, number> = {};
  for (const part of csv(s)) { const [k, v] = part.split(':').map(x => x.trim()); const n = Number(v); if (!k || !Number.isInteger(n) || n < 0) return null; out[k] = n; }
  return out;
};
const fromLimits = (r?: Record<string, number>) => r ? Object.entries(r).map(([k, v]) => `${k}:${v}`).join(', ') : '';
const isInt = (s: string, min = 0) => /^\d+$/.test(s.trim()) && Number(s) >= min;
const iraqInstant = (s: string) => {
  const value = s.trim().replace(' ', 'T');
  return new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}+03:00`);
};
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s.trim()) && !Number.isNaN(iraqInstant(s).getTime());

function Field({ c, label, value, onChange, placeholder, numeric, multiline }: { c: Colors; label: string; value: string; onChange: (s: string) => void; placeholder?: string; numeric?: boolean; multiline?: boolean }) {
  return <View style={{ gap: 4, flexGrow: 1, flexBasis: 140 }}>
    <Text style={[s.label, { color: c.mutedForeground }]}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.mutedForeground} autoCapitalize="none"
      keyboardType={numeric ? 'number-pad' : 'default'} multiline={multiline} style={[s.input, { color: c.foreground, borderColor: c.input, backgroundColor: c.background }]} />
  </View>;
}
function Choice<T extends string>({ c, label, options, value, onChange, names }: { c: Colors; label: string; options: readonly T[]; value: T | T[]; onChange: (v: T) => void; names?: Record<string, string> }) {
  return <View style={{ gap: 6 }}>
    <Text style={[s.label, { color: c.mutedForeground }]}>{label}</Text>
    <View style={s.wrap}>{options.map(o => { const on = Array.isArray(value) ? value.includes(o) : value === o;
      return <Pressable key={o} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o)} style={[s.chip, { backgroundColor: on ? c.primary : c.secondary }]}>
        <Text style={{ color: on ? c.primaryForeground : c.secondaryForeground, fontWeight: '700', fontSize: 13 }}>{names?.[o] ?? o}</Text></Pressable>; })}</View>
  </View>;
}
function Btn({ c, title, onPress, busy, tone = 'primary', id }: { c: Colors; title: string; onPress: () => void; busy?: boolean; tone?: 'primary' | 'quiet' | 'danger'; id?: string }) {
  const bg = tone === 'primary' ? c.primary : tone === 'danger' ? c.destructive : c.secondary;
  const fg = tone === 'primary' ? c.primaryForeground : tone === 'danger' ? c.destructiveForeground : c.secondaryForeground;
  return <Pressable testID={id} accessibilityRole="button" disabled={busy} onPress={onPress} style={[s.btn, { backgroundColor: bg, opacity: busy ? .55 : 1 }]}><Text style={{ color: fg, fontWeight: '700' }}>{busy ? 'Working…' : title}</Text></Pressable>;
}
function Msg({ c, m }: { c: Colors; m: { ok: boolean; text: string } | null }) {
  return m ? <Text accessibilityRole="alert" style={{ color: m.ok ? c.primary : c.destructive, fontWeight: '600' }}>{m.text}</Text> : null;
}

export default function OperationsScreen() {
  const c = useColors();
  const app = useApp();
  const ops = useAuthedResource<Operations>('/operations');
  const [tab, setTab] = useState<Tab>('offerings');
  const refresh = ops.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const header = <ScreenHeader eyebrow="STAFF" title="Operations" />;
  const back = <Pressable onPress={() => router.back()} accessibilityRole="button" style={s.row}><Ionicons name="chevron-back" size={16} color={c.primary} /><Text style={{ color: c.primary }}>Back</Text></Pressable>;

  if (!ops.signedIn || ops.status === 403 || ops.status === 401) return <ScreenShell>{header}<View style={s.pad}>{back}
    <View style={[s.empty, { borderColor: c.border }]}><Ionicons name="lock-closed-outline" size={26} color={c.mutedForeground} />
      <Text style={{ color: c.foreground, fontWeight: '700', textAlign: 'center' }}>Staff access only</Text>
      <Text style={{ color: c.mutedForeground, textAlign: 'center' }}>This area is for MaydanGO administrators and approved partners.</Text></View></View></ScreenShell>;
  if (ops.error && !ops.data) return <ScreenShell>{header}<View style={s.pad}>{back}<Text style={{ color: c.destructive }}>{ops.error}</Text><Btn c={c} title="Try again" onPress={() => void ops.refresh()} /></View></ScreenShell>;
  if (!ops.data) return <ScreenShell>{header}<View style={s.pad}>{[0, 1, 2].map(i => <View key={i} style={[s.skeleton, { backgroundColor: c.muted }]} />)}</View></ScreenShell>;

  const d = ops.data, admin = d.role === 'admin';
  if (d.role === 'finance') return <ScreenShell>{header}<View style={s.pad}>{back}
    <View style={[s.empty, { borderColor: c.border }]}><Ionicons name="lock-closed-outline" size={26} color={c.mutedForeground} />
      <Text style={{ color: c.foreground, fontWeight: '700', textAlign: 'center' }}>{localize('Finance review is available in the MaydanGo web desk.', app.language)}</Text>
      <Text style={{ color: c.mutedForeground, textAlign: 'center' }}>{localize('This mobile operations area is for administrators and approved partners.', app.language)}</Text></View></View></ScreenShell>;
   const tabs: Tab[] = admin ? ['offerings', 'plans', 'partners', 'access', 'courses'] : ['offerings'];
   const names: Record<Tab, string> = { offerings: 'Offerings', plans: 'Plans', partners: 'Partners', access: 'Access grants', courses: 'Courses' };
  return <ScreenShell>{header}
    <KeyboardAwareScrollViewCompat contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {back}
      <View style={[s.role, { backgroundColor: c.primary }]}>
        <Text style={{ color: c.primaryForeground, fontWeight: '800' }}>{admin ? 'Administrator' : 'Partner staff'}</Text>
        <Text raw style={{ color: c.accent, fontSize: 12 }}>{d.partnerId ?? `${d.partners.length} · ${d.offerings.length} · ${d.plans.length}`}</Text>
      </View>
      <Btn c={c} title="Partner check-in & attendance" onPress={() => router.push('/checkin')} />
      {tabs.length > 1 ? <View style={s.wrap}>{tabs.map(t => <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)}
        style={[s.tab, { borderColor: tab === t ? c.primary : c.border, backgroundColor: tab === t ? c.accent : c.card }]}><Text style={{ color: c.foreground, fontWeight: '700' }}>{names[t]}</Text></Pressable>)}</View> : null}
      {ops.error ? <Text style={{ color: c.destructive }}>{ops.error}</Text> : null}
      {tab === 'offerings' || !admin ? <OfferingsTab c={c} d={d} api={ops.api} refresh={ops.refresh} />
        : tab === 'plans' ? <PlansTab c={c} d={d} api={ops.api} refresh={ops.refresh} />
        : tab === 'partners' ? <PartnersTab c={c} d={d} api={ops.api} refresh={ops.refresh} />
        : tab === 'access' ? <AccessTab c={c} d={d} api={ops.api} />
        : admin ? <CoursesTab c={c} /> : null}
    </KeyboardAwareScrollViewCompat>
  </ScreenShell>;
}
type TabProps = { c: Colors; d: Operations; api: ReturnType<typeof useAuthedResource>['api']; refresh: () => Promise<void> };
const fail = (e: unknown) => ({ ok: false, text: e instanceof HttpError ? e.message : errorCopy(e) });

function OfferingsTab({ c, d, api, refresh }: TabProps) {
  const { language } = useApp();
  const approved = d.partners.filter(p => p.approved);
  const [f, setF] = useState({ partnerId: d.partnerId ?? approved[0]?.id ?? '', title: '', kind: 'session' as Offering['kind'], city: '', facility: '', category: '',
    localizedTitleEn: '', localizedTitleAr: '', localizedTitleKu: '', localizedDescriptionEn: '', localizedDescriptionAr: '', localizedDescriptionKu: '', joinUrl: '',
    accessType: 'physical' as Offering['accessType'], tiers: ['M'] as string[], startsAt: '', endsAt: '', cancellationDeadline: '', capacity: '12', gender: 'all' as 'all' | 'female' | 'male', minAge: '0', maxAge: '', additionalPayment: false, active: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [caps, setCaps] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const create = async () => {
    const err = !f.partnerId ? 'Choose a partner.' : !f.title.trim() || !f.city.trim() || !f.facility.trim() || !f.category.trim() ? 'Title, city, facility and category are required.'
      : ![f.startsAt, f.endsAt, f.cancellationDeadline].every(validDate) ? 'Use dates like 2025-06-01T18:00.'
      : iraqInstant(f.endsAt) <= iraqInstant(f.startsAt) ? 'End must be after start.' : iraqInstant(f.cancellationDeadline) > iraqInstant(f.startsAt) ? 'Cancellation deadline must be before start.'
      : !isInt(f.capacity, 1) ? 'Capacity must be a whole number of at least 1.' : !f.tiers.length ? 'Select at least one tier.'
      : !isInt(f.minAge) || Number(f.minAge) > 120 || (f.maxAge && (!isInt(f.maxAge) || Number(f.maxAge) > 120 || Number(f.minAge) > Number(f.maxAge))) ? 'Check the age range.'
      : iraqInstant(f.startsAt).getTime() <= Date.now() ? 'Start must be in the future.'
      : f.accessType === 'live' && (!f.localizedTitleEn.trim() || !f.localizedTitleAr.trim() || !f.localizedTitleKu.trim()
        || !f.localizedDescriptionEn.trim() || !f.localizedDescriptionAr.trim() || !f.localizedDescriptionKu.trim()) ? 'Live classes need titles and descriptions in English, Iraqi Arabic and Sorani.'
      : f.accessType === 'live' && f.active && !/^https:\/\/[^ ]+$/i.test(f.joinUrl.trim()) ? 'Published live classes need a secure HTTPS join link.' : null;
    if (err) { setMsg({ ok: false, text: err }); return; }
    setBusy('create'); setMsg(null);
    try {
      const { localizedTitleEn, localizedTitleAr, localizedTitleKu, localizedDescriptionEn, localizedDescriptionAr, localizedDescriptionKu, joinUrl, ...offering } = f;
      await api('/operations/offerings', { method: 'POST', body: { ...offering, title: f.title.trim(), city: f.city.trim(), facility: f.facility.trim(), category: f.category.trim(),
        ...(f.accessType === 'live' ? {
          localizedTitle: { en: localizedTitleEn.trim(), ar: localizedTitleAr.trim(), ku: localizedTitleKu.trim() },
          localizedDescription: { en: localizedDescriptionEn.trim(), ar: localizedDescriptionAr.trim(), ku: localizedDescriptionKu.trim() },
          joinUrl: joinUrl.trim() || null,
        } : {}),
        startsAt: iraqInstant(f.startsAt).toISOString(), endsAt: iraqInstant(f.endsAt).toISOString(), cancellationDeadline: iraqInstant(f.cancellationDeadline).toISOString(),
        capacity: Number(f.capacity), minAge: Number(f.minAge), maxAge: f.maxAge ? Number(f.maxAge) : null, additionalPayment: f.additionalPayment } });
      setMsg({ ok: true, text: 'Offering saved.' }); setF(x => ({ ...x, title: '' })); await refresh();
    } catch (e) { setMsg(fail(e)); } finally { setBusy(null); }
  };
  const updateCap = async (o: Offering) => {
    const v = caps[o.id] ?? String(o.capacity);
    if (!isInt(v, 1)) { setMsg({ ok: false, text: 'Capacity must be a whole number of at least 1.' }); return; }
    setBusy(o.id); setMsg(null);
    try { await api(`/operations/offerings/${o.id}`, { method: 'PATCH', body: { capacity: Number(v) } }); setMsg({ ok: true, text: 'Capacity updated.' }); await refresh(); }
    catch (e) { setMsg(fail(e)); } finally { setBusy(null); }
  };
  const publish = async (o: Offering) => {
    setBusy(o.id + 'p'); setMsg(null);
    try { await api(`/operations/offerings/${o.id}`, { method: 'PATCH', body: { capacity: o.capacity, active: !o.active } }); setMsg({ ok: true, text: o.active ? 'Offering unpublished.' : 'Offering published.' }); await refresh(); }
    catch (e) { setMsg(fail(e)); } finally { setBusy(null); }
  };
  const cancel = async (o: Offering) => {
    setBusy(o.id + 'x'); setMsg(null);
    try { await api(`/operations/offerings/${o.id}/cancel`, { method: 'POST', body: {} }); setMsg({ ok: true, text: 'Offering cancelled and reservations released.' }); await refresh(); }
    catch (e) { setMsg(fail(e)); } finally { setBusy(null); }
  };
  return <View style={{ gap: 12 }}>
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.h, { color: c.foreground }]}>New offering</Text>
      {d.role === 'admin' ? <Choice c={c} label="PARTNER" options={approved.map(p => p.id)} value={f.partnerId} onChange={set('partnerId')} names={Object.fromEntries(approved.map(p => [p.id, p.name]))} /> : null}
      {d.role === 'admin' && !approved.length ? <Text style={{ color: c.mutedForeground }}>Approve a partner first.</Text> : null}
      <Field c={c} label="TITLE" value={f.title} onChange={set('title')} />
       <Choice c={c} label="TYPE" options={['session', 'event', 'coach'] as const} value={f.kind} onChange={v => setF(x => ({ ...x, kind: v }))} names={{ session: 'Session', event: 'Event', coach: 'Coaching' }} />
       <Choice c={c} label="ACCESS" options={['physical', 'premium', 'live'] as const} value={f.accessType} onChange={v => setF(x => ({ ...x, accessType: v, ...(v === 'live' ? { kind: 'session' as const } : {}) }))} names={{ physical: 'Physical', premium: 'Premium', live: 'Live online' }} />
       {f.accessType === 'live' ? <>
         <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Member-facing details are required in all three app languages. The join link is only returned to an eligible member who has booked and is inside the join window.</Text>
         <View style={s.wrap}><Field c={c} label="TITLE · ENGLISH" value={f.localizedTitleEn} onChange={set('localizedTitleEn')} /><Field c={c} label="العنوان · العربية العراقية" value={f.localizedTitleAr} onChange={set('localizedTitleAr')} /><Field c={c} label="ناونیشان · سۆرانی" value={f.localizedTitleKu} onChange={set('localizedTitleKu')} /></View>
         <View style={s.wrap}><Field c={c} label="DESCRIPTION · ENGLISH" value={f.localizedDescriptionEn} onChange={set('localizedDescriptionEn')} multiline /><Field c={c} label="الوصف · العربية العراقية" value={f.localizedDescriptionAr} onChange={set('localizedDescriptionAr')} multiline /><Field c={c} label="وەسف · سۆرانی" value={f.localizedDescriptionKu} onChange={set('localizedDescriptionKu')} multiline /></View>
         <Field c={c} label="SECURE JOIN LINK · HTTPS" value={f.joinUrl} onChange={set('joinUrl')} placeholder="https://…" />
       </> : null}
      <Choice c={c} label="TIERS" options={['M', 'L', 'XL']} value={f.tiers} onChange={v => setF(x => ({ ...x, tiers: x.tiers.includes(v) ? x.tiers.filter(t => t !== v) : [...x.tiers, v] }))} />
      <View style={s.wrap}><Field c={c} label="CITY" value={f.city} onChange={set('city')} placeholder="baghdad" /><Field c={c} label="FACILITY" value={f.facility} onChange={set('facility')} /><Field c={c} label="CATEGORY" value={f.category} onChange={set('category')} /></View>
      <View style={s.wrap}><Field c={c} label="STARTS" value={f.startsAt} onChange={set('startsAt')} placeholder="2025-06-01T18:00" /><Field c={c} label="ENDS" value={f.endsAt} onChange={set('endsAt')} placeholder="2025-06-01T19:00" /><Field c={c} label="CANCEL BY" value={f.cancellationDeadline} onChange={set('cancellationDeadline')} placeholder="2025-06-01T12:00" /></View>
      <View style={s.wrap}><Field c={c} label="CAPACITY" value={f.capacity} onChange={set('capacity')} numeric /><Field c={c} label="MIN AGE" value={f.minAge} onChange={set('minAge')} numeric /><Field c={c} label="MAX AGE" value={f.maxAge} onChange={set('maxAge')} numeric /></View>
      <Choice c={c} label="ADDITIONAL PAYMENT" options={['no', 'yes']} value={f.additionalPayment ? 'yes' : 'no'} onChange={v => setF(x => ({ ...x, additionalPayment: v === 'yes' }))} names={{ no: 'Included in membership', yes: 'Additional payment required (booking unavailable)' }} />
      <Choice c={c} label="GENDER" options={['all', 'female', 'male'] as const} value={f.gender} onChange={v => setF(x => ({ ...x, gender: v }))} names={{ all: 'Everyone', female: 'Women only', male: 'Men only' }} />
      <Choice c={c} label="STATUS" options={['on', 'off']} value={f.active ? 'on' : 'off'} onChange={v => setF(x => ({ ...x, active: v === 'on' }))} names={{ on: 'Publish now', off: 'Save as draft' }} />
      <Msg c={c} m={msg} />
      <Btn c={c} title="Save offering" onPress={() => void create()} busy={busy === 'create'} id="ops-create-offering" />
    </View>
    {!d.offerings.length ? <Text style={{ color: c.mutedForeground }}>No offerings yet.</Text> : d.offerings.map(o => <View key={o.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border, opacity: o.active ? 1 : .6 }]}>
      <Text raw style={{ color: c.foreground, fontWeight: '800', fontSize: 16 }}>{o.title}</Text>
      <Text raw style={{ color: c.mutedForeground }}>{d.partners.find(p => p.id === o.partnerId)?.name ?? o.partnerId} · {o.facility} · {o.city} · {o.accessType}</Text>
       {o.accessType === 'live' ? <Text style={{ color: c.mutedForeground, fontSize: 11 }}>Language details: {o.localizedTitle ? 'English · Iraqi Arabic · Sorani' : 'missing'} · Secure join link: {o.joinUrl ? 'configured' : 'missing'}</Text> : null}
      <Text style={{ color: c.foreground }}>{dateTime(o.startsAt, language)}</Text>
      {o.cancelledAt ? <Text style={{ color: c.destructive, fontWeight: '700' }}>Cancelled permanently. Create a replacement offering.</Text> : !o.active ? <Text style={{ color: c.destructive, fontWeight: '700' }}>Draft, not visible to members</Text> : null}
      {o.cancelledAt ? null : Date.parse(o.startsAt) <= Date.now() ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Past offerings cannot be edited.</Text> : <View style={[s.wrap, { alignItems: 'flex-end' }]}>
        <Field c={c} label="CAPACITY" value={caps[o.id] ?? String(o.capacity)} onChange={v => setCaps(x => ({ ...x, [o.id]: v }))} numeric />
        <Btn c={c} title="Update" tone="quiet" onPress={() => void updateCap(o)} busy={busy === o.id} />
        <Btn c={c} title={o.active ? 'Unpublish' : 'Publish'} tone="quiet" onPress={() => void publish(o)} busy={busy === o.id + 'p'} />
        <Btn c={c} title="Cancel offering" tone="danger" onPress={() => void cancel(o)} busy={busy === o.id + 'x'} />
      </View>}
    </View>)}
  </View>;
}

const blankPlanTerms: NonNullable<Rules['planTerms']> = {
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
};
const blankRules: Rules = { quota: 8, dailyLimit: 1, quotaMode: 'shared', physicalQuota: 8, premiumQuota: 0, liveQuota: 0, planTerms: blankPlanTerms };
function PlansTab({ c, d, api, refresh }: TabProps) {
  const { language } = useApp();
  const toForm = (p?: Plan) => { const r = p?.rules ?? blankRules; return { id: p?.id ?? null as string | null, name: p?.name ?? '', tier: p?.tier ?? 'M', kind: p?.kind ?? 'trial' as Plan['kind'], durationDays: String(p?.durationDays ?? 30), active: p?.active ?? true, priceIqd: p?.priceIqd == null ? '' : String(p.priceIqd),
    quota: String(r.quota), dailyLimit: String(r.dailyLimit), quotaMode: r.quotaMode, physicalQuota: String(r.physicalQuota), premiumQuota: String(r.premiumQuota), liveQuota: String(r.liveQuota),
    cities: (r.cities ?? []).join(', '), facilities: (r.facilities ?? []).join(', '), categories: (r.categories ?? []).join(', '), facilityLimits: fromLimits(r.facilityLimits), categoryLimits: fromLimits(r.categoryLimits),
    partnerGroupLimits: fromLimits(r.partnerGroupLimits), trialAllowedTypes: (r.trialAllowedTypes ?? []).join(', '), corporateId: r.corporateId ?? '',
    planTerms: r.planTerms ?? blankPlanTerms }; };
  const [f, setF] = useState(toForm());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    const fl = limits(f.facilityLimits), cl = limits(f.categoryLimits), gl = limits(f.partnerGroupLimits);
    const nums = ['quota', 'dailyLimit', 'physicalQuota', 'premiumQuota', 'liveQuota'] as const;
    const err = !f.name.trim() ? 'Plan name is required.' : !isInt(f.durationDays, 1) ? 'Duration must be at least 1 day.' : nums.some(k => !isInt(f[k])) ? 'Quotas must be whole numbers.'
      : f.kind === 'paid' && !isInt(f.priceIqd, 1) ? 'Paid plans need a whole-number IQD price.' : null;
    if (!err) {
      const secondaryErr = !fl || !cl || !gl ? 'Limits use the format key:number, key:number.' : f.kind === 'trial' && (!csv(f.trialAllowedTypes).length || csv(f.trialAllowedTypes).some(t => !['physical', 'premium', 'live'].includes(t))) ? 'Trial plans need allowed types, e.g. physical, live.' : f.kind === 'corporate' && !f.corporateId.trim() ? 'Corporate plans need a corporate ID.' : null;
      if (secondaryErr) { setMsg({ ok: false, text: secondaryErr }); return; }
    }
    if (err) { setMsg({ ok: false, text: err }); return; }
    const rules: Rules = { quota: Number(f.quota), dailyLimit: Number(f.dailyLimit), quotaMode: f.quotaMode, physicalQuota: Number(f.physicalQuota), premiumQuota: Number(f.premiumQuota), liveQuota: Number(f.liveQuota), planTerms: f.planTerms };
    if (csv(f.cities).length) rules.cities = csv(f.cities); if (csv(f.facilities).length) rules.facilities = csv(f.facilities); if (csv(f.categories).length) rules.categories = csv(f.categories);
    if (Object.keys(fl!).length) rules.facilityLimits = fl!; if (Object.keys(cl!).length) rules.categoryLimits = cl!; if (Object.keys(gl!).length) rules.partnerGroupLimits = gl!;
    if (csv(f.trialAllowedTypes).length) rules.trialAllowedTypes = csv(f.trialAllowedTypes); if (f.corporateId.trim()) rules.corporateId = f.corporateId.trim();
    setBusy(true); setMsg(null);
    try {
      await api(f.id ? `/operations/plans/${f.id}` : '/operations/plans', { method: f.id ? 'PUT' : 'POST', body: { name: f.name.trim(), tier: f.tier, kind: f.kind, durationDays: Number(f.durationDays), active: f.active, rules, priceIqd: f.kind === 'paid' ? Number(f.priceIqd) : null } });
      setMsg({ ok: true, text: 'Plan saved.' }); setF(toForm()); await refresh();
    } catch (e) { setMsg(fail(e)); } finally { setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    <View style={[s.card, { backgroundColor: c.card, borderColor: f.id ? c.primary : c.border }]}>
      <Text style={[s.h, { color: c.foreground }]}>{f.id ? 'Edit plan' : 'New plan'}</Text>
      <Field c={c} label="NAME" value={f.name} onChange={set('name')} />
      <Choice c={c} label="TIER" options={['M', 'L', 'XL']} value={f.tier} onChange={set('tier')} />
      <Choice c={c} label="KIND" options={['paid', 'trial', 'corporate'] as const} value={f.kind} onChange={v => setF(x => ({ ...x, kind: v }))} names={{ paid: 'Paid plan', trial: 'Trial', corporate: 'Corporate' }} />
      {f.id ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Edits apply to new grants only. Existing memberships keep the rules they started with.</Text> : null}
       {f.kind === 'paid' ? <>
         <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{localizePartnerOperationsReview('Set the membership price in IQD. Checkout stays closed until the PayTabs Iraq account, recurring billing, payout eligibility, and signed callback are verified.', language)}</Text>
         <Field c={c} label="PRICE (IQD)" value={f.priceIqd} onChange={set('priceIqd')} numeric />
       </> : null}
      <View style={s.wrap}><Field c={c} label="DAYS" value={f.durationDays} onChange={set('durationDays')} numeric /><Field c={c} label="TOTAL QUOTA" value={f.quota} onChange={set('quota')} numeric /><Field c={c} label="DAILY LIMIT" value={f.dailyLimit} onChange={set('dailyLimit')} numeric /></View>
      <Choice c={c} label="QUOTA MODE" options={['shared', 'separate'] as const} value={f.quotaMode} onChange={v => setF(x => ({ ...x, quotaMode: v }))} names={{ shared: 'Shared', separate: 'Separate' }} />
      <View style={s.wrap}><Field c={c} label="PHYSICAL" value={f.physicalQuota} onChange={set('physicalQuota')} numeric /><Field c={c} label="PREMIUM" value={f.premiumQuota} onChange={set('premiumQuota')} numeric /><Field c={c} label="LIVE" value={f.liveQuota} onChange={set('liveQuota')} numeric /></View>
      <Field c={c} label="CITIES" value={f.cities} onChange={set('cities')} placeholder="baghdad, erbil" />
      <Field c={c} label="FACILITIES" value={f.facilities} onChange={set('facilities')} />
      <Field c={c} label="CATEGORIES" value={f.categories} onChange={set('categories')} />
      <Field c={c} label="FACILITY LIMITS" value={f.facilityLimits} onChange={set('facilityLimits')} placeholder="facility-id:4" />
      <Field c={c} label="CATEGORY LIMITS" value={f.categoryLimits} onChange={set('categoryLimits')} placeholder="yoga:6" />
      <Field c={c} label="PARTNER GROUP LIMITS" value={f.partnerGroupLimits} onChange={set('partnerGroupLimits')} placeholder="group-id:3" />
      {f.kind === 'trial' ? <Field c={c} label="TRIAL ALLOWED TYPES" value={f.trialAllowedTypes} onChange={set('trialAllowedTypes')} placeholder="physical, live" /> : null}
      {f.kind === 'corporate' ? <Field c={c} label="CORPORATE ID" value={f.corporateId} onChange={set('corporateId')} /> : null}
      <Choice c={c} label="STATUS" options={['on', 'off']} value={f.active ? 'on' : 'off'} onChange={v => setF(x => ({ ...x, active: v === 'on' }))} names={{ on: 'Active', off: 'Inactive' }} />
      <Msg c={c} m={msg} />
      <Btn c={c} title="Save plan" onPress={() => void save()} busy={busy} id="ops-save-plan" />
      {f.id ? <Btn c={c} title="Discard changes" tone="quiet" onPress={() => { setF(toForm()); setMsg(null); }} /> : null}
    </View>
    {d.plans.map(p => <Pressable key={p.id} accessibilityRole="button" onPress={() => { setF(toForm(p)); setMsg(null); }} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text raw style={{ color: c.foreground, fontWeight: '800' }}>{p.name}</Text>
      <Text style={{ color: c.mutedForeground }}>{p.tier} · {p.kind === 'paid' ? 'Paid plan' : p.kind === 'trial' ? 'Trial' : 'Corporate'} · {p.durationDays} days · {p.active ? 'Active' : 'Inactive'}</Text>
      <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>Tap to edit</Text>
    </Pressable>)}
  </View>;
}

function PartnersTab({ c, d, api, refresh }: TabProps) {
  const [f, setF] = useState({ name: '', groupId: '', ownerUserId: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const create = async () => {
    if (!f.name.trim() || !f.groupId.trim() || !f.ownerUserId.trim()) { setMsg({ ok: false, text: 'Name, group ID and owner user ID are required.' }); return; }
    setBusy('new'); setMsg(null);
    try { await api('/operations/partners', { method: 'POST', body: { name: f.name.trim(), groupId: f.groupId.trim(), ownerUserId: f.ownerUserId.trim() } }); setF({ name: '', groupId: '', ownerUserId: '' }); setMsg({ ok: true, text: 'Partner added. Approve it to publish availability.' }); await refresh(); }
    catch (e) { setMsg(fail(e)); } finally { setBusy(null); }
  };
  const toggle = async (id: string, approved: boolean) => {
    setBusy(id); setMsg(null);
    try { await api(`/operations/partners/${id}`, { method: 'PATCH', body: { approved } }); await refresh(); }
    catch (e) { setMsg(fail(e)); } finally { setBusy(null); }
  };
  return <View style={{ gap: 12 }}>
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.h, { color: c.foreground }]}>Add partner</Text>
      <Field c={c} label="NAME" value={f.name} onChange={v => setF(x => ({ ...x, name: v }))} />
      <View style={s.wrap}><Field c={c} label="GROUP ID" value={f.groupId} onChange={v => setF(x => ({ ...x, groupId: v }))} /><Field c={c} label="OWNER USER ID" value={f.ownerUserId} onChange={v => setF(x => ({ ...x, ownerUserId: v }))} placeholder="user_..." /></View>
      <Msg c={c} m={msg} />
      <Btn c={c} title="Add partner" onPress={() => void create()} busy={busy === 'new'} />
    </View>
    {d.partners.map(p => <View key={p.id} style={[s.card, s.between, { backgroundColor: c.card, borderColor: p.approved ? c.primary : c.border }]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text raw style={{ color: c.foreground, fontWeight: '800' }}>{p.name}</Text>
        <Text raw style={{ color: c.mutedForeground, fontSize: 12 }}>{p.groupId} · {p.ownerUserId}</Text>
        <Text style={{ color: p.approved ? c.primary : c.destructive, fontWeight: '700', fontSize: 12 }}>{p.approved ? 'Approved' : 'Awaiting approval'}</Text>
      </View>
      <Btn c={c} title={p.approved ? 'Revoke approval' : 'Approve'} tone={p.approved ? 'quiet' : 'primary'} onPress={() => void toggle(p.id, !p.approved)} busy={busy === p.id} />
    </View>)}
  </View>;
}

function AccessTab({ c, d, api }: Omit<TabProps, 'refresh'>) {
  const app = useApp();
  const grantable = d.plans.filter(p => p.kind !== 'paid' && p.active);
  const [g, setG] = useState({ userId: '', planId: grantable[0]?.id ?? '', corporateId: '', reason: '' });
  const [r, setR] = useState({ userId: '', reason: '' });
  const [refund, setRefund] = useState({ userId: '', reason: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const plan = grantable.find(p => p.id === g.planId);
  const grant = async () => {
    if (!g.userId.trim() || !g.planId || g.reason.trim().length < 5) { setMsg({ ok: false, text: 'User ID, plan and a reason of at least 5 characters are required.' }); return; }
    setBusy('g'); setMsg(null);
    try { await api('/operations/grants', { method: 'POST', body: { userId: g.userId.trim(), planId: g.planId, reason: g.reason.trim(), ...(plan?.kind === 'corporate' && g.corporateId.trim() ? { corporateId: g.corporateId.trim() } : {}) } });
      setG(x => ({ ...x, userId: '', reason: '', corporateId: '' })); setMsg({ ok: true, text: 'Access granted.' }); }
    catch (e) { setMsg(fail(e)); } finally { setBusy(null); }
  };
  const revoke = async () => {
    if (!r.userId.trim() || r.reason.trim().length < 5) { setMsg({ ok: false, text: 'User ID and a reason of at least 5 characters are required.' }); return; }
    setBusy('r'); setMsg(null);
    try { await api('/operations/revoke', { method: 'POST', body: { userId: r.userId.trim(), reason: r.reason.trim() } }); setR({ userId: '', reason: '' }); setMsg({ ok: true, text: 'Access revoked.' }); }
    catch (e) { setMsg(fail(e)); } finally { setBusy(null); }
  };
  const issueRefund = () => {
    if (!refund.userId.trim() || refund.reason.trim().length < 5) {
      setMsg({ ok: false, text: 'Member user ID and a reason of at least 5 characters are required.' }); return;
    }
    Alert.alert(localize('Request refund review?', app.language),
      localize('This queues the latest paid charge for independent administrator review. No refund is sent and paid access does not change.', app.language), [
      { text: localize('Keep payment', app.language), style: 'cancel' },
      { text: localize('Request review', app.language), onPress: () => {
        setBusy('refund'); setMsg(null);
        void requestMembershipRefund({ userId: refund.userId.trim(), reason: refund.reason.trim() })
          .then(() => {
            setRefund({ userId: '', reason: '' });
            setMsg({ ok: true, text: 'Refund review requested. No refund has been sent.' });
          })
          .catch(() => setMsg({ ok: false, text: 'Refund request could not be completed. Check details and try again.' }))
          .finally(() => setBusy(null));
      } },
    ]);
  };
  return <View style={{ gap: 12 }}>
    <Text style={{ color: c.mutedForeground, lineHeight: 19 }}>Only trial and corporate plans can be granted. Paid access requires a verified provider payment.</Text>
    <Msg c={c} m={msg} />
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.h, { color: c.foreground }]}>Grant access</Text>
      <Field c={c} label="USER ID" value={g.userId} onChange={v => setG(x => ({ ...x, userId: v }))} placeholder="user_..." />
      {grantable.length ? <Choice c={c} label="PLAN" options={grantable.map(p => p.id)} value={g.planId} onChange={v => setG(x => ({ ...x, planId: v }))} names={Object.fromEntries(grantable.map(p => [p.id, `${p.name} · ${p.tier}`]))} />
        : <Text style={{ color: c.destructive }}>Create an active trial or corporate plan first.</Text>}
      {plan?.kind === 'corporate' ? <Field c={c} label="CORPORATE ID" value={g.corporateId} onChange={v => setG(x => ({ ...x, corporateId: v }))} placeholder={plan.rules.corporateId} /> : null}
      <Field c={c} label="REASON" value={g.reason} onChange={v => setG(x => ({ ...x, reason: v }))} multiline />
      <Btn c={c} title="Grant access" onPress={() => void grant()} busy={busy === 'g'} id="ops-grant" />
    </View>
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.destructive }]}>
      <Text style={[s.h, { color: c.foreground }]}>Revoke access</Text>
      <Field c={c} label="USER ID" value={r.userId} onChange={v => setR(x => ({ ...x, userId: v }))} placeholder="user_..." />
      <Field c={c} label="REASON" value={r.reason} onChange={v => setR(x => ({ ...x, reason: v }))} multiline />
      <Btn c={c} title="Revoke access" tone="danger" onPress={() => void revoke()} busy={busy === 'r'} id="ops-revoke" />
    </View>
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.destructive }]}>
      <Text style={[s.h, { color: c.foreground }]}>Request refund review</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>A confirmed full refund also cancels the paid subscription and future live reservations. Trial and corporate access are not changed.</Text>
      <Field c={c} label="MEMBER USER ID" value={refund.userId} onChange={v => setRefund(x => ({ ...x, userId: v }))} placeholder="user_..." />
      <Field c={c} label="REASON" value={refund.reason} onChange={v => setRefund(x => ({ ...x, reason: v }))} multiline />
      <Btn c={c} title="Refund latest charge" tone="danger" onPress={issueRefund} busy={busy === 'refund'} id="ops-refund" />
    </View>
  </View>;
}

type LocalizedDraft = { en: string; ar: string; ku: string };
type CourseDraft = {
  localizedTitle: LocalizedDraft;
  localizedSummary: LocalizedDraft;
  localizedInstructor: LocalizedDraft;
  category: string;
  level: CourseMetadataInput['level'];
  durationMinutes: string;
  thumbnailUrl: string;
  published: boolean;
};
type LessonDraft = {
  localizedTitle: LocalizedDraft;
  localizedContent: LocalizedDraft;
  durationMinutes: string;
  mediaUrl: string;
};
const emptyLocalized = (): LocalizedDraft => ({ en: '', ar: '', ku: '' });
const emptyCourseDraft = (): CourseDraft => ({
  localizedTitle: emptyLocalized(), localizedSummary: emptyLocalized(), localizedInstructor: emptyLocalized(),
  category: '', level: 'all-levels', durationMinutes: '', thumbnailUrl: '', published: false,
});
const emptyLessonDraft = (): LessonDraft => ({
  localizedTitle: emptyLocalized(), localizedContent: emptyLocalized(), durationMinutes: '', mediaUrl: '',
});
const isHttpsUrl = (value: string) => {
  try { const url = new URL(value.trim()); return url.protocol === 'https:' && !!url.hostname; }
  catch { return false; }
};
const isPrivateRecordingPath = (value: string) =>
  /^\/objects\/course-recordings\/[A-Za-z0-9_-]{1,180}\.(mp4|webm|m4v|mov|m4a|mp3|aac|ogg)$/.test(value.trim());
const validLocalized = (values: LocalizedDraft) => !!values.en.trim() && !!values.ar.trim() && !!values.ku.trim();
const toMetadata = (draft: CourseDraft): CourseMetadataInput => ({
  localizedTitle: { en: draft.localizedTitle.en.trim(), ar: draft.localizedTitle.ar.trim(), ku: draft.localizedTitle.ku.trim() },
  localizedSummary: { en: draft.localizedSummary.en.trim(), ar: draft.localizedSummary.ar.trim(), ku: draft.localizedSummary.ku.trim() },
  localizedInstructor: { en: draft.localizedInstructor.en.trim(), ar: draft.localizedInstructor.ar.trim(), ku: draft.localizedInstructor.ku.trim() },
  category: draft.category.trim(),
  level: draft.level,
  durationMinutes: Number(draft.durationMinutes),
  thumbnailUrl: draft.thumbnailUrl.trim() || null,
  published: draft.published,
});
const toCourseDraft = (course: CourseAdminRecord): CourseDraft => ({
  localizedTitle: course.localizedTitle, localizedSummary: course.localizedSummary, localizedInstructor: course.localizedInstructor,
  category: course.category, level: course.level, durationMinutes: String(course.durationMinutes),
  thumbnailUrl: course.thumbnailUrl ?? '', published: course.published,
});
const toLessonInput = (draft: LessonDraft, position: number): LessonInput => ({
  position,
  localizedTitle: { en: draft.localizedTitle.en.trim(), ar: draft.localizedTitle.ar.trim(), ku: draft.localizedTitle.ku.trim() },
  localizedContent: { en: draft.localizedContent.en.trim(), ar: draft.localizedContent.ar.trim(), ku: draft.localizedContent.ku.trim() },
  durationMinutes: Number(draft.durationMinutes),
  mediaUrl: draft.mediaUrl.trim(),
});

function LocalizedFields({ c, label, values, onChange, multiline = false }: {
  c: Colors; label: string; values: LocalizedDraft; onChange: (language: keyof LocalizedDraft, value: string) => void; multiline?: boolean;
}) {
  const fields: { language: keyof LocalizedDraft; name: string; placeholder: string }[] = [
    { language: 'en', name: 'ENGLISH', placeholder: 'English' },
    { language: 'ar', name: 'IRAQI ARABIC', placeholder: 'العربية العراقية' },
    { language: 'ku', name: 'SORANI KURDISH', placeholder: 'کوردی سۆرانی' },
  ];
  return <View style={{ gap: 8 }}>
    <Text style={[s.label, { color: c.mutedForeground }]}>{label} · ALL LANGUAGES</Text>
    {fields.map(field => <Field key={field.language} c={c} label={field.name} value={values[field.language]}
      onChange={value => onChange(field.language, value)} placeholder={field.placeholder} multiline={multiline} />)}
  </View>;
}

function CourseMetadataFields({ c, draft, setDraft }: {
  c: Colors; draft: CourseDraft; setDraft: React.Dispatch<React.SetStateAction<CourseDraft>>;
}) {
  const setLocalized = (key: 'localizedTitle' | 'localizedSummary' | 'localizedInstructor') =>
    (language: keyof LocalizedDraft, value: string) => setDraft(current => ({
      ...current, [key]: { ...current[key], [language]: value },
    }));
  return <>
    <LocalizedFields c={c} label="COURSE TITLE" values={draft.localizedTitle} onChange={setLocalized('localizedTitle')} />
    <LocalizedFields c={c} label="COURSE SUMMARY" values={draft.localizedSummary} onChange={setLocalized('localizedSummary')} multiline />
    <LocalizedFields c={c} label="INSTRUCTOR" values={draft.localizedInstructor} onChange={setLocalized('localizedInstructor')} />
    <View style={s.wrap}>
      <Field c={c} label="CATEGORY" value={draft.category} onChange={value => setDraft(current => ({ ...current, category: value }))} placeholder="mobility, strength…" />
      <Field c={c} label="COURSE MINUTES" value={draft.durationMinutes} onChange={value => setDraft(current => ({ ...current, durationMinutes: value }))} numeric />
    </View>
    <Choice c={c} label="LEVEL" options={['beginner', 'intermediate', 'advanced', 'all-levels'] as const}
      value={draft.level} onChange={level => setDraft(current => ({ ...current, level }))} names={{
        beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', 'all-levels': 'All levels',
      }} />
    <Field c={c} label="THUMBNAIL URL · HTTPS" value={draft.thumbnailUrl}
      onChange={value => setDraft(current => ({ ...current, thumbnailUrl: value }))} placeholder="https://…" />
    <Choice c={c} label="PUBLICATION" options={['draft', 'published'] as const} value={draft.published ? 'published' : 'draft'}
      onChange={value => setDraft(current => ({ ...current, published: value === 'published' }))} names={{ draft: 'Draft', published: 'Published' }} />
  </>;
}

function LessonFields({ c, draft, setDraft, heading }: {
  c: Colors; draft: LessonDraft; setDraft: React.Dispatch<React.SetStateAction<LessonDraft>>; heading: string;
}) {
  const setLocalized = (key: 'localizedTitle' | 'localizedContent') =>
    (language: keyof LocalizedDraft, value: string) => setDraft(current => ({
      ...current, [key]: { ...current[key], [language]: value },
    }));
  return <View style={{ gap: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 14 }}>
    <Text style={[s.h, { color: c.foreground, fontSize: 16 }]}>{heading}</Text>
    <LocalizedFields c={c} label="LESSON TITLE" values={draft.localizedTitle} onChange={setLocalized('localizedTitle')} />
    <LocalizedFields c={c} label="LESSON CONTENT" values={draft.localizedContent} onChange={setLocalized('localizedContent')} multiline />
    <View style={s.wrap}>
      <Field c={c} label="LESSON MINUTES" value={draft.durationMinutes}
        onChange={value => setDraft(current => ({ ...current, durationMinutes: value }))} numeric />
      <Field c={c} label="PRIVATE RECORDING PATH" value={draft.mediaUrl}
        onChange={value => setDraft(current => ({ ...current, mediaUrl: value }))} placeholder="/objects/course-recordings/…" />
    </View>
  </View>;
}

function CoursesTab({ c }: { c: Colors }) {
  const queryClient = useQueryClient();
  const coursesQuery = useGetOperationCourses();
  const createCourse = useCreateLearningCourse();
  const updateCourse = useUpdateLearningCourse();
  const addLesson = useAddLearningLesson();
  const [draft, setDraft] = useState<CourseDraft>(emptyCourseDraft);
  const [editDraft, setEditDraft] = useState<CourseDraft>(emptyCourseDraft);
  const [lessonDraft, setLessonDraft] = useState<LessonDraft>(emptyLessonDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lessonCourseId, setLessonCourseId] = useState<string | null>(null);
  const [appendDraft, setAppendDraft] = useState<LessonDraft>(emptyLessonDraft);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const courses = coursesQuery.data?.courses ?? [];
  const invalidateCourses = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetOperationCoursesQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetMemberCoursesQueryKey() }),
  ]);
  const validateMetadata = (value: CourseDraft) => {
    if (!validLocalized(value.localizedTitle) || !validLocalized(value.localizedSummary) || !validLocalized(value.localizedInstructor)) {
      return 'Add the title, summary and instructor in English, Iraqi Arabic and Sorani Kurdish.';
    }
    if (!value.category.trim()) return 'Add a course category.';
    if (!isInt(value.durationMinutes, 1)) return 'Course duration must be a whole number of at least 1 minute.';
    if (value.thumbnailUrl.trim() && !isHttpsUrl(value.thumbnailUrl)) return 'Thumbnail links must use HTTPS.';
    return null;
  };
  const validateLesson = (value: LessonDraft) => {
    if (!validLocalized(value.localizedTitle) || !validLocalized(value.localizedContent)) {
      return 'Add the lesson title and content in English, Iraqi Arabic and Sorani Kurdish.';
    }
    if (!isInt(value.durationMinutes, 1)) return 'Lesson duration must be a whole number of at least 1 minute.';
    if (!isPrivateRecordingPath(value.mediaUrl)) return 'Use a private course-recording path, not a public link.';
    return null;
  };
  const create = async () => {
    const metadataError = validateMetadata(draft);
    const lessonError = validateLesson(lessonDraft);
    if (metadataError || lessonError) { setMsg({ ok: false, text: metadataError ?? lessonError! }); return; }
    const data: CourseInput = { ...toMetadata(draft), lessons: [toLessonInput(lessonDraft, 1)] };
    setBusy('create'); setMsg(null);
    try {
      await createCourse.mutateAsync({ data });
      await invalidateCourses();
      setDraft(emptyCourseDraft()); setLessonDraft(emptyLessonDraft());
      setMsg({ ok: true, text: 'Course created. Publication controls are ready in the course list.' });
    } catch (error) { setMsg(fail(error)); } finally { setBusy(null); }
  };
  const saveMetadata = async (course: CourseAdminRecord) => {
    const validationError = validateMetadata(editDraft);
    if (validationError) { setMsg({ ok: false, text: validationError }); return; }
    setBusy(`edit-${course.id}`); setMsg(null);
    try {
      await updateCourse.mutateAsync({ id: course.id, data: toMetadata(editDraft) });
      await invalidateCourses();
      setEditingId(null); setMsg({ ok: true, text: 'Course details updated.' });
    } catch (error) { setMsg(fail(error)); } finally { setBusy(null); }
  };
  const togglePublication = async (course: CourseAdminRecord) => {
    setBusy(`publish-${course.id}`); setMsg(null);
    try {
      await updateCourse.mutateAsync({ id: course.id, data: { ...toMetadata(toCourseDraft(course)), published: !course.published } });
      await invalidateCourses();
      setMsg({ ok: true, text: course.published ? 'Course unpublished.' : 'Course published.' });
    } catch (error) { setMsg(fail(error)); } finally { setBusy(null); }
  };
  const append = async (course: CourseAdminRecord) => {
    const validationError = validateLesson(appendDraft);
    if (validationError) { setMsg({ ok: false, text: validationError }); return; }
    setBusy(`lesson-${course.id}`); setMsg(null);
    try {
      await addLesson.mutateAsync({ id: course.id, data: toLessonInput(appendDraft, course.lessonCount + 1) });
      await invalidateCourses();
      setLessonCourseId(null); setAppendDraft(emptyLessonDraft());
      setMsg({ ok: true, text: `Lesson ${course.lessonCount + 1} added.` });
    } catch (error) { setMsg(fail(error)); } finally { setBusy(null); }
  };
  if (coursesQuery.isPending) return <View style={{ gap: 10 }}>
    {[0, 1, 2].map(index => <View key={index} style={[s.skeleton, { backgroundColor: c.muted }]} />)}
  </View>;
  if (coursesQuery.isError && !coursesQuery.data) return <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
    <Text style={[s.h, { color: c.foreground }]}>Course catalogue unavailable</Text>
    <Text style={{ color: c.mutedForeground }}>The course list could not be loaded. Try again when the connection is steady.</Text>
    <Btn c={c} title="Try again" onPress={() => void coursesQuery.refetch()} />
  </View>;
  return <View style={{ gap: 12 }}>
    <View style={[s.courseBanner, { backgroundColor: c.primary }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: c.primaryForeground, fontWeight: '800', fontSize: 17 }}>Learning library</Text>
        <Text style={{ color: c.accent, fontSize: 12 }}>Admin controls · English · Iraqi Arabic · Sorani</Text>
      </View>
      <Ionicons name="library-outline" size={25} color={c.accent} />
    </View>
    <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[s.h, { color: c.foreground }]}>Create a course</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 12, lineHeight: 18 }}>
        Courses are saved with their first lesson. Every language field is required; media and thumbnail links must be secure HTTPS.
      </Text>
      <CourseMetadataFields c={c} draft={draft} setDraft={setDraft} />
      <LessonFields c={c} draft={lessonDraft} setDraft={setLessonDraft} heading="Lesson 1 · first in sequence" />
      <Btn c={c} title="Create course" onPress={() => void create()} busy={busy === 'create'} id="ops-create-course" />
    </View>
    <View style={s.courseListHeading}>
      <Text style={[s.h, { color: c.foreground }]}>Course catalogue</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{courses.length} {courses.length === 1 ? 'course' : 'courses'}</Text>
    </View>
    {coursesQuery.isError ? <Text style={{ color: c.destructive }}>Course list may be out of date. Pull to retry is not available here; use the refresh control below.</Text> : null}
    {coursesQuery.isError ? <Btn c={c} title="Refresh course list" tone="quiet" onPress={() => void coursesQuery.refetch()} /> : null}
    {msg ? <Msg c={c} m={msg} /> : null}
    {!courses.length ? <View style={[s.empty, { borderColor: c.border }]}>
      <Ionicons name="book-outline" size={26} color={c.mutedForeground} />
      <Text style={{ color: c.foreground, fontWeight: '700', textAlign: 'center' }}>No courses yet</Text>
      <Text style={{ color: c.mutedForeground, textAlign: 'center' }}>Create the first learning experience above. It will appear here once saved.</Text>
    </View> : courses.map(course => <View key={course.id} style={[s.card, { backgroundColor: c.card, borderColor: course.published ? c.primary : c.border }]}>
      <View style={s.between}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text raw style={{ color: c.foreground, fontWeight: '800', fontSize: 16 }}>{course.title}</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{course.category} · {course.level} · {course.durationMinutes} min</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: course.published ? c.accent : c.muted }]}>
          <Text style={{ color: c.foreground, fontWeight: '700', fontSize: 11 }}>{course.published ? 'Published' : 'Draft'}</Text>
        </View>
      </View>
      <View style={s.courseMetaLine}>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'} · Updated {new Date(course.updatedAt).toLocaleDateString()}</Text>
        <Text raw style={{ color: c.mutedForeground, fontSize: 10 }}>ID {course.id}</Text>
      </View>
      <View style={s.wrap}>
        <Btn c={c} title="Edit details" tone="quiet" onPress={() => {
          setEditingId(editingId === course.id ? null : course.id);
          setEditDraft(toCourseDraft(course)); setMsg(null);
        }} />
        <Btn c={c} title={course.published ? 'Unpublish' : 'Publish'} tone={course.published ? 'quiet' : 'primary'}
          onPress={() => void togglePublication(course)} busy={busy === `publish-${course.id}`} />
        <Btn c={c} title={lessonCourseId === course.id ? 'Close lesson form' : 'Append lesson'} tone="quiet"
          onPress={() => { setLessonCourseId(lessonCourseId === course.id ? null : course.id); setAppendDraft(emptyLessonDraft()); setMsg(null); }} />
      </View>
      {editingId === course.id ? <View style={[s.courseEditor, { borderTopColor: c.border }]}>
        <Text style={[s.h, { color: c.foreground, fontSize: 16 }]}>Edit course metadata</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Existing lessons stay in their original order. Only course details and publication status can be changed.</Text>
        <CourseMetadataFields c={c} draft={editDraft} setDraft={setEditDraft} />
        <View style={s.wrap}>
          <Btn c={c} title="Save course details" onPress={() => void saveMetadata(course)} busy={busy === `edit-${course.id}`} />
          <Btn c={c} title="Discard" tone="quiet" onPress={() => { setEditingId(null); setEditDraft(emptyCourseDraft()); setMsg(null); }} />
        </View>
      </View> : null}
      {lessonCourseId === course.id ? <View style={[s.courseEditor, { borderTopColor: c.border }]}>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>This lesson will be added as position {course.lessonCount + 1}. Existing lessons cannot be edited, removed or reordered.</Text>
        <LessonFields c={c} draft={appendDraft} setDraft={setAppendDraft} heading={`Append lesson · position ${course.lessonCount + 1}`} />
        <Btn c={c} title={`Add lesson ${course.lessonCount + 1}`} onPress={() => void append(course)}
          busy={busy === `lesson-${course.id}`} id={`ops-add-lesson-${course.id}`} />
      </View> : null}
    </View>)}
  </View>;
}

const s = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 60, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  role: { borderRadius: 18, padding: 16, gap: 4 },
  tab: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  h: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  btn: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skeleton: { height: 120, borderRadius: 18 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 18, padding: 26, alignItems: 'center', gap: 8 },
  courseBanner: { borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  courseListHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6 },
  courseMetaLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  courseEditor: { borderTopWidth: 1, paddingTop: 14, gap: 12 },
});
