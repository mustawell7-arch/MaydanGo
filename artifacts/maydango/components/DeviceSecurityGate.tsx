import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Text, Pressable, Ionicons } from "@/components/Localized";
import { ScreenHeader, ScreenShell } from "@/components/ScreenShell";
import { useApp } from "@/contexts/AppContext";
import { useDeviceSecurity } from "@/contexts/DeviceSecurityContext";
import { useColors } from "@/hooks/useColors";
import { translate } from "@/lib/i18n";

function formatIraqTime(value: string | Date | null, language: string) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(language === "ku" ? "ckb-IQ" : language === "ar" ? "ar-IQ" : "en-IQ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Baghdad",
  }).format(date);
}

export function DeviceSecurityGate() {
  const colors = useColors();
  const app = useApp();
  const device = useDeviceSecurity();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const pending = device.status?.status === "pending";
  const title = device.loading ? t("deviceSecurityChecking")
    : pending ? t("devicePendingTitle")
      : device.status?.status === "revoked" ? t("deviceRevokedTitle")
        : t("deviceSecurity");
  const body = pending ? t("devicePendingText")
    : device.status?.status === "revoked" ? t("deviceRevokedText")
      : t("deviceSecurityUnavailable");
  const activation = device.status?.pendingActivationAt;

  return (
    <ScreenShell>
      <ScreenHeader eyebrow={t("deviceSecurity")} title={title} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {device.loading ? <ActivityIndicator color={colors.primary} size="large" /> : (
          <Ionicons
            name={pending ? "time-outline" : device.error ? "cloud-offline-outline" : "shield-checkmark-outline"}
            size={28}
            color={pending ? colors.primary : device.error ? colors.destructive : colors.primary}
          />
        )}
        <Text style={[styles.body, { color: colors.foreground }]}>{body}</Text>
        {pending && activation ? (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            {t("devicePendingUntil").replace("{time}", formatIraqTime(activation, app.language))}
          </Text>
        ) : null}
        {pending ? <Text style={[styles.caption, { color: colors.mutedForeground }]}>{t("deviceChangeHelp")}</Text> : null}
        {device.error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{t("deviceSecurityUnavailable")}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={device.loading}
          onPress={() => void device.refresh()}
          style={[styles.button, { backgroundColor: colors.primary, opacity: device.loading ? 0.6 : 1 }]}
        >
          <Ionicons name="refresh" size={17} color={colors.primaryForeground} />
          <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{t("tryAgain")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/support")}>
          <Text style={{ color: colors.primary, fontWeight: "700", textAlign: "center" }}>{t("help")}</Text>
        </Pressable>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { margin: 18, padding: 20, borderWidth: 1, borderRadius: 18, gap: 14, alignItems: "center" },
  body: { fontSize: 15, lineHeight: 23, textAlign: "center" },
  caption: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  error: { textAlign: "center", fontSize: 13 },
  button: { width: "100%", minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
});
