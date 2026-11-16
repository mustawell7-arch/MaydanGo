import { ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Text, Pressable } from "@/components/Localized";
import { ScreenShell } from "@/components/ScreenShell";
import { useColors } from "@/hooks/useColors";

const draftVersion = "draft-0.1";

const sections = [
  {
    title: "1. About this draft",
    paragraphs: [
      "This is an English working draft for discussion. It is not an approved agreement, is not active, and must not be treated as an acceptance request. It does not replace any current published terms or privacy notice, change membership access, or alter consent records.",
      "Maydango and qualified Iraqi legal counsel must review the final wording and commercial details before this document can be approved or used.",
    ],
  },
  {
    title: "2. The Maydango membership",
    paragraphs: [
      "Maydango is intended to help members discover and use participating gyms, sports clubs, swimming pools, events, online sports classes, recorded training, and online coaching through one account and membership.",
      "Available activities depend on the published membership plan, location, partner participation, capacity, and the details shown for each offering. Not every service is available in every city or at every time.",
    ],
  },
  {
    title: "3. Access, bookings, and attendance",
    paragraphs: [
      "Some activities may be open access; others may require a reservation or partner approval. Members should review the activity details and access requirements before making a booking.",
      "A reservation and an attendance record are separate. A booking alone does not confirm that a visit took place. The app’s check-in process and any required partner confirmation determine whether attendance is recorded.",
      "Eligibility, visit allowances, facility rules, and availability may differ by plan and activity. Final rules will be described in the approved agreement and relevant offering details.",
    ],
  },
  {
    title: "4. Age and guardian consent",
    paragraphs: [
      "The intended minimum age for membership is 18. A person under 18 may participate only with parent or legal-guardian consent, verified by the participating partner at the venue.",
      "Maydango does not collect guardian details through this draft process. The final age and consent procedure requires review before it is put into effect.",
    ],
  },
  {
    title: "5. Respectful and safe participation",
    paragraphs: [
      "Members are expected to respect other members, partner staff, instructors, facility rules, and the access requirements shown for an activity. Members should not share account access or use another person’s membership.",
      "Follow the partner’s safety instructions and ask staff for help if an activity or facility condition appears unsafe. Members should consider their own circumstances and seek appropriate professional advice when needed before taking part in physical activity.",
    ],
  },
  {
    title: "6. Account care and support",
    paragraphs: [
      "Members should keep their sign-in details private and contact Maydango if they believe their account has been accessed without permission.",
      "For general enquiries, contact maydangoing@gmail.com. Formal notices and additional support procedures remain to be confirmed.",
    ],
  },
];

const itemsToConfirm = [
  "The registered legal operator name and formal contact details.",
  "Membership prices, billing, renewal, pause, and cancellation terms.",
  "Refunds, credits, taxes, and other charges.",
  "Liability, complaints, dispute handling, and governing-law wording.",
  "The final review, approval, publication, and member-acceptance process.",
];

const textStyle = { writingDirection: "ltr" as const, textAlign: "left" as const };

export default function MembershipTermsDraftScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ version?: string }>();
  const requestedVersion = Array.isArray(params.version) ? params.version[0] : params.version;
  const isAvailable = requestedVersion === undefined || requestedVersion === draftVersion;

  return (
    <ScreenShell sample={false}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.backText, { color: colors.foreground }, textStyle]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }, textStyle]}>Membership terms draft</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!isAvailable ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }, textStyle]}>Draft version not available</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }, textStyle]}>The requested membership terms draft version is not available.</Text>
          </View>
        ) : (
          <>
            <View style={styles.notice}>
              <Text style={[styles.noticeText, textStyle]}>
                Working draft — not active and not for acceptance. This page is general information, not legal advice. It requires review by the Maydango owner and qualified Iraqi legal counsel. Arabic and Kurdish translations are deferred to the final language review.
              </Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.eyebrow, { color: colors.primary }, textStyle]}>Version: {draftVersion} · Status: Draft for review</Text>
              <Text style={[styles.title, { color: colors.foreground }, textStyle]}>Maydango Membership Terms</Text>
              <Text style={[styles.body, { color: colors.mutedForeground }, textStyle]}>
                A proposed outline of the membership relationship. No member acceptance is collected, and this draft does not activate service or commercial terms.
              </Text>
              {sections.map(section => (
                <View key={section.title} style={[styles.section, { borderTopColor: colors.border }]}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }, textStyle]}>{section.title}</Text>
                  {section.paragraphs.map(paragraph => (
                    <Text key={paragraph} style={[styles.body, { color: colors.mutedForeground }, textStyle]}>{paragraph}</Text>
                  ))}
                </View>
              ))}
              <View style={[styles.section, { borderTopColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }, textStyle]}>7. Items still requiring approval</Text>
                <Text style={[styles.body, { color: colors.mutedForeground }, textStyle]}>The following matters are deliberately left open. No term is implied while it remains unconfirmed.</Text>
                {itemsToConfirm.map(item => (
                  <Text key={item} style={[styles.body, { color: colors.mutedForeground }, textStyle]}>• {item}</Text>
                ))}
              </View>
              <View style={[styles.finalNotice, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.body, { color: colors.foreground }, textStyle]}>
                  This document is not a published policy and is not part of the current Terms of Use acceptance flow. It must not be used to approve bookings, collect payment, or change member rights.
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 22, paddingBottom: 14 },
  backButton: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  backText: { fontSize: 13, fontWeight: "700" },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "800" },
  headerSpacer: { width: 28 },
  content: { paddingHorizontal: 20, paddingBottom: 36, gap: 14 },
  notice: { backgroundColor: "#fff8e7", borderColor: "#e5c78a", borderWidth: 1, borderRadius: 12, padding: 14 },
  noticeText: { color: "#6e4b13", fontSize: 13, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 },
  eyebrow: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", lineHeight: 17 },
  title: { fontSize: 24, fontWeight: "800", lineHeight: 31 },
  body: { fontSize: 14, lineHeight: 22 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "800", lineHeight: 24 },
  finalNotice: { borderRadius: 12, padding: 13 },
});
