import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useAuth, useUser } from '@clerk/expo';
import { router, useFocusEffect } from 'expo-router';
import { useGetAttendance, scanCheckinQr, ApiError } from '@workspace/api-client-react';
import { Ionicons, Text, Pressable } from '@/components/Localized';
import { ScreenShell, ScreenHeader } from '@/components/ScreenShell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AttendanceCard } from '@/components/AttendanceCard';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/contexts/AppContext';
import { dateTime } from '@/lib/content';
import { translate } from '@/lib/i18n';

export const checkinError = (e: unknown) => e instanceof ApiError && e.data && typeof e.data === 'object' && 'message' in e.data
  ? String(e.data.message) : e instanceof Error ? e.message : 'Check-in failed. Please try again.';
const isMemberConsentRequired = (e: unknown) =>
  e instanceof ApiError && !!e.data && typeof e.data === 'object'
  && 'code' in e.data && e.data.code === 'MEMBER_CONSENT_REQUIRED';

export default function CheckInScreen() {
  const c = useColors(), { language } = useApp();
  const { userId, isSignedIn } = useAuth(), { user } = useUser();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consentRequired, setConsentRequired] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const lock = useRef(false);
  const owner = useRef(userId); owner.current = userId;
  const roster = useGetAttendance({ query: { queryKey: ['attendance', userId], enabled: !!isSignedIn, refetchInterval: 10000 } });
  useFocusEffect(useCallback(() => { if (isSignedIn) void roster.refetch(); }, [isSignedIn, userId]));
  const scan = async ({ data }: { data: string }) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setConsentRequired(false);
    const who = userId;
    try {
      if (!/^MDG1:[a-f0-9]{64}$/.test(data)) throw new Error('Ask staff for a current MaydanGO QR code.');
      let coords: { latitude: number; longitude: number; accuracy: number | null }, timestamp: number, mocked = false;
      if (Platform.OS === 'web') {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
        coords = pos.coords; timestamp = pos.timestamp;
      } else {
        if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('Location permission is required.');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        coords = pos.coords; timestamp = pos.timestamp; mocked = pos.mocked ?? false;
      }
      if (coords.accuracy === null) throw new Error('Could not verify location accuracy. Please retry outdoors.');
      const result = await scanCheckinQr({ token: data, latitude: coords.latitude, longitude: coords.longitude,
        accuracy: coords.accuracy, capturedAt: new Date(timestamp).toISOString(), mocked });
      if (owner.current !== who) return;
      setReference(result.reference); setScanning(false);
      await roster.refetch();
    } catch (e) { if (owner.current === who) {
      const needsConsent = isMemberConsentRequired(e);
      setConsentRequired(needsConsent);
      setError(needsConsent ? translate(language, 'memberConsentsRequiredHint') : checkinError(e));
      setScanning(false);
    } }
    finally { setBusy(false); lock.current = false; }
  };
  const ownRows = roster.data?.rows.filter(r => r.userId === userId) ?? [];
  const success = ownRows.find(r => r.reference === reference);
  return <ScreenShell sample={false}>
    <ScreenHeader title="Check-in & attendance" eyebrow="Secure arrival and partner confirmation" />
    <KeyboardAwareScrollViewCompat contentContainerStyle={s.content}>
      <Pressable onPress={() => router.back()}><Text style={{ color: c.primary }}>Back</Text></Pressable>
      {!isSignedIn ? <View style={s.section}>
        <Text style={{ color: c.foreground }}>Sign in to check in and view your attendance. Sample reservations cannot be checked in.</Text>
        <Pressable onPress={() => router.push('/account')}><Text style={{ color: c.primary }}>Sign in</Text></Pressable>
      </View> : <>
        <Text style={{ color: c.mutedForeground }}>Scan the single-use QR shown by staff for your reservation. Arrival is not attendance until the partner confirms it.</Text>
        {success ? <View style={[s.section, { backgroundColor: c.secondary }]}>
          {user?.imageUrl ? <Image source={{ uri: user.imageUrl }} style={s.photo} /> : null}
          <Text raw style={{ color: c.foreground, fontWeight: '800' }}>{user?.fullName ?? user?.username ?? 'Member'}</Text>
          <View style={s.statusRow}>
            <StatusSeal confirmed={success.status === 'confirmed'}
              tint={success.status === 'confirmed' ? c.primary : c.accent}
              ink={success.status === 'confirmed' ? c.primaryForeground : c.accentForeground} />
            <Text style={{ color: success.status === 'confirmed' ? c.primary : c.foreground }}>
              {success.status === 'confirmed' ? 'Attendance confirmed' : 'Arrival recorded — awaiting partner confirmation'}
            </Text>
          </View>
          <Text raw style={{ color: c.foreground }}>{success.facility} · {success.title}</Text>
          <Text raw style={{ color: c.mutedForeground }}>{dateTime(success.checkedInAt!, language)}</Text>
          <Text raw selectable style={{ color: c.mutedForeground }}>{success.reference}</Text>
          <Text style={{ color: c.mutedForeground }}>Staff must verify this record in their own attendance roster, not from a screenshot.</Text>
        </View> : null}
        <Pressable disabled={busy} style={[s.button, { backgroundColor: c.primary }]} onPress={async () => {
          setError(''); setReference(null);
          if (permission?.granted || (await requestPermission()).granted) setScanning(true);
          else setError('Camera permission is required. Enable it in your device settings.');
        }}><Text style={{ color: c.primaryForeground }}>Scan partner QR</Text></Pressable>
        {scanning && permission?.granted ? <View>
          <CameraView style={s.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : scan} />
          <Pressable onPress={() => setScanning(false)}><Text style={{ color: c.primary }}>Close camera</Text></Pressable>
        </View> : null}
        {busy || roster.isLoading ? <ActivityIndicator color={c.primary} /> : null}
        {error || roster.error ? <Text accessibilityRole="alert" style={{ color: c.destructive }}>
          {consentRequired || isMemberConsentRequired(roster.error)
            ? translate(language, 'memberConsentsRequiredHint')
            : error || checkinError(roster.error)}
        </Text> : null}
        {consentRequired || isMemberConsentRequired(roster.error) ? <Pressable onPress={() => router.push('/account')}>
          <Text style={{ color: c.primary, textDecorationLine: 'underline' }}>{translate(language, 'memberConsentsTitle')}</Text>
        </Pressable> : null}
        <Pressable onPress={() => void roster.refetch()}><Text style={{ color: c.primary }}>Refresh attendance</Text></Pressable>
        <Text style={[s.heading, { color: c.foreground }]}>{roster.data?.role === 'member' ? 'Your attendance' : 'Partner attendance roster'}</Text>
        {roster.data?.rows.length === 0 ? <Text style={{ color: c.mutedForeground }}>No live reservations yet.</Text> : null}
        {roster.data?.rows.map(row => <AttendanceCard key={`${userId}:${row.reservationId}`} row={row}
          role={roster.data!.role} refresh={async () => { await roster.refetch(); }} />)}
      </>}
    </KeyboardAwareScrollViewCompat>
  </ScreenShell>;
}

function StatusSeal({ confirmed, tint, ink }: { confirmed: boolean; tint: string; ink: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (confirmed) {
      pulse.value = 0;
      return;
    }
    pulse.value = 0;
    pulse.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [confirmed, pulse]);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: confirmed ? 0 : 0.38 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.62 }],
  }));
  return <View style={s.seal} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {!confirmed ? <Animated.View style={[s.sealHalo, { borderColor: tint }, haloStyle]} /> : null}
    <View style={[s.sealCore, { backgroundColor: tint }]}>
      <Ionicons name={confirmed ? 'shield-checkmark' : 'shield-outline'} size={15} color={ink} />
    </View>
  </View>;
}

const s = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  section: { padding: 16, borderRadius: 16, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  seal: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  sealHalo: { position: 'absolute', width: 26, height: 26, borderRadius: 13, borderWidth: 1.5 },
  sealCore: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  button: { padding: 14, borderRadius: 12, alignItems: 'center' },
  camera: { height: 300, borderRadius: 16 },
  heading: { fontSize: 20, fontWeight: '800' },
  photo: { width: 60, height: 60, borderRadius: 30 },
});
