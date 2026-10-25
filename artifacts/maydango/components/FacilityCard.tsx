import React from 'react';
import {
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import type { Facility } from '@/data/demo';
import { useColors } from '@/hooks/useColors';

export function FacilityCard({
  facility,
  favorite,
  onPress,
  onToggleFavorite,
  compact = false,
}: {
  facility: Facility;
  favorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  compact?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.card, compact ? styles.compact : styles.full, { backgroundColor: colors.card }]}>
      <View style={styles.imageWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${facility.name}, ${facility.category}`}
          onPress={onPress}
          style={({ pressed }) => [StyleSheet.absoluteFill, { opacity: pressed ? 0.95 : 1 }]}
        >
          <Image source={facility.image} style={styles.image} resizeMode="cover" />
          <View pointerEvents="none" style={styles.imageShade} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorite ? 'Remove saved place' : 'Save place'}
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
        <View pointerEvents="none" style={styles.ratingPill}>
          <Ionicons name="star" size={12} color="#d7a531" />
          <Text style={styles.ratingText}>{facility.rating}</Text>
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.details}>
          <Text style={[styles.category, { color: colors.mutedForeground }]}>
            {facility.category}
          </Text>
          <Text style={[styles.name, { color: colors.foreground }]}>
            {facility.name}
          </Text>
          <View style={styles.meta}>
            <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {facility.district} · {facility.city} · {facility.distance}
            </Text>
          </View>
          <View style={styles.bottomRow}>
            <View style={[styles.genderPill, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.genderText, { color: colors.secondaryForeground }]}>
                {facility.gender}
              </Text>
            </View>
            <Text style={[styles.openText, { color: colors.primary }]}>
              {facility.openUntil}
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
  imageWrap: { height: 160, position: 'relative' },
  image: { width: '100%', height: '100%' },
  imageShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18,36,28,0.08)',
  },
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
  ratingPill: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
  },
  ratingText: { color: '#18352b', fontSize: 12, fontWeight: '700' },
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
