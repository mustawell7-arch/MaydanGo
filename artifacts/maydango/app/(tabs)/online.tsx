import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Text, TextInput, Pressable } from '@/components/Localized';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMemberCoursesQueryKey, getGetMemberLiveClassesQueryKey,
  getGetMemberCourseQueryKey, getGetPublicSponsoredContentQueryKey,
  useCreateLiveClassJoin, useGetMemberCourses, useGetPublicSponsoredContent,
  useGetMemberCourseBundles, useGetMemberLiveClasses, useSetMemberCourseFavorite,
  type SponsoredContentPlacementType,
} from '@workspace/api-client-react';
import { MemberNotice } from '@/components/MemberNotice';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { getCityLabel } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate, type Language, type MessageKey } from '@/lib/i18n';
import { errorCopy } from '@/lib/content';
import { recommendOnlineCourses } from '@/lib/course-recommendations';
import { courseMatchesSearch } from '@/lib/course-search';
import { findSponsoredContentPlacement, useSponsoredContentTracking } from '@/lib/sponsored-content';

type Mode = 'courses' | 'live' | 'coaching';
type Localized = { en: string; ar: string; ku: string };
const localText = (value: Localized | null | undefined, language: Language) => value?.[language] || value?.en || '';
const iraqDateTime = (value: string, language: Language) => new Intl.DateTimeFormat(
  language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ',
  { timeZone: 'Asia/Baghdad', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
).format(new Date(value));
export default function OnlineScreen() {
  const colors = useColors();
  const app = useApp();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('courses');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');
  const [slotChoice, setSlotChoice] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const t = (key: MessageKey) => translate(app.language, key);
  const align = app.language === 'en' ? 'left' : 'right';
  const coursesQuery = useGetMemberCourses({ query: { enabled: mode === 'courses' } });
  const bundlesQuery = useGetMemberCourseBundles({ query: { enabled: mode === 'courses' } });
  const sponsoredContentCity = app.selectedCityId === 'all' ? undefined : getCityLabel(app.selectedCityId, 'en');
  const sponsoredContentQuery = useGetPublicSponsoredContent(
    { city: sponsoredContentCity },
    {
      query: {
        queryKey: getGetPublicSponsoredContentQueryKey({ city: sponsoredContentCity }),
        enabled: mode === 'courses' && !showSavedOnly,
        refetchInterval: 60_000,
      },
    },
  );
  const sponsoredContentTracking = useSponsoredContentTracking();
  const liveQuery = useGetMemberLiveClasses({ query: { enabled: mode === 'live', refetchInterval: 30_000 } });
  const joinMutation = useCreateLiveClassJoin();
  const favoriteMutation = useSetMemberCourseFavorite();
  const courseRows = coursesQuery.data ?? [];
  const savedCourseRows = courseRows.filter((course) => course.isSaved);
  const matchesCourse = (course: (typeof courseRows)[number]) => courseMatchesSearch(course, courseSearch);
  const visibleCourseRows = (showSavedOnly ? savedCourseRows : courseRows).filter(matchesCourse);
  const liveClasses = liveQuery.data ?? [];
  const coachingOffers = useMemo(() => {
    const byCoach = new Map<string, {
      id: string;
      title: string;
      scope: string;
      slots: { id: string; startsAt: string }[];
    }>();
    for (const offer of app.bookingCatalog) {
      const startsAt = Date.parse(offer.startsAt);
      if (
        offer.kind !== 'coach' || !offer.slot || offer.remaining < 1 ||
        !Number.isFinite(startsAt) || startsAt <= Date.now()
      ) continue;
      const coach = byCoach.get(offer.targetId) ?? {
        id: offer.targetId,
        title: offer.title,
        scope: offer.scope,
        slots: [],
      };
      coach.slots.push({ id: offer.slot, startsAt: offer.startsAt });
      byCoach.set(offer.targetId, coach);
    }
    return [...byCoach.values()].map(coach => ({
      ...coach,
      slots: coach.slots.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    }));
  }, [app.bookingCatalog]);
  const started = showSavedOnly ? [] : courseRows.filter((course) =>
    course.enrolled && course.completedLessons < course.lessonCount && matchesCourse(course));
  const recommendations = showSavedOnly
    ? []
    : recommendOnlineCourses(courseRows).filter(({ course }) => matchesCourse(course));
  const coursePlacement = (id: string, category: string) => {
    const featured = findSponsoredContentPlacement(sponsoredContentQuery.data ?? [], 'course', id, 'featured_course');
    if (featured) return { campaignId: featured.campaignId, placementType: 'featured_course' as const };
    const categoryFeatured = findSponsoredContentPlacement(
      sponsoredContentQuery.data ?? [], 'course', id, 'category_featured', category,
    );
    return categoryFeatured
      ? { campaignId: categoryFeatured.campaignId, placementType: 'category_featured' as const }
      : null;
  };
  const openCourse = (
    id: string,
    resume = false,
    sponsored?: { campaignId: string; placementType: SponsoredContentPlacementType } | null,
  ) => {
    if (sponsored) sponsoredContentTracking.recordClick(sponsored.campaignId, sponsored.placementType);
    router.push({
      pathname: '/course/[id]',
      params: {
        id,
        ...(resume ? { resume: '1' } : {}),
        ...(sponsored ? { sponsoredCampaignId: sponsored.campaignId, sponsoredPlacementType: sponsored.placementType } : {}),
      },
    });
  };

  const toggleSavedCourse = async (courseId: string, isSaved: boolean) => {
    try {
      const result = await favoriteMutation.mutateAsync({ id: courseId, data: { isSaved: !isSaved } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMemberCoursesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetMemberCourseQueryKey(courseId) }),
      ]);
      setMessage(t(result.isSaved ? 'courseSaved' : 'courseUnsaved'));
    } catch (error) {
      setMessage(errorCopy(error));
    }
  };
  const saveCourseButton = (courseId: string, isSaved: boolean, overlay = false) => (
    <Pressable
      testID={`button-save-course-${courseId}`}
      accessibilityRole="button"
      accessibilityLabel={t(isSaved ? 'removeSavedCourse' : 'saveCourse')}
      accessibilityState={{ selected: isSaved, disabled: favoriteMutation.isPending }}
      disabled={favoriteMutation.isPending}
      onPress={() => void toggleSavedCourse(courseId, isSaved)}
      style={({ pressed }) => [
        styles.saveCourseButton,
        overlay && styles.saveCourseOverlay,
        { backgroundColor: overlay ? colors.card : colors.secondary, opacity: pressed || favoriteMutation.isPending ? 0.65 : 1 },
      ]}
    >
      <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={19} color={isSaved ? colors.primary : colors.mutedForeground} />
    </Pressable>
  );

  const toggleLive = async (id: string, was: boolean) => {
    const r = await (was ? app.cancelBooking(id) : app.bookSession(id));
    setMessage(r.ok ? (was ? t('cancelled') : t('booked')) : r.reason === 'duplicate' ? t('alreadySaved') : t('notSaved'));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetMemberLiveClassesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetMemberCoursesQueryKey() }),
    ]);
  };

  const joinLive = async (id: string) => {
    try {
      const access = await joinMutation.mutateAsync({ id });
      await Linking.openURL(access.url);
    } catch (error) {
      setMessage(errorCopy(error));
    }
  };

  const submitRequest = async (coachId: string) => {
    const slot = slotChoice[coachId];
    if (!slot) return setMessage(t('chooseSlotFirst'));
    const r = await app.requestCoaching(coachId, slot);
    const offer = coachingOffers.find(item => item.id === coachId);
    setMessage(r.ok
      ? t(offer?.scope === 'preview' ? 'requestSavedPreview' : 'requestSent')
      : r.reason === 'duplicate' ? t('alreadySaved') : r.reason === 'invalid' ? t('chooseSlotFirst') : t('notSaved'));
  };

  return (
    <ScreenShell>
      <ScreenHeader eyebrow={t('onlineEyebrow')} title={t('online')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScroll={sponsoredContentTracking.checkVisible}
        onContentSizeChange={sponsoredContentTracking.checkVisible}
        scrollEventThrottle={250}
      >
        <MemberNotice />
        <View style={[styles.intro, { backgroundColor: colors.primary }]}>
          <View style={styles.introCircle} />
          <Text style={[styles.introEyebrow, { textAlign: align }]}>{t('onlineIntroEyebrow')}</Text>
          <Text style={[styles.introTitle, { textAlign: align }]}>{t('fromHome')}</Text>
          <Text style={[styles.introText, { textAlign: align }]}>{t('onlineIntro')}</Text>
          <View style={styles.introMark}><Ionicons name="play" size={17} color={colors.primary} /></View>
        </View>
        <View accessibilityRole="tablist" style={[styles.segment, { backgroundColor: colors.secondary }]}>
          {(['courses', 'live', 'coaching'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === value }}
              onPress={() => { setMode(value); setMessage(null); }}
              style={[styles.segmentOption, mode === value && { backgroundColor: colors.card }]}
            >
              <Text style={[styles.segmentText, { color: mode === value ? colors.primary : colors.mutedForeground }]}>
                {value === 'courses' ? t('courses') : value === 'live' ? t('live') : t('coaching')}
              </Text>
              {value === 'live' ? <View style={styles.liveDot} /> : null}
            </Pressable>
          ))}
        </View>
        {message ? (
          <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: colors.primary }]}>
            <Text style={[styles.toastText, { color: colors.primaryForeground, textAlign: align }]}>{message}</Text>
          </View>
        ) : null}

        {mode === 'courses' ? (
          <>
            {!coursesQuery.isLoading && !coursesQuery.isError && (courseRows.length > 0 || courseSearch.trim()) ? (
              <View style={[styles.searchField, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
                <Ionicons name="search" size={18} color={colors.mutedForeground} />
                <TextInput
                  accessibilityLabel={t('searchCourses')}
                  value={courseSearch}
                  onChangeText={setCourseSearch}
                  placeholder={t('searchCourses')}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  style={[styles.searchInput, { color: colors.foreground }]}
                />
                {courseSearch.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('clearCourseSearch')}
                    onPress={() => setCourseSearch('')}
                    hitSlop={8}
                    style={styles.clearSearchButton}
                  >
                    <Ionicons name="close-circle" size={19} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {coursesQuery.isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground }}>{t('coursesLoading')}</Text></View> : null}
            {coursesQuery.isError ? <Text style={[styles.catalogMeta, { color: colors.destructive, textAlign: align }]}>{t('catalogLoadError')}</Text> : null}
            {!showSavedOnly && bundlesQuery.isError ? <Text style={[styles.catalogMeta, { color: colors.destructive, textAlign: align }]}>{t('courseBundlesLoadError')}</Text> : null}
            {!coursesQuery.isLoading && !coursesQuery.isError && courseRows.length > 0 ? (
              <View accessibilityRole="tablist" style={[styles.segment, styles.courseFilter, { backgroundColor: colors.secondary }]}>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: !showSavedOnly }}
                  onPress={() => setShowSavedOnly(false)}
                  style={[styles.segmentOption, !showSavedOnly && { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.segmentText, { color: !showSavedOnly ? colors.primary : colors.mutedForeground }]}>{t('allCourses')} · {courseRows.length}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: showSavedOnly }}
                  onPress={() => setShowSavedOnly(true)}
                  style={[styles.segmentOption, showSavedOnly && { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.segmentText, { color: showSavedOnly ? colors.primary : colors.mutedForeground }]}>{t('savedCourses')} · {savedCourseRows.length}</Text>
                </Pressable>
              </View>
            ) : null}
            {!coursesQuery.isLoading && !coursesQuery.isError && !courseSearch.trim()
              && (showSavedOnly ? savedCourseRows.length === 0 : courseRows.length === 0)
              ? <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                {showSavedOnly ? t('noSavedCourses') : t('noPublishedCourses')}
              </Text> : null}
            {!coursesQuery.isLoading && !coursesQuery.isError && courseSearch.trim() && visibleCourseRows.length === 0
              ? <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('noCourseSearchResults')}</Text>
              : null}
            {!showSavedOnly && bundlesQuery.data?.length ? (
              <View style={styles.bundleSection} testID="section-course-bundles">
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align, marginBottom: 4 }]}>{t('courseBundles')}</Text>
                  <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align, marginTop: 0, marginBottom: 10 }]}>{t('courseBundlesIntro')}</Text>
                </View>
                {bundlesQuery.data.map(bundle => (
                  <View
                    key={bundle.id}
                    testID={`course-bundle-${bundle.id}`}
                    style={[styles.bundleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.bundleHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>
                          {localText(bundle.localizedTitle, app.language)}
                        </Text>
                        <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                          {t('courseBundleCourseCount').replace('{count}', String(bundle.courses.length))}
                        </Text>
                      </View>
                      <Ionicons name="albums-outline" size={20} color={colors.primary} />
                    </View>
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align, lineHeight: 17, marginBottom: 7 }]}>
                      {localText(bundle.localizedSummary, app.language)}
                    </Text>
                    {bundle.courses.map((course, index) => (
                      <Pressable
                        key={course.id}
                        testID={`button-bundle-course-${course.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('viewCourse')}: ${localText(course.localizedTitle, app.language)}`}
                        onPress={() => openCourse(course.id, course.enrolled)}
                        style={({ pressed }) => [
                          styles.bundleCourse,
                          { borderTopColor: colors.border, opacity: pressed ? 0.65 : 1 },
                        ]}
                      >
                        <View style={[styles.bundleCourseNumber, { backgroundColor: colors.secondary }]}>
                          <Text style={[styles.bundleCourseNumberText, { color: colors.primary }]}>{index + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align, marginTop: 0 }]}>
                            {localText(course.localizedTitle, app.language)}
                          </Text>
                          <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                            {course.category} · {course.lessonCount} {t('lessons')}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} style={app.language !== 'en' ? { transform: [{ scaleX: -1 }] } : undefined} />
                      </Pressable>
                    ))}
                  </View>
                ))}
                <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('courseBundleAccessNote')}</Text>
              </View>
            ) : null}
            {started.length > 0 ? <>
              <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{t('continueLearning')}</Text>
              {started.map((course) => {
                const pct = course.completionPercentage;
                return (
                  <View key={course.id} style={[styles.courseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('continueCourse')}: ${localText(course.localizedTitle, app.language)}, ${pct}% ${t('complete')}`}
                      onPress={() => openCourse(course.id, true)}
                    >
                      {course.thumbnailUrl
                        ? <Image source={{ uri: course.thumbnailUrl }} style={styles.courseImage} />
                        : <View style={[styles.courseImage, styles.courseImageFallback, { backgroundColor: colors.secondary }]}><Ionicons name="fitness-outline" size={30} color={colors.primary} /></View>}
                      <View style={styles.courseBody}>
                        <Text style={[styles.courseKicker, { color: colors.mutedForeground, textAlign: align }]}>{t(course.level === 'all-levels' ? 'allLevels' : course.level)} · {course.durationMinutes} {t('minutesShort')}</Text>
                        <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align }]}>{localText(course.localizedTitle, app.language)}</Text>
                        <View style={[styles.courseProgressTrack, { backgroundColor: colors.secondary }]}>
                          <View style={[styles.courseProgressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                        </View>
                        <View style={styles.courseFooter}>
                          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{course.completedLessons}/{course.lessonCount} {t('lessons')} · {pct}% {t('complete')}</Text>
                          <View style={[styles.continueButton, { backgroundColor: colors.accent }]}>
                            <Text style={[styles.continueText, { color: colors.accentForeground }]}>{t('continueCourse')}</Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                    {saveCourseButton(course.id, course.isSaved, true)}
                  </View>
                );
              })}
            </> : null}
            {recommendations.length ? <>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 18, textAlign: align }]}>{t('recommendedForYou')}</Text>
              <Text style={[styles.catalogMeta, { color: colors.mutedForeground, marginBottom: 8, textAlign: align }]}>{t('recommendationReason')}</Text>
              {recommendations.map(({ course, reason }) => {
                const sponsored = coursePlacement(course.id, course.category);
                return (
                <View key={`recommended-${course.id}`}
                  ref={node => sponsoredContentTracking.register(`recommended-${course.id}`, sponsored?.campaignId, sponsored?.placementType, node)}
                  collapsable={false}
                  onLayout={sponsoredContentTracking.checkVisible}
                  style={[styles.catalogRow, { borderBottomColor: colors.border }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('recommendedForYou')}: ${localText(course.localizedTitle, app.language)}`}
                    onPress={() => openCourse(course.id, false, sponsored)}
                    style={styles.courseRowMain}
                  >
                    {course.thumbnailUrl
                      ? <Image source={{ uri: course.thumbnailUrl }} style={styles.catalogImage} />
                      : <View style={[styles.catalogImage, styles.catalogImageFallback, { backgroundColor: colors.secondary }]}><Ionicons name="sparkles-outline" size={20} color={colors.primary} /></View>}
                    <View style={{ flex: 1 }}>
                      {sponsored ? <View style={[styles.sponsoredBadge, { backgroundColor: colors.secondary, alignSelf: app.language === 'en' ? 'flex-start' : 'flex-end' }]}><Text style={[styles.sponsoredBadgeText, { color: colors.primary }]}>{t('sponsored')}</Text></View> : null}
                      <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align }]}>{localText(course.localizedTitle, app.language)}</Text>
                      <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                        {localText(course.localizedInstructor, app.language)} · {course.category}
                      </Text>
                      <Text numberOfLines={2} style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{localText(course.localizedSummary, app.language)}</Text>
                      <Text style={[styles.catalogMeta, { color: colors.primary, textAlign: align, marginTop: 3 }]}>
                        {t(reason === 'saved-course-interest' ? 'recommendationSavedReason' : 'recommendationEnrollmentReason')}
                      </Text>
                    </View>
                    <View style={[styles.playButton, { backgroundColor: colors.secondary }]}>
                      <Ionicons name="chevron-forward" size={15} color={colors.primary} style={app.language !== 'en' ? { transform: [{ scaleX: -1 }] } : undefined} />
                    </View>
                  </Pressable>
                  {saveCourseButton(course.id, course.isSaved)}
                </View>
                );
              })}
            </> : null}
            {visibleCourseRows.length > 0 ? <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 18, textAlign: align }]}>{showSavedOnly ? t('savedCourses') : t('courses')}</Text> : null}
            {!showSavedOnly && !courseRows.some((course) => course.enrolled) && courseRows.length > 0
              ? <Text style={[styles.catalogMeta, { color: colors.mutedForeground, marginBottom: 10, textAlign: align }]}>{t('notStartedYet')}</Text> : null}
            {visibleCourseRows.map((course) => {
              const sponsored = !showSavedOnly && !course.enrolled ? coursePlacement(course.id, course.category) : null;
              return (
              <View key={course.id}
                ref={node => sponsoredContentTracking.register(`catalog-${course.id}`, sponsored?.campaignId, sponsored?.placementType, node)}
                collapsable={false}
                onLayout={sponsoredContentTracking.checkVisible}
                style={[styles.catalogRow, { borderBottomColor: colors.border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('viewCourse')}: ${localText(course.localizedTitle, app.language)}`}
                  onPress={() => openCourse(course.id, course.enrolled, sponsored)}
                  style={styles.courseRowMain}
                >
                  {course.thumbnailUrl
                    ? <Image source={{ uri: course.thumbnailUrl }} style={styles.catalogImage} />
                    : <View style={[styles.catalogImage, styles.catalogImageFallback, { backgroundColor: colors.secondary }]}><Ionicons name="fitness-outline" size={20} color={colors.primary} /></View>}
                  <View style={{ flex: 1 }}>
                    {sponsored ? <View style={[styles.sponsoredBadge, { backgroundColor: colors.secondary, alignSelf: app.language === 'en' ? 'flex-start' : 'flex-end' }]}><Text style={[styles.sponsoredBadgeText, { color: colors.primary }]}>{t('sponsored')}</Text></View> : null}
                    <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align }]}>{localText(course.localizedTitle, app.language)}</Text>
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                      {localText(course.localizedInstructor, app.language)} · {course.lessonCount} {t('lessons')}{course.enrolled ? ` · ${t('enrolled')}` : ''}
                    </Text>
                    <Text numberOfLines={2} style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{localText(course.localizedSummary, app.language)}</Text>
                  </View>
                  <View style={[styles.playButton, { backgroundColor: colors.secondary }]}>
                    <Ionicons name={course.enrolled ? 'play' : 'chevron-forward'} size={15} color={colors.primary} style={app.language !== 'en' && !course.enrolled ? { transform: [{ scaleX: -1 }] } : undefined} />
                  </View>
                </Pressable>
                {saveCourseButton(course.id, course.isSaved)}
              </View>
              );
            })}
            <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align, marginTop: 12 }]}>{t('courseNotice')}</Text>
          </>
        ) : mode === 'live' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>
              {t('liveOnline')} · {t('liveTime')}
            </Text>
            {liveQuery.isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground }}>{t('liveLoading')}</Text></View> : null}
            {liveQuery.isError ? <Text style={[styles.catalogMeta, { color: colors.destructive, textAlign: align }]}>{t('catalogLoadError')}</Text> : null}
            {!liveQuery.isLoading && !liveQuery.isError && liveClasses.length === 0
              ? <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('noLive')}</Text> : null}
            {liveClasses.map((session) => {
              const title = localText(session.localizedTitle, app.language) || session.title;
              const description = localText(session.localizedDescription, app.language);
              const booked = session.booked;
              const canCancel = booked && Date.parse(session.cancellationDeadline) > Date.now();
              const duration = Math.max(1, Math.round((Date.parse(session.endsAt) - Date.parse(session.startsAt)) / 60000));
              const instructor = localText(session.localizedInstructor, app.language);
              const equipment = localText(session.requiredEquipment, app.language);
              const instructionLanguage = session.instructionLanguage === 'en' ? t('languageEnglish')
                : session.instructionLanguage === 'ar' ? t('languageArabic')
                  : session.instructionLanguage === 'ku' ? t('languageSoraniKurdish')
                    : session.instructionLanguage === 'mixed' ? t('languageMultiple') : t('informationNotProvided');
              const difficulty = session.difficultyLevel === 'all-levels' ? t('allLevels')
                : session.difficultyLevel ? t(session.difficultyLevel) : t('informationNotProvided');
              const cancelBy = t('liveCancelBy').replace('{date}', iraqDateTime(session.cancellationDeadline, app.language));
              return (
                <View key={session.id} style={[styles.liveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.liveImage, styles.liveIcon, { backgroundColor: colors.secondary }]}><Ionicons name="videocam-outline" size={23} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.liveTime, { color: colors.primary, textAlign: align }]}>{iraqDateTime(session.startsAt, app.language)} · {duration} {t('minutesShort')}</Text>
                    <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align }]}>{title}</Text>
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                      {session.partnerName} · {session.facility}, {session.city}{booked ? ` · ${t('bookedLive')}` : ''}
                    </Text>
                    {description ? <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{description}</Text> : null}
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('liveInstructor')}: {instructor || t('informationNotProvided')}</Text>
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('liveDifficulty')}: {difficulty} · {t('liveLanguage')}: {instructionLanguage}</Text>
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                      {t('liveEquipment')}: {equipment || t('informationNotProvided')}
                    </Text>
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                      {t('liveMembership')}: {session.tiers.join(', ')}
                    </Text>
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                      {t('livePlacesRemaining').replace('{remaining}', String(session.remaining)).replace('{capacity}', String(session.capacity))}
                    </Text>
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{cancelBy}</Text>
                    <View style={styles.liveActions}>
                      {session.additionalPayment ? (
                        <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align }]}>{t('liveExtraPaymentUnavailable')}</Text>
                      ) : session.canJoin ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={`${t('joinClass')}: ${title}`}
                          disabled={joinMutation.isPending} onPress={() => void joinLive(session.id)}
                          style={[styles.joinButton, { backgroundColor: colors.primary, opacity: joinMutation.isPending ? .55 : 1 }]}>
                          <Text style={[styles.joinText, { color: colors.primaryForeground }]}>{joinMutation.isPending ? t('liveLoading') : t('joinClass')}</Text>
                        </Pressable>
                      ) : booked && canCancel ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={`${t('cancelLiveBooking')}: ${title}`}
                          disabled={app.memberLoading} onPress={() => void toggleLive(session.id, true)}
                          style={[styles.joinButton, { borderColor: colors.destructive, borderWidth: 1 }]}>
                          <Text style={[styles.joinText, { color: colors.destructive }]}>{t('cancelLiveBooking')}</Text>
                        </Pressable>
                      ) : booked && Date.parse(session.startsAt) > Date.now() ? (
                        <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{t('liveCancellationClosed')}</Text>
                      ) : booked ? (
                        <Text style={[styles.progressLabel, { color: colors.primary }]}>{t('bookedLive')}</Text>
                      ) : session.remaining < 1 ? (
                        <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{t('fullyBooked')}</Text>
                      ) : Date.parse(session.startsAt) <= Date.now() ? (
                        <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{t('bookingClosed')}</Text>
                      ) : (
                        <Pressable accessibilityRole="button" accessibilityLabel={`${t('bookOnline')}: ${title}`}
                          disabled={app.memberLoading} onPress={() => void toggleLive(session.id, false)}
                          style={[styles.joinButton, { backgroundColor: colors.accent }]}>
                          <Text style={[styles.joinText, { color: colors.accentForeground }]}>{t('bookOnline')}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
            <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align, marginTop: 8 }]}>{t('liveNotice')}</Text>
          </>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{t('onlineCoaching')}</Text>
            {coachingOffers.length === 0 ? (
              <View style={[styles.coachCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('noCoachingSlots')}</Text>
              </View>
            ) : coachingOffers.map((coach) => {
              const active = app.activeCoachRequest(coach.id);
              const chosen = active?.slot ?? slotChoice[coach.id];
              return (
                <View key={coach.id} style={[styles.coachCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.coachHead}>
                    <View style={[styles.coachIcon, { backgroundColor: colors.secondary }]}>
                      <Ionicons name="videocam-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align }]}>{coach.title}</Text>
                      <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('onlineCoaching')}</Text>
                      {coach.scope === 'preview' ? (
                        <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('sampleOffer')}</Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={[styles.slotLabel, { color: colors.foreground, textAlign: align }]}>{t('chooseTime')}</Text>
                  <View style={styles.slots}>
                    {coach.slots.map(slot => {
                      const selected = chosen === slot.id;
                      return (
                        <Pressable
                          key={slot.id}
                          testID={`button-coaching-slot-${coach.id}-${slot.id}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected, disabled: !!active }}
                          disabled={!!active}
                          onPress={() => setSlotChoice((c) => ({ ...c, [coach.id]: slot.id }))}
                          style={[styles.slot, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.card, opacity: active && !selected ? 0.5 : 1 }]}
                        >
                          <Text style={[styles.slotText, { color: selected ? colors.primary : colors.foreground }]}>{iraqDateTime(slot.startsAt, app.language)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.coachFooter}>
                    {active ? (
                      <View style={[styles.pendingPill, { backgroundColor: colors.muted }]}>
                        <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.pendingText, { color: colors.mutedForeground }]}>
                          {t(active.status === 'confirmed' ? 'requestConfirmed' : 'requestPending')}
                        </Text>
                      </View>
                    ) : <View />}
                    <Pressable
                      testID={`button-coaching-request-${coach.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${active ? t('cancelRequest') : t('saveRequest')}: ${coach.title}`}
                      disabled={app.memberLoading}
                      onPress={async () => {
                        if (active) {
                          const r = await app.cancelCoachRequest(coach.id, active.slot);
                          setMessage(r.ok ? t('cancelled') : t('notSaved'));
                        } else submitRequest(coach.id);
                      }}
                      style={[styles.joinButton, active ? { borderColor: colors.destructive, borderWidth: 1 } : { backgroundColor: chosen ? colors.primary : colors.secondary }]}
                    >
                      <Text style={[styles.joinText, { color: active ? colors.destructive : chosen ? colors.primaryForeground : colors.mutedForeground }]}>
                        {active ? t('cancelRequest') : t('saveRequest')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('coachingNotice')}</Text>
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 38 },
  intro: { borderRadius: 24, padding: 20, minHeight: 160, overflow: 'hidden', marginBottom: 17 },
  introCircle: { position: 'absolute', right: -30, top: -48, width: 190, height: 190, borderRadius: 100, backgroundColor: 'rgba(198,229,125,0.13)' },
  introEyebrow: { color: '#c6e57d', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  introTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800', marginTop: 9 },
  introText: { color: '#d1ddcf', fontSize: 11, marginTop: 6, maxWidth: 220, lineHeight: 16 },
  introMark: { position: 'absolute', right: 18, bottom: 18, width: 38, height: 38, borderRadius: 14, backgroundColor: '#c6e57d', alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 15, marginBottom: 16 },
  segmentOption: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  courseFilter: { marginTop: -5, marginBottom: 14 },
  searchField: { minHeight: 48, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginBottom: 16 },
  searchInput: { flex: 1, minHeight: 46, paddingVertical: 9, fontSize: 14 },
  clearSearchButton: { padding: 4 },
  segmentText: { fontSize: 11, fontWeight: '800' },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#d85c4e' },
  loading: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  toast: { borderRadius: 12, padding: 10, marginBottom: 12 },
  toastText: { fontSize: 11, fontWeight: '800' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 11 },
  courseCard: { position: 'relative', borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 11 },
  saveCourseOverlay: { position: 'absolute', top: 9, right: 9, zIndex: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 },
  courseImage: { width: '100%', height: 127 },
  courseImageFallback: { alignItems: 'center', justifyContent: 'center' },
  courseBody: { padding: 14 },
  courseKicker: { fontSize: 9, fontWeight: '700' },
  courseTitle: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  bundleSection: { gap: 10, marginTop: 18 },
  bundleCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 2 },
  bundleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  bundleCourse: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1 },
  bundleCourseNumber: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bundleCourseNumberText: { fontSize: 11, fontWeight: '800' },
  courseProgressTrack: { height: 5, borderRadius: 5, marginTop: 11, overflow: 'hidden' },
  courseProgressFill: { height: 5, borderRadius: 5 },
  courseFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 },
  progressLabel: { fontSize: 10, fontWeight: '600' },
  continueButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10 },
  continueText: { fontSize: 10, fontWeight: '800' },
  catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1 },
  courseRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  saveCourseButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  catalogImage: { width: 51, height: 51, borderRadius: 15 },
  catalogImageFallback: { alignItems: 'center', justifyContent: 'center' },
  catalogMeta: { fontSize: 10, marginTop: 4 },
  sponsoredBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 3 },
  sponsoredBadgeText: { fontSize: 9, fontWeight: '900' },
  playButton: { width: 34, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  liveCard: { borderWidth: 1, borderRadius: 18, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  liveImage: { width: 59, height: 59, borderRadius: 14 },
  liveIcon: { alignItems: 'center', justifyContent: 'center' },
  liveActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 7 },
  liveTime: { fontSize: 9, fontWeight: '800' },
  joinButton: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 11 },
  joinText: { fontSize: 10, fontWeight: '900' },
  coachCard: { borderWidth: 1, borderRadius: 20, padding: 12, marginBottom: 11 },
  coachHead: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  coachIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  slotLabel: { fontSize: 11, fontWeight: '800', marginTop: 12, marginBottom: 7 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  slot: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, minHeight: 38, justifyContent: 'center' },
  slotText: { fontSize: 10, fontWeight: '700' },
  coachFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 },
  pendingPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, flexShrink: 1 },
  pendingText: { fontSize: 9, fontWeight: '800' },
});
