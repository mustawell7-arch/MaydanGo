import React, { useEffect, useMemo, useState } from 'react';
import { MemberNotice } from '@/components/MemberNotice';
import {
  Linking,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Text, Pressable, TextInput, Ionicons } from '@/components/Localized';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { FacilityCard } from '@/components/FacilityCard';
import { FacilityMap, type FacilityMapPoint } from '@/components/FacilityMap';
import { cities, getCityLabel } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';
import { facilityText, cityIdForFacility, eligibilityKey, eligibilityLabel } from '@/lib/facility-content';
import { directionsUrl, distanceKm, formatDistance, type Coordinates } from '@/lib/location';
import { dateTime, timeOnly } from '@/lib/content';
import { absoluteApiAssetUrl } from '@/lib/live-api';
import {
  getGetPublicCatalogQueryKey,
  getGetPublicFacilitiesQueryKey,
  getGetPublicSponsoredFacilitiesQueryKey,
  useGetPublicSponsoredFacilities,
  useGetPublicCatalog,
  useGetPublicFacilities,
} from '@workspace/api-client-react';
import { useSponsoredFacilityTracking } from '@/lib/sponsored-facilities';
import { findSponsoredFacilityPlacement } from '@/lib/sponsored-placement-match';

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
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [distanceLimit, setDistanceLimit] = useState<number | null>(null);
  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null);
  const facilitiesQuery = useGetPublicFacilities({
    query: { queryKey: getGetPublicFacilitiesQueryKey(), refetchInterval: 60_000 },
  });
  const sponsoredQuery = useGetPublicSponsoredFacilities({
    query: {
      queryKey: [...getGetPublicSponsoredFacilitiesQueryKey(), app.signedIn],
      enabled: kind === 'places',
      refetchInterval: 60_000,
    },
  });
  const sponsoredTracking = useSponsoredFacilityTracking();
  const eventsQuery = useGetPublicCatalog({
    query: { queryKey: getGetPublicCatalogQueryKey(), enabled: kind === 'events', refetchInterval: 60_000 },
  });
  const facilities = facilitiesQuery.data ?? [];
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const currentCity = getCityLabel(app.selectedCityId, app.language);
  const sponsoredPlacementForFacility = (facility: (typeof facilities)[number]) => {
    const searchPlacement = findSponsoredFacilityPlacement(sponsoredQuery.data ?? [], facility, 'search_sponsored');
    if (searchPlacement) return { placement: searchPlacement, placementType: 'search_sponsored' as const };
    const categoryPlacement = findSponsoredFacilityPlacement(
      sponsoredQuery.data ?? [],
      facility,
      'category_featured',
      category === 'All' ? undefined : category,
    );
    return categoryPlacement
      ? { placement: categoryPlacement, placementType: 'category_featured' as const }
      : null;
  };
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
  const facilitiesWithDistance = useMemo(
    () => visibleFacilities.map(facility => ({
      facility,
      distance: location && facility.latitude !== null && facility.longitude !== null
        ? distanceKm(location, { latitude: facility.latitude, longitude: facility.longitude })
        : null,
    })),
    [visibleFacilities, location],
  );
  const resultFacilities = useMemo(() => {
    const withinDistance = facilitiesWithDistance.filter(item =>
      distanceLimit === null || location === null ||
      (item.distance !== null && item.distance <= distanceLimit),
    );
    return withinDistance.sort((a, b) => {
      const campaignOrder = Number(Boolean(sponsoredPlacementForFacility(b.facility)))
        - Number(Boolean(sponsoredPlacementForFacility(a.facility)));
      if (campaignOrder) return campaignOrder;
      return location ? (a.distance ?? Infinity) - (b.distance ?? Infinity) : 0;
    }).map(item => item.facility);
  }, [facilitiesWithDistance, sponsoredQuery.data, distanceLimit, location, category]);
  const mappedFacilities: FacilityMapPoint[] = useMemo(
    () => resultFacilities.flatMap(facility =>
      facility.latitude !== null && facility.longitude !== null
        ? [{ id: facility.id, latitude: facility.latitude, longitude: facility.longitude }]
        : [],
    ),
    [resultFacilities],
  );
  const selectedMapFacility = resultFacilities.find(facility => facility.id === mapSelectedId) ?? null;
  const selectedMapPlacement = selectedMapFacility
    ? sponsoredPlacementForFacility(selectedMapFacility)
    : null;
  useEffect(() => {
    if (!mapSelectedId || !mappedFacilities.some(point => point.id === mapSelectedId)) {
      setMapSelectedId(mappedFacilities[0]?.id ?? null);
    }
  }, [mappedFacilities, mapSelectedId]);

  const visibleEvents = useMemo(
    () => (eventsQuery.data ?? []).filter(event => {
      if (event.kind !== 'event' || event.additionalPayment) return false;
      const matchesCity = app.selectedCityId === 'all' || cityIdForFacility(event.city) === app.selectedCityId;
      const searchValues = [
        event.title,
        event.localizedTitle?.en,
        event.localizedTitle?.ar,
        event.localizedTitle?.ku,
        event.localizedDescription?.en,
        event.localizedDescription?.ar,
        event.localizedDescription?.ku,
        event.city,
        event.facility,
        event.category,
        event.partnerName,
      ];
      const matchesText = searchValues.join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase());
      return matchesCity && matchesText;
    }),
    [eventsQuery.data, app.selectedCityId, query],
  );
  const align = app.language === 'en' ? 'left' : 'right';
  const distanceOptions = location ? [5, 10, 25].map(value => ({
    key: String(value),
    label: `${value} ${t('kilometers')}`,
  })) : [];

  const requestLocation = async () => {
    setLocationLoading(true);
    setLocationMessage(null);
    try {
      const current = await Location.getForegroundPermissionsAsync();
      const permission = current.granted ? current : await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationMessage(t('locationDenied'));
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!Number.isFinite(position.coords.latitude) || !Number.isFinite(position.coords.longitude)) {
        setLocationMessage(t('locationUnavailable'));
        return;
      }
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch {
      setLocationMessage(t('locationUnavailable'));
    } finally {
      setLocationLoading(false);
    }
  };

  const openDirections = (facility: (typeof facilities)[number]) => {
    const destination = facility.latitude !== null && facility.longitude !== null
      ? { latitude: facility.latitude, longitude: facility.longitude }
      : null;
    const url = directionsUrl(
      Platform.OS,
      destination,
      facilityText(facility.localizedAddress, app.language),
      facilityText(facility.localizedName, app.language),
    );
    if (!url) {
      setLocationMessage(t('directionsUnavailable'));
      return;
    }
    void Linking.openURL(url).catch(() => setLocationMessage(t('directionsUnavailable')));
  };

  const toggleEvent = async (eventId: string) => {
    const wasReserved = app.isEventReserved(eventId);
    const result = await (wasReserved ? app.cancelEvent(eventId) : app.bookEvent(eventId));
    if (result.ok) {
      setNotice(wasReserved ? t('cancelled') : t('eventSaved'));
      void eventsQuery.refetch();
    }
    else setNotice(result.reason === 'duplicate' ? t('alreadySaved') : t('notSaved'));
  };

  return (
    <ScreenShell>
      <ScreenHeader eyebrow={currentCity} title={t('explore')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}
        onScroll={sponsoredTracking.checkVisible} onContentSizeChange={sponsoredTracking.checkVisible} scrollEventThrottle={250}>
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
            {eventsQuery.isLoading ? (
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('loadingEvents')}</Text>
            ) : eventsQuery.isError ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyHint, { color: colors.destructive }]}>{t('eventLoadError')}</Text>
                <Pressable accessibilityRole="button" onPress={() => void eventsQuery.refetch()}>
                  <Text style={[styles.retryText, { color: colors.primary }]}>{t('tryAgain')}</Text>
                </Pressable>
              </View>
            ) : visibleEvents.map(event => {
              const reserved = app.isEventReserved(event.targetId);
              const full = event.remaining <= 0 && !reserved;
              const cancellationClosed = reserved && Date.parse(event.cancellationDeadline) <= Date.now();
              const cityId = cityIdForFacility(event.city);
              const eventCity = cities.find(city => city.id === cityId);
              const cityLabel = eventCity ? getCityLabel(eventCity.id, app.language) : event.city;
              const title = event.localizedTitle ? facilityText(event.localizedTitle, app.language) : event.title;
              const description = event.localizedDescription ? facilityText(event.localizedDescription, app.language) : '';
              const eligibleTiers = event.tiers?.join(', ') ?? '';
              return (
                <View key={event.id} style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.eventBody}>
                    {event.imageUrl ? <Image source={{ uri: absoluteApiAssetUrl(event.imageUrl) }} accessibilityLabel={title} resizeMode="cover" style={{ width: '100%', height: 160, borderRadius: 14, marginBottom: 12 }} /> : null}
                    <View style={styles.eventHeader}>
                      <View style={[styles.eventIcon, { backgroundColor: colors.secondary }]}>
                        <Ionicons name="calendar-outline" size={21} color={colors.primary} />
                      </View>
                      <View style={styles.eventHeading}>
                        <Text style={[styles.eventDate, { color: colors.primary, textAlign: align }]}>{dateTime(event.startsAt, app.language)} · {cityLabel}</Text>
                        <Text style={[styles.eventTitle, { color: colors.foreground, textAlign: align }]}>{title}</Text>
                      </View>
                    </View>
                    <Text style={[styles.eventMeta, { color: colors.mutedForeground, textAlign: align }]}>{event.facility} · {event.partnerName}</Text>
                    <Text style={[styles.eventMeta, { color: colors.mutedForeground, textAlign: align }]}>{event.category}</Text>
                    {description ? <Text style={[styles.eventDesc, { color: colors.foreground, textAlign: align }]}>{description}</Text> : null}
                    {event.instructions ? <Text style={[styles.eventMeta, { color: colors.foreground, textAlign: align }]}>{event.instructions}</Text> : null}
                    <View style={[styles.eventDetails, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.eventDetailText, { color: colors.foreground, textAlign: align }]}>
                        {t('eventEndsAt').replace('{time}', timeOnly(event.endsAt, app.language))}
                      </Text>
                      <Text style={[styles.eventDetailText, { color: colors.foreground, textAlign: align }]}>
                        {t('eventEligibility')}: {eligibilityLabel(event, app.language)}
                      </Text>
                      {eligibleTiers ? (
                        <Text style={[styles.eventDetailText, { color: colors.foreground, textAlign: align }]}>
                          {t('eventEligiblePlans').replace('{tiers}', eligibleTiers)}
                        </Text>
                      ) : null}
                      <Text style={[styles.eventDetailText, { color: colors.foreground, textAlign: align }]}>
                        {t('eventCancelBy').replace('{date}', dateTime(event.cancellationDeadline, app.language))}
                      </Text>
                    </View>
                    <View style={styles.eventFooter}>
                      <View style={styles.eventAvailability}>
                        <View style={[styles.statusPill, { backgroundColor: colors.secondary }]}>
                          <Text style={[styles.statusText, { color: colors.primary }]}>{t('eventNoExtraPayment')}</Text>
                        </View>
                        <Text style={[styles.eventMeta, { color: full ? colors.destructive : colors.mutedForeground, textAlign: align }]}>
                          {event.remaining > 0
                            ? t('eventPlacesRemaining').replace('{n}', String(event.remaining))
                            : t('eventFull')}
                        </Text>
                        {cancellationClosed ? (
                          <Text style={[styles.eventMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('eventCancelDeadlinePassed')}</Text>
                        ) : null}
                      </View>
                      {cancellationClosed ? (
                        <View style={[styles.statusPill, { backgroundColor: colors.secondary }]}>
                          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>{t('statusReserved')}</Text>
                        </View>
                      ) : (
                        <Pressable
                          testID={`event-rsvp-${event.id}`}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: app.memberLoading || full }}
                          accessibilityLabel={`${reserved ? t('cancelReservation') : t('reserveEvent')}: ${title}`}
                          disabled={app.memberLoading || full}
                          onPress={() => void toggleEvent(event.targetId)}
                          style={({ pressed }) => [
                            styles.eventButton,
                            {
                              backgroundColor: reserved ? colors.card : colors.accent,
                              borderColor: reserved ? colors.destructive : colors.accent,
                              opacity: app.memberLoading || full ? 0.55 : pressed ? 0.85 : 1,
                            },
                          ]}
                        >
                          <Text style={[styles.eventButtonText, { color: reserved ? colors.destructive : colors.accentForeground }]}>
                            {reserved ? t('cancelReservation') : full ? t('eventFull') : t('reserveEvent')}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
            {!eventsQuery.isLoading && !eventsQuery.isError && visibleEvents.length === 0 ? (
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
        <View style={styles.discoveryControls}>
          <View accessibilityRole="tablist" style={[styles.viewSwitch, { backgroundColor: colors.secondary }]}>
            {(['list', 'map'] as const).map(value => (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: viewMode === value }}
                onPress={() => setViewMode(value)}
                style={[styles.viewOption, viewMode === value && { backgroundColor: colors.card }]}
              >
                <Ionicons name={value === 'map' ? 'map-outline' : 'list-outline'} size={15} color={viewMode === value ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.toggleText, { color: viewMode === value ? colors.primary : colors.mutedForeground }]}>{t(value)}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={locationLoading}
            onPress={() => void requestLocation()}
            style={[styles.locationButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="locate-outline" size={16} color={colors.primaryForeground} />
            <Text style={[styles.locationButtonText, { color: colors.primaryForeground }]}>
              {locationLoading ? t('gettingLocation') : location ? t('refreshMyLocation') : t('useMyLocation')}
            </Text>
          </Pressable>
        </View>
        {locationMessage ? <Text accessibilityRole="alert" style={[styles.locationMessage, { color: colors.destructive }]}>{locationMessage}</Text> : null}
        {location ? <Text style={[styles.locationPrivacyHint, { color: colors.mutedForeground }]}>{t('locationPrivacyHint')}</Text> : null}
        {location ? (
          <FilterRow
            title={t('distance')}
            anyLabel={t('anyDistance')}
            options={distanceOptions}
            selected={distanceLimit === null ? null : String(distanceLimit)}
            onSelect={value => setDistanceLimit(value === null ? null : Number(value))}
            colors={colors}
          />
        ) : null}
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
          ) : resultFacilities.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('noPlaces')}</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{distanceLimit !== null && location ? t('noPlacesWithinDistance') : t('trySearch')}</Text>
            </View>
          ) : viewMode === 'map' ? (
            <View style={styles.mapResults}>
              {mappedFacilities.length ? (
                <FacilityMap
                  points={mappedFacilities}
                  userLocation={location}
                  title={t('facilityMap')}
                  onSelect={setMapSelectedId}
                />
              ) : (
                <View style={[styles.noMap, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="map-outline" size={28} color={colors.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('noMappedFacilities')}</Text>
                </View>
              )}
              {mappedFacilities.length < resultFacilities.length ? (
                <Text style={[styles.locationPrivacyHint, { color: colors.mutedForeground }]}>{t('someLocationsMissing')}</Text>
              ) : null}
              {selectedMapFacility ? (
                <>
                  <View
                    ref={view => sponsoredTracking.register(
                      selectedMapFacility.id,
                      selectedMapPlacement?.placement.campaignId,
                      selectedMapPlacement?.placementType,
                      view,
                    )}
                    collapsable={false}
                    onLayout={sponsoredTracking.checkVisible}
                  >
                  <FacilityCard
                    facility={selectedMapFacility}
                    favorite={app.favorites.includes(selectedMapFacility.id)}
                    sponsoredLabel={selectedMapPlacement ? t('sponsored') : undefined}
                    distanceLabel={location && selectedMapFacility.latitude !== null && selectedMapFacility.longitude !== null
                      ? formatDistance(distanceKm(location, { latitude: selectedMapFacility.latitude, longitude: selectedMapFacility.longitude }), app.language)
                      : undefined}
                    onPress={() => {
                      if (selectedMapPlacement) {
                        sponsoredTracking.recordClick(selectedMapPlacement.placement.campaignId, selectedMapPlacement.placementType);
                      }
                      router.push({ pathname: '/facility/[id]', params: { id: selectedMapFacility.id } });
                    }}
                    onToggleFavorite={() => app.toggleFavorite(selectedMapFacility.id)}
                  />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openDirections(selectedMapFacility)}
                    style={[styles.directionsButton, { backgroundColor: colors.primary }]}
                  >
                    <Ionicons name="navigate-outline" size={17} color={colors.primaryForeground} />
                    <Text style={[styles.locationButtonText, { color: colors.primaryForeground }]}>{t('directions')}</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : (
            <>
              {resultFacilities.map(facility => {
                const sponsored = sponsoredPlacementForFacility(facility);
                return (
                  <View
                    key={facility.id}
                    ref={view => sponsoredTracking.register(
                      facility.id,
                      sponsored?.placement.campaignId,
                      sponsored?.placementType,
                      view,
                    )}
                    collapsable={false}
                    onLayout={sponsoredTracking.checkVisible}
                  >
                    <FacilityCard
                      facility={facility}
                      favorite={app.favorites.includes(facility.id)}
                      sponsoredLabel={sponsored ? t('sponsored') : undefined}
                      distanceLabel={location && facility.latitude !== null && facility.longitude !== null
                        ? formatDistance(distanceKm(location, { latitude: facility.latitude, longitude: facility.longitude }), app.language)
                        : undefined}
                      onPress={() => {
                        if (sponsored) {
                          sponsoredTracking.recordClick(sponsored.placement.campaignId, sponsored.placementType);
                        }
                        router.push({ pathname: '/facility/[id]', params: { id: facility.id } });
                      }}
                      onToggleFavorite={() => app.toggleFavorite(facility.id)}
                    />
                  </View>
                );
              })}
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
  eventBody: { padding: 14 },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  eventHeading: { flex: 1 },
  eventDate: { fontSize: 10, fontWeight: '800' },
  eventTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  eventMeta: { fontSize: 10, marginTop: 4 },
  eventDesc: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  eventDetails: { borderRadius: 12, gap: 4, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10 },
  eventDetailText: { fontSize: 11, lineHeight: 16 },
  eventFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 },
  eventAvailability: { flex: 1, gap: 4 },
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
  discoveryControls: { marginHorizontal: 20, marginTop: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewSwitch: { flex: 1, flexDirection: 'row', padding: 3, borderRadius: 13, gap: 2 },
  viewOption: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 11 },
  locationButton: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  locationButtonText: { fontSize: 11, fontWeight: '800' },
  locationMessage: { marginHorizontal: 20, marginBottom: 8, fontSize: 12, textAlign: 'center' },
  locationPrivacyHint: { marginHorizontal: 20, marginTop: 2, marginBottom: 8, fontSize: 10, lineHeight: 15 },
  mapResults: { marginHorizontal: 20, gap: 10 },
  noMap: { minHeight: 220, borderRadius: 18, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 9 },
  directionsButton: { minHeight: 44, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 },
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
