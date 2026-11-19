import assert from 'node:assert/strict';
import { test } from 'node:test';
import { courseMatchesSearch } from './course-search.ts';

const course = {
  title: 'Movement at Home',
  category: 'mobility',
  level: 'beginner',
  localizedTitle: { en: 'Movement at Home', ar: 'الحركة في المنزل', ku: 'جووڵە لە ماڵەوە' },
  localizedSummary: { en: 'Build a gentle daily routine', ar: 'تمارين يومية هادئة', ku: 'ڕاهێنانی ڕۆژانەی هێواش' },
  localizedInstructor: { en: 'Sara Karim', ar: 'سارة كريم', ku: 'سارا کەریم' },
};

test('course search matches localized titles, summaries, instructors and categories', () => {
  assert.equal(courseMatchesSearch(course, 'movement home'), true);
  assert.equal(courseMatchesSearch(course, 'سارة كريم'), true);
  assert.equal(courseMatchesSearch(course, 'mobility beginner'), true);
  assert.equal(courseMatchesSearch(course, 'not a course'), false);
});

test('course search ignores Arabic diacritics and treats an empty query as a match', () => {
  assert.equal(courseMatchesSearch(course, 'الحَرَكَة'), true);
  assert.equal(courseMatchesSearch(course, '   '), true);
});
