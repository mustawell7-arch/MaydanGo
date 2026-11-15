import { View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useGetPublicLegalPolicyVersion } from "@workspace/api-client-react";
import { Text, Pressable } from "@/components/Localized";
import { ScreenShell, ScreenHeader } from "@/components/ScreenShell";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useApp } from "@/contexts/AppContext";
import { useColors } from "@/hooks/useColors";
import { translate } from "@/lib/i18n";

const keys = ["terms_of_use", "privacy_policy", "booking_policy", "cancellation_policy", "refund_policy"] as const;

export default function PolicyDocumentScreen() {
  const params = useLocalSearchParams<{ policyKey?: string; version?: string }>();
  const app = useApp();
  const c = useColors();
  const policyKey = Array.isArray(params.policyKey) ? params.policyKey[0] : params.policyKey ?? "";
  const version = Array.isArray(params.version) ? params.version[0] : params.version;
  const validKey = keys.includes(policyKey as typeof keys[number]);
  const query = useGetPublicLegalPolicyVersion(
    policyKey,
    version ? { version } : undefined,
    { query: { enabled: validKey && !!version } },
  );
  const content = query.data?.translations[app.language];
  const effectiveDate = query.data?.effectiveAt
    ? new Intl.DateTimeFormat(app.language === "ku" ? "ckb-IQ" : app.language === "ar" ? "ar-IQ" : "en-IQ", { dateStyle: "long" })
      .format(new Date(query.data.effectiveAt))
    : "";

  return (
    <ScreenShell>
      <ScreenHeader eyebrow="MAYDANGO" title={content?.title ?? translate(app.language, "legalPolicyVersion")} />
      <KeyboardAwareScrollViewCompat contentContainerStyle={{ padding: 22, paddingBottom: 50, gap: 14 }}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={{ color: c.primary, fontWeight: "700" }}>← {translate(app.language, "memberConsentsTitle")}</Text>
        </Pressable>
        {query.isLoading ? (
          <Text style={{ color: c.mutedForeground }}>{translate(app.language, "legalPolicyLoading")}</Text>
        ) : !content || !query.data ? (
          <Text accessibilityRole="alert" style={{ color: c.destructive }}>{translate(app.language, "legalPolicyNotAvailable")}</Text>
        ) : (
          <View style={{ gap: 14, padding: 18, borderRadius: 18, backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }}>
            <Text style={{ color: c.mutedForeground }}>
              {translate(app.language, "legalPolicyVersion")}: {query.data.version} · {translate(app.language, "legalPolicyEffective")}: {effectiveDate}
            </Text>
            <Text style={{ color: c.foreground, fontWeight: "700", lineHeight: 24 }}>{content.introduction}</Text>
            {content.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
              <Text key={`${index}-${paragraph.slice(0, 20)}`} style={{ color: c.foreground, lineHeight: 23 }}>{paragraph}</Text>
            ))}
          </View>
        )}
      </KeyboardAwareScrollViewCompat>
    </ScreenShell>
  );
}
