import type {
  PublicFacility,
  PublicSponsoredFacilityPlacement,
  SponsoredPlacementType,
} from '@workspace/api-client-react';

const normalize = (value: string) => value.trim().toLocaleLowerCase('en');

export function findSponsoredFacilityPlacement(
  placements: PublicSponsoredFacilityPlacement[],
  facility: PublicFacility,
  placementType: SponsoredPlacementType,
  selectedActivity?: string,
): PublicSponsoredFacilityPlacement | undefined {
  return placements.find(placement => {
    if (placement.facilityId !== facility.id || !placement.placementTypes.includes(placementType)) return false;
    if (placement.targetCity && normalize(placement.targetCity) !== normalize(facility.city)) return false;
    if (!placement.targetActivity) return true;

    const matchingActivity = facility.activities.find(activity =>
      Object.values(activity).some(value => normalize(value) === normalize(placement.targetActivity!)),
    );
    if (!matchingActivity) return false;
    if (placementType === 'category_featured' && selectedActivity) {
      return Object.values(matchingActivity).some(value => normalize(value) === normalize(selectedActivity));
    }
    return true;
  });
}
