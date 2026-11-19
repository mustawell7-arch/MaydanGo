import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetSupportStaffAgentsQueryKey,
  getGetSupportNotificationFailuresQueryKey,
  getGetSupportPendingDeviceChangesQueryKey,
  getGetSupportStaffAccessHistoryQueryKey,
  getGetSupportUrgentAlertDeliveryOutcomesQueryKey,
  getGetSupportUrgentAlertRecipientHistoryQueryKey,
  getGetSupportStaffTicketQueryKey,
  getGetSupportStaffTicketsQueryKey,
  useAddSupportStaffAgent,
  useApproveSupportDeviceChange,
  useGetSupportNotificationFailures,
  useGetSupportPendingDeviceChanges,
  useGetSupportStaffAccessHistory,
  useGetSupportStaffAgents,
  useGetSupportUrgentAlertDeliveryOutcomes,
  useGetSupportUrgentAlertRecipientHistory,
  useGetSupportStaffTicket,
  useGetSupportStaffTickets,
  useRemoveSupportStaffAgent,
  useReplySupportStaffTicket,
  useUpdateSupportStaffTicket,
  useUpdateSupportStaffAgentUrgentAlerts,
} from '@workspace/api-client-react';
import { Text, TextInput, Pressable, Ionicons } from '@/components/Localized';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { errorCopy } from '@/lib/content';
import { translate, type MessageKey } from '@/lib/i18n';

type Status = 'open' | 'in_progress' | 'waiting_member' | 'resolved' | 'closed';
function formatBaghdadDate(value: string | Date, language: string) {
  const date = value instanceof Date ? value : new Date(value);
  const locale = language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad',
  }).format(date);
}
const statuses: Status[] = ['open', 'in_progress', 'waiting_member', 'resolved', 'closed'];
const statusKeys: Record<Status, MessageKey> = {
  open: 'supportStatusOpen', in_progress: 'supportStatusInProgress',
  waiting_member: 'supportStatusWaiting', resolved: 'supportStatusResolved', closed: 'supportStatusClosed',
};
const categoryKeys: Record<string, MessageKey> = {
  membership: 'categoryMembership', payment: 'categoryPayment',
  booking: 'categoryBooking', account: 'categoryAccount', access: 'categoryAccess',
  checkin: 'categoryCheckin', facility: 'categoryFacility', course: 'categoryCourse',
  live_class: 'categoryLiveClass', refund: 'categoryRefund', event: 'categoryEvent',
  corporate_membership: 'categoryCorporateMembership', technical_issue: 'categoryTechnicalIssue',
  account_security: 'categoryAccountSecurity', safety: 'categorySafety', other: 'categoryOther',
};
const urgentDeliverySendKeys: Record<string, MessageKey> = {
  accepted: 'urgentDeliverySendAccepted',
  partial: 'urgentDeliverySendPartial',
  retrying: 'urgentDeliverySendRetrying',
  pending: 'urgentDeliverySendPending',
  failed: 'urgentDeliverySendFailed',
  cancelled: 'urgentDeliverySendCancelled',
};
const urgentDeliveryReceiptKeys: Record<string, MessageKey> = {
  no_receipt: 'urgentDeliveryReceiptNoReceipt',
  pending: 'urgentDeliveryReceiptPending',
  no_error: 'urgentDeliveryReceiptNoError',
  partial: 'urgentDeliveryReceiptPartial',
  error: 'urgentDeliveryReceiptError',
  unavailable: 'urgentDeliveryReceiptUnavailable',
};

export default function SupportStaffScreen() {
  const colors = useColors();
  const app = useApp();
  const t = (key: MessageKey) => translate(app.language, key);
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ ticketId?: string }>();
  const notificationTicketId = typeof params.ticketId === 'string' ? params.ticketId : '';
  const [selectedId, setSelectedId] = useState(() => notificationTicketId);
  const [message, setMessage] = useState('');
  const [deviceReasons, setDeviceReasons] = useState<Record<string, string>>({});
  const [newAgentId, setNewAgentId] = useState('');
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tickets = useGetSupportStaffTickets(undefined, { query: { enabled: app.signedIn, refetchInterval: 30_000 } });
  const agents = useGetSupportStaffAgents({ query: { enabled: app.signedIn } });
  const isAdmin = agents.data?.some(agent =>
    agent.userId === userId && (agent.role === 'customer_support_admin' || agent.role === 'super_admin'),
  ) ?? false;
  const recipientHistory = useGetSupportUrgentAlertRecipientHistory({
    query: { enabled: app.signedIn && isAdmin, staleTime: 30_000 },
  });
  const supportAccessHistory = useGetSupportStaffAccessHistory({
    query: { enabled: app.signedIn && isAdmin, staleTime: 30_000 },
  });
  const urgentDeliveryOutcomes = useGetSupportUrgentAlertDeliveryOutcomes({
    query: { enabled: app.signedIn && isAdmin, refetchInterval: 60_000 },
  });
  const failures = useGetSupportNotificationFailures({ query: { enabled: app.signedIn, refetchInterval: 60_000 } });
  const deviceChanges = useGetSupportPendingDeviceChanges({ query: { enabled: app.signedIn, refetchInterval: 30_000 } });
  const detail = useGetSupportStaffTicket(selectedId, { query: {
    enabled: !!selectedId && app.signedIn,
    refetchInterval: 30_000,
  } });
  const updateTicket = useUpdateSupportStaffTicket();
  const reply = useReplySupportStaffTicket();
  const approveDeviceChange = useApproveSupportDeviceChange();
  const addAgent = useAddSupportStaffAgent();
  const removeAgent = useRemoveSupportStaffAgent();
  const updateUrgentAlertRecipient = useUpdateSupportStaffAgentUrgentAlerts();
  const align = app.language === 'en' ? 'left' : 'right';

  useEffect(() => {
    if (!selectedId && tickets.data?.length) setSelectedId(tickets.data[0].id);
    if (selectedId && tickets.data?.length && !notificationTicketId && !tickets.data.some(ticket => ticket.id === selectedId)) {
      setSelectedId(tickets.data[0].id);
    }
  }, [tickets.data, selectedId, notificationTicketId]);

  const selectTicket = (ticketId: string) => {
    setSelectedId(ticketId);
    if (notificationTicketId) router.setParams({ ticketId: undefined });
  };

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetSupportStaffTicketsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSupportNotificationFailuresQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSupportUrgentAlertDeliveryOutcomesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSupportPendingDeviceChangesQueryKey() }),
      ...(selectedId ? [queryClient.invalidateQueries({ queryKey: getGetSupportStaffTicketQueryKey(selectedId) })] : []),
    ]);
  };

  const refreshTeam = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetSupportStaffAgentsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSupportStaffTicketsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSupportStaffAccessHistoryQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSupportUrgentAlertRecipientHistoryQueryKey() }),
    ]);
  };

  const grantSupportAccess = async () => {
    const targetUserId = newAgentId.trim();
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(targetUserId)) {
      setNotice(t('supportAccountIdRequired'));
      return;
    }
    setNotice(null);
    try {
      await addAgent.mutateAsync({ data: { userId: targetUserId } });
      setNewAgentId('');
      await refreshTeam();
      setNotice(t('supportGrantDone'));
    } catch (error) {
      setNotice(errorCopy(error));
    }
  };

  const revokeSupportAccess = async (targetUserId: string) => {
    setNotice(null);
    try {
      await removeAgent.mutateAsync({ userId: targetUserId });
      setPendingRemovalId(null);
      await refreshTeam();
      setNotice(t('supportRemoveDone'));
    } catch (error) {
      setNotice(errorCopy(error));
    }
  };

  const setUrgentAlertRecipient = async (targetUserId: string, receiveUrgentAlerts: boolean) => {
    setNotice(null);
    try {
      await updateUrgentAlertRecipient.mutateAsync({
        userId: targetUserId,
        data: { receiveUrgentAlerts },
      });
      await refreshTeam();
      setNotice(t('urgentAlertRecipientUpdated'));
    } catch (error) {
      setNotice(errorCopy(error));
    }
  };

  const approveDevice = async (id: string) => {
    const reason = deviceReasons[id]?.trim() ?? '';
    if (reason.length < 10) {
      setNotice(t('deviceApprovalReasonRequired'));
      return;
    }
    setNotice(null);
    try {
      await approveDeviceChange.mutateAsync({ id, data: { reason } });
      setDeviceReasons(current => ({ ...current, [id]: '' }));
      await refresh();
      setNotice(t('deviceApprovalDone'));
    } catch (error) {
      setNotice(errorCopy(error));
    }
  };

  const update = async (data: { status?: Status; assignedTo?: string | null }) => {
    if (!selectedId) return;
    setNotice(null);
    try {
      await updateTicket.mutateAsync({ id: selectedId, data });
      await refresh();
    } catch (error) {
      setNotice(errorCopy(error));
    }
  };

  const sendReply = async () => {
    if (!selectedId || !message.trim()) return;
    setNotice(null);
    try {
      await reply.mutateAsync({ id: selectedId, data: { message: message.trim(), language: app.language } });
      setMessage('');
      await refresh();
    } catch (error) {
      setNotice(errorCopy(error));
    }
  };

  if (tickets.error || agents.error) {
    return (
      <ScreenShell>
        <ScreenHeader eyebrow={t('supportStaffEyebrow')} title={t('supportStaffTitle')} />
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontWeight: '700', textAlign: 'center' }}>{t('supportStaffOnly')}</Text>
          <Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>{errorCopy(tickets.error ?? agents.error)}</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={17} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('back')}</Text>
      </Pressable>
      <ScreenHeader eyebrow={t('supportStaffEyebrow')} title={t('supportStaffTitle')} />
      <KeyboardAwareScrollViewCompat contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {notice ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{notice}</Text> : null}
        <View style={[styles.queueCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.heading, { color: colors.foreground }]}>{t('mySupportTickets')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('tryAgain')} onPress={() => void refresh()}>
              <Ionicons name="refresh" size={19} color={colors.primary} />
            </Pressable>
          </View>
          {tickets.isLoading ? <Text style={{ color: colors.mutedForeground }}>{t('supportLoading')}</Text> : null}
          {!tickets.isLoading && !tickets.data?.length ? <Text style={{ color: colors.mutedForeground }}>{t('supportNoTickets')}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.queue}>
            {tickets.data?.map(ticket => (
              <Pressable key={ticket.id} accessibilityRole="button" accessibilityState={{ selected: selectedId === ticket.id }}
                onPress={() => selectTicket(ticket.id)} style={[
                  styles.queueItem,
                  { borderColor: selectedId === ticket.id ? colors.primary : colors.border, backgroundColor: selectedId === ticket.id ? colors.secondary : colors.background },
                ]}>
                <Text style={[styles.ticketTitle, { color: colors.foreground }]} numberOfLines={2}>{ticket.subject}</Text>
                {ticket.urgent ? <Text style={[styles.caption, { color: colors.destructive, fontWeight: '800' }]}>{t('urgentSafety')}</Text> : null}
                {ticket.urgentOverdue ? (
                  <Text style={[styles.caption, { color: colors.destructive, fontWeight: '800' }]}>{t('urgentUnassignedOverdue')}</Text>
                ) : null}
                {ticket.urgentAlertStatus === 'fallback_required' ? (
                  <Text style={[styles.caption, { color: colors.destructive, fontWeight: '800' }]}>{t('urgentAlertFallbackLabel')}</Text>
                ) : ticket.urgentAlertStatus === 'pending' ? (
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('urgentAlertPendingLabel')}</Text>
                ) : null}
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t(statusKeys[ticket.status as Status])}</Text>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{ticket.memberUserId}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {isAdmin ? (
          <View style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.heading, { color: colors.foreground }]}>{t('supportTeamTitle')}</Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('supportTeamHint')}</Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('urgentAlertRecipientsHint')}</Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('urgentAlertRecipientReadinessHint')}</Text>
            {!agents.data?.some(agent =>
              agent.receiveUrgentAlerts && agent.pushEnabled && (agent.activeDeviceCount ?? 0) > 0,
            ) ? (
              <Text accessibilityRole="alert" style={[styles.caption, { color: colors.destructive, fontWeight: '700' }]}>
                {t('urgentAlertNoReadyRecipients')}
              </Text>
            ) : null}
            <TextInput
              accessibilityLabel={t('supportAccountId')}
              value={newAgentId}
              onChangeText={setNewAgentId}
              placeholder={t('supportAccountId')}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={160}
              style={[styles.accountInput, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background }]}
            />
            <ActionButton
              colors={colors}
              title={t('supportGrantAccess')}
              busy={addAgent.isPending}
              onPress={() => void grantSupportAccess()}
              icon="person-add-outline"
            />
            {agents.data?.length ? (
              agents.data.map(agent => {
                const pushSetupReady = agent.pushEnabled === true && (agent.activeDeviceCount ?? 0) > 0;
                const pushReadinessMessage = agent.pushEnabled !== true
                  ? t('urgentAlertRecipientPushDisabled')
                  : (agent.activeDeviceCount ?? 0) === 0
                    ? t('urgentAlertRecipientNoDevice')
                    : t('urgentAlertRecipientPushReady');
                return (
                <View key={agent.userId} style={[styles.teamAgent, { borderColor: colors.border }]}>
                  <View style={styles.teamAgentHeader}>
                    <View style={styles.teamAgentIdentity}>
                      <Text raw style={[styles.label, { color: colors.foreground }]}>{agent.userId}</Text>
                      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                        {agent.role === 'customer_support_admin' || agent.role === 'super_admin'
                          ? t('supportAdminRoleLabel') : t('supportRoleLabel')}
                      </Text>
                    </View>
                    {agent.role === 'support' && pendingRemovalId !== agent.userId ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${t('supportRemoveAccess')} ${agent.userId}`}
                        onPress={() => { setNotice(null); setPendingRemovalId(agent.userId); }}
                        style={styles.removeButton}
                      >
                        <Ionicons name="person-remove-outline" size={17} color={colors.destructive} />
                        <Text style={{ color: colors.destructive, fontWeight: '700', fontSize: 12 }}>
                          {t('supportRemoveAccess')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityLabel={`${t('urgentAlertRecipientLabel')} ${agent.userId}`}
                    accessibilityState={{
                      checked: agent.receiveUrgentAlerts,
                      disabled: updateUrgentAlertRecipient.isPending,
                    }}
                    disabled={updateUrgentAlertRecipient.isPending}
                    onPress={() => void setUrgentAlertRecipient(agent.userId, !agent.receiveUrgentAlerts)}
                    style={[
                      styles.teamAgentHeader,
                      { marginTop: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.secondary },
                    ]}
                  >
                    <Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>
                      {t('urgentAlertRecipientLabel')}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: agent.receiveUrgentAlerts ? colors.primary : colors.mutedForeground, fontWeight: '700' }}>
                        {agent.receiveUrgentAlerts ? t('urgentAlertRecipientEnabled') : t('urgentAlertRecipientDisabled')}
                      </Text>
                      <Ionicons
                        name={agent.receiveUrgentAlerts ? 'notifications-outline' : 'notifications-off-outline'}
                        size={17}
                        color={agent.receiveUrgentAlerts ? colors.primary : colors.mutedForeground}
                      />
                    </View>
                  </Pressable>
                  {agent.receiveUrgentAlerts ? (
                    <Text style={[
                      styles.caption,
                      { color: pushSetupReady ? colors.primary : colors.destructive, fontWeight: '700' },
                    ]}>
                      {pushReadinessMessage}
                    </Text>
                  ) : null}
                  {pendingRemovalId === agent.userId ? (
                    <View style={[styles.confirmBox, { backgroundColor: colors.secondary }]}>
                      <Text style={{ color: colors.secondaryForeground, fontWeight: '800' }}>
                        {t('supportRemoveTitle')}
                      </Text>
                      <Text style={{ color: colors.secondaryForeground, fontSize: 12, lineHeight: 18 }}>
                        {t('supportRemoveBody')}
                      </Text>
                      <View style={styles.confirmActions}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={removeAgent.isPending}
                          onPress={() => setPendingRemovalId(null)}
                          style={styles.confirmCancel}
                        >
                          <Text style={{ color: colors.secondaryForeground, fontWeight: '700' }}>{t('cancel')}</Text>
                        </Pressable>
                        <ActionButton
                          colors={colors}
                          title={t('supportRemoveAccess')}
                          busy={removeAgent.isPending}
                          onPress={() => void revokeSupportAccess(agent.userId)}
                          icon="person-remove-outline"
                          destructive
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
                );
              })
            ) : (
              <Text style={{ color: colors.mutedForeground }}>{t('supportNoAgents')}</Text>
            )}
            <View style={[styles.audit, { borderTopColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('urgentAlertHistoryTitle')}</Text>
              {recipientHistory.isLoading ? (
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('supportLoading')}</Text>
              ) : recipientHistory.isError ? (
                <Text style={[styles.caption, { color: colors.destructive }]}>{t('urgentAlertHistoryLoadError')}</Text>
              ) : recipientHistory.data?.length ? (
                recipientHistory.data.slice(0, 10).map(event => (
                  <View key={event.id} style={[styles.teamAgent, { borderColor: colors.border }]}>
                    <Text style={[styles.label, { color: event.toReceiving ? colors.primary : colors.mutedForeground }]}>
                      {t(event.toReceiving ? 'urgentAlertHistoryEnabled' : 'urgentAlertHistoryDisabled')}
                      {' · '}
                      {formatBaghdadDate(event.createdAt, app.language)}
                    </Text>
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {t('urgentAlertHistoryActor')}: {event.actorId}
                    </Text>
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {t('urgentAlertHistoryRecipient')}: {event.recipientUserId}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('urgentAlertHistoryEmpty')}</Text>
              )}
            </View>
            <View style={[styles.audit, { borderTopColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('supportAccessHistoryTitle')}</Text>
              {supportAccessHistory.isLoading ? (
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('supportLoading')}</Text>
              ) : supportAccessHistory.isError ? (
                <Text style={[styles.caption, { color: colors.destructive }]}>{t('supportAccessHistoryError')}</Text>
              ) : supportAccessHistory.data?.length ? (
                supportAccessHistory.data.slice(0, 10).map(event => (
                  <View key={event.id} style={[styles.teamAgent, { borderColor: colors.border }]}>
                    <Text style={[styles.label, { color: event.action === 'granted' ? colors.primary : colors.destructive }]}>
                      {t(event.action === 'granted' ? 'supportAccessGranted' : 'supportAccessRemoved')}
                      {' · '}
                      {formatBaghdadDate(event.createdAt, app.language)}
                    </Text>
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {t('supportAccessHistoryActor')}: {event.actorId}
                    </Text>
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {t('supportAccessHistoryTarget')}: {event.targetUserId}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('supportAccessHistoryEmpty')}</Text>
              )}
            </View>
          </View>
        ) : null}

        {isAdmin ? (
          <View style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.heading, { color: colors.foreground }]}>{t('urgentDeliveryOutcomesTitle')}</Text>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('urgentDeliveryOutcomesHint')}</Text>
            {urgentDeliveryOutcomes.isLoading ? (
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('supportLoading')}</Text>
            ) : urgentDeliveryOutcomes.isError ? (
              <Text style={[styles.caption, { color: colors.destructive }]}>{t('urgentDeliveryOutcomesError')}</Text>
            ) : urgentDeliveryOutcomes.data?.length ? (
              urgentDeliveryOutcomes.data.slice(0, 20).map(event => (
                <View key={`${event.ticketId}-${event.recipientUserId}-${event.kind}`} style={[styles.teamAgent, { borderColor: colors.border }]}>
                  <View style={styles.teamAgentHeader}>
                    <View style={styles.teamAgentIdentity}>
                      <Text style={[styles.label, { color: colors.foreground }]}>
                        {t(event.kind === 'support_urgent' ? 'urgentDeliveryKindInitial' : 'urgentDeliveryKindEscalation')}
                      </Text>
                      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                        {formatBaghdadDate(event.latestActivityAt, app.language)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('urgentDeliveryOpenReport')} ${event.ticketId}`}
                      onPress={() => selectTicket(event.ticketId)}
                      style={styles.removeButton}
                    >
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                        {t('urgentDeliveryOpenReport')}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {t('urgentDeliveryRecipient')}: {event.recipientUserId}
                  </Text>
                  <Text style={[styles.caption, { color: colors.foreground, fontWeight: '700' }]}>
                    {t(urgentDeliverySendKeys[event.sendStatus] ?? 'urgentDeliverySendPending')}
                    {' · '}
                    {event.acceptedDeviceCount}/{event.deviceCount} {t('urgentDeliveryDevices')}
                  </Text>
                  {event.failedDeviceCount > 0 ? (
                    <Text style={[styles.caption, { color: colors.destructive }]}>
                      {t('urgentDeliverySendFailed')}: {event.failedDeviceCount}
                    </Text>
                  ) : null}
                  {event.retryPendingDeviceCount > 0 ? (
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {t('urgentDeliverySendRetrying')}: {event.retryPendingDeviceCount}
                    </Text>
                  ) : null}
                  {event.pendingDeviceCount > 0 ? (
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {t('urgentDeliverySendPending')}: {event.pendingDeviceCount}
                    </Text>
                  ) : null}
                  {event.cancelledDeviceCount > 0 ? (
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {t('urgentDeliverySendCancelled')}: {event.cancelledDeviceCount}
                    </Text>
                  ) : null}
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {t(urgentDeliveryReceiptKeys[event.receiptStatus] ?? 'urgentDeliveryReceiptNoReceipt')}
                    {' · '}
                    {event.receiptOkCount}/{event.deviceCount} {t('urgentDeliveryDevices')}
                  </Text>
                  {event.receiptPendingCount > 0 ? (
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {t('urgentDeliveryReceiptPending')}: {event.receiptPendingCount}
                    </Text>
                  ) : null}
                  {event.receiptErrorCount > 0 ? (
                    <Text style={[styles.caption, { color: colors.destructive }]}>
                      {t('urgentDeliveryReceiptError')}: {event.receiptErrorCount}
                    </Text>
                  ) : null}
                  {event.receiptUnavailableCount > 0 ? (
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {t('urgentDeliveryReceiptUnavailable')}: {event.receiptUnavailableCount}
                    </Text>
                  ) : null}
                  {event.receiptNotCheckedCount > 0 ? (
                    <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                      {t('urgentDeliveryReceiptNotChecked')}: {event.receiptNotCheckedCount}
                    </Text>
                  ) : null}
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {t('pushAttempts')}: {event.attemptCount}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('urgentDeliveryOutcomesEmpty')}</Text>
            )}
          </View>
        ) : null}

        {detail.data ? (
          <>
            <View style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.heading, { color: colors.foreground }]}>{detail.data.subject}</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                {t(categoryKeys[detail.data.category] ?? 'categoryOther')} · {detail.data.memberUserId} · {detail.data.language.toUpperCase()}
              </Text>
              {detail.data.urgent ? (
                <View style={[styles.confirmBox, { backgroundColor: colors.destructive }]}>
                  <Text style={{ color: colors.destructiveForeground, fontWeight: '800' }}>{t('urgentSafety')}</Text>
                  <Text style={{ color: colors.destructiveForeground, fontSize: 12, lineHeight: 18 }}>{t('urgentSafetyStaffHint')}</Text>
                </View>
              ) : null}
              {detail.data.urgentOverdue ? (
                <View style={[styles.confirmBox, { backgroundColor: colors.destructive }]}>
                  <Text style={{ color: colors.destructiveForeground, fontWeight: '800' }}>{t('urgentUnassignedOverdue')}</Text>
                  <Text style={{ color: colors.destructiveForeground, fontSize: 12, lineHeight: 18 }}>{t('urgentUnassignedOverdueHint')}</Text>
                </View>
              ) : null}
              {detail.data.urgentAlertStatus === 'fallback_required' ? (
                <View style={[styles.confirmBox, { backgroundColor: colors.destructive }]}>
                  <Text style={{ color: colors.destructiveForeground, fontWeight: '800' }}>{t('urgentAlertFallbackLabel')}</Text>
                  <Text style={{ color: colors.destructiveForeground, fontSize: 12, lineHeight: 18 }}>{t('urgentAlertFallbackHint')}</Text>
                </View>
              ) : detail.data.urgentAlertStatus === 'pending' ? (
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('urgentAlertPendingLabel')}</Text>
              ) : null}
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('supportSetStatus')}</Text>
              <View style={styles.wrap}>
                {statuses.map(status => (
                  <Chip key={status} colors={colors} selected={detail.data?.status === status}
                    title={t(statusKeys[status])} onPress={() => void update({ status })} />
                ))}
              </View>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('supportAssign')}</Text>
              <View style={styles.wrap}>
                <Chip colors={colors} selected={!detail.data.assignedTo} title={t('supportUnassigned')} onPress={() => void update({ assignedTo: null })} />
                {agents.data?.map(agent => (
                  <Chip key={agent.userId} colors={colors} selected={detail.data?.assignedTo === agent.userId}
                    title={agent.userId === userId ? `${t('profile')} · ${agent.role}` : agent.userId}
                    onPress={() => void update({ assignedTo: agent.userId })} />
                ))}
              </View>
                <View style={[styles.audit, { borderTopColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('settings')}</Text>
                {detail.data.events.slice(-8).map((event, index) => (
                  <Text key={`${event.action}-${index}`} style={[styles.caption, { color: colors.mutedForeground }]}>
                    {event.action.replaceAll('_', ' ')} · {new Date(event.createdAt).toLocaleString()}
                  </Text>
                ))}
              </View>
            </View>

            <View style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{t('supportCenter')}</Text>
              {detail.data.messages.map(item => (
                <View key={item.id} style={[styles.message, { borderColor: colors.border, backgroundColor: item.authorRole === 'member' ? colors.secondary : colors.background }]}>
                  <Text style={[styles.label, { color: colors.primary }]}>{item.authorRole === 'member' ? t('supportYou') : item.authorRole}</Text>
                  <Text style={[styles.messageText, { color: colors.foreground, textAlign: align }]}>{item.message}</Text>
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleString()}</Text>
                </View>
              ))}
              <TextInput accessibilityLabel={t('supportReply')} value={message} onChangeText={setMessage}
                placeholder={t('supportReply')} placeholderTextColor={colors.mutedForeground}
                multiline maxLength={5000} textAlignVertical="top"
                style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, textAlign: align }]} />
              <ActionButton colors={colors} title={t('supportSendReply')} busy={reply.isPending}
                onPress={() => void sendReply()} icon="send" />
            </View>
          </>
        ) : selectedId && detail.error ? (
          <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{errorCopy(detail.error)}</Text>
        ) : null}

        <View style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.heading, { color: colors.foreground }]}>{t('deviceChangeQueue')}</Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('deviceChangeReviewHint')}</Text>
          {deviceChanges.data?.length ? deviceChanges.data.map(change => (
            <View key={change.id} style={[styles.failure, { borderColor: colors.border }]}>
              <Text raw style={[styles.label, { color: colors.foreground }]}>{change.userId}</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                {change.fromPlatform.toUpperCase()} → {change.toPlatform.toUpperCase()}
              </Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                {formatBaghdadDate(change.requestedAt, app.language)} · {formatBaghdadDate(change.activateAt, app.language)} {t('iraqTime')}
              </Text>
              {change.riskFlag ? (
                <Text style={[styles.label, { color: colors.destructive }]}>{t('deviceChangeRiskFlagged')}</Text>
              ) : null}
              <TextInput
                accessibilityLabel={t('deviceApprovalReason')}
                value={deviceReasons[change.id] ?? ''}
                onChangeText={value => setDeviceReasons(current => ({ ...current, [change.id]: value }))}
                placeholder={t('deviceApprovalReason')}
                placeholderTextColor={colors.mutedForeground}
                maxLength={500}
                multiline
                textAlignVertical="top"
                style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.background, textAlign: align }]}
              />
              <ActionButton
                colors={colors}
                title={t('deviceApproveEarly')}
                busy={approveDeviceChange.isPending}
                onPress={() => void approveDevice(change.id)}
                icon="checkmark-circle-outline"
              />
            </View>
          )) : (
            <Text style={{ color: colors.mutedForeground }}>
              {deviceChanges.isLoading ? t('supportLoading') : t('deviceNoChange')}
            </Text>
          )}
          {deviceChanges.error ? (
            <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{errorCopy(deviceChanges.error)}</Text>
          ) : null}
        </View>

        <View style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.heading, { color: colors.foreground }]}>{t('pushDeliveryFailures')}</Text>
            <Ionicons name="alert-circle-outline" size={20} color={colors.destructive} />
          </View>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('pushDeliveryFailureHint')}</Text>
          {failures.data?.length ? failures.data.map(item => {
            const locale = app.language === 'ar' ? 'ar-IQ' : app.language === 'ku' ? 'ku-IQ' : 'en-IQ';
            const formatDate = (value: string) => new Intl.DateTimeFormat(locale, {
              dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad',
            }).format(new Date(value));
            const label = item.status === 'retry_pending'
              ? t('pushRetryScheduled')
              : item.receiptStatus === 'unavailable'
                ? t('pushReceiptUnavailable')
                : t('pushDeliveryFailed');
            return (
              <View key={item.id} style={[styles.failure, { borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.foreground }]}>{item.title} · {item.userId}</Text>
                <Text style={[styles.caption, { color: item.status === 'failed' ? colors.destructive : colors.mutedForeground }]}>
                  {label} · {t('pushAttempts')}: {item.attemptCount}/3
                </Text>
                <Text style={[styles.caption, { color: colors.destructive }]}>{item.error}</Text>
                {item.nextAttemptAt ? (
                  <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                    {t('pushNextRetry')}: {formatDate(item.nextAttemptAt)}
                  </Text>
                ) : null}
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{formatDate(item.createdAt)}</Text>
              </View>
            );
          }) : (
            <Text style={{ color: colors.mutedForeground }}>{failures.isLoading ? t('supportLoading') : t('pushNoFailures')}</Text>
          )}
        </View>
      </KeyboardAwareScrollViewCompat>
    </ScreenShell>
  );
}

function Chip({ colors, selected, title, onPress }: { colors: ReturnType<typeof useColors>; selected: boolean; title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.secondary }]}>
      <Text style={{ color: selected ? colors.primaryForeground : colors.secondaryForeground, fontSize: 12, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

function ActionButton({ colors, title, busy, onPress, icon, destructive = false }: {
  colors: ReturnType<typeof useColors>; title: string; busy: boolean; onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap; destructive?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress}
      style={[styles.button, { backgroundColor: destructive ? colors.destructive : colors.primary, opacity: busy ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={17} color={destructive ? colors.destructiveForeground : colors.primaryForeground} />
      <Text style={{ color: destructive ? colors.destructiveForeground : colors.primaryForeground, fontWeight: '800' }}>{busy ? '…' : title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 36, gap: 14 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 18, paddingTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  queueCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 11 },
  ticketCard: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700' },
  caption: { fontSize: 10, lineHeight: 15 },
  queue: { gap: 9, paddingVertical: 2 },
  queueItem: { width: 190, minHeight: 75, borderWidth: 1, borderRadius: 14, padding: 10, gap: 5 },
  ticketTitle: { fontSize: 13, fontWeight: '800' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 8 },
  audit: { borderTopWidth: 1, paddingTop: 10, gap: 5 },
  message: { borderWidth: 1, borderRadius: 14, padding: 11, gap: 5 },
  messageText: { fontSize: 13, lineHeight: 19 },
  input: { minHeight: 100, borderWidth: 1, borderRadius: 13, padding: 12, fontSize: 14 },
  accountInput: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 14, textAlign: 'left' },
  teamAgent: { borderTopWidth: 1, paddingTop: 10, gap: 10 },
  teamAgentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  teamAgentIdentity: { flex: 1, gap: 3 },
  removeButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  confirmBox: { borderRadius: 12, padding: 11, gap: 10 },
  confirmActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  confirmCancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  button: { minHeight: 44, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  failure: { borderTopWidth: 1, paddingTop: 9, gap: 4 },
});
