import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecentlyVisitedFacilities } from './recently-visited-facilities.ts';

const now = Date.parse('2026-11-18T12:00:00.000Z');
const visit = (facilityId, visitedAt) => ({ facilityId, visitedAt });

test('recent facilities use the latest confirmed visit for each facility', () => {
  const rows = [
    visit('gym-a', '2026-11-10T12:00:00.000Z'),
    visit('gym-b', '2026-11-15T12:00:00.000Z'),
    visit('gym-a', '2026-11-17T12:00:00.000Z'),
  ];

  assert.deepEqual(
    getRecentlyVisitedFacilities(rows, now).map(row => [row.facilityId, row.visitedAt]),
    [
      ['gym-a', '2026-11-17T12:00:00.000Z'],
      ['gym-b', '2026-11-15T12:00:00.000Z'],
    ],
  );
});

test('recent facilities ignore invalid and future timestamps and enforce the limit', () => {
  const rows = [
    visit('future', '2026-11-19T12:00:00.000Z'),
    visit('invalid', 'not-a-date'),
    visit('gym-a', '2026-11-17T12:00:00.000Z'),
    visit('gym-b', '2026-11-16T12:00:00.000Z'),
  ];

  assert.deepEqual(getRecentlyVisitedFacilities(rows, now, 1).map(row => row.facilityId), ['gym-a']);
  assert.deepEqual(getRecentlyVisitedFacilities(rows, now, 0), []);
});
