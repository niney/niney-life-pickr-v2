import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { ReviewAskResultType } from '@repo/api-contract';
import { reviewSearchApi } from '../api/review-search.api.js';

// 공개 질문(AskTab/RAG)의 진행 상태를 앱 전역에서 추적한다. 답변은 LLM 3콜이라
// 15초+ 걸리는데, 트리거한 화면(식당 상세 Ask 탭)을 떠나도(탭 전환/페이지 이동)
// 결과가 사라지지 않아야 한다. 그래서 in-flight 요청과 결과를 컴포넌트 로컬
// state 가 아니라 전역 store 에 둔다 — store 가 직접 publicAsk 를 호출하므로
// 컴포넌트 언마운트와 무관하게 응답이 도착하고, 전역 watcher(ReviewAskToaster)가
// 완료를 토스트로 알린다.
//
// 영속화: 식당별 마지막 {질문, 답변}만 persist(웹 localStorage / 앱 AsyncStorage).
// 진행 중(inFlight)·완료 이벤트(completion)·에러는 메모리만 — 하드 리로드하면
// 진행 중 HTTP 는 어차피 죽으므로 영속화해도 의미 없다.
//
// storage 어댑터는 settlementDraftStore 와 같은 lazy resolver 패턴 — 웹은
// localStorage 자동, 앱은 entry 에서 setReviewAskStorage(AsyncStorage) 주입.

let injectedStorage: StateStorage | null = null;

/**
 * RN/외부 환경에서 persist 용 storage 를 주입한다. 모듈 import 후 한 번만
 * 호출. 미호출 + 브라우저 환경이면 window.localStorage 가 자동 사용된다.
 */
export const setReviewAskStorage = (storage: StateStorage): void => {
  injectedStorage = storage;
};

const NO_OP_STORAGE: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const resolveStorage = (): StateStorage => {
  if (injectedStorage) return injectedStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return NO_OP_STORAGE;
};

// 식당별 마지막 질문·답변. 탭 재진입 시 재질문 없이 즉시 복원.
export interface ReviewAskEntry {
  query: string;
  result: ReviewAskResultType;
  answeredAt: number; // epoch ms
}

// 마지막 완료 이벤트 — toaster 가 seq 변화를 감지해 1회만 토스트한다.
export interface ReviewAskCompletion {
  seq: number;
  placeId: string;
  restaurantName: string | null;
  query: string;
  ok: boolean;
  // 성공 시 토스트 설명용 미리보기.
  answer?: string;
  confidence?: ReviewAskResultType['confidence'];
}

interface ReviewAskState {
  // placeId → 진행 중 질문. (메모리)
  inFlight: Record<string, { query: string; startedAt: number }>;
  // placeId → 마지막 Q&A. (영속)
  lastByPlace: Record<string, ReviewAskEntry>;
  // placeId → 이번 앱/탭 세션에서 직접 물어봤는지. lastByPlace 는 영속이라
  // 재시작 시 복원되는데, 그 '지난 답변'과 방금 받은 답을 구분하는 데 쓴다.
  // (메모리만 — 영속 X. 렌더 중 Date.now 같은 비순수 호출을 피하려는 목적도.)
  freshThisSession: Record<string, true>;
  // placeId → 마지막 요청 실패 여부. (메모리)
  errorByPlace: Record<string, boolean>;
  // 마지막 완료 이벤트. (메모리)
  completion: ReviewAskCompletion | null;
  // 지금 화면에서 보고 있는 Ask 탭의 placeId. 완료 시 그 식당 Ask 탭을 이미
  // 보고 있으면 토스트/배너를 생략하는 데 쓴다(화면에 결과가 인라인으로 뜨므로).
  // 앱(RN)은 탭이 언마운트되므로 AskTab 마운트=이 값으로 신뢰 가능. (메모리)
  visiblePlaceId: string | null;

  // 질문 실행 — store 가 직접 호출해 컴포넌트 생사와 무관하게 완료된다.
  // 같은 식당이 이미 진행 중이면 무시(중복 제출 방지).
  ask(placeId: string, query: string, restaurantName?: string | null): Promise<void>;
  clearCompletion(): void;
  clearLast(placeId: string): void;
  // AskTab 마운트/언마운트 시 호출 — 위 visiblePlaceId 를 갱신.
  setAskTabVisible(placeId: string, visible: boolean): void;
}

// 영속 저장량 상한 — 가장 최근 답변 N개 식당만 유지(answeredAt 기준).
const MAX_KEPT = 20;
const capEntries = (
  entries: Record<string, ReviewAskEntry>,
): Record<string, ReviewAskEntry> => {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_KEPT) return entries;
  const kept = keys
    .sort((a, b) => (entries[b]!.answeredAt ?? 0) - (entries[a]!.answeredAt ?? 0))
    .slice(0, MAX_KEPT);
  const next: Record<string, ReviewAskEntry> = {};
  for (const k of kept) next[k] = entries[k]!;
  return next;
};

export const useReviewAskStore = create<ReviewAskState>()(
  persist(
    (set, get) => ({
      inFlight: {},
      lastByPlace: {},
      freshThisSession: {},
      errorByPlace: {},
      completion: null,
      visiblePlaceId: null,

      async ask(placeId, query, restaurantName = null) {
        const text = query.trim();
        if (!text) return;
        if (get().inFlight[placeId]) return;

        set((s) => {
          const errorByPlace = { ...s.errorByPlace };
          delete errorByPlace[placeId];
          return {
            inFlight: { ...s.inFlight, [placeId]: { query: text, startedAt: Date.now() } },
            errorByPlace,
          };
        });

        try {
          const result = await reviewSearchApi.publicAsk(placeId, text);
          set((s) => {
            const inFlight = { ...s.inFlight };
            delete inFlight[placeId];
            return {
              inFlight,
              lastByPlace: capEntries({
                ...s.lastByPlace,
                [placeId]: { query: text, result, answeredAt: Date.now() },
              }),
              freshThisSession: { ...s.freshThisSession, [placeId]: true },
              completion: {
                seq: (s.completion?.seq ?? 0) + 1,
                placeId,
                restaurantName,
                query: text,
                ok: true,
                answer: result.answer,
                confidence: result.confidence,
              },
            };
          });
        } catch {
          set((s) => {
            const inFlight = { ...s.inFlight };
            delete inFlight[placeId];
            return {
              inFlight,
              errorByPlace: { ...s.errorByPlace, [placeId]: true },
              completion: {
                seq: (s.completion?.seq ?? 0) + 1,
                placeId,
                restaurantName,
                query: text,
                ok: false,
              },
            };
          });
        }
      },

      clearCompletion() {
        set({ completion: null });
      },
      clearLast(placeId) {
        set((s) => {
          if (!s.lastByPlace[placeId]) return s;
          const lastByPlace = { ...s.lastByPlace };
          delete lastByPlace[placeId];
          return { lastByPlace };
        });
      },
      setAskTabVisible(placeId, visible) {
        set((s) => {
          if (visible) return { visiblePlaceId: placeId };
          // 다른 placeId 가 이미 visible 이면 건드리지 않음(언마운트 순서 race 방지).
          return s.visiblePlaceId === placeId ? { visiblePlaceId: null } : s;
        });
      },
    }),
    {
      name: 'review-ask-v1',
      version: 1,
      // 마지막 Q&A 만 영속 — 진행 중/완료 이벤트/에러는 메모리.
      partialize: (s) => ({ lastByPlace: s.lastByPlace }),
      storage: createJSONStorage(() => resolveStorage()),
    },
  ),
);
