import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findSponsoredContentPlacement } from './sponsored-content-match.ts';

const placements = [{
  campaignId: 'course-campaign',
  targetType: 'course',
  targetId: 'course-1',
  placementTypes: ['featured_course', 'category_featured'],
  targetCity: 'Baghdad',
  targetActivity: 'Fitness',
}];

test('matches content placements to the correct target and placement', () => {
  assert.equal(findSponsoredContentPlacement(placements, 'course', 'course-1', 'featured_course')?.campaignId, 'course-campaign');
  assert.equal(findSponsoredContentPlacement(placements, 'course', 'course-1', 'category_featured', ' fitness ')?.campaignId, 'course-campaign');
});

test('does not match another target, content type, category, or placement', () => {
  assert.equal(findSponsoredContentPlacement(placements, 'event', 'course-1', 'featured_course'), undefined);
  assert.equal(findSponsoredContentPlacement(placements, 'course', 'another-course', 'featured_course'), undefined);
  assert.equal(findSponsoredContentPlacement(placements, 'course', 'course-1', 'home_promotion'), undefined);
  assert.equal(findSponsoredContentPlacement(placements, 'course', 'course-1', 'category_featured', 'Swimming'), undefined);
});
