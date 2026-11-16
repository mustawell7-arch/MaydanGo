import React, { useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Text, Pressable } from '@/components/Localized';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ScreenShell } from '@/components/ScreenShell';
import {
  getGetMemberCourseQueryKey, getGetMemberCoursesQueryKey,
  useCreateMemberCoursePlaybackLink, useEnrollMemberCourse, useGetMemberCourse, useUpdateCourseProgress,
} from '@workspace/api-client-react';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate, type MessageKey } from '@/lib/i18n';
import { errorCopy } from '@/lib/content';

export default function CourseDetailScreen() {
  const colors = useColors();
  const app = useApp();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseQuery = useGetMemberCourse(id);
  const course = courseQuery.data;
  const enrollMutation = useEnrollMemberCourse();
  const progressMutation = useUpdateCourseProgress();
  const playbackLinkMutation = useCreateMemberCoursePlaybackLink();
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const t = (key: MessageKey) => translate(app.language, key);
  const align = app.language === 'en' ? 'left' : 'right';
  const courseLanguageNames = {
    en: t('languageEnglish'),
    ar: t('languageArabic'),
    ku: t('languageSoraniKurdish'),
  };

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/online'))} style={styles.backButton}>
      <Ionicons name={app.language === 'en' ? 'arrow-back' : 'arrow-forward'} size={19} color={colors.accentForeground} />
    </Pressable>
  );

  if (courseQuery.isLoading) {
    return <ScreenShell><View style={styles.missing}>{back}<ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground }}>{t('coursesLoading')}</Text></View></ScreenShell>;
  }
  if (!course) {
    return (
      <ScreenShell>
        <View style={styles.missing}>
          {back}
          <Text style={[styles.title, { color: colors.foreground }]}>{t('courseMissing')}</Text>
        </View>
      </ScreenShell>
    );
  }

  const pct = course.lessonCount ? Math.round(course.completedLessons / course.lessonCount * 100) : 0;
  const ready = course.accessState === 'ready';
  const languageList = (languages: Array<'en' | 'ar' | 'ku'> | null | undefined) =>
    languages?.length
      ? languages.map(language => courseLanguageNames[language]).join(app.language === 'en' ? ', ' : '، ')
      : t('informationNotProvided');
  const subtitleSummary = course.subtitleLanguages == null
    ? t('informationNotProvided')
    : course.subtitleLanguages.length
      ? languageList(course.subtitleLanguages)
      : t('noSubtitles');
  const localizedDetail = (detail: { en: string; ar: string; ku: string } | null | undefined) =>
    detail?.[app.language]?.trim() || t('informationNotProvided');
  const saveProgress = async (lessonId: string, completed: boolean) => {
    try {
      await progressMutation.mutateAsync({ id: course.id, data: { lessonId, completed } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMemberCourseQueryKey(course.id) }),
        queryClient.invalidateQueries({ queryKey: getGetMemberCoursesQueryKey() }),
      ]);
    } catch (error) { setMessage(errorCopy(error)); }
  };
  const openRecording = async (lessonId: string) => {
    try {
      const playback = await playbackLinkMutation.mutateAsync({ id: course.id, lessonId });
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!domain) throw new Error('Course playback is unavailable. Try again later.');
      const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
      await Linking.openURL(new URL(playback.url, baseUrl).toString());
    } catch (error) { setMessage(errorCopy(error)); }
  };
  const enroll = async () => {
    try {
      await enrollMutation.mutateAsync({ id: course.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMemberCourseQueryKey(course.id) }),
        queryClient.invalidateQueries({ queryKey: getGetMemberCoursesQueryKey() }),
      ]);
      setMessage(t('enrolled'));
    } catch (error) { setMessage(errorCopy(error)); }
  };

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {course.thumbnailUrl
            ? <Image source={{ uri: course.thumbnailUrl }} style={styles.heroImage} resizeMode="cover" />
            : <View style={[styles.heroImage, styles.heroFallback, { backgroundColor: colors.secondary }]}><Ionicons name="fitness-outline" size={42} color={colors.primary} /></View>}
          <View style={styles.shade} />
          <View style={styles.heroTop}>{back}</View>
          <View style={styles.heroText}>
            <Text style={[styles.kicker, { textAlign: align }]}>{t(course.level === 'all-levels' ? 'allLevels' : course.level)} · {course.durationMinutes} {t('minutesShort')} · {course.lessonCount} {t('lessons')} · {course.localizedInstructor[app.language] || course.localizedInstructor.en}</Text>
            <Text style={[styles.heroTitle, { textAlign: align }]}>{course.localizedTitle[app.language] || course.localizedTitle.en}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <Text style={[styles.summary, { color: colors.foreground, textAlign: align }]}>{course.localizedSummary[app.language] || course.localizedSummary.en}</Text>
          <View style={{ marginTop: 14, marginBottom: 12, padding: 15, borderRadius: 14, backgroundColor: colors.secondary, gap: 12 }}>
            <Text style={{ color: colors.foreground, fontWeight: '800', fontSize: 16, textAlign: align }}>{t('courseDetailsTitle')}</Text>
            <View style={{ gap: 10 }}>
              {[
                [t('instructionLanguages'), languageList(course.courseLanguages)],
                [t('subtitleLanguages'), subtitleSummary],
                [t('requiredEquipment'), localizedDetail(course.requiredEquipment)],
                [t('courseDisclaimers'), localizedDetail(course.disclaimers)],
                [t('supportingMaterials'), localizedDetail(course.supportingMaterials)],
              ].map(([label, value]) => (
                <View key={label} style={{ gap: 3 }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '700', textAlign: align }}>{label}</Text>
                  <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 21, textAlign: align }}>{value}</Text>
                </View>
              ))}
            </View>
          </View>

          {course.enrolled ? (
            <View style={[styles.progressCard, { backgroundColor: colors.secondary }]}>
              <View style={styles.progressRow}>
                <Text style={[styles.progressPct, { color: colors.primary }]}>{pct}%</Text>
                <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                  {t('courseProgressLabel')} · {course.completedLessons}/{course.lessonCount} {t('lessons')}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.card }]}>
                <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
              </View>
            </View>
          ) : null}
          {course.accessState === 'membership_required' ? (
            <View style={[styles.progressCard, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align }]}>{t('membershipRequired')}</Text>
            </View>
          ) : course.accessState === 'enrollment_required' ? (
            <View style={[styles.progressCard, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align }]}>{t('enrollmentRequired')}</Text>
              <Pressable accessibilityRole="button" disabled={enrollMutation.isPending} onPress={() => void enroll()}
                style={({ pressed }) => [styles.enrolButton, { backgroundColor: colors.primary, opacity: pressed || enrollMutation.isPending ? 0.65 : 1 }]}>
                <Text style={[styles.enrolText, { color: colors.primaryForeground }]}>{enrollMutation.isPending ? t('coursesLoading') : t('enrol')}</Text>
              </Pressable>
            </View>
          ) : null}
          {message ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.primary, textAlign: align }]}>{message}</Text> : null}

          {course.lessons.map((lesson, index) => {
            const done = lesson.completed;
            const open = openLesson === lesson.id;
            return (
              <View key={lesson.id} style={[styles.lesson, { backgroundColor: colors.card, borderColor: done ? colors.primary : colors.border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => setOpenLesson(open ? null : lesson.id)}
                  style={styles.lessonHead}
                >
                  <View style={[styles.lessonNum, { backgroundColor: done ? colors.primary : colors.secondary }]}>
                    {done ? <Ionicons name="checkmark" size={15} color={colors.primaryForeground} /> : <Text style={[styles.lessonNumText, { color: colors.primary }]}>{index + 1}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lessonKicker, { color: colors.mutedForeground, textAlign: align }]}>{t('lessonWord')} {lesson.position ?? index + 1} · {lesson.durationMinutes} {t('minutesShort')}</Text>
                    <Text style={[styles.lessonTitle, { color: colors.foreground, textAlign: align }]}>{lesson.localizedTitle[app.language] || lesson.localizedTitle.en}</Text>
                  </View>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
                </Pressable>
                {open ? (
                  <View style={styles.lessonBody}>
                    {ready && lesson.localizedContent ? <Text style={[styles.lessonText, { color: colors.foreground, textAlign: align }]}>{lesson.localizedContent[app.language] || lesson.localizedContent.en}</Text>
                      : <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align }]}>{t(course.accessState === 'membership_required' ? 'membershipRequired' : 'enrollmentRequired')}</Text>}
                    {ready && lesson.hasRecording ? (
                      <Pressable accessibilityRole="button" disabled={playbackLinkMutation.isPending}
                        onPress={() => void openRecording(lesson.id)}
                        style={[styles.doneButton, { backgroundColor: colors.accent }, playbackLinkMutation.isPending && { opacity: 0.6 }]}>
                        <Ionicons name="play-circle-outline" size={17} color={colors.accentForeground} />
                        <Text style={[styles.doneText, { color: colors.accentForeground }]}>{t('viewCourse')}</Text>
                      </Pressable>
                    ) : null}
                    {ready ? (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: done }}
                        disabled={progressMutation.isPending}
                        onPress={() => void saveProgress(lesson.id, !done)}
                        style={[styles.doneButton, done ? { borderColor: colors.primary, borderWidth: 1 } : { backgroundColor: colors.accent }, progressMutation.isPending && { opacity: .6 }]}
                      >
                        <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={done ? colors.primary : colors.accentForeground} />
                        <Text style={[styles.doneText, { color: done ? colors.primary : colors.accentForeground }]}>{done ? t('markUndone') : t('markDone')}</Text>
                      </Pressable>
                    ) : (
                      <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align, marginTop: 10 }]}>{t('enrollmentRequired')}</Text>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
          <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align, marginTop: 12 }]}>{t('courseNotice')}</Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  missing: { padding: 20, gap: 16 },
  title: { fontSize: 18, fontWeight: '800' },
  hero: { height: 250, marginHorizontal: 16, borderRadius: 26, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,40,31,0.48)' },
  heroTop: { position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row' },
  backButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#c6e57d', alignItems: 'center', justifyContent: 'center' },
  heroText: { position: 'absolute', left: 18, right: 18, bottom: 18 },
  kicker: { color: '#c6e57d', fontSize: 10, fontWeight: '800' },
  heroTitle: { color: '#ffffff', fontSize: 25, fontWeight: '800', marginTop: 6 },
  body: { paddingHorizontal: 20, paddingTop: 18 },
  summary: { fontSize: 13, lineHeight: 20 },
  progressCard: { borderRadius: 18, padding: 14, marginTop: 16, gap: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  progressPct: { fontSize: 26, fontWeight: '800' },
  progressLabel: { fontSize: 11, fontWeight: '600' },
  track: { height: 6, borderRadius: 6, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 6 },
  enrolButton: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  enrolText: { fontSize: 13, fontWeight: '800' },
  message: { fontSize: 11, fontWeight: '800', marginTop: 10 },
  lesson: { borderWidth: 1, borderRadius: 18, marginTop: 11, overflow: 'hidden' },
  lessonHead: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, minHeight: 56 },
  lessonNum: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  lessonNumText: { fontSize: 13, fontWeight: '800' },
  lessonKicker: { fontSize: 9, fontWeight: '700' },
  lessonTitle: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  lessonBody: { paddingHorizontal: 14, paddingBottom: 14 },
  lessonText: { fontSize: 13, lineHeight: 21 },
  doneButton: { marginTop: 12, minHeight: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  doneText: { fontSize: 12, fontWeight: '800' },
});
