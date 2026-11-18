import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activityFavoriteId,
  getFavoriteActivities,
  toggleActivityFavorite,
} from './favorite-activities.ts';

test('activity favorites use a stable, normalized activity key', () => {
  assert.equal(activityFavoriteId('  HIIT   Training '), 'hiit training');
  assert.deepEqual(toggleActivityFavorite([], '  Yoga '), ['yoga']);
  assert.deepEqual(toggleActivityFavorite(['yoga'], 'YOGA'), []);
  assert.deepEqual(toggleActivityFavorite(['yoga'], '   '), ['yoga']);
});

test('home favorites follow saved order, deduplicate categories, and respect the limit', () => {
  const activities = [
    { en: 'Yoga', ar: 'يوغا', ku: 'یوگا' },
    { en: 'BOXING', ar: 'ملاكمة', ku: 'بۆکس' },
    { en: 'boxing', ar: 'ملاكمة', ku: 'بۆکس' },
    { en: 'Swimming', ar: 'سباحة', ku: 'مەلەوانی' },
  ];

  assert.deepEqual(
    getFavoriteActivities(activities, ['swimming', 'boxing', 'missing', 'boxing']).map(item => item.en),
    ['Swimming', 'BOXING'],
  );
  assert.deepEqual(getFavoriteActivities(activities, ['yoga', 'swimming'], 1).map(item => item.en), ['Yoga']);
  assert.deepEqual(getFavoriteActivities(activities, ['yoga'], 0), []);
});
