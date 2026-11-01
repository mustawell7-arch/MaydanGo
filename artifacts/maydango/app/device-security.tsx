import React from "react";
import { StyleSheet, View } from "react-native";
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

export default function DeviceSecurityScreen() {
  const colors = useColors();
  const app = useApp();
  const device = useDeviceSecurity();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.language, key);
  const pendingChange = device.status?.status === "primary" && !!device.status.pendingActivationAt;
  const activation = device.status?.pendingActivationAt ?? null;

  return (
    <ScreenShell>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="chevron-back" size={17} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("back")}</Text>
      </Pressable>
      <ScreenHeader eyebrow={t("settings")} title={t("deviceSecurity")} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="shield-checkmark-outline" size={26} color={colors.primary} />
        <Text style={[styles.heading, { color: colors.foreground }]}>
          {device.status?.status === "primary" ? t("devicePrimaryTitle") : t("deviceSecurityChecking")}
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          {device.status?.status === "primary" ? t("devicePrimaryText") : t("deviceSecurityIntro")}
        </Text>
        {device.loading ? <Text style={{ color: colors.mutedForeground }}>{t("deviceSecurityChecking")}</Text> : null}
        {device.error ? (
          <Text accessibilityRole="alert" style={{ color: colors.destructive, textAlign: "center" }}>
            {t("deviceSecurityUnavailable")}
          </Text>
        ) : null}
        {pendingChange && activation ? (
          <View style={[styles.pending, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.body, { color: colors.foreground }]}>
              {t("deviceChangeScheduled").replace("{time}", formatIraqTime(activation, app.language))}
            </Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{t("deviceChangeHelp")}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={device.busy}
              onPress={() => void device.cancelPendingChange()}
              style={[styles.button, { backgroundColor: colors.destructive, opacity: device.busy ? 0.6 : 1 }]}
            >
              <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>
                {device.busy ? "…" : t("deviceCancelChange")}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{t("deviceNoChange")}</Text>
        )}
        {device.notice === "cancelled" ? (
          <Text accessibilityRole="alert" style={{ color: colors.primary, textAlign: "center" }}>{t("deviceCancelSuccess")}</Text>
        ) : null}
        {device.notice === "no_change" ? (
          <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, textAlign: "center" }}>{t("deviceNoChange")}</Text>
        ) : null}
        <Pressable accessibilityRole="button" disabled={device.loading} onPress={() => void device.refresh()}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("tryAgain")}</Text>
        </Pressable>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 18, paddingTop: 6 },
  card: { margin: 18, padding: 18, borderWidth: 1, borderRadius: 18, gap: 13, alignItems: "center" },
  heading: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  body: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  pending: { width: "100%", padding: 14, borderRadius: 14, gap: 12, alignItems: "center" },
  button: { minHeight: 44, borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
});
