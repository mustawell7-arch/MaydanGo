import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  baghdadDateKey,
  formatDiscoveryDate,
  matchesDiscoverySessionFilters,
  matchesMinimumFacilityRating,
} from './facility-discovery.ts';

const sessions = [
  { startsAt: '2026-11-19T05:30:00.000Z', accessType: 'physical', tiers: ['M', 'L'], difficultyLevel: 'beginner' },
  { startsAt: '2026-11-19T11:30:00.000Z', accessType: 'premium', tiers: ['L', 'XL'], difficultyLevel: 'all-levels' },
];

test('facility discovery dates and session times use Baghdad local time', () => {
  assert.equal(baghdadDateKey('2026-11-19T21:30:00.000Z'), '2026-11-20');
  assert.equal(
    matchesDiscoverySessionFilters(sessions, {
      date: '2026-11-19', timeOfDay: 'morning', accessType: 'physical', tier: 'M', difficultyLevel: 'beginner',
    }),
    true,
  );
  assert.equal(
    matchesDiscoverySessionFilters(sessions, {
      date: '2026-11-19', timeOfDay: 'afternoon', accessType: 'premium', tier: 'XL', difficultyLevel: 'intermediate',
    }),
    true,
  );
  assert.equal(
    matchesDiscoverySessionFilters(sessions, {
      date: '2026-11-19', timeOfDay: 'evening', accessType: null, tier: null, difficultyLevel: null,
    }),
    false,
  );
  assert.match(formatDiscoveryDate('2026-11-19', 'en'), /19/);
});

test('unfiltered facility discovery keeps venues without upcoming sessions', () => {
  assert.equal(
    matchesDiscoverySessionFilters([], {
      date: null, timeOfDay: null, accessType: null, tier: null, difficultyLevel: null,
    }),
    true,
  );
  assert.equal(
    matchesDiscoverySessionFilters([], {
      date: '2026-11-19', timeOfDay: null, accessType: null, tier: null, difficultyLevel: null,
    }),
    false,
  );
});

test('rating filters include only facilities with enough published rating', () => {
  assert.equal(matchesMinimumFacilityRating(null, null), true);
  assert.equal(matchesMinimumFacilityRating(null, 4), false);
  assert.equal(matchesMinimumFacilityRating(4.2, 4), true);
  assert.equal(matchesMinimumFacilityRating(4.2, 4.5), false);
});
