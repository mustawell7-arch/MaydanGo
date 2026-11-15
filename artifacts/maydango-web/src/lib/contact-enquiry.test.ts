import assert from "node:assert/strict";
import test from "node:test";
import {
  copyContactText,
  createContactEmailCopyText,
  createContactEmailDraft,
  createContactEmailDraftDetails,
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
    instructor: "Instructor enquiry",
    corporate: "Organisation enquiry",
    other: "Other",
  },
  partnerOrganizationLabel: "Organisation",
  partnerCityLabel: "City or governorate",
  partnerServicesLabel: "Services",
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
  assert.equal(createContactEmailDraftDetails("", submission, labels), null);
});

test("partner, instructor, and corporate links preselect their matching enquiry topics", () => {
  assert.equal(initialContactTopic("?topic=partner"), "partner");
  assert.equal(initialContactTopic("?topic=instructor"), "instructor");
  assert.equal(initialContactTopic("?topic=corporate"), "corporate");
  assert.equal(initialContactTopic("?topic=other"), "other");
  assert.equal(initialContactTopic(""), "membership");
  assert.equal(initialContactTopic("?topic=unexpected"), "membership");
});

test("email drafts use the configured inbox and include submitted details for every enquiry topic", () => {
  for (const topic of ["membership", "partner", "instructor", "corporate", "other"] as const) {
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

test("partner email drafts include supplied facility details", () => {
  const draft = createContactEmailDraft("maydangoing@gmail.com", {
    ...submission,
    topic: "partner",
    partnerOrganization: "MaydanGo Demo Gym",
    partnerCity: "Erbil",
    partnerServices: "Fitness and pool",
  }, labels);
  assert.ok(draft);
  const parsed = new URL(draft);
  assert.equal(parsed.searchParams.get("body"), "Enquiry topic: Partner enquiry\nName: Samira Hassan\nReply email: samira@example.com\nOrganisation: MaydanGo Demo Gym\nCity or governorate: Erbil\nServices: Fitness and pool\n\nPlease tell me about upcoming classes.");
});

test("copy-ready enquiries include the recipient, subject, and complete partner message", () => {
  const draft = createContactEmailDraftDetails("maydangoing@gmail.com", {
    ...submission,
    topic: "partner",
    partnerOrganization: "MaydanGo Demo Gym",
    partnerCity: "Erbil",
    partnerServices: "Fitness and pool",
  }, labels);

  assert.ok(draft);
  assert.equal(draft.recipient, "maydangoing@gmail.com");
  assert.equal(draft.subject, "Partner enquiry");
  assert.equal(
    createContactEmailCopyText(draft, { recipientLabel: "To", subjectLabel: "Subject" }),
    "To: maydangoing@gmail.com\nSubject: Partner enquiry\n\nEnquiry topic: Partner enquiry\nName: Samira Hassan\nReply email: samira@example.com\nOrganisation: MaydanGo Demo Gym\nCity or governorate: Erbil\nServices: Fitness and pool\n\nPlease tell me about upcoming classes.",
  );
});

test("copying reports unavailable browsers and clipboard failures without losing the draft", async () => {
  const draftText = "To: maydangoing@gmail.com\nSubject: Membership\n\nPlease contact me.";
  let copiedText = "";

  assert.equal(await copyContactText(draftText, undefined), false);
  assert.equal(await copyContactText(draftText, {
    writeText: async (text) => { copiedText = text; },
  }), true);
  assert.equal(copiedText, draftText);
  assert.equal(await copyContactText(draftText, {
    writeText: async () => { throw new Error("permission denied"); },
  }), false);
});
