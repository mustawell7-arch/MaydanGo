export type ContactTopic = "membership" | "partner" | "corporate" | "other";

export type ContactSubmission = {
  topic: ContactTopic;
  name: string;
  replyEmail: string;
  message: string;
};

export type ContactDraftLabels = {
  contactTopic: string;
  nameLabel: string;
  emailLabel: string;
  topicLabels: Record<ContactTopic, string>;
};

export function verifiedContactEmail(value: string | undefined): string {
  const email = value?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function initialContactTopic(search: string): ContactTopic {
  const topic = new URLSearchParams(search).get("topic");
  return topic === "partner" || topic === "corporate" || topic === "other" || topic === "membership"
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
  const body = [
    `${labels.contactTopic}: ${subject}`,
    `${labels.nameLabel}: ${values.name || "-"}`,
    `${labels.emailLabel}: ${values.replyEmail || "-"}`,
    "",
    values.message,
  ].join("\n");

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
