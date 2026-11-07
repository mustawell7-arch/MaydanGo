import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import { Text } from '@/components/Localized';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate, type MessageKey } from '@/lib/i18n';

type HeritageKind = 'star' | 'lamassu' | 'ishtar' | 'erbil' | 'ur' | 'gardens' | 'hatra' | 'anbar';

const heritageItems: { kind: HeritageKind; title: MessageKey; note?: MessageKey }[] = [
  { kind: 'star', title: 'heritageGeometry', note: 'heritageGeometryNote' },
  { kind: 'lamassu', title: 'heritageLamassu' },
  { kind: 'ishtar', title: 'heritageIshtarGate' },
  { kind: 'erbil', title: 'heritageErbil' },
  { kind: 'ur', title: 'heritageUr' },
  { kind: 'gardens', title: 'heritageGardens', note: 'heritageGardensNote' },
  { kind: 'hatra', title: 'heritageHatra' },
  { kind: 'anbar', title: 'heritageAnbar' },
];

function HeritageArtwork({ kind }: { kind: HeritageKind }) {
  const colors = useColors();
  const ink = colors.primary;
  const clay = colors.secondary;
  const gold = colors.accent;
  const ground = colors.muted;

  return (
    <Svg viewBox="0 0 160 100" width="100%" height="100%">
      <Rect x="0" y="0" width="160" height="100" fill={ground} />
      <Circle cx="132" cy="19" r="9" fill={gold} opacity={0.9} />
      <Path d="M0 86 Q42 78 80 85 T160 82 V100 H0Z" fill={clay} opacity={0.5} />

      {kind === 'star' ? (
        <>
          <Polygon
            points="80,9 89,34 115,25 101,48 127,59 101,69 111,94 88,81 75,104 66,80 40,89 51,67 25,57 51,48 42,22 66,35"
            fill={ink}
            stroke={gold}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <Circle cx="76" cy="57" r="12" fill={ground} stroke={gold} strokeWidth="2" />
        </>
      ) : null}

      {kind === 'lamassu' ? (
        <>
          <Path d="M47 49 C38 31 47 18 67 18 C82 18 94 31 91 49Z" fill={clay} stroke={ink} strokeWidth="2" />
          <Path d="M57 47 C52 29 60 19 74 18 C82 22 85 33 82 48" fill="none" stroke={gold} strokeWidth="3" />
          <Path d="M38 50 L104 50 L120 61 L123 77 L109 77 L104 67 L95 67 L94 84 L82 84 L82 69 L61 69 L59 84 L47 84 L48 67 L39 67 L34 78 L22 78 L27 59Z" fill={ink} />
          <Path d="M104 51 L124 46 L133 51 L131 66 L121 69" fill={ink} />
          <Path d="M118 46 L121 37 L126 45 M131 47 L138 42 L136 51" fill="none" stroke={gold} strokeWidth="2.5" strokeLinecap="round" />
          <Circle cx="127" cy="55" r="1.8" fill={gold} />
          <Path d="M45 54 L36 42 M50 54 L43 39 M56 53 L51 39" stroke={gold} strokeWidth="2" strokeLinecap="round" />
        </>
      ) : null}

      {kind === 'ishtar' ? (
        <>
          <Rect x="25" y="25" width="110" height="58" rx="3" fill={ink} />
          <Rect x="59" y="49" width="42" height="34" rx="20" fill={ground} />
          <Rect x="31" y="19" width="14" height="9" fill={clay} />
          <Rect x="53" y="19" width="14" height="9" fill={clay} />
          <Rect x="75" y="19" width="14" height="9" fill={clay} />
          <Rect x="97" y="19" width="14" height="9" fill={clay} />
          <Rect x="119" y="19" width="10" height="9" fill={clay} />
          <Path d="M33 38 H52 M108 38 H127 M35 45 H52 M108 45 H125" stroke={gold} strokeWidth="2" />
          <Polygon points="42,55 48,48 54,55 48,62" fill={gold} />
          <Polygon points="106,55 112,48 118,55 112,62" fill={gold} />
        </>
      ) : null}

      {kind === 'erbil' ? (
        <>
          <Path d="M16 83 Q32 62 50 57 Q68 48 82 55 Q103 44 124 57 Q142 65 148 83Z" fill={clay} />
          <Path d="M27 61 L27 46 L42 46 L42 39 L55 39 L55 49 L68 49 L68 38 L82 38 L82 47 L96 47 L96 36 L110 36 L110 47 L127 47 L127 62Z" fill={ink} />
          <Path d="M26 61 H128 M38 48 V56 M62 49 V57 M89 47 V56 M116 49 V57" stroke={gold} strokeWidth="2" />
          <Rect x="48" y="54" width="8" height="8" fill={ground} />
          <Rect x="75" y="52" width="8" height="9" fill={ground} />
          <Rect x="101" y="52" width="8" height="9" fill={ground} />
        </>
      ) : null}

      {kind === 'ur' ? (
        <>
          <Path d="M31 82 H129 V73 H115 V63 H101 V53 H87 V43 H73 V53 H59 V63 H45 V73 H31Z" fill={clay} />
          <Path d="M74 82 V54 H86 V82 M30 73 H130 M44 63 H116 M58 53 H102" stroke={ink} strokeWidth="2" />
          <Path d="M76 81 L80 55 L84 81" fill={gold} />
          <Path d="M18 85 H142" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : null}

      {kind === 'gardens' ? (
        <>
          <Path d="M27 81 H133 L121 69 H39Z" fill={ink} />
          <Path d="M39 68 H121 L110 56 H50Z" fill={clay} />
          <Path d="M51 55 H109 L98 44 H62Z" fill={ink} />
          <Path d="M65 43 H95 L88 33 H72Z" fill={clay} />
          <Path d="M48 69 C44 60 49 56 45 49 M111 69 C116 60 110 56 116 49 M63 55 C59 48 64 43 60 36 M97 55 C102 48 97 43 101 36" fill="none" stroke={gold} strokeWidth="3" strokeLinecap="round" />
          <Circle cx="45" cy="47" r="5" fill={gold} />
          <Circle cx="116" cy="47" r="5" fill={gold} />
          <Circle cx="60" cy="34" r="5" fill={gold} />
          <Circle cx="101" cy="34" r="5" fill={gold} />
        </>
      ) : null}

      {kind === 'hatra' ? (
        <>
          <Path d="M28 83 V50 C28 29 49 20 80 20 C111 20 132 29 132 50 V83Z" fill={clay} />
          <Path d="M47 82 V53 C47 38 59 31 80 31 C101 31 113 38 113 53 V82Z" fill={ground} />
          <Path d="M58 82 V59 C58 48 67 42 80 42 C93 42 102 48 102 59 V82" fill={ink} />
          <Path d="M37 51 V79 M47 44 V79 M113 44 V79 M123 51 V79" stroke={gold} strokeWidth="2" />
          <Path d="M21 83 H139" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : null}

      {kind === 'anbar' ? (
        <>
          <Path d="M0 20 Q23 27 34 51 Q43 69 58 83 H0Z" fill={clay} />
          <Path d="M160 15 Q139 28 130 51 Q122 69 104 83 H160Z" fill={ink} opacity={0.9} />
          <Path d="M60 84 Q78 70 75 59 Q72 48 88 38 Q103 29 101 18" fill="none" stroke={gold} strokeWidth="6" strokeLinecap="round" />
          <Path d="M18 32 L31 38 M136 32 L124 38 M26 48 L39 54 M132 49 L120 55" stroke={gold} strokeWidth="2" strokeLinecap="round" />
        </>
      ) : null}
    </Svg>
  );
}

export function IraqHeritageStrip() {
  const app = useApp();
  const colors = useColors();
  const t = (key: MessageKey) => translate(app.language, key);
  const align = app.language === 'en' ? 'left' : 'right';

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{t('heritageTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground, textAlign: align }]}>{t('heritageSubtitle')}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cards}
        accessibilityLabel={t('heritageTitle')}
      >
        {heritageItems.map((item) => (
          <View
            key={item.kind}
            accessible
            accessibilityLabel={`${t(item.title)}${item.note ? `. ${t(item.note)}` : ''}`}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.art}>
              <HeritageArtwork kind={item.kind} />
            </View>
            <View style={styles.caption}>
              <Text style={[styles.cardTitle, { color: colors.foreground, textAlign: align }]}>{t(item.title)}</Text>
              {item.note ? (
                <Text style={[styles.note, { color: colors.mutedForeground, textAlign: align }]}>{t(item.note)}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, marginBottom: 8 },
  heading: { paddingHorizontal: 22, marginBottom: 12 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '800' },
  subtitle: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  cards: { paddingHorizontal: 20, gap: 10 },
  card: { width: 158, borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  art: { width: '100%', height: 98, overflow: 'hidden' },
  caption: { minHeight: 54, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7 },
  cardTitle: { fontSize: 11, lineHeight: 16, fontWeight: '800' },
  note: { fontSize: 9, lineHeight: 13, marginTop: 2 },
});
