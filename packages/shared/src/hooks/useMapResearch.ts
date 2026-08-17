import { useCallback, useEffect, useRef, useState } from 'react';
import { approxDistanceM } from '@repo/utils';

// 지도 재검색 파이프라인 — 주변 모드에서 사용자가 지도를 기준점 밖으로 끌고
// 갔을 때 (a) 줌이 충분히 가까우면 자동 재조회(트레일링 스로틀), (b) 아니면
// "이 위치에서 재검색" 수동 버튼 노출을 판정한다.
//
// 웹 Bus/SubwayStationsMap 인라인 2곳 + 앱 transit useMapResearch 가 문자
// 단위로 같은 로직이었던 것을 단일 정의로 승격. 입력은 플랫폼 뷰포트 타입
// (웹 MapCanvas MapViewport / 앱 BridgeViewport)에 묶이지 않게 순수
// {lat, lng, zoom} 으로 받는다 — 소비처가 한 줄 어댑터로 감싼다.

// 자동 재조회 최소 간격 — 트레일링 예약이라 마지막 이동은 반드시 조회된다.
// (드롭 방식은 "패닝을 멈췄는데 조회가 영영 안 나가는" 간헐 미표시를 만든다.)
const AUTO_RESEARCH_MIN_INTERVAL_MS = 1_200;

export interface MapResearchView {
  lat: number;
  lng: number;
  zoom: number;
}

export interface UseMapResearchOptions {
  // 재검색(수동/자동) 트리거 임계 — 기준점에서 지도 중심이 이만큼 벗어나야.
  thresholdM: number;
  // 자동 재조회 최소 줌 — 그보다 멀면 수동 버튼으로 강등.
  minZoom: number;
  // 주변 모드 조회 기준점. 없으면(주변 모드 아님) 둘 다 비활성.
  myLocation?: { lat: number; lng: number } | null;
  // 자동 재조회 콜백 — 미지정이면 수동 버튼만.
  onAutoResearchAt?(center: { lat: number; lng: number }): void;
}

export const useMapResearch = ({
  thresholdM,
  minZoom,
  myLocation,
  onAutoResearchAt,
}: UseMapResearchOptions) => {
  // 사용자가 직접 패닝/줌을 끝낸 시점의 지도 상태 — programmatic move(fit/
  // flyTo)는 각 플랫폼 지도 레이어가 user 플래그로 걸러 넘긴다.
  const [userView, setUserView] = useState<MapResearchView | null>(null);
  const lastAutoAtRef = useRef(0);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    },
    [],
  );

  const handleUserViewEnd = useCallback(
    (view: MapResearchView) => {
      const center = { lat: view.lat, lng: view.lng };
      setUserView(view);
      // 자동 재조회 — 줌이 충분히 가깝고 기준점에서 임계 이상 벗어났을 때만.
      if (
        onAutoResearchAt &&
        myLocation &&
        view.zoom >= minZoom &&
        approxDistanceM(myLocation, center) > thresholdM
      ) {
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        const fire = () => {
          lastAutoAtRef.current = Date.now();
          onAutoResearchAt(center);
        };
        const wait = AUTO_RESEARCH_MIN_INTERVAL_MS - (Date.now() - lastAutoAtRef.current);
        if (wait <= 0) fire();
        else autoTimerRef.current = setTimeout(fire, wait);
      }
    },
    [onAutoResearchAt, myLocation, minZoom, thresholdM],
  );

  // 수동 재검색 버튼 — 기준점에서 임계 이상 벗어났지만 자동 조건이 아닐 때
  // (줌이 멀거나 자동 핸들러 미지정). 재검색 직후엔 기준점=지도 중심(dist≈0)
  // 이라 별도 리셋 없이 숨는다.
  const autoActive = !!onAutoResearchAt && userView !== null && userView.zoom >= minZoom;
  const showResearch =
    !autoActive &&
    !!myLocation &&
    userView !== null &&
    approxDistanceM(myLocation, userView) > thresholdM;
  const researchCenter = userView ? { lat: userView.lat, lng: userView.lng } : null;

  return { handleUserViewEnd, showResearch, researchCenter };
};
