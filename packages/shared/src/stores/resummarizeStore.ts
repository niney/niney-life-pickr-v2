import { create } from 'zustand';

// 진행 중인 단건 재요약을 앱 전역에서 추적한다. 재요약은 큐+SSE 라 완료까지
// 수 초 걸리는데, 트리거한 화면(ReviewsTab)을 떠나도(탭 전환/페이지 이동)
// 완료 토스트와 버튼 잠금이 유지돼야 한다. 그래서 in-flight 목록을 컴포넌트
// 로컬 state 가 아니라 전역 store 에 둔다 — 전역 watcher 가 이 목록의 placeId
// 들을 SSE 구독해 완료를 처리한다.
export interface ResummarizeInFlight {
  reviewId: string;
  // SSE 구독 키 (Naver placeId). 이 값으로 watcher 가 구독·캐시 무효화한다.
  placeId: string;
  // 재요약 직전 sentiment — 완료 토스트의 "부정 → 긍정" 델타 표시용.
  prevSentiment: string | null;
  model: string;
}

interface ResummarizeState {
  // key = reviewId.
  items: Record<string, ResummarizeInFlight>;
  add: (item: ResummarizeInFlight) => void;
  remove: (reviewId: string) => void;
}

export const useResummarizeStore = create<ResummarizeState>((set) => ({
  items: {},
  add: (item) =>
    set((s) => ({ items: { ...s.items, [item.reviewId]: item } })),
  remove: (reviewId) =>
    set((s) => {
      if (!s.items[reviewId]) return s;
      const next = { ...s.items };
      delete next[reviewId];
      return { items: next };
    }),
}));
