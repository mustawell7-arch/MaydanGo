import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, Pressable, TextInput, Ionicons } from '@/components/Localized';
import { router } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { cities, getCityLabel } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';

const regionTranslations: Record<string, { ar: string; ku: string }> = {
  Nationwide: { ar: 'كل العراق', ku: 'هەموو عێراق' },
  'Central Iraq': { ar: 'وسط العراق', ku: 'ناوەندی عێراق' },
  'Southern Iraq': { ar: 'جنوب العراق', ku: 'باشووری عێراق' },
  'Central & South': { ar: 'الوسط والجنوب', ku: 'ناوەڕاست و باشوور' },
  'Northern Iraq': { ar: 'شمال العراق', ku: 'باکووری عێراق' },
  'Kurdistan Region': { ar: 'إقليم كردستان', ku: 'هەرێمی کوردستان' },
  'Western Iraq': { ar: 'غرب العراق', ku: 'ڕۆژئاوای عێراق' },
};

function regionLabel(region: string, language: 'en' | 'ar' | 'ku') {
  if (language === 'en') return region;
  return regionTranslations[region]?.[language] ?? region;
}

export default function CitiesScreen() {
  const colors = useColors();
  const app = useApp();
  const [query, setQuery] = useState('');
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const filteredCities = useMemo(
    () =>
      cities.filter((city) =>
        `${city.english} ${city.arabic} ${city.kurdish} ${city.region} ${regionLabel(city.region, 'ar')} ${regionLabel(city.region, 'ku')}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query],
  );

  const chooseCity = (cityId: string) => {
    app.setSelectedCityId(cityId);
    router.back();
  };

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.secondary }]} accessibilityRole="button">
          <Ionicons name="arrow-back" size={19} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('chooseCity')}</Text>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroOrb} />
          <Text style={styles.heroEyebrow}>{t('region')}</Text>
          <Text style={styles.heroTitle}>{t('newCity')}</Text>
          <Text style={styles.heroBody}>{t('chooseCityHint')}</Text>
          <View style={styles.regionTags}>
            {['Kurdistan Region', 'Southern Iraq', 'Western Iraq'].map((region) => (
              <View key={region} style={styles.regionTag}>
                <Text style={styles.regionTagText}>{regionLabel(region, app.language)}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('city')}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t('city')}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
        </View>
        <View style={styles.cityList}>
          {filteredCities.map((city) => {
            const selected = city.id === app.selectedCityId;
            return (
              <Pressable
                key={city.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => chooseCity(city.id)}
                style={[
                  styles.cityRow,
                  {
                    backgroundColor: selected ? colors.secondary : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={[styles.cityIcon, { backgroundColor: selected ? colors.primary : colors.secondary }]}>
                  <Ionicons
                    name={city.id === 'all' ? 'earth-outline' : city.region === 'Kurdistan Region' ? 'leaf-outline' : 'location-outline'}
                    size={18}
                    color={selected ? colors.primaryForeground : colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cityName, { color: colors.foreground }]}>
                    {getCityLabel(city.id, app.language)}
                  </Text>
                  <Text style={[styles.regionName, { color: colors.mutedForeground }]}>
                    {regionLabel(city.region, app.language)}
                  </Text>
                </View>
                {selected ? (
                  <Ionicons name="checkmark-circle" size={19} color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                )}
              </Pressable>
            );
          })}
          {filteredCities.length === 0 ? (
            <Text style={[styles.noResults, { color: colors.mutedForeground }]}>{t('noPlaces')}</Text>
          ) : null}
        </View>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>{t('nationwideNote')}</Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '900' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  hero: { padding: 18, borderRadius: 22, overflow: 'hidden', marginBottom: 14 },
  heroOrb: { position: 'absolute', right: -38, top: -53, width: 160, height: 160, borderRadius: 100, backgroundColor: 'rgba(198,229,125,0.15)' },
  heroEyebrow: { color: '#c6e57d', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  heroTitle: { color: '#ffffff', fontSize: 21, fontWeight: '900', marginTop: 7, maxWidth: 270 },
  heroBody: { color: '#d3e0d1', fontSize: 10, lineHeight: 15, marginTop: 5 },
  regionTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  regionTag: { backgroundColor: 'rgba(255,255,255,0.11)', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  regionTagText: { color: '#f0f4eb', fontSize: 8, fontWeight: '700' },
  search: { height: 46, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, height: '100%', fontSize: 11 },
  cityList: { gap: 8, marginTop: 13 },
  cityRow: { minHeight: 64, borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cityIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cityName: { fontSize: 12, fontWeight: '900' },
  regionName: { fontSize: 9, marginTop: 3 },
  noResults: { textAlign: 'center', fontSize: 11, paddingVertical: 25 },
  note: { textAlign: 'center', fontSize: 9, lineHeight: 15, marginTop: 18, paddingHorizontal: 12 },
});
