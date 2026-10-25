import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MemberNotice } from '@/components/MemberNotice';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { LocalNotice } from '@/components/LocalNotice';
import { coaches, courses, getCityLabel, pick, sessions } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate, type MessageKey } from '@/lib/i18n';

type Mode = 'courses' | 'live' | 'coaching';

export default function OnlineScreen() {
  const colors = useColors();
  const app = useApp();
  const [mode, setMode] = useState<Mode>('courses');
  const [slotChoice, setSlotChoice] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const t = (key: MessageKey) => translate(app.language, key);
  const align = app.language === 'en' ? 'left' : 'right';
  const liveSessions = sessions.filter((s) => s.mode === 'online');
  const started = courses.filter((c) => app.courseProgress[c.id]);
  const openCourse = (id: string) => router.push({ pathname: '/course/[id]', params: { id } });

  const toggleLive = async (id: string) => {
    const was = app.isSessionBooked(id);
    const r = await (was ? app.cancelBooking(id) : app.bookSession(id));
    setMessage(r.ok ? (was ? t('cancelled') : t('booked')) : r.reason === 'duplicate' ? t('alreadySaved') : t('notSaved'));
  };

  const submitRequest = async (coachId: string) => {
    const slot = slotChoice[coachId];
    if (!slot) return setMessage(t('chooseSlotFirst'));
    const r = await app.requestCoaching(coachId, slot);
    setMessage(r.ok ? t('requestSent') : r.reason === 'duplicate' ? t('alreadySaved') : r.reason === 'invalid' ? t('chooseSlotFirst') : t('notSaved'));
  };

  return (
    <ScreenShell>
      <ScreenHeader eyebrow={t('onlineEyebrow')} title={t('online')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{t('continueLearning')}</Text>
            {started.length === 0 ? (
              <Text style={[styles.catalogMeta, { color: colors.mutedForeground, marginBottom: 14, textAlign: align }]}>{t('notStartedYet')}</Text>
            ) : null}
            {started.map((course) => {
              const pct = app.courseCompletion(course.id);
              return (
                <Pressable
                  key={course.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('continueCourse')}: ${pick(course.localTitle, app.language)}, ${pct}% ${t('complete')}`}
                  onPress={() => openCourse(course.id)}
                  style={[styles.courseCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Image source={course.image} style={styles.courseImage} />
                  <View style={styles.courseBody}>
                    <Text style={[styles.courseKicker, { color: colors.mutedForeground, textAlign: align }]}>{course.level} · {course.duration}</Text>
                    <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align }]}>{pick(course.localTitle, app.language)}</Text>
                    <View style={[styles.courseProgressTrack, { backgroundColor: colors.secondary }]}>
                      <View style={[styles.courseProgressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                    </View>
                    <View style={styles.courseFooter}>
                      <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{pct}% {t('complete')}</Text>
                      {/* Visual label only: the whole card is the single pressable. */}
                      <View style={[styles.continueButton, { backgroundColor: colors.accent }]}>
                        <Text style={[styles.continueText, { color: colors.accentForeground }]}>{t('continueCourse')}</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 18, textAlign: align }]}>{t('courses')}</Text>
            {courses.map((course) => {
              const enrolled = !!app.courseProgress[course.id];
              return (
                <Pressable
                  key={course.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('viewCourse')}: ${pick(course.localTitle, app.language)}`}
                  onPress={() => openCourse(course.id)}
                  style={[styles.catalogRow, { borderBottomColor: colors.border }]}
                >
                  <Image source={course.image} style={styles.catalogImage} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align }]}>{pick(course.localTitle, app.language)}</Text>
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                      {course.instructor} · {course.sampleLessons.length} {t('lessons')}{enrolled ? ` · ${t('enrolled')}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.playButton, { backgroundColor: colors.secondary }]}>
                    <Ionicons name={enrolled ? 'play' : 'chevron-forward'} size={15} color={colors.primary} style={app.language !== 'en' && !enrolled ? { transform: [{ scaleX: -1 }] } : undefined} />
                  </View>
                </Pressable>
              );
            })}
            <LocalNotice messageKey="courseNotice" />
          </>
        ) : mode === 'live' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>
              {t('liveOnline')} · {getCityLabel(app.selectedCityId === 'all' ? 'baghdad' : app.selectedCityId, app.language)} {t('liveTime')}
            </Text>
            {liveSessions.length === 0 ? (
              <Text style={[styles.catalogMeta, { color: colors.mutedForeground }]}>{t('noLive')}</Text>
            ) : null}
            {liveSessions.map((session) => {
              const booked = app.isSessionBooked(session.id);
              return (
                <View key={session.id} style={[styles.liveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Image source={session.image} style={styles.liveImage} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.liveTime, { color: colors.primary, textAlign: align }]}>{app.offeringTime('session', session.id)} · {session.duration}</Text>
                    <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align }]}>{session.title}</Text>
                    <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>
                      {t('withInstructor')} {session.instructor}{booked ? ` · ${t('statusReserved')}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${booked ? t('cancelBooking') : t('bookOnline')}: ${session.title}`}
                    onPress={() => toggleLive(session.id)}
                    style={[styles.joinButton, booked ? { borderColor: colors.destructive, borderWidth: 1 } : { backgroundColor: colors.accent }]}
                  >
                    <Text style={[styles.joinText, { color: booked ? colors.destructive : colors.accentForeground }]}>
                      {booked ? t('cancel') : t('bookOnline')}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
            <Text style={{ color: colors.mutedForeground }}>Sample classes only. No live streaming is available. Reservations are saved to your account; server dates appear in Bookings.</Text>
          </>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: align }]}>{t('onlineCoaching')}</Text>
            {coaches.map((coach) => {
              const active = app.activeCoachRequest(coach.id);
              const chosen = active?.slot ?? slotChoice[coach.id];
              return (
                <View key={coach.id} style={[styles.coachCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.coachHead}>
                    <Image source={coach.image} style={styles.liveImage} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.courseTitle, { color: colors.foreground, textAlign: align }]}>{coach.name}</Text>
                      <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{coach.specialty}</Text>
                      <Text style={[styles.catalogMeta, { color: colors.mutedForeground, textAlign: align }]}>{t('speaks')}: {coach.languages}</Text>
                    </View>
                  </View>
                  <Text style={[styles.slotLabel, { color: colors.foreground, textAlign: align }]}>{t('chooseTime')}</Text>
                  <View style={styles.slots}>
                    {coach.slots.map((slot) => {
                      const selected = chosen === slot.id;
                      return (
                        <Pressable
                          key={slot.id}
                          accessibilityRole="radio"
                          accessibilityState={{ selected, disabled: !!active }}
                          disabled={!!active}
                          onPress={() => setSlotChoice((c) => ({ ...c, [coach.id]: slot.id }))}
                          style={[styles.slot, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.secondary : colors.card, opacity: active && !selected ? 0.5 : 1 }]}
                        >
                          <Text style={[styles.slotText, { color: selected ? colors.primary : colors.foreground }]}>{app.offeringTime('coach', coach.id, slot.id)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.coachFooter}>
                    {active ? (
                      <View style={[styles.pendingPill, { backgroundColor: colors.muted }]}>
                        <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
                        <Text style={[styles.pendingText, { color: colors.mutedForeground }]}>{t('requestPending')}</Text>
                      </View>
                    ) : <View />}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${active ? t('cancelRequest') : t('saveRequest')}: ${coach.name}`}
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
            <Text style={{ color: colors.mutedForeground }}>Sample coaches only. Requests sync to your account but are not sent to a partner or confirmed. Server dates appear in Bookings.</Text>
          </>
        )}
      </ScrollView>
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
  segmentText: { fontSize: 11, fontWeight: '800' },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#d85c4e' },
  toast: { borderRadius: 12, padding: 10, marginBottom: 12 },
  toastText: { fontSize: 11, fontWeight: '800' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 11 },
  courseCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 11 },
  courseImage: { width: '100%', height: 127 },
  courseBody: { padding: 14 },
  courseKicker: { fontSize: 9, fontWeight: '700' },
  courseTitle: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  courseProgressTrack: { height: 5, borderRadius: 5, marginTop: 11, overflow: 'hidden' },
  courseProgressFill: { height: 5, borderRadius: 5 },
  courseFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 },
  progressLabel: { fontSize: 10, fontWeight: '600' },
  continueButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10 },
  continueText: { fontSize: 10, fontWeight: '800' },
  catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1 },
  catalogImage: { width: 51, height: 51, borderRadius: 15 },
  catalogMeta: { fontSize: 10, marginTop: 4 },
  playButton: { width: 34, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  liveCard: { borderWidth: 1, borderRadius: 18, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  liveImage: { width: 59, height: 59, borderRadius: 14 },
  liveTime: { fontSize: 9, fontWeight: '800' },
  joinButton: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 11 },
  joinText: { fontSize: 10, fontWeight: '900' },
  coachCard: { borderWidth: 1, borderRadius: 20, padding: 12, marginBottom: 11 },
  coachHead: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  slotLabel: { fontSize: 11, fontWeight: '800', marginTop: 12, marginBottom: 7 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  slot: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, minHeight: 38, justifyContent: 'center' },
  slotText: { fontSize: 10, fontWeight: '700' },
  coachFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 },
  pendingPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, flexShrink: 1 },
  pendingText: { fontSize: 9, fontWeight: '800' },
});
