import React, { useEffect, useMemo, useState } from 'react';
import { MemberNotice } from '@/components/MemberNotice';
import {
  Image,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, Pressable, TextInput, Ionicons } from '@/components/Localized';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { FacilityCard } from '@/components/FacilityCard';
import { communityEvents, cities, getCityLabel } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';
import { facilityText, cityIdForFacility, eligibilityKey } from '@/lib/facility-content';
import { getGetPublicFacilitiesQueryKey, useGetPublicFacilities } from '@workspace/api-client-react';

function FilterRow({
  title,
  anyLabel,
  options,
  selected,
  onSelect,
  colors,
}: {
  title: string;
  anyLabel: string;
  options: { key: string; label: string }[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  colors: ReturnType<typeof useColors>;
}) {
  if (!options.length) return null;
  return (
    <View style={styles.filterSection}>
      <Text style={[styles.filterTitle, { color: colors.mutedForeground }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {[{ key: '', label: anyLabel }, ...options].map(option => {
          const active = option.key === '' ? selected === null : selected === option.key;
          return (
            <Pressable
              key={option.key || 'any'}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(option.key || null)}
              style={[
                styles.chip,
                { backgroundColor: active ? colors.primary : colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.foreground }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function ExploreScreen() {
  const colors = useColors();
  const app = useApp();
  const params = useLocalSearchParams<{ category?: string; kind?: string }>();
  const [kind, setKind] = useState<'places' | 'events'>(params.kind === 'events' ? 'events' : 'places');
  // Home banner can deep-link here with kind=events while the tab is already mounted.
  useEffect(() => {
    if (params.kind === 'events' || params.kind === 'places') setKind(params.kind);
  }, [params.kind]);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(params.category ?? 'All');
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [selectedAmenity, setSelectedAmenity] = useState<string | null>(null);
  const [selectedAccessibility, setSelectedAccessibility] = useState<string | null>(null);
  const [selectedEligibility, setSelectedEligibility] = useState<string | null>(null);
  const facilitiesQuery = useGetPublicFacilities({
    query: { queryKey: getGetPublicFacilitiesQueryKey(), refetchInterval: 60_000 },
  });
  const facilities = facilitiesQuery.data ?? [];
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const currentCity = getCityLabel(app.selectedCityId, app.language);
  useEffect(() => {
    setCategory('All');
    setSelectedAmenity(null);
    setSelectedAccessibility(null);
    setSelectedEligibility(null);
  }, [app.language]);
  const categories = useMemo(() => [
    ...new Set(facilities.flatMap(facility => facility.activities.map(activity => facilityText(activity, app.language)))),
  ], [facilities, app.language]);
  const amenityOptions = useMemo(() => {
    const values = new Map<string, string>();
    facilities.flatMap(facility => facility.amenities).forEach(value => values.set(JSON.stringify(value), facilityText(value, app.language)));
    return [...values].map(([key, label]) => ({ key, label }));
  }, [facilities, app.language]);
  const accessibilityOptions = useMemo(() => {
    const values = new Map<string, string>();
    facilities.flatMap(facility => facility.accessibility).forEach(value => values.set(JSON.stringify(value), facilityText(value, app.language)));
    return [...values].map(([key, label]) => ({ key, label }));
  }, [facilities, app.language]);
  const eligibilityOptions = useMemo(() => {
    const values = new Map<string, string>();
    facilities.flatMap(facility => facility.upcomingSessions).forEach(session => {
      const key = eligibilityKey(session);
      const gender = session.gender === 'female' ? t('womenOnly') : session.gender === 'male' ? t('menOnly') : t('allMembers');
      const age = session.maxAge !== null
        ? t('ageRangeLabel').replace('{min}', String(session.minAge)).replace('{max}', String(session.maxAge))
        : session.minAge > 0 ? t('ageMinimum').replace('{age}', String(session.minAge)) : null;
      values.set(key, age ? t('ageAndGender').replace('{gender}', gender).replace('{age}', age) : gender);
    });
    return [...values].map(([key, label]) => ({ key, label }));
  }, [facilities, app.language]);
  const visibleFacilities = useMemo(
    () => facilities.filter(facility => {
      const matchesCity = app.selectedCityId === 'all' || cityIdForFacility(facility.city) === app.selectedCityId;
      const searchValues = [
        facility.localizedName.en, facility.localizedName.ar, facility.localizedName.ku,
        facility.localizedDistrict.en, facility.localizedDistrict.ar, facility.localizedDistrict.ku,
        facility.localizedDescription.en, facility.localizedDescription.ar, facility.localizedDescription.ku,
        facility.city,
        ...facility.activities.flatMap(item => [item.en, item.ar, item.ku]),
        ...facility.amenities.flatMap(item => [item.en, item.ar, item.ku]),
        ...facility.accessibility.flatMap(item => [item.en, item.ar, item.ku]),
      ];
      const matchesText = searchValues.join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase());
      const matchesCategory = category === 'All' || facility.activities.some(item =>
        facilityText(item, app.language).toLocaleLowerCase() === category.toLocaleLowerCase(),
      );
      const matchesAmenity = !selectedAmenity || facility.amenities.some(item => JSON.stringify(item) === selectedAmenity);
      const matchesAccessibility = !selectedAccessibility || facility.accessibility.some(item => JSON.stringify(item) === selectedAccessibility);
      const matchesEligibility = !selectedEligibility || facility.upcomingSessions.some(session => eligibilityKey(session) === selectedEligibility);
      return matchesCity && matchesText && matchesCategory && matchesAmenity && matchesAccessibility &&
        matchesEligibility && (!openNowOnly || facility.openingStatus === 'open');
    }),
    [facilities, app.selectedCityId, app.language, query, category, selectedAmenity, selectedAccessibility, selectedEligibility, openNowOnly],
  );

  const visibleEvents = useMemo(
    () =>
      communityEvents.filter((event) => {
        const matchesCity = app.selectedCityId === 'all' || event.cityId === app.selectedCityId;
        const source = `${event.title} ${event.venue} ${event.city} ${event.description} ${event.access}`;
        const matchesText = `${source}`
          .toLowerCase()
          .includes(query.toLowerCase());
        return matchesCity && matchesText;
      }),
    [app.selectedCityId, query],
  );
  const align = app.language === 'en' ? 'left' : 'right';

  const toggleEvent = async (eventId: string) => {
    const wasReserved = app.isEventReserved(eventId);
    const result = await (wasReserved ? app.cancelEvent(eventId) : app.bookEvent(eventId));
    if (result.ok) setNotice(wasReserved ? t('cancelled') : t('eventSaved'));
    else setNotice(result.reason === 'duplicate' ? t('alreadySaved') : t('notSaved'));
  };

  return (
    <ScreenShell sample={kind === 'events'}>
      <ScreenHeader eyebrow={currentCity} title={t('explore')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            accessibilityLabel={t('search')}
            placeholder={t('search')}
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: colors.foreground }]}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
        <Pressable testID="explore-live" accessibilityRole="button" onPress={() => router.push('/live')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: colors.accent }}>
          <Ionicons name="radio-outline" size={18} color={colors.accentForeground} />
          <Text style={{ flex: 1, color: colors.accentForeground, fontWeight: '700' }}>{t('realPartnerAvailability')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.accentForeground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/cities')}
          style={[styles.citySelector, { backgroundColor: colors.secondary }]}
        >
          <Ionicons name="location-outline" size={15} color={colors.primary} />
          <Text style={[styles.citySelectorText, { color: colors.foreground }]}>
            {app.selectedCityId === 'all' ? t('allIraq') : currentCity}
          </Text>
          <Text style={[styles.citySelectorHint, { color: colors.mutedForeground }]}>
            {app.selectedCityId === 'all' ? t('countrywide') : cities.find((city) => city.id === app.selectedCityId)?.region}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
        <View accessibilityRole="tablist" style={[styles.kindSwitch, { backgroundColor: colors.secondary }]}>
          {(['places', 'events'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: kind === value }}
              onPress={() => { setKind(value); setNotice(null); }}
              style={[styles.kindOption, kind === value && { backgroundColor: colors.card }]}
            >
              <Ionicons name={value === 'places' ? 'business-outline' : 'people-outline'} size={14} color={kind === value ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.toggleText, { color: kind === value ? colors.primary : colors.mutedForeground }]}>{t(value)}</Text>
            </Pressable>
          ))}
        </View>
        {kind === 'events' ? (
          <View style={styles.list}>
            <Text style={[styles.eventsHint, { color: colors.mutedForeground, textAlign: align }]}>{t('eventsHint')}</Text>
            {notice ? (
              <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: colors.primary }]}>
                <Text style={[styles.toastText, { color: colors.primaryForeground }]}>{notice}</Text>
              </View>
            ) : null}
            {visibleEvents.map((event) => {
              const reserved = app.isEventReserved(event.id);
              return (
                <View key={event.id} style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Image source={event.image} style={styles.eventImage} />
                  <View style={styles.eventBody}>
                    <Text style={[styles.eventDate, { color: colors.primary, textAlign: align }]}>{app.offeringTime('event', event.id)} · {getCityLabel(event.cityId, app.language)}</Text>
                    <Text style={[styles.eventTitle, { color: colors.foreground, textAlign: align }]}>{event.title}</Text>
                    <Text style={[styles.eventMeta, { color: colors.mutedForeground, textAlign: align }]}>{event.venue} · {event.access}</Text>
                    <Text style={[styles.eventDesc, { color: colors.foreground, textAlign: align }]}>{event.description}</Text>
                    <View style={styles.eventFooter}>
                      {reserved ? (
                        <View style={[styles.statusPill, { backgroundColor: colors.secondary }]}>
                          <Text style={[styles.statusText, { color: colors.primary }]}>{t('statusReserved')}</Text>
                        </View>
                      ) : <View />}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${reserved ? t('cancelReservation') : t('reserveEvent')}: ${event.title}`}
                        onPress={() => toggleEvent(event.id)}
                        style={({ pressed }) => [
                          styles.eventButton,
                          { backgroundColor: reserved ? colors.card : colors.accent, borderColor: reserved ? colors.destructive : colors.accent, opacity: pressed ? 0.85 : 1 },
                        ]}
                      >
                        <Text style={[styles.eventButtonText, { color: reserved ? colors.destructive : colors.accentForeground }]}>
                          {reserved ? t('cancelReservation') : t('reserveEvent')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
            {visibleEvents.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="calendar-clear-outline" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('noEvents')}</Text>
                <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('noEventsHint')}</Text>
              </View>
            ) : null}
            <MemberNotice />
          </View>
        ) : (<>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {['All', ...categories].map(item => {
            const selected = category === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategory(item)}
                style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.chipText, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                  {item === 'All' ? t('allActivities') : item}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.filterBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: openNowOnly }}
            onPress={() => setOpenNowOnly(value => !value)}
            style={[styles.openPill, { backgroundColor: openNowOnly ? colors.primary : colors.secondary }]}
          >
            <View style={[styles.openDot, { backgroundColor: openNowOnly ? colors.primaryForeground : colors.primary }]} />
            <Text style={[styles.openPillText, { color: openNowOnly ? colors.primaryForeground : colors.primary }]}>{t('openNow')}</Text>
          </Pressable>
          <Text style={[styles.updatedHint, { color: colors.mutedForeground }]}>{t('iraqTime')}</Text>
        </View>
        <FilterRow title={t('amenities')} anyLabel={t('anyAmenity')} options={amenityOptions}
          selected={selectedAmenity} onSelect={setSelectedAmenity} colors={colors} />
        <FilterRow title={t('accessibility')} anyLabel={t('anyAccessNeed')} options={accessibilityOptions}
          selected={selectedAccessibility} onSelect={setSelectedAccessibility} colors={colors} />
        <FilterRow title={t('sessionSuitability')} anyLabel={t('anySessionSuitability')} options={eligibilityOptions}
          selected={selectedEligibility} onSelect={setSelectedEligibility} colors={colors} />
        <View style={styles.list}>
          {facilitiesQuery.isLoading ? (
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('loadingFacilities')}</Text>
          ) : facilitiesQuery.isError ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyHint, { color: colors.destructive }]}>{t('facilityLoadError')}</Text>
              <Pressable accessibilityRole="button" onPress={() => void facilitiesQuery.refetch()}>
                <Text style={[styles.retryText, { color: colors.primary }]}>{t('tryAgain')}</Text>
              </Pressable>
            </View>
          ) : facilities.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('noPlaces')}</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('noPublishedFacilities')}</Text>
            </View>
          ) : visibleFacilities.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('noPlaces')}</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('trySearch')}</Text>
            </View>
          ) : (
            <>
              {visibleFacilities.map((facility) => (
              <FacilityCard
                key={facility.id}
                facility={facility}
                favorite={app.favorites.includes(facility.id)}
                onPress={() => router.push({ pathname: '/facility/[id]', params: { id: facility.id } })}
                onToggleFavorite={() => app.toggleFavorite(facility.id)}
              />
            ))}
            </>
          )}
        </View>
        </>)}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 34 },
  kindSwitch: { marginHorizontal: 20, marginTop: 11, flexDirection: 'row', padding: 3, borderRadius: 13, gap: 2 },
  kindOption: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11 },
  eventsHint: { fontSize: 11, marginTop: 14, marginBottom: 10 },
  toast: { borderRadius: 12, padding: 10, marginBottom: 10 },
  toastText: { fontSize: 11, fontWeight: '800' },
  eventCard: { borderWidth: 1, borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  eventImage: { width: '100%', height: 120 },
  eventBody: { padding: 14 },
  eventDate: { fontSize: 10, fontWeight: '800' },
  eventTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  eventMeta: { fontSize: 10, marginTop: 4 },
  eventDesc: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  eventFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, flexShrink: 1 },
  statusText: { fontSize: 9, fontWeight: '900' },
  eventButton: { minHeight: 40, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  eventButtonText: { fontSize: 11, fontWeight: '800' },
  searchBox: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderRadius: 17,
    height: 51,
    paddingHorizontal: 14,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  citySelector: { marginHorizontal: 20, marginTop: 11, paddingHorizontal: 11, paddingVertical: 10, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
  citySelectorText: { fontSize: 11, fontWeight: '800' },
  citySelectorHint: { fontSize: 9, flex: 1 },
  searchInput: { flex: 1, height: '100%', fontSize: 13, fontWeight: '500' },
  chips: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 5, gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: '700' },
  filterBar: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  openPill: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#e9eddf', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14 },
  openDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#4c875d' },
  openPillText: { fontSize: 10, fontWeight: '800' },
  updatedHint: { fontSize: 10 },
  filterSection: { marginBottom: 6 },
  filterTitle: { fontSize: 10, fontWeight: '800', paddingHorizontal: 20, paddingTop: 5 },
  toggleText: { fontSize: 10, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 45, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyHint: { fontSize: 12 },
  retryText: { fontSize: 12, fontWeight: '800' },
});
