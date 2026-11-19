import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text, Pressable } from '@/components/Localized';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ScreenShell } from '@/components/ScreenShell';
import CoursePlayer from '@/components/CoursePlayer';
import {
  getGetMemberCourseQueryKey, getGetMemberCoursesQueryKey,
  useCreateMemberCourseMaterialDownloadLink, useCreateMemberCoursePlaybackLink,
  useEnrollMemberCourse, useGetMemberCourse, useRecordMemberCourseLessonView,
  useSubmitMemberCourseQuizAttempt,
  useSetMemberCourseFavorite, useUpdateCourseProgress,
  useGetMemberCourseCertificate,
  useUpdateMemberCourseAssignmentProgress,
  useUpdateMemberCoursePlaybackProgress,
  type SponsoredContentPlacementType,
} from '@workspace/api-client-react';
import type { CourseDetail, CourseQuizAttemptResult } from '@workspace/api-client-react';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate, type MessageKey } from '@/lib/i18n';
import { errorCopy } from '@/lib/content';
import { useSponsoredContentTracking } from '@/lib/sponsored-content';

export default function CourseDetailScreen() {
  const colors = useColors();
  const app = useApp();
  const queryClient = useQueryClient();
  const { id, resume, sponsoredCampaignId, sponsoredPlacementType } = useLocalSearchParams<{
    id: string;
    resume?: string;
    sponsoredCampaignId?: string;
    sponsoredPlacementType?: string;
  }>();
  const courseQuery = useGetMemberCourse(id);
  const course = courseQuery.data;
  const enrollMutation = useEnrollMemberCourse();
  const progressMutation = useUpdateCourseProgress();
  const playbackLinkMutation = useCreateMemberCoursePlaybackLink();
  const playbackProgressMutation = useUpdateMemberCoursePlaybackProgress();
  const materialDownloadMutation = useCreateMemberCourseMaterialDownloadLink();
  const lessonViewMutation = useRecordMemberCourseLessonView();
  const quizMutation = useSubmitMemberCourseQuizAttempt();
  const favoriteMutation = useSetMemberCourseFavorite();
  const certificateQuery = useGetMemberCourseCertificate(id, {
    query: { enabled: !!course?.courseCompletedAt, retry: false },
  });
  const assignmentProgressMutation = useUpdateMemberCourseAssignmentProgress();
  const sponsoredTracking = useSponsoredContentTracking();
  const [activePlayback, setActivePlayback] = useState<{
    lessonId: string;
    url: string;
    kind: 'audio' | 'video';
    initialPositionSeconds: number;
  } | null>(null);
  const savedPlaybackPositions = useRef(new Map<string, { positionSeconds: number; durationSeconds: number }>());
  const lastPlaybackSaveAt = useRef(new Map<string, number>());
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number[]>>({});
  const [quizResults, setQuizResults] = useState<Record<string, CourseQuizAttemptResult>>({});
  const resumedCourseId = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const t = (key: MessageKey) => translate(app.language, key);
  const align = app.language === 'en' ? 'left' : 'right';
  const recordLessonView = async (lessonId: string) => {
    if (!course) return;
    try {
      await lessonViewMutation.mutateAsync({ id: course.id, lessonId });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMemberCourseQueryKey(course.id) }),
        queryClient.invalidateQueries({ queryKey: getGetMemberCoursesQueryKey() }),
      ]);
    } catch (error) { setMessage(errorCopy(error)); }
  };
  useEffect(() => {
    if (resume !== '1' || !course || course.accessState !== 'ready' || resumedCourseId.current === course.id) return;
    resumedCourseId.current = course.id;
    const nextLesson = course.lessons.find((lesson) => !lesson.completed);
    if (nextLesson) {
      setOpenLesson(nextLesson.id);
      void recordLessonView(nextLesson.id);
    }
  }, [course, recordLessonView, resume]);
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

  const pct = course.completionPercentage;
  const completionDate = course.courseCompletedAt
    ? new Intl.DateTimeFormat(
      app.language === 'ku' ? 'ckb-IQ' : app.language === 'ar' ? 'ar-IQ' : 'en-IQ',
      { timeZone: 'Asia/Baghdad', dateStyle: 'medium' },
    ).format(new Date(course.courseCompletedAt))
    : null;
  const issuedCertificate = certificateQuery.data;
  const certificateDate = issuedCertificate
    ? new Intl.DateTimeFormat(
      app.language === 'ku' ? 'ckb-IQ' : app.language === 'ar' ? 'ar-IQ' : 'en-IQ',
      { timeZone: 'Asia/Baghdad', dateStyle: 'medium' },
    ).format(new Date(issuedCertificate.issuedAt))
    : null;
  const shareCertificate = async () => {
    if (!issuedCertificate || !certificateDate) return;
    const courseTitle = issuedCertificate.localizedCourseTitle[app.language]
      || issuedCertificate.localizedCourseTitle.en;
    const instructor = issuedCertificate.localizedInstructor[app.language]
      || issuedCertificate.localizedInstructor.en;
    try {
      await Share.share({
        message: [
          t('certificateTitle'),
          `${issuedCertificate.learnerName} · ${courseTitle}`,
          `${t('certificateApprovedBy')}: ${instructor}`,
          `${t('certificateIssuedOn')}: ${certificateDate}`,
          `${t('certificateNumber')}: ${issuedCertificate.id}`,
          issuedCertificate.disclaimer,
        ].join('\n'),
      });
    } catch (error) {
      setMessage(errorCopy(error));
    }
  };
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
      const updatedCourse = await progressMutation.mutateAsync({ id: course.id, data: { lessonId, completed } });
      if (resume === '1' && completed) {
        setOpenLesson(updatedCourse.lessons.find((lesson) => !lesson.completed)?.id ?? null);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMemberCourseQueryKey(course.id) }),
        queryClient.invalidateQueries({ queryKey: getGetMemberCoursesQueryKey() }),
      ]);
    } catch (error) { setMessage(errorCopy(error)); }
  };
  const submitQuiz = async (lessonId: string, questionCount: number) => {
    const answers = quizAnswers[lessonId] ?? [];
    if (answers.length !== questionCount || answers.some(answer => answer < 0)) {
      setMessage(t('quizSelectAll'));
      return;
    }
    try {
      const result = await quizMutation.mutateAsync({
        id: course.id,
        lessonId,
        data: { answers },
      });
      setQuizResults(current => ({ ...current, [lessonId]: result }));
      await queryClient.invalidateQueries({ queryKey: getGetMemberCourseQueryKey(course.id) });
    } catch (error) {
      setMessage(errorCopy(error));
    }
  };
  const updateAssignmentProgress = async (assignmentId: string, completed: boolean) => {
    try {
      await assignmentProgressMutation.mutateAsync({
        id: course.id,
        assignmentId,
        data: { completed },
      });
      await queryClient.invalidateQueries({ queryKey: getGetMemberCourseQueryKey(course.id) });
      setMessage(t(completed ? 'assignmentMarkedDone' : 'assignmentMarkedOpen'));
    } catch (error) {
      setMessage(errorCopy(error));
    }
  };
  const savePlaybackPosition = (
    lessonId: string,
    positionSeconds: number,
    durationSeconds: number,
    force: boolean,
  ) => {
    if (!course || !Number.isSafeInteger(positionSeconds) || !Number.isSafeInteger(durationSeconds) || durationSeconds < 1) return;
    const boundedPosition = Math.max(0, Math.min(positionSeconds, durationSeconds));
    savedPlaybackPositions.current.set(lessonId, { positionSeconds: boundedPosition, durationSeconds });
    const now = Date.now();
    if (!force && now - (lastPlaybackSaveAt.current.get(lessonId) ?? 0) < 4500) return;
    lastPlaybackSaveAt.current.set(lessonId, now);
    playbackProgressMutation.mutate({
      id: course.id,
      lessonId,
      data: { positionSeconds: boundedPosition, durationSeconds },
    }, {
      onSuccess: saved => {
        queryClient.setQueryData<CourseDetail>(getGetMemberCourseQueryKey(course.id), current => current ? {
          ...current,
          lastAccessAt: saved.lastAccessAt,
          lessons: current.lessons.map(lesson => lesson.id === lessonId ? {
            ...lesson,
            playbackPositionSeconds: saved.positionSeconds,
            durationSeconds: saved.durationSeconds,
          } : lesson),
        } : current);
      },
      onError: error => setMessage(errorCopy(error)),
    });
  };
  const closeRecording = () => {
    if (activePlayback) {
      const latest = savedPlaybackPositions.current.get(activePlayback.lessonId);
      if (latest) savePlaybackPosition(activePlayback.lessonId, latest.positionSeconds, latest.durationSeconds, true);
    }
    setActivePlayback(null);
  };
  const openRecording = async (lessonId: string, savedPositionSeconds: number, kind: 'audio' | 'video') => {
    if (activePlayback?.lessonId === lessonId) {
      closeRecording();
      return;
    }
    try {
      const playback = await playbackLinkMutation.mutateAsync({ id: course.id, lessonId });
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!domain) throw new Error('Course playback is unavailable. Try again later.');
      const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
      const saved = savedPlaybackPositions.current.get(lessonId)?.positionSeconds ?? savedPositionSeconds;
      setActivePlayback({
        lessonId,
        url: new URL(playback.url, baseUrl).toString(),
        kind,
        initialPositionSeconds: saved,
      });
    } catch (error) { setMessage(errorCopy(error)); }
  };
  const downloadMaterial = async (materialId: string) => {
    try {
      const download = await materialDownloadMutation.mutateAsync({ id: course.id, materialId });
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!domain) throw new Error('Course materials are unavailable. Try again later.');
      const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
      await Linking.openURL(new URL(download.url, baseUrl).toString());
    } catch (error) { setMessage(errorCopy(error)); }
  };
  const enroll = async () => {
    try {
      await enrollMutation.mutateAsync({ id: course.id });
      if (sponsoredCampaignId && sponsoredPlacementType) {
        sponsoredTracking.recordConversion(sponsoredCampaignId, sponsoredPlacementType as SponsoredContentPlacementType);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMemberCourseQueryKey(course.id) }),
        queryClient.invalidateQueries({ queryKey: getGetMemberCoursesQueryKey() }),
      ]);
      setMessage(t('enrolled'));
    } catch (error) { setMessage(errorCopy(error)); }
  };
  const toggleSavedCourse = async () => {
    try {
      const result = await favoriteMutation.mutateAsync({
        id: course.id,
        data: { isSaved: !course.isSaved },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMemberCourseQueryKey(course.id) }),
        queryClient.invalidateQueries({ queryKey: getGetMemberCoursesQueryKey() }),
      ]);
      setMessage(t(result.isSaved ? 'courseSaved' : 'courseUnsaved'));
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
          <View style={styles.heroTop}>
            {back}
            <Pressable
              testID="button-toggle-course-save"
              accessibilityRole="button"
              accessibilityLabel={t(course.isSaved ? 'removeSavedCourse' : 'saveCourse')}
              accessibilityState={{ selected: course.isSaved, disabled: favoriteMutation.isPending }}
              disabled={favoriteMutation.isPending}
              onPress={() => void toggleSavedCourse()}
              style={({ pressed }) => [styles.favoriteButton, { backgroundColor: colors.accent, opacity: pressed || favoriteMutation.isPending ? 0.65 : 1 }]}
            >
              <Ionicons name={course.isSaved ? 'bookmark' : 'bookmark-outline'} size={19} color={colors.accentForeground} />
            </Pressable>
          </View>
          <View style={styles.heroText}>
            {sponsoredCampaignId ? <View style={[styles.sponsoredBadge, { backgroundColor: colors.secondary, alignSelf: app.language === 'en' ? 'flex-start' : 'flex-end' }]}>
              <Text style={[styles.sponsoredBadgeText, { color: colors.primary }]}>{t('sponsored')}</Text>
            </View> : null}
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
          {ready && course.materials.length ? (
            <View style={{ marginBottom: 12, padding: 15, borderRadius: 14, backgroundColor: colors.secondary, gap: 10 }}>
              <Text style={{ color: colors.foreground, fontWeight: '800', fontSize: 16, textAlign: align }}>{t('courseMaterialsHeading')}</Text>
              {course.materials.map(material => (
                <Pressable
                  key={material.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('downloadCourseMaterial')}: ${material.title}`}
                  disabled={materialDownloadMutation.isPending}
                  onPress={() => void downloadMaterial(material.id)}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: colors.card,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    opacity: pressed || materialDownloadMutation.isPending ? 0.65 : 1,
                  })}
                >
                  <Text style={{ flex: 1, color: colors.foreground, fontSize: 13, fontWeight: '700', textAlign: align }}>{material.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>
                      {materialDownloadMutation.isPending ? t('coursesLoading') : t('downloadCourseMaterial')}
                    </Text>
                    <Ionicons name="download-outline" size={18} color={colors.primary} />
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

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
              <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align }]}>
                {course.lessons.filter(lesson => lesson.viewed).length}/{course.lessonCount} {t('lessonsViewed')}
              </Text>
              {completionDate ? (
                <Text style={[styles.progressLabel, { color: colors.primary, textAlign: align }]}>
                  {t('courseCompletedOn')} · {completionDate}
                </Text>
              ) : null}
              {completionDate && issuedCertificate ? (
                <View style={{ marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary, gap: 7 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="ribbon-outline" size={20} color={colors.primary} />
                    <Text style={{ flex: 1, color: colors.primary, fontSize: 15, fontWeight: '800', textAlign: align }}>{t('certificateTitle')}</Text>
                  </View>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700', textAlign: align }}>{issuedCertificate.learnerName}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: align }}>
                    {t('certificateApprovedBy')}: {issuedCertificate.localizedInstructor[app.language] || issuedCertificate.localizedInstructor.en}
                  </Text>
                  <Text selectable style={{ color: colors.mutedForeground, fontSize: 11, textAlign: align }}>
                    {t('certificateNumber')}: {issuedCertificate.id}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 17, textAlign: align }}>{issuedCertificate.disclaimer}</Text>
                  <Pressable
                    testID="button-share-course-certificate"
                    accessibilityRole="button"
                    onPress={() => void shareCertificate()}
                    style={({ pressed }) => ({ minHeight: 42, marginTop: 3, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}
                  >
                    <Text style={{ color: colors.primaryForeground, fontSize: 13, fontWeight: '800' }}>{t('certificateShare')}</Text>
                  </Pressable>
                </View>
              ) : completionDate ? (
                <View style={{ marginTop: 8, gap: 6 }}>
                  <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align }]}>{t('certificatePending')}</Text>
                  <Pressable
                    testID="button-refresh-course-certificate"
                    accessibilityRole="button"
                    disabled={certificateQuery.isFetching}
                    onPress={() => void certificateQuery.refetch()}
                    style={({ pressed }) => ({ alignSelf: app.language === 'en' ? 'flex-start' : 'flex-end', paddingVertical: 5, opacity: pressed || certificateQuery.isFetching ? 0.55 : 1 })}
                  >
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>{t('certificateRefresh')}</Text>
                  </Pressable>
                </View>
              ) : null}
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
          {ready && course.assignments.length > 0 ? (
            <View style={{ marginTop: 12, padding: 15, borderRadius: 14, backgroundColor: colors.secondary, gap: 11 }} testID="panel-course-assignments">
              <View style={{ gap: 3 }}>
                <Text style={{ color: colors.foreground, fontWeight: '800', fontSize: 16, textAlign: align }}>{t('courseAssignments')}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18, textAlign: align }}>{t('assignmentProgressIntro')}</Text>
              </View>
              {course.assignments.map(assignment => (
                <View key={assignment.id} style={{ padding: 12, borderRadius: 12, backgroundColor: colors.card, gap: 8 }} testID={`card-course-assignment-${assignment.id}`}>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '800', textAlign: align }}>
                    {assignment.localizedTitle[app.language] || assignment.localizedTitle.en}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20, textAlign: align }}>
                    {assignment.localizedInstructions[app.language] || assignment.localizedInstructions.en}
                  </Text>
                  <Pressable
                    testID={`button-course-assignment-${assignment.id}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: assignment.completed, disabled: assignmentProgressMutation.isPending }}
                    disabled={assignmentProgressMutation.isPending}
                    onPress={() => void updateAssignmentProgress(assignment.id, !assignment.completed)}
                    style={({ pressed }) => ({
                      minHeight: 42,
                      flexDirection: app.language === 'en' ? 'row' : 'row-reverse',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      borderRadius: 10,
                      backgroundColor: assignment.completed ? colors.primary : colors.secondary,
                      opacity: pressed || assignmentProgressMutation.isPending ? 0.6 : 1,
                    })}
                  >
                    <Ionicons name={assignment.completed ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={assignment.completed ? colors.primaryForeground : colors.primary} />
                    <Text style={{ color: assignment.completed ? colors.primaryForeground : colors.primary, fontSize: 12, fontWeight: '800' }}>
                      {t(assignment.completed ? 'assignmentMarkUndone' : 'assignmentMarkDone')}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          {message ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.primary, textAlign: align }]}>{message}</Text> : null}

          {course.lessons.map((lesson, index) => {
            const done = lesson.completed;
            const open = openLesson === lesson.id;
            return (
              <View key={lesson.id} style={[styles.lesson, { backgroundColor: colors.card, borderColor: done ? colors.primary : colors.border }]}>
                <Pressable
                  testID={`button-course-lesson-${lesson.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => {
                    if (open) setOpenLesson(null);
                    else {
                      setOpenLesson(lesson.id);
                      if (ready) void recordLessonView(lesson.id);
                    }
                  }}
                  style={styles.lessonHead}
                >
                  <View style={[styles.lessonNum, { backgroundColor: done ? colors.primary : colors.secondary }]}>
                    {done ? <Ionicons name="checkmark" size={15} color={colors.primaryForeground} /> : <Text style={[styles.lessonNumText, { color: colors.primary }]}>{index + 1}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lessonKicker, { color: colors.mutedForeground, textAlign: align }]}>{t('lessonWord')} {lesson.position ?? index + 1} · {lesson.durationMinutes} {t('minutesShort')}{lesson.viewed ? ` · ${t('lessonViewed')}` : ''}</Text>
                    <Text style={[styles.lessonTitle, { color: colors.foreground, textAlign: align }]}>{lesson.localizedTitle[app.language] || lesson.localizedTitle.en}</Text>
                  </View>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
                </Pressable>
                {open ? (
                  <View style={styles.lessonBody}>
                    {ready && lesson.localizedContent ? <Text style={[styles.lessonText, { color: colors.foreground, textAlign: align }]}>{lesson.localizedContent[app.language] || lesson.localizedContent.en}</Text>
                      : <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align }]}>{t(course.accessState === 'membership_required' ? 'membershipRequired' : 'enrollmentRequired')}</Text>}
                    {ready && lesson.hasRecording ? (
                      <View style={{ marginTop: 10 }}>
                        <Pressable
                          testID={`button-course-recording-${lesson.id}`}
                          accessibilityRole="button"
                          disabled={playbackLinkMutation.isPending && activePlayback?.lessonId !== lesson.id}
                          onPress={() => void openRecording(lesson.id, lesson.playbackPositionSeconds, lesson.recordingKind ?? 'video')}
                          style={[styles.doneButton, { backgroundColor: colors.accent }, playbackLinkMutation.isPending && activePlayback?.lessonId !== lesson.id && { opacity: 0.6 }]}
                        >
                          <Ionicons name={activePlayback?.lessonId === lesson.id ? 'close-circle-outline' : 'play-circle-outline'} size={17} color={colors.accentForeground} />
                          <Text style={[styles.doneText, { color: colors.accentForeground }]}>
                            {activePlayback?.lessonId === lesson.id
                              ? t('closeRecording')
                              : lesson.playbackPositionSeconds > 0 && lesson.durationSeconds != null && lesson.playbackPositionSeconds < lesson.durationSeconds - 2
                                ? t('resumeRecording')
                                : t('playRecording')}
                          </Text>
                        </Pressable>
                        {activePlayback?.lessonId === lesson.id ? (
                          <View style={{ marginTop: 10 }}>
                            <CoursePlayer
                              key={lesson.id}
                              sourceUrl={activePlayback.url}
                              initialPositionSeconds={activePlayback.initialPositionSeconds}
                              kind={activePlayback.kind}
                              onProgress={(position, duration, force) => savePlaybackPosition(lesson.id, position, duration, force)}
                            />
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    {ready && lesson.quiz ? (
                      <View style={[styles.quizCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                        <View style={styles.quizHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.quizTitle, { color: colors.foreground, textAlign: align }]}>{t('courseQuiz')}</Text>
                            <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align }]}>
                              {t('quizPassMark').replace('{score}', String(lesson.quiz.passingScorePercent))}
                            </Text>
                          </View>
                          <Ionicons name="help-circle-outline" size={21} color={colors.primary} />
                        </View>
                        {lesson.latestQuizAttempt ? (
                          <View style={[styles.quizLastAttempt, { backgroundColor: colors.card }]}>
                            <Text style={[styles.progressLabel, { color: colors.foreground, textAlign: align }]}>
                              {t('quizScore').replace('{score}', String(lesson.latestQuizAttempt.scorePercent))}
                            </Text>
                            <Text style={[styles.quizStatus, { color: lesson.latestQuizAttempt.passed ? colors.primary : colors.mutedForeground, textAlign: align }]}>
                              {t(lesson.latestQuizAttempt.passed ? 'quizPassed' : 'quizNeedsPractice')}
                            </Text>
                          </View>
                        ) : null}
                        {lesson.quiz.questions.map((question, questionIndex) => {
                          const currentAnswers = quizAnswers[lesson.id] ?? [];
                          const selectedOption = currentAnswers[questionIndex];
                          const result = quizResults[lesson.id]?.questionResults[questionIndex];
                          return (
                            <View key={questionIndex} style={[styles.quizQuestion, { backgroundColor: colors.card, borderColor: colors.border }]}>
                              <Text style={[styles.quizQuestionTitle, { color: colors.foreground, textAlign: align }]}>
                                {t('quizQuestionLabel').replace('{number}', String(questionIndex + 1))}
                              </Text>
                              <Text style={[styles.lessonText, { color: colors.foreground, textAlign: align, marginTop: 7 }]}>
                                {question.prompt[app.language] || question.prompt.en}
                              </Text>
                              <View style={styles.quizOptions}>
                                {question.options.map((option, optionIndex) => {
                                  const selected = selectedOption === optionIndex;
                                  const isCorrectOption = result?.correctOptionIndex === optionIndex;
                                  const isWrongSelection = result?.selectedOptionIndex === optionIndex && !result.correct;
                                  return (
                                    <Pressable
                                      key={optionIndex}
                                      testID={`button-course-quiz-${lesson.id}-${questionIndex}-${optionIndex}`}
                                      accessibilityRole="radio"
                                      accessibilityState={{ selected, disabled: quizMutation.isPending }}
                                      disabled={quizMutation.isPending}
                                      onPress={() => setQuizAnswers(current => {
                                        const next = [...(current[lesson.id] ?? Array.from({ length: lesson.quiz!.questions.length }, () => -1))];
                                        next[questionIndex] = optionIndex;
                                        return { ...current, [lesson.id]: next };
                                      })}
                                      style={[
                                        styles.quizOption,
                                        { borderColor: isCorrectOption ? colors.primary : isWrongSelection ? colors.destructive : selected ? colors.primary : colors.border },
                                        selected && { backgroundColor: colors.secondary },
                                      ]}
                                    >
                                      <View style={[styles.quizRadio, { borderColor: selected || isCorrectOption ? colors.primary : colors.mutedForeground, backgroundColor: selected || isCorrectOption ? colors.primary : 'transparent' }]}>
                                        {(selected || isCorrectOption) ? <Ionicons name="checkmark" size={11} color={colors.primaryForeground} /> : null}
                                      </View>
                                      <Text style={[styles.quizOptionText, { color: colors.foreground, textAlign: align }]}>
                                        {option[app.language] || option.en}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                              {result ? (
                                <View style={{ marginTop: 8 }}>
                                  <Text style={[styles.quizStatus, { color: result.correct ? colors.primary : colors.destructive, textAlign: align }]}>
                                    {t(result.correct ? 'quizCorrect' : 'quizIncorrect')}
                                  </Text>
                                  {result.explanation ? <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align, marginTop: 4 }]}>
                                    {result.explanation[app.language] || result.explanation.en}
                                  </Text> : null}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                        <Pressable
                          testID={`button-submit-course-quiz-${lesson.id}`}
                          accessibilityRole="button"
                          disabled={quizMutation.isPending}
                          onPress={() => void submitQuiz(lesson.id, lesson.quiz!.questions.length)}
                          style={[styles.quizSubmit, { backgroundColor: colors.primary, opacity: quizMutation.isPending ? 0.55 : 1 }]}
                        >
                          <Text style={[styles.doneText, { color: colors.primaryForeground }]}>
                            {quizMutation.isPending ? t('quizSubmitting') : t('quizSubmit')}
                          </Text>
                        </Pressable>
                      </View>
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
  heroTop: { position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#c6e57d', alignItems: 'center', justifyContent: 'center' },
  favoriteButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  heroText: { position: 'absolute', left: 18, right: 18, bottom: 18 },
  sponsoredBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 3 },
  sponsoredBadgeText: { fontSize: 10, fontWeight: '900' },
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
  quizCard: { borderWidth: 1, borderRadius: 17, padding: 12, marginTop: 12, gap: 10 },
  quizHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  quizTitle: { fontSize: 14, fontWeight: '900' },
  quizLastAttempt: { borderRadius: 12, padding: 10, gap: 2 },
  quizStatus: { fontSize: 11, fontWeight: '800' },
  quizQuestion: { borderWidth: 1, borderRadius: 13, padding: 11 },
  quizQuestionTitle: { fontSize: 11, fontWeight: '900' },
  quizOptions: { gap: 7, marginTop: 9 },
  quizOption: { minHeight: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  quizRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  quizOptionText: { flex: 1, fontSize: 12, lineHeight: 17 },
  quizSubmit: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  doneButton: { marginTop: 12, minHeight: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  doneText: { fontSize: 12, fontWeight: '800' },
});
