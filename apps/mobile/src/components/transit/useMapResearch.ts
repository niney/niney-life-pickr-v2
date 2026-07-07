import { useCallback, useEffect, useRef, useState } from 'react';
import type { BridgeViewport } from './transitMapBridge';

// 등거리 사각 근사 거리(m) — 임계 판정에 하버사인급 정밀도 불필요.
const approxDistanceM = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number => {
  const mPerLatDeg = 111_320;
  const dLat = (a.lat - b.lat) * mPerLatDeg;
  const dLng = (a.lng - b.lng) * mPerLatDeg * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

// 자동 재조회 최소 간격 — 트레일링 예약이라 마지막 이동은 반드시 조회된다.
const AUTO_RESEARCH_MIN_INTERVAL_MS = 1_200;

interface Options {
  // 재검색(수동/자동) 트리거 임계 — 기준점에서 지도 중심이 이만큼 벗어나야.
  thresholdM: number;
  // 자동 재조회 최소 줌 — 그보다 멀면 수동 버튼으로 강등.
  minZoom: number;
  // 주변 모드 조회 기준점. 없으면(주변 모드 아님) 둘 다 비활성.
  myLocation?: { lat: number; lng: number } | null;
  // 자동 재조회 콜백 — 미지정이면 수동 버튼만.
  onAutoResearchAt?(center: { lat: number; lng: number }): void;
}

// 지도 재검색 파이프라인 — 사용자 패닝 종료 좌표 추적 + 자동 재조회 트레일링
// 스로틀 + 수동 재검색 버튼 노출 판정(웹 Bus/SubwayStationsMap 공통 로직 추출).
export const useMapResearch = ({ thresholdM, minZoom, myLocation, onAutoResearchAt }: Options) => {
  // 사용자가 직접 패닝/줌을 끝낸 시점의 지도 상태 — programmatic move 는 지도
  // HTML 이 user 플래그로 걸러준다.
  const [userView, setUserView] = useState<{ lat: number; lng: number; zoom: number } | null>(
    null,
  );
  const lastAutoAtRef = useRef(0);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    },
    [],
  );

  const handleViewportChangeEnd = useCallback(
    (vp: BridgeViewport) => {
      const center = { lat: vp.center.lat, lng: vp.center.lng };
      setUserView({ ...center, zoom: vp.zoom });
      if (
        onAutoResearchAt &&
        myLocation &&
        vp.zoom >= minZoom &&
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

  // 수동 재검색 버튼 — 임계 이상 벗어났지만 자동 조건이 아닐 때.
  const autoActive = !!onAutoResearchAt && userView !== null && userView.zoom >= minZoom;
  const showResearch =
    !autoActive &&
    !!myLocation &&
    userView !== null &&
    approxDistanceM(myLocation, userView) > thresholdM;
  const researchCenter = userView ? { lat: userView.lat, lng: userView.lng } : null;

  return { handleViewportChangeEnd, showResearch, researchCenter };
};
