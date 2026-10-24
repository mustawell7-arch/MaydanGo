import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { facilities, sessions } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';

export default function BookingsScreen() {
  const colors = useColors();
  const app = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const bookings = app.bookings
    .map((booking) => sessions.find((session) => session.id === booking.sessionId))
    .filter((session) => session !== undefined);

  return (
    <ScreenShell>
      <ScreenHeader eyebrow={t('city')} title={t('bookings')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.countCard, { backgroundColor: colors.primary }]}>
          <View style={styles.calendarMark}>
            <Ionicons name="calendar-outline" size={21} color={colors.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.countLabel}>{t('upcoming')}</Text>
            <Text style={styles.countValue}>{bookings.length.toString().padStart(2, '0')}</Text>
          </View>
          <Text style={styles.countFoot}>READY WHEN YOU ARE</Text>
        </View>
        {bookings.length ? (
          bookings.map((session) => {
            const facility = facilities.find((item) => item.id === session.facilityId);
            return (
              <View key={session.id} style={[styles.bookingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Image source={session.image} style={styles.bookingImage} />
                <View style={styles.bookingInfo}>
                  <Text style={[styles.bookingTime, { color: colors.primary }]}>{session.time}</Text>
                  <Text style={[styles.bookingTitle, { color: colors.foreground }]}>{session.title}</Text>
                  <Text style={[styles.bookingMeta, { color: colors.mutedForeground }]}>
                    {facility?.name ?? ''} · {session.duration}
                  </Text>
                  <View style={styles.bookingFooter}>
                    <View style={styles.confirmedPill}>
                      <View style={styles.confirmedDot} />
                      <Text style={styles.confirmedText}>CONFIRMED</Text>
                    </View>
                    <Pressable
                      onPress={() => app.cancelBooking(session.id)}
                      accessibilityRole="button"
                      style={styles.cancelButton}
                    >
                      <Text style={[styles.cancelText, { color: colors.destructive }]}>{t('cancel')}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
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
              <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
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
  bookingCard: { borderWidth: 1, borderRadius: 21, overflow: 'hidden', marginBottom: 13 },
  bookingImage: { width: '100%', height: 142 },
  bookingInfo: { padding: 15 },
  bookingTime: { fontSize: 10, fontWeight: '800', marginBottom: 4 },
  bookingTitle: { fontSize: 17, fontWeight: '800' },
  bookingMeta: { fontSize: 11, marginTop: 5 },
  bookingFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  confirmedPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  confirmedDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#4e9664' },
  confirmedText: { color: '#4e7957', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  cancelButton: { paddingHorizontal: 10, paddingVertical: 7 },
  cancelText: { fontSize: 11, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 65 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyHint: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 7, maxWidth: 230 },
  findButton: { marginTop: 20, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  findButtonText: { fontSize: 12, fontWeight: '800' },
});
