import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  getGetMemberActivitySyncQueryKey,
  useAcceptMemberActivitySync,
  useDeleteMemberActivitySyncData,
  useGetMemberActivitySync,
  useRevokeMemberActivitySync,
  useSyncMemberAppleHealthActivity,
  useSyncMemberHealthConnectActivity,
} from '@workspace/api-client-react';
import { Ionicons } from '@expo/vector-icons';
import { Text, Pressable } from '@/components/Localized';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import {
  buildHealthActivityDailySummaries,
  getHealthActivitySyncRange,
} from '@/lib/health-activity-sync';
import { translate, type MessageKey } from '@/lib/i18n';

type ConfirmAction = 'delete' | 'revoke' | null;

export default function ActivitySyncScreen() {
  const colors = useColors();
  const app = useApp();
  const queryClient = useQueryClient();
  const query = useGetMemberActivitySync({
    query: { enabled: app.signedIn === true },
  });
  const accept = useAcceptMemberActivitySync();
  const revoke = useRevokeMemberActivitySync();
  const deleteData = useDeleteMemberActivitySyncData();
  const appleHealthSync = useSyncMemberAppleHealthActivity();
  const healthConnectSync = useSyncMemberHealthConnectActivity();
  const [consentChecked, setConsentChecked] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [actionError, setActionError] = useState(false);
  const [healthSyncRunning, setHealthSyncRunning] = useState(false);
  const t = (key: MessageKey) => translate(app.language, key);
  const rtlText = app.language === 'en' ? undefined : styles.rtlText;
  const status = query.data?.consent.status ?? 'not_enabled';
  const enabled = status === 'enabled';
  const healthProvider = Platform.OS === 'ios'
    ? 'apple_health'
    : Platform.OS === 'android' ? 'health_connect' : null;
  const busy = accept.isPending || revoke.isPending || deleteData.isPending
    || appleHealthSync.isPending || healthConnectSync.isPending || healthSyncRunning;
  const activeHealthSyncPending = healthProvider === 'apple_health'
    ? appleHealthSync.isPending
    : healthConnectSync.isPending;
  const healthProviderTitle = t(
    healthProvider === 'health_connect'
      ? 'activitySyncHealthConnectTitle'
      : healthProvider === 'apple_health' ? 'activitySyncAppleTitle' : 'activitySyncProviderTitle',
  );
  const healthConnectionHint = t(
    Platform.OS === 'ios'
      ? 'activitySyncConnectionHint'
      : Platform.OS === 'android' ? 'activitySyncHealthConnectHint' : 'activitySyncWebHint',
  );
  const healthPermissionNote = t(
    healthProvider === 'health_connect'
      ? 'activitySyncHealthConnectPermissionNote'
      : 'activitySyncApplePermissionNote',
  );
  const healthProviderUnavailable = healthProvider === 'health_connect'
    ? 'activitySyncHealthConnectUnavailable'
    : 'activitySyncHealthKitUnavailable';
  const healthProviderSyncComplete = healthProvider === 'health_connect'
    ? 'activitySyncHealthConnectSyncComplete'
    : 'activitySyncAppleSyncComplete';

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetMemberActivitySyncQueryKey() });
  };

  const run = async (action: () => Promise<unknown>, successKey: MessageKey) => {
    if (busy) return;
    setActionError(false);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice(successKey);
      setConsentChecked(false);
      setConfirmAction(null);
    } catch {
      setActionError(true);
    }
  };

  const syncHealthProvider = async () => {
    if (busy) return;
    if (!healthProvider) {
      setNotice('activitySyncWebHint');
      return;
    }
    setActionError(false);
    setNotice(null);
    setHealthSyncRunning(true);
    try {
      const {
        default: HealthKit,
        QuantityType,
        StatisticsOption,
        Unit,
        WorkoutType,
      } = await import('@appeeky/expo-healthkit');
      if (!HealthKit.isAvailable()) {
        setNotice(healthProviderUnavailable);
        return;
      }

      await HealthKit.requestAuthorization({
        toRead: [QuantityType.stepCount, WorkoutType.workout],
      });
      const range = getHealthActivitySyncRange();
      const [stepStatistics, workouts] = await Promise.all([
        HealthKit.queryStatisticsCollection({
          type: QuantityType.stepCount,
          unit: Unit.count,
          from: range.from,
          to: range.to,
          interval: { day: 1 },
          options: StatisticsOption.cumulativeSum,
        }),
        HealthKit.queryWorkouts({ from: range.from, to: range.to, ascending: true }),
      ]);
      const summaries = buildHealthActivityDailySummaries(
        stepStatistics,
        workouts,
        range.firstDay,
        range.today,
      );
      if (summaries.length === 0) {
        setNotice('activitySyncHealthAppNoData');
        return;
      }

      if (healthProvider === 'apple_health') {
        await appleHealthSync.mutateAsync({ data: { summaries } });
      } else {
        await healthConnectSync.mutateAsync({ data: { summaries } });
      }
      await refresh();
      setNotice(healthProviderSyncComplete);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/ExpoHealthKit|native module/i.test(message)) {
        setNotice('activitySyncNativeBuildRequired');
      } else {
        setActionError(true);
      }
    } finally {
      setHealthSyncRunning(false);
    }
  };

  const formatDate = (value: string) => new Intl.DateTimeFormat(app.language, {
    dateStyle: 'medium',
    timeZone: 'Asia/Baghdad',
  }).format(new Date(value));

  return (
    <ScreenShell sample={false}>
      <ScreenHeader eyebrow={t('activitySyncEyebrow')} title={t('activitySyncTitle')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="footsteps-outline" size={25} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.primaryForeground }, rtlText]}>
            {t('activitySyncIntro')}
          </Text>
          <Text style={[styles.heroBody, { color: colors.primaryForeground }, rtlText]}>
            {t('activitySyncScope')}
          </Text>
          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.accent} />
            <Text style={[styles.privacyText, { color: colors.primaryForeground }, rtlText]}>
              {t('activitySyncPrivacy')}
            </Text>
          </View>
        </View>

        {!app.signedIn ? (
          <View testID="activity-sync-guest" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }, rtlText]}>{t('activitySyncSignInTitle')}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }, rtlText]}>{t('activitySyncSignInHint')}</Text>
            <ActionButton
              testID="activity-sync-account"
              label={t('activitySyncAccountAction')}
              colors={colors}
              onPress={() => router.push('/account')}
            />
          </View>
        ) : query.isLoading ? (
          <View testID="activity-sync-loading" style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.mutedForeground }}>{t('activitySyncLoading')}</Text>
          </View>
        ) : query.isError ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }, rtlText]}>
              {t('activitySyncError')}
            </Text>
            <ActionButton testID="activity-sync-retry" label={t('fitnessRetry')} colors={colors} onPress={() => { void query.refetch(); }} />
          </View>
        ) : (
          <>
            <View testID="activity-sync-settings" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }, rtlText]}>{t('activitySyncStatus')}</Text>
              <Text
                testID="activity-sync-status"
                accessibilityLiveRegion="polite"
                style={[styles.statusText, { color: enabled ? colors.primary : colors.mutedForeground }, rtlText]}
              >
                {t(enabled ? 'activitySyncEnabledStatus' : status === 'revoked' ? 'activitySyncRevokedStatus' : 'activitySyncNotEnabledStatus')}
              </Text>
              <Text style={[styles.body, { color: colors.mutedForeground }, rtlText]}>
                {healthConnectionHint}
              </Text>

              {!enabled ? (
                <>
                  <Pressable
                    testID="activity-sync-consent-checkbox"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: consentChecked }}
                    onPress={() => setConsentChecked(value => !value)}
                    style={styles.checkboxRow}
                  >
                    <Ionicons
                      name={consentChecked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={consentChecked ? colors.primary : colors.mutedForeground}
                    />
                    <Text style={[styles.body, { color: colors.foreground }, rtlText]}>{t('activitySyncConsent')}</Text>
                  </Pressable>
                  <ActionButton
                    testID="activity-sync-enable"
                    label={t('activitySyncEnable')}
                    colors={colors}
                    disabled={!consentChecked || busy}
                    onPress={() => void run(
                      () => accept.mutateAsync({ data: { accept: true, policyVersion: 'v2' } }),
                      'activitySyncEnabled',
                    )}
                  />
                </>
              ) : (
                <View style={[styles.noticeBox, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
                  <Text style={[styles.body, { color: colors.foreground }, rtlText]}>{t('activitySyncEnabled')}</Text>
                </View>
              )}
            </View>

            {enabled ? (
              <View testID="activity-sync-health-provider" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }, rtlText]}>{healthProviderTitle}</Text>
                <Text style={[styles.body, { color: colors.mutedForeground }, rtlText]}>
                  {healthProvider ? healthPermissionNote : healthConnectionHint}
                </Text>
                {healthProvider ? (
                  <ActionButton
                    testID={healthProvider === 'apple_health' ? 'activity-sync-apple-connect' : 'activity-sync-health-connect'}
                    label={healthSyncRunning || activeHealthSyncPending ? t('activitySyncSyncing') : t(healthProvider === 'apple_health' ? 'activitySyncSyncNow' : 'activitySyncHealthConnectSyncNow')}
                    colors={colors}
                    disabled={busy}
                    onPress={() => void syncHealthProvider()}
                  />
                ) : null}
              </View>
            ) : null}

            <View testID="activity-sync-data" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }, rtlText]}>{t('activitySyncDataTitle')}</Text>
              {(query.data?.records.length ?? 0) === 0 ? (
                <Text style={[styles.body, { color: colors.mutedForeground }, rtlText]}>{t('activitySyncNoData')}</Text>
              ) : query.data?.records.map(record => (
                <View key={`${record.source}-${record.activityDate}`} style={[styles.record, { borderColor: colors.border }]}>
                  <View style={styles.recordTop}>
                    <Text style={[styles.recordDate, { color: colors.foreground }, rtlText]}>{formatDate(record.activityDate)}</Text>
                    <Text style={[styles.source, { color: colors.mutedForeground }]}>
                      {t(record.source === 'apple_health' ? 'activitySyncSourceApple' : 'activitySyncSourceAndroid')}
                    </Text>
                  </View>
                  {record.steps !== null ? (
                    <Text style={[styles.body, { color: colors.foreground }, rtlText]}>
                      {t('activitySyncSteps')}: {record.steps.toLocaleString(app.language)}
                    </Text>
                  ) : null}
                  <Text style={[styles.body, { color: colors.foreground }, rtlText]}>
                    {t('activitySyncWorkouts')}: {record.completedWorkouts}
                  </Text>
                </View>
              ))}
              {(query.data?.records.length ?? 0) > 0 && !confirmAction ? (
                <ActionButton
                  testID="activity-sync-delete-data"
                  label={t('activitySyncDeleteData')}
                  colors={colors}
                  tone="quiet"
                  disabled={busy}
                  onPress={() => setConfirmAction('delete')}
                />
              ) : null}
              {confirmAction === 'delete' ? (
                <Confirmation
                  testID="activity-sync-delete-confirm"
                  text={t('activitySyncDeleteConfirm')}
                  confirmLabel={t('activitySyncConfirmDelete')}
                  cancelLabel={t('activitySyncCancel')}
                  colors={colors}
                  disabled={busy}
                  onCancel={() => setConfirmAction(null)}
                  onConfirm={() => void run(() => deleteData.mutateAsync(), 'activitySyncDataDeleted')}
                />
              ) : null}
            </View>

            {enabled ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {confirmAction !== 'revoke' ? (
                  <ActionButton
                    testID="activity-sync-revoke"
                    label={t('activitySyncRevoke')}
                    colors={colors}
                    tone="danger"
                    disabled={busy}
                    onPress={() => setConfirmAction('revoke')}
                  />
                ) : (
                  <Confirmation
                    testID="activity-sync-revoke-confirm"
                    text={t('activitySyncRevokeConfirm')}
                    confirmLabel={t('activitySyncConfirmRevoke')}
                    cancelLabel={t('activitySyncCancel')}
                    colors={colors}
                    disabled={busy}
                    onCancel={() => setConfirmAction(null)}
                    onConfirm={() => void run(() => revoke.mutateAsync(), 'activitySyncRevoked')}
                  />
                )}
              </View>
            ) : null}

            {query.data?.consentHistory.length ? (
              <View testID="activity-sync-history" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }, rtlText]}>{t('activitySyncHistory')}</Text>
                {query.data.consentHistory.map((event, index) => (
                  <View key={`${event.recordedAt}-${index}`} style={[styles.historyRow, { borderColor: colors.border }]}>
                    <Text style={[styles.body, { color: colors.foreground }, rtlText]}>
                      {t(event.action === 'accepted' ? 'activitySyncAccepted' : 'activitySyncRevokedAction')} · {event.policyVersion}
                    </Text>
                    <Text style={[styles.source, { color: colors.mutedForeground }]}>{formatDate(event.recordedAt)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}

        {actionError ? (
          <Text testID="activity-sync-action-error" accessibilityRole="alert" style={[styles.error, { color: colors.destructive }, rtlText]}>
            {t('activitySyncActionError')}
          </Text>
        ) : null}
        {notice ? (
          <Text testID="activity-sync-notice" accessibilityLiveRegion="polite" style={[styles.notice, { color: colors.primary }, rtlText]}>
            {t(notice)}
          </Text>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

function ActionButton({
  testID,
  label,
  colors,
  onPress,
  disabled = false,
  tone = 'primary',
}: {
  testID: string;
  label: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'quiet' | 'danger';
}) {
  const backgroundColor = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.destructive : colors.muted;
  const foregroundColor = tone === 'quiet' ? colors.primary : colors.primaryForeground;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor, opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={[styles.buttonText, { color: foregroundColor }]}>{label}</Text>
    </Pressable>
  );
}

function Confirmation({
  testID,
  text,
  confirmLabel,
  cancelLabel,
  colors,
  disabled,
  onCancel,
  onConfirm,
}: {
  testID: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  colors: ReturnType<typeof useColors>;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View testID={testID} style={[styles.confirmation, { backgroundColor: colors.secondary }]}>
      <Text style={[styles.body, { color: colors.foreground }]}>{text}</Text>
      <View style={styles.confirmActions}>
        <ActionButton testID={`${testID}-cancel`} label={cancelLabel} colors={colors} tone="quiet" disabled={disabled} onPress={onCancel} />
        <ActionButton testID={`${testID}-submit`} label={confirmLabel} colors={colors} tone="danger" disabled={disabled} onPress={onConfirm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 38, gap: 14 },
  hero: { borderRadius: 24, padding: 22, gap: 13, overflow: 'hidden' },
  heroIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 20, fontWeight: '800', lineHeight: 29 },
  heroBody: { fontSize: 14, lineHeight: 22 },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 3 },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 17, gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  statusText: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21, flex: 1 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 3 },
  button: { minHeight: 46, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  noticeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 14, padding: 12 },
  record: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  recordTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  recordDate: { fontSize: 14, fontWeight: '700', flex: 1 },
  source: { fontSize: 12, lineHeight: 18 },
  historyRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, gap: 2 },
  confirmation: { borderRadius: 14, padding: 12, gap: 12 },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  loading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 12 },
  error: { fontSize: 14, fontWeight: '600' },
  notice: { fontSize: 14, fontWeight: '600', lineHeight: 21 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});
