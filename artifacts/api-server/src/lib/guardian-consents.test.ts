import assert from "node:assert/strict";
import test from "node:test";
import { ageOnDate } from "./age";
import {
  GUARDIAN_CONSENT_RETENTION_DAYS,
  guardianConsentExpiresAt,
  hasValidGuardianConsentSignature,
} from "./guardian-consents";

test("age checks use the session date and handle the birthday boundary", () => {
  const beforeBirthday = new Date("2026-09-09T20:00:00.000Z");
  const onBirthday = new Date("2026-09-10T08:00:00.000Z");
  assert.equal(ageOnDate("2008-09-10", beforeBirthday), 17);
  assert.equal(ageOnDate("2008-09-10", new Date("2026-09-09T21:00:00.000Z")), 18);
  assert.equal(ageOnDate("2008-09-10", onBirthday), 18);
  assert.equal(ageOnDate("not-a-date", onBirthday), null);
  assert.equal(ageOnDate(undefined, onBirthday), null);
});

test("guardian-consent image expiry is 90 days after the visit", () => {
  const visitAt = new Date("2026-11-14T10:15:00.000Z");
  assert.equal(GUARDIAN_CONSENT_RETENTION_DAYS, 90);
  assert.equal(guardianConsentExpiresAt(visitAt).toISOString(), "2027-02-12T10:15:00.000Z");
});

test("guardian-consent uploads accept only matching image signatures", () => {
  assert.equal(hasValidGuardianConsentSignature("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff])), true);
  assert.equal(hasValidGuardianConsentSignature("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(hasValidGuardianConsentSignature("image/webp", Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), true);
  assert.equal(hasValidGuardianConsentSignature("image/png", Uint8Array.from([0xff, 0xd8, 0xff])), false);
  assert.equal(hasValidGuardianConsentSignature("application/pdf", Uint8Array.from([0x25, 0x50, 0x44, 0x46])), false);
});
