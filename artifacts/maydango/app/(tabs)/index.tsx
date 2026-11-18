import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import { useUser } from '@clerk/expo';
import { router } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { FacilityCard } from '@/components/FacilityCard';
import { categories, getCityLabel } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';
import { dateTime } from '@/lib/content';
import { cityIdForFacility, facilityText } from '@/lib/facility-content';
import {
  getGetPublicCatalogQueryKey,
  getGetPublicFacilitiesQueryKey,
  getGetPublicSponsoredFacilitiesQueryKey,
  getGetPublicSponsoredContentQueryKey,
  useGetPublicSponsoredFacilities,
  useGetPublicSponsoredContent,
  useGetMemberCourses,
  useGetMemberLiveClasses,
  useGetMemberAllowances,
  useGetPublicCatalog,
  useGetPublicFacilities,
} from '@workspace/api-client-react';
import { useSponsoredFacilityTracking } from '@/lib/sponsored-facilities';
import { findSponsoredFacilityPlacement } from '@/lib/sponsored-placement-match';
import { findSponsoredContentPlacement, useSponsoredContentTracking } from '@/lib/sponsored-content';

export default function HomeScreen() {
  const colors = useColors();
  const app = useApp();
  const { user } = useUser();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const firstName = user?.firstName?.trim();
  const greeting = firstName
    ? t('welcomeMember').replace('{name}', firstName)
    : t('goodMorning');
  const currentCity = getCityLabel(app.selectedCityId, app.language);
  const facilitiesQuery = useGetPublicFacilities({
    query: { queryKey: getGetPublicFacilitiesQueryKey(), refetchInterval: 60_000 },
  });
  const sponsoredQuery = useGetPublicSponsoredFacilities({
    query: {
      queryKey: [...getGetPublicSponsoredFacilitiesQueryKey(), app.signedIn],
      refetchInterval: 60_000,
    },
  });
  const sponsoredTracking = useSponsoredFacilityTracking();
  const sponsoredContentCity = app.selectedCityId === 'all' ? undefined : getCityLabel(app.selectedCityId, 'en');
  const sponsoredContentQuery = useGetPublicSponsoredContent(
    { city: sponsoredContentCity },
    { query: { queryKey: getGetPublicSponsoredContentQueryKey({ city: sponsoredContentCity }), refetchInterval: 60_000 } },
  );
  const sponsoredContentTracking = useSponsoredContentTracking();
  const eventsQuery = useGetPublicCatalog({
    query: { queryKey: getGetPublicCatalogQueryKey(), refetchInterval: 60_000 },
  });
  const coursesQuery = useGetMemberCourses({ query: { enabled: app.signedIn } });
  const liveQuery = useGetMemberLiveClasses({
    query: { enabled: app.signedIn, refetchInterval: 30_000 },
  });
  const allowancesQuery = useGetMemberAllowances({
    query: { enabled: app.signedIn, refetchInterval: 60_000, retry: false },
  });
  const activeMembership = app.memberMemberships.find((membership) =>
    membership.scope !== 'preview' &&
    ['active', 'trial', 'scheduled_cancellation'].includes(membership.status) &&
    Date.parse(membership.endsAt) > Date.now(),
  );
  const allowance = allowancesQuery.data?.membership;
  const allowanceRows = allowance
    ? allowance.quotaMode === 'shared'
      ? allowance.shared ? [{ label: t('sharedVisits'), balance: allowance.shared }] : []
      : [
          { label: t('physicalVisits'), balance: allowance.separate.physical },
          { label: t('premiumVisits'), balance: allowance.separate.premium },
          { label: t('onlineVisits'), balance: allowance.separate.live },
        ].filter((row): row is { label: string; balance: NonNullable<typeof row.balance> } => row.balance !== null)
    : [];
  const numberFormat = new Intl.NumberFormat(
    app.language === 'en' ? 'en-IQ' : app.language === 'ar' ? 'ar-IQ' : 'ku-IQ',
  );
  const dailyResetTime = allowance?.daily
    ? new Intl.DateTimeFormat(
        app.language === 'en' ? 'en-IQ' : app.language === 'ar' ? 'ar-IQ' : 'ku-IQ',
        { timeStyle: 'short', timeZone: 'Asia/Baghdad' },
      ).format(new Date(allowance.daily.resetsAt))
    : null;
  const membershipResetDate = allowance
    ? new Intl.DateTimeFormat(
        app.language === 'en' ? 'en-IQ' : app.language === 'ar' ? 'ar-IQ' : 'ku-IQ',
        { dateStyle: 'medium', timeZone: 'Asia/Baghdad' },
      ).format(new Date(allowance.endsAt))
    : null;
  const nearbyFacilities = useMemo(() => {
    const rows = (facilitiesQuery.data ?? []).filter((facility) =>
      app.selectedCityId === 'all' || cityIdForFacility(facility.city) === app.selectedCityId,
    );
    return rows.sort((a, b) => {
      const sponsoredOrder = Number(Boolean(findSponsoredFacilityPlacement(sponsoredQuery.data ?? [], b, 'home_featured')))
        - Number(Boolean(findSponsoredFacilityPlacement(sponsoredQuery.data ?? [], a, 'home_featured')));
      if (sponsoredOrder) return sponsoredOrder;
      const favoriteOrder = Number(app.favorites.includes(b.id)) - Number(app.favorites.includes(a.id));
      if (favoriteOrder) return favoriteOrder;
      return Number(b.openingStatus === 'open') - Number(a.openingStatus === 'open');
    }).slice(0, 4);
  }, [facilitiesQuery.data, sponsoredQuery.data, app.selectedCityId, app.favorites]);
  const upcomingBooking = useMemo(() => app.serverBookings
    .filter((booking) =>
      !['cancelled', 'partner_cancelled'].includes(String(booking.status)) &&
      Date.parse(booking.startsAt) > Date.now(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0], [app.serverBookings]);
  const nextLiveClass = useMemo(() => (liveQuery.data ?? [])
    .filter((item) => item.booked && Date.parse(item.startsAt) > Date.now())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0], [liveQuery.data]);
  const coursesInProgress = (coursesQuery.data ?? []).filter((course) =>
    course.enrolled && course.completedLessons < course.lessonCount,
  ).slice(0, 2);
  const upcomingEvents = useMemo(() => (eventsQuery.data ?? [])
    .filter((event) =>
      event.kind === 'event' &&
      !event.additionalPayment &&
      Date.parse(event.startsAt) > Date.now() &&
      (app.selectedCityId === 'all' || cityIdForFacility(event.city) === app.selectedCityId) &&
      !findSponsoredContentPlacement(sponsoredContentQuery.data ?? [], 'event', event.id, 'home_promotion'),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3), [eventsQuery.data, app.selectedCityId, sponsoredContentQuery.data]);
  const promotedEvents = useMemo(() => (eventsQuery.data ?? [])
    .filter(event =>
      event.kind === 'event' &&
      !event.additionalPayment &&
      Date.parse(event.startsAt) > Date.now() &&
      (app.selectedCityId === 'all' || cityIdForFacility(event.city) === app.selectedCityId) &&
      findSponsoredContentPlacement(sponsoredContentQuery.data ?? [], 'event', event.id, 'home_promotion'),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 2), [eventsQuery.data, app.selectedCityId, sponsoredContentQuery.data]);
  const promotedCourses = useMemo(() => (coursesQuery.data ?? [])
    .filter(course => !course.enrolled && findSponsoredContentPlacement(
      sponsoredContentQuery.data ?? [], 'course', course.id, 'home_promotion',
    ))
    .slice(0, 2), [coursesQuery.data, sponsoredContentQuery.data]);
  const localized = (value: { en?: string; ar?: string; ku?: string } | null | undefined) =>
    value?.[app.language] || value?.en || '';

  return (
    <ScreenShell>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        onScroll={() => { sponsoredTracking.checkVisible(); sponsoredContentTracking.checkVisible(); }}
        onContentSizeChange={() => { sponsoredTracking.checkVisible(); sponsoredContentTracking.checkVisible(); }}
        scrollEventThrottle={250}
      >
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Image source={require('../../assets/images/icon.png')} style={styles.logo} />
            <View>
              <Text style={[styles.brandName, { color: colors.foreground }]}>MaydanGO</Text>
              <Pressable onPress={() => router.push('/cities')} style={styles.location} accessibilityRole="button">
                <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground }]}>
                  {currentCity}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('checkIn')}
            testID="home-checkin-button"
            onPress={() => router.push('/checkin')}
            style={({ pressed }) => [
              styles.headerCheckin,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Ionicons name="scan-outline" size={19} color={colors.primaryForeground} />
          </Pressable>
        </View>

        <View style={styles.greetingBlock}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
            {t('regionEyebrow')}
          </Text>
          <Text style={[styles.greeting, { color: colors.foreground }]}>
            {greeting}
          </Text>
          <Text style={[styles.greetingAccent, { color: colors.primary }]}>
            {t('goodMorningAccent')}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/membership')}
          style={({ pressed }) => [
            styles.membershipCard,
            { backgroundColor: colors.primary, opacity: pressed ? 0.94 : 1 },
          ]}
        >
          <View style={styles.membershipTop}>
            <Text style={styles.membershipEyebrow}>{t('yourPass')}</Text>
            <View style={styles.membershipMark}>
              <Ionicons name="arrow-forward" size={18} color="#d9f2a1" />
            </View>
          </View>
          <Text style={styles.membershipTier}>
            {activeMembership ? activeMembership.tier : t('choosePlan')}
          </Text>
          <Text style={styles.membershipDetails}>
            {activeMembership
              ? `${t('managePass')} · ${dateTime(activeMembership.endsAt, app.language, true)}`
              : t('planNote')}
          </Text>
          {app.signedIn && allowancesQuery.isLoading && activeMembership && (
            <ActivityIndicator
              accessibilityLabel={t('loadingAllowances')}
              color={colors.primaryForeground}
              size="small"
              style={styles.allowanceLoading}
            />
          )}
          {allowance && (allowanceRows.length > 0 || allowance.daily !== null) && (
            <View
              style={[styles.allowanceContent, { borderTopColor: colors.primaryForeground }]}
              testID="home-membership-allowances"
            >
              <Text style={[styles.allowanceHeading, { color: colors.primaryForeground }]}>
                {t('accessBalance')}
              </Text>
              <View style={styles.allowanceRows}>
                {allowanceRows.map(row => (
                  <View key={row.label} style={styles.allowanceRow}>
                    <Text style={[styles.allowanceLabel, { color: colors.primaryForeground }]}>
                      {row.label}
                    </Text>
                    <Text style={[styles.allowanceValue, { color: colors.primaryForeground }]}>
                      {numberFormat.format(row.balance.remaining)}/{numberFormat.format(row.balance.limit)}
                    </Text>
                  </View>
                ))}
              </View>
              {allowance.daily && dailyResetTime && (
                <Text style={[styles.allowanceReset, { color: colors.primaryForeground }]}>
                  {t('dailyVisits')}: {numberFormat.format(allowance.daily.remaining)}/
                  {numberFormat.format(allowance.daily.limit)} · {t('resetsDaily')} {dailyResetTime}
                </Text>
              )}
              {membershipResetDate && (
                <Text style={[styles.allowanceReset, { color: colors.primaryForeground }]}>
                  {t('resetsWithMembership')} {membershipResetDate}
                </Text>
              )}
            </View>
          )}
          {allowancesQuery.isError && activeMembership && (
            <Text style={[styles.allowanceUnavailable, { color: colors.primaryForeground }]} role="alert">
              {t('allowancesUnavailable')}
            </Text>
          )}
        </Pressable>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t('upcoming')}
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              {t('bookings')}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/bookings')} accessibilityRole="button">
            <Text style={[styles.seeAll, { color: colors.primary }]}>{t('seeAll')}</Text>
          </Pressable>
        </View>

        {upcomingBooking ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/bookings')}
            style={({ pressed }) => [
              styles.dashboardCard,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <View style={[styles.dashboardIcon, { backgroundColor: colors.secondary }]}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dashboardMeta, { color: colors.primary }]}>
                {dateTime(upcomingBooking.startsAt, app.language)}
              </Text>
              <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>
                {upcomingBooking.localizedTitle
                  ? facilityText(upcomingBooking.localizedTitle, app.language)
                  : upcomingBooking.title}
              </Text>
              <Text style={[styles.dashboardMeta, { color: colors.mutedForeground }]}>
                {[upcomingBooking.facility, upcomingBooking.city].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : app.signedIn && !app.memberLoading ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/explore')}
            style={[styles.emptyBooking, { backgroundColor: colors.secondary }]}
          >
            <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>{t('noBookings')}</Text>
            <Text style={[styles.dashboardMeta, { color: colors.mutedForeground }]}>{t('noBookingsHint')}</Text>
            <Text style={[styles.seeAll, { color: colors.primary, marginTop: 8 }]}>{t('findClass')}</Text>
          </Pressable>
        ) : null}

        {nextLiveClass ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/online')}
            style={[styles.dashboardCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.dashboardIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name="videocam-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dashboardMeta, { color: colors.primary }]}>{t('live')}</Text>
              <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>
                {localized(nextLiveClass.localizedTitle) || nextLiveClass.title}
              </Text>
              <Text style={[styles.dashboardMeta, { color: colors.mutedForeground }]}>
                {dateTime(nextLiveClass.startsAt, app.language)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}

        {coursesInProgress.length ? (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('continueLearning')}</Text>
              </View>
              <Pressable onPress={() => router.push('/online')} accessibilityRole="button">
                <Text style={[styles.seeAll, { color: colors.primary }]}>{t('seeAll')}</Text>
              </Pressable>
            </View>
            {coursesInProgress.map((course) => {
              const progress = course.lessonCount > 0
                ? Math.round((course.completedLessons / course.lessonCount) * 100)
                : 0;
              return (
                <Pressable
                  key={course.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('continueCourse')}: ${localized(course.localizedTitle)}`}
                  onPress={() => router.push({ pathname: '/course/[id]', params: { id: course.id, resume: '1' } })}
                  style={({ pressed }) => [
                    styles.courseProgressCard,
                    { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
                  ]}
                >
                  {course.thumbnailUrl ? (
                    <Image source={{ uri: course.thumbnailUrl }} style={styles.courseThumbnail} />
                  ) : (
                    <View style={[styles.courseThumbnail, styles.courseThumbnailFallback, { backgroundColor: colors.secondary }]}>
                      <Ionicons name="fitness-outline" size={22} color={colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>
                      {localized(course.localizedTitle)}
                    </Text>
                    <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
                      <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
                    </View>
                    <Text style={[styles.dashboardMeta, { color: colors.mutedForeground }]}>
                      {course.completedLessons}/{course.lessonCount} · {progress}%
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </>
        ) : null}

        <View style={styles.checkinHint}>
          <View style={[styles.checkinIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.checkinTitle, { color: colors.foreground }]}>
              {t('checkIn')}
            </Text>
            <Text style={[styles.checkinSub, { color: colors.mutedForeground }]}>
              {t('checkInHint')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t('nearby')}
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              {t('nearbyHint')}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/explore')} accessibilityRole="button">
            <Text style={[styles.seeAll, { color: colors.primary }]}>{t('exploreAll')}</Text>
          </Pressable>
        </View>
        {facilitiesQuery.isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : facilitiesQuery.isError ? (
          <Pressable accessibilityRole="button" onPress={() => void facilitiesQuery.refetch()} style={styles.emptyBooking}>
            <Text style={[styles.dashboardMeta, { color: colors.destructive }]}>{t('catalogLoadError')}</Text>
          </Pressable>
        ) : nearbyFacilities.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalCards}
            onScroll={sponsoredTracking.checkVisible} onContentSizeChange={sponsoredTracking.checkVisible} scrollEventThrottle={250}>
            {nearbyFacilities.map((facility) => {
              const placement = findSponsoredFacilityPlacement(
                sponsoredQuery.data ?? [],
                facility,
                'home_featured',
              );
              return (
                <View
                  key={facility.id}
                  ref={view => sponsoredTracking.register(facility.id, placement?.campaignId, 'home_featured', view)}
                  collapsable={false}
                  onLayout={sponsoredTracking.checkVisible}
                >
                  <FacilityCard
                    facility={facility}
                    favorite={app.favorites.includes(facility.id)}
                    sponsoredLabel={placement ? t('sponsored') : undefined}
                    onPress={() => {
                      if (placement) sponsoredTracking.recordClick(placement.campaignId, 'home_featured');
                      router.push({ pathname: '/facility/[id]', params: { id: facility.id } });
                    }}
                    onToggleFavorite={() => app.toggleFavorite(facility.id)}
                    compact
                  />
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <View style={[styles.emptyBooking, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.dashboardMeta, { color: colors.mutedForeground }]}>{t('noPublishedFacilities')}</Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('events')}</Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>{currentCity}</Text>
          </View>
          <Pressable onPress={() => router.push({ pathname: '/explore', params: { kind: 'events' } })} accessibilityRole="button">
            <Text style={[styles.seeAll, { color: colors.primary }]}>{t('seeAll')}</Text>
          </Pressable>
        </View>
        {eventsQuery.isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : eventsQuery.isError ? (
          <Pressable accessibilityRole="button" onPress={() => void eventsQuery.refetch()} style={styles.emptyBooking}>
            <Text style={[styles.dashboardMeta, { color: colors.destructive }]}>{t('eventLoadError')}</Text>
          </Pressable>
        ) : upcomingEvents.length ? (
          upcomingEvents.map((event) => (
            <Pressable
              key={event.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/explore', params: { kind: 'events' } })}
              style={({ pressed }) => [
                styles.eventRow,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <View style={[styles.dashboardIcon, { backgroundColor: colors.secondary }]}>
                <Ionicons name="ticket-outline" size={19} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dashboardMeta, { color: colors.primary }]}>{dateTime(event.startsAt, app.language)}</Text>
                <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>
                  {event.localizedTitle ? facilityText(event.localizedTitle, app.language) : event.title}
                </Text>
                <Text style={[styles.dashboardMeta, { color: colors.mutedForeground }]}>
                  {[event.facility, event.city].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
          ))
        ) : (
          <Text style={[styles.dashboardMeta, styles.emptyEvents, { color: colors.mutedForeground }]}>{t('noEvents')}</Text>
        )}

        {(promotedEvents.length || promotedCourses.length) ? <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('sponsoredHighlights')}</Text>
          </View>
          {promotedEvents.map(event => {
            const campaign = findSponsoredContentPlacement(sponsoredContentQuery.data ?? [], 'event', event.id, 'home_promotion');
            return <View
              key={`home-sponsored-event-${event.id}`}
              ref={view => sponsoredContentTracking.register(`home-event-${event.id}`, campaign?.campaignId, 'home_promotion', view)}
              collapsable={false}
              onLayout={sponsoredContentTracking.checkVisible}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (campaign) sponsoredContentTracking.recordClick(campaign.campaignId, 'home_promotion');
                  router.push({
                    pathname: '/explore',
                    params: campaign
                      ? { kind: 'events', sponsoredCampaignId: campaign.campaignId, sponsoredTargetId: event.id, sponsoredPlacementType: 'home_promotion' }
                      : { kind: 'events' },
                  });
                }}
                style={({ pressed }) => [styles.eventRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }]}
              >
                <View style={[styles.dashboardIcon, { backgroundColor: colors.secondary }]}><Ionicons name="ticket-outline" size={19} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dashboardMeta, { color: colors.primary, fontWeight: '800' }]}>{t('sponsored')} · {dateTime(event.startsAt, app.language)}</Text>
                  <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>{event.localizedTitle ? facilityText(event.localizedTitle, app.language) : event.title}</Text>
                  <Text style={[styles.dashboardMeta, { color: colors.mutedForeground }]}>{[event.facility, event.city].filter(Boolean).join(' · ')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>;
          })}
          {promotedCourses.map(course => {
            const campaign = findSponsoredContentPlacement(sponsoredContentQuery.data ?? [], 'course', course.id, 'home_promotion');
            return <View
              key={`home-sponsored-course-${course.id}`}
              ref={view => sponsoredContentTracking.register(`home-course-${course.id}`, campaign?.campaignId, 'home_promotion', view)}
              collapsable={false}
              onLayout={sponsoredContentTracking.checkVisible}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (campaign) sponsoredContentTracking.recordClick(campaign.campaignId, 'home_promotion');
                  router.push({
                    pathname: '/course/[id]',
                    params: {
                      id: course.id,
                      ...(campaign ? { sponsoredCampaignId: campaign.campaignId, sponsoredPlacementType: 'home_promotion' } : {}),
                    },
                  });
                }}
                style={({ pressed }) => [styles.eventRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.9 : 1 }]}
              >
                <View style={[styles.dashboardIcon, { backgroundColor: colors.secondary }]}><Ionicons name="play-circle-outline" size={19} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dashboardMeta, { color: colors.primary, fontWeight: '800' }]}>{t('sponsored')} · {course.category}</Text>
                  <Text style={[styles.dashboardTitle, { color: colors.foreground }]}>{localized(course.localizedTitle)}</Text>
                  <Text style={[styles.dashboardMeta, { color: colors.mutedForeground }]}>{localized(course.localizedInstructor)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>;
          })}
        </> : null}

        <View style={styles.categoryRow}>
          <Text style={[styles.categoryEyebrow, { color: colors.mutedForeground }]}>
            MOVE YOUR WAY
          </Text>
          <Text style={[styles.categoryCount, { color: colors.mutedForeground }]}>
            {categories.length - 1} ways to begin
          </Text>
        </View>
        <View style={styles.chipRow}>
          {categories.slice(1, 5).map((category) => (
            <Pressable
              key={category}
              onPress={() => router.push({ pathname: '/explore', params: { category } })}
              style={[styles.categoryChip, { backgroundColor: colors.secondary }]}
            >
              <Text style={[styles.categoryChipText, { color: colors.secondaryForeground }]}>
                {category}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/explore', params: { kind: 'events' } })}
          style={[styles.eventsBanner, { backgroundColor: colors.secondary }]}
        >
          <View style={[styles.eventsIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="ticket-outline" size={18} color={colors.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eventsTitle, { color: colors.foreground }]}>{t('events')}</Text>
            <Text style={[styles.eventsHint, { color: colors.mutedForeground }]}>{t('allWelcome')}</Text>
          </View>
          <Ionicons name="arrow-forward" size={17} color={colors.primary} />
        </Pressable>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 110 },
  topBar: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 18,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: { alignItems: 'center', gap: 10 },
  logo: { width: 42, height: 42, borderRadius: 14 },
  brandName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  location: { alignItems: 'center', gap: 3, marginTop: 2, flexDirection: 'row' },
  locationText: { fontSize: 11, fontWeight: '600' },
  headerCheckin: {
    width: 42,
    height: 42,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  greetingBlock: { paddingHorizontal: 22, marginTop: 8, marginBottom: 18 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginBottom: 8 },
  greeting: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1 },
  greetingAccent: { fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -1 },
  membershipCard: {
    marginHorizontal: 20,
    minHeight: 145,
    borderRadius: 25,
    overflow: 'hidden',
    padding: 18,
    marginBottom: 27,
  },
  membershipTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  membershipEyebrow: { color: '#c7d6c8', fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  membershipMark: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,247,238,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  membershipTier: { color: '#f5f7ee', fontSize: 22, fontWeight: '800', marginTop: 9 },
  membershipDetails: { color: '#c7d6c8', fontSize: 10, lineHeight: 15, marginTop: 5 },
  allowanceLoading: { alignSelf: 'flex-start', marginTop: 12 },
  allowanceContent: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 11 },
  allowanceHeading: { fontSize: 11, fontWeight: '800', marginBottom: 8 },
  allowanceRows: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allowanceRow: { minWidth: '30%', flexGrow: 1 },
  allowanceLabel: { fontSize: 9, fontWeight: '600', opacity: 0.82 },
  allowanceValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  allowanceReset: { fontSize: 9, lineHeight: 14, marginTop: 7, opacity: 0.85 },
  allowanceUnavailable: { fontSize: 10, lineHeight: 15, marginTop: 12, opacity: 0.88 },
  sectionHeader: {
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 22,
    marginBottom: 13,
  },
  sectionTitle: { fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: -0.4 },
  sectionSub: { marginTop: 3, fontSize: 11, fontWeight: '500' },
  seeAll: { fontSize: 11, fontWeight: '800', paddingBottom: 3 },
  dashboardCard: { marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  dashboardIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dashboardMeta: { fontSize: 10, lineHeight: 15, fontWeight: '500' },
  dashboardTitle: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  emptyBooking: { marginHorizontal: 20, marginBottom: 14, padding: 14, borderRadius: 16 },
  loadingRow: { height: 52, alignItems: 'center', justifyContent: 'center' },
  courseProgressCard: { marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderRadius: 18, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  courseThumbnail: { width: 62, height: 62, borderRadius: 14 },
  courseThumbnailFallback: { alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 5, borderRadius: 5, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  eventRow: { marginHorizontal: 20, marginBottom: 9, borderWidth: 1, borderRadius: 18, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyEvents: { marginHorizontal: 22, marginBottom: 12 },
  checkinHint: {
    marginHorizontal: 20,
    marginBottom: 27,
    padding: 13,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e8dc',
  },
  checkinIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinTitle: { fontSize: 13, fontWeight: '800' },
  checkinSub: { fontSize: 10, fontWeight: '500', marginTop: 3 },
  horizontalCards: { paddingHorizontal: 20, paddingBottom: 5 },
  categoryRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    marginTop: 17,
    marginBottom: 10,
  },
  categoryEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.3 },
  categoryCount: { fontSize: 10, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  categoryChipText: { fontSize: 10, fontWeight: '700' },
  eventsBanner: { marginHorizontal: 20, marginTop: 16, marginBottom: 2, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventsIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  eventsTitle: { fontSize: 12, fontWeight: '900' },
  eventsHint: { fontSize: 9, marginTop: 3 },
});
