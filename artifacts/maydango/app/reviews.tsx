import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getGetMemberFacilityReviewsQueryKey, getGetPublicFacilityReviewsQueryKey,
  useCreateMemberFacilityReview, useGetMemberFacilityReviews,
} from '@workspace/api-client-react';
import type { FacilityReviewInput } from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { Text, Pressable } from '@/components/Localized';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';
import { reviewCopy, type ReviewCopyKey } from '@/lib/reviews-copy';
import { dateTime } from '@/lib/content';

const categories = [
  ['cleanliness', 'cleanliness'],
  ['staff', 'staff'],
  ['equipment', 'equipment'],
  ['instructor', 'instructor'],
  ['facilities', 'facilities'],
  ['informationAccuracy', 'informationAccuracy'],
] as const;
type CategoryKey = typeof categories[number][0];
type CategoryRatings = FacilityReviewInput['categoryRatings'];
const emptyCategoryRatings: CategoryRatings = {
  cleanliness: null, staff: null, equipment: null, instructor: null, facilities: null, informationAccuracy: null,
};

export default function ReviewsScreen() {
  const colors = useColors();
  const app = useApp();
  const queryClient = useQueryClient();
  const t = (key: ReviewCopyKey) => reviewCopy(app.language, key);
  const align = app.language === 'en' ? 'left' : 'right';
  const query = useGetMemberFacilityReviews({
    query: { queryKey: getGetMemberFacilityReviewsQueryKey(), enabled: app.signedIn, refetchOnMount: 'always', retry: false },
  });
  const createReview = useCreateMemberFacilityReview();
  const [activeReservation, setActiveReservation] = useState<string | null>(null);
  const [overallRating, setOverallRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<CategoryRatings>(emptyCategoryRatings);
  const [comment, setComment] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const startReview = (reservationId: string) => {
    setActiveReservation(reservationId);
    setOverallRating(0);
    setCategoryRatings(emptyCategoryRatings);
    setComment('');
    setExpandedCategories(false);
    setError('');
    setNotice('');
  };

  const sendReview = async (reservationId: string, facilityId: string) => {
    if (overallRating < 1) {
      setError(t('chooseOverall'));
      return;
    }
    const input: FacilityReviewInput = {
      reservationId,
      overallRating,
      categoryRatings,
      content: comment.trim() || null,
    };
    try {
      await createReview.mutateAsync({ data: input });
      await queryClient.invalidateQueries({ queryKey: getGetMemberFacilityReviewsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetPublicFacilityReviewsQueryKey(facilityId) });
      setActiveReservation(null);
      setNotice(t('saved'));
      setError('');
    } catch {
      setError(t('saveError'));
    }
  };

  if (!app.signedIn) {
    return <ScreenShell>
      <ScreenHeader eyebrow={translate(app.language, 'profile')} title={t('title')} />
      <View style={styles.signInState}>
        <Ionicons name="star-outline" size={30} color={colors.primary} />
        <Text raw style={[styles.body, { color: colors.mutedForeground, textAlign: 'center' }]}>{t('signIn')}</Text>
        <Pressable accessibilityRole="button" testID="reviews-sign-in" onPress={() => router.push('/account')} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
          <Text raw style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{t('signIn')}</Text>
        </Pressable>
      </View>
    </ScreenShell>;
  }

  if (query.isLoading) {
    return <ScreenShell><ScreenHeader eyebrow={translate(app.language, 'profile')} title={t('title')} /><View style={styles.state}><Text raw style={{ color: colors.mutedForeground }}>{translate(app.language, 'loadingFacilities')}</Text></View></ScreenShell>;
  }
  if (query.isError || !query.data) {
    return <ScreenShell><ScreenHeader eyebrow={translate(app.language, 'profile')} title={t('title')} /><View style={styles.state}>
      <Text raw style={{ color: colors.destructive }}>{t('loadError')}</Text>
      <Pressable accessibilityRole="button" testID="reviews-retry" onPress={() => void query.refetch()}>
        <Text raw style={{ color: colors.primary, fontWeight: '700' }}>{translate(app.language, 'tryAgain')}</Text>
      </Pressable>
    </View></ScreenShell>;
  }

  return <ScreenShell sample={false}>
    <ScreenHeader eyebrow={translate(app.language, 'bookings')} title={t('title')} />
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      bottomOffset={24}
    >
      <Text raw style={[styles.intro, { color: colors.mutedForeground, textAlign: align }]}>{t('intro')}</Text>
      {notice ? <Text raw accessibilityRole="alert" style={[styles.notice, { color: colors.primary }]}>{notice}</Text> : null}
      {error ? <Text raw accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      <Text raw style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{t('eligibleVisits')}</Text>
      {query.data.eligibleVisits.length ? query.data.eligibleVisits.map(visit => (
        <View key={visit.reservationId} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.visitHead}>
            <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
              <Ionicons name="fitness-outline" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text raw style={[styles.cardTitle, { color: colors.foreground, textAlign: align }]}>{visit.facility}</Text>
              <Text raw style={[styles.meta, { color: colors.mutedForeground, textAlign: align }]}>{visit.offeringTitle} · {visit.city}</Text>
              <Text raw style={[styles.meta, { color: colors.mutedForeground, textAlign: align }]}>{t('visitDate')}: {dateTime(visit.attendedAt, app.language)}</Text>
            </View>
          </View>
          {activeReservation === visit.reservationId ? (
            <View style={styles.form}>
              <Text raw style={[styles.fieldLabel, { color: colors.foreground, textAlign: align }]}>{t('overall')}</Text>
              <RatingRow value={overallRating} onChange={value => setOverallRating(value ?? 0)} colors={colors} label={t('overall')} />
              <Pressable accessibilityRole="button" testID="toggle-review-categories" onPress={() => setExpandedCategories(value => !value)} style={styles.optionalToggle}>
                <Text raw style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{t('optionalCategories')}</Text>
                <Ionicons name={expandedCategories ? 'chevron-up' : 'chevron-down'} size={15} color={colors.primary} />
              </Pressable>
              {expandedCategories ? categories.map(([key, label]) => (
                <View key={key} style={styles.categoryRow}>
                  <Text raw style={[styles.fieldLabel, { color: colors.foreground, textAlign: align }]}>{t(label)}</Text>
                  <RatingRow value={categoryRatings[key]} onChange={value => setCategoryRatings(current => ({ ...current, [key]: value }))} colors={colors} label={t(label)} optional />
                </View>
              )) : null}
              <Text raw style={[styles.fieldLabel, { color: colors.foreground, textAlign: align }]}>{t('comment')}</Text>
              <TextInput
                testID="input-review-comment"
                value={comment}
                onChangeText={setComment}
                multiline
                maxLength={2000}
                textAlign={align}
                placeholder={t('commentHint')}
                placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.background }]}
              />
              <Pressable
                accessibilityRole="button"
                testID="button-submit-review"
                disabled={createReview.isPending}
                onPress={() => {
                  void sendReview(visit.reservationId, visit.facilityId);
                }}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: pressed || createReview.isPending ? 0.78 : 1 }]}
              >
                <Text raw style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{createReview.isPending ? t('sending') : t('submit')}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.primaryForeground} />
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" testID={`button-rate-${visit.reservationId}`} onPress={() => startReview(visit.reservationId)} style={styles.openButton}>
              <Text raw style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>{t('rateVisit')}</Text>
              <Ionicons name="star-outline" size={16} color={colors.primary} />
            </Pressable>
          )}
        </View>
      )) : <Empty text={t('noEligible')} colors={colors} />}

      <Text raw style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{t('myReviews')}</Text>
      {query.data.reviews.length ? query.data.reviews.map(review => (
        <View key={review.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.visitHead}>
            <View style={[styles.iconBox, { backgroundColor: colors.accent }]}>
              <Ionicons name="star" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text raw style={[styles.cardTitle, { color: colors.foreground, textAlign: align }]}>{review.facility} · {review.city}</Text>
              <Text raw style={[styles.meta, { color: colors.mutedForeground, textAlign: align }]}>{review.overallRating}/5 · {t(review.status)}</Text>
            </View>
          </View>
          {review.content ? <Text raw style={[styles.reviewText, { color: colors.foreground, textAlign: align }]}>{review.content}</Text> : null}
          {review.partnerResponse ? <View style={[styles.responseBox, { backgroundColor: colors.secondary }]}>
            <Text raw style={[styles.meta, { color: colors.secondaryForeground, fontWeight: '800', textAlign: align }]}>{t('partnerResponse')}</Text>
            <Text raw style={[styles.reviewText, { color: colors.secondaryForeground, textAlign: align }]}>{review.partnerResponse}</Text>
          </View> : null}
        </View>
      )) : <Empty text={t('noReviews')} colors={colors} />}
    </KeyboardAwareScrollViewCompat>
  </ScreenShell>;
}

function RatingRow({ value, onChange, colors, label, optional = false }: {
  value: number | null;
  onChange: (value: number | null) => void;
  colors: ReturnType<typeof useColors>;
  label: string;
  optional?: boolean;
}) {
  return <View accessibilityLabel={label} style={styles.ratingRow}>
    {[1, 2, 3, 4, 5].map(score => (
      <Pressable key={score} accessibilityRole="button" accessibilityLabel={`${label}: ${score}`} accessibilityState={{ selected: value === score }}
        testID={`rating-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${score}`}
        onPress={() => onChange(value === score && optional ? null : score)} hitSlop={5} style={styles.ratingButton}>
        <Ionicons name={value !== null && score <= value ? 'star' : 'star-outline'} size={22}
          color={value !== null && score <= value ? colors.accent : colors.mutedForeground} />
      </Pressable>
    ))}
  </View>;
}

function Empty({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.mutedForeground} />
    <Text raw style={[styles.meta, { color: colors.mutedForeground, textAlign: 'center' }]}>{text}</Text>
  </View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 44 },
  intro: { fontSize: 12, lineHeight: 18, marginBottom: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 9, marginTop: 10 },
  card: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  visitHead: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '800' },
  meta: { fontSize: 10, lineHeight: 16, marginTop: 3 },
  openButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 5, marginTop: 5 },
  form: { gap: 9, marginTop: 15 },
  fieldLabel: { fontSize: 11, fontWeight: '700', marginTop: 5 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 3 },
  ratingButton: { minWidth: 34, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  optionalToggle: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  categoryRow: { paddingVertical: 4 },
  input: { minHeight: 88, borderWidth: 1, borderRadius: 13, padding: 11, fontSize: 12, lineHeight: 18, textAlignVertical: 'top' },
  primaryButton: { minHeight: 44, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 15, marginTop: 6 },
  primaryButtonText: { fontSize: 12, fontWeight: '800' },
  reviewText: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  responseBox: { borderRadius: 12, padding: 11, marginTop: 10 },
  notice: { fontSize: 12, fontWeight: '700', marginBottom: 10 },
  error: { fontSize: 12, marginBottom: 10 },
  empty: { minHeight: 74, borderWidth: 1, borderRadius: 15, padding: 15, gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  signInState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  body: { fontSize: 13, lineHeight: 19 },
});
