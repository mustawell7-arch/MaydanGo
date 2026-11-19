import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  getGetMemberFitnessChallengesQueryKey,
  useGetMemberFitnessChallenges,
  useJoinMemberFitnessChallenge,
  useLeaveMemberFitnessChallenge,
  useLogMemberFitnessChallengeToday,
  useUndoMemberFitnessChallengeToday,
  type MemberFitnessChallenge,
} from '@workspace/api-client-react';
import { Ionicons } from '@expo/vector-icons';
import { Text, Pressable } from '@/components/Localized';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate, type MessageKey } from '@/lib/i18n';

export default function FitnessChallengesScreen() {
  const colors = useColors();
  const app = useApp();
  const queryClient = useQueryClient();
  const query = useGetMemberFitnessChallenges({
    query: {
      enabled: app.signedIn,
      queryKey: getGetMemberFitnessChallengesQueryKey(),
    },
  });
  const joinMutation = useJoinMemberFitnessChallenge();
  const leaveMutation = useLeaveMemberFitnessChallenge();
  const logMutation = useLogMemberFitnessChallengeToday();
  const undoMutation = useUndoMemberFitnessChallengeToday();
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const t = (key: MessageKey, values?: Record<string, string | number>) => {
    let value = translate(app.language, key);
    Object.entries(values ?? {}).forEach(([name, replacement]) => {
      value = value.replace(`{${name}}`, String(replacement));
    });
    return value;
  };
  const today = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Baghdad',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }, []);

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(false);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: getGetMemberFitnessChallengesQueryKey() });
      setLeavingId(null);
    } catch {
      setActionError(true);
    }
  };

  const challenges = (query.data ?? []).filter(
    (challenge) => challenge.status === 'published' || challenge.joined,
  );
  const busy = joinMutation.isPending || leaveMutation.isPending || logMutation.isPending || undoMutation.isPending;
  const rtlText = app.language === 'en' ? undefined : styles.rtlText;

  return (
    <ScreenShell sample={false}>
      <ScreenHeader eyebrow={t('fitnessEyebrow')} title={t('fitnessChallenges')} />
      <ScrollView
        testID="fitness-challenges-scroll"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroOrbitLarge} />
          <View style={styles.heroOrbitSmall} />
          <View style={[styles.heroMark, { backgroundColor: colors.accent }]}>
            <Ionicons name="leaf-outline" size={23} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.primaryForeground }, rtlText]}>{t('fitnessEyebrow')}</Text>
          <Text style={[styles.heroText, { color: colors.primaryForeground }, rtlText]}>{t('fitnessIntro')}</Text>
          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.accent} />
            <Text style={[styles.privacyText, { color: colors.primaryForeground }, rtlText]}>{t('fitnessPrivacy')}</Text>
          </View>
        </View>

        <View style={[styles.countingNote, { backgroundColor: colors.accent }]}>
          <View style={[styles.noteIcon, { backgroundColor: colors.card }]}>
            <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.noteText, { color: colors.foreground }, rtlText]}>{t('fitnessCounting')}</Text>
        </View>

        {actionError ? (
          <View
            testID="fitness-action-error"
            accessibilityRole="alert"
            style={[styles.errorInline, { backgroundColor: colors.card, borderColor: colors.destructive }]}
          >
            <Ionicons name="alert-circle-outline" size={18} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{t('fitnessActionError')}</Text>
          </View>
        ) : null}

        {!app.signedIn ? (
          <View testID="fitness-guest-state" style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="person-circle-outline" size={25} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('fitnessSignInTitle')}</Text>
            <Text style={[styles.emptyDescription, { color: colors.mutedForeground }]}>{t('fitnessSignInHint')}</Text>
            <Pressable
              testID="fitness-account-from-guest"
              accessibilityRole="button"
              accessibilityLabel={t('fitnessAccountAction')}
              onPress={() => router.push('/account')}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{t('fitnessAccountAction')}</Text>
            </Pressable>
          </View>
        ) : query.isLoading ? (
          <View testID="fitness-loading" accessibilityLabel={t('fitnessLoading')} style={styles.loading}>
            <View style={[styles.skeleton, { backgroundColor: colors.muted }]} />
            <View style={[styles.skeleton, styles.skeletonShort, { backgroundColor: colors.muted }]} />
            <View style={[styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }]} />
          </View>
        ) : query.isError ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="cloud-offline-outline" size={23} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('fitnessError')}</Text>
            <Text style={[styles.emptyDescription, { color: colors.mutedForeground }]}>{t('fitnessErrorHint')}</Text>
            <Pressable
              testID="fitness-account-from-error"
              accessibilityRole="button"
              accessibilityLabel={t('fitnessAccountAction')}
              onPress={() => router.push('/account')}
              style={[styles.secondaryButton, { backgroundColor: colors.muted }]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>{t('fitnessAccountAction')}</Text>
            </Pressable>
            <Pressable
              testID="fitness-retry"
              accessibilityRole="button"
              accessibilityLabel={t('fitnessRetry')}
              onPress={() => { void query.refetch(); }}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{t('fitnessRetry')}</Text>
            </Pressable>
          </View>
        ) : challenges.length === 0 ? (
          <View testID="fitness-empty" style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="sunny-outline" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('fitnessEmptyTitle')}</Text>
            <Text style={[styles.emptyDescription, { color: colors.mutedForeground }]}>{t('fitnessEmpty')}</Text>
          </View>
        ) : (
          <View style={styles.challengeList}>
            {challenges.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                today={today}
                language={app.language}
                colors={colors}
                t={t}
                busy={busy}
                leaving={leavingId === challenge.id}
                onJoin={() => void runAction(() => joinMutation.mutateAsync({ challengeId: challenge.id }))}
                onLeave={() => {
                  if (leavingId === challenge.id) {
                    void runAction(() => leaveMutation.mutateAsync({ challengeId: challenge.id }));
                  } else {
                    setLeavingId(challenge.id);
                    setActionError(false);
                  }
                }}
                onCancelLeave={() => setLeavingId(null)}
                onLog={() => void runAction(() => logMutation.mutateAsync({ challengeId: challenge.id }))}
                onUndo={() => void runAction(() => undoMutation.mutateAsync({ challengeId: challenge.id }))}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

type Colors = ReturnType<typeof useColors>;
type Copy = (key: MessageKey, values?: Record<string, string | number>) => string;

function ChallengeCard({
  challenge,
  today,
  language,
  colors,
  t,
  busy,
  leaving,
  onJoin,
  onLeave,
  onCancelLeave,
  onLog,
  onUndo,
}: {
  challenge: MemberFitnessChallenge;
  today: string;
  language: 'en' | 'ar' | 'ku';
  colors: Colors;
  t: Copy;
  busy: boolean;
  leaving: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onCancelLeave: () => void;
  onLog: () => void;
  onUndo: () => void;
}) {
  const title = challenge.localizedTitle[language] || challenge.localizedTitle.en;
  const description = challenge.localizedDescription[language] || challenge.localizedDescription.en;
  const rtlText = language === 'en' ? undefined : styles.rtlText;
  const selfLoggedToday = challenge.selfLoggedDates.includes(today);
  const verifiedToday = challenge.verifiedAttendanceDates.includes(today);
  const progress = Math.min(100, Math.round((challenge.activeDays / Math.max(1, challenge.goalActiveDays)) * 100));
  const locale = language === 'ar' ? 'ar' : language === 'ku' ? 'ckb' : 'en';
  const formatDate = (date: string) => {
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime())
      ? date
      : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(parsed);
  };
  const canActOnChallenge = challenge.status === 'published';
  const canJoin = canActOnChallenge && challenge.canJoin;
  const todayCanBeLogged = challenge.joined && canActOnChallenge && challenge.canLogToday && !verifiedToday;
  const showSelfLoggedSource = challenge.status === 'archived'
    ? challenge.selfLoggedDates.length > 0
    : selfLoggedToday;
  const showVerifiedSource = challenge.status === 'archived'
    ? challenge.verifiedAttendanceDates.length > 0
    : verifiedToday;

  return (
    <View testID={`fitness-challenge-${challenge.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.cardGlyph, { backgroundColor: colors.secondary }]}>
          <Ionicons name="trail-sign-outline" size={20} color={colors.primary} />
        </View>
        {challenge.joined ? (
          <View style={[styles.joinedBadge, { backgroundColor: colors.muted }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
            <Text style={[styles.joinedText, { color: colors.primary }]}>
              {challenge.status === 'archived' ? t('fitnessArchived') : t('fitnessJoined')}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.cardTitle, { color: colors.foreground }, rtlText]}>{title}</Text>
      <Text style={[styles.cardDescription, { color: colors.mutedForeground }, rtlText]}>{description}</Text>
      <View style={styles.dateLine}>
        <Ionicons name="calendar-clear-outline" size={15} color={colors.mutedForeground} />
        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
          {t('fitnessDates', { start: formatDate(challenge.startDate), end: formatDate(challenge.endDate) })}
        </Text>
      </View>

      {challenge.joined ? (
        <View style={[styles.progressPanel, { backgroundColor: colors.background }]}>
          <View style={styles.progressMeta}>
            <Text
              testID={`fitness-progress-${challenge.id}`}
              accessibilityLabel={t('fitnessProgressLabel', { days: challenge.activeDays, goal: challenge.goalActiveDays })}
              style={[styles.progressCount, { color: colors.foreground }, rtlText]}
            >
              {t('fitnessDays', { count: challenge.activeDays })}
            </Text>
            <Text style={[styles.progressGoal, { color: colors.mutedForeground }, rtlText]}>{t('fitnessGoal', { count: challenge.goalActiveDays })}</Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('fitnessProgressLabel', { days: challenge.activeDays, goal: challenge.goalActiveDays })}
            accessibilityValue={{ min: 0, max: challenge.goalActiveDays, now: Math.min(challenge.activeDays, challenge.goalActiveDays) }}
            style={[styles.progressTrack, { backgroundColor: colors.muted }]}
          >
            <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
          </View>
          <View style={styles.sourceRow}>
            {showSelfLoggedSource ? <SourceTag icon="create-outline" label={t('fitnessLogged')} colors={colors} /> : null}
            {showVerifiedSource ? <SourceTag icon="shield-checkmark-outline" label={t('fitnessVerified')} colors={colors} /> : null}
          </View>
          <Text style={[styles.privateHint, { color: colors.mutedForeground }, rtlText]}>{t('fitnessPrivacy')}</Text>
        </View>
      ) : null}

      {!challenge.joined ? (
        <Pressable
          testID={`fitness-join-${challenge.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${t('fitnessJoin')}: ${title}`}
          accessibilityState={{ disabled: !canJoin || busy }}
          disabled={!canJoin || busy}
          onPress={onJoin}
          style={[styles.primaryButton, { backgroundColor: canJoin ? colors.primary : colors.muted }]}
        >
          <Text style={[styles.primaryButtonText, { color: canJoin ? colors.primaryForeground : colors.mutedForeground }]}>
            {canJoin ? t('fitnessJoin') : t('fitnessNotOpen')}
          </Text>
          {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : null}
        </Pressable>
      ) : (
        <>
          {selfLoggedToday && canActOnChallenge ? (
            <ActionButton
              testID={`fitness-undo-${challenge.id}`}
              label={t('fitnessUndoToday')}
              icon="arrow-undo-outline"
              colors={colors}
              disabled={busy}
              onPress={onUndo}
            />
          ) : todayCanBeLogged ? (
            <ActionButton
              testID={`fitness-log-${challenge.id}`}
              label={t('fitnessLogToday')}
              icon="add-circle-outline"
              colors={colors}
              disabled={busy}
              onPress={onLog}
              prominent
            />
          ) : verifiedToday ? (
            <View style={[styles.todayNote, { backgroundColor: colors.muted }]}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.todayNoteText, { color: colors.foreground }, rtlText]}>{t('fitnessNoLog')}</Text>
            </View>
          ) : canActOnChallenge && challenge.canLogToday ? null : (
            <View style={[styles.todayNote, { backgroundColor: colors.muted }]}>
              <Ionicons name="time-outline" size={18} color={colors.mutedForeground} />
              <Text style={[styles.todayNoteText, { color: colors.mutedForeground }, rtlText]}>{t('fitnessCompleted')}</Text>
            </View>
          )}
          {leaving ? (
            <View style={[styles.confirmBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.confirmText, { color: colors.foreground }, rtlText]}>{t('fitnessLeaveConfirm')}</Text>
              <View style={styles.confirmActions}>
                <Pressable
                  testID={`fitness-leave-confirm-${challenge.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('fitnessLeaveYes')}
                  disabled={busy}
                  onPress={onLeave}
                  style={[styles.confirmLeave, { backgroundColor: colors.destructive }]}
                >
                  <Text style={[styles.confirmLeaveText, { color: colors.destructiveForeground }]}>{t('fitnessLeaveYes')}</Text>
                </Pressable>
                <Pressable
                  testID={`fitness-leave-cancel-${challenge.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('fitnessKeep')}
                  onPress={onCancelLeave}
                  style={styles.keepButton}
                >
                  <Text style={[styles.keepText, { color: colors.primary }]}>{t('fitnessKeep')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              testID={`fitness-leave-${challenge.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${t('fitnessLeave')}: ${title}`}
              disabled={busy}
              onPress={onLeave}
              style={styles.leaveButton}
            >
              <Text style={[styles.leaveText, { color: colors.mutedForeground }]}>{t('fitnessLeave')}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

function SourceTag({ icon, label, colors }: { icon: keyof typeof Ionicons.glyphMap; label: string; colors: Colors }) {
  return (
    <View style={[styles.sourceTag, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name={icon} size={13} color={colors.primary} />
      <Text style={[styles.sourceText, { color: colors.foreground }]}>{label}</Text>
    </View>
  );
}

function ActionButton({
  testID,
  label,
  icon,
  colors,
  disabled,
  onPress,
  prominent = false,
}: {
  testID: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: Colors;
  disabled: boolean;
  onPress: () => void;
  prominent?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        {
          backgroundColor: prominent ? colors.primary : colors.card,
          borderColor: prominent ? colors.primary : colors.border,
        },
      ]}
    >
      <Ionicons name={icon} size={19} color={prominent ? colors.primaryForeground : colors.primary} />
      <Text style={[styles.actionText, { color: prominent ? colors.primaryForeground : colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 42 },
  rtlText: { textAlign: 'right' },
  hero: { overflow: 'hidden', borderRadius: 26, padding: 22, marginBottom: 13, minHeight: 250 },
  heroOrbitLarge: { position: 'absolute', width: 200, height: 200, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', top: -82, right: -40 },
  heroOrbitSmall: { position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', top: -46, right: -5 },
  heroMark: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', maxWidth: 270, textAlign: 'left' },
  heroText: { fontSize: 14, lineHeight: 21, opacity: 0.88, marginTop: 9, textAlign: 'left' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18 },
  privacyText: { fontSize: 12, lineHeight: 18, fontWeight: '700', flex: 1, textAlign: 'left' },
  countingNote: { padding: 15, borderRadius: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 18 },
  noteIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  noteText: { flex: 1, fontSize: 12, lineHeight: 19, fontWeight: '600', textAlign: 'left' },
  challengeList: { gap: 13 },
  card: { borderWidth: 1, borderRadius: 23, padding: 17 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cardGlyph: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  joinedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 30 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  joinedText: { fontSize: 10, fontWeight: '800' },
  cardTitle: { fontSize: 19, lineHeight: 25, fontWeight: '800', textAlign: 'left' },
  cardDescription: { fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: 'left' },
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 13 },
  dateText: { fontSize: 11, fontWeight: '600' },
  progressPanel: { borderRadius: 17, padding: 14, marginTop: 18 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  progressCount: { fontSize: 14, fontWeight: '800', textAlign: 'left' },
  progressGoal: { fontSize: 11, fontWeight: '600', textAlign: 'right' },
  progressTrack: { height: 8, borderRadius: 8, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', borderRadius: 8 },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  sourceTag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 30, paddingHorizontal: 8, paddingVertical: 5 },
  sourceText: { fontSize: 9, fontWeight: '700' },
  privateHint: { fontSize: 10, lineHeight: 15, marginTop: 10, textAlign: 'left' },
  primaryButton: { minHeight: 48, borderRadius: 15, paddingHorizontal: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 17 },
  primaryButtonText: { fontSize: 13, fontWeight: '800' },
  secondaryButton: { minHeight: 44, borderRadius: 14, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', marginTop: 10, width: '100%' },
  secondaryButtonText: { fontSize: 12, fontWeight: '800' },
  actionButton: { minHeight: 47, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  actionText: { fontSize: 12, fontWeight: '800' },
  todayNote: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, padding: 12, marginTop: 14 },
  todayNoteText: { flex: 1, fontSize: 11, lineHeight: 17, fontWeight: '600', textAlign: 'left' },
  leaveButton: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 14, marginTop: 4 },
  leaveText: { fontSize: 11, fontWeight: '700' },
  confirmBox: { borderWidth: 1, borderRadius: 16, padding: 13, marginTop: 10 },
  confirmText: { fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'left' },
  confirmActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 11 },
  confirmLeave: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  confirmLeaveText: { fontSize: 11, fontWeight: '800' },
  keepButton: { paddingVertical: 9, paddingHorizontal: 12 },
  keepText: { fontSize: 11, fontWeight: '800' },
  emptyState: { borderWidth: 1, borderRadius: 22, padding: 22, alignItems: 'center', marginTop: 2 },
  emptyIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 7, marginBottom: 5 },
  errorInline: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17, textAlign: 'left' },
  loading: { gap: 11 },
  skeleton: { height: 18, width: '64%', borderRadius: 9, marginTop: 3 },
  skeletonShort: { width: '42%', height: 12 },
  skeletonCard: { height: 195, borderRadius: 22, borderWidth: 1, marginTop: 5 },
});
