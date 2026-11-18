import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from '@expo-google-fonts/dm-sans';
import { router, Stack, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { AppProvider, useApp } from '@/contexts/AppContext';
import { translate } from '@/lib/i18n';
import { ClerkProvider, ClerkLoaded, useAuth, useUser } from '@clerk/expo';
import { setBaseUrl, setAuthTokenGetter, setDeviceTokenGetter } from '@workspace/api-client-react';
import { tokenCache } from '@clerk/expo/token-cache';
import { getDeviceInstallationToken } from '@/lib/device-identity';
import { DeviceSecurityProvider, useDeviceSecurity } from '@/contexts/DeviceSecurityContext';
import { DeviceSecurityGate } from '@/components/DeviceSecurityGate';
import { cities } from '@/data/demo';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);
setDeviceTokenGetter(getDeviceInstallationToken);
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

function RootLayoutNav() {
  const { getToken, userId, isSignedIn } = useAuth();
  const { user } = useUser();
  const device = useDeviceSecurity();
  const segments = useSegments();
  const app = useApp();
  const restoredCityForUser = useRef<string | null>(null);
  const isSupportRoute = segments[0] === 'support';
  useEffect(() => {
    if (isSignedIn !== true || !user?.id) {
      restoredCityForUser.current = null;
      return;
    }
    if (!app.hydrated || restoredCityForUser.current === user.id) return;
    restoredCityForUser.current = user.id;
    const savedCityId = user.unsafeMetadata.maydangoCityId;
    if (typeof savedCityId === 'string' && cities.some(city => city.id === savedCityId)) {
      app.setSelectedCityId(savedCityId);
    }
  }, [isSignedIn, user?.id, app.hydrated]);
  useEffect(() => { queryClient.clear(); }, [userId]);
  useEffect(() => { setAuthTokenGetter(() => getToken()); }, [getToken]);
  const { language } = app;
  if (Platform.OS !== 'web' && isSignedIn && !isSupportRoute && (
    !device.status || device.loading || device.status.status === 'pending'
  )) {
    return <DeviceSecurityGate />;
  }
  return (
    <>
      {Platform.OS !== 'web' ? <NativeNotificationResponseHandler /> : null}
      <Stack screenOptions={{ headerBackTitle: translate(language, 'back') }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="live" options={{ headerShown: false }} />
        <Stack.Screen name="operations" options={{ headerShown: false }} />
        <Stack.Screen name="facility/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="session/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="course/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="cities" options={{ headerShown: false }} />
        <Stack.Screen name="checkin" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="membership" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ headerShown: false }} />
        <Stack.Screen name="reviews" options={{ headerShown: false }} />
        <Stack.Screen name="device-security" options={{ headerShown: false }} />
        <Stack.Screen name="support/index" options={{ headerShown: false }} />
        <Stack.Screen name="support/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="support/staff" options={{ headerShown: false }} />
        <Stack.Screen name="support/quality-document" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

function NativeNotificationResponseHandler() {
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!lastNotificationResponse) return;
    const { actionIdentifier, notification } = lastNotificationResponse;
    const data = notification.request.content.data as {
      kind?: unknown;
      ticketId?: unknown;
      facilityId?: unknown;
      documentType?: unknown;
      expiresOn?: unknown;
    };
    const supportAlert = data.kind === 'support_urgent' || data.kind === 'support_urgent_escalation';
    const partnerExpiryAlert = data.kind === 'partner_document_expiry_upcoming'
      || data.kind === 'partner_document_expiry_overdue';
    if (!supportAlert && !partnerExpiryAlert) return;
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    if (actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    if (supportAlert) {
      if (
        typeof data.ticketId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(data.ticketId)
      ) return;
      router.push({ pathname: '/support/staff', params: { ticketId: data.ticketId } });
      return;
    }
    if (
      typeof data.facilityId !== 'string'
      || !/^[A-Za-z0-9_-]{1,180}$/.test(data.facilityId)
      || (data.documentType !== 'licence' && data.documentType !== 'insurance')
      || typeof data.expiresOn !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(data.expiresOn)
    ) return;
    router.push({
      pathname: '/support/quality-document',
      params: {
        facilityId: data.facilityId,
        documentType: data.documentType,
        expiresOn: data.expiresOn,
        phase: data.kind === 'partner_document_expiry_overdue' ? 'overdue' : 'upcoming',
      },
    });
  }, [lastNotificationResponse]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (Platform.OS === 'web' || fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Native keeps the splash screen up while local font assets load. On web,
  // render immediately with system-font fallback instead of a blank preview.
  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;

  const appTree = (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <DeviceSecurityProvider>
                <AppProvider>
                  <RootLayoutNav />
                </AppProvider>
              </DeviceSecurityProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      tokenCache={tokenCache}
      proxyUrl={proxyUrl}
    >
      {Platform.OS === 'web'
        // The browser can render public routes while Clerk restores its session.
        // The Clerk provider and server-side auth checks remain in place.
        ? appTree
        : <ClerkLoaded>{appTree}</ClerkLoaded>}
    </ClerkProvider>
  );
}
