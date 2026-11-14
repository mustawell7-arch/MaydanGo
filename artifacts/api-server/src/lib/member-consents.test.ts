import assert from "node:assert/strict";
import test from "node:test";
import { buildMemberConsentState, MEMBER_POLICY_VERSIONS } from "./member-consents";
import type { MemberConsentEvent } from "@workspace/db";

function event(
  id: string,
  purpose: MemberConsentEvent["purpose"],
  policyVersion: string,
  choice: MemberConsentEvent["choice"],
  recordedAt: string,
): MemberConsentEvent {
  return {
    id,
    userId: "member-test",
    purpose,
    policyVersion,
    choice,
    recordedAt: new Date(recordedAt),
  };
}

test("consent status requires current versions of both required policies", () => {
  const state = buildMemberConsentState([
    event("marketing", "marketing", MEMBER_POLICY_VERSIONS.marketing, "declined", "2026-11-14T12:00:00.000Z"),
    event("privacy", "privacy_policy", MEMBER_POLICY_VERSIONS.privacy_policy, "accepted", "2026-11-14T11:00:00.000Z"),
    event("terms", "terms_of_use", MEMBER_POLICY_VERSIONS.terms_of_use, "accepted", "2026-11-14T10:00:00.000Z"),
  ]);

  assert.equal(state.requiredAccepted, true);
  assert.equal(state.currentChoices.termsOfUse, "accepted");
  assert.equal(state.currentChoices.privacyPolicy, "accepted");
  assert.equal(state.currentChoices.marketing, "declined");
  assert.equal(state.history[0].recordedAt, "2026-11-14T12:00:00.000Z");
});

test("an older privacy-policy version does not count as current consent", () => {
  const state = buildMemberConsentState([
    event("privacy-old", "privacy_policy", "previous-version", "accepted", "2026-11-14T11:00:00.000Z"),
    event("terms", "terms_of_use", MEMBER_POLICY_VERSIONS.terms_of_use, "accepted", "2026-11-14T10:00:00.000Z"),
  ]);

  assert.equal(state.currentChoices.privacyPolicy, null);
  assert.equal(state.requiredAccepted, false);
});

test("the newest choice is used while earlier history remains available", () => {
  const state = buildMemberConsentState([
    event("marketing-off", "marketing", MEMBER_POLICY_VERSIONS.marketing, "declined", "2026-11-14T12:00:00.000Z"),
    event("marketing-on", "marketing", MEMBER_POLICY_VERSIONS.marketing, "accepted", "2026-11-14T11:00:00.000Z"),
  ]);

  assert.equal(state.currentChoices.marketing, "declined");
  assert.equal(state.history.length, 2);
});
