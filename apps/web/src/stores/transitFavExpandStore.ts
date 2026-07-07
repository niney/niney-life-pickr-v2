import { create } from 'zustand';

// 통합 즐겨찾기 섹션의 '펼친 항목' 공유 상태.
//
// 왜 스토어인가: 버스·지하철 페이지는 데스크톱/모바일 레이아웃을 CSS 숨김
// (hidden xl:flex / xl:hidden)으로 **동시 마운트**한다. 펼침 상태를 컴포넌트
// 로컬 state 로 두면 두 인스턴스가 따로 논다(한쪽에서 펼쳐도 다른 쪽은 접힌 채).
// 여기로 승격하면 양 인스턴스가 같은 항목을 펼치고, 결과적으로 같은 도착 queryKey
// 를 구독해 React Query 가 네트워크를 1회로 dedupe 한다.
//
// 단일 아코디언(한 번에 하나만): 펼친 항목만 도착 폴링(30초)을 돌리므로 동시
// 폴링을 1개로 묶어 swopen 일일 쿼터를 보호한다. 소멸성 UI 상태라 persist 없음
// (transitMapViewport 처럼 모듈 수명 동안만 유지 — 새로고침 시 접힌 상태로 시작).
interface TransitFavExpandState {
  // 펼친 행 key(도메인+식별자 합성, TransitFavoritesSection 이 부여). null = 전부 접힘.
  expandedKey: string | null;
  // 같은 key 재클릭 → 접기(null), 다른 key → 그 항목만 펼침(단일 아코디언).
  toggle: (key: string) => void;
  collapse: () => void;
}

export const useTransitFavExpandStore = create<TransitFavExpandState>((set) => ({
  expandedKey: null,
  toggle: (key) =>
    set((s) => ({ expandedKey: s.expandedKey === key ? null : key })),
  collapse: () => set({ expandedKey: null }),
}));
