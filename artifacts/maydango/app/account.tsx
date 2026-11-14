import React, { useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useQueryClient } from '@tanstack/react-query';
import {
  getMemberPrivacyRequestExport,
  getGetMemberPrivacyRequestsQueryKey,
  useCreateMemberPrivacyRequest,
  useGetMemberPrivacyRequests,
} from '@workspace/api-client-react';
import { Text, TextInput, Pressable } from '@/components/Localized';
import { dateTime, errorCopy } from '@/lib/content';
import { useAuth, useClerk, useUser, useSignIn, useSignUp, useSSO } from '@clerk/expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { ScreenShell, ScreenHeader } from '@/components/ScreenShell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { MemberNotice } from '@/components/MemberNotice';
import { translate, type MessageKey } from '@/lib/i18n';

WebBrowser.maybeCompleteAuthSession();
export default function AccountScreen() {
  const c = useColors();
  const app = useApp();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const queryClient = useQueryClient();
  const privacyRequests = useGetMemberPrivacyRequests({ query: { enabled: isSignedIn === true, refetchInterval: 30_000 } });
  const createPrivacyRequest = useCreateMemberPrivacyRequest();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState(false);
  const [reset, setReset] = useState<'none' | 'code' | 'password'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [privacyNotice, setPrivacyNotice] = useState('');
  const [exportingData, setExportingData] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | 'unspecified'>('unspecified');
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); } catch (e: unknown) { setError(errorCopy(e)); }
    finally { setBusy(false); }
  };
  const check = (result: { error?: { message?: string; longMessage?: string } | null }) => {
    if (result.error) throw result.error;
  };
  const finish = async () => {
    const attempt = mode === 'signup' ? signUp : signIn;
    if (attempt.status !== 'complete') throw new Error('Additional verification is required. Check your details or use another sign-in method.');
    check(await attempt.finalize({ navigate: ({ session }) => {
      if (session?.currentTask) { setError('Your account requires an additional verification step.'); return; }
      router.replace('/(tabs)/bookings');
    } }));
  };
  const submit = () => run(async () => {
    if (reset === 'code') {
      check(await signIn.resetPasswordEmailCode.verifyCode({ code })); setReset('password'); setPassword(''); return;
    }
    if (reset === 'password') {
      check(await signIn.resetPasswordEmailCode.submitPassword({ password })); await finish(); return;
    }
    if (verify) {
      check(mode === 'signup' ? await signUp.verifications.verifyEmailCode({ code }) : await signIn.mfa.verifyEmailCode({ code }));
      await finish(); return;
    }
    if (mode === 'signup') {
      check(await signUp.password({ emailAddress: email.trim(), password }));
      check(await signUp.verifications.sendEmailCode()); setVerify(true);
    } else {
      check(await signIn.password({ emailAddress: email.trim(), password }));
      if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
        if (!signIn.supportedSecondFactors.some(f => f.strategy === 'email_code')) throw new Error('This account requires a different verification method. Contact account support.');
        check(await signIn.mfa.sendEmailCode()); setVerify(true);
      } else await finish();
    }
  });
  const button = (title: string, onPress: () => void, id?: string) => <Pressable testID={id} accessibilityRole="button" disabled={busy || app.memberLoading} onPress={onPress} style={[styles.button, { backgroundColor: c.primary, opacity: busy ? .6 : 1 }]}><Text style={{ color: c.primaryForeground, fontWeight: '700' }}>{title}</Text></Pressable>;
  const openPrivacyRequest = privacyRequests.data?.find(request =>
    request.kind === 'account_deletion' &&
    ['open', 'in_progress', 'waiting_member'].includes(request.status)
  );
  const openDataExportRequest = privacyRequests.data?.find(request =>
    request.kind === 'data_export' &&
    ['open', 'in_progress', 'waiting_member'].includes(request.status)
  );
  const privacyStatusKey: Record<string, MessageKey> = {
    open: 'supportStatusOpen',
    in_progress: 'supportStatusInProgress',
    waiting_member: 'supportStatusWaiting',
    resolved: 'supportStatusResolved',
    closed: 'supportStatusClosed',
  };
  const submitPrivacyRequest = async (kind: 'data_export' | 'account_deletion') => {
    setPrivacyNotice('');
    try {
      const request = await createPrivacyRequest.mutateAsync({ data: { kind, language: app.language } });
      await queryClient.invalidateQueries({ queryKey: getGetMemberPrivacyRequestsQueryKey() });
      setPrivacyNotice(translate(app.language, 'privacyRequestSent'));
      router.push({ pathname: '/support/[id]', params: { id: request.id } });
    } catch {
      await queryClient.invalidateQueries({ queryKey: getGetMemberPrivacyRequestsQueryKey() });
      setPrivacyNotice(translate(app.language, 'privacyRequestError'));
    }
  };
  const downloadAccountData = async (requestId: string) => {
    setPrivacyNotice('');
    setExportingData(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in again to download your data.');
      const data = await getMemberPrivacyRequestExport(requestId, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const filename = `maydango-account-data-${new Date().toISOString().slice(0, 10)}.json`;
      const contents = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([contents], { type: 'application/json;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const file = new File(Paths.cache, filename);
        file.create({ overwrite: true });
        try {
          file.write(contents);
          if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
          await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: translate(app.language, 'privacyRequestsTitle') });
        } finally {
          if (file.exists) file.delete();
        }
      }
      setPrivacyNotice(translate(app.language, 'privacyRequestExportReady'));
    } catch {
      setPrivacyNotice(translate(app.language, 'privacyRequestExportError'));
    } finally {
      setExportingData(false);
    }
  };
  return <ScreenShell>
    <ScreenHeader eyebrow="MAYDANGO" title={isSignedIn ? 'Your account' : 'Welcome to MaydanGO'} />
    <KeyboardAwareScrollViewCompat contentContainerStyle={{ padding: 22, paddingBottom: 50, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.replace('/')}><Text style={{ color: c.primary }}>Back to explore</Text></Pressable>
      {isSignedIn ? <>
        <Text raw style={{ color: c.foreground }}>{user?.primaryEmailAddress?.emailAddress}</Text>
        <Text style={{ color: c.foreground, fontWeight: '700' }}>Server-verified memberships</Text>
        {app.memberMemberships.length ? app.memberMemberships.map(m => <Text key={m.scope} style={{ color: c.foreground }}>{m.scope === 'preview' ? 'Sample-only trial' : m.source === 'corporate' ? 'Corporate' : m.source === 'trial' ? 'Trial' : 'Real membership'} · {m.tier} · {m.status.replaceAll('_', ' ')} · ends {dateTime(m.endsAt, app.language, true)}</Text>) : <Text style={{ color: c.mutedForeground }}>No active membership. Local plan selections do not grant access.</Text>}
        <MemberNotice />
        <Pressable testID="link-live" accessibilityRole="button" onPress={() => router.push('/live')} style={[styles.button, { backgroundColor: c.accent }]}><Text style={{ color: c.accentForeground, fontWeight: '700' }}>Real partner availability</Text></Pressable>
        <Pressable testID="link-operations" accessibilityRole="button" onPress={() => router.push('/operations')} style={[styles.button, { backgroundColor: c.secondary }]}><Text style={{ color: c.secondaryForeground, fontWeight: '700' }}>Staff operations</Text></Pressable>
        <Text style={{ color: c.foreground, fontWeight: '700' }}>Eligibility details</Text>
        <Text style={{ color: c.mutedForeground }}>Required only for classes with age or gender requirements. These details stay private to your account.</Text>
        {app.memberProfile ? <Text style={{ color: c.foreground }}>Saved: {app.memberProfile.gender} · {app.memberProfile.birthDate ? dateTime(app.memberProfile.birthDate, app.language, true) : '—'}</Text> : null}
        <TextInput inputDirection="ltr" accessibilityLabel="Date of birth" placeholder="Date of birth: YYYY-MM-DD" placeholderTextColor={c.mutedForeground} value={birthDate} onChangeText={setBirthDate} style={[styles.input, { color: c.foreground, borderColor: c.border }]} />
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {(['female', 'male', 'unspecified'] as const).map(g => <Pressable key={g} onPress={() => setGender(g)} accessibilityRole="radio" accessibilityState={{ checked: gender === g }}><Text style={{ color: c.primary, fontWeight: gender === g ? '800' : '400' }}>{g}</Text></Pressable>)}
        </View>
        {button('Save eligibility details', () => void app.saveProfile(gender, birthDate || app.memberProfile?.birthDate || ''))}
        <View style={[styles.privacyCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ color: c.foreground, fontWeight: '800', fontSize: 18 }}>{translate(app.language, 'privacyRequestsTitle')}</Text>
          <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>{translate(app.language, 'privacyRequestsIntro')}</Text>
          <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>{translate(app.language, 'privacyRequestsNoAutomatic')}</Text>
          <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>{translate(app.language, 'privacyRequestDeleteNotice')}</Text>
          <Pressable
            testID="privacy-request-export"
            accessibilityRole="button"
            disabled={createPrivacyRequest.isPending || privacyRequests.isLoading || !!openDataExportRequest}
            onPress={() => void submitPrivacyRequest('data_export')}
            style={[styles.button, { backgroundColor: c.primary, opacity: createPrivacyRequest.isPending || openDataExportRequest ? .6 : 1 }]}
          >
            <Text style={{ color: c.primaryForeground, fontWeight: '700' }}>
              {translate(app.language, createPrivacyRequest.isPending ? 'privacyRequestExporting' : 'privacyRequestCopyData')}
            </Text>
          </Pressable>
          {openDataExportRequest ? <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/support/[id]', params: { id: openDataExportRequest.id } })}
            style={[styles.button, { backgroundColor: c.secondary }]}
          >
            <Text style={{ color: c.secondaryForeground, fontWeight: '700' }}>
              {translate(app.language, 'privacyRequestExportActive')} · {translate(app.language, privacyStatusKey[openDataExportRequest.status] ?? 'supportStatusOpen')}
            </Text>
          </Pressable> : null}
          {openPrivacyRequest ? <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/support/[id]', params: { id: openPrivacyRequest.id } })}
            style={[styles.button, { backgroundColor: c.secondary }]}
          >
            <Text style={{ color: c.secondaryForeground, fontWeight: '700' }}>
              {translate(app.language, 'privacyRequestActive')} · {translate(app.language, privacyStatusKey[openPrivacyRequest.status] ?? 'supportStatusOpen')}
            </Text>
          </Pressable> : <>
            <Pressable
              testID="privacy-request-delete"
              accessibilityRole="button"
              disabled={createPrivacyRequest.isPending || privacyRequests.isLoading}
              onPress={() => void submitPrivacyRequest('account_deletion')}
              style={[styles.button, { backgroundColor: c.secondary, opacity: createPrivacyRequest.isPending ? .6 : 1 }]}
            >
              <Text style={{ color: c.secondaryForeground, fontWeight: '700' }}>{translate(app.language, 'privacyRequestDeleteAccount')}</Text>
            </Pressable>
          </>}
          <Text style={{ color: c.foreground, fontWeight: '700', marginTop: 4 }}>{translate(app.language, 'privacyRequestHistory')}</Text>
          {privacyRequests.isError ? <Text accessibilityRole="alert" style={{ color: c.destructive }}>{translate(app.language, 'privacyRequestLoadError')}</Text>
            : privacyRequests.data?.length ? privacyRequests.data.map(request => (
              <View key={request.id} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/support/[id]', params: { id: request.id } })}
                >
                  <Text style={{ color: c.primary, fontWeight: '700' }}>{request.subject}</Text>
                  <Text style={{ color: c.mutedForeground }}>{translate(app.language, privacyStatusKey[request.status] ?? 'supportStatusOpen')} · {dateTime(request.createdAt, app.language, true)}</Text>
                </Pressable>
                {request.kind === 'data_export' && request.exportAvailableUntil
                  && new Date(String(request.exportAvailableUntil)).getTime() > Date.now() ? (
                  <Pressable
                    testID={`privacy-download-data-${request.id}`}
                    accessibilityRole="button"
                    disabled={exportingData}
                    onPress={() => void downloadAccountData(request.id)}
                    style={[styles.button, { backgroundColor: c.primary, opacity: exportingData ? .6 : 1, marginTop: 8 }]}
                  >
                    <Text style={{ color: c.primaryForeground, fontWeight: '700' }}>
                      {translate(app.language, 'privacyRequestDownloadCopy')} · {translate(app.language, 'privacyRequestAvailableUntil')} {dateTime(String(request.exportAvailableUntil), app.language, true)}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )) : <Text style={{ color: c.mutedForeground }}>{translate(app.language, 'privacyRequestNoHistory')}</Text>}
          {privacyNotice ? <Text accessibilityRole="alert" style={{ color: c.primary }}>{privacyNotice}</Text> : null}
        </View>
        {!app.memberMemberships.some(m => m.scope === 'preview') ? <>
          <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>Enable an 8-reservation, 30-day sample trial to try account syncing. These are not real partner bookings. This creates a new sample membership only; it does not import old reservations or charge you.</Text>
          {button('I understand — enable sample trial', () => void app.enablePreview(), 'enable-preview')}
        </> : null}
        {button('Sign out', () => void run(async () => { await signOut(); router.replace('/'); }), 'sign-out')}
      </> : <>
        <Text style={{ color: c.mutedForeground }}>Sign in to keep reservations securely on your account across devices.</Text>
        {!verify && reset !== 'code' ? <>
          <TextInput inputDirection="ltr" testID="auth-email" accessibilityLabel="Email address" placeholder="Email address" placeholderTextColor={c.mutedForeground} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={[styles.input, { color: c.foreground, borderColor: c.border }]} />
          <TextInput testID="auth-password" accessibilityLabel="Password" placeholder="Password" placeholderTextColor={c.mutedForeground} secureTextEntry value={password} onChangeText={setPassword} style={[styles.input, { color: c.foreground, borderColor: c.border }]} />
        </> : <TextInput testID="auth-code" accessibilityLabel="Email verification code" placeholder="Email verification code" placeholderTextColor={c.mutedForeground} value={code} onChangeText={setCode} keyboardType="number-pad" style={[styles.input, { color: c.foreground, borderColor: c.border }]} />}
        <View nativeID="clerk-captcha" />
        {button(reset === 'password' ? 'Set new password' : reset === 'code' || verify ? 'Verify email' : mode === 'signin' ? 'Sign in' : 'Create account', submit, 'auth-submit')}
        {mode === 'signin' && reset === 'none' && !verify ? <Pressable onPress={() => void run(async () => {
          check(await signIn.create({ identifier: email.trim() }));
          check(await signIn.resetPasswordEmailCode.sendCode());
          setReset('code');
        })}><Text style={{ color: c.primary }}>Forgot password? Send reset code</Text></Pressable> : null}
        {verify ? button('Send a new code', () => void run(async () => { check(mode === 'signup' ? await signUp.verifications.sendEmailCode() : await signIn.mfa.sendEmailCode()); })) : button('Continue with Google', () => void run(async () => {
          const result = await startSSOFlow({ strategy: 'oauth_google', redirectUrl: AuthSession.makeRedirectUri() });
          if (!result.createdSessionId || !result.setActive) throw new Error('Sign-in was not completed. Try email and password.');
          await result.setActive({ session: result.createdSessionId });
          router.replace('/(tabs)/bookings');
        }))}
        <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setVerify(false); setReset('none'); setError(''); signIn.reset(); signUp.reset(); }}>
          <Text style={{ color: c.primary }}>{mode === 'signin' ? 'New here? Create account' : 'Already registered? Sign in'}</Text>
        </Pressable>
      </>}
      {error ? <Text accessibilityRole="alert" style={{ color: c.destructive }}>{error}</Text> : null}
    </KeyboardAwareScrollViewCompat>
  </ScreenShell>;
}
const styles = StyleSheet.create({
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, padding: 14 },
  button: { minHeight: 48, padding: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  privacyCard: { gap: 12, borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 6 },
});
