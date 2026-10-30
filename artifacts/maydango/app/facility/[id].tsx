import React from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import { router, useLocalSearchParams } from 'expo-router';
import {
  getGetPublicFacilityQueryKey,
  useGetPublicFacility,
  type PublicFacility,
} from '@workspace/api-client-react';
import { ScreenShell } from '@/components/ScreenShell';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';
import { dateTime } from '@/lib/content';
import {
  cityIdForFacility,
  eligibilityLabel,
  facilityClockTime,
  facilityText,
  facilityWeekday,
} from '@/lib/facility-content';
import { cities, facilities as sampleFacilities, getCityLabel, type Facility as SampleFacility } from '@/data/demo';
import { localize } from '@/lib/content';

export default function FacilityDetailScreen() {
  const colors = useColors();
  const app = useApp();
  const { id, sample } = useLocalSearchParams<{ id: string; sample?: string }>();
  const sampleFacility = sample === 'true' ? sampleFacilities.find(item => item.id === id) : undefined;
  const facilityQuery = useGetPublicFacility(id ?? '', {
    query: {
      queryKey: getGetPublicFacilityQueryKey(id ?? ''),
      enabled: !!id && sample !== 'true',
      refetchInterval: 60_000,
    },
  });
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const facility = facilityQuery.data;

  if (sampleFacility) return <SampleFacilityDetails facility={sampleFacility} />;
  if (facilityQuery.isLoading) {
    return <ScreenShell sample={false}><View style={styles.state}><Text style={{ color: colors.mutedForeground }}>{t('loadingFacilities')}</Text></View></ScreenShell>;
  }
  if (facilityQuery.isError) {
    return <ScreenShell sample={false}><View style={styles.state}>
      <Text style={{ color: colors.destructive }}>{t('facilityLoadError')}</Text>
      <Pressable accessibilityRole="button" onPress={() => void facilityQuery.refetch()}>
        <Text style={{ color: colors.primary, fontWeight: '800' }}>{t('tryAgain')}</Text>
      </Pressable>
    </View></ScreenShell>;
  }
  if (!facility) {
    return <ScreenShell sample={false}><View style={styles.state}>
      <Text style={{ color: colors.foreground }}>{t('notFoundPlace')}</Text>
    </View></ScreenShell>;
  }

  return <FacilityDetails facility={facility} />;
}

function SampleFacilityDetails({ facility }: { facility: SampleFacility }) {
  const colors = useColors();
  const app = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const city = getCityLabel(facility.cityId, app.language);
  const openDirections = () => {
    const point = `${facility.latitude},${facility.longitude}`;
    const url = Platform.OS === 'ios'
      ? `maps://?q=${encodeURIComponent(facility.name)}&ll=${point}`
      : `https://www.google.com/maps/search/?api=1&query=${point}`;
    void Linking.openURL(url).catch(() => undefined);
  };
  return (
    <ScreenShell>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: colors.secondary, paddingTop: 0 }]}>
          <Image source={facility.image} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={styles.sampleShade} />
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('back')}>
            <Ionicons name="arrow-back" size={19} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => app.toggleFavorite(facility.id)} style={styles.saveButton} accessibilityRole="button" accessibilityLabel={t('savePlace')}>
            <Ionicons name={app.favorites.includes(facility.id) ? 'heart' : 'heart-outline'} size={20} color={app.favorites.includes(facility.id) ? colors.destructive : colors.primary} />
          </Pressable>
          <View style={styles.sampleHeroTitle}>
            <Text style={styles.sampleHeroCategory}>{localize(facility.category, app.language)}</Text>
            <Text style={styles.sampleHeroName}>{localize(facility.name, app.language)}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <View style={[styles.statusCard, { backgroundColor: colors.secondary }]}>
            <Ionicons name="time-outline" size={19} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: colors.foreground }]}>{localize(facility.openUntil, app.language)}</Text>
              <Text style={[styles.statusCaption, { color: colors.mutedForeground }]}>{localize(facility.gender, app.language)}</Text>
            </View>
          </View>
          <Section title={t('facilityDetails')} color={colors.foreground}>
            <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>{localize(facility.description, app.language)}</Text>
          </Section>
          <Section title={t('locationDetails')} color={colors.foreground}>
            <DetailLine icon="location-outline" label={`${localize(facility.district, app.language)} · ${city}`} value={city} colors={colors} />
            <Pressable accessibilityRole="button" onPress={openDirections} style={[styles.actionButton, { borderColor: colors.border }]}>
              <Ionicons name="navigate-outline" size={17} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.primary }]}>{t('directions')}</Text>
            </Pressable>
          </Section>
          <Section title={t('activities')} color={colors.foreground}>
            <View style={styles.chips}>
              {facility.activities.map(activity => (
                <View key={activity} style={[styles.activityChip, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.activityChipText, { color: colors.secondaryForeground }]}>{localize(activity, app.language)}</Text>
                </View>
              ))}
            </View>
          </Section>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function FacilityDetails({ facility }: { facility: PublicFacility }) {
  const colors = useColors();
  const app = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const name = facilityText(facility.localizedName, app.language);
  const cityId = cityIdForFacility(facility.city);
  const city = cities.some(item => item.id === cityId) ? getCityLabel(cityId, app.language) : facility.city;
  const statusText = facility.openingStatus === 'open'
    ? facility.closesAt
      ? t('openUntilTime').replace('{time}', facilityClockTime(facility.closesAt, app.language))
      : t('openStatus')
    : facility.openingStatus === 'closed' ? t('closedStatus') : t('hoursNotPublished');
  const hours = [...facility.openingHours].sort((a, b) => a.day - b.day);
  const textAlign = app.language === 'en' ? 'left' : 'right';

  const openDirections = () => {
    const destination = facility.latitude !== null && facility.longitude !== null
      ? `${facility.latitude},${facility.longitude}`
      : facilityText(facility.localizedAddress, app.language);
    const url = Platform.OS === 'ios'
      ? `maps://?daddr=${encodeURIComponent(destination)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${destination}`)}`;
    void Linking.openURL(url).catch(() => undefined);
  };
  const openPhone = () => {
    if (facility.contactPhone) void Linking.openURL(`tel:${encodeURIComponent(facility.contactPhone)}`).catch(() => undefined);
  };
  const openWebsite = () => {
    if (facility.websiteUrl) void Linking.openURL(facility.websiteUrl).catch(() => undefined);
  };

  return (
    <ScreenShell sample={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: colors.secondary }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('back')}>
            <Ionicons name="arrow-back" size={19} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => app.toggleFavorite(facility.id)} style={styles.saveButton} accessibilityRole="button" accessibilityLabel={t('savePlace')}>
            <Ionicons name={app.favorites.includes(facility.id) ? 'heart' : 'heart-outline'} size={20} color={app.favorites.includes(facility.id) ? colors.destructive : colors.primary} />
          </Pressable>
          <Ionicons name="fitness-outline" size={42} color={colors.primary} />
          <Text style={[styles.heroActivities, { color: colors.mutedForeground, textAlign }]}>{facility.activities.map(item => facilityText(item, app.language)).join(' · ')}</Text>
          <Text style={[styles.heroName, { color: colors.foreground, textAlign }]}>{name}</Text>
          <Text style={[styles.heroPartner, { color: colors.mutedForeground, textAlign }]}>{facility.partnerName}</Text>
        </View>
        <View style={styles.body}>
          <View style={[styles.statusCard, { backgroundColor: colors.secondary }]}>
            <View style={[styles.statusIcon, { backgroundColor: colors.card }]}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: colors.foreground }]}>{statusText}</Text>
              <Text style={[styles.statusCaption, { color: colors.mutedForeground }]}>{t('openingHours')} · {t('iraqTime')}</Text>
            </View>
          </View>

          <Section title={t('facilityDetails')} color={colors.foreground}>
            <Text style={[styles.bodyCopy, { color: colors.mutedForeground, textAlign }]}>{facilityText(facility.localizedDescription, app.language)}</Text>
          </Section>

          <Section title={t('locationDetails')} color={colors.foreground}>
            <DetailLine icon="location-outline" label={`${facilityText(facility.localizedDistrict, app.language)} · ${city}`} value={facilityText(facility.localizedAddress, app.language)} colors={colors} />
            <Pressable accessibilityRole="button" onPress={openDirections} style={[styles.actionButton, { borderColor: colors.border }]}>
              <Ionicons name="navigate-outline" size={17} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.primary }]}>{t('directions')}</Text>
            </Pressable>
          </Section>

          <Section title={t('openingHours')} color={colors.foreground}>
            {hours.length ? hours.map(item => (
              <View key={item.day} style={styles.hoursRow}>
                <Text style={[styles.hoursDay, { color: colors.foreground }]}>{facilityWeekday(item.day, app.language)}</Text>
                <Text style={[styles.hoursValue, { color: colors.mutedForeground }]}>
                  {item.closed || !item.opensAt || !item.closesAt
                    ? t('closedDay')
                    : `${facilityClockTime(item.opensAt, app.language)} – ${facilityClockTime(item.closesAt, app.language)}`}
                </Text>
              </View>
            )) : <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>{t('hoursNotPublished')}</Text>}
          </Section>

          <Section title={t('contact')} color={colors.foreground}>
            {facility.contactPhone ? (
              <Pressable accessibilityRole="button" onPress={openPhone} style={[styles.actionButton, { borderColor: colors.border }]}>
                <Ionicons name="call-outline" size={17} color={colors.primary} />
                <Text raw style={[styles.actionText, { color: colors.primary }]}>{facility.contactPhone}</Text>
              </Pressable>
            ) : null}
            {facility.websiteUrl ? (
              <Pressable accessibilityRole="button" onPress={openWebsite} style={[styles.actionButton, { borderColor: colors.border }]}>
                <Ionicons name="globe-outline" size={17} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.primary }]}>{t('website')}</Text>
              </Pressable>
            ) : null}
            {!facility.contactPhone && !facility.websiteUrl ? (
              <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>{t('notPublished')}</Text>
            ) : null}
          </Section>

          <LocalizedList title={t('amenities')} values={facility.amenities} language={app.language} />
          <LocalizedList title={t('accessibility')} values={facility.accessibility} language={app.language} />

          <Section title={t('activities')} color={colors.foreground}>
            <View style={styles.chips}>
              {facility.activities.length ? facility.activities.map((activity, index) => (
                <View key={`${index}-${activity.en}`} style={[styles.activityChip, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.activityChipText, { color: colors.secondaryForeground }]}>{facilityText(activity, app.language)}</Text>
                </View>
              )) : <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>{t('notPublished')}</Text>}
            </View>
          </Section>

          <Section title={t('upcomingSessions')} color={colors.foreground}>
            {facility.upcomingSessions.length ? facility.upcomingSessions.map(session => (
              <View key={session.id} style={[styles.sessionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={19} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sessionTime, { color: colors.primary }]}>{dateTime(session.startsAt, app.language)}</Text>
                  <Text style={[styles.sessionName, { color: colors.foreground }]}>{session.localizedTitle?.[app.language] ?? session.title}</Text>
                  <Text style={[styles.sessionMeta, { color: colors.mutedForeground }]}>{session.category} · {session.accessType}</Text>
                  <Text style={[styles.sessionEligibility, { color: colors.mutedForeground }]}>
                    {t('sessionSuitability')}: {eligibilityLabel(session, app.language)}
                  </Text>
                </View>
              </View>
            )) : <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>{t('noPublishedSessions')}</Text>}
          </Section>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return <View style={styles.section}>
    <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
    {children}
  </View>;
}

function DetailLine({
  icon,
  label,
  value,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return <View style={styles.detailLine}>
    <Ionicons name={icon} size={17} color={colors.primary} />
    <View style={{ flex: 1 }}>
      <Text style={[styles.detailLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.mutedForeground }]}>{value}</Text>
    </View>
  </View>;
}

function LocalizedList({
  title,
  values,
  language,
}: {
  title: string;
  values: PublicFacility['amenities'];
  language: ReturnType<typeof useApp>['language'];
}) {
  const colors = useColors();
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return <Section title={title} color={colors.foreground}>
    {values.length ? values.map((value, index) => (
      <View key={`${index}-${value.en}`} style={styles.listItem}>
        <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
        <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>{facilityText(value, language)}</Text>
      </View>
    )) : <Text style={[styles.bodyCopy, { color: colors.mutedForeground }]}>{t('notPublished')}</Text>}
  </Section>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36 },
  hero: { minHeight: 228, paddingHorizontal: 24, paddingTop: 76, paddingBottom: 22, alignItems: 'center', justifyContent: 'flex-end' },
  sampleShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,30,24,0.38)' },
  sampleHeroTitle: { position: 'absolute', left: 22, bottom: 22, right: 22 },
  sampleHeroCategory: { color: '#edf4eb', fontSize: 11, fontWeight: '800', marginBottom: 5 },
  sampleHeroName: { color: '#ffffff', fontSize: 24, fontWeight: '900' },
  backButton: { position: 'absolute', top: 16, left: 20, width: 40, height: 40, backgroundColor: '#ffffff', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveButton: { position: 'absolute', top: 16, right: 20, width: 40, height: 40, backgroundColor: '#ffffff', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroActivities: { fontSize: 11, fontWeight: '700', marginTop: 10 },
  heroName: { fontSize: 25, fontWeight: '900', letterSpacing: -0.5, marginTop: 5 },
  heroPartner: { fontSize: 11, marginTop: 6 },
  body: { paddingHorizontal: 20, paddingTop: 18 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 16, marginBottom: 5 },
  statusIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 13, fontWeight: '800' },
  statusCaption: { fontSize: 10, marginTop: 4 },
  section: { marginTop: 20, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '900' },
  bodyCopy: { fontSize: 12, lineHeight: 18 },
  detailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  detailLabel: { fontSize: 12, fontWeight: '800' },
  detailValue: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  actionButton: { minHeight: 42, borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  actionText: { fontSize: 11, fontWeight: '800' },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#d9dfd5' },
  hoursDay: { fontSize: 11, fontWeight: '700', flex: 1 },
  hoursValue: { fontSize: 11, textAlign: 'right' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  activityChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 11 },
  activityChipText: { fontSize: 10, fontWeight: '800' },
  sessionCard: { borderRadius: 15, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sessionTime: { fontSize: 10, fontWeight: '800' },
  sessionName: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  sessionMeta: { fontSize: 10, marginTop: 4 },
  sessionEligibility: { fontSize: 10, lineHeight: 15, marginTop: 5 },
  state: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
});
