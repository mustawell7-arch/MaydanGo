import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { LocalNotice } from '@/components/LocalNotice';
import { courses, pick } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate, type MessageKey } from '@/lib/i18n';

export default function CourseDetailScreen() {
  const colors = useColors();
  const app = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = courses.find((c) => c.id === id);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const t = (key: MessageKey) => translate(app.language, key);
  const align = app.language === 'en' ? 'left' : 'right';

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/online'))} style={styles.backButton}>
      <Ionicons name={app.language === 'en' ? 'arrow-back' : 'arrow-forward'} size={19} color={colors.accentForeground} />
    </Pressable>
  );

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

  const progress = app.courseProgress[course.id];
  const pct = app.courseCompletion(course.id);

  return (
    <ScreenShell>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image source={course.image} style={styles.heroImage} resizeMode="cover" />
          <View style={styles.shade} />
          <View style={styles.heroTop}>{back}</View>
          <View style={styles.heroText}>
            <Text style={[styles.kicker, { textAlign: align }]}>{course.level} · {course.duration} · {course.instructor}</Text>
            <Text style={[styles.heroTitle, { textAlign: align }]}>{pick(course.localTitle, app.language)}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <Text style={[styles.summary, { color: colors.foreground, textAlign: align }]}>{pick(course.summary, app.language)}</Text>

          {progress ? (
            <View style={[styles.progressCard, { backgroundColor: colors.secondary }]}>
              <View style={styles.progressRow}>
                <Text style={[styles.progressPct, { color: colors.primary }]}>{pct}%</Text>
                <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                  {t('complete')} · {progress.completedLessons.length}/{course.sampleLessons.length} {t('lessons')}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.card }]}>
                <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
              </View>
            </View>
          ) : (
            <View style={[styles.progressCard, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align }]}>{t('enrolToTrack')}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const r = app.enrollCourse(course.id);
                  setMessage(r.ok ? t('enrolled') : r.reason === 'duplicate' ? t('alreadySaved') : t('notSaved'));
                  if (r.ok) setOpenLesson(course.sampleLessons[0]?.id ?? null);
                }}
                style={({ pressed }) => [styles.enrolButton, { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 }]}
              >
                <Text style={[styles.enrolText, { color: colors.primaryForeground }]}>{t('enrol')}</Text>
              </Pressable>
            </View>
          )}
          {message ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.primary, textAlign: align }]}>{message}</Text> : null}

          {course.sampleLessons.map((lesson, index) => {
            const done = !!progress?.completedLessons.includes(lesson.id);
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
                    <Text style={[styles.lessonKicker, { color: colors.mutedForeground, textAlign: align }]}>{t('lessonWord')} {index + 1} · {lesson.minutes} {t('minutesShort')}</Text>
                    <Text style={[styles.lessonTitle, { color: colors.foreground, textAlign: align }]}>{pick(lesson.title, app.language)}</Text>
                  </View>
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mutedForeground} />
                </Pressable>
                {open ? (
                  <View style={styles.lessonBody}>
                    <Text style={[styles.lessonText, { color: colors.foreground, textAlign: align }]}>{pick(lesson.body, app.language)}</Text>
                    {progress ? (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: done }}
                        onPress={() => {
                          const r = app.toggleLesson(course.id, lesson.id);
                          if (!r.ok) setMessage(t('notSaved'));
                        }}
                        style={[styles.doneButton, done ? { borderColor: colors.primary, borderWidth: 1 } : { backgroundColor: colors.accent }]}
                      >
                        <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={done ? colors.primary : colors.accentForeground} />
                        <Text style={[styles.doneText, { color: done ? colors.primary : colors.accentForeground }]}>{done ? t('markUndone') : t('markDone')}</Text>
                      </Pressable>
                    ) : (
                      <Text style={[styles.progressLabel, { color: colors.mutedForeground, textAlign: align, marginTop: 10 }]}>{t('enrolToTrack')}</Text>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
          <LocalNotice messageKey="courseNotice" />
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
