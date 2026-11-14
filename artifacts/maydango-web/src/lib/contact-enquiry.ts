export type ContactTopic = "membership" | "partner" | "instructor" | "corporate" | "other";

export type ContactSubmission = {
  topic: ContactTopic;
  name: string;
  replyEmail: string;
  message: string;
  partnerOrganization?: string;
  partnerCity?: string;
  partnerServices?: string;
};

export type ContactDraftLabels = {
  contactTopic: string;
  nameLabel: string;
  emailLabel: string;
  topicLabels: Record<ContactTopic, string>;
  partnerOrganizationLabel?: string;
  partnerCityLabel?: string;
  partnerServicesLabel?: string;
};

export function verifiedContactEmail(value: string | undefined): string {
  const email = value?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function initialContactTopic(search: string): ContactTopic {
  const topic = new URLSearchParams(search).get("topic");
  return topic === "partner" || topic === "instructor" || topic === "corporate" || topic === "other" || topic === "membership"
    ? topic
    : "membership";
}

export function createContactEmailDraft(
  recipient: string,
  values: ContactSubmission,
  labels: ContactDraftLabels,
): string | null {
  const email = verifiedContactEmail(recipient);
  if (!email) return null;

  const subject = labels.topicLabels[values.topic] ?? labels.topicLabels.other;
  const partnerDetails = [
    values.partnerOrganization?.trim() && labels.partnerOrganizationLabel
      ? `${labels.partnerOrganizationLabel}: ${values.partnerOrganization.trim()}`
      : "",
    values.partnerCity?.trim() && labels.partnerCityLabel
      ? `${labels.partnerCityLabel}: ${values.partnerCity.trim()}`
      : "",
    values.partnerServices?.trim() && labels.partnerServicesLabel
      ? `${labels.partnerServicesLabel}: ${values.partnerServices.trim()}`
      : "",
  ].filter(Boolean);
  const body = [
    `${labels.contactTopic}: ${subject}`,
    `${labels.nameLabel}: ${values.name || "-"}`,
    `${labels.emailLabel}: ${values.replyEmail || "-"}`,
    ...partnerDetails,
    "",
    values.message,
  ].join("\n");

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
