import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendHomeActivities } from './home-activity-recommendations.ts';

test('home activity suggestions prioritize saved and previously booked places', () => {
  const suggestions = recommendHomeActivities([
    { activity: { en: 'Yoga' }, facilityId: 'saved-studio', savedPlace: true, previouslyBooked: false },
    { activity: { en: 'Yoga' }, facilityId: 'booked-studio', savedPlace: false, previouslyBooked: true },
    { activity: { en: 'Boxing' }, facilityId: 'boxing-club', savedPlace: false, previouslyBooked: false },
    { activity: { en: 'boxing' }, facilityId: 'boxing-club-2', savedPlace: false, previouslyBooked: false },
  ]);

  assert.deepEqual(suggestions.map(item => item.activity.en), ['Yoga', 'Boxing']);
  assert.equal(suggestions[0]?.facilityCount, 2);
  assert.equal(suggestions[1]?.facilityCount, 2);
});

test('home activity suggestions deduplicate facilities and honor limits', () => {
  const candidates = [
    { activity: { en: 'Yoga' }, facilityId: 'studio', savedPlace: true, previouslyBooked: true },
    { activity: { en: 'yoga' }, facilityId: 'studio', savedPlace: true, previouslyBooked: true },
    { activity: { en: 'Dance' }, facilityId: 'dance-studio', savedPlace: false, previouslyBooked: false },
  ];

  assert.equal(recommendHomeActivities(candidates, 1)[0]?.facilityCount, 1);
  assert.deepEqual(recommendHomeActivities(candidates, 0), []);
});

test('saved activity preferences rank ahead of other recommendation signals', () => {
  const suggestions = recommendHomeActivities([
    { activity: { en: 'Yoga' }, facilityId: 'yoga-studio', savedPlace: false, previouslyBooked: false, preferredActivity: true },
    { activity: { en: 'Boxing' }, facilityId: 'boxing-club', savedPlace: true, previouslyBooked: true },
  ]);

  assert.deepEqual(suggestions.map(item => item.activity.en), ['Yoga', 'Boxing']);
});
