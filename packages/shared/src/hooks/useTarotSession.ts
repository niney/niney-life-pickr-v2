import { useCallback, useMemo, useReducer, useState } from 'react';
import type { CreateTarotReadingInputType, TarotDrawnCardType, TarotMenuVerdictType, TarotReadingResultType, TarotReadingSummaryType } from '@repo/api-contract';
import {
  createTarotFlowState,
  getTarotSpread,
  kstDayKey,
  newTarotSeed,
  selectTarotMenus,
  tarotFlowReducer,
  TAROT_MENU_CUISINE_LABEL,
  TAROT_MENU_DISH_LABEL,
  TAROT_QUESTION_MAX_LENGTH,
  TAROT_TOPICS,
  type TarotFlowEvent,
  type TarotFlowState,
  type TarotSpreadId,
  type TarotTopic,
} from '@repo/utils';
import { useAuthStore } from '../stores/authStore.js';
import { useTarotHistoryStore, type TarotHistoryEntry } from '../stores/tarotHistoryStore.js';
import { useCreateTarotReading, useMyTarotReadings } from './useTarot.js';

// 타로 세션 — 웹 TarotPage 와 앱 네이티브 화면이 공유하는 흐름 오케스트레이션. 화면은 무대·패널을 그리기만 한다.
//  - 흐름: utils 순수 리듀서(tarotFlowReducer) setup → shuffling → picking → placing → revealing → reading.
//  - 해석 요청은 마지막 카드를 고른 순간(placing 진입) 보내고, 자리 잡기·뒤집기 연출이 대기를 덮는다.
//    send() 는 dispatch 전에 같은 (state, event) 로 다음 상태를 미리 계산한다 — 리듀서가 시드 기반 결정적이라
//    dispatch 결과와 같고, placing 진입을 감지해 즉시 요청할 수 있다(useEffect 없이).
//  - 게스트 리딩은 서버에 저장하지 않아 기기 로컬 기록(tarotHistoryStore)에 남기고, 회원은 서버 기록.
//  - 회원의 오늘의 카드는 서버가 하루 1장으로 잠근다 — 오늘 이미 뽑았으면 그 기록 id(todayDailyId).
// 플랫폼 몫: 딥링크 파싱(앱·웹 라우터), 연출 유무(instantShuffle·instantPlace), 카드 뒤집기 연출.

export type TarotSessionState = TarotFlowState<TarotReadingResultType>;
export type TarotSessionEvent = TarotFlowEvent<TarotReadingResultType>;

/** 공유 근거 — 회원 저장분은 readingId, 게스트는 리딩 입력(서버가 본문을 다시 확보한다). */
export type TarotShareBase = { readingId: string } | { reading: CreateTarotReadingInputType };

/** 딥링크 — ?spread=menu(홈 카드) · ?q=&topic=(사주 "타로로도 보기"). */
export interface TarotDeepLink {
  spread: string | null;
  q: string | null;
  topic: string | null;
}

const reducer = (s: TarotSessionState, e: TarotSessionEvent): TarotSessionState => tarotFlowReducer(s, e);

/** 딥링크 → 첫 상태. 제공 중인(회원 전용 아닌) 스프레드만, 메뉴 타로는 주제가 food 로 잠긴다. 주제는 TAROT_TOPICS 안의 값만. */
export const tarotInitialState = (init: TarotDeepLink): TarotSessionState => {
  const spread = init.spread ? getTarotSpread(init.spread) : undefined;
  const spreadId: TarotSpreadId | undefined = spread?.available && !spread.memberOnly ? spread.id : undefined;
  const topic = init.topic && (TAROT_TOPICS as readonly string[]).includes(init.topic) ? (init.topic as TarotTopic) : undefined;
  const question = init.q?.trim().slice(0, TAROT_QUESTION_MAX_LENGTH) || undefined;
  return createTarotFlowState<TarotReadingResultType>({
    ...(spreadId ? { spreadId } : {}),
    ...(spreadId === 'menu' ? { topic: 'food' } : topic ? { topic } : {}),
    ...(question ? { question } : {}),
  });
};

const cardsOf = (drawn: readonly TarotDrawnCardType[]): TarotDrawnCardType[] =>
  drawn.map((d) => ({ cardId: d.cardId, position: d.position, reversed: d.reversed }));

/** 지금 상태의 공유 근거 — 결과가 오기 전이면 null. */
export const tarotShareBase = (state: TarotSessionState): TarotShareBase | null => {
  if (state.resultStatus !== 'ready' || !state.result) return null;
  if (state.result.readingId) return { readingId: state.result.readingId };
  return {
    reading: {
      spreadId: state.spreadId,
      topic: state.topic,
      question: state.question,
      choices: state.spreadId === 'choice' ? { a: state.choiceA.trim(), b: state.choiceB.trim() } : null,
      cards: cardsOf(state.drawn),
    },
  };
};

/** 게스트 기록 한 건의 공유 근거 — 저장된 입력 그대로. */
export const tarotHistoryShareBase = (entry: TarotHistoryEntry): TarotShareBase => ({
  reading: {
    spreadId: entry.result.spreadId,
    topic: entry.result.topic,
    question: entry.result.question,
    choices: entry.result.choices,
    cards: cardsOf(entry.cards),
  },
});

/** 결과 전 메뉴 후보 — 서버와 같은 utils 규칙(카드로 결정적)이라 결과의 후보와 일치한다. 이유·칼로리는 비움. */
export const tarotPreviewMenu = (drawn: readonly TarotDrawnCardType[]): TarotMenuVerdictType | null => {
  try {
    const s = selectTarotMenus(drawn);
    return {
      picks: s.picks.map((p) => ({
        menuId: p.id,
        name: p.name,
        cuisine: TAROT_MENU_CUISINE_LABEL[p.cuisine],
        dishType: TAROT_MENU_DISH_LABEL[p.dishType],
        kcal: null,
        reason: '',
      })),
      profile: s.profile,
      avoid: s.avoid,
    };
  } catch {
    return null;
  }
};

/** 메뉴 타로 상자에 보일 후보 — 결과가 오면 서버 후보(이유·칼로리 포함), 그 전엔 미리보기. 메뉴 타로가 아니면 null. */
export const tarotMenuOf = (
  spreadId: TarotSpreadId,
  drawn: readonly TarotDrawnCardType[],
  result: TarotReadingResultType | null,
): TarotMenuVerdictType | null => {
  if (spreadId !== 'menu' || drawn.length < 3) return null;
  return result ? result.menu : tarotPreviewMenu(drawn);
};

/** 회원 기록 중 오늘(KST) 뽑은 오늘의 카드 id. */
export const tarotTodayDailyId = (items: readonly Pick<TarotReadingSummaryType, 'id' | 'spreadId' | 'createdAt'>[], now: Date = new Date()): string | null => {
  const today = kstDayKey(now);
  return items.find((i) => i.spreadId === 'daily' && kstDayKey(new Date(i.createdAt)) === today)?.id ?? null;
};

export interface UseTarotSessionOptions {
  initial: TarotDeepLink;
  /** 섞기 연출이 없는 무대(웹 Lite·동작 줄이기) — 섞자마자 뽑기로. */
  instantShuffle?: boolean;
  /** 자리 잡기 연출이 없는 무대 — 다 고르면 바로 뒤집기 단계로. */
  instantPlace?: boolean;
}

export const useTarotSession = ({ initial, instantShuffle = false, instantPlace = false }: UseTarotSessionOptions) => {
  const [state, dispatch] = useReducer(reducer, initial, tarotInitialState);
  const { mutate } = useCreateTarotReading();
  const history = useTarotHistoryStore((s) => s.entries);
  const addHistory = useTarotHistoryStore((s) => s.add);
  const removeHistory = useTarotHistoryStore((s) => s.remove);
  const isMember = useAuthStore((s) => !!s.token);
  const [review, setReview] = useState<TarotHistoryEntry | null>(null);
  const mine = useMyTarotReadings(20);
  const todayDailyId = tarotTodayDailyId(mine.data?.items ?? []);

  const requestReading = useCallback(
    (s: TarotSessionState) => {
      dispatch({ type: 'request_sent' });
      const cards = cardsOf(s.drawn);
      mutate(
        {
          spreadId: s.spreadId,
          topic: s.topic,
          question: s.question,
          choices: s.spreadId === 'choice' ? { a: s.choiceA.trim(), b: s.choiceB.trim() } : null,
          cards,
        },
        {
          onSuccess: (result) => {
            dispatch({ type: 'result_ready', result });
            // 게스트(서버 저장 없음)만 기기 로컬 기록. 회원은 서버 기록.
            if (!result.readingId) addHistory(cards, result);
          },
          onError: () => dispatch({ type: 'result_failed' }),
        },
      );
    },
    [mutate, addHistory],
  );

  // 이벤트는 사용자 동작마다 하나씩 오고 그 사이에 렌더가 끝나므로 렌더 시점의 state 로 충분하다.
  const send = useCallback(
    (event: TarotSessionEvent) => {
      const prev = state;
      const next = reducer(prev, event);
      dispatch(event);
      if (prev.phase === 'picking' && next.phase === 'placing') {
        requestReading(next);
        if (instantPlace) dispatch({ type: 'placed' });
      }
      if (instantShuffle && event.type === 'shuffle' && next.phase === 'shuffling') dispatch({ type: 'shuffle_done' });
    },
    [state, requestReading, instantPlace, instantShuffle],
  );

  // 무대 콜백 — 카드 고르기와 연출이 끝났다는 신호. 연출 완료 셋은 늘 같은 참조라 화면의 연출 타이머가 결과 도착 같은
  // 다시 그리기로 리셋되지 않는다.
  const onShuffleDone = useCallback(() => dispatch({ type: 'shuffle_done' }), []);
  const onPlaced = useCallback(() => dispatch({ type: 'placed' }), []);
  const onRevealed = useCallback(() => dispatch({ type: 'reveal_next' }), []);
  const callbacks = useMemo(
    () => ({ onPick: (cardId: string) => send({ type: 'pick', cardId, seed: newTarotSeed() }), onShuffleDone, onPlaced, onRevealed }),
    [send, onShuffleDone, onPlaced, onRevealed],
  );

  const start = () => {
    setReview(null);
    send({ type: 'shuffle', seed: newTarotSeed() });
  };
  const autoPick = () => send({ type: 'auto_pick', seed: newTarotSeed() });
  const retry = () => {
    dispatch({ type: 'retry_result' });
    requestReading(state);
  };
  const reset = () => {
    setReview(null);
    dispatch({ type: 'reset' });
  };

  return {
    state,
    send,
    callbacks,
    start,
    autoPick,
    retry,
    reset,
    history,
    removeHistory,
    review,
    setReview,
    isMember,
    todayDailyId,
    /** 해석 패널이 열려 있는지(기록 리뷰 포함) — 무대가 카드를 위로 비켜 준다. */
    readingOpen: review !== null || state.phase === 'reading' || (state.phase === 'revealing' && state.revealed > 0),
    shareBase: tarotShareBase(state),
  };
};

export type TarotSession = ReturnType<typeof useTarotSession>;
