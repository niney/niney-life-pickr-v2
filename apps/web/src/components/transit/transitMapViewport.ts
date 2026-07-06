// 버스↔지하철 탭 전환 간 지도 뷰포트 이어보기 — 모듈 싱글턴(버스·지하철 공용 1개).
// 전환 간 '마지막으로 보던 지도 위치'를 두 탭이 공유한다(탭별 분리가 아니다). 저장은
// 각 지도 어댑터의 moveend 콜백, 복원은 마운트 시 초기 뷰로 읽어 넘긴다.
//
// 새로고침/직접 진입에는 소실(모듈 스코프) — 의도된 동작. 딥링크·기본 뷰 규칙을
// 그대로 두고(저장 뷰포트가 없으면 종전 기본 뷰), SPA 내 탭 전환에서만 이어본다.

export interface TransitViewport {
  lat: number;
  lng: number;
  zoom: number;
}

let saved: TransitViewport | null = null;

export const saveTransitViewport = (v: TransitViewport): void => {
  saved = v;
};

export const readTransitViewport = (): TransitViewport | null => saved;
