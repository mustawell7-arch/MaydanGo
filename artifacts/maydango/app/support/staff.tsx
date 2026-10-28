import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetSupportNotificationFailuresQueryKey,
  getGetSupportStaffTicketQueryKey,
  getGetSupportStaffTicketsQueryKey,
  useGetSupportNotificationFailures,
  useGetSupportStaffAgents,
  useGetSupportStaffTicket,
  useGetSupportStaffTickets,
  useReplySupportStaffTicket,
  useUpdateSupportStaffTicket,
} from '@workspace/api-client-react';
import { Text, TextInput, Pressable, Ionicons } from '@/components/Localized';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { errorCopy } from '@/lib/content';
import { translate, type MessageKey } from '@/lib/i18n';

type Status = 'open' | 'in_progress' | 'waiting_member' | 'resolved' | 'closed';
const statuses: Status[] = ['open', 'in_progress', 'waiting_member', 'resolved', 'closed'];
const statusKeys: Record<Status, MessageKey> = {
  open: 'supportStatusOpen', in_progress: 'supportStatusInProgress',
  waiting_member: 'supportStatusWaiting', resolved: 'supportStatusResolved', closed: 'supportStatusClosed',
};
const categoryKeys: Record<string, MessageKey> = {
  booking: 'categoryBooking', account: 'categoryAccount', access: 'categoryAccess',
  safety: 'categorySafety', other: 'categoryOther',
};

export default function SupportStaffScreen() {
  const colors = useColors();
  const app = useApp();
  const t = (key: MessageKey) => translate(app.language, key);
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const tickets = useGetSupportStaffTickets(undefined, { query: { enabled: app.signedIn, refetchInterval: 30_000 } });
  const agents = useGetSupportStaffAgents({ query: { enabled: app.signedIn } });
  const failures = useGetSupportNotificationFailures({ query: { enabled: app.signedIn, refetchInterval: 60_000 } });
  const detail = useGetSupportStaffTicket(selectedId, { query: { enabled: !!selectedId && app.signedIn } });
  const updateTicket = useUpdateSupportStaffTicket();
  const reply = useReplySupportStaffTicket();
  const align = app.language === 'en' ? 'left' : 'right';

  useEffect(() => {
    if (!selectedId && tickets.data?.length) setSelectedId(tickets.data[0].id);
    if (selectedId && tickets.data?.length && !tickets.data.some(ticket => ticket.id === selectedId)) {
      setSelectedId(tickets.data[0].id);
    }
  }, [tickets.data, selectedId]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetSupportStaffTicketsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetSupportNotificationFailuresQueryKey() }),
      ...(selectedId ? [queryClient.invalidateQueries({ queryKey: getGetSupportStaffTicketQueryKey(selectedId) })] : []),
    ]);
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
                onPress={() => setSelectedId(ticket.id)} style={[
                  styles.queueItem,
                  { borderColor: selectedId === ticket.id ? colors.primary : colors.border, backgroundColor: selectedId === ticket.id ? colors.secondary : colors.background },
                ]}>
                <Text style={[styles.ticketTitle, { color: colors.foreground }]} numberOfLines={2}>{ticket.subject}</Text>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t(statusKeys[ticket.status as Status])}</Text>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>{ticket.memberUserId}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {detail.data ? (
          <>
            <View style={[styles.ticketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.heading, { color: colors.foreground }]}>{detail.data.subject}</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                {t(categoryKeys[detail.data.category] ?? 'categoryOther')} · {detail.data.memberUserId} · {detail.data.language.toUpperCase()}
              </Text>
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
          <View style={styles.sectionHeader}>
            <Text style={[styles.heading, { color: colors.foreground }]}>{t('pushDeliveryFailures')}</Text>
            <Ionicons name="alert-circle-outline" size={20} color={colors.destructive} />
          </View>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t('pushDeliveryFailureHint')}</Text>
          {failures.data?.length ? failures.data.map(item => (
            <View key={item.id} style={[styles.failure, { borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.foreground }]}>{item.title} · {item.userId}</Text>
              <Text style={[styles.caption, { color: colors.destructive }]}>{item.error}</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
          )) : (
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

function ActionButton({ colors, title, busy, onPress, icon }: {
  colors: ReturnType<typeof useColors>; title: string; busy: boolean; onPress: () => void; icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress}
      style={[styles.button, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={17} color={colors.primaryForeground} />
      <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{busy ? '…' : title}</Text>
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
  button: { minHeight: 44, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  failure: { borderTopWidth: 1, paddingTop: 9, gap: 4 },
});
