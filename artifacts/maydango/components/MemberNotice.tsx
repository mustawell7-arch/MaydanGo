import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';

export function MemberNotice() {
  const app = useApp();
  const c = useColors();
  return <View style={{ padding: 14, gap: 10, borderRadius: 14, backgroundColor: c.muted, marginVertical: 12 }}>
    <Text style={{ color: c.foreground, fontWeight: '700' }}>Account reservations · sample partners</Text>
    <Text style={{ color: c.mutedForeground, fontSize: 12, lineHeight: 18 }}>
      Reservations sync to your account. Sample partners are not live; no ticket, attendance, or partner confirmation is issued.
      Old device-only reservations have not been imported.
    </Text>
    {!app.signedIn ? <Pressable testID="member-sign-in" onPress={() => router.push('/account')}><Text style={{ color: c.primary, fontWeight: '700' }}>Sign in / Create account</Text></Pressable> :
      <Pressable onPress={() => router.push('/account')}><Text style={{ color: c.primary }}>Account & membership eligibility</Text></Pressable>}
    {app.memberLoading ? <Text style={{ color: c.mutedForeground }}>Syncing…</Text> : null}
    {app.memberError ? <Text accessibilityRole="alert" style={{ color: c.destructive }}>{app.memberError}</Text> : null}
    {app.signedIn ? <Pressable testID="refresh-bookings" disabled={app.memberLoading} onPress={() => void app.refreshMember()}><Text style={{ color: c.primary }}>Refresh reservations</Text></Pressable> : null}
  </View>;
}
