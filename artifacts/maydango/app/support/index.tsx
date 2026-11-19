import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {
  getGetMemberSupportTicketAttachmentsQueryKey,
  getGetMemberNotificationSettingsQueryKey,
  getGetMemberSupportTicketsQueryKey,
  useCreateMemberSupportTicket,
  useGetMemberNotificationSettings,
  useGetMemberSupportTickets,
  useGetSupportStaffAgents,
  useRegisterMemberPushDevice,
  useUpdateMemberNotificationSettings,
} from '@workspace/api-client-react';
import { Text, TextInput, Pressable, Ionicons } from '@/components/Localized';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { errorCopy } from '@/lib/content';
import { translate, type MessageKey } from '@/lib/i18n';
import { SupportAttachmentPicker } from '@/components/SupportAttachmentPicker';
import { uploadSupportAttachments, type SupportAttachmentDraft } from '@/lib/support-attachments';

type Category =
  | 'membership' | 'payment' | 'booking' | 'checkin' | 'facility' | 'course'
  | 'live_class' | 'refund' | 'event' | 'corporate_membership'
  | 'technical_issue' | 'account_security' | 'account' | 'access' | 'safety' | 'other';
type Status = 'open' | 'in_progress' | 'waiting_member' | 'resolved' | 'closed';
const categoryKeys: Record<Category, MessageKey> = {
  membership: 'categoryMembership', payment: 'categoryPayment',
  booking: 'categoryBooking', account: 'categoryAccount', access: 'categoryAccess',
  checkin: 'categoryCheckin', facility: 'categoryFacility', course: 'categoryCourse',
  live_class: 'categoryLiveClass', refund: 'categoryRefund', event: 'categoryEvent',
  corporate_membership: 'categoryCorporateMembership', technical_issue: 'categoryTechnicalIssue',
  account_security: 'categoryAccountSecurity', safety: 'categorySafety', other: 'categoryOther',
};
const statusKeys: Record<Status, MessageKey> = {
  open: 'supportStatusOpen', in_progress: 'supportStatusInProgress',
  waiting_member: 'supportStatusWaiting', resolved: 'supportStatusResolved', closed: 'supportStatusClosed',
};

export default function SupportCenterScreen() {
  const colors = useColors();
  const app = useApp();
  const params = useLocalSearchParams<{ facilityName?: string; facilityAction?: string }>();
  const t = (key: MessageKey) => translate(app.language, key);
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [urgentSafety, setUrgentSafety] = useState(false);
  const [attachments, setAttachments] = useState<SupportAttachmentDraft[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const appliedFacilityPrefill = useRef<string | null>(null);
  const tickets = useGetMemberSupportTickets({ query: { enabled: app.signedIn } });
  const settings = useGetMemberNotificationSettings({ query: { enabled: app.signedIn } });
  const agents = useGetSupportStaffAgents({ query: { enabled: app.signedIn, staleTime: 30_000 } });
  const createTicket = useCreateMemberSupportTicket();
  const updateSettings = useUpdateMemberNotificationSettings();
  const registerDevice = useRegisterMemberPushDevice();
  const align = app.language === 'en' ? 'left' : 'right';

  useEffect(() => {
    if (!params.facilityName || (params.facilityAction !== 'contact' && params.facilityAction !== 'report')) return;
    const prefillKey = `${params.facilityAction}:${params.facilityName}`;
    if (appliedFacilityPrefill.current === prefillKey) return;
    const report = params.facilityAction === 'report';
    setSubject(t(report ? 'facilityReportSubject' : 'facilityContactSubject').replace('{facility}', params.facilityName));
    setMessage(t(report ? 'facilityReportMessage' : 'facilityContactMessage').replace('{facility}', params.facilityName));
    setCategory('other');
    appliedFacilityPrefill.current = prefillKey;
  }, [params.facilityAction, params.facilityName, app.language]);

  useEffect(() => {
    if (settings.data?.pushEnabled && settings.data.language !== app.language) {
      void updateSettings.mutateAsync({ data: { pushEnabled: true, language: app.language } })
        .then(() => queryClient.invalidateQueries({ queryKey: getGetMemberNotificationSettingsQueryKey() }))
        .catch(() => setNotice(t('notSaved')));
    }
  }, [app.language, settings.data?.pushEnabled, settings.data?.language]);

  const submitTicket = async () => {
    if (!subject.trim() || message.trim().length < 10) return setNotice(t('supportValidationError'));
    setNotice(null);
    try {
      const ticket = await createTicket.mutateAsync({
        data: { subject: subject.trim(), category, urgent: category === 'safety' && urgentSafety, message: message.trim(), language: app.language },
      });
      let attachmentFailed = false;
      if (attachments.length && ticket.messages[0]?.id) {
        setAttachmentBusy(true);
        try {
          await uploadSupportAttachments(ticket.id, ticket.messages[0].id, attachments);
          await queryClient.invalidateQueries({ queryKey: getGetMemberSupportTicketAttachmentsQueryKey(ticket.id) });
        } catch {
          attachmentFailed = true;
        } finally {
          setAttachmentBusy(false);
        }
      }
      await queryClient.invalidateQueries({ queryKey: getGetMemberSupportTicketsQueryKey() });
      setSubject('');
      setMessage('');
      setUrgentSafety(false);
      setAttachments([]);
      if (attachmentFailed) {
        setNotice(t('supportAttachmentFailed'));
        return;
      }
      setNotice(t('supportTicketCreated'));
      router.push({ pathname: '/support/[id]', params: { id: ticket.id } });
    } catch (error) {
      setNotice(errorCopy(error));
    }
  };

  const enablePush = async () => {
    setNotice(null);
    setPermissionBlocked(false);
    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !Device.isDevice) {
      setNotice(t('pushUnavailable'));
      return;
    }
    const projectId = Constants.easConfig?.projectId
      ?? Constants.expoConfig?.extra?.eas?.projectId
      ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    if (!projectId) {
      setNotice(t('pushConfigMissing'));
      return;
    }
    try {
      let permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) {
        setNotice(t('pushPermissionDenied'));
        setPermissionBlocked(!permission.canAskAgain);
        return;
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('operational-updates', {
          name: 'MaydanGO updates',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await registerDevice.mutateAsync({
        data: { token, platform: Platform.OS, language: app.language },
      });
      await queryClient.invalidateQueries({ queryKey: getGetMemberNotificationSettingsQueryKey() });
    } catch (error) {
      setNotice(errorCopy(error));
    }
  };

  const disablePush = async () => {
    setNotice(null);
    try {
      await updateSettings.mutateAsync({ data: { pushEnabled: false, language: app.language } });
      await queryClient.invalidateQueries({ queryKey: getGetMemberNotificationSettingsQueryKey() });
    } catch (error) {
      setNotice(errorCopy(error));
    }
  };

  return (
    <ScreenShell>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={17} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('back')}</Text>
      </Pressable>
      <ScreenHeader eyebrow={t('yourAccount')} title={t('supportCenter')} />
      <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Text style={[styles.intro, { color: colors.mutedForeground, textAlign: align }]}>{t('supportIntro')}</Text>
        {!app.signedIn ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.body, { color: colors.foreground, textAlign: align }]}>{t('supportSignIn')}</Text>
            <ActionButton colors={colors} title={t('supportSignIn')} onPress={() => router.push('/account')} icon="person-outline" />
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeading}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground, textAlign: align }]}>{t('pushSettingsTitle')}</Text>
                  <Text style={[styles.body, { color: colors.mutedForeground, textAlign: align }]}>{t('pushSettingsHint')}</Text>
                  {agents.data ? <Text style={[styles.caption, { color: colors.mutedForeground, textAlign: align }]}>{t('urgentSafetyPushOptInHint')}</Text> : null}
                </View>
                <Ionicons name="notifications-outline" size={22} color={colors.primary} />
              </View>
              {settings.data?.pushEnabled ? (
                <ActionButton colors={colors} title={t('pushDisable')} onPress={() => void disablePush()} busy={updateSettings.isPending} icon="notifications-off-outline" tone="quiet" />
              ) : (
                <ActionButton colors={colors} title={t('pushEnable')} onPress={() => void enablePush()} busy={registerDevice.isPending} icon="notifications-outline" />
              )}
              {permissionBlocked ? (
                <ActionButton colors={colors} title={t('pushOpenSettings')} onPress={() => { void Linking.openSettings().catch(() => setNotice(t('pushPermissionDenied'))); }} icon="settings-outline" tone="quiet" />
              ) : null}
              {notice ? <Text accessibilityRole="alert" style={[styles.notice, { color: colors.destructive }]}>{notice}</Text> : null}
              {settings.error ? <Text accessibilityRole="alert" style={[styles.notice, { color: colors.destructive }]}>{errorCopy(settings.error)}</Text> : null}
              {settings.data?.pushEnabled ? (
                <Text style={[styles.caption, { color: colors.mutedForeground, textAlign: align }]}>
                  {t('pushEnabledStatus').replace('{n}', String(settings.data.registeredDevices))}
                </Text>
              ) : null}
            </View>

            {agents.data ? (
              <ActionButton colors={colors} title={t('supportStaffTitle')} onPress={() => router.push('/support/staff')} icon="people-outline" tone="quiet" />
            ) : null}

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground, textAlign: align }]}>{t('newSupportTicket')}</Text>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground, textAlign: align }]}>{t('ticketSubject')}</Text>
                <TextInput
                  accessibilityLabel={t('ticketSubject')}
                  value={subject}
                  onChangeText={setSubject}
                  placeholder={t('ticketSubject')}
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={120}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, textAlign: align }]}
                />
              </View>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground, textAlign: align }]}>{t('ticketCategory')}</Text>
                <View style={styles.chips}>
                  {(Object.keys(categoryKeys) as Category[]).map(value => (
                    <Choice key={value} colors={colors} selected={category === value} title={t(categoryKeys[value])} onPress={() => {
                      setCategory(value);
                      if (value !== 'safety') setUrgentSafety(false);
                    }} />
                  ))}
                </View>
              </View>
              {category === 'safety' ? (
                <View style={styles.field}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: urgentSafety }}
                    onPress={() => setUrgentSafety(value => !value)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}
                  >
                    <Ionicons name={urgentSafety ? 'checkbox' : 'square-outline'} size={20} color={urgentSafety ? colors.destructive : colors.mutedForeground} />
                    <Text style={{ color: colors.foreground, fontWeight: '700' }}>{t('urgentSafety')}</Text>
                  </Pressable>
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('urgentSafetyHint')}</Text>
                </View>
              ) : null}
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.mutedForeground, textAlign: align }]}>{t('ticketMessage')}</Text>
                <TextInput
                  accessibilityLabel={t('ticketMessage')}
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t('ticketMessage')}
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  maxLength={5000}
                  textAlignVertical="top"
                  style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, textAlign: align }]}
                />
                <Text style={[styles.caption, { color: colors.mutedForeground, textAlign: align }]}>{message.length}/5000</Text>
              </View>
              <SupportAttachmentPicker language={app.language} files={attachments} onChange={setAttachments} onError={setNotice} />
              <ActionButton colors={colors} title={t('submitSupportTicket')} onPress={() => void submitTicket()} busy={createTicket.isPending || attachmentBusy} icon="arrow-up-outline" />
              {createTicket.error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{errorCopy(createTicket.error)}</Text> : null}
            </View>

            <View style={styles.listHeader}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{t('mySupportTickets')}</Text>
              <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
            </View>
            {tickets.isLoading ? <Text style={{ color: colors.mutedForeground }}>{t('supportLoading')}</Text> : null}
            {tickets.error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{t('supportLoadError')}</Text> : null}
            {!tickets.isLoading && !tickets.error && !tickets.data?.length ? (
              <View style={[styles.empty, { borderColor: colors.border }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground }}>{t('supportNoTickets')}</Text>
              </View>
            ) : null}
            {tickets.data?.map(ticket => (
              <Pressable
                key={ticket.id}
                accessibilityRole="button"
                testID={`support-ticket-${ticket.id}`}
                onPress={() => router.push({ pathname: '/support/[id]', params: { id: ticket.id } })}
                style={[styles.ticket, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={[styles.ticketTitle, { color: colors.foreground, textAlign: align }]} numberOfLines={2}>{ticket.subject}</Text>
                  <Text style={[styles.caption, { color: colors.mutedForeground, textAlign: align }]}>{t(categoryKeys[ticket.category as Category])}</Text>
                  {ticket.urgent ? <Text style={[styles.caption, { color: colors.destructive, fontWeight: '800', textAlign: align }]}>{t('urgentSafety')}</Text> : null}
                </View>
                <View style={[styles.status, { backgroundColor: colors.secondary }]}>
                  <Text style={{ color: colors.secondaryForeground, fontSize: 11, fontWeight: '700' }}>{t(statusKeys[ticket.status as Status])}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
              </Pressable>
            ))}
            {notice && tickets.data?.length ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{notice}</Text> : null}
          </>
        )}
      </KeyboardAwareScrollViewCompat>
    </ScreenShell>
  );
}

function Choice({ colors, selected, title, onPress }: { colors: ReturnType<typeof useColors>; selected: boolean; title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.secondary }]}>
      <Text style={{ color: selected ? colors.primaryForeground : colors.secondaryForeground, fontWeight: '700', fontSize: 12 }}>{title}</Text>
    </Pressable>
  );
}

function ActionButton({ colors, title, onPress, busy = false, icon, tone = 'primary' }: {
  colors: ReturnType<typeof useColors>; title: string; onPress: () => void; busy?: boolean;
  icon: keyof typeof Ionicons.glyphMap; tone?: 'primary' | 'quiet';
}) {
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[
      styles.button,
      { backgroundColor: tone === 'primary' ? colors.primary : colors.secondary, opacity: busy ? 0.6 : 1 },
    ]}>
      <Ionicons name={icon} size={18} color={tone === 'primary' ? colors.primaryForeground : colors.secondaryForeground} />
      <Text style={{ color: tone === 'primary' ? colors.primaryForeground : colors.secondaryForeground, fontWeight: '800' }}>
        {busy ? '…' : title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 42, gap: 14 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 20, paddingTop: 6 },
  intro: { fontSize: 14, lineHeight: 21, marginBottom: 2 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 14 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  caption: { fontSize: 11, lineHeight: 16 },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700' },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  multiline: { minHeight: 110 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  button: { minHeight: 46, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  notice: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  empty: { minHeight: 96, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 18 },
  ticket: { minHeight: 74, borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ticketTitle: { fontSize: 14, fontWeight: '800' },
  status: { borderRadius: 13, paddingHorizontal: 9, paddingVertical: 7 },
});
