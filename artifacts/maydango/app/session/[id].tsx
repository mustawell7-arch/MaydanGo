import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  View,
  Alert,
} from 'react-native';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import { localize, dateTime } from '@/lib/content';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { facilities, sessions } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';
import { MemberNotice } from '@/components/MemberNotice';

export default function SessionDetailScreen() {
  const colors = useColors();
  const app = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = sessions.find((item) => item.id === id);
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);

  if (!session) {
    return <ScreenShell><View style={styles.notFound}><Text style={{ color: colors.foreground }}>This session is not available.</Text></View></ScreenShell>;
  }

  const facility = facilities.find((item) => item.id === session.facilityId);
  const isBooked = app.isSessionBooked(session.id);
  const offering = app.bookingCatalog.find(o => o.kind === 'session' && o.targetId === session.id);

  const reserve = async () => {
    if (isBooked) {
      router.push('/(tabs)/bookings');
      return;
    }
    const result = await app.bookSession(session.id);
    if (result.ok) Alert.alert(localize('Reservation saved', app.language), localize('Sample reservation saved to your account. This is not attendance or a live partner confirmation.', app.language));
  };

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image source={session.image} style={styles.image} resizeMode="cover" />
          <View style={styles.shade} />
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
            <Ionicons name="arrow-back" size={19} color="#18352b" />
          </Pressable>
          <View style={styles.heroText}>
            <Text style={styles.time}>{session.time} · {session.duration}</Text>
            <Text style={styles.title}>{session.title}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <MemberNotice />
          <Text style={{ color: colors.foreground, marginBottom: 12 }}>
            {offering ? `Sample date: ${dateTime(offering.startsAt, app.language)} · Cancel before ${dateTime(offering.cancellationDeadline, app.language)}` : 'Sign in to see available class times. Times shown here are examples.'}
          </Text>
          <View style={[styles.spotsPill, { backgroundColor: colors.accent }]}>
            <View style={styles.spotDot} />
            <Text style={[styles.spotsText, { color: colors.accentForeground }]}>{offering ? t('spotsLeft').replace('{n}', String(offering.remaining)) : '—'}</Text>
          </View>
          <View style={[styles.instructorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.instructorAvatar, { backgroundColor: colors.secondary }]}>
              <Ionicons name="person" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.instructorName, { color: colors.foreground }]}>{session.instructor}</Text>
              <Text style={[styles.instructorLabel, { color: colors.mutedForeground }]}>MaydanGO instructor</Text>
            </View>
            <Ionicons name="checkmark-circle" size={18} color="#4e9664" />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>About this class</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Move with expert guidance in a welcoming group. Arrive a few minutes early and tell the instructor if you are new.
          </Text>
          <View style={styles.infoGrid}>
            <Info icon="barbell-outline" label={session.level} colors={colors} />
            <Info icon="people-outline" label={session.gender} colors={colors} />
            <Info icon="location-outline" label={facility?.name ?? ''} colors={colors} />
            <Info icon="time-outline" label={session.duration} colors={colors} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isBooked ? t('booked') : t('reserveSpot')}
            testID="reserve-session-button"
            disabled={app.memberLoading}
            onPress={reserve}
            style={({ pressed }) => [styles.reserveButton, { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 }]}
          >
            <Text style={styles.reserveText}>{isBooked ? 'View booking' : t('reserveSpot')}</Text>
            <Ionicons name={isBooked ? 'calendar-outline' : 'arrow-forward'} size={17} color={colors.primaryForeground} />
          </Pressable>
          <Text style={[styles.previewNote, { color: colors.mutedForeground }]}>
            Sample reservation only. It is not a confirmed partner booking.
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function Info({ icon, label, colors }: { icon: keyof typeof Ionicons.glyphMap; label: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.infoCell, { backgroundColor: colors.secondary }]}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={[styles.infoLabel, { color: colors.foreground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 38 },
  hero: { height: 280, position: 'relative' },
  image: { width: '100%', height: '100%' },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(17,31,25,0.36)' },
  backButton: { position: 'absolute', top: 17, left: 20, width: 39, height: 39, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  heroText: { position: 'absolute', left: 21, bottom: 22, right: 20 },
  time: { color: '#dce7d8', fontSize: 10, fontWeight: '700', marginBottom: 6 },
  title: { color: '#ffffff', fontSize: 27, lineHeight: 33, fontWeight: '900', letterSpacing: -0.5 },
  body: { padding: 20 },
  spotsPill: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11, marginBottom: 15 },
  spotDot: { width: 6, height: 6, borderRadius: 5, backgroundColor: '#4e9664' },
  spotsText: { fontSize: 9, fontWeight: '900' },
  instructorCard: { borderWidth: 1, borderRadius: 17, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 21 },
  instructorAvatar: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  instructorName: { fontSize: 12, fontWeight: '800' },
  instructorLabel: { fontSize: 9, marginTop: 3 },
  sectionTitle: { fontSize: 15, fontWeight: '900', marginBottom: 7 },
  description: { fontSize: 11, lineHeight: 17 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18, marginBottom: 22 },
  infoCell: { width: '48%', minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 13 },
  infoLabel: { fontSize: 9, fontWeight: '700', flexShrink: 1 },
  reserveButton: { minHeight: 50, borderRadius: 16, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reserveText: { color: '#f5f7ee', fontSize: 12, fontWeight: '900' },
  previewNote: { textAlign: 'center', fontSize: 9, marginTop: 9 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
