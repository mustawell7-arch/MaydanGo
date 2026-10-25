import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Text, TextInput, Pressable, Ionicons } from '@/components/Localized';
import { ScreenShell, ScreenHeader } from '@/components/ScreenShell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { dateTime, errorCopy } from '@/lib/content';
import { HttpError, useAuthedResource, type Operations, type Offering, type Plan, type Rules } from '@/lib/live-api';

type Tab = 'offerings' | 'plans' | 'partners' | 'access';
type Colors = ReturnType<typeof useColors>;
const csv = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
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
  const ops = useAuthedResource<Operations>('/operations');
  const [tab, setTab] = useState<Tab>('offerings');
  const refresh = ops.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const header = <ScreenHeader eyebrow="STAFF" title="Operations" />;
  const back = <Pressable onPress={() => router.back()} accessibilityRole="button" style={s.row}><Ionicons name="chevron-back" size={16} color={c.primary} /><Text style={{ color: c.primary }}>Back</Text></Pressable>;

  if (!ops.signedIn || ops.status === 403 || ops.status === 401) return <ScreenShell>{header}<View style={s.pad}>{back}
    <View style={[s.empty, { borderColor: c.border }]}><Ionicons name="lock-closed-outline" size={26} color={c.mutedForeground} />
      <Text style={{ color: c.foreground, fontWeight: '700', textAlign: 'center' }}>Staff access only</Text>
      <Text style={{ color: c.mutedForeground, textAlign: 'center' }}>This area is for MaydanGo administrators and approved partners.</Text></View></View></ScreenShell>;
  if (ops.error && !ops.data) return <ScreenShell>{header}<View style={s.pad}>{back}<Text style={{ color: c.destructive }}>{ops.error}</Text><Btn c={c} title="Try again" onPress={() => void ops.refresh()} /></View></ScreenShell>;
  if (!ops.data) return <ScreenShell>{header}<View style={s.pad}>{[0, 1, 2].map(i => <View key={i} style={[s.skeleton, { backgroundColor: c.muted }]} />)}</View></ScreenShell>;

  const d = ops.data, admin = d.role === 'admin';
  const tabs: Tab[] = admin ? ['offerings', 'plans', 'partners', 'access'] : ['offerings'];
  const names: Record<Tab, string> = { offerings: 'Offerings', plans: 'Plans', partners: 'Partners', access: 'Access grants' };
  return <ScreenShell>{header}
    <KeyboardAwareScrollViewCompat contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {back}
      <View style={[s.role, { backgroundColor: c.primary }]}>
        <Text style={{ color: c.primaryForeground, fontWeight: '800' }}>{admin ? 'Administrator' : 'Partner staff'}</Text>
        <Text raw style={{ color: c.accent, fontSize: 12 }}>{d.partnerId ?? `${d.partners.length} · ${d.offerings.length} · ${d.plans.length}`}</Text>
      </View>
      {tabs.length > 1 ? <View style={s.wrap}>{tabs.map(t => <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)}
        style={[s.tab, { borderColor: tab === t ? c.primary : c.border, backgroundColor: tab === t ? c.accent : c.card }]}><Text style={{ color: c.foreground, fontWeight: '700' }}>{names[t]}</Text></Pressable>)}</View> : null}
      {ops.error ? <Text style={{ color: c.destructive }}>{ops.error}</Text> : null}
      {tab === 'offerings' || !admin ? <OfferingsTab c={c} d={d} api={ops.api} refresh={ops.refresh} />
        : tab === 'plans' ? <PlansTab c={c} d={d} api={ops.api} refresh={ops.refresh} />
        : tab === 'partners' ? <PartnersTab c={c} d={d} api={ops.api} refresh={ops.refresh} />
        : <AccessTab c={c} d={d} api={ops.api} />}
    </KeyboardAwareScrollViewCompat>
  </ScreenShell>;
}
type TabProps = { c: Colors; d: Operations; api: ReturnType<typeof useAuthedResource>['api']; refresh: () => Promise<void> };
const fail = (e: unknown) => ({ ok: false, text: e instanceof HttpError ? e.message : errorCopy(e) });

function OfferingsTab({ c, d, api, refresh }: TabProps) {
  const { language } = useApp();
  const approved = d.partners.filter(p => p.approved);
  const [f, setF] = useState({ partnerId: d.partnerId ?? approved[0]?.id ?? '', title: '', kind: 'session' as Offering['kind'], city: '', facility: '', category: '',
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
      : iraqInstant(f.startsAt).getTime() <= Date.now() ? 'Start must be in the future.' : null;
    if (err) { setMsg({ ok: false, text: err }); return; }
    setBusy('create'); setMsg(null);
    try {
      await api('/operations/offerings', { method: 'POST', body: { ...f, title: f.title.trim(), city: f.city.trim(), facility: f.facility.trim(), category: f.category.trim(),
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
      <Choice c={c} label="ACCESS" options={['physical', 'premium', 'live'] as const} value={f.accessType} onChange={v => setF(x => ({ ...x, accessType: v }))} names={{ physical: 'Physical', premium: 'Premium', live: 'Live online' }} />
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

const blankRules: Rules = { quota: 8, dailyLimit: 1, quotaMode: 'shared', physicalQuota: 8, premiumQuota: 0, liveQuota: 0 };
function PlansTab({ c, d, api, refresh }: TabProps) {
  const toForm = (p?: Plan) => { const r = p?.rules ?? blankRules; return { id: p?.id ?? null as string | null, name: p?.name ?? '', tier: p?.tier ?? 'M', kind: p?.kind ?? 'trial' as Plan['kind'], durationDays: String(p?.durationDays ?? 30), active: p?.active ?? true,
    quota: String(r.quota), dailyLimit: String(r.dailyLimit), quotaMode: r.quotaMode, physicalQuota: String(r.physicalQuota), premiumQuota: String(r.premiumQuota), liveQuota: String(r.liveQuota),
    cities: (r.cities ?? []).join(', '), facilities: (r.facilities ?? []).join(', '), categories: (r.categories ?? []).join(', '), facilityLimits: fromLimits(r.facilityLimits), categoryLimits: fromLimits(r.categoryLimits),
    partnerGroupLimits: fromLimits(r.partnerGroupLimits), trialAllowedTypes: (r.trialAllowedTypes ?? []).join(', '), corporateId: r.corporateId ?? '' }; };
  const [f, setF] = useState(toForm());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    const fl = limits(f.facilityLimits), cl = limits(f.categoryLimits), gl = limits(f.partnerGroupLimits);
    const nums = ['quota', 'dailyLimit', 'physicalQuota', 'premiumQuota', 'liveQuota'] as const;
    const err = !f.name.trim() ? 'Plan name is required.' : !isInt(f.durationDays, 1) ? 'Duration must be at least 1 day.' : nums.some(k => !isInt(f[k])) ? 'Quotas must be whole numbers.'
      : !fl || !cl || !gl ? 'Limits use the format key:number, key:number.' : f.kind === 'trial' && (!csv(f.trialAllowedTypes).length || csv(f.trialAllowedTypes).some(t => !['physical', 'premium', 'live'].includes(t))) ? 'Trial plans need allowed types, e.g. physical, live.' : f.kind === 'corporate' && !f.corporateId.trim() ? 'Corporate plans need a corporate ID.' : null;
    if (err) { setMsg({ ok: false, text: err }); return; }
    const rules: Rules = { quota: Number(f.quota), dailyLimit: Number(f.dailyLimit), quotaMode: f.quotaMode, physicalQuota: Number(f.physicalQuota), premiumQuota: Number(f.premiumQuota), liveQuota: Number(f.liveQuota) };
    if (csv(f.cities).length) rules.cities = csv(f.cities); if (csv(f.facilities).length) rules.facilities = csv(f.facilities); if (csv(f.categories).length) rules.categories = csv(f.categories);
    if (Object.keys(fl!).length) rules.facilityLimits = fl!; if (Object.keys(cl!).length) rules.categoryLimits = cl!; if (Object.keys(gl!).length) rules.partnerGroupLimits = gl!;
    if (csv(f.trialAllowedTypes).length) rules.trialAllowedTypes = csv(f.trialAllowedTypes); if (f.corporateId.trim()) rules.corporateId = f.corporateId.trim();
    setBusy(true); setMsg(null);
    try {
      await api(f.id ? `/operations/plans/${f.id}` : '/operations/plans', { method: f.id ? 'PUT' : 'POST', body: { name: f.name.trim(), tier: f.tier, kind: f.kind, durationDays: Number(f.durationDays), active: f.active, rules } });
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
      {f.kind === 'paid' ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Paid plans are listed only. Checkout is not available yet, so they cannot be activated.</Text> : null}
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
  const grantable = d.plans.filter(p => p.kind !== 'paid' && p.active);
  const [g, setG] = useState({ userId: '', planId: grantable[0]?.id ?? '', corporateId: '', reason: '' });
  const [r, setR] = useState({ userId: '', reason: '' });
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
  return <View style={{ gap: 12 }}>
    <Text style={{ color: c.mutedForeground, lineHeight: 19 }}>Only trial and corporate plans can be granted. Paid access requires checkout, which is not available yet.</Text>
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
});
