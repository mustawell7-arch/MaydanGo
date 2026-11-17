import { useCallback, useRef } from 'react';
import { Dimensions, type View } from 'react-native';
import {
  useRecordPublicSponsoredFacilityEvent,
  type SponsoredPlacementType,
} from '@workspace/api-client-react';
import { findSponsoredFacilityPlacement } from '@/lib/sponsored-placement-match';

type TrackedPlacement = {
  campaignId: string;
  placementType: SponsoredPlacementType;
  view: View;
};

export function useSponsoredFacilityTracking() {
  const recordEvent = useRecordPublicSponsoredFacilityEvent();
  const trackedViews = useRef(new Map<string, TrackedPlacement>());
  const recordedImpressions = useRef(new Set<string>());

  const recordImpression = useCallback((key: string, campaignId: string, placementType: SponsoredPlacementType) => {
    const impressionKey = `${key}:${campaignId}:${placementType}`;
    if (recordedImpressions.current.has(impressionKey)) return;
    recordedImpressions.current.add(impressionKey);
    recordEvent.mutate(
      { id: campaignId, data: { eventType: 'impression', placementType } },
      { onError: () => recordedImpressions.current.delete(impressionKey) },
    );
  }, [recordEvent]);

  const checkVisible = useCallback(() => {
    const viewport = Dimensions.get('window');
    trackedViews.current.forEach((entry, key) => {
      entry.view.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) return;
        const visibleWidth = Math.max(0, Math.min(x + width, viewport.width) - Math.max(x, 0));
        const visibleHeight = Math.max(0, Math.min(y + height, viewport.height) - Math.max(y, 0));
        if ((visibleWidth * visibleHeight) / (width * height) >= 0.5) {
          recordImpression(key, entry.campaignId, entry.placementType);
        }
      });
    });
  }, [recordImpression]);

  const register = useCallback((
    key: string,
    campaignId: string | undefined,
    placementType: SponsoredPlacementType | undefined,
    view: View | null,
  ) => {
    if (!view || !campaignId || !placementType) {
      trackedViews.current.delete(key);
      return;
    }
    trackedViews.current.set(key, { campaignId, placementType, view });
    requestAnimationFrame(checkVisible);
  }, [checkVisible]);

  const recordClick = useCallback((campaignId: string, placementType: SponsoredPlacementType) => {
    recordEvent.mutate({ id: campaignId, data: { eventType: 'click', placementType } });
  }, [recordEvent]);

  return { checkVisible, recordClick, register };
}
