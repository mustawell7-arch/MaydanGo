import type {
  PublicSponsoredContentPlacement,
  SponsoredContentPlacementType,
  SponsoredContentType,
} from '@workspace/api-client-react';

const normalize = (value: string) => value.trim().toLocaleLowerCase('en');

export function findSponsoredContentPlacement(
  placements: PublicSponsoredContentPlacement[],
  targetType: SponsoredContentType,
  targetId: string,
  placementType: SponsoredContentPlacementType,
  selectedActivity?: string,
) {
  return placements.find(placement => {
    if (placement.targetType !== targetType || placement.targetId !== targetId) return false;
    if (!placement.placementTypes.includes(placementType)) return false;
    if (placementType === 'category_featured' && selectedActivity && placement.targetActivity
      && normalize(placement.targetActivity) !== normalize(selectedActivity)) return false;
    return true;
  });
}
