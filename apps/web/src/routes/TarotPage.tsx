import { lazy, Suspense, useCallback, useMemo, useReducer, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { TarotReadingResultType } from '@repo/api-contract';
import {
  useAuthStore,
  useCreateTarotReading,
  useMyTarotReadings,
  useTarotHistoryStore,
  type TarotHistoryEntry,
} from '@repo/shared';
import {
  createTarotFlowState,
  getTarotSpread,
  newTarotSeed,
  tarotFlowReducer,
  type TarotFlowEvent,
  type TarotFlowState,
  type TarotSpreadId,
} from '@repo/utils';
import { usePublicLayout } from '~/components/PublicLayout';
import { TarotLite } from '~/components/tarot/TarotLite';
import { TarotOverlay } from '~/components/tarot/TarotOverlay';
import type { StageCallbacks } from '~/components/tarot/stage/StageContext';
import { detectTarotRender } from '~/components/tarot/tarotQuality';
import { useMediaQuery } from '~/lib/useMediaQuery';

// 타로 — 로그인 없이 쓰는 공개 페이지. 흐름은 utils 의 순수 리듀서(tarotFlowReducer), 무대는
// WebGL2 면 3D(R3F, lazy 청크) 아니면 Lite. 해석 요청은 마지막 카드를 고른 순간(placing 진입)
// 보내고 플립 애니메이션이 대기를 덮는다.
//
// send() 는 dispatch 전에 같은 (state, event) 로 다음 상태를 미리 계산한다 — 리듀서가 시드 기반
// 결정적이라 dispatch 결과와 같고, placing 진입을 감지해 즉시 API 를 보낼 수 있다(useEffect 없이).

const TarotStage = lazy(() => import('~/components/tarot/TarotStage'));

type State = TarotFlowState<TarotReadingResultType>;
type Event = TarotFlowEvent<TarotReadingResultType>;

const reducer = (s: State, e: Event): State => tarotFlowReducer(s, e);

// ?spread=menu 같은 딥링크(홈 카드·앱 임베드) — 제공 중인 스프레드만 받는다. 메뉴 타로는 주제가 food 로 잠긴다.
const initialState = (spreadParam: string | null): State => {
  const spread = spreadParam ? getTarotSpread(spreadParam) : undefined;
  const spreadId: TarotSpreadId | undefined = spread?.available && !spread.memberOnly ? spread.id : undefined;
  return createTarotFlowState<TarotReadingResultType>({
    ...(spreadId ? { spreadId } : {}),
    ...(spreadId === 'menu' ? { topic: 'food' } : {}),
  });
};

const StageFallback = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-[#05071a] text-[#ece6d6]/60">
    <Loader2 className="mr-2 size-5 animate-spin text-[#d9b65b]" /> 무대를 준비하는 중…
  </div>
);

export const TarotPage = () => {
  const { headerHeight } = usePublicLayout();
  const [params] = useSearchParams();
  const embed = params.get('embed') === '1';
  const [render] = useState(() => detectTarotRender());
  const isDesktop = useMediaQuery('(min-width: 64rem)', true);

  const [state, dispatch] = useReducer(reducer, params.get('spread'), initialState);

  const { mutate } = useCreateTarotReading();
  const history = useTarotHistoryStore((s) => s.entries);
  const addHistory = useTarotHistoryStore((s) => s.add);
  const removeHistory = useTarotHistoryStore((s) => s.remove);
  const isMember = useAuthStore((s) => !!s.token);
  const [review, setReview] = useState<TarotHistoryEntry | null>(null);
  // 회원의 오늘 오늘의 카드(서버 하루 1장 잠금) — 있으면 daily 재뽑기 대신 기록으로 안내.
  const mine = useMyTarotReadings(20);
  const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const todayDailyId =
    mine.data?.items.find(
      (i) => i.spreadId === 'daily' && new Date(i.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) === todayKst,
    )?.id ?? null;

  const requestReading = useCallback(
    (s: State) => {
      dispatch({ type: 'request_sent' });
      const cards = s.drawn.map((d) => ({ cardId: d.cardId, position: d.position, reversed: d.reversed }));
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
    (event: Event) => {
      const prev = state;
      const next = reducer(prev, event);
      dispatch(event);
      if (prev.phase === 'picking' && next.phase === 'placing') {
        requestReading(next);
        // Lite 는 자리 잡기 애니메이션이 없다 — 바로 리빌 단계로.
        if (render.mode === 'lite') dispatch({ type: 'placed' });
      }
      if (render.mode === 'lite' && event.type === 'shuffle' && next.phase === 'shuffling') {
        dispatch({ type: 'shuffle_done' });
      }
    },
    [state, requestReading, render.mode],
  );

  const callbacks = useMemo<StageCallbacks>(
    () => ({
      onPick: (cardId) => send({ type: 'pick', cardId, seed: newTarotSeed() }),
      onShuffleDone: () => dispatch({ type: 'shuffle_done' }),
      onPlaced: () => dispatch({ type: 'placed' }),
      onRevealed: () => dispatch({ type: 'reveal_next' }),
    }),
    [send],
  );

  const onStart = () => {
    setReview(null);
    send({ type: 'shuffle', seed: newTarotSeed() });
  };
  const onAutoPick = () => send({ type: 'auto_pick', seed: newTarotSeed() });
  const onRetry = () => {
    dispatch({ type: 'retry_result' });
    requestReading(state);
  };
  const onReset = () => {
    setReview(null);
    dispatch({ type: 'reset' });
  };

  const panelSide = isDesktop ? 'right' : 'bottom';
  const readingOpen = review !== null || state.phase === 'reading' || (state.phase === 'revealing' && state.revealed > 0);
  const focusX = readingOpen && panelSide === 'right' ? 1.3 : 0;
  // 세로 화면은 패널이 아래를 덮으므로 시선을 내려 카드를 위쪽으로.
  const focusYOffset = readingOpen && panelSide === 'bottom' ? -2.2 : 0;

  return (
    <div
      className="relative overflow-hidden bg-[#05071a] text-[#ece6d6]"
      style={{ height: `calc(100dvh - ${embed ? 0 : headerHeight}px)` }}
      data-tarot-mode={render.mode}
    >
      {render.mode === '3d' ? (
        <Suspense fallback={<StageFallback />}>
          <TarotStage
            state={state}
            quality={render.quality}
            focusX={focusX}
            focusYOffset={focusYOffset}
            callbacks={callbacks}
          />
        </Suspense>
      ) : (
        <TarotLite state={state} onPick={callbacks.onPick} onRevealNext={callbacks.onRevealed} />
      )}
      <TarotOverlay
        state={state}
        mode={render.mode}
        send={send}
        onStart={onStart}
        onAutoPick={onAutoPick}
        onRetry={onRetry}
        onReset={onReset}
        history={history}
        review={review}
        onReview={setReview}
        onRemoveHistory={removeHistory}
        isMember={isMember}
        todayDailyId={todayDailyId}
        panelSide={panelSide}
      />
    </div>
  );
};
