import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMemberSupportTicketAttachmentsQueryKey,
  getGetMemberSupportTicketQueryKey,
  getGetMemberSupportTicketsQueryKey,
  useGetMemberSupportTicket,
  useGetMemberSupportTicketAttachments,
  useReplyMemberSupportTicket,
} from '@workspace/api-client-react';
import { Text, TextInput, Pressable, Ionicons } from '@/components/Localized';
import { ScreenHeader, ScreenShell } from '@/components/ScreenShell';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { errorCopy } from '@/lib/content';
import { translate, type MessageKey } from '@/lib/i18n';
import { SupportAttachmentPicker } from '@/components/SupportAttachmentPicker';
import { shareSupportAttachment, uploadSupportAttachments, type SupportAttachmentDraft } from '@/lib/support-attachments';

type Status = 'open' | 'in_progress' | 'waiting_member' | 'resolved' | 'closed';
const statusKeys: Record<Status, MessageKey> = {
  open: 'supportStatusOpen', in_progress: 'supportStatusInProgress',
  waiting_member: 'supportStatusWaiting', resolved: 'supportStatusResolved', closed: 'supportStatusClosed',
};

export default function SupportTicketScreen() {
  const colors = useColors();
  const app = useApp();
  const t = (key: MessageKey) => translate(app.language, key);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id ?? '');
  const align = app.language === 'en' ? 'left' : 'right';
  const [message, setMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<SupportAttachmentDraft[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const ticket = useGetMemberSupportTicket(id, { query: { enabled: !!id && app.signedIn } });
  const attachments = useGetMemberSupportTicketAttachments(id, {
    query: { enabled: !!id && app.signedIn, queryKey: getGetMemberSupportTicketAttachmentsQueryKey(id), refetchInterval: 20_000 },
  });
  const reply = useReplyMemberSupportTicket();

  const openAttachment = async (attachment: NonNullable<typeof attachments.data>[number]) => {
    setDownloadingAttachmentId(attachment.id);
    setNotice(null);
    try {
      await shareSupportAttachment(id, attachment.id, attachment.fileName, attachment.contentType);
    } catch {
      setNotice(t('supportAttachmentDownloadFailed'));
    } finally {
      setDownloadingAttachmentId('');
    }
  };

  const sendReply = async () => {
    if (!message.trim()) return;
    setNotice(null);
    try {
      const updated = await reply.mutateAsync({ id, data: { message: message.trim(), language: app.language } });
      let attachmentFailed = false;
      const lastMessage = updated.messages[updated.messages.length - 1];
      if (selectedFiles.length && lastMessage?.id) {
        setAttachmentBusy(true);
        try {
          await uploadSupportAttachments(id, lastMessage.id, selectedFiles);
        } catch {
          attachmentFailed = true;
        } finally {
          setAttachmentBusy(false);
        }
      }
      setMessage('');
      setSelectedFiles([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMemberSupportTicketQueryKey(id) }),
        queryClient.invalidateQueries({ queryKey: getGetMemberSupportTicketsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetMemberSupportTicketAttachmentsQueryKey(id) }),
      ]);
      if (attachmentFailed) setNotice(t('supportAttachmentFailed'));
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
      <ScreenHeader eyebrow={t('supportCenter')} title={ticket.data?.subject ?? t('mySupportTickets')} />
      {!app.signedIn ? (
        <View style={styles.center}>
          <Text style={{ color: colors.mutedForeground }}>{t('supportSignIn')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={[styles.send, { backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{t('supportSignIn')}</Text>
          </Pressable>
        </View>
      ) : ticket.isLoading ? (
        <View style={styles.center}><Text style={{ color: colors.mutedForeground }}>{t('supportLoading')}</Text></View>
      ) : ticket.error || !ticket.data ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{t('supportLoadError')}</Text>
          <Pressable accessibilityRole="button" onPress={() => void ticket.refetch()}><Text style={{ color: colors.primary }}>{t('tryAgain')}</Text></Pressable>
        </View>
      ) : (
        <>
          <View style={styles.statusRow}>
            <View style={[styles.status, { backgroundColor: colors.secondary }]}>
              <Text style={{ color: colors.secondaryForeground, fontWeight: '700', fontSize: 12 }}>
                {t(statusKeys[ticket.data.status as Status])}
              </Text>
            </View>
            <Text style={[styles.caption, { color: colors.mutedForeground }]}>{ticket.data.category}</Text>
          </View>
          <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={0}>
            <ScrollView contentContainerStyle={styles.messages} keyboardDismissMode="interactive">
              {ticket.data.messages.map(item => {
                const mine = item.authorRole === 'member';
                const messageAttachments = attachments.data?.filter(file => file.messageId === item.id) ?? [];
                return (
                  <View key={item.id} style={[
                    styles.bubble,
                    { backgroundColor: mine ? colors.primary : colors.card, alignSelf: mine ? 'flex-end' : 'flex-start' },
                  ]}>
                    <Text style={[styles.message, { color: mine ? colors.primaryForeground : colors.foreground, textAlign: align }]}>
                      {item.message}
                    </Text>
                    <Text style={[styles.caption, { color: mine ? colors.primaryForeground : colors.mutedForeground, opacity: 0.8 }]}>
                      {mine ? t('supportYou') : 'MaydanGO'} · {new Date(item.createdAt).toLocaleString()}
                    </Text>
                    {messageAttachments.map(file => (
                      <Pressable key={file.id} accessibilityRole="button" accessibilityLabel={`${t('supportAttachmentOpen')}: ${file.fileName}`}
                        testID={`button-open-support-attachment-${file.id}`} disabled={downloadingAttachmentId === file.id}
                        onPress={() => void openAttachment(file)} style={[styles.attachmentRow, { opacity: downloadingAttachmentId === file.id ? 0.55 : 1 }]}>
                        <Ionicons name="document-attach-outline" size={15} color={mine ? colors.primaryForeground : colors.primary} />
                        <Text numberOfLines={1} style={[styles.attachmentName, { color: mine ? colors.primaryForeground : colors.foreground }]}>{file.fileName}</Text>
                        <Ionicons name="download-outline" size={15} color={mine ? colors.primaryForeground : colors.primary} />
                      </Pressable>
                    ))}
                  </View>
                );
              })}
              {notice ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{notice}</Text> : null}
            </ScrollView>
            <View style={[styles.composer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
              <SupportAttachmentPicker language={app.language} files={selectedFiles} onChange={setSelectedFiles} onError={setNotice} />
              <View style={styles.replyRow}>
                <TextInput
                  accessibilityLabel={t('supportReply')}
                  value={message}
                  onChangeText={setMessage}
                  placeholder={t('supportReply')}
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  maxLength={5000}
                  textAlignVertical="center"
                  style={[styles.input, { color: colors.foreground, borderColor: colors.input, backgroundColor: colors.card, textAlign: align }]}
                />
                <Pressable accessibilityRole="button" accessibilityLabel={t('supportSendReply')} disabled={!message.trim() || reply.isPending || attachmentBusy}
                  onPress={() => void sendReply()} style={[styles.send, { backgroundColor: colors.primary, opacity: !message.trim() || reply.isPending || attachmentBusy ? 0.55 : 1 }]}>
                  <Ionicons name="send" size={18} color={colors.primaryForeground} />
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 20, paddingTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 10 },
  status: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  caption: { fontSize: 10, lineHeight: 15 },
  messages: { padding: 18, gap: 12, flexGrow: 1, justifyContent: 'flex-end' },
  bubble: { maxWidth: '88%', borderRadius: 17, padding: 13, gap: 6 },
  message: { fontSize: 14, lineHeight: 20 },
  composer: { gap: 10, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12 },
  replyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  attachmentName: { flexShrink: 1, fontSize: 11 },
  input: { flex: 1, minHeight: 45, maxHeight: 120, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10, fontSize: 14 },
  send: { minWidth: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
});
