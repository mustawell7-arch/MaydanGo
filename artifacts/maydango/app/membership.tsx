import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import { currency } from '@/lib/content';
import { router } from 'expo-router';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';

const plans = [
  { tier: 'M' as const, price: '55,000', physical: '12', premium: '2', online: '8', tag: 'A good place to begin' },
  { tier: 'L' as const, price: '85,000', physical: '20', premium: '4', online: 'Unlimited', tag: 'Room to do more' },
  { tier: 'XL' as const, price: '125,000', physical: 'Unlimited', premium: '8', online: 'Unlimited', tag: 'Your fullest access' },
];

export default function MembershipScreen() {
  const colors = useColors();
  const app = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.secondary }]}>
          <Ionicons name="arrow-back" size={19} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('membership')}</Text>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('choosePlan')}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('planNote')}</Text>
        <View style={[styles.activeCard, { backgroundColor: colors.primary }]}>
          <View style={styles.activeLine}>
            <Text style={styles.activeCaption}>{t('yourPass')}</Text>
            <View style={styles.activeTag}><View style={styles.activeDot} /><Text style={styles.activeWord}>Preview</Text></View>
          </View>
          <Text style={styles.activeTier}>{app.membershipTier} · sample plan</Text>
          <Text style={styles.activeQuota}>Local preview only — not a server membership</Text>
        </View>
        {plans.map((plan) => {
          const selected = plan.tier === app.membershipTier;
          return (
            <View key={plan.tier} style={[styles.planCard, { backgroundColor: colors.card, borderColor: selected ? colors.primary : colors.border }]}>
              <View style={styles.planTop}>
                <View>
                  <Text style={[styles.planTier, { color: colors.foreground }]}>{plan.tier}</Text>
                  <Text style={[styles.planTag, { color: colors.mutedForeground }]}>{plan.tag}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.price, { color: colors.foreground }]}>{currency(Number(plan.price.replaceAll(',', '')), app.language)}</Text>
                  <Text style={[styles.currency, { color: colors.mutedForeground }]}>/ month · preview</Text>
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <PlanLine label="Physical visits" value={plan.physical} colors={colors} />
              <PlanLine label="Premium visits" value={plan.premium} colors={colors} />
              <PlanLine label="Live & online" value={plan.online} colors={colors} />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => app.setMembershipTier(plan.tier)}
                disabled={selected}
                style={[styles.planButton, { backgroundColor: selected ? colors.secondary : colors.primary }]}
              >
                <Text style={[styles.planButtonText, { color: selected ? colors.primary : colors.primaryForeground }]}>
                  {selected ? t('selected') : t('selectPlan')}
                </Text>
              </Pressable>
            </View>
          );
        })}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={15} color={colors.mutedForeground} />
          <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
            Plan prices and selection are sample preview content. Payment and subscription billing are not connected yet.
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function PlanLine({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.planLine}>
      <Text style={[styles.planLineLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.planLineValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backButton: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 38 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { fontSize: 12, marginTop: 4, marginBottom: 17 },
  activeCard: { borderRadius: 21, padding: 17, marginBottom: 15 },
  activeLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeCaption: { color: '#d3e0d1', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  activeTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  activeDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#c6e57d' },
  activeWord: { color: '#e3ecde', fontSize: 8, fontWeight: '900' },
  activeTier: { color: '#ffffff', fontSize: 22, fontWeight: '900', marginTop: 14 },
  activeQuota: { color: '#d3e0d1', fontSize: 10, marginTop: 4 },
  planCard: { borderWidth: 1.5, borderRadius: 20, padding: 15, marginBottom: 11 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planTier: { fontSize: 23, fontWeight: '900' },
  planTag: { fontSize: 9, marginTop: 2 },
  price: { fontSize: 17, fontWeight: '900' },
  currency: { fontSize: 8, marginTop: 2 },
  divider: { height: 1, marginVertical: 12 },
  planLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  planLineLabel: { fontSize: 10 },
  planLineValue: { fontSize: 10, fontWeight: '800' },
  planButton: { alignItems: 'center', justifyContent: 'center', minHeight: 39, borderRadius: 13, marginTop: 12 },
  planButtonText: { fontSize: 10, fontWeight: '900' },
  disclaimer: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 7, paddingHorizontal: 2 },
  disclaimerText: { fontSize: 9, lineHeight: 14, flex: 1 },
});
