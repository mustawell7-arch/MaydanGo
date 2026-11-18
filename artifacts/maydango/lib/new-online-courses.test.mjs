import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNewOnlineCourses } from './new-online-courses.ts';

test('new online courses are recent, newest-first, and exclude undated or future courses', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  const courses = [
    { id: 'old', publishedAt: '2026-10-01T12:00:00.000Z' },
    { id: 'newer', publishedAt: '2026-11-17T12:00:00.000Z' },
    { id: 'older', publishedAt: '2026-11-12T12:00:00.000Z' },
    { id: 'legacy', publishedAt: null },
    { id: 'future', publishedAt: '2026-11-20T12:00:00.000Z' },
  ];

  assert.deepEqual(getNewOnlineCourses(courses, now).map(course => course.id), ['newer', 'older']);
});

test('new online course results honor the requested limit', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  const courses = [
    { id: 'one', publishedAt: '2026-11-18T10:00:00.000Z' },
    { id: 'two', publishedAt: '2026-11-17T10:00:00.000Z' },
  ];

  assert.deepEqual(getNewOnlineCourses(courses, now, 1).map(course => course.id), ['one']);
  assert.deepEqual(getNewOnlineCourses(courses, now, 0), []);
});
