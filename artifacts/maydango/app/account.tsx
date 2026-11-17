import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, Share, View, StyleSheet } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMemberConsentsQueryKey,
  getGetMemberProfilePhotoQueryKey,
  getGetMemberReferralsQueryKey,
  getMemberPrivacyRequestExport,
  getGetMemberPrivacyRequestsQueryKey,
  useAttributeMemberReferral,
  useAcceptCorporateInvitation,
  useCreateMemberPrivacyRequest,
  useGetMemberConsents,
  useGetMemberProfilePhoto,
  useGetMemberPrivacyRequests,
  useGetMemberReferrals,
  useCompleteMemberProfilePhotoUpload,
  useDeleteMemberProfilePhoto,
  useRequestMemberProfilePhotoUploadUrl,
  useSaveMemberConsents,
} from '@workspace/api-client-react';
import { Text, TextInput, Pressable } from '@/components/Localized';
import { dateTime, errorCopy } from '@/lib/content';
import { useAuth, useClerk, useUser, useSignIn, useSignUp, useSSO } from '@clerk/expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
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
  const params = useLocalSearchParams<{ ref?: string | string[]; corp?: string | string[] }>();
  const incomingReferralCode = Array.isArray(params.ref) ? params.ref[0] : params.ref;
  const incomingCorporateCode = Array.isArray(params.corp) ? params.corp[0] : params.corp;
  const queryClient = useQueryClient();
  const profilePhotoQueryKey = [...getGetMemberProfilePhotoQueryKey(), user?.id ?? 'signed-out'];
  const profilePhoto = useGetMemberProfilePhoto({
    query: { enabled: isSignedIn === true, queryKey: profilePhotoQueryKey, retry: false },
  });
  const consents = useGetMemberConsents({ query: { enabled: isSignedIn === true, refetchInterval: 30_000 } });
  const hasCurrentRequiredConsent = consents.data?.currentChoices.termsOfUse === 'accepted'
    && consents.data.currentChoices.privacyPolicy === 'accepted';
  const referrals = useGetMemberReferrals({
    query: { enabled: isSignedIn === true && hasCurrentRequiredConsent, retry: false },
  });
  const privacyRequests = useGetMemberPrivacyRequests({ query: { enabled: isSignedIn === true, refetchInterval: 30_000 } });
  const createPrivacyRequest = useCreateMemberPrivacyRequest();
  const saveConsents = useSaveMemberConsents();
  const attributeReferral = useAttributeMemberReferral();
  const acceptCorporateInvitation = useAcceptCorporateInvitation();
  const requestProfilePhotoUpload = useRequestMemberProfilePhotoUploadUrl();
  const completeProfilePhotoUpload = useCompleteMemberProfilePhotoUpload();
  const deleteProfilePhoto = useDeleteMemberProfilePhoto();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [referralCode, setReferralCode] = useState(incomingReferralCode?.toUpperCase() ?? '');
  const [referralNotice, setReferralNotice] = useState('');
  const [corporateCode, setCorporateCode] = useState(incomingCorporateCode ?? '');
  const [corporateCodeNotice, setCorporateCodeNotice] = useState('');
  const corporateInvitationAttempt = useRef<string | null>(null);
  const [verify, setVerify] = useState(false);
  const [reset, setReset] = useState<'none' | 'code' | 'password'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [privacyNotice, setPrivacyNotice] = useState('');
  const [exportingData, setExportingData] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [profilePhotoConsent, setProfilePhotoConsent] = useState(false);
  const [profilePhotoNotice, setProfilePhotoNotice] = useState('');
  const [selectedProfilePhoto, setSelectedProfilePhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [profilePhotoToken, setProfilePhotoToken] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | 'unspecified'>('unspecified');
  useEffect(() => {
    if (incomingReferralCode) setReferralCode(incomingReferralCode.toUpperCase());
  }, [incomingReferralCode]);
  useEffect(() => {
    if (incomingCorporateCode) setCorporateCode(incomingCorporateCode);
  }, [incomingCorporateCode]);
  useEffect(() => {
    let active = true;
    if (isSignedIn !== true) {
      setProfilePhotoToken(null);
      return () => { active = false; };
    }
    void getToken().then(token => {
      if (active) setProfilePhotoToken(token);
    }).catch(() => {
      if (active) setProfilePhotoToken(null);
    });
    return () => { active = false; };
  }, [getToken, isSignedIn]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); } catch (e: unknown) { setError(errorCopy(e)); }
    finally { setBusy(false); }
  };
  const check = (result: { error?: { message?: string; longMessage?: string } | null }) => {
    if (result.error) throw result.error;
  };
  const routeAfterAuthentication = () => {
    if (mode !== 'signup') {
      router.replace('/(tabs)/bookings');
      return;
    }
    const signupParams: { ref?: string; corp?: string } = {};
    if (referralCode.trim()) signupParams.ref = referralCode.trim().toUpperCase();
    if (corporateCode.trim()) signupParams.corp = corporateCode.trim();
    router.replace(Object.keys(signupParams).length
      ? { pathname: '/account', params: signupParams }
      : '/account');
  };
  const clearCorporateCodeFromRoute = () => {
    router.replace(incomingReferralCode
      ? { pathname: '/account', params: { ref: incomingReferralCode } }
      : '/account');
  };
  const applyCorporateCode = (token = corporateCode.trim()) => {
    setCorporateCodeNotice('');
    if (token.length < 32) {
      setCorporateCodeNotice(translate(app.language, 'memberCorporateCodeError'));
      clearCorporateCodeFromRoute();
      return;
    }
    acceptCorporateInvitation.mutate({ data: { token, expectedRole: 'employee' } }, {
      onSuccess: response => {
        setCorporateCode('');
        setCorporateCodeNotice(`${translate(app.language, 'memberCorporateCodeSuccess')} ${response.organizationName}`);
        clearCorporateCodeFromRoute();
      },
      onError: () => {
        setCorporateCodeNotice(translate(app.language, 'memberCorporateCodeError'));
        clearCorporateCodeFromRoute();
      },
    });
  };
  useEffect(() => {
    const token = incomingCorporateCode?.trim();
    if (isSignedIn !== true || !token || corporateInvitationAttempt.current === token) return;
    corporateInvitationAttempt.current = token;
    applyCorporateCode(token);
  }, [isSignedIn, incomingCorporateCode]);
  const finish = async () => {
    const attempt = mode === 'signup' ? signUp : signIn;
    if (attempt.status !== 'complete') throw new Error('Additional verification is required. Check your details or use another sign-in method.');
    check(await attempt.finalize({ navigate: ({ session }) => {
      if (session?.currentTask) { setError('Your account requires an additional verification step.'); return; }
      routeAfterAuthentication();
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
      const normalizedFirstName = firstName.trim();
      const normalizedLastName = lastName.trim();
      if (!normalizedFirstName || !normalizedLastName) {
        throw new Error(translate(app.language, 'memberNameRequired'));
      }
      check(await signUp.password({
        emailAddress: email.trim(),
        password,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
      }));
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
  const chooseProfilePhoto = async () => {
    setProfilePhotoNotice('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const contentType = asset.mimeType ?? asset.file?.type ?? '';
      const sizeBytes = asset.fileSize ?? asset.file?.size ?? new File(asset.uri).size;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || sizeBytes < 1 || sizeBytes > 5_000_000) {
        setProfilePhotoNotice(translate(app.language, 'memberPhotoTypeError'));
        return;
      }
      setSelectedProfilePhoto(asset);
    } catch {
      setProfilePhotoNotice(translate(app.language, 'memberPhotoError'));
    }
  };
  const saveProfilePhoto = async () => {
    if (!selectedProfilePhoto) return;
    if (!hasCurrentRequiredConsent) {
      setProfilePhotoNotice(translate(app.language, 'memberConsentsRequiredHint'));
      return;
    }
    if (!profilePhotoConsent) {
      setProfilePhotoNotice(translate(app.language, 'memberPhotoConsentRequired'));
      return;
    }
    const asset = selectedProfilePhoto;
    const contentType = asset.mimeType ?? asset.file?.type ?? '';
    const sizeBytes = asset.fileSize ?? asset.file?.size ?? new File(asset.uri).size;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || sizeBytes < 1 || sizeBytes > 5_000_000) {
      setProfilePhotoNotice(translate(app.language, 'memberPhotoTypeError'));
      return;
    }
    setProfilePhotoNotice('');
    try {
      const upload = await requestProfilePhotoUpload.mutateAsync({
        data: {
          contentType: contentType as 'image/jpeg' | 'image/png' | 'image/webp',
          sizeBytes,
          consentConfirmed: true,
        },
      });
      let uploadResponse: Response;
      if (Platform.OS === 'web' && asset.file) {
        uploadResponse = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: asset.file,
        });
      } else {
        uploadResponse = await expoFetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: new File(asset.uri),
        });
      }
      if (!uploadResponse.ok) throw new Error('The image upload did not complete.');
      await completeProfilePhotoUpload.mutateAsync({
        data: {
          uploadId: upload.uploadId,
          contentType: upload.contentType,
          sizeBytes,
          consentConfirmed: true,
        },
      });
      setSelectedProfilePhoto(null);
      setProfilePhotoConsent(false);
      await queryClient.invalidateQueries({ queryKey: profilePhotoQueryKey });
      setProfilePhotoNotice(translate(app.language, 'memberPhotoSaved'));
    } catch {
      setProfilePhotoNotice(translate(app.language, 'memberPhotoError'));
    }
  };
  const removeProfilePhoto = async () => {
    setProfilePhotoNotice('');
    try {
      await deleteProfilePhoto.mutateAsync();
      setProfilePhotoConsent(false);
      setSelectedProfilePhoto(null);
      await queryClient.invalidateQueries({ queryKey: profilePhotoQueryKey });
      setProfilePhotoNotice(translate(app.language, 'memberPhotoRemoved'));
    } catch {
      setProfilePhotoNotice(translate(app.language, 'memberPhotoError'));
    }
  };
  const privacyStatusKey: Record<string, MessageKey> = {
    open: 'supportStatusOpen',
    in_progress: 'supportStatusInProgress',
    waiting_member: 'supportStatusWaiting',
    resolved: 'supportStatusResolved',
    closed: 'supportStatusClosed',
  };
  const profilePhotoUrl = profilePhoto.data?.photoPath && process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}${profilePhoto.data.photoPath}`
    : null;
  const profilePhotoBusy = requestProfilePhotoUpload.isPending
    || completeProfilePhotoUpload.isPending
    || deleteProfilePhoto.isPending;
  const consentPurposeKey: Record<'terms_of_use' | 'privacy_policy' | 'marketing', MessageKey> = {
    terms_of_use: 'memberConsentsTermsName',
    privacy_policy: 'memberConsentsPrivacyName',
    marketing: 'memberConsentsMarketingName',
  };
  useEffect(() => {
    setTermsAccepted(consents.data?.currentChoices.termsOfUse === 'accepted');
    setPrivacyAccepted(consents.data?.currentChoices.privacyPolicy === 'accepted');
    setMarketingConsent(consents.data?.currentChoices.marketing === 'accepted');
  }, [
    consents.data?.currentChoices.termsOfUse,
    consents.data?.currentChoices.privacyPolicy,
    consents.data?.currentChoices.marketing,
  ]);
  const submitConsentChoices = async () => {
    setPrivacyNotice('');
    if (!termsAccepted || !privacyAccepted) {
      setPrivacyNotice(translate(app.language, 'memberConsentsRequiredHint'));
      return;
    }
    const termsVersion = consents.data?.policies.find(policy => policy.purpose === 'terms_of_use')?.version;
    const privacyVersion = consents.data?.policies.find(policy => policy.purpose === 'privacy_policy')?.version;
    if (!termsVersion || !privacyVersion) {
      setPrivacyNotice(translate(app.language, 'memberConsentsError'));
      return;
    }
    try {
      await saveConsents.mutateAsync({ data: {
        termsOfUseAccepted: termsAccepted,
        privacyPolicyAccepted: privacyAccepted,
        marketingConsent,
        termsVersion,
        privacyVersion,
      } });
      await queryClient.invalidateQueries({ queryKey: getGetMemberConsentsQueryKey() });
      await app.refreshMember();
      setPrivacyNotice(translate(app.language, 'memberConsentsSaved'));
    } catch {
      setPrivacyNotice(translate(app.language, 'memberConsentsError'));
    }
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
  const submitReferralCode = async () => {
    setReferralNotice('');
    try {
      await attributeReferral.mutateAsync({ data: { code: referralCode.trim().toUpperCase() } });
      await queryClient.invalidateQueries({ queryKey: getGetMemberReferralsQueryKey() });
      setReferralCode('');
      setReferralNotice(translate(app.language, 'memberReferralsApplied'));
    } catch (e: unknown) {
      const status = typeof e === 'object' && e !== null && 'status' in e ? (e as { status?: unknown }).status : undefined;
      setReferralNotice(translate(app.language, status === 409 ? 'memberReferralsAlreadyApplied' : 'memberReferralsError'));
    }
  };
  const shareReferralCode = async () => {
    const ownCode = referrals.data?.code;
    if (!ownCode) return;
    const link = `maydango://account?ref=${encodeURIComponent(ownCode)}`;
    try {
      await Share.share({
        message: `${translate(app.language, 'memberReferralsShareMessage')} ${ownCode}\n${link}`,
      });
    } catch {
      setReferralNotice(translate(app.language, 'memberReferralsShareError'));
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
        <View style={[styles.privacyCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ color: c.foreground, fontWeight: '800', fontSize: 18 }}>{translate(app.language, 'memberConsentsTitle')}</Text>
          <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>{translate(app.language, 'memberConsentsIntro')}</Text>
          {consents.isLoading ? <Text style={{ color: c.mutedForeground }}>{translate(app.language, 'memberConsentsLoading')}</Text>
            : consents.isError ? <Text accessibilityRole="alert" style={{ color: c.destructive }}>{translate(app.language, 'memberConsentsLoadError')}</Text>
              : <>
                <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>{translate(app.language, 'memberConsentsRequiredHint')}</Text>
                {consents.data?.policies.map(policy => (
                  <View key={policy.purpose} style={{ gap: 4 }}>
                    <Text style={{ color: c.mutedForeground }}>
                      {translate(app.language, consentPurposeKey[policy.purpose])} · {translate(app.language, 'memberConsentsVersion')}: {policy.version}
                    </Text>
                    {policy.policyKey && policy.translations && (
                      <Pressable
                        accessibilityRole="link"
                        onPress={() => router.push({ pathname: '/policies/[policyKey]', params: { policyKey: policy.policyKey!, version: policy.version } })}
                      >
                        <Text style={{ color: c.primary, textDecorationLine: 'underline' }}>{translate(app.language, 'memberConsentsReadPolicy')}</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/membership-terms-draft', params: { version: 'draft-0.1' } })}
                >
                  <Text style={{ color: c.primary, textDecorationLine: 'underline' }}>
                    Membership terms draft · draft-0.1 (English; not active)
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: termsAccepted, disabled: consents.data?.currentChoices.termsOfUse === 'accepted' }} onPress={() => {
                  if (consents.data?.currentChoices.termsOfUse !== 'accepted') setTermsAccepted(value => !value);
                }}>
                  <Text style={{ color: c.foreground }}>{termsAccepted ? '☑ ' : '☐ '}{translate(app.language, 'memberConsentsTerms')}</Text>
                </Pressable>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: privacyAccepted, disabled: consents.data?.currentChoices.privacyPolicy === 'accepted' }} onPress={() => {
                  if (consents.data?.currentChoices.privacyPolicy !== 'accepted') setPrivacyAccepted(value => !value);
                }}>
                  <Text style={{ color: c.foreground }}>{privacyAccepted ? '☑ ' : '☐ '}{translate(app.language, 'memberConsentsPrivacy')}</Text>
                </Pressable>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: marketingConsent }} onPress={() => setMarketingConsent(value => !value)}>
                  <Text style={{ color: c.foreground }}>{marketingConsent ? '☑ ' : '☐ '}{translate(app.language, 'memberConsentsMarketing')}</Text>
                </Pressable>
                {button(
                  translate(app.language, saveConsents.isPending ? 'memberConsentsSaving' : 'memberConsentsSave'),
                  () => void submitConsentChoices(),
                  'save-member-consents',
                )}
                {consents.data?.history.length ? <>
                  <Text style={{ color: c.foreground, fontWeight: '700', marginTop: 4 }}>{translate(app.language, 'memberConsentsHistory')}</Text>
                  {consents.data.history.map(record => (
                    <View key={record.id} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 8 }}>
                      <Text style={{ color: c.foreground }}>{translate(app.language, consentPurposeKey[record.purpose])} · {record.policyVersion} · {translate(app.language, record.choice === 'accepted' ? 'memberConsentsAccepted' : 'memberConsentsDeclined')}</Text>
                      <Text style={{ color: c.mutedForeground }}>{dateTime(String(record.recordedAt), app.language, true)}</Text>
                      {record.policyVersion !== 'v1-draft' && record.documentPath && (record.purpose === 'terms_of_use' || record.purpose === 'privacy_policy') ? (
                        <Pressable
                          accessibilityRole="link"
                          onPress={() => router.push({
                            pathname: '/policies/[policyKey]',
                            params: { policyKey: record.purpose, version: record.policyVersion },
                          })}
                        >
                          <Text style={{ color: c.primary, textDecorationLine: 'underline' }}>{translate(app.language, 'memberConsentsReadPolicy')}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </> : <Text style={{ color: c.mutedForeground }}>{translate(app.language, 'memberConsentsNoHistory')}</Text>}
              </>}
          {privacyNotice ? <Text accessibilityRole="alert" style={{ color: c.primary }}>{privacyNotice}</Text> : null}
        </View>
        <View style={[styles.privacyCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ color: c.foreground, fontWeight: '800', fontSize: 18 }}>{translate(app.language, 'memberReferralsTitle')}</Text>
          <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>{translate(app.language, 'memberReferralsIntro')}</Text>
          {!hasCurrentRequiredConsent ? <Text style={{ color: c.mutedForeground }}>{translate(app.language, 'memberConsentsRequiredHint')}</Text>
            : referrals.isLoading ? <Text style={{ color: c.mutedForeground }}>{translate(app.language, 'memberConsentsLoading')}</Text>
              : referrals.isError ? <Text accessibilityRole="alert" style={{ color: c.destructive }}>{translate(app.language, 'memberReferralsError')}</Text>
                : referrals.data ? <>
                  <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, borderRadius: 12, padding: 12 }}>
                    <Text style={{ color: c.mutedForeground }}>{translate(app.language, 'memberReferralsCode')}</Text>
                    <Text selectable style={{ color: c.foreground, fontSize: 20, fontWeight: '800', letterSpacing: 2 }}>{referrals.data.code}</Text>
                    <Text style={{ color: c.foreground, marginTop: 8 }}>{translate(app.language, 'memberReferralsSignups')}: {referrals.data.signups}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => void shareReferralCode()} style={[styles.button, { backgroundColor: c.primary }]}>
                    <Text style={{ color: c.primaryForeground, fontWeight: '700' }}>{translate(app.language, 'memberReferralsShare')}</Text>
                  </Pressable>
                  {referrals.data.hasAppliedCode ? <Text style={{ color: c.mutedForeground }}>{translate(app.language, 'memberReferralsAlreadyApplied')}</Text>
                    : <>
                      <TextInput inputDirection="ltr" accessibilityLabel={translate(app.language, 'memberReferralsInput')} placeholder={translate(app.language, 'memberReferralsInput')} placeholderTextColor={c.mutedForeground} value={referralCode} onChangeText={value => setReferralCode(value.toUpperCase())} autoCapitalize="characters" maxLength={10} style={[styles.input, { color: c.foreground, borderColor: c.border }]} />
                      <Pressable accessibilityRole="button" disabled={attributeReferral.isPending || referralCode.trim().length !== 10} onPress={() => void submitReferralCode()} style={[styles.button, { backgroundColor: c.secondary, opacity: attributeReferral.isPending || referralCode.trim().length !== 10 ? .6 : 1 }]}>
                        <Text style={{ color: c.secondaryForeground, fontWeight: '700' }}>{translate(app.language, 'memberReferralsApply')}</Text>
                      </Pressable>
                    </>}
                </> : null}
          {referralNotice ? <Text accessibilityRole="alert" style={{ color: c.primary }}>{referralNotice}</Text> : null}
        </View>
        <View style={[styles.privacyCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ color: c.foreground, fontWeight: '800', fontSize: 18 }}>{translate(app.language, 'memberCorporateCodeTitle')}</Text>
          <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>{translate(app.language, 'memberCorporateCodeIntro')}</Text>
          <TextInput
            inputDirection="ltr"
            testID="member-corporate-code"
            accessibilityLabel={translate(app.language, 'memberCorporateCodeInput')}
            placeholder={translate(app.language, 'memberCorporateCodeInput')}
            placeholderTextColor={c.mutedForeground}
            value={corporateCode}
            onChangeText={value => { setCorporateCode(value); setCorporateCodeNotice(''); }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
            style={[styles.input, { color: c.foreground, borderColor: c.border }]}
          />
          <Pressable
            accessibilityRole="button"
            testID="member-corporate-code-apply"
            disabled={acceptCorporateInvitation.isPending || corporateCode.trim().length < 32}
            onPress={() => applyCorporateCode()}
            style={[styles.button, { backgroundColor: c.secondary, opacity: acceptCorporateInvitation.isPending || corporateCode.trim().length < 32 ? .6 : 1 }]}
          >
            <Text style={{ color: c.secondaryForeground, fontWeight: '700' }}>
              {translate(app.language, acceptCorporateInvitation.isPending ? 'memberCorporateCodeApplying' : 'memberCorporateCodeApply')}
            </Text>
          </Pressable>
          {corporateCodeNotice ? <Text accessibilityRole="alert" style={{ color: corporateCodeNotice.startsWith(translate(app.language, 'memberCorporateCodeSuccess')) ? c.primary : c.destructive }}>{corporateCodeNotice}</Text> : null}
        </View>
        <View style={[styles.privacyCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ color: c.foreground, fontWeight: '800', fontSize: 18 }}>{translate(app.language, 'memberPhotoTitle')}</Text>
          <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>{translate(app.language, 'memberPhotoIntro')}</Text>
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 6 }}>
            {profilePhotoUrl && profilePhotoToken ? (
              <Image
                accessibilityLabel={translate(app.language, 'memberPhotoTitle')}
                source={{ uri: profilePhotoUrl, headers: { Authorization: `Bearer ${profilePhotoToken}` } }}
                style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: c.border }}
              />
            ) : (
              <View accessibilityElementsHidden style={{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: c.muted }}>
                <Text style={{ color: c.mutedForeground, fontSize: 30 }}>◎</Text>
              </View>
            )}
          </View>
          {!profilePhoto.data?.photoPath ? <Text style={{ color: c.mutedForeground }}>{translate(app.language, 'memberPhotoNoPhoto')}</Text> : null}
          {profilePhoto.isLoading ? <Text style={{ color: c.mutedForeground }}>{translate(app.language, 'memberPhotoLoading')}</Text> : null}
          {profilePhoto.isError ? <Text accessibilityRole="alert" style={{ color: c.destructive }}>{translate(app.language, 'memberPhotoError')}</Text> : null}
          <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>{translate(app.language, 'memberPhotoPrivacy')}</Text>
          {!hasCurrentRequiredConsent ? <Text style={{ color: c.mutedForeground }}>{translate(app.language, 'memberConsentsRequiredHint')}</Text> : <>
            <Pressable
              testID="member-profile-photo-consent"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: profilePhotoConsent, disabled: profilePhotoBusy }}
              disabled={profilePhotoBusy}
              onPress={() => {
                setProfilePhotoConsent(value => !value);
                setProfilePhotoNotice('');
              }}
            >
              <Text style={{ color: c.foreground }}>{profilePhotoConsent ? '☑ ' : '☐ '}{translate(app.language, 'memberPhotoConsent')}</Text>
            </Pressable>
            <Pressable
              testID="choose-member-profile-photo"
              accessibilityRole="button"
              disabled={profilePhotoBusy || profilePhoto.isLoading}
              onPress={() => void chooseProfilePhoto()}
              style={[styles.button, { backgroundColor: c.secondary, opacity: profilePhotoBusy ? .6 : 1 }]}
            >
              <Text style={{ color: c.secondaryForeground, fontWeight: '700' }}>{translate(app.language, 'memberPhotoChoose')}</Text>
            </Pressable>
            {selectedProfilePhoto ? (
              <Text style={{ color: c.mutedForeground }} numberOfLines={1}>
                {selectedProfilePhoto.fileName || translate(app.language, 'memberPhotoTitle')}
              </Text>
            ) : null}
            <Pressable
              testID="save-member-profile-photo"
              accessibilityRole="button"
              disabled={profilePhotoBusy || !selectedProfilePhoto || !profilePhotoConsent}
              onPress={() => void saveProfilePhoto()}
              style={[styles.button, { backgroundColor: c.primary, opacity: profilePhotoBusy || !selectedProfilePhoto || !profilePhotoConsent ? .55 : 1 }]}
            >
              <Text style={{ color: c.primaryForeground, fontWeight: '700' }}>
                {profilePhotoBusy ? translate(app.language, 'memberPhotoUploading') : translate(app.language, 'memberPhotoUpload')}
              </Text>
            </Pressable>
          </>}
          {profilePhoto.data?.photoPath ? (
            <Pressable
              testID="remove-member-profile-photo"
              accessibilityRole="button"
              disabled={profilePhotoBusy}
              onPress={() => void removeProfilePhoto()}
              style={[styles.button, { backgroundColor: c.secondary, opacity: profilePhotoBusy ? .6 : 1 }]}
            >
              <Text style={{ color: c.secondaryForeground, fontWeight: '700' }}>
                {deleteProfilePhoto.isPending ? translate(app.language, 'memberPhotoRemoving') : translate(app.language, 'memberPhotoRemove')}
              </Text>
            </Pressable>
          ) : null}
          {profilePhotoNotice ? <Text accessibilityRole="alert" style={{ color: c.primary }}>{profilePhotoNotice}</Text> : null}
        </View>
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
           {mode === 'signup' ? <>
              <TextInput
                testID="auth-first-name"
                accessibilityLabel={translate(app.language, 'memberFirstName')}
                placeholder={translate(app.language, 'memberFirstName')}
                placeholderTextColor={c.mutedForeground}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                maxLength={100}
                style={[styles.input, { color: c.foreground, borderColor: c.border }]}
              />
              <TextInput
                testID="auth-last-name"
                accessibilityLabel={translate(app.language, 'memberLastName')}
                placeholder={translate(app.language, 'memberLastName')}
                placeholderTextColor={c.mutedForeground}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                maxLength={100}
                style={[styles.input, { color: c.foreground, borderColor: c.border }]}
              />
             <TextInput inputDirection="ltr" testID="auth-referral-code" accessibilityLabel={translate(app.language, 'memberReferralsInput')} placeholder={translate(app.language, 'memberReferralsInput')} placeholderTextColor={c.mutedForeground} value={referralCode} onChangeText={value => setReferralCode(value.toUpperCase())} autoCapitalize="characters" maxLength={10} style={[styles.input, { color: c.foreground, borderColor: c.border }]} />
             <Text style={{ color: c.mutedForeground, lineHeight: 20 }}>{translate(app.language, 'memberCorporateCodeSignupHint')}</Text>
             <TextInput inputDirection="ltr" testID="auth-corporate-code" accessibilityLabel={translate(app.language, 'memberCorporateCodeInput')} placeholder={translate(app.language, 'memberCorporateCodeInput')} placeholderTextColor={c.mutedForeground} value={corporateCode} onChangeText={value => setCorporateCode(value)} autoCapitalize="none" autoCorrect={false} maxLength={128} style={[styles.input, { color: c.foreground, borderColor: c.border }]} />
           </> : null}
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
          routeAfterAuthentication();
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
