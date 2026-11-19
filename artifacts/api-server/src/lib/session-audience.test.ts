import { test } from "node:test";
import assert from "node:assert/strict";
import { offeringInput } from "./operation-inputs";

const startsAt = new Date(Date.now() + 2 * 86400000);
const endsAt = new Date(startsAt.getTime() + 60 * 60000);
const base = {
  partnerId: "partner",
  title: "Inclusive class",
  kind: "session" as const,
  city: "baghdad",
  facility: "Community studio",
  category: "fitness",
  accessType: "physical" as const,
  environment: "indoor" as const,
  tiers: ["M"],
  startsAt: startsAt.toISOString(),
  endsAt: endsAt.toISOString(),
  cancellationDeadline: new Date(startsAt.getTime() - 60 * 60000).toISOString(),
  capacity: 12,
  active: false,
};

test("session audience defaults to mixed and requires matching access rules", () => {
  const standard = offeringInput.parse(base);
  assert.equal(standard.sessionType, "mixed");
  assert.equal(standard.gender, "all");

  const women = offeringInput.safeParse({ ...base, sessionType: "women_only", gender: "female" });
  assert.equal(women.success, true);
  assert.equal(offeringInput.safeParse({ ...base, sessionType: "women_only", gender: "all" }).success, false);
  assert.equal(offeringInput.safeParse({ ...base, sessionType: "men_only", gender: "female" }).success, false);
});

test("children sessions require an under-18 maximum; family guidance is localized", () => {
  assert.equal(offeringInput.safeParse({
    ...base, sessionType: "children", minAge: 5, maxAge: 17,
  }).success, true);
  assert.equal(offeringInput.safeParse({
    ...base, sessionType: "children", minAge: 5, maxAge: null,
  }).success, false);
  assert.equal(offeringInput.safeParse({
    ...base,
    sessionType: "family",
    familyRequirements: { en: "Guardian consent is checked at the venue.", ar: "تُراجع موافقة ولي الأمر في المرفق.", ku: "ڕەزامەندی لە شوێنەکەدا دەپشکنرێت." },
  }).success, true);
});
