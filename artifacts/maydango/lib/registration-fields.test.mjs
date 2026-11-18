import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBirthDate, normalizeInternationalPhoneNumber } from './registration-fields.ts';

test('normalizes formatted international phone numbers', () => {
  assert.equal(normalizeInternationalPhoneNumber('+964 770 000 0000'), '+9647700000000');
  assert.equal(normalizeInternationalPhoneNumber('+44 (20) 7946-0958'), '+442079460958');
});

test('normalizes Arabic-Indic and Eastern Arabic digits', () => {
  assert.equal(normalizeInternationalPhoneNumber('+٩٦٤ ٧٧٠ ٠٠٠ ٠٠٠٠'), '+9647700000000');
  assert.equal(normalizeInternationalPhoneNumber('+۹۶۴ ۷۷۰ ۰۰۰ ۰۰۰۰'), '+9647700000000');
  assert.equal(normalizeBirthDate('١٩٩٠-٠٢-٢٨'), '1990-02-28');
});

test('rejects local-only, malformed, and out-of-range phone numbers', () => {
  assert.equal(normalizeInternationalPhoneNumber('07700000000'), null);
  assert.equal(normalizeInternationalPhoneNumber('+0123456789'), null);
  assert.equal(normalizeInternationalPhoneNumber('+1234567'), null);
  assert.equal(normalizeInternationalPhoneNumber('+1234567890123456'), null);
  assert.equal(normalizeInternationalPhoneNumber('+1abc23456789'), null);
});

test('accepts valid calendar birthdays and rejects invalid or future dates', () => {
  assert.equal(normalizeBirthDate('1992-02-29'), '1992-02-29');
  assert.equal(normalizeBirthDate('2001-02-29'), null);
  assert.equal(normalizeBirthDate('2030-01-01'), null);
  assert.equal(normalizeBirthDate('1899-12-31'), null);
  assert.equal(normalizeBirthDate('01/02/2000'), null);
});

test('uses Baghdad local date when validating whether a birthday is in the future', () => {
  const afterMidnightInIraq = new Date('2026-01-01T22:30:00.000Z');
  assert.equal(normalizeBirthDate('2026-01-02', afterMidnightInIraq), '2026-01-02');
  assert.equal(normalizeBirthDate('2026-01-03', afterMidnightInIraq), null);
});
