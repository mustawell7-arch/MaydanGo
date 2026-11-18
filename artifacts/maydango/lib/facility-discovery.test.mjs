import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  baghdadDateKey,
  formatDiscoveryDate,
  matchesDiscoverySessionFilters,
} from './facility-discovery.ts';

const sessions = [
  { startsAt: '2026-11-19T05:30:00.000Z', accessType: 'physical', tiers: ['M', 'L'] },
  { startsAt: '2026-11-19T11:30:00.000Z', accessType: 'premium', tiers: ['L', 'XL'] },
];

test('facility discovery dates and session times use Baghdad local time', () => {
  assert.equal(baghdadDateKey('2026-11-19T21:30:00.000Z'), '2026-11-20');
  assert.equal(
    matchesDiscoverySessionFilters(sessions, { date: '2026-11-19', timeOfDay: 'morning', accessType: 'physical', tier: 'M' }),
    true,
  );
  assert.equal(
    matchesDiscoverySessionFilters(sessions, { date: '2026-11-19', timeOfDay: 'afternoon', accessType: 'premium', tier: 'XL' }),
    true,
  );
  assert.equal(
    matchesDiscoverySessionFilters(sessions, { date: '2026-11-19', timeOfDay: 'evening', accessType: null, tier: null }),
    false,
  );
  assert.match(formatDiscoveryDate('2026-11-19', 'en'), /19/);
});

test('unfiltered facility discovery keeps venues without upcoming sessions', () => {
  assert.equal(
    matchesDiscoverySessionFilters([], { date: null, timeOfDay: null, accessType: null, tier: null }),
    true,
  );
  assert.equal(
    matchesDiscoverySessionFilters([], { date: '2026-11-19', timeOfDay: null, accessType: null, tier: null }),
    false,
  );
});
