import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  cancelMemberSubscription,
  createMemberCheckout,
  useGetLivePlans,
  useGetMemberSubscription,
} from '@workspace/api-client-react';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import { ScreenShell, ScreenHeader } from '@/components/ScreenShell';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { dateTime, localize } from '@/lib/content';
import { translate } from '@/lib/i18n';
import { useAuthedResource, type Offering } from '@/lib/live-api';

type Filter = 'all' | 'physical' | 'premium' | 'live';

export default function LiveScreen() {
  const c = useColors();
  const app = useApp();
  const catalog = useAuthedResource<Offering[]>('/member/live-catalog');
  const plans = useGetLivePlans({ query: { enabled: catalog.signedIn } });
  const subscription = useGetMemberSubscription({ query: { enabled: catalog.signedIn } });
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const refreshCatalog = catalog.refresh, refreshPlans = plans.refetch, refreshMember = app.refreshMember;
  useFocusEffect(useCallback(() => { void refreshCatalog(); void refreshPlans(); void subscription.refetch(); void refreshMember(); },
    [refreshCatalog, refreshPlans, subscription.refetch, refreshMember]));

  const live = app.memberMemberships.filter(m => m.scope !== 'preview');
  const items = useMemo(() => (catalog.data ?? []).filter(o => o.active && (filter === 'all' || o.accessType === filter))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [catalog.data, filter]);
  const booked = (o: Offering) => app.serverBookings.some(b => b.kind === o.kind && b.targetId === o.targetId && b.slot === o.slot
    && ['reserved', 'requested', 'confirmed'].includes(b.status));
  const billingBusy = !!busyId?.startsWith('billing:');
  const hasCurrentLiveAccess = live.some(m => ['active', 'trial'].includes(m.status) && Date.parse(m.endsAt) > Date.now());
  const hasUnresolvedPaidAccess = subscription.data?.paymentStatus === 'past_due' ||
    live.some(m => m.source === 'paid' && m.status === 'paused');
  const runWaitlistAction = async (offeringId: string, action: 'join' | 'leave' | 'accept', entryId?: string) => {
    if (busyId) return;
    setBusyId(`waitlist:${offeringId}`); setNotice(null);
    const result = action === 'join'
      ? await app.joinWaitlist(offeringId)
      : action === 'leave'
        ? await app.leaveWaitlist(entryId!)
        : await app.acceptWaitlistOffer(entryId!);
    await Promise.all([app.refreshMember(), catalog.refresh()]);
    setBusyId(null);
    const successMessage = action === 'join' ? t('waitlistJoined') : action === 'leave' ? t('waitlistLeft') : t('waitlistBooked');
    setNotice(result.ok
      ? { tone: 'ok', text: successMessage }
      : { tone: 'err', text: app.memberError ?? t('notSaved') });
  };
  const waitlistStatusKey = (status: string) => ({
    waiting: 'waitlistWaiting', offered: 'waitlistOffered', booked: 'waitlistBooked',
    expired: 'waitlistExpired', ineligible: 'waitlistIneligible', closed: 'waitlistClosed',
  } as const)[status as 'waiting' | 'offered' | 'booked' | 'expired' | 'ineligible' | 'closed'] ?? 'waitlistClosed';
  const bookingStatusKey = (status: string) => ({
    requested: 'bookingStatusRequested', reserved: 'bookingStatusReserved', confirmed: 'bookingStatusConfirmed',
    cancelled: 'bookingStatusCancelled', partner_cancelled: 'bookingStatusPartnerCancelled',
    admin_cancelled: 'bookingStatusAdminCancelled', rejected: 'bookingStatusRejected',
  } as const)[status as 'requested' | 'reserved' | 'confirmed' | 'cancelled' | 'partner_cancelled' | 'admin_cancelled' | 'rejected'] ?? 'bookingStatusCancelled';
  const attendanceStatusKey = (status: string) => ({
    not_checked_in: 'attendanceNotCheckedIn', pending: 'attendanceCheckedIn',
    confirmed: 'attendanceAttended', no_show: 'attendanceNoShow',
    disputed: 'attendanceDisputed', void: 'attendanceVoided',
  } as const)[status as 'not_checked_in' | 'pending' | 'confirmed' | 'no_show' | 'disputed' | 'void'] ?? 'attendanceNotCheckedIn';

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

  const act = async (o: Pick<Offering, 'id' | 'kind' | 'targetId' | 'slot' | 'bookingModel'>, cancel: boolean) => {
    if (busyId) return;
    setBusyId(o.id); setNotice(null);
    const r = cancel
      ? await (o.kind === 'session' ? app.cancelBooking(o.targetId) : o.kind === 'event' ? app.cancelEvent(o.targetId) : app.cancelCoachRequest(o.targetId, o.slot))
      : await (o.kind === 'session' ? app.bookSession(o.targetId) : o.kind === 'event' ? app.bookEvent(o.targetId) : app.requestCoaching(o.targetId, o.slot));
    await Promise.all([app.refreshMember(), catalog.refresh()]);
    setBusyId(null);
    setNotice(r.ok ? {
      tone: 'ok',
      text: cancel ? 'Reservation cancelled.' : o.bookingModel === 'open_access'
        ? 'Walk-in reservation started. Scan the single-use QR shown by partner staff; attendance still requires partner confirmation.'
        : 'Reserved with the partner.',
    } : { tone: 'err', text: app.memberError ?? 'This reservation could not be completed. Check your membership eligibility.' });
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
    <ScrollView contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={catalog.loading || plans.isLoading || subscription.isLoading} onRefresh={() => { void catalog.refresh(); void plans.refetch(); void subscription.refetch(); void app.refreshMember(); }} />}>
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
        const mine = booked(o), full = (o.remaining ?? 1) <= 0;
        const isOpenAccess = o.bookingModel === 'open_access';
        const isResourceBooking = o.bookingModel === 'resource_booking';
        const activityText = (value: { en: string; ar: string; ku: string } | null | undefined) =>
          value?.[app.language]?.trim() || value?.en?.trim() || '';
        const title = activityText(o.localizedTitle) || o.title;
        const checkinOpensAt = o.checkinOpensAt ?? o.walkInOpensAt;
        const checkinClosesAt = o.checkinClosesAt ?? o.walkInClosesAt;
        const audience = o.gender === 'female' ? t('womenOnly') : o.gender === 'male' ? t('menOnly') : '';
        const ageLabel = o.minAge > 0 || o.maxAge !== null
          ? t('ageRangeLabel').replace('{min}', String(o.minAge)).replace('{max}', o.maxAge === null ? '∞' : String(o.maxAge))
          : '';
        const walkInOpen = isOpenAccess && !!o.walkInReady && !!o.walkInOpensAt && !!o.walkInClosesAt
          && Date.now() >= Date.parse(o.walkInOpensAt) && Date.now() < Date.parse(o.walkInClosesAt);
        const waitlistEntry = isResourceBooking ? undefined : [...app.waitlists].filter(entry => entry.offeringId === o.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        const activeWaitlistEntry = waitlistEntry && ['waiting', 'offered'].includes(waitlistEntry.status) ? waitlistEntry : undefined;
        const canJoinWaitlist = !isOpenAccess && !isResourceBooking && full && o.kind === 'session' && !activeWaitlistEntry && !mine && !o.additionalPayment;
        const waitlistBusy = busyId === `waitlist:${o.id}`;
        return <View key={o.id} style={[styles.card, { backgroundColor: c.card, borderColor: mine ? c.primary : c.border }]}>
          <View style={styles.between}>
            <Text style={[styles.label, { color: c.primary }]}>{o.accessType === 'live' ? 'Live online' : o.accessType === 'premium' ? 'Premium' : 'Physical'} · {o.kind === 'coach' ? 'Coaching' : o.kind === 'event' ? 'Event' : 'Session'}</Text>
            <Text style={{ color: full ? c.destructive : c.mutedForeground, fontSize: 12, fontWeight: '700' }}>
              {isResourceBooking ? full ? t('resourceUnavailable') : t('resourceAvailable') : full ? 'Full' : `${o.remaining ?? '—'} / ${o.capacity}`}
            </Text>
          </View>
           <Text raw style={{ color: c.foreground, fontSize: 18, fontWeight: '800' }}>{title}</Text>
          <Text raw style={{ color: c.mutedForeground }}>{o.partnerName ?? ''} · {o.facility} · {o.city}</Text>
          {isResourceBooking && o.resourceName ? <Text raw style={{ color: c.primary, fontWeight: '700' }}>{t('resourceLabel')}: {o.resourceName[app.language]}</Text> : null}
          {o.accessType !== 'live' ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            {t('activitySettingFilter')}: {o.environment ? t(o.environment) : t('settingNotListed')}
          </Text> : null}
            <Text style={{ color: c.foreground }}>{t('sessionTime')}: {dateTime(o.startsAt, app.language)} – {dateTime(o.endsAt, app.language, true)}</Text>
           {isOpenAccess
             ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{walkInOpen
               ? t('walkInAvailableNow')
               : o.walkInReady && o.walkInOpensAt ? t('walkInOpensAt').replace('{date}', dateTime(o.walkInOpensAt, app.language, true))
                 : t('walkInNotReady')}</Text>
             : <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Free cancellation until {dateTime(o.cancellationDeadline, app.language)}</Text>}
          {o.additionalPayment ? <Text style={{ color: c.destructive, fontSize: 12, fontWeight: '700' }}>Additional payment required. Booking is unavailable until payments launch.</Text> : null}
           {audience || ageLabel ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{[audience, ageLabel].filter(Boolean).join(' · ')}</Text> : null}
           {o.tiers.length ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{t('membershipRequirement')}: {o.tiers.join(', ')}</Text> : null}
           {o.kind === 'session' ? <View style={[styles.sessionDetails, { borderTopColor: c.border }]}>
             {activityText(o.localizedDescription) ? <Text style={{ color: c.mutedForeground, lineHeight: 19 }}>{t('sessionDescription')}: {activityText(o.localizedDescription)}</Text> : null}
             {activityText(o.localizedInstructor) ? <Text style={{ color: c.mutedForeground }}>{t('instructorName')}: {activityText(o.localizedInstructor)}</Text> : null}
             {o.difficultyLevel ? <Text style={{ color: c.mutedForeground }}>{t('skillLevel')}: {o.difficultyLevel === 'all-levels' ? t('allLevels') : t(o.difficultyLevel)}</Text> : null}
             {activityText(o.requiredEquipment) ? <Text style={{ color: c.mutedForeground, lineHeight: 19 }}>{t('requiredEquipment')}: {activityText(o.requiredEquipment)}</Text> : null}
             {o.instructions?.trim() ? <Text style={{ color: c.mutedForeground, lineHeight: 19 }}>{t('participantInstructions')}: {o.instructions}</Text> : null}
             {activityText(o.healthSafetyInstructions) ? <Text style={{ color: c.foreground, lineHeight: 19, fontWeight: '700' }}>{t('healthSafetyInstructions')}: {activityText(o.healthSafetyInstructions)}</Text> : null}
             {activityText(o.accessibilityInformation) ? <Text style={{ color: c.mutedForeground, lineHeight: 19 }}>{t('accessibilityInformation')}: {activityText(o.accessibilityInformation)}</Text> : null}
             {checkinOpensAt && checkinClosesAt ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
               {t('checkinWindow').replace('{opens}', dateTime(checkinOpensAt, app.language, true)).replace('{closes}', dateTime(checkinClosesAt, app.language, true))}
             </Text> : null}
           </View> : null}
          {activeWaitlistEntry ? <>
            <Text style={{ color: activeWaitlistEntry.status === 'offered' ? c.primary : c.mutedForeground, fontWeight: '700' }}>
              {t(waitlistStatusKey(activeWaitlistEntry.status))} · {t('waitlistPosition').replace('{n}', String(activeWaitlistEntry.queuePosition))}
            </Text>
            {activeWaitlistEntry.status === 'offered' && activeWaitlistEntry.offerExpiresAt ? <>
              <Text style={{ color: c.destructive, fontSize: 12 }}>
                {t('waitlistDeadline').replace('{date}', dateTime(activeWaitlistEntry.offerExpiresAt, app.language, true))}
              </Text>
              <Pressable testID={`live-waitlist-accept-${o.id}`} accessibilityRole="button" disabled={!!busyId}
                onPress={() => void runWaitlistAction(o.id, 'accept', activeWaitlistEntry.id)}
                style={[styles.cta, { backgroundColor: c.primary, opacity: waitlistBusy ? .55 : 1 }]}>
                <Text style={{ color: c.primaryForeground, fontWeight: '700' }}>{waitlistBusy ? 'Working…' : t('waitlistAccept')}</Text>
              </Pressable>
            </> : null}
            <Pressable testID={`live-waitlist-leave-${o.id}`} accessibilityRole="button" disabled={!!busyId}
              onPress={() => void runWaitlistAction(o.id, 'leave', activeWaitlistEntry.id)}
              style={[styles.cta, { backgroundColor: c.secondary, opacity: waitlistBusy ? .55 : 1 }]}>
              <Text style={{ color: c.secondaryForeground, fontWeight: '700' }}>{t('waitlistLeave')}</Text>
            </Pressable>
          </> : <>
            {waitlistEntry && !['left'].includes(waitlistEntry.status) ? <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{t(waitlistStatusKey(waitlistEntry.status))}</Text> : null}
            <Pressable testID={full && o.kind === 'session' && !isOpenAccess && !isResourceBooking ? `live-waitlist-join-${o.id}` : `live-book-${o.id}`}
              accessibilityRole="button" disabled={!!busyId || (!mine && !canJoinWaitlist && (full || o.additionalPayment || (isOpenAccess && !walkInOpen)))}
              onPress={() => full && o.kind === 'session' && !isOpenAccess && !isResourceBooking ? void runWaitlistAction(o.id, 'join') : void act(o, mine)}
              style={[styles.cta, { backgroundColor: mine ? c.secondary : c.primary, opacity: busyId === o.id || waitlistBusy || (!mine && (full || (isOpenAccess && !walkInOpen))) ? .55 : 1 }]}>
              <Text style={{ color: mine ? c.secondaryForeground : c.primaryForeground, fontWeight: '700' }}>
                {busyId === o.id || waitlistBusy ? 'Working…' : mine ? isOpenAccess ? t('cancelWalkIn') : 'Cancel reservation'
                  : isOpenAccess ? walkInOpen ? t('startWalkIn') : t('walkInUnavailable')
                    : isResourceBooking ? full ? t('resourceUnavailable') : t('reserveResource')
                      : full ? o.kind === 'session' ? t('waitlistJoin') : 'Full' : o.additionalPayment ? 'Unavailable' : 'Reserve'}
              </Text>
            </Pressable>
          </>}
        </View>;
      })}

      {(() => {
        // History is account-owned, not derived from the currently published catalogue.
        const mine = app.serverBookings.filter(b => b.scope === 'live');
        return mine.length ? <>
          <Text style={[styles.label, { color: c.mutedForeground, marginTop: 10 }]}>YOUR LIVE RESERVATIONS</Text>
          {mine.map(b => { const o = catalog.data?.find(x => x.kind === b.kind && x.targetId === b.targetId && x.slot === b.slot); const st = b.status;
            const terminal = !['requested', 'reserved', 'confirmed'].includes(st);
            return <View key={b.id} style={[styles.card, { backgroundColor: c.card, borderColor: ['partner_cancelled', 'admin_cancelled', 'rejected'].includes(st) ? c.destructive : c.border }]}>
              <Text raw style={{ color: c.foreground, fontWeight: '700' }}>{o?.title ?? b.title}</Text>
              {b.bookingModel === 'resource_booking' && b.resourceName ? <Text raw style={{ color: c.primary, fontWeight: '700' }}>{t('resourceLabel')}: {b.resourceName[app.language]}</Text> : null}
              <Text style={{ color: c.mutedForeground }}>{dateTime(b.startsAt, app.language)}</Text>
              <Text style={{ color: terminal ? c.mutedForeground : c.primary, fontWeight: '700', fontSize: 12 }}>
                {t(bookingStatusKey(st))} · {t(attendanceStatusKey(b.attendanceStatus))}</Text>
              {['open_access', 'resource_booking'].includes(b.bookingModel) && ['reserved', 'confirmed'].includes(st)
                && b.attendanceStatus === 'not_checked_in' && <Pressable accessibilityRole="button" onPress={() => router.push('/checkin')}>
                <Text style={{ color: c.primary, fontWeight: '700' }}>{t('scanPartnerQr')}</Text>
              </Pressable>}
              {!o && ['reserved', 'requested', 'confirmed'].includes(st) && ['session', 'event', 'coach'].includes(b.kind) && b.bookingModel !== 'open_access' ? <Pressable accessibilityRole="button" disabled={!!busyId}
                onPress={() => void act({ id: b.id, kind: b.kind as Offering['kind'], targetId: b.targetId, slot: b.slot, bookingModel: b.bookingModel }, true)}>
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
  sessionDetails: { borderTopWidth: 1, marginTop: 4, paddingTop: 10, gap: 7 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cta: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6, paddingHorizontal: 14 },
  skeleton: { height: 150, borderRadius: 18 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 18, padding: 26, alignItems: 'center', gap: 8 },
});
