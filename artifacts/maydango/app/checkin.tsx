import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Text, Pressable, Ionicons } from '@/components/Localized';
import { router } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { facilities } from '@/data/demo';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';

type ScanStatus = 'idle' | 'verifying' | 'success' | 'outside' | 'invalid' | 'location-error';

export default function CheckInScreen() {
  const colors = useColors();
  const app = useApp();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [facilityName, setFacilityName] = useState('');
  const scanLock = useRef(false);
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);

  const requestLocation = useCallback(async () => {
    if (Platform.OS === 'web') {
      const granted = typeof navigator !== 'undefined' && 'geolocation' in navigator;
      setLocationPermission(granted);
      return granted;
    }
    const result = await Location.requestForegroundPermissionsAsync();
    const granted = result.granted;
    setLocationPermission(granted);
    return granted;
  }, []);

  const verifyLocation = useCallback(async (facility: (typeof facilities)[number]) => {
    try {
      let latitude: number;
      let longitude: number;
      if (Platform.OS === 'web') {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Location is unavailable.'));
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12000,
          });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } else {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      }
      const distance = distanceInMeters(
        latitude,
        longitude,
        facility.latitude,
        facility.longitude,
      );
      if (distance > 800) {
        setStatus('outside');
        return;
      }
      setFacilityName(facility.name);
      app.recordCheckIn(facility.id);
      setStatus('success');
    } catch {
      setStatus('location-error');
    } finally {
      scanLock.current = false;
    }
  }, [app]);

  const handleScan = useCallback(
    async ({ data }: { data: string }) => {
      if (scanLock.current || status !== 'idle') return;
      scanLock.current = true;
      setStatus('verifying');
      const normalized = data.trim();
      const id = normalized.startsWith('MAYDANGO:')
        ? normalized.slice('MAYDANGO:'.length).trim().toLowerCase()
        : normalized.startsWith('maydango://checkin/')
          ? normalized.split('/').pop()?.toLowerCase()
          : '';
      const facility = facilities.find((item) => item.id.toLowerCase() === id);
      if (!facility) {
        setStatus('invalid');
        scanLock.current = false;
        return;
      }
      const allowed = locationPermission ?? (await requestLocation());
      if (!allowed) {
        setStatus('location-error');
        scanLock.current = false;
        return;
      }
      await verifyLocation(facility);
    },
    [status, locationPermission, requestLocation, verifyLocation],
  );

  const resetScan = () => {
    scanLock.current = false;
    setStatus('idle');
    setFacilityName('');
  };

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={[styles.backButton, { backgroundColor: colors.secondary }]}>
          <Ionicons name="close" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('checkIn')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {status === 'success' ? (
        <View style={styles.successWrap}>
          <View style={[styles.successIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="checkmark" size={38} color={colors.primary} />
          </View>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>{t('checkInSuccess')}</Text>
          <Text style={[styles.successText, { color: colors.mutedForeground }]}>{facilityName}</Text>
          <Text style={[styles.successHint, { color: colors.mutedForeground }]}>{t('checkInSuccessHint')}</Text>
          <View style={[styles.reference, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.referenceLabel, { color: colors.mutedForeground }]}>PREVIEW CONFIRMATION</Text>
            <Text raw style={[styles.referenceValue, { color: colors.foreground }]}>MDG-{Date.now().toString().slice(-6)}</Text>
          </View>
          <Pressable onPress={() => router.back()} style={[styles.doneButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('scanCode')}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('scanHelp')}</Text>
          {cameraPermission?.granted ? (
            <View style={styles.cameraFrame}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={status === 'idle' ? handleScan : undefined}
              />
              <View pointerEvents="none" style={styles.scanOverlay}>
                <View style={styles.cornerTL} />
                <View style={styles.cornerTR} />
                <View style={styles.cornerBL} />
                <View style={styles.cornerBR} />
                <View style={styles.scanLine} />
              </View>
              {status === 'verifying' ? (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#c6e57d" />
                  <Text style={styles.loadingText}>Checking visit access…</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={[styles.permissionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.permissionIcon, { backgroundColor: colors.secondary }]}>
                <Ionicons name="camera-outline" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.permissionText, { color: colors.mutedForeground }]}>{t('cameraAccess')}</Text>
              {cameraPermission?.status === 'denied' && !cameraPermission.canAskAgain ? (
                <Pressable onPress={() => Platform.OS !== 'web' && Linking.openSettings()} style={[styles.allowButton, { backgroundColor: colors.primary }]}>
                  <Text style={styles.allowText}>Open settings</Text>
                </Pressable>
              ) : (
                <Pressable onPress={requestCameraPermission} style={[styles.allowButton, { backgroundColor: colors.primary }]}>
                  <Text style={styles.allowText}>{t('allowCamera')}</Text>
                </Pressable>
              )}
            </View>
          )}
          {locationPermission !== true ? (
            <Pressable onPress={requestLocation} style={[styles.locationHint, { backgroundColor: colors.secondary }]}>
              <Ionicons name="location-outline" size={17} color={colors.primary} />
              <Text style={[styles.locationText, { color: colors.foreground }]}>{t('allowLocation')}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          {status !== 'idle' && status !== 'verifying' ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.destructive} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.errorTitle, { color: colors.destructive }]}>
                  {status === 'outside' ? t('outsideRadius') : status === 'invalid' ? t('invalidQr') : 'Could not verify your location.'}
                </Text>
                <Text style={[styles.errorSub, { color: colors.mutedForeground }]}>
                  {status === 'outside' ? t('outsideRadiusHint') : status === 'invalid' ? t('scanHelp') : 'Check your permission and try again.'}
                </Text>
              </View>
              <Pressable onPress={resetScan} accessibilityLabel="Try again">
                <Ionicons name="refresh" size={17} color={colors.primary} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.previewNote}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.mutedForeground} />
            <Text style={[styles.previewText, { color: colors.mutedForeground }]}>{t('demoMode')}. QR and location checks run on this device in this preview.</Text>
          </View>
        </View>
      )}
    </ScreenShell>
  );
}

function distanceInMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const deltaLatitude = radians(latitude2 - latitude1);
  const deltaLongitude = radians(longitude2 - longitude1);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(latitude1)) *
      Math.cos(radians(latitude2)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '900' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 17 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 11, lineHeight: 16, marginTop: 6, marginBottom: 19, maxWidth: 290 },
  cameraFrame: { height: 350, borderRadius: 25, overflow: 'hidden', backgroundColor: '#173529', position: 'relative' },
  camera: { flex: 1 },
  scanOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  cornerTL: { position: 'absolute', top: '25%', left: '13%', width: 36, height: 36, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#c6e57d', borderTopLeftRadius: 9 },
  cornerTR: { position: 'absolute', top: '25%', right: '13%', width: 36, height: 36, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#c6e57d', borderTopRightRadius: 9 },
  cornerBL: { position: 'absolute', bottom: '25%', left: '13%', width: 36, height: 36, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#c6e57d', borderBottomLeftRadius: 9 },
  cornerBR: { position: 'absolute', bottom: '25%', right: '13%', width: 36, height: 36, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#c6e57d', borderBottomRightRadius: 9 },
  scanLine: { width: '68%', height: 1.5, backgroundColor: 'rgba(198,229,125,0.75)' },
  loadingOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(12,25,20,0.8)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  permissionCard: { borderRadius: 22, borderWidth: 1, alignItems: 'center', padding: 22, marginTop: 10 },
  permissionIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  permissionText: { fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 250 },
  allowButton: { marginTop: 15, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 10 },
  allowText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  locationHint: { marginTop: 12, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  locationText: { flex: 1, fontSize: 10, fontWeight: '700' },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: '#f6e9e7' },
  errorTitle: { fontSize: 10, fontWeight: '900' },
  errorSub: { fontSize: 9, lineHeight: 14, marginTop: 3 },
  previewNote: { flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginTop: 17 },
  previewText: { flex: 1, fontSize: 9, lineHeight: 14 },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  successIcon: { width: 80, height: 80, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  successText: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  successHint: { fontSize: 10, textAlign: 'center', marginTop: 5 },
  reference: { width: '100%', borderRadius: 15, alignItems: 'center', padding: 13, marginTop: 22 },
  referenceLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  referenceValue: { fontSize: 15, fontWeight: '900', marginTop: 5, letterSpacing: 1 },
  doneButton: { width: '100%', alignItems: 'center', borderRadius: 15, paddingVertical: 13, marginTop: 16 },
  doneText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
});
