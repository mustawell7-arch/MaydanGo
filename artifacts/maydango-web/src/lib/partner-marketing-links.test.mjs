import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPartnerFacilityUrl } from './partner-marketing-links.ts';

test('marketing QR links open the selected facility profile', () => {
  assert.equal(
    buildPartnerFacilityUrl('/maydango-web/', 'facility one', 'https://maydango.example'),
    'https://maydango.example/maydango-web/facilities?facility=facility+one#public-facilities',
  );
});

test('marketing QR links fall back to the facility directory without a selection', () => {
  assert.equal(buildPartnerFacilityUrl('/maydango-web/', undefined), '/maydango-web/facilities');
});
