import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTarotSession } from '@repo/shared';
import { usePublicLayout } from '~/components/PublicLayout';
import { TarotLite } from '~/components/tarot/TarotLite';
import { TarotOverlay } from '~/components/tarot/TarotOverlay';
import { detectTarotRender } from '~/components/tarot/tarotQuality';
import { useMediaQuery } from '~/lib/useMediaQuery';

// 타로 — 로그인 없이 쓰는 공개 페이지. 흐름·해석 요청·게스트 기록은 @repo/shared 의 useTarotSession(앱 네이티브
// 화면과 공용), 무대는 WebGL2 면 3D(R3F, lazy 청크) 아니면 Lite. 해석 요청은 마지막 카드를 고른 순간(placing
// 진입) 보내고 플립 애니메이션이 대기를 덮는다. Lite 는 섞기·자리 잡기 연출이 없어 세션이 바로 다음 단계로 넘긴다.
// 딥링크: ?spread=menu(홈 카드·앱) · ?q=&topic=(사주 "타로로도 보기").

const TarotStage = lazy(() => import('~/components/tarot/TarotStage'));

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

  const lite = render.mode === 'lite';
  const session = useTarotSession({
    initial: { spread: params.get('spread'), q: params.get('q'), topic: params.get('topic') },
    instantShuffle: lite,
    instantPlace: lite,
  });
  const { state, callbacks } = session;

  const panelSide = isDesktop ? 'right' : 'bottom';
  const focusX = session.readingOpen && panelSide === 'right' ? 1.3 : 0;
  // 세로 화면은 패널이 아래를 덮으므로 시선을 내려 카드를 위쪽으로.
  const focusYOffset = session.readingOpen && panelSide === 'bottom' ? -2.2 : 0;

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
        send={session.send}
        onStart={session.start}
        onAutoPick={session.autoPick}
        onRetry={session.retry}
        onReset={session.reset}
        history={session.history}
        review={session.review}
        onReview={session.setReview}
        onRemoveHistory={session.removeHistory}
        isMember={session.isMember}
        todayDailyId={session.todayDailyId}
        panelSide={panelSide}
      />
    </div>
  );
};
