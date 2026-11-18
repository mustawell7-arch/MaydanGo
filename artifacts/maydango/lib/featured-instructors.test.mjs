import test from 'node:test';
import assert from 'node:assert/strict';
import { getFeaturedInstructors } from './featured-instructors.ts';

const profile = (id, displayName, courseIds) => ({
  id,
  displayName,
  courses: courseIds.map(courseId => ({ id: courseId })),
});

test('featured instructors only include profiles with published courses', () => {
  const result = getFeaturedInstructors([
    profile('empty', 'No courses yet', []),
    profile('one', 'Instructor One', ['course-1']),
  ]);

  assert.deepEqual(result.map(row => row.id), ['one']);
});

test('featured instructors rank course activity and apply the requested limit', () => {
  const result = getFeaturedInstructors([
    profile('two', 'Bana', ['course-1', 'course-2']),
    profile('three', 'Dara', ['course-1', 'course-2', 'course-3']),
    profile('one', 'Ava', ['course-1']),
    profile('blank', '  ', ['course-1', 'course-2', 'course-3', 'course-4']),
  ], 2);

  assert.deepEqual(result.map(row => row.id), ['three', 'two']);
  assert.deepEqual(getFeaturedInstructors([profile('one', 'Ava', ['course-1'])], 0), []);
});
