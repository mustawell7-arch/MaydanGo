import React from 'react';
import { Image, ImageSourcePropType, ScrollView, StyleSheet, View } from 'react-native';
import { Text, Pressable } from '@/components/Localized';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { LocalNotice } from '@/components/LocalNotice';
import { MemberNotice } from '@/components/MemberNotice';
import { coaches, cities, facilities, getCityLabel, pick, sessions } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate, type MessageKey } from '@/lib/i18n';
import { dateTime } from '@/lib/content';
import { cityIdForFacility, facilityText } from '@/lib/facility-content';

type Row = {
  key: string;
  image?: ImageSourcePropType;
  when: string;
  title: string;
  meta: string;
  status: 'reserved' | 'requested' | 'cancelled';
  onCancel: () => void;
  cancelLabel: string;
  canCancel?: boolean;
  cancelHint?: string;
};

export default function BookingsScreen() {
  const colors = useColors();
  const app = useApp();
  const t = (key: MessageKey) => translate(app.language, key);
  const align = app.language === 'en' ? 'left' : 'right';

  const sessionRows: Row[] = app.bookings.flatMap((b) => {
    const s = sessions.find((x) => x.id === b.sessionId);
    if (!s) return [];
    const facility = facilities.find((f) => f.id === s.facilityId);
    return [{
      key: `s-${b.sessionId}`, image: s.image, when: dateTime(app.serverBookings.find(r => r.kind === 'session' && r.targetId === b.sessionId)!.startsAt, app.language), title: s.title,
      meta: s.mode === 'online' ? `${t('onlineTag')} · ${s.instructor}` : `${facility?.name ?? ''} · ${s.instructor}`,
      status: b.status, onCancel: () => app.cancelBooking(b.sessionId), cancelLabel: t('cancelBooking'),
    }];
  });
  const eventRows: Row[] = app.serverBookings.flatMap(booking => {
    if (booking.kind !== 'event' || booking.scope !== 'live') return [];
    const cityId = cityIdForFacility(booking.city);
    const city = cities.find(item => item.id === cityId);
    return [{
      key: `e-${booking.targetId}`,
      when: dateTime(booking.startsAt, app.language),
      title: booking.localizedTitle ? facilityText(booking.localizedTitle, app.language) : booking.title,
      meta: `${booking.facility} · ${city ? getCityLabel(city.id, app.language) : booking.city}`,
      status: booking.status === 'cancelled' || String(booking.status) === 'partner_cancelled' ? 'cancelled' as const : 'reserved' as const,
      onCancel: () => app.cancelEvent(booking.targetId),
      cancelLabel: t('cancelReservation'),
      canCancel: Date.parse(booking.cancellationDeadline) > Date.now(),
      cancelHint: Date.parse(booking.cancellationDeadline) <= Date.now() ? t('eventCancelDeadlinePassed') : undefined,
    }];
  });
  const coachRows: Row[] = app.coachRequests.flatMap((r) => {
    const c = coaches.find((x) => x.id === r.coachId);
    const slot = c?.slots.find((s) => s.id === r.slot);
    if (!c || !slot) return [];
    return [{
      key: `c-${r.coachId}-${r.slot}`, image: c.image, when: dateTime(app.serverBookings.find(b => b.kind === 'coach' && b.targetId === r.coachId && b.slot === r.slot)!.startsAt, app.language), title: c.name,
      meta: c.specialty, status: r.status, onCancel: () => app.cancelCoachRequest(r.coachId, r.slot), cancelLabel: t('cancelRequest'),
    }];
  });
  const waitlistRows = [...app.waitlists]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
  const waitlistUpdateRows = app.waitlistUpdates.slice(0, 20);
  const activeCount = [...sessionRows, ...eventRows, ...coachRows].filter((r) => r.status !== 'cancelled').length;
  const hasAny = sessionRows.length + eventRows.length + coachRows.length + waitlistRows.length + waitlistUpdateRows.length > 0;

  const statusLabel = (s: Row['status']) => (s === 'reserved' ? t('statusReserved') : s === 'requested' ? t('statusRequested') : t('statusCancelled'));
  const waitlistStatusLabel = (status: string) => t(({
    waiting: 'waitlistWaiting', offered: 'waitlistOffered', booked: 'waitlistBooked',
    expired: 'waitlistExpired', left: 'waitlistLeft', ineligible: 'waitlistIneligible', closed: 'waitlistClosed',
  } as Record<string, MessageKey>)[status] ?? 'waitlistClosed');
  const waitlistUpdateLabel = (kind: string) => t(({
    waitlist_offer: 'waitlistUpdateOffered',
    waitlist_expired: 'waitlistUpdateExpired',
    waitlist_booked: 'waitlistUpdateBooked',
  } as Record<string, MessageKey>)[kind] ?? 'waitlistUpdateOffered');

  const section = (title: MessageKey, rows: Row[]) => {
    if (!rows.length) return null;
    const ordered = [...rows.filter((r) => r.status !== 'cancelled'), ...rows.filter((r) => r.status === 'cancelled')];
    return (
      <View style={{ marginBottom: 8 }}>
        <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{t(title)}</Text>
        {ordered.map((row) => {
          const cancelled = row.status === 'cancelled';
          const dot = cancelled ? colors.mutedForeground : row.status === 'requested' ? '#c9962f' : '#4e9664';
          return (
            <View key={row.key} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: cancelled ? 0.62 : 1 }]}>
              {row.image ? <Image source={row.image} style={styles.thumb} /> : (
                <View style={[styles.thumb, styles.eventThumb, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.when, { color: colors.primary, textAlign: align }]}>{row.when}</Text>
                <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{row.title}</Text>
                <Text style={[styles.meta, { color: colors.mutedForeground, textAlign: align }]} numberOfLines={1}>{row.meta}</Text>
                {row.cancelHint ? <Text style={[styles.meta, { color: colors.mutedForeground, textAlign: align }]}>{row.cancelHint}</Text> : null}
                <View style={styles.footer}>
                  <View style={styles.statusPill}>
                    <View style={[styles.dot, { backgroundColor: dot }]} />
                    <Text style={[styles.statusText, { color: colors.mutedForeground }]}>{statusLabel(row.status)}</Text>
                  </View>
                  {!cancelled && row.canCancel !== false ? (
                    <Pressable disabled={app.memberLoading} accessibilityRole="button" accessibilityLabel={`${row.cancelLabel}: ${row.title}`} onPress={row.onCancel} hitSlop={6} style={styles.cancelButton}>
                      <Text style={[styles.cancelText, { color: colors.destructive }]}>{t('cancel')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <ScreenShell>
      <ScreenHeader eyebrow={getCityLabel(app.selectedCityId, app.language)} title={t('bookings')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MemberNotice />
        <View style={[styles.countCard, { backgroundColor: colors.primary }]}>
          <View style={styles.calendarMark}>
            <Ionicons name="calendar-outline" size={21} color={colors.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.countLabel, { textAlign: align }]}>{t('upcoming')}</Text>
            <Text style={[styles.countValue, { textAlign: align }]}>{activeCount.toString().padStart(2, '0')}</Text>
          </View>
          <Text style={styles.countFoot}>{t('bookingsFoot')}</Text>
        </View>
        {hasAny ? (
          <>
            {waitlistRows.length ? <View style={{ marginBottom: 8 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{t('waitlistSection')}</Text>
              {waitlistRows.map((entry) => {
                const actionable = entry.status === 'waiting' || entry.status === 'offered';
                return <View key={entry.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.when, { color: colors.primary, textAlign: align }]}>{dateTime(entry.startsAt, app.language)}</Text>
                    <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{entry.title}</Text>
                    <Text style={[styles.meta, { color: colors.mutedForeground, textAlign: align }]}>
                      {waitlistStatusLabel(entry.status)}
                      {['waiting', 'offered'].includes(entry.status) ? ` · ${t('waitlistPosition').replace('{n}', String(entry.queuePosition))}` : ''}
                    </Text>
                    {entry.status === 'offered' && entry.offerExpiresAt ? <Text style={[styles.meta, { color: colors.destructive, textAlign: align }]}>
                      {t('waitlistDeadline').replace('{date}', dateTime(entry.offerExpiresAt, app.language, true))}
                    </Text> : null}
                    {actionable ? <View style={styles.footer}>
                      {entry.status === 'offered' ? <Pressable disabled={app.memberLoading} accessibilityRole="button"
                        accessibilityLabel={`${t('waitlistAccept')}: ${entry.title}`}
                        onPress={() => void app.acceptWaitlistOffer(entry.id)} hitSlop={6} style={styles.cancelButton}>
                        <Text style={[styles.cancelText, { color: colors.primary }]}>{t('waitlistAccept')}</Text>
                      </Pressable> : null}
                      <Pressable disabled={app.memberLoading} accessibilityRole="button"
                        accessibilityLabel={`${t('waitlistLeave')}: ${entry.title}`}
                        onPress={() => void app.leaveWaitlist(entry.id)} hitSlop={6} style={styles.cancelButton}>
                        <Text style={[styles.cancelText, { color: colors.destructive }]}>{t('waitlistLeave')}</Text>
                      </Pressable>
                    </View> : null}
                  </View>
                </View>;
              })}
            </View> : null}
            {waitlistUpdateRows.length ? <View style={{ marginBottom: 8 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{t('waitlistUpdateSection')}</Text>
              {waitlistUpdateRows.map((update) => <View key={update.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.thumb, styles.eventThumb, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="notifications-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.when, { color: colors.primary, textAlign: align }]}>{dateTime(update.createdAt, app.language)}</Text>
                  <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{waitlistUpdateLabel(update.kind)}</Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground, textAlign: align }]}>{update.title}</Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground, textAlign: align }]}>{dateTime(update.startsAt, app.language)}</Text>
                </View>
              </View>)}
            </View> : null}
            {section('classesSection', sessionRows)}
            {section('eventsSection', eventRows)}
            {section('coachingSection', coachRows)}
            <LocalNotice messageKey="notAttendance" icon="shield-checkmark-outline" />
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="calendar-clear-outline" size={25} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('noBookings')}</Text>
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('noBookingsHint')}</Text>
            <Pressable
              onPress={() => router.push('/explore')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.findButton, { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 }]}
            >
              <Text style={[styles.findButtonText, { color: colors.primaryForeground }]}>{t('findClass')}</Text>
              <Ionicons name={app.language === 'en' ? 'arrow-forward' : 'arrow-back'} size={16} color={colors.primaryForeground} />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 36 },
  countCard: { borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 18 },
  calendarMark: { width: 43, height: 43, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.11)', alignItems: 'center', justifyContent: 'center' },
  countLabel: { color: '#d3e0d1', fontSize: 11, fontWeight: '600' },
  countValue: { color: '#ffffff', fontSize: 28, fontWeight: '800', lineHeight: 32 },
  countFoot: { color: '#c6e57d', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 9, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 19, padding: 10, flexDirection: 'row', gap: 11, marginBottom: 10 },
  thumb: { width: 66, height: 66, borderRadius: 14 },
  eventThumb: { alignItems: 'center', justifyContent: 'center' },
  when: { fontSize: 10, fontWeight: '800' },
  title: { fontSize: 14, fontWeight: '800', marginTop: 3 },
  meta: { fontSize: 10, marginTop: 3 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 4 },
  statusText: { fontSize: 9, fontWeight: '800' },
  cancelButton: { paddingHorizontal: 10, minHeight: 34, justifyContent: 'center' },
  cancelText: { fontSize: 11, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 65 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyHint: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 7, maxWidth: 230 },
  findButton: { marginTop: 20, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  findButtonText: { fontSize: 12, fontWeight: '800' },
});
