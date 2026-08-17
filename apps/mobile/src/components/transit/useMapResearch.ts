import { useCallback } from 'react';
import {
  useMapResearch as useSharedMapResearch,
  type UseMapResearchOptions,
} from '@repo/shared';
import type { BridgeViewport } from './transitMapBridge';

// 지도 재검색 파이프라인 — 로직은 @repo/shared useMapResearch 단일 정의
// (웹 Bus/SubwayStationsMap 과 동일 구현이던 것을 승격). 여기는 WebView
// 브리지 뷰포트 타입을 플랫폼 중립 {lat,lng,zoom} 으로 넘기는 어댑터만 남긴다.
export const useMapResearch = (options: UseMapResearchOptions) => {
  const { handleUserViewEnd, showResearch, researchCenter } = useSharedMapResearch(options);

  const handleViewportChangeEnd = useCallback(
    (vp: BridgeViewport) =>
      handleUserViewEnd({ lat: vp.center.lat, lng: vp.center.lng, zoom: vp.zoom }),
    [handleUserViewEnd],
  );

  return { handleViewportChangeEnd, showResearch, researchCenter };
};
