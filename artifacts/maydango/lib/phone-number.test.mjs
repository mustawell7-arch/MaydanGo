import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeInternationalPhoneNumber } from './phone-number.ts';

test('normalizes formatted international phone numbers', () => {
  assert.equal(normalizeInternationalPhoneNumber('+964 770 000 0000'), '+9647700000000');
  assert.equal(normalizeInternationalPhoneNumber('+44 (20) 7946-0958'), '+442079460958');
});

test('normalizes Arabic-Indic and Eastern Arabic digits', () => {
  assert.equal(normalizeInternationalPhoneNumber('+٩٦٤ ٧٧٠ ٠٠٠ ٠٠٠٠'), '+9647700000000');
  assert.equal(normalizeInternationalPhoneNumber('+۹۶۴ ۷۷۰ ۰۰۰ ۰۰۰۰'), '+9647700000000');
});

test('rejects local-only, malformed, and out-of-range phone numbers', () => {
  assert.equal(normalizeInternationalPhoneNumber('07700000000'), null);
  assert.equal(normalizeInternationalPhoneNumber('+0123456789'), null);
  assert.equal(normalizeInternationalPhoneNumber('+1234567'), null);
  assert.equal(normalizeInternationalPhoneNumber('+1234567890123456'), null);
  assert.equal(normalizeInternationalPhoneNumber('+1abc23456789'), null);
});
