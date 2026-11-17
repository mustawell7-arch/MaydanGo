import { useCallback, useRef } from 'react';
import { Dimensions, type View } from 'react-native';
import {
  useRecordPublicSponsoredContentEvent,
  type SponsoredContentPlacementType,
} from '@workspace/api-client-react';
export { findSponsoredContentPlacement } from './sponsored-content-match';

type TrackedPlacement = {
  campaignId: string;
  placementType: SponsoredContentPlacementType;
  view: View;
};

export function useSponsoredContentTracking() {
  const recordEvent = useRecordPublicSponsoredContentEvent();
  const trackedViews = useRef(new Map<string, TrackedPlacement>());
  const recordedImpressions = useRef(new Set<string>());

  const recordImpression = useCallback((key: string, campaignId: string, placementType: SponsoredContentPlacementType) => {
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
        if (visibleWidth * visibleHeight / (width * height) >= 0.5) {
          recordImpression(key, entry.campaignId, entry.placementType);
        }
      });
    });
  }, [recordImpression]);

  const register = useCallback((
    key: string,
    campaignId: string | undefined,
    placementType: SponsoredContentPlacementType | undefined,
    view: View | null,
  ) => {
    if (!view || !campaignId || !placementType) {
      trackedViews.current.delete(key);
      return;
    }
    trackedViews.current.set(key, { campaignId, placementType, view });
    requestAnimationFrame(checkVisible);
  }, [checkVisible]);

  const record = useCallback((
    campaignId: string,
    eventType: 'click' | 'conversion',
    placementType: SponsoredContentPlacementType,
  ) => recordEvent.mutate({ id: campaignId, data: { eventType, placementType } }), [recordEvent]);

  return {
    checkVisible,
    register,
    recordClick: (campaignId: string, placementType: SponsoredContentPlacementType) =>
      record(campaignId, 'click', placementType),
    recordConversion: (campaignId: string, placementType: SponsoredContentPlacementType) =>
      record(campaignId, 'conversion', placementType),
  };
}
