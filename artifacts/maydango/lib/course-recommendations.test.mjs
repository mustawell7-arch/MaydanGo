import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendOnlineCourses } from './course-recommendations.ts';

test('course suggestions favor enrolled categories and exclude enrolled or unrelated courses', () => {
  const courses = [
    { id: 'enrolled-mobility-a', category: 'Mobility', enrolled: true },
    { id: 'enrolled-mobility-b', category: 'mobility', enrolled: true },
    { id: 'enrolled-strength', category: 'strength', enrolled: true },
    { id: 'strength-suggestion', category: 'strength', enrolled: false },
    { id: 'mobility-suggestion', category: 'MOBILITY', enrolled: false },
    { id: 'unrelated', category: 'dance', enrolled: false },
  ];

  assert.deepEqual(
    recommendOnlineCourses(courses).map(course => course.id),
    ['mobility-suggestion', 'strength-suggestion'],
  );
});

test('course suggestions are empty without an enrollment match and honor the display limit', () => {
  const courses = [
    { id: 'one', category: 'yoga', enrolled: false },
    { id: 'two', category: 'yoga', enrolled: false },
  ];

  assert.deepEqual(recommendOnlineCourses(courses), []);
  assert.deepEqual(recommendOnlineCourses([
    { id: 'enrolled', category: 'yoga', enrolled: true },
    ...courses,
  ], 1).map(course => course.id), ['one']);
});
