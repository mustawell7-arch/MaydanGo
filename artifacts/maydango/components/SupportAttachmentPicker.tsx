import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Text, Ionicons } from '@/components/Localized';
import { useColors } from '@/hooks/useColors';
import { translate, type MessageKey } from '@/lib/i18n';
import { supportAttachmentType, type SupportAttachmentDraft } from '@/lib/support-attachments';

const acceptedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export function SupportAttachmentPicker({
  language,
  files,
  onChange,
  onError,
}: {
  language: 'en' | 'ar' | 'ku';
  files: SupportAttachmentDraft[];
  onChange: (files: SupportAttachmentDraft[]) => void;
  onError: (message: string) => void;
}) {
  const colors = useColors();
  const t = (key: MessageKey) => translate(language, key);

  const chooseFiles = async () => {
    onError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: acceptedTypes,
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      const selected = result.assets.map(asset => {
        const contentType = supportAttachmentType(asset.name, asset.mimeType);
        const size = asset.size ?? new File(asset.uri).size;
        if (!contentType || size < 1 || size > 10 * 1024 * 1024) return null;
        return { uri: asset.uri, fileName: asset.name, contentType, size };
      });
      if (selected.some(file => file === null)) {
        onError(t('supportAttachmentInvalid'));
        return;
      }
      const additions = selected.filter((file): file is SupportAttachmentDraft => file !== null);
      const unique = additions.filter(file => !files.some(existing => existing.uri === file.uri));
      if (files.length + unique.length > 3) {
        onError(t('supportAttachmentLimit'));
        return;
      }
      onChange([...files, ...unique]);
    } catch {
      onError(t('supportAttachmentInvalid'));
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        testID="button-support-attachment-picker"
        onPress={() => void chooseFiles()}
        style={[styles.pickButton, { borderColor: colors.border, backgroundColor: colors.secondary }]}
      >
        <Ionicons name="attach-outline" size={18} color={colors.secondaryForeground} />
        <Text style={{ color: colors.secondaryForeground, fontWeight: '800' }}>{t('supportAddAttachment')}</Text>
      </Pressable>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t('supportAttachmentHint')}</Text>
      {files.map((file, index) => (
        <View key={`${file.uri}-${index}`} style={[styles.fileRow, { borderColor: colors.border }]}>
          <Ionicons name="document-attach-outline" size={17} color={colors.primary} />
          <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>{file.fileName}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('supportAttachmentRemove')}: ${file.fileName}`}
            testID={`button-remove-support-attachment-${index}`}
            onPress={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))}
            hitSlop={8}
          >
            <Ionicons name="close-circle-outline" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  pickButton: { minHeight: 42, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  hint: { fontSize: 11, lineHeight: 16 },
  fileRow: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, gap: 8, flexDirection: 'row', alignItems: 'center' },
  fileName: { flex: 1, fontSize: 12 },
});
