import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { FacilityCard } from '@/components/FacilityCard';
import { categories, communityEvents, facilities } from '@/data/demo';
import { LocalNotice } from '@/components/LocalNotice';
import { cities, getCityLabel } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';

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
  const [view, setView] = useState<'list' | 'map'>('list');
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const currentCity = getCityLabel(app.selectedCityId, app.language);
  const cityName = cities.find((city) => city.id === app.selectedCityId)?.english ?? 'Iraq';
  const visibleFacilities = useMemo(
    () =>
      facilities.filter((facility) => {
        const matchesCity = app.selectedCityId === 'all' || facility.cityId === app.selectedCityId;
        const matchesText = `${facility.name} ${facility.category} ${facility.district} ${facility.activities.join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesCategory =
          category === 'All' || facility.activities.some((item) => item.toLowerCase().includes(category.toLowerCase())) ||
          facility.category.toLowerCase().includes(category.toLowerCase());
        return matchesCity && matchesText && matchesCategory;
      }),
    [app.selectedCityId, query, category],
  );

  const visibleEvents = useMemo(
    () =>
      communityEvents.filter((event) => {
        const matchesCity = app.selectedCityId === 'all' || event.cityId === app.selectedCityId;
        const matchesText = `${event.title} ${event.venue} ${event.city} ${event.description} ${event.access}`
          .toLowerCase()
          .includes(query.toLowerCase());
        return matchesCity && matchesText;
      }),
    [app.selectedCityId, query],
  );
  const align = app.language === 'en' ? 'left' : 'right';

  const toggleEvent = (eventId: string) => {
    const wasReserved = app.isEventReserved(eventId);
    const result = wasReserved ? app.cancelEvent(eventId) : app.bookEvent(eventId);
    if (result.ok) setNotice(wasReserved ? t('cancelled') : t('eventSaved'));
    else setNotice(result.reason === 'duplicate' ? t('alreadySaved') : t('notSaved'));
  };

  return (
    <ScreenShell>
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
                    <Text style={[styles.eventDate, { color: colors.primary, textAlign: align }]}>{event.date} · {getCityLabel(event.cityId, app.language)}</Text>
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
            <LocalNotice messageKey="localOnly" />
          </View>
        ) : (<>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {categories.map((item) => {
            const selected = category === item;
            return (
              <Pressable
                key={item}
                onPress={() => setCategory(item)}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? colors.primary : colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                  {item === 'All' ? t('allActivities') : item}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.filterBar}>
          <View style={styles.openPill}>
            <View style={styles.openDot} />
            <Text style={[styles.openPillText, { color: colors.primary }]}>{t('openNow')}</Text>
          </View>
          <View style={[styles.viewToggle, { backgroundColor: colors.secondary }]}>
            <Pressable
              onPress={() => setView('list')}
              style={[styles.toggleOption, view === 'list' && { backgroundColor: colors.card }]}
            >
              <Ionicons name="list-outline" size={15} color={view === 'list' ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.toggleText, { color: view === 'list' ? colors.primary : colors.mutedForeground }]}>{t('list')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setView('map')}
              style={[styles.toggleOption, view === 'map' && { backgroundColor: colors.card }]}
            >
              <Ionicons name="map-outline" size={15} color={view === 'map' ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.toggleText, { color: view === 'map' ? colors.primary : colors.mutedForeground }]}>{t('map')}</Text>
            </Pressable>
          </View>
        </View>
        {view === 'map' ? (
          <View style={styles.mapWrap}>
            <View style={styles.map}>
              <Svg width="100%" height="100%" viewBox="0 0 360 330">
                <Rect x="0" y="0" width="360" height="330" fill="#e9eddf" />
                <Path d="M-12 94 C60 72 112 120 174 101 S285 50 382 71" stroke="#f7f6ee" strokeWidth="23" fill="none" />
                <Path d="M-15 215 C44 177 125 196 182 218 S296 267 383 230" stroke="#f7f6ee" strokeWidth="18" fill="none" />
                <Path d="M88 -10 C105 59 145 102 159 164 S149 276 183 344" stroke="#f7f6ee" strokeWidth="16" fill="none" />
                <Path d="M255 -8 C227 60 226 112 255 159 S308 239 276 340" stroke="#d2e5dd" strokeWidth="26" fill="none" />
                <Path d="M255 -8 C227 60 226 112 255 159 S308 239 276 340" stroke="#a3c6b7" strokeWidth="2" fill="none" />
                <Path d="M17 148 L333 133 M22 284 L340 50 M46 29 L324 296" stroke="#d7ddcf" strokeWidth="2" fill="none" />
              </Svg>
              <View style={styles.mapLabel}><Text style={styles.mapLabelText}>{cityName.toUpperCase()}</Text></View>
              {visibleFacilities.map((facility) => (
                <Pressable
                  key={facility.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${facility.name}`}
                  onPress={() => router.push({ pathname: '/facility/[id]', params: { id: facility.id } })}
                  style={[
                    styles.mapPin,
                    {
                      left: `${facility.mapPosition.x}%`,
                      top: `${facility.mapPosition.y}%`,
                    },
                  ]}
                >
                  <Ionicons name="fitness" size={14} color="#ffffff" />
                </Pressable>
              ))}
              <View style={styles.mapNotice}>
                <Ionicons name="information-circle-outline" size={13} color="#718076" />
                <Text style={styles.mapNoticeText}>{t('showMapNote')}</Text>
              </View>
            </View>
            <View style={styles.mapList}>
              {visibleFacilities.slice(0, 2).map((facility) => (
                <Pressable
                  key={facility.id}
                  onPress={() => router.push({ pathname: '/facility/[id]', params: { id: facility.id } })}
                  style={[styles.mapListItem, { backgroundColor: colors.card }]}
                >
                  <Image source={facility.image} style={styles.mapThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mapFacilityName, { color: colors.foreground }]}>{facility.name}</Text>
                    <Text style={[styles.mapFacilityMeta, { color: colors.mutedForeground }]}>{facility.district} · {facility.distance}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.list}>
            {visibleFacilities.map((facility) => (
              <FacilityCard
                key={facility.id}
                facility={facility}
                favorite={app.favorites.includes(facility.id)}
                onPress={() => router.push({ pathname: '/facility/[id]', params: { id: facility.id } })}
                onToggleFavorite={() => app.toggleFavorite(facility.id)}
              />
            ))}
            {visibleFacilities.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('noPlaces')}</Text>
                <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('trySearch')}</Text>
              </View>
            ) : null}
          </View>
        )}
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
  viewToggle: { flexDirection: 'row', padding: 3, borderRadius: 12, gap: 2 },
  toggleOption: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10 },
  toggleText: { fontSize: 10, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 45, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyHint: { fontSize: 12 },
  mapWrap: { paddingHorizontal: 20, paddingBottom: 20 },
  map: { height: 330, borderRadius: 22, overflow: 'hidden', position: 'relative' },
  mapLabel: { position: 'absolute', top: 17, left: 17, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  mapLabelText: { color: '#718076', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  mapPin: { position: 'absolute', width: 32, height: 32, marginLeft: -16, marginTop: -16, backgroundColor: '#214c3d', borderColor: '#ffffff', borderWidth: 3, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  mapNotice: { position: 'absolute', right: 10, bottom: 10, left: 10, padding: 8, backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  mapNoticeText: { color: '#718076', fontSize: 9, flex: 1 },
  mapList: { gap: 8, marginTop: 10 },
  mapListItem: { padding: 9, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mapThumb: { width: 46, height: 46, borderRadius: 12 },
  mapFacilityName: { fontSize: 12, fontWeight: '800' },
  mapFacilityMeta: { fontSize: 10, marginTop: 3 },
});
