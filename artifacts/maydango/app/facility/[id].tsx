import React from 'react';
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { facilities, sessions } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';

export default function FacilityDetailScreen() {
  const colors = useColors();
  const app = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const facility = facilities.find((item) => item.id === id);
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);

  if (!facility) {
    return <ScreenShell><View style={styles.notFound}><Text style={{ color: colors.foreground }}>This place is not available.</Text></View></ScreenShell>;
  }

  const facilitySessions = sessions.filter((session) => session.facilityId === facility.id);

  return (
    <ScreenShell>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Image source={facility.image} style={styles.heroImage} resizeMode="cover" />
          <View style={styles.heroShade} />
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
            <Ionicons name="arrow-back" size={19} color="#18352b" />
          </Pressable>
          <Pressable onPress={() => app.toggleFavorite(facility.id)} style={styles.saveButton} accessibilityRole="button" accessibilityLabel="Save place">
            <Ionicons name={app.favorites.includes(facility.id) ? 'heart' : 'heart-outline'} size={20} color={app.favorites.includes(facility.id) ? '#d8574c' : '#18352b'} />
          </Pressable>
          <View style={styles.heroTitle}>
            <Text style={styles.heroCategory}>{facility.category}</Text>
            <Text style={styles.heroName}>{facility.name}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <View style={styles.metaLine}>
            <Meta icon="star" text={`${facility.rating} (${facility.reviews} reviews)`} colors={colors} />
          <Meta icon="location-outline" text={`${facility.district}, ${facility.city} · ${facility.distance}`} colors={colors} />
          </View>
          <View style={[styles.statusCard, { backgroundColor: colors.secondary }]}>
            <View style={styles.statusIcon}><Ionicons name="time-outline" size={17} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: colors.foreground }]}>{facility.openUntil}</Text>
              <Text style={[styles.statusCaption, { color: colors.mutedForeground }]}>{facility.gender}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={18} color="#4e9664" />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('facilityDetails')}</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>{facility.description}</Text>
          <View style={styles.activityChips}>
            {facility.activities.map((activity) => (
              <View key={activity} style={[styles.activityChip, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.activityChipText, { color: colors.secondaryForeground }]}>{activity}</Text>
              </View>
            ))}
          </View>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('activities')}</Text>
            <Text style={[styles.smallCaption, { color: colors.mutedForeground }]}>{facilitySessions.length} sessions</Text>
          </View>
          {facilitySessions.map((session) => (
            <Pressable
              key={session.id}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
              style={[styles.sessionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Image source={session.image} style={styles.sessionImage} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.sessionTime, { color: colors.primary }]}>{session.time}</Text>
                <Text style={[styles.sessionName, { color: colors.foreground }]}>{session.title}</Text>
                <Text style={[styles.sessionMeta, { color: colors.mutedForeground }]}>{session.instructor} · {t('spotsLeft').replace('{n}', String(session.remaining))}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              const query = `${facility.latitude},${facility.longitude}`;
              const url = Platform.OS === 'ios'
                ? `maps://?q=${encodeURIComponent(facility.name)}&ll=${query}`
                : `https://www.google.com/maps/search/?api=1&query=${query}`;
              Linking.openURL(url).catch(() => undefined);
            }}
            style={[styles.directionsButton, { borderColor: colors.border }]}
          >
            <Ionicons name="navigate-outline" size={17} color={colors.primary} />
            <Text style={[styles.directionsText, { color: colors.primary }]}>{t('directions')}</Text>
          </Pressable>
          <Text style={[styles.demoNote, { color: colors.mutedForeground }]}>{t('demoMode')}</Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function Meta({ icon, text, colors }: { icon: keyof typeof Ionicons.glyphMap; text: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36 },
  hero: { height: 285, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,30,24,0.32)' },
  backButton: { position: 'absolute', top: 17, left: 20, width: 39, height: 39, backgroundColor: '#ffffff', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveButton: { position: 'absolute', top: 17, right: 20, width: 39, height: 39, backgroundColor: '#ffffff', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { position: 'absolute', left: 22, bottom: 22, right: 20 },
  heroCategory: { color: '#d5e3d2', fontSize: 10, fontWeight: '800', marginBottom: 5 },
  heroName: { color: '#ffffff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  body: { paddingHorizontal: 20, paddingTop: 17 },
  metaLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 16 },
  metaItem: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  metaText: { fontSize: 10, fontWeight: '600' },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, marginBottom: 21 },
  statusIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 11, fontWeight: '800' },
  statusCaption: { fontSize: 9, marginTop: 3 },
  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 8 },
  description: { fontSize: 12, lineHeight: 18 },
  activityChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12, marginBottom: 23 },
  activityChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11 },
  activityChipText: { fontSize: 9, fontWeight: '800' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  smallCaption: { fontSize: 10, fontWeight: '600' },
  sessionCard: { borderRadius: 16, borderWidth: 1, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sessionImage: { width: 50, height: 50, borderRadius: 13 },
  sessionTime: { fontSize: 9, fontWeight: '800' },
  sessionName: { fontSize: 12, fontWeight: '800', marginTop: 3 },
  sessionMeta: { fontSize: 9, marginTop: 3 },
  directionsButton: { minHeight: 43, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  directionsText: { fontSize: 11, fontWeight: '800' },
  demoNote: { fontSize: 9, textAlign: 'center', marginTop: 14 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
