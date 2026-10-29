import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  cancelMemberSubscription,
  createMemberCheckout,
  getGetMemberWaitlistQueryKey,
  useGetMemberWaitlist,
  useGetLivePlans,
  useJoinMemberWaitlist,
  useLeaveMemberWaitlist,
  useGetMemberSubscription,
} from '@workspace/api-client-react';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import { ScreenShell, ScreenHeader } from '@/components/ScreenShell';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { dateTime, localize } from '@/lib/content';
import { useAuthedResource, type Offering } from '@/lib/live-api';
import { translate, type MessageKey } from '@/lib/i18n';

type Filter = 'all' | 'physical' | 'premium' | 'live';

export default function LiveScreen() {
  const c = useColors();
  const app = useApp();
  const t = (key: MessageKey) => translate(app.language, key);
  const catalog = useAuthedResource<Offering[]>('/member/live-catalog');
  const plans = useGetLivePlans({ query: { enabled: catalog.signedIn } });
  const subscription = useGetMemberSubscription({ query: { enabled: catalog.signedIn } });
  const waitlist = useGetMemberWaitlist({ query: { enabled: catalog.signedIn, refetchInterval: 30_000 } });
  const joinQueue = useJoinMemberWaitlist();
  const leaveQueue = useLeaveMemberWaitlist();
  const seenPromotions = useRef(new Set<string>());
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const refreshCatalog = catalog.refresh, refreshPlans = plans.refetch, refreshMember = app.refreshMember;
  useFocusEffect(useCallback(() => { void refreshCatalog(); void refreshPlans(); void subscription.refetch(); void refreshMember(); void waitlist.refetch(); },
    [refreshCatalog, refreshPlans, subscription.refetch, refreshMember, waitlist.refetch]));
  useEffect(() => {
    const newPromotion = waitlist.data?.find(entry => entry.status === 'promoted' && !seenPromotions.current.has(entry.id));
    if (!newPromotion) return;
    seenPromotions.current.add(newPromotion.id);
    setNotice({ tone: 'ok', text: t('waitlistPromotionNotice') });
    void Promise.all([app.refreshMember(), catalog.refresh()]);
  }, [waitlist.data, app.refreshMember, catalog.refresh, app.language]);

  const live = app.memberMemberships.filter(m => m.scope !== 'preview');
  const items = useMemo(() => (catalog.data ?? []).filter(o => o.active && (filter === 'all' || o.accessType === filter))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [catalog.data, filter]);
  const booked = (o: Offering) => app.serverBookings.some(b => b.kind === o.kind && b.targetId === o.targetId && b.slot === o.slot && b.status !== 'cancelled' && String(b.status) !== 'partner_cancelled');
  const billingBusy = !!busyId?.startsWith('billing:');
  const hasCurrentLiveAccess = live.some(m => ['active', 'trial'].includes(m.status) && Date.parse(m.endsAt) > Date.now());
  const hasUnresolvedPaidAccess = subscription.data?.paymentStatus === 'past_due' ||
    live.some(m => m.source === 'paid' && m.status === 'paused');

  const startCheckout = async (plan: NonNullable<typeof plans.data>[number]) => {
    if (billingBusy || !plan.purchasable || hasCurrentLiveAccess || hasUnresolvedPaidAccess) return;
    setBusyId(`billing:${plan.id}`); setNotice(null);
    try {
      const result = await createMemberCheckout({ planId: plan.id });
      await WebBrowser.openBrowserAsync(result.purchaseUrl);
      await Promise.all([plans.refetch(), subscription.refetch(), app.refreshMember()]);
    } catch {
      setNotice({ tone: 'err', text: 'Checkout could not be opened. Try again.' });
    } finally { setBusyId(null); }
  };

  const cancelSubscription = () => Alert.alert(
    localize('Cancel subscription?', app.language),
    localize('Renewal will stop at the end of the current billing period. Your paid access remains active until then.', app.language),
    [
      { text: localize('Keep subscription', app.language), style: 'cancel' },
      { text: localize('Cancel renewal', app.language), style: 'destructive', onPress: () => {
        setBusyId('billing:cancel'); setNotice(null);
        void cancelMemberSubscription()
          .then(async () => {
            setNotice({ tone: 'ok', text: 'Renewal is cancelled. Access remains active through the current period.' });
            await Promise.all([subscription.refetch(), app.refreshMember()]);
          })
          .catch(() => setNotice({ tone: 'err', text: 'Subscription could not be cancelled. Try again.' }))
          .finally(() => setBusyId(null));
      } },
    ],
  );

  const act = async (o: Pick<Offering, 'id' | 'kind' | 'targetId' | 'slot'>, cancel: boolean) => {
    if (busyId) return;
    setBusyId(o.id); setNotice(null);
    const r = cancel
      ? await (o.kind === 'session' ? app.cancelBooking(o.targetId) : o.kind === 'event' ? app.cancelEvent(o.targetId) : app.cancelCoachRequest(o.targetId, o.slot))
      : await (o.kind === 'session' ? app.bookSession(o.targetId) : o.kind === 'event' ? app.bookEvent(o.targetId) : app.requestCoaching(o.targetId, o.slot));
    await Promise.all([app.refreshMember(), catalog.refresh()]);
    setBusyId(null);
    setNotice(r.ok ? { tone: 'ok', text: cancel ? 'Reservation cancelled.' : 'Reserved with the partner.' } : { tone: 'err', text: app.memberError ?? 'This reservation could not be completed. Check your membership eligibility.' });
  };

  const changeWaitlist = async (offering: Offering, entryId?: string) => {
    if (busyId) return;
    setBusyId(`waitlist:${offering.id}`);
    setNotice(null);
    try {
      if (entryId) {
        await leaveQueue.mutateAsync({ id: entryId });
        setNotice({ tone: 'ok', text: t('waitlistLeft') });
      } else {
        const entry = await joinQueue.mutateAsync({ data: { offeringId: offering.id } });
        setNotice({ tone: 'ok', text: t('waitlistJoined').replace('{n}', String(entry.position ?? '—')) });
      }
      await Promise.all([
        waitlist.refetch(),
        catalog.refresh(),
        app.refreshMember(),
      ]);
    } catch (error) {
      setNotice({ tone: 'err', text: error instanceof Error ? error.message : t('waitlistLoadError') });
    } finally {
      setBusyId(null);
    }
  };

  if (!catalog.signedIn) return <ScreenShell>
    <ScreenHeader eyebrow="LIVE AVAILABILITY" title="Real partner sessions" />
    <View style={styles.pad}>
      <Text style={{ color: c.mutedForeground, lineHeight: 21 }}>Approved partner availability is shown only to signed-in members.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={[styles.cta, { backgroundColor: c.primary }]}><Text style={{ color: c.primaryForeground, fontWeight: '700' }}>Sign in</Text></Pressable>
    </View>
  </ScreenShell>;

  return <ScreenShell>
    <ScreenHeader eyebrow="LIVE AVAILABILITY" title="Real partner sessions" />
    <ScrollView contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={catalog.loading || plans.isLoading || subscription.isLoading || waitlist.isFetching} onRefresh={() => { void catalog.refresh(); void plans.refetch(); void subscription.refetch(); void app.refreshMember(); void waitlist.refetch(); }} />}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.row}><Ionicons name="chevron-back" size={16} color={c.primary} /><Text style={{ color: c.primary }}>Back</Text></Pressable>
      <View style={[styles.banner, { backgroundColor: c.accent }]}>
        <View style={[styles.dot, { backgroundColor: c.primary }]} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: c.accentForeground, fontWeight: '800' }}>Approved real availability</Text>
          <Text style={{ color: c.accentForeground, lineHeight: 19 }}>Everything on this page is published by an approved partner. The rest of the app shows fictional sample listings.</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.label, { color: c.mutedForeground }]}>YOUR LIVE ACCESS</Text>
        {live.length ? live.map(m => <Text key={m.scope + m.tier} style={{ color: c.foreground, fontWeight: '700' }}>{m.source === 'corporate' ? 'Corporate' : m.source === 'trial' ? 'Trial' : 'Paid membership'} · {m.tier} · {m.status} · {dateTime(m.endsAt, app.language, true)}</Text>)
          : <Text style={{ color: c.foreground, lineHeight: 20 }}>No live membership yet. Trial and company access are granted by MaydanGO staff. Paid plans appear below when checkout is enabled.</Text>}
        {subscription.data?.recoveryUrl ? <>
          <Text style={{ color: c.destructive, lineHeight: 20 }}>
            {subscription.data.paymentStatus === 'past_due'
              ? 'Payment needs attention. Paid booking access is paused until the provider confirms payment.'
              : 'Complete the payment verification to finish setting up your membership.'}
          </Text>
          {subscription.data.recoveryUrl ? <Pressable accessibilityRole="button" disabled={billingBusy}
            onPress={() => void WebBrowser.openBrowserAsync(subscription.data!.recoveryUrl!)}>
            <Text style={{ color: c.primary, fontWeight: '700' }}>Resolve payment</Text>
          </Pressable> : null}
        </> : null}
        {subscription.data?.cancelAtPeriodEnd && subscription.data.periodEndsAt ? <Text style={{ color: c.mutedForeground }}>Renewal is cancelled. Access ends {dateTime(subscription.data.periodEndsAt, app.language, true)}.</Text> : null}
        {subscription.data && !subscription.data.cancelAtPeriodEnd && ['active', 'past_due'].includes(subscription.data.status) ?
          <Pressable accessibilityRole="button" disabled={billingBusy} onPress={cancelSubscription}
            style={[styles.cta, { backgroundColor: c.secondary, opacity: billingBusy ? .55 : 1 }]}>
            <Text style={{ color: c.secondaryForeground, fontWeight: '700' }}>{busyId === 'billing:cancel' ? 'Working…' : 'Cancel subscription renewal'}</Text>
          </Pressable> : null}
      </View>

      <View style={styles.chips}>
        {(['all', 'physical', 'premium', 'live'] as Filter[]).map(f => <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: filter === f }} onPress={() => setFilter(f)}
          style={[styles.chip, { backgroundColor: filter === f ? c.primary : c.secondary }]}>
          <Text style={{ color: filter === f ? c.primaryForeground : c.secondaryForeground, fontWeight: '700', fontSize: 13 }}>{f === 'all' ? 'All' : f === 'physical' ? 'Physical' : f === 'premium' ? 'Premium' : 'Live online'}</Text>
        </Pressable>)}
      </View>

      {notice ? <Text accessibilityRole="alert" style={{ color: notice.tone === 'ok' ? c.primary : c.destructive, fontWeight: '600' }}>{notice.text}</Text> : null}

      {catalog.error ? <View style={[styles.card, { backgroundColor: c.card, borderColor: c.destructive }]}>
        <Text style={{ color: c.destructive }}>{catalog.error}</Text>
        <Pressable accessibilityRole="button" onPress={() => void catalog.refresh()}><Text style={{ color: c.primary, fontWeight: '700' }}>Try again</Text></Pressable>
      </View> : !catalog.data ? [0, 1, 2].map(i => <View key={i} style={[styles.skeleton, { backgroundColor: c.muted }]} />)
      : !items.length ? <View style={[styles.empty, { borderColor: c.border }]}>
        <Ionicons name="calendar-outline" size={26} color={c.mutedForeground} />
        <Text style={{ color: c.foreground, fontWeight: '700', textAlign: 'center' }}>No approved availability yet</Text>
        <Text style={{ color: c.mutedForeground, textAlign: 'center', lineHeight: 19 }}>Partners are being onboarded. Pull to refresh or browse sample listings meanwhile.</Text>
      </View> : items.map(o => {
        const mine = booked(o), full = (o.remaining ?? 1) <= 0 || (!mine && o.additionalPayment);
        const queueEntry = waitlist.data?.find(entry => entry.offeringId === o.id && entry.status === 'waiting');
        const canWaitlist = full && !mine && !o.additionalPayment && o.scope === 'live' && o.kind !== 'coach';
        const actionBusy = busyId === o.id || busyId === `waitlist:${o.id}`;
        return <View key={o.id} style={[styles.card, { backgroundColor: c.card, borderColor: mine ? c.primary : c.border }]}>
          <View style={styles.between}>
            <Text style={[styles.label, { color: c.primary }]}>{o.accessType === 'live' ? 'Live online' : o.accessType === 'premium' ? 'Premium' : 'Physical'} · {o.kind === 'coach' ? 'Coaching' : o.kind === 'event' ? 'Event' : 'Session'}</Text>
            <Text style={{ color: full ? c.destructive : c.mutedForeground, fontSize: 12, fontWeight: '700' }}>
              {queueEntry ? t('waitlistPosition').replace('{n}', String(queueEntry.position ?? '—')) : full ? 'Full' : `${o.remaining ?? '—'} / ${o.capacity}`}
            </Text>
          </View>
          <Text raw style={{ color: c.foreground, fontSize: 18, fontWeight: '800' }}>{o.title}</Text>
          <Text raw style={{ color: c.mutedForeground }}>{o.partnerName ?? ''} · {o.facility} · {o.city}</Text>
          <Text style={{ color: c.foreground }}>{dateTime(o.startsAt, app.language)}</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Free cancellation until {dateTime(o.cancellationDeadline, app.language)}</Text>
          {o.additionalPayment ? <Text style={{ color: c.destructive, fontSize: 12, fontWeight: '700' }}>Additional payment required. Booking is unavailable until payments launch.</Text> : null}
          {o.gender !== 'all' || o.minAge > 0 || o.maxAge !== null ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{o.gender === 'female' ? 'Women only' : o.gender === 'male' ? 'Men only' : 'Everyone'} · {o.minAge}{o.maxAge !== null ? `–${o.maxAge}` : '+'}</Text> : null}
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Tiers: {o.tiers.join(', ')}</Text>
          <Pressable testID={`live-book-${o.id}`} accessibilityRole="button"
            disabled={!!busyId || (!mine && full && !canWaitlist) || (!!queueEntry && !canWaitlist)}
            onPress={() => queueEntry
              ? void changeWaitlist(o, queueEntry.id)
              : canWaitlist
                ? void changeWaitlist(o)
                : void act(o, mine)}
            style={[styles.cta, { backgroundColor: mine || queueEntry ? c.secondary : c.primary, opacity: actionBusy || (!mine && full && !canWaitlist) ? .55 : 1 }]}>
            <Text style={{ color: mine || queueEntry ? c.secondaryForeground : c.primaryForeground, fontWeight: '700' }}>
              {actionBusy ? 'Working…' : mine ? 'Cancel reservation' : queueEntry ? t('waitlistLeave') : canWaitlist ? t('waitlistJoin') : full ? 'Full' : 'Reserve'}
            </Text>
          </Pressable>
        </View>;
      })}

      {waitlist.error ? <Text accessibilityRole="alert" style={{ color: c.destructive }}>{t('waitlistLoadError')}</Text> : null}
      <View style={styles.between}>
        <Text style={[styles.label, { color: c.mutedForeground, marginTop: 10 }]}>{t('waitlistTitle')}</Text>
        <Ionicons name="time-outline" size={18} color={c.primary} />
      </View>
      {waitlist.data?.length ? waitlist.data.map(entry => (
        <View key={entry.id} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ color: c.foreground, fontWeight: '800' }} numberOfLines={2}>
            {entry.localizedTitle?.[app.language] || localize(entry.title, app.language)}
          </Text>
          <Text style={{ color: c.mutedForeground }}>{localize(entry.facility, app.language)} · {localize(entry.city, app.language)}</Text>
          <Text style={{ color: c.mutedForeground }}>{dateTime(entry.startsAt, app.language)}</Text>
          <Text style={{ color: entry.status === 'cancelled' ? c.destructive : c.primary, fontWeight: '700' }}>
            {entry.status === 'waiting'
              ? t('waitlistPosition').replace('{n}', String(entry.position ?? '—'))
              : entry.status === 'promoted' ? t('waitlistPromoted') : t('waitlistCancelled')}
          </Text>
          {entry.status === 'waiting' ? <Pressable accessibilityRole="button" disabled={!!busyId}
            onPress={() => {
              const offering = catalog.data?.find(item => item.id === entry.offeringId);
              if (offering) void changeWaitlist(offering, entry.id);
            }}>
            <Text style={{ color: c.primary, fontWeight: '700' }}>{t('waitlistLeave')}</Text>
          </Pressable> : null}
        </View>
      )) : !waitlist.isLoading ? <Text style={{ color: c.mutedForeground }}>{t('waitlistEmpty')}</Text> : null}

      {(() => {
        // History is account-owned, not derived from the currently published catalogue.
        const mine = app.serverBookings.filter(b => b.scope === 'live');
        return mine.length ? <>
          <Text style={[styles.label, { color: c.mutedForeground, marginTop: 10 }]}>YOUR LIVE RESERVATIONS</Text>
          {mine.map(b => { const o = catalog.data?.find(x => x.kind === b.kind && x.targetId === b.targetId && x.slot === b.slot); const st = String(b.status);
            return <View key={b.id} style={[styles.card, { backgroundColor: c.card, borderColor: st === 'partner_cancelled' ? c.destructive : c.border }]}>
              <Text raw style={{ color: c.foreground, fontWeight: '700' }}>{o?.title ?? b.title}</Text>
              <Text style={{ color: c.mutedForeground }}>{dateTime(b.startsAt, app.language)}</Text>
              <Text style={{ color: st === 'partner_cancelled' ? c.destructive : st === 'cancelled' ? c.mutedForeground : c.primary, fontWeight: '700', fontSize: 12 }}>
                {st === 'partner_cancelled' ? 'Cancelled by partner. Your visit was returned.' : st === 'cancelled' ? 'Cancelled by you' : 'Reserved'}</Text>
              {!o && ['reserved', 'requested'].includes(st) && ['session', 'event', 'coach'].includes(b.kind) ? <Pressable accessibilityRole="button" disabled={!!busyId}
                onPress={() => void act({ id: b.id, kind: b.kind as Offering['kind'], targetId: b.targetId, slot: b.slot }, true)}>
                <Text style={{ color: c.primary }}>Cancel reservation</Text>
              </Pressable> : null}
            </View>; })}
        </> : null; })()}
      <Text style={[styles.label, { color: c.mutedForeground, marginTop: 10 }]}>MEMBERSHIP PLANS</Text>
      {(plans.data ?? []).map(p => <View key={p.id} style={[styles.card, { backgroundColor: c.secondary, borderColor: c.border }]}>
        <View style={styles.between}><Text raw style={{ color: c.foreground, fontWeight: '800' }}>{p.name}</Text><Text style={{ color: c.primary, fontWeight: '700' }}>{p.tier}</Text></View>
        <Text style={{ color: c.mutedForeground }}>{p.kind === 'paid' ? 'Paid plan' : p.kind === 'trial' ? 'Trial' : 'Corporate'} · {p.durationDays} days · {p.rules.quota} visits{p.priceLabel ? ` · ${p.priceLabel}` : ''}</Text>
        {p.kind === 'paid' ? p.purchasable ?
          <Pressable accessibilityRole="button" disabled={billingBusy || hasCurrentLiveAccess || hasUnresolvedPaidAccess}
            onPress={() => void startCheckout(p)}
            style={[styles.cta, { backgroundColor: c.primary, opacity: billingBusy || hasCurrentLiveAccess || hasUnresolvedPaidAccess ? .55 : 1 }]}>
            <Text style={{ color: c.primaryForeground, fontWeight: '700' }}>
              {busyId === `billing:${p.id}` ? 'Opening checkout…' : hasUnresolvedPaidAccess ? 'Resolve payment' : hasCurrentLiveAccess ? 'Current membership active' : 'Buy membership'}
            </Text>
          </Pressable>
          : <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{p.availabilityMessage ?? 'Paid checkout is not enabled yet. No charge or access activation can occur until payment and payout checks are complete.'}</Text>
          : null}
      </View>)}
      {plans.data && !plans.data.length ? <Text style={{ color: c.mutedForeground }}>No plans published yet.</Text> : null}
      {plans.error ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Membership plans could not be loaded. Try again.</Text> : null}
    </ScrollView>
  </ScreenShell>;
}
const styles = StyleSheet.create({
  pad: { padding: 20, paddingBottom: 60, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  banner: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 18, alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 6 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cta: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6, paddingHorizontal: 14 },
  skeleton: { height: 150, borderRadius: 18 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 18, padding: 26, alignItems: 'center', gap: 8 },
});
