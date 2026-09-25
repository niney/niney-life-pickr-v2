import { create } from 'zustand';

// 진행 중인 단건 재요약을 앱 전역에서 추적한다. 재요약은 큐+SSE 라 완료까지
// 수 초 걸리는데, 트리거한 화면(ReviewsTab)을 떠나도(탭 전환/페이지 이동)
// 완료 토스트와 버튼 잠금이 유지돼야 한다. 그래서 in-flight 목록을 컴포넌트
// 로컬 state 가 아니라 전역 store 에 둔다 — 전역 watcher 가 이 목록의 구독
// 키로 SSE 를 받아 완료를 처리한다.
export interface ResummarizeInFlight {
  reviewId: string;
  // 캐시 무효화 키 (Naver placeId — 공개 상세 캐시가 이 키로 잡혀 있다).
  placeId: string;
  // SSE 구독 키. 다이닝코드·테이블링 리뷰의 완료 이벤트는 placeId 구독으로는 안
  // 오므로 canonical 로 구독해야 한다. 트리거 시점에 모르면 null 로 두고 POST
  // 응답(canonicalId)으로 채운다 — 그 전까지 watcher 는 placeId 로 구독.
  canonicalId: string | null;
  // 재요약 직전 sentiment — 완료 토스트의 "부정 → 긍정" 델타 표시용.
  prevSentiment: string | null;
  model: string;
}

interface ResummarizeState {
  // key = reviewId.
  items: Record<string, ResummarizeInFlight>;
  add: (item: ResummarizeInFlight) => void;
  // POST 응답으로 알게 된 canonical 을 기록 — watcher 가 구독 키를 옮긴다.
  setCanonical: (reviewId: string, canonicalId: string) => void;
  remove: (reviewId: string) => void;
}

export const useResummarizeStore = create<ResummarizeState>((set) => ({
  items: {},
  add: (item) =>
    set((s) => ({ items: { ...s.items, [item.reviewId]: item } })),
  setCanonical: (reviewId, canonicalId) =>
    set((s) => {
      const cur = s.items[reviewId];
      if (!cur || cur.canonicalId === canonicalId) return s;
      return { items: { ...s.items, [reviewId]: { ...cur, canonicalId } } };
    }),
  remove: (reviewId) =>
    set((s) => {
      if (!s.items[reviewId]) return s;
      const next = { ...s.items };
      delete next[reviewId];
      return { items: next };
    }),
}));
