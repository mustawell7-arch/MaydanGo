import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import { router } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { FacilityCard } from '@/components/FacilityCard';
import { categories, facilities, getCityLabel, sessions } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';

export default function HomeScreen() {
  const colors = useColors();
  const app = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const currentCity = getCityLabel(app.selectedCityId, app.language);
  const featured = sessions[0];
  const nearbyFacilities = app.selectedCityId === 'all'
    ? facilities.slice(0, 5)
    : facilities.filter((facility) => facility.cityId === app.selectedCityId).slice(0, 4);

  return (
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Image source={require('../../assets/images/icon.png')} style={styles.logo} />
            <View>
              <Text style={[styles.brandName, { color: colors.foreground }]}>MaydanGO</Text>
              <Pressable onPress={() => router.push('/cities')} style={styles.location} accessibilityRole="button">
                <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground }]}>
                  {currentCity}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('checkIn')}
            testID="home-checkin-button"
            onPress={() => router.push('/checkin')}
            style={({ pressed }) => [
              styles.headerCheckin,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="scan-outline" size={19} color={colors.primaryForeground} />
          </Pressable>
        </View>

        <View style={styles.greetingBlock}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
            {t('regionEyebrow')}
          </Text>
          <Text style={[styles.greeting, { color: colors.foreground }]}>
            {t('goodMorning')}
          </Text>
          <Text style={[styles.greetingAccent, { color: colors.primary }]}>
            {t('goodMorningAccent')}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/membership')}
          style={({ pressed }) => [
            styles.passCard,
            { backgroundColor: colors.primary, opacity: pressed ? 0.94 : 1 },
          ]}
        >
          <View style={styles.passGlow} />
          <View style={styles.passTop}>
            <View>
              <Text style={styles.passEyebrow}>Sample plan · no real access</Text>
              <View style={styles.passTitleRow}>
                <Text style={styles.passTier}>{app.membershipTier}</Text>
                <View style={styles.activePill}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>Preview</Text>
                </View>
              </View>
            </View>
            <View style={styles.passMark}>
              <Ionicons name="arrow-forward" size={18} color="#d9f2a1" />
            </View>
          </View>
          <View style={styles.quotaBlock}>
            <View style={styles.quotaLabels}>
              <Text style={styles.quotaNumber}>{app.visitsRemaining} / 12</Text>
              <Text style={styles.quotaCaption}>{t('visitsLeft').replace('{n}', String(app.visitsRemaining))}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.max(0, (app.visitsRemaining / 12) * 100)}%` },
                ]}
              />
            </View>
          </View>
          <View style={styles.passBottom}>
            <Text style={styles.liveQuota}>6 {t('liveClasses')}</Text>
            <Text style={styles.viewMembership}>{t('managePass')}</Text>
          </View>
        </Pressable>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t('todayForYou')}
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              {t('todayForYouHint')}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/explore')} accessibilityRole="button">
            <Text style={[styles.seeAll, { color: colors.primary }]}>{t('seeAll')}</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/session/[id]', params: { id: featured.id } })}
          style={({ pressed }) => [styles.featuredCard, { opacity: pressed ? 0.93 : 1 }]}
        >
          <Image source={featured.image} style={styles.featuredImage} resizeMode="cover" />
          <View style={styles.featuredShade} />
          <View style={styles.featuredBadge}>
            <Ionicons name="flash" size={11} color="#18352b" />
            <Text style={styles.featuredBadgeText}>MAYDANGO PICK</Text>
          </View>
          <View style={styles.featuredCopy}>
            <Text style={styles.featuredTime}>{featured.time} · {featured.duration}</Text>
            <Text style={styles.featuredTitle}>{featured.title}</Text>
            <Text style={styles.featuredInstructor}>with {featured.instructor}</Text>
          </View>
          <View style={styles.featuredArrow}>
            <Ionicons name="arrow-forward" size={19} color="#18352b" />
          </View>
        </Pressable>

        <View style={styles.checkinHint}>
          <View style={[styles.checkinIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.checkinTitle, { color: colors.foreground }]}>
              {t('checkIn')}
            </Text>
            <Text style={[styles.checkinSub, { color: colors.mutedForeground }]}>
              {t('checkInHint')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t('nearby')}
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              {t('nearbyHint')}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/explore')} accessibilityRole="button">
            <Text style={[styles.seeAll, { color: colors.primary }]}>{t('exploreAll')}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}>
          {nearbyFacilities.slice(0, 3).map((facility) => (
            <FacilityCard
              key={facility.id}
              facility={facility}
              favorite={app.favorites.includes(facility.id)}
              onPress={() => router.push({ pathname: '/facility/[id]', params: { id: facility.id } })}
              onToggleFavorite={() => app.toggleFavorite(facility.id)}
              compact
            />
          ))}
        </ScrollView>

        <View style={styles.categoryRow}>
          <Text style={[styles.categoryEyebrow, { color: colors.mutedForeground }]}>
            MOVE YOUR WAY
          </Text>
          <Text style={[styles.categoryCount, { color: colors.mutedForeground }]}>
            {categories.length - 1} ways to begin
          </Text>
        </View>
        <View style={styles.chipRow}>
          {categories.slice(1, 5).map((category) => (
            <Pressable
              key={category}
              onPress={() => router.push({ pathname: '/explore', params: { category } })}
              style={[styles.categoryChip, { backgroundColor: colors.secondary }]}
            >
              <Text style={[styles.categoryChipText, { color: colors.secondaryForeground }]}>
                {category}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/explore', params: { kind: 'events' } })}
          style={[styles.eventsBanner, { backgroundColor: colors.secondary }]}
        >
          <View style={[styles.eventsIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="ticket-outline" size={18} color={colors.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eventsTitle, { color: colors.foreground }]}>{t('events')}</Text>
            <Text style={[styles.eventsHint, { color: colors.mutedForeground }]}>{t('allWelcome')}</Text>
          </View>
          <Ionicons name="arrow-forward" size={17} color={colors.primary} />
        </Pressable>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  topBar: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 18,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: { alignItems: 'center', gap: 10 },
  logo: { width: 42, height: 42, borderRadius: 14 },
  brandName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  location: { alignItems: 'center', gap: 3, marginTop: 2, flexDirection: 'row' },
  locationText: { fontSize: 11, fontWeight: '600' },
  headerCheckin: {
    width: 42,
    height: 42,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  greetingBlock: { paddingHorizontal: 22, marginTop: 8, marginBottom: 18 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 8 },
  greeting: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1 },
  greetingAccent: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1 },
  passCard: {
    marginHorizontal: 20,
    minHeight: 178,
    borderRadius: 25,
    overflow: 'hidden',
    padding: 19,
    marginBottom: 27,
  },
  passGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 120,
    right: -80,
    top: -100,
    backgroundColor: 'rgba(200,232,130,0.12)',
  },
  passTop: { justifyContent: 'space-between', alignItems: 'flex-start' },
  passEyebrow: { color: '#c7d6c8', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  passTitleRow: { alignItems: 'center', gap: 10, marginTop: 8 },
  passTier: { color: '#f5f7ee', fontSize: 31, fontWeight: '800', lineHeight: 34 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  activeDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#c6e57d' },
  activeText: { color: '#e2ebdc', fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  passMark: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,247,238,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quotaBlock: { marginTop: 14 },
  quotaLabels: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 7 },
  quotaNumber: { color: '#f5f7ee', fontSize: 14, fontWeight: '800' },
  quotaCaption: { color: '#c7d6c8', fontSize: 11, fontWeight: '500' },
  progressTrack: { height: 5, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.16)' },
  progressFill: { height: '100%', borderRadius: 6, backgroundColor: '#c6e57d' },
  passBottom: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  liveQuota: { color: '#c7d6c8', fontSize: 10, fontWeight: '600' },
  viewMembership: { color: '#d8f09b', fontSize: 10, fontWeight: '800' },
  sectionHeader: {
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 22,
    marginBottom: 13,
  },
  sectionTitle: { fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: -0.4 },
  sectionSub: { marginTop: 3, fontSize: 11, fontWeight: '500' },
  seeAll: { fontSize: 11, fontWeight: '800', paddingBottom: 3 },
  featuredCard: {
    height: 205,
    marginHorizontal: 20,
    marginBottom: 13,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
  },
  featuredImage: { width: '100%', height: '100%' },
  featuredShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(14,31,24,0.32)',
  },
  featuredBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: '#c6e57d',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featuredBadgeText: { color: '#18352b', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  featuredCopy: { position: 'absolute', bottom: 17, left: 17, right: 56 },
  featuredTime: { color: '#e6eddf', fontSize: 10, fontWeight: '600', marginBottom: 4 },
  featuredTitle: { color: '#ffffff', fontSize: 21, lineHeight: 25, fontWeight: '800' },
  featuredInstructor: { color: '#e6eddf', fontSize: 11, marginTop: 4 },
  featuredArrow: {
    position: 'absolute',
    right: 15,
    bottom: 16,
    width: 37,
    height: 37,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c6e57d',
  },
  checkinHint: {
    marginHorizontal: 20,
    marginBottom: 27,
    padding: 13,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e8dc',
  },
  checkinIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinTitle: { fontSize: 13, fontWeight: '800' },
  checkinSub: { fontSize: 10, fontWeight: '500', marginTop: 3 },
  horizontalCards: { paddingHorizontal: 20, paddingBottom: 5 },
  categoryRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    marginTop: 17,
    marginBottom: 10,
  },
  categoryEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  categoryCount: { fontSize: 10, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  categoryChipText: { fontSize: 10, fontWeight: '700' },
  eventsBanner: { marginHorizontal: 20, marginTop: 16, marginBottom: 2, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventsIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  eventsTitle: { fontSize: 12, fontWeight: '900' },
  eventsHint: { fontSize: 9, marginTop: 3 },
});
