import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import type { Language } from '@/lib/i18n';
import { dateTime, errorCopy } from '@/lib/content';
import {
  getMemberState, createMemberBooking, cancelMemberBooking, enablePreviewMembership,
  joinMemberWaitlist, leaveMemberWaitlist, acceptMemberWaitlistOffer,
  setBaseUrl, setAuthTokenGetter, type MemberState, type MemberBooking,
  saveMemberProfile, getBookingCatalog,
} from '@workspace/api-client-react';

const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);
const empty: MemberState = { memberships: [], bookings: [], waitlists: [] };

export function useMemberBookings(language: Language) {
  const { userId, isSignedIn, getToken } = useAuth();
  const identity = useRef(userId);
  identity.current = userId;
  const [data, setData] = useState<{ owner: string; value: MemberState } | null>(null);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof getBookingCatalog>>>([]);
  const version = useRef(0);
  const [memberError, setError] = useState<string | null>(null);
  const [memberLoading, setLoading] = useState(false);
  const pending = useRef(false);
  // This is an Expo app, including its cross-origin Expo web preview.
  setAuthTokenGetter(() => getToken());
  const current = data && data.owner === userId ? data.value : empty;
  const refreshMember = useCallback(async () => {
    const owner = userId;
    if (!owner || pending.current) return;
    const revision = ++version.current;
    setLoading(true);
    try {
      const [value, entries] = await Promise.all([getMemberState(), getBookingCatalog()]);
      if (identity.current === owner && revision === version.current) { setData({ owner, value }); setCatalog(entries); setError(null); }
    } catch (error) {
      if (identity.current === owner && revision === version.current) setError(errorCopy(error));
    } finally { if (identity.current === owner && revision === version.current) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    setData(null); setCatalog([]); setError(null); setLoading(false);
    void refreshMember();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void refreshMember(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active' || Platform.OS === 'web') void refreshMember(); }, 30000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [refreshMember]);
  const mutate = useCallback(async (operation: () => Promise<MemberState>) => {
    const owner = userId;
    if (!owner) { router.push('/account'); return { ok: false as const, reason: 'invalid' as const }; }
    if (pending.current) return { ok: false as const, reason: 'duplicate' as const };
    pending.current = true; setLoading(true); setError(null);
    ++version.current;
    try {
      const value = await operation();
      if (identity.current !== owner) return { ok: false as const, reason: 'invalid' as const };
      setData({ owner, value });
      return { ok: true as const };
    } catch (error) {
      if (identity.current === owner) setError(errorCopy(error));
      return { ok: false as const, reason: 'invalid' as const };
    } finally {
      pending.current = false;
      if (identity.current === owner) setLoading(false);
    }
  }, [userId]);
  const create = (kind: 'session' | 'event' | 'coach', targetId: string, slot = '') =>
    mutate(() => createMemberBooking({ kind, targetId, slot }));
  const cancel = (kind: string, targetId: string, slot = '') => {
    const row = current.bookings.find(b => b.kind === kind && b.targetId === targetId && b.slot === slot && b.status !== 'cancelled' && String(b.status) !== 'partner_cancelled');
    return row ? mutate(() => cancelMemberBooking(row.id)) : Promise.resolve({ ok: false as const, reason: 'notActive' as const });
  };
  // Show the latest record for a target after cancellation/rebooking; keep history on the server.
  const latest = [...current.bookings].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const deduped = [...new Map(latest.map(b => [`${b.kind}:${b.targetId}:${b.slot}`, b])).values()];
  const cancelledAt = (b: MemberBooking) => b.cancelledAt ?? undefined;
  const bookings = deduped.filter(b => b.kind === 'session').map(b => ({
    sessionId: b.targetId, bookedAt: b.createdAt, status: b.status === 'cancelled' || String(b.status) === 'partner_cancelled' ? 'cancelled' as const : 'reserved' as const, cancelledAt: cancelledAt(b),
  }));
  const eventBookings = deduped.filter(b => b.kind === 'event').map(b => ({
    eventId: b.targetId, reservedAt: b.createdAt, status: b.status === 'cancelled' || String(b.status) === 'partner_cancelled' ? 'cancelled' as const : 'reserved' as const, cancelledAt: cancelledAt(b),
  }));
  const coachRequests = deduped.filter(b => b.kind === 'coach').map(b => ({
    coachId: b.targetId, slot: b.slot, requestedAt: b.createdAt, status: b.status === 'cancelled' || String(b.status) === 'partner_cancelled' ? 'cancelled' as const : 'requested' as const, cancelledAt: cancelledAt(b),
  }));
  return {
    bookings, eventBookings, coachRequests, memberError, memberLoading, refreshMember,
    signedIn: !!isSignedIn, memberMemberships: current.memberships, serverBookings: deduped,
    memberProfile: current.profile, bookingCatalog: catalog,
    offeringTime: (kind: string, targetId: string, slot = '') => {
      const o = catalog.find(o => o.kind === kind && o.targetId === targetId && o.slot === slot);
      return o ? dateTime(o.startsAt, language) : 'Sign in to view sample date';
    },
    saveProfile: (gender: 'female' | 'male' | 'unspecified', birthDate: string) => mutate(() => saveMemberProfile({ gender, birthDate })),
    enablePreview: () => mutate(() => enablePreviewMembership({ acknowledgeSampleData: true })),
    bookSession: (id: string) => create('session', id),
    bookEvent: (id: string) => create('event', id),
    requestCoaching: (id: string, slot: string) => create('coach', id, slot),
    joinWaitlist: (offeringId: string) => mutate(() => joinMemberWaitlist(offeringId)),
    leaveWaitlist: (entryId: string) => mutate(() => leaveMemberWaitlist(entryId)),
    acceptWaitlistOffer: (entryId: string) => mutate(() => acceptMemberWaitlistOffer(entryId)),
    waitlists: current.waitlists,
    cancelBooking: (id: string) => cancel('session', id),
    cancelEvent: (id: string) => cancel('event', id),
    cancelCoachRequest: (id: string, slot: string) => cancel('coach', id, slot),
    isSessionBooked: (id: string) => bookings.some(b => b.sessionId === id && b.status === 'reserved'),
    isEventReserved: (id: string) => eventBookings.some(b => b.eventId === id && b.status === 'reserved'),
    activeCoachRequest: (id: string) => coachRequests.find(b => b.coachId === id && b.status === 'requested'),
  };
}
