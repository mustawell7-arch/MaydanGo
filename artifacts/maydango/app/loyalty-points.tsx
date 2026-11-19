import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { getGetMemberLoyaltyPointsQueryKey, useGetMemberLoyaltyPoints } from '@workspace/api-client-react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text, Pressable } from '@/components/Localized';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate, type MessageKey } from '@/lib/i18n';

export default function LoyaltyPointsScreen() {
  const colors = useColors();
  const app = useApp();
  const query = useGetMemberLoyaltyPoints({
    query: {
      enabled: app.signedIn,
      queryKey: getGetMemberLoyaltyPointsQueryKey(),
    },
  });
  const t = (key: MessageKey) => translate(app.language, key);
  const rtlText = app.language === 'en' ? undefined : styles.rtlText;
  const locale = app.language === 'ar' ? 'ar-IQ' : app.language === 'ku' ? 'ckb-IQ' : 'en-IQ';
  const balance = query.data?.balance ?? 0;

  return (
    <ScreenShell sample={false}>
      <ScreenHeader eyebrow={t('loyaltyEyebrow')} title={t('loyaltyTitle')} />
      <ScrollView
        testID="loyalty-points-scroll"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="sparkles-outline" size={23} color={colors.primary} />
          </View>
          <Text style={[styles.heroLabel, { color: colors.primaryForeground }, rtlText]}>{t('loyaltyTitle')}</Text>
          {!app.signedIn ? (
            <Text style={[styles.heroDescription, { color: colors.primaryForeground }, rtlText]}>{t('loyaltySignInHint')}</Text>
          ) : query.isLoading ? (
            <ActivityIndicator
              testID="loyalty-loading"
              accessibilityLabel={t('loyaltyLoading')}
              color={colors.accent}
              style={styles.heroLoader}
            />
          ) : query.isError ? (
            <Text style={[styles.heroDescription, { color: colors.primaryForeground }, rtlText]}>{t('loyaltyError')}</Text>
          ) : (
            <View testID="loyalty-balance" accessibilityLabel={`${balance} ${t('loyaltyTitle')}`} style={styles.balanceRow}>
              <Text style={[styles.balance, { color: colors.primaryForeground }]}>{new Intl.NumberFormat(locale).format(balance)}</Text>
              <Text style={[styles.balanceUnit, { color: colors.primaryForeground }]}>{t('loyaltyTitle')}</Text>
            </View>
          )}
          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.accent} />
            <Text style={[styles.privacyText, { color: colors.primaryForeground }, rtlText]}>{t('loyaltyPrivacy')}</Text>
          </View>
        </View>

        <View style={[styles.ruleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.ruleIcon, { backgroundColor: colors.secondary }]}>
            <Ionicons name="checkmark-done-outline" size={19} color={colors.primary} />
          </View>
          <Text style={[styles.ruleText, { color: colors.foreground }, rtlText]}>{t('loyaltyIntro')}</Text>
          <Text style={[styles.noteText, { color: colors.mutedForeground }, rtlText]}>{t('loyaltyNotRedeemable')}</Text>
        </View>

        {!app.signedIn ? (
          <InfoState
            testID="loyalty-guest-state"
            icon="person-circle-outline"
            title={t('loyaltySignInTitle')}
            description={t('loyaltySignInHint')}
            action={t('loyaltyAccountAction')}
            onAction={() => router.push('/account')}
            colors={colors}
          />
        ) : query.isError ? (
          <InfoState
            testID="loyalty-error"
            icon="cloud-offline-outline"
            title={t('loyaltyError')}
            description={t('loyaltyErrorHint')}
            action={t('loyaltyRetry')}
            onAction={() => { void query.refetch(); }}
            colors={colors}
          />
        ) : query.isLoading ? null : balance === 0 ? (
          <InfoState
            testID="loyalty-empty"
            icon="sparkles-outline"
            title={t('loyaltyEmptyTitle')}
            description={t('loyaltyEmpty')}
            colors={colors}
          />
        ) : (
          <View style={styles.historySection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }, rtlText]}>{t('loyaltyHistory')}</Text>
            <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {query.data?.entries.map((entry, index) => {
                const title = entry.localizedTitle[app.language] || entry.localizedTitle.en;
                const source = entry.source === 'confirmed_visit' ? t('loyaltyVisit') : t('loyaltyCourse');
                const date = new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeZone: 'Asia/Baghdad',
                }).format(new Date(entry.earnedAt));
                return (
                  <View
                    key={entry.id}
                    testID={`loyalty-entry-${index}`}
                    style={[styles.historyRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
                  >
                    <View style={[styles.entryIcon, { backgroundColor: colors.secondary }]}>
                      <Ionicons
                        name={entry.source === 'confirmed_visit' ? 'location-outline' : 'book-outline'}
                        size={17}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.entryBody}>
                      <Text style={[styles.entryTitle, { color: colors.foreground }, rtlText]}>{title}</Text>
                      <Text style={[styles.entryMeta, { color: colors.mutedForeground }, rtlText]}>
                        {source}{entry.facility ? ` · ${entry.facility}` : ''} · {date}
                      </Text>
                    </View>
                    <Text style={[styles.pointValue, { color: colors.primary }]}>{t('loyaltyOnePoint')}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

function InfoState({
  testID,
  icon,
  title,
  description,
  action,
  onAction,
  colors,
}: {
  testID: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View testID={testID} style={[styles.infoState, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
        <Ionicons name={icon} size={24} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyDescription, { color: colors.mutedForeground }]}>{description}</Text>
      {action && onAction ? (
        <Pressable
          testID={`loyalty-action-${testID}`}
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.actionButtonText, { color: colors.primaryForeground }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 45 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  hero: { borderRadius: 24, padding: 20, marginBottom: 14, overflow: 'hidden' },
  heroIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroLabel: { marginTop: 18, fontSize: 14, fontWeight: '700' },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 2 },
  balance: { fontSize: 48, fontWeight: '800', letterSpacing: -1.3, lineHeight: 58 },
  balanceUnit: { fontSize: 13, fontWeight: '700' },
  heroDescription: { marginTop: 10, fontSize: 13, lineHeight: 20 },
  heroLoader: { alignSelf: 'flex-start', marginTop: 17 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 17 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 17 },
  ruleCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 22 },
  ruleIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 11 },
  ruleText: { fontSize: 14, fontWeight: '700', lineHeight: 21 },
  noteText: { marginTop: 10, fontSize: 12, lineHeight: 18 },
  historySection: { marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10 },
  historyCard: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14 },
  historyRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  entryIcon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  entryBody: { flex: 1 },
  entryTitle: { fontSize: 13, fontWeight: '700', lineHeight: 19 },
  entryMeta: { marginTop: 3, fontSize: 10, lineHeight: 15 },
  pointValue: { fontSize: 11, fontWeight: '800' },
  infoState: { alignItems: 'center', borderWidth: 1, borderRadius: 20, padding: 22 },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { marginTop: 6, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  actionButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 17, marginTop: 15 },
  actionButtonText: { fontSize: 12, fontWeight: '800' },
});
