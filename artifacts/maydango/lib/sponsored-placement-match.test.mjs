import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findSponsoredFacilityPlacement } from './sponsored-placement-match.ts';

const facility = {
  id: 'facility-erbil',
  city: 'Erbil',
  activities: [{ en: 'Yoga', ar: 'يوغا', ku: 'یوگا' }],
};

const campaign = {
  campaignId: 'campaign-yoga',
  facilityId: facility.id,
  placementTypes: ['category_featured'],
  targetCity: 'ERBIL',
  targetActivity: 'Yoga',
};

test('matches active server placements by facility, city, and any localized activity name', () => {
  assert.equal(findSponsoredFacilityPlacement([campaign], facility, 'category_featured')?.campaignId, 'campaign-yoga');
  assert.equal(findSponsoredFacilityPlacement([campaign], facility, 'category_featured', 'یوگا')?.campaignId, 'campaign-yoga');
});

test('does not show campaigns for another facility, city, activity, or placement type', () => {
  assert.equal(findSponsoredFacilityPlacement([campaign], { ...facility, id: 'other' }, 'category_featured'), undefined);
  assert.equal(findSponsoredFacilityPlacement([campaign], { ...facility, city: 'Basra' }, 'category_featured'), undefined);
  assert.equal(findSponsoredFacilityPlacement([campaign], facility, 'category_featured', 'Swimming'), undefined);
  assert.equal(findSponsoredFacilityPlacement([campaign], facility, 'home_featured'), undefined);
});

test('search placements do not require the customer to select the campaign activity', () => {
  const searchCampaign = { ...campaign, placementTypes: ['search_sponsored'] };
  assert.equal(findSponsoredFacilityPlacement([searchCampaign], facility, 'search_sponsored')?.campaignId, 'campaign-yoga');
});
