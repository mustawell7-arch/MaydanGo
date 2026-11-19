import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  baghdadDateKey,
  buildAppleHealthDailySummaries,
  getAppleHealthSyncRange,
} from './apple-health-sync';

test('Apple Health summaries use Iraq-local dates and retain only requested daily aggregates', () => {
  const range = getAppleHealthSyncRange(new Date('2026-11-19T12:00:00.000Z'));
  assert.equal(range.firstDay, '2026-10-21');
  assert.equal(range.today, '2026-11-19');
  assert.equal(range.from.toISOString(), '2026-10-20T21:00:00.000Z');
  assert.equal(baghdadDateKey(new Date('2026-01-01T22:00:00.000Z')), '2026-01-02');

  const summaries = buildAppleHealthDailySummaries(
    [
      { startDate: new Date('2026-11-18T00:00:00.000Z'), sum: 5234.4 },
      { startDate: new Date('2026-11-17T00:00:00.000Z') },
      { startDate: new Date('2026-10-01T00:00:00.000Z'), sum: 900 },
    ],
    [
      { startDate: new Date('2026-11-17T23:30:00.000Z') },
      { startDate: new Date('2026-11-18T08:00:00.000Z') },
    ],
    range.firstDay,
    range.today,
  );

  assert.deepEqual(summaries, [
    { activityDate: '2026-11-18', steps: 5234, completedWorkouts: 2 },
  ]);
});

test('Apple Health daily summaries reject unsupported step totals', () => {
  assert.throws(() => buildAppleHealthDailySummaries(
    [{ startDate: new Date('2026-11-18T12:00:00.000Z'), sum: 300_001 }],
    [],
    '2026-11-01',
    '2026-11-30',
  ));
});
