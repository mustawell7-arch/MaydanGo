import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate, type MessageKey } from '@/lib/i18n';

/** Explicit "this is local preview only" notice placed at action points. */
export function LocalNotice({ messageKey, icon = 'information-circle-outline' }: { messageKey: MessageKey; icon?: keyof typeof Ionicons.glyphMap }) {
  const colors = useColors();
  const { language } = useApp();
  return (
    <View accessibilityRole="text" style={[styles.notice, { backgroundColor: colors.muted }]}>
      <Ionicons name={icon} size={15} color={colors.mutedForeground} />
      <Text style={[styles.noticeText, { color: colors.mutedForeground, textAlign: language === 'en' ? 'left' : 'right' }]}>
        {translate(language, messageKey)}
      </Text>
    </View>
  );
}

/** Surfaces device-storage failures instead of pretending a save worked. */
export function StorageBanner() {
  const colors = useColors();
  const app = useApp();
  if (!app.storageError) return null;
  const t = (k: MessageKey) => translate(app.language, k);
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: colors.destructive }]}>
      <Ionicons name="warning-outline" size={16} color={colors.destructiveForeground} />
      <Text style={[styles.bannerText, { color: colors.destructiveForeground, textAlign: app.language === 'en' ? 'left' : 'right' }]}>
        {app.storageError === 'save' ? t('storageSaveError') : t('storageLoadError')}
      </Text>
      {app.storageError === 'save' ? (
        <Pressable accessibilityRole="button" onPress={app.retrySave} hitSlop={8} style={styles.bannerBtn}>
          <Text style={[styles.bannerBtnText, { color: colors.destructiveForeground }]}>{t('tryAgain')}</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={t('dismiss')} onPress={app.dismissStorageError} hitSlop={8}>
        <Ionicons name="close" size={16} color={colors.destructiveForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', padding: 11, borderRadius: 13, marginTop: 10 },
  noticeText: { flex: 1, fontSize: 10, lineHeight: 15 },
  banner: { marginHorizontal: 16, marginBottom: 8, borderRadius: 13, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerText: { flex: 1, fontSize: 10, lineHeight: 14, fontWeight: '600' },
  bannerBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)' },
  bannerBtnText: { fontSize: 10, fontWeight: '800' },
});
