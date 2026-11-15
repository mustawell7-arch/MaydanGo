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

export type ContactEmailDraftDetails = {
  recipient: string;
  subject: string;
  body: string;
  href: string;
};

type ClipboardWriter = {
  writeText: (text: string) => Promise<void>;
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

export function createContactEmailDraftDetails(
  recipient: string,
  values: ContactSubmission,
  labels: ContactDraftLabels,
): ContactEmailDraftDetails | null {
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

  return {
    recipient: email,
    subject,
    body,
    href: `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}

export function createContactEmailCopyText(
  draft: ContactEmailDraftDetails,
  labels: { recipientLabel: string; subjectLabel: string },
): string {
  return `${labels.recipientLabel}: ${draft.recipient}\n${labels.subjectLabel}: ${draft.subject}\n\n${draft.body}`;
}

export async function copyContactText(
  text: string,
  clipboard: ClipboardWriter | undefined,
): Promise<boolean> {
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function createContactEmailDraft(
  recipient: string,
  values: ContactSubmission,
  labels: ContactDraftLabels,
): string | null {
  return createContactEmailDraftDetails(recipient, values, labels)?.href ?? null;
}
