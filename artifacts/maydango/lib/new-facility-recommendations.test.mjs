import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getNewFacilities } from './new-facility-recommendations.ts';

test('new facility list is city-scoped, newest-first, and excludes old or undated profiles', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  const facilities = [
    { id: 'old', city: 'Baghdad', publishedAt: '2026-10-01T12:00:00.000Z' },
    { id: 'newer-baghdad', city: 'Baghdad', publishedAt: '2026-11-17T12:00:00.000Z' },
    { id: 'older-baghdad', city: 'Baghdad', publishedAt: '2026-11-12T12:00:00.000Z' },
    { id: 'new-erbil', city: 'Erbil', publishedAt: '2026-11-18T10:00:00.000Z' },
    { id: 'legacy', city: 'Baghdad', publishedAt: null },
    { id: 'future', city: 'Baghdad', publishedAt: '2026-11-20T12:00:00.000Z' },
  ];

  assert.deepEqual(getNewFacilities(facilities, 'baghdad', now).map(item => item.id), [
    'newer-baghdad',
    'older-baghdad',
  ]);
  assert.deepEqual(getNewFacilities(facilities, 'all', now, 1).map(item => item.id), ['new-erbil']);
});
