import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { courses, getCityLabel, sessions } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';

export default function OnlineScreen() {
  const colors = useColors();
  const app = useApp();
  const [mode, setMode] = useState<'live' | 'courses'>('courses');
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);

  return (
    <ScreenShell>
      <ScreenHeader eyebrow="MOVE FROM ANYWHERE" title={t('online')} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.intro, { backgroundColor: colors.primary }]}>
          <View style={styles.introCircle} />
          <Text style={styles.introEyebrow}>YOUR SPACE. YOUR PACE.</Text>
          <Text style={styles.introTitle}>{t('fromHome')}</Text>
          <Text style={styles.introText}>Live sessions and small steps that fit real life.</Text>
          <View style={styles.introMark}><Ionicons name="play" size={17} color={colors.primary} /></View>
        </View>
        <View style={[styles.segment, { backgroundColor: colors.secondary }]}>
          {(['courses', 'live'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setMode(value)}
              style={[styles.segmentOption, mode === value && { backgroundColor: colors.card }]}
            >
              <Text style={[styles.segmentText, { color: mode === value ? colors.primary : colors.mutedForeground }]}>
                {value === 'courses' ? t('courses') : t('live')}
              </Text>
              {value === 'live' ? <View style={styles.liveDot} /> : null}
            </Pressable>
          ))}
        </View>
        {mode === 'courses' ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('continueLearning')}</Text>
            {courses.filter((course) => course.progress > 0).map((course) => (
              <View key={course.id} style={[styles.courseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Image source={course.image} style={styles.courseImage} />
                <View style={styles.courseBody}>
                  <Text style={[styles.courseKicker, { color: colors.mutedForeground }]}>{course.level} · {course.duration}</Text>
                  <Text style={[styles.courseTitle, { color: colors.foreground }]}>{course.title}</Text>
                  <View style={styles.courseProgressTrack}>
                    <View style={[styles.courseProgressFill, { width: `${course.progress}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <View style={styles.courseFooter}>
                    <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{course.progress}% complete</Text>
                    <Pressable style={[styles.continueButton, { backgroundColor: colors.accent }]}>
                      <Text style={[styles.continueText, { color: colors.accentForeground }]}>{t('continueCourse')}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 18 }]}>{t('courses')}</Text>
            {courses.map((course) => (
              <View key={course.id} style={[styles.catalogRow, { borderBottomColor: colors.border }]}>
                <Image source={course.image} style={styles.catalogImage} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.courseTitle, { color: colors.foreground }]}>{course.title}</Text>
                  <Text style={[styles.catalogMeta, { color: colors.mutedForeground }]}>{course.instructor} · {course.lessons} {t('lessons')}</Text>
                </View>
                <Pressable accessibilityRole="button" style={styles.playButton}>
                  <Ionicons name={course.progress ? 'play' : 'arrow-down'} size={15} color={colors.primary} />
                </Pressable>
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('live')} · {getCityLabel(app.selectedCityId, app.language)} {t('liveTime')}</Text>
            {sessions.map((session) => (
              <View key={session.id} style={[styles.liveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Image source={session.image} style={styles.liveImage} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.liveTime, { color: colors.primary }]}>{session.time}</Text>
                  <Text style={[styles.courseTitle, { color: colors.foreground }]}>{session.title}</Text>
                  <Text style={[styles.catalogMeta, { color: colors.mutedForeground }]}>Online with {session.instructor}</Text>
                </View>
                <Pressable style={[styles.joinButton, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.joinText, { color: colors.accentForeground }]}>Book</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
                Streaming and live-class booking are preview flows in this first build.
              </Text>
            </View>
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
  introEyebrow: { color: '#c6e57d', fontSize: 8, fontWeight: '900', letterSpacing: 1.6 },
  introTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800', marginTop: 9 },
  introText: { color: '#d1ddcf', fontSize: 11, marginTop: 6, maxWidth: 200, lineHeight: 16 },
  introMark: { position: 'absolute', right: 18, bottom: 18, width: 38, height: 38, borderRadius: 14, backgroundColor: '#c6e57d', alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 15, marginBottom: 21 },
  segmentOption: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  segmentText: { fontSize: 11, fontWeight: '800' },
  liveDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#d85c4e' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 11 },
  courseCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 11 },
  courseImage: { width: '100%', height: 127 },
  courseBody: { padding: 14 },
  courseKicker: { fontSize: 9, fontWeight: '700' },
  courseTitle: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  courseProgressTrack: { height: 5, borderRadius: 5, backgroundColor: '#e9eddf', marginTop: 11 },
  courseProgressFill: { height: 5, borderRadius: 5 },
  courseFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 },
  progressLabel: { fontSize: 9, fontWeight: '600' },
  continueButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10 },
  continueText: { fontSize: 9, fontWeight: '800' },
  catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1 },
  catalogImage: { width: 51, height: 51, borderRadius: 15 },
  catalogMeta: { fontSize: 10, marginTop: 4 },
  playButton: { width: 34, height: 34, borderRadius: 13, backgroundColor: '#e9eddf', alignItems: 'center', justifyContent: 'center' },
  liveCard: { borderWidth: 1, borderRadius: 18, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  liveImage: { width: 59, height: 59, borderRadius: 14 },
  liveTime: { fontSize: 9, fontWeight: '800' },
  joinButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11 },
  joinText: { fontSize: 9, fontWeight: '900' },
  note: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 10, padding: 11, borderRadius: 13, backgroundColor: '#edf0e7' },
  noteText: { flex: 1, fontSize: 10, lineHeight: 15 },
});
