import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import { router } from 'expo-router';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { getCityLabel } from '@/data/demo';
import { languageName, translate, type Language } from '@/lib/i18n';
import { reviewCopy } from '@/lib/reviews-copy';

export default function ProfileScreen() {
  const colors = useColors();
  const app = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const languages: Language[] = ['en', 'ar', 'ku'];

  return (
    <ScreenShell>
      <ScreenHeader eyebrow={t('yourAccount')} title={t('profile')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable testID="open-account" onPress={() => router.push('/account')} style={{ padding: 16 }}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>{app.signedIn ? 'Account & sign out' : 'Sign in / Create account'}</Text>
        </Pressable>
        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={styles.avatar}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>M</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>MaydanGO member</Text>
            <Text style={styles.memberMeta}>{getCityLabel(app.selectedCityId, app.language)} · {t('memberNote')}</Text>
          </View>
          <View style={styles.memberBadge}>
            <Ionicons name="checkmark" size={13} color={colors.primary} />
          </View>
        </View>
        <Pressable
          onPress={() => router.push('/membership')}
          style={[styles.membershipRow, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="card-outline" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('membership')}</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>MaydanGO {app.membershipTier} · Preview</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
        </Pressable>
        <Pressable
          testID="profile-fitness-challenges"
          accessibilityRole="button"
          accessibilityLabel={translate(app.language, 'fitnessChallenges')}
          onPress={() => router.push('/fitness-challenges')}
          style={[styles.membershipRow, { backgroundColor: colors.card, borderColor: colors.border, marginTop: -12 }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="walk-outline" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>{translate(app.language, 'fitnessChallenges')}</Text>
            <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{translate(app.language, 'fitnessEyebrow')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('settings')}</Text>
        <View style={[styles.languageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.languageHeader}>
            <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="language-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>{t('language')}</Text>
              <Text raw style={[styles.rowSub, { color: colors.mutedForeground }]}>English · العربية · کوردی</Text>
            </View>
          </View>
          <View style={styles.languageOptions}>
            {languages.map((language) => {
              const selected = app.language === language;
              return (
                <Pressable
                  key={language}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => app.setLanguage(language)}
                  style={[
                    styles.languageOption,
                    { backgroundColor: selected ? colors.primary : colors.secondary },
                  ]}
                >
                  <Text raw style={[styles.languageText, { color: selected ? colors.primaryForeground : colors.secondaryForeground }]}>
                    {languageName(language)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.menuList}>
          <MenuRow icon="heart-outline" label={t('favorites')} value={`${app.favorites.length}`} colors={colors} onPress={() => router.push('/explore')} />
          <MenuRow icon="star-outline" label={reviewCopy(app.language, 'title')} colors={colors} onPress={() => router.push('/reviews')} />
          <MenuRow icon="help-circle-outline" label={t('help')} colors={colors} onPress={() => router.push('/support')} />
          <MenuRow icon="shield-checkmark-outline" label={t('deviceSecurity')} colors={colors} onPress={() => router.push('/device-security')} last />
        </View>
        <View style={styles.footer}>
          <Text style={[styles.footerBrand, { color: colors.primary }]}>MaydanGO</Text>
          <Text style={[styles.footerTagline, { color: colors.mutedForeground }]}>{t('guests')}</Text>
          <Text style={[styles.previewTag, { color: colors.mutedForeground }]}>{t('demoMode')}</Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function MenuRow({
  icon,
  label,
  value,
  colors,
  onPress,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.menuRow, !last && { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={[styles.rowTitle, { color: colors.foreground, flex: 1 }]}>{label}</Text>
      {value ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 45 },
  profileCard: { borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 17, backgroundColor: '#c6e57d', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '900' },
  name: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  memberMeta: { color: '#d1ddcf', fontSize: 10, marginTop: 4 },
  memberBadge: { width: 24, height: 24, backgroundColor: '#c6e57d', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  membershipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderWidth: 1, borderRadius: 18, marginBottom: 22 },
  rowIcon: { width: 39, height: 39, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 12, fontWeight: '800' },
  rowSub: { fontSize: 10, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 11 },
  languageCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 13 },
  languageHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  languageOptions: { flexDirection: 'row', gap: 7, marginTop: 13 },
  languageOption: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12 },
  languageText: { fontSize: 11, fontWeight: '800' },
  menuList: { borderRadius: 18, backgroundColor: '#ffffff', paddingHorizontal: 13, borderWidth: 1, borderColor: '#e4e8dc' },
  menuRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11 },
  footer: { alignItems: 'center', paddingTop: 25 },
  footerBrand: { fontSize: 18, fontWeight: '900', letterSpacing: -0.4 },
  footerTagline: { fontSize: 11, marginTop: 4 },
  previewTag: { fontSize: 9, marginTop: 18, letterSpacing: 0.3 },
});
