import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { getAttendance, issueCheckinQr, revokeCheckinQr, reviewAttendance, setCheckinPolicy, requestManualCheckinCode, recordManualCheckin } from '@workspace/api-client-react';
import { Text, TextInput, Pressable } from '@/components/Localized';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/contexts/AppContext';
import { dateTime } from '@/lib/content';
import { ApiError } from '@workspace/api-client-react';

type Row = Awaited<ReturnType<typeof getAttendance>>['rows'][number];
type Action = Parameters<typeof reviewAttendance>[1]['action'];
export function AttendanceCard({ row: r, role, refresh }: { row: Row; role: string; refresh: () => Promise<void> }) {
  const c = useColors(), { language } = useApp();
  const staff = role === 'admin' || role === 'partner';
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ token: string; expiresAt: string } | null>(null);
  const [memberCode, setMemberCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!qr && !memberCode) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [qr, memberCode]);
  const [policy, setPolicy] = useState({ latitude: '', longitude: '', radius: '150',
    opensAt: new Date(new Date(r.startsAt).getTime() - 30 * 60000).toISOString(),
    closesAt: r.endsAt, correctionEndsAt: new Date(new Date(r.endsAt).getTime() + 86400000).toISOString() });
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await f(); setReason(''); await refresh(); }
    catch (e) { setError(e instanceof ApiError && e.data && typeof e.data === 'object' && 'message' in e.data ? String(e.data.message) : e instanceof Error ? e.message : 'Request failed.'); }
    finally { setBusy(false); }
  };
  const button = (text: string, fn: () => Promise<unknown>) => <Pressable key={text} disabled={busy} onPress={() => void run(fn)}
    style={[s.button, { backgroundColor: c.secondary, opacity: busy ? 0.5 : 1 }]}><Text style={{ color: c.primary }}>{text}</Text></Pressable>;
  const act = (text: string, action: Action) => button(text, () => reviewAttendance(r.reservationId, { action, reason }));
  return <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
    <Text raw style={{ color: c.foreground, fontSize: 17, fontWeight: '800' }}>{r.title}</Text>
    <Text raw style={{ color: c.mutedForeground }}>{r.facility} · {dateTime(r.startsAt, language)}</Text>
    {staff ? <Text raw selectable style={{ color: c.mutedForeground }}>Member: {r.userId}</Text> : null}
    <Text raw style={{ color: c.foreground }}>Reservation: {r.bookingStatus} · Attendance: {r.status}</Text>
    <Text style={{ color: c.primary }}>{r.locked ? 'Locked' : r.settlementEligible ? 'Partner confirmed — settlement eligible' : 'Not settlement eligible'}</Text>
    {r.reference ? <Text raw selectable style={{ color: c.mutedForeground }}>{r.reference}</Text> : null}
    {r.policy ? <Text raw style={{ color: c.mutedForeground }}>
      Check-in: {dateTime(r.policy.opensAt, language)} — {dateTime(r.policy.closesAt, language)}{'\n'}
      Corrections until: {dateTime(r.policy.correctionEndsAt, language)}
    </Text> : staff ? <View style={s.fields}>
      <Text style={{ color: c.foreground }}>Configure location and attendance window once for this session. Dates must include a timezone, for example +03:00 for Iraq.</Text>
      {(Object.keys(policy) as (keyof typeof policy)[]).map(k => <View key={k}>
        <Text raw style={{ color: c.mutedForeground }}>{k}</Text>
        <TextInput accessibilityLabel={k} value={policy[k]} onChangeText={v => setPolicy(p => ({ ...p, [k]: v }))}
          style={[s.input, { color: c.foreground, borderColor: c.border }]} autoCapitalize="none" />
      </View>)}
      {button('Save check-in policy', () => {
        if (!policy.latitude.trim() || !policy.longitude.trim()) throw new Error('Enter facility coordinates.');
        return setCheckinPolicy(r.reservationId, { ...policy, latitude: Number(policy.latitude), longitude: Number(policy.longitude), radius: Number(policy.radius) });
      })}
    </View> : null}
    {staff && r.policy && r.bookingStatus === 'reserved' && r.status === 'not_checked_in' && !r.locked ? <>
      {button('Issue / replace QR', async () => { setQr(await issueCheckinQr(r.reservationId)); setNow(Date.now()); })}
      {button('Deactivate QR', async () => { await revokeCheckinQr(r.reservationId); setQr(null); })}
      {qr && new Date(qr.expiresAt).getTime() > now ? <View style={s.qr}>
        <QRCode value={qr.token} size={210} />
        <Text style={{ color: c.foreground }}>Single use — ask this member to scan</Text>
        <Text raw style={{ color: c.foreground }}>{Math.ceil((new Date(qr.expiresAt).getTime() - now) / 1000)}s</Text>
      </View> : qr ? <Text style={{ color: c.destructive }}>QR expired. Issue a new code.</Text> : null}
    </> : null}
    {role === 'member' && r.policy && r.bookingStatus === 'reserved' && r.status === 'not_checked_in' && !r.locked ? <View style={s.fields}>
      {button('Request one-time staff code', async () => {
        const issued = await requestManualCheckinCode(r.reservationId);
        setMemberCode(issued); setNow(Date.now()); return issued;
      })}
      {memberCode && new Date(memberCode.expiresAt).getTime() > now ? <View style={[s.codeBox, { backgroundColor: c.secondary }]}>
        <Text style={{ color: c.foreground }}>Show this one-time code to partner staff.</Text>
        <Text raw selectable style={{ color: c.primary, fontSize: 28, fontWeight: '800', letterSpacing: 5, textAlign: 'center' }}>{memberCode.code}</Text>
        <Text style={{ color: c.mutedForeground }}>Code expires in {Math.ceil((new Date(memberCode.expiresAt).getTime() - now) / 1000)} seconds.</Text>
        <Text style={{ color: c.mutedForeground }}>Staff-assisted arrival still needs confirmation by a different staff member.</Text>
      </View> : memberCode ? <Text style={{ color: c.destructive }}>Code expired. Request a new one.</Text> : null}
    </View> : null}
    {staff && r.policy && r.bookingStatus === 'reserved' && r.status === 'not_checked_in' && !r.locked ? <View style={s.fields}>
      <TextInput accessibilityLabel="Member one-time code" placeholder="Enter the member's one-time code" value={manualCode}
        onChangeText={v => setManualCode(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" maxLength={8}
        placeholderTextColor={c.mutedForeground} style={[s.input, { color: c.foreground, borderColor: c.border }]} />
      {button('Record manual arrival', async () => {
        if (manualCode.length !== 8 || reason.trim().length < 5) throw new Error('Manual check-in requires a reason and valid code.');
        const result = await recordManualCheckin(r.reservationId, { code: manualCode, reason });
        setManualCode('');
        return result;
      })}
      <Text style={{ color: c.mutedForeground }}>Enter the code shown by the member. Another staff member must confirm the arrival.</Text>
    </View> : null}
    {!r.locked && (staff || r.status !== 'not_checked_in') ? <>
      <TextInput accessibilityLabel="Reason for attendance review" placeholder="Reason for attendance review (required)" value={reason} onChangeText={setReason}
        placeholderTextColor={c.mutedForeground} style={[s.input, { color: c.foreground, borderColor: c.border }]} multiline />
      <View style={s.fields}>
        {staff && r.bookingStatus === 'requested' ? act('Accept reservation request', 'accept_request') : null}
        {staff && r.status === 'pending' ? act('Confirm member attended', 'confirm') : null}
        {staff && r.status === 'not_checked_in' && r.policy && Date.now() >= new Date(r.policy.closesAt).getTime() ? act('Mark no-show after review', 'no_show') : null}
        {r.status !== 'not_checked_in' && r.status !== 'disputed' ? act('Dispute attendance / place on hold', 'dispute') : null}
        {staff && ['pending', 'confirmed'].includes(r.status) ? act('Correct to void', 'void') : null}
        {role === 'admin' && r.status === 'disputed' ? <>{act('Resolve dispute: attended', 'resolve_confirm')}{act('Resolve dispute: void', 'resolve_void')}</> : null}
        {role === 'admin' && ['confirmed', 'no_show', 'void'].includes(r.status) ? act('Lock reconciled record', 'lock') : null}
      </View>
    </> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: c.destructive }}>{error}</Text> : null}
    <Text style={{ color: c.foreground, fontWeight: '700' }}>Attendance updates & audit history</Text>
    {r.events.filter(e => !['policy', 'qr.issue', 'qr.revoke'].includes(e.action) || staff).map((e, i) =>
      <Text raw key={`${e.createdAt}:${i}`} style={{ color: c.mutedForeground }}>{dateTime(e.createdAt, language)} · {e.action} · {e.reason}{staff ? ` · ${e.actorId}` : ''}</Text>)}
  </View>;
}
const s = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
  fields: { gap: 10 }, input: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 44 },
  button: { padding: 12, borderRadius: 10, minHeight: 44 },
  qr: { alignItems: 'center', padding: 12, gap: 12 }, codeBox: { alignItems: 'center', padding: 14, borderRadius: 14, gap: 8 },
});
