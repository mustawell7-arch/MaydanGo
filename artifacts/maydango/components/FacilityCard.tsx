import React from 'react';
import {
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import type { PublicFacility } from '@workspace/api-client-react';
import type { Facility as SampleFacility } from '@/data/demo';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/contexts/AppContext';
import { facilityText, cityIdForFacility } from '@/lib/facility-content';
import { cities, getCityLabel } from '@/data/demo';
import { translate } from '@/lib/i18n';
import { localize } from '@/lib/content';

export function FacilityCard({
  facility,
  favorite,
  onPress,
  onToggleFavorite,
  compact = false,
}: {
  facility: PublicFacility | SampleFacility;
  favorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  compact?: boolean;
}) {
  const colors = useColors();
  const app = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const isPublished = 'localizedName' in facility;
  const name = isPublished ? facilityText(facility.localizedName, app.language) : localize(facility.name, app.language);
  const activityNames = isPublished
    ? facility.activities.map(activity => facilityText(activity, app.language))
    : [localize(facility.category, app.language)];
  const district = isPublished ? facilityText(facility.localizedDistrict, app.language) : localize(facility.district, app.language);
  const cityId = isPublished ? cityIdForFacility(facility.city) : facility.cityId;
  const city = isPublished
    ? cities.some(item => item.id === cityId) ? getCityLabel(cityId, app.language) : facility.city
    : localize(facility.city, app.language);
  const status = isPublished
    ? facility.openingStatus === 'open' ? t('openStatus') :
      facility.openingStatus === 'closed' ? t('closedStatus') : t('hoursNotPublished')
    : localize(facility.openUntil, app.language);
  const sessionCaption = isPublished
    ? facility.upcomingSessions.length === 0 ? t('noPublishedSessions') : `${facility.upcomingSessions.length} ${t('sessions')}`
    : localize(facility.gender, app.language);
  return (
    <View style={[styles.card, compact ? styles.compact : styles.full, { backgroundColor: colors.card }]}>
      <View style={[styles.imageWrap, { backgroundColor: colors.secondary }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name}
          onPress={onPress}
          style={({ pressed }) => [StyleSheet.absoluteFill, { opacity: pressed ? 0.95 : 1 }]}
        >
          {isPublished
            ? <View style={styles.imagePlaceholder}><Ionicons name="fitness-outline" size={36} color={colors.primary} /></View>
            : <Image source={facility.image} style={styles.image} resizeMode="cover" />}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorite ? t('removeSavedPlace') : t('savePlace')}
          onPress={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          style={styles.favoriteButton}
        >
          <Ionicons
            name={favorite ? 'heart' : 'heart-outline'}
            size={19}
            color={favorite ? '#cf5a4d' : '#18352b'}
          />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.details}>
          <Text style={[styles.category, { color: colors.mutedForeground }]}>
            {activityNames.join(' · ')}
          </Text>
          <Text style={[styles.name, { color: colors.foreground }]}>
            {name}
          </Text>
          <View style={styles.meta}>
            <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {district} · {city}
            </Text>
          </View>
          <View style={styles.bottomRow}>
            <View style={[styles.genderPill, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.genderText, { color: colors.secondaryForeground }]}>
                {sessionCaption}
              </Text>
            </View>
            <Text style={[styles.openText, { color: !isPublished || facility.openingStatus === 'open' ? colors.primary : colors.mutedForeground }]}>
              {status}
            </Text>
          </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e4e8dc',
  },
  compact: { width: 290, marginEnd: 14 },
  full: { width: '100%', marginBottom: 14 },
  imageWrap: { height: 110, position: 'relative' },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 38,
    height: 38,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  details: { padding: 15 },
  category: { fontSize: 12, fontWeight: '600', marginBottom: 5 },
  name: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 7, gap: 4 },
  metaText: { fontSize: 12, fontWeight: '500' },
  bottomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 6,
  },
  genderPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 11 },
  genderText: { fontSize: 10, fontWeight: '700' },
  openText: { fontSize: 10, fontWeight: '700' },
});
