import React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useGetFacilityQualityControl } from '@workspace/api-client-react';
import { Ionicons, Pressable, Text } from '@/components/Localized';
import { useApp } from '@/contexts/AppContext';
import { useColors } from '@/hooks/useColors';
import { translate } from '@/lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type DocumentType = 'licence' | 'insurance';

function formatDate(value: string, language: string) {
  const locale = language === 'ku' ? 'ckb-IQ' : language === 'ar' ? 'ar-IQ' : 'en-IQ';
  const date = new Date(`${value}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'Asia/Baghdad',
  }).format(date);
}

export default function PartnerQualityDocumentScreen() {
  const colors = useColors();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    facilityId?: string;
    documentType?: string;
    expiresOn?: string;
    phase?: string;
  }>();
  const facilityId = typeof params.facilityId === 'string' ? params.facilityId : '';
  const documentType: DocumentType | null =
    params.documentType === 'licence' || params.documentType === 'insurance'
      ? params.documentType
      : null;
  const expiresOn = typeof params.expiresOn === 'string' ? params.expiresOn : '';
  const query = useGetFacilityQualityControl({
    query: { enabled: Boolean(facilityId && documentType), refetchOnMount: 'always', retry: false },
  });
  const facility = query.data?.facilities.find(item => item.id === facilityId);
  const alert = query.data?.expiringDocuments.find(item =>
    item.facilityId === facilityId && item.documentType === documentType,
  );
  const approvedDocument = query.data?.complianceDocuments.find(item =>
    item.facilityId === facilityId
    && item.documentType === documentType
    && item.status === 'approved',
  );
  const assessment = query.data?.assessments.find(item => item.facilityId === facilityId);
  const assessmentExpiry = documentType === 'licence'
    ? assessment?.licenceExpiresOn
    : assessment?.insuranceExpiresOn;
  const currentExpiry = alert?.expiresOn ?? approvedDocument?.expiresOn ?? assessmentExpiry ?? null;
  const reminderIsCurrent = Boolean(alert && alert.expiresOn === expiresOn);
  const typeLabel = documentType === 'licence'
    ? translate(app.language, 'partnerExpiryLicence')
    : translate(app.language, 'partnerExpiryInsurance');
  const phaseLabel = alert
    ? alert.daysRemaining < 0
      ? translate(app.language, 'partnerExpiryOverdue')
      : translate(app.language, 'partnerExpiryDueSoon')
    : params.phase === 'overdue'
      ? translate(app.language, 'partnerExpiryOverdue')
      : translate(app.language, 'partnerExpiryDueSoon');

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 14),
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20),
        },
      ]}
    >
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={translate(app.language, 'back')}
        testID="quality-record-back"
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={19} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: '700' }}>
          {translate(app.language, 'back')}
        </Text>
      </Pressable>
      <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
          <Ionicons name="document-text-outline" size={23} color={colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {translate(app.language, 'partnerExpiryRecordTitle')}
          </Text>
          <Text style={{ color: colors.mutedForeground, lineHeight: 21 }}>
            {typeLabel}
          </Text>
        </View>
        <View style={[styles.status, { backgroundColor: colors.muted }]}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: '700' }}>
            {phaseLabel}
          </Text>
        </View>
      </View>

      {query.isLoading && (
        <Text style={{ color: colors.mutedForeground }} testID="quality-record-loading">
          {translate(app.language, 'partnerExpiryLoading')}
        </Text>
      )}
      {query.isError && (
        <Text style={{ color: colors.destructive }} accessibilityRole="alert" testID="quality-record-error">
          {translate(app.language, 'partnerExpiryLoadError')}
        </Text>
      )}
      {(!facilityId || !documentType || (query.data && !facility)) && (
        <Text style={{ color: colors.mutedForeground }} testID="quality-record-missing">
          {translate(app.language, 'partnerExpiryFacilityMissing')}
        </Text>
      )}
      {facility && (
        <View style={[styles.detailsCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.facilityName, { color: colors.foreground }]}>{facility.facility}</Text>
          <Text style={{ color: colors.mutedForeground }}>{facility.city}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <DetailRow
            label={translate(app.language, 'partnerExpiryPartner')}
            value={facility.partnerName}
            foreground={colors.foreground}
            muted={colors.mutedForeground}
          />
          <DetailRow
            label={translate(app.language, 'partnerExpiryDocument')}
            value={typeLabel}
            foreground={colors.foreground}
            muted={colors.mutedForeground}
          />
          <DetailRow
            label={translate(app.language, 'partnerExpiryExpiresOn')}
            value={currentExpiry ? formatDate(currentExpiry, app.language) : '—'}
            foreground={colors.foreground}
            muted={colors.mutedForeground}
          />
          {!reminderIsCurrent && (
            <Text style={{ color: colors.mutedForeground, lineHeight: 21 }} testID="quality-record-updated">
              {translate(app.language, 'partnerExpiryUpdated')}
            </Text>
          )}
          {approvedDocument?.documentName && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>
              {approvedDocument.documentName}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function DetailRow({
  label,
  value,
  foreground,
  muted,
}: {
  label: string;
  value: string;
  foreground: string;
  muted: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={{ color: muted, flex: 1 }}>{label}</Text>
      <Text style={{ color: foreground, flex: 1, fontWeight: '600', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 16, paddingHorizontal: 20 },
  backButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 9, minHeight: 44 },
  header: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 16 },
  iconWrap: { alignItems: 'center', borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  headerCopy: { flex: 1, gap: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  status: { borderRadius: 20, maxWidth: 115, paddingHorizontal: 10, paddingVertical: 7 },
  detailsCard: { borderRadius: 20, borderWidth: 1, gap: 13, padding: 18 },
  facilityName: { fontSize: 19, fontWeight: '700' },
  divider: { height: 1, marginVertical: 2 },
  detailRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
});
