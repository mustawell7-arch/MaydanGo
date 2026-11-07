import assert from "node:assert/strict";
import test from "node:test";
import {
  createContactEmailDraft,
  initialContactTopic,
  verifiedContactEmail,
  type ContactDraftLabels,
  type ContactSubmission,
} from "./contact-enquiry";

const labels: ContactDraftLabels = {
  contactTopic: "Enquiry topic",
  nameLabel: "Name",
  emailLabel: "Reply email",
  topicLabels: {
    membership: "Membership availability",
    partner: "Partner enquiry",
    corporate: "Organisation enquiry",
    other: "Other",
  },
};

const submission: ContactSubmission = {
  topic: "membership",
  name: "Samira Hassan",
  replyEmail: "samira@example.com",
  message: "Please tell me about upcoming classes.",
};

test("only a valid configured inbox is enabled", () => {
  assert.equal(verifiedContactEmail("maydangoing@gmail.com"), "maydangoing@gmail.com");
  assert.equal(verifiedContactEmail(undefined), "");
  assert.equal(verifiedContactEmail("not-an-email"), "");
  assert.equal(verifiedContactEmail("   "), "");
  assert.equal(createContactEmailDraft("", submission, labels), null);
});

test("partner and corporate links preselect their matching enquiry topics", () => {
  assert.equal(initialContactTopic("?topic=partner"), "partner");
  assert.equal(initialContactTopic("?topic=corporate"), "corporate");
  assert.equal(initialContactTopic("?topic=other"), "other");
  assert.equal(initialContactTopic(""), "membership");
  assert.equal(initialContactTopic("?topic=unexpected"), "membership");
});

test("email drafts use the configured inbox and include submitted details for every enquiry topic", () => {
  for (const topic of ["membership", "partner", "corporate", "other"] as const) {
    const draft = createContactEmailDraft("maydangoing@gmail.com", { ...submission, topic }, labels);
    assert.ok(draft);
    const parsed = new URL(draft);
    assert.equal(parsed.protocol, "mailto:");
    assert.equal(parsed.pathname, "maydangoing@gmail.com");
    assert.equal(parsed.searchParams.get("subject"), labels.topicLabels[topic]);

    const body = parsed.searchParams.get("body") ?? "";
    assert.match(body, new RegExp(`Enquiry topic: ${labels.topicLabels[topic]}`));
    assert.match(body, /Name: Samira Hassan/);
    assert.match(body, /Reply email: samira@example\.com/);
    assert.match(body, /Please tell me about upcoming classes\./);
  }
});

test("email draft encoding preserves punctuation and line breaks", () => {
  const draft = createContactEmailDraft(
    "maydangoing@gmail.com",
    { ...submission, topic: "partner", message: "First line & details?\nSecond line." },
    labels,
  );
  assert.ok(draft);
  const parsed = new URL(draft);
  assert.equal(parsed.searchParams.get("body"), "Enquiry topic: Partner enquiry\nName: Samira Hassan\nReply email: samira@example.com\n\nFirst line & details?\nSecond line.");
});
