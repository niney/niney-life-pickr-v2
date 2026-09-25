import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Volume2, VolumeX } from 'lucide-react';
import { sajuInitialMode, sajuInitialTab, useSajuSession, type SajuSaveRequest } from '@repo/shared';
import { sajuStampTotal } from '@repo/utils';
import { usePublicLayout } from '~/components/PublicLayout';
import { SajuForm } from '~/components/saju/SajuForm';
import { SajuLite } from '~/components/saju/SajuLite';
import { SajuPairPanel } from '~/components/saju/SajuPairPanel';
import { playSajuChime, playSajuStamp, primeSajuSound, sajuSoundEnabled, setSajuSoundEnabled } from '~/components/saju/sajuSound';
import { SajuReadingPanel } from '~/components/saju/SajuReadingPanel';
import type { SajuStageCallbacks } from '~/components/saju/stage/SajuScene';
import { glass } from '~/components/saju/SajuForm';
import { detectTarotRender } from '~/components/tarot/tarotQuality';
import { useMediaQuery } from '~/lib/useMediaQuery';
import { cn } from '~/lib/utils';

// 사주 — 로그인 없이 쓰는 공개 페이지. 흐름·요청·병합·궁합·테마 오케스트레이션은 @repo/shared 의 useSajuSession
// (앱 네이티브 화면과 공용)이 맡고, 이 페이지는 무대(WebGL2 면 3D — R3F lazy 청크, 아니면 Lite 로 연출 건너뜀)와
// 패널을 그린다. 흐름: setup → casting → stamping → reading. 입구 모드 "내 사주 / 우리 궁합"(궁합은 연출 없이
// 결과 패널), 테마(인연·재물·직업)는 테마 탭을 처음 열 때 별도 job 으로 요청한다.

const SajuStage = lazy(() => import('~/components/saju/SajuStage'));

const StageFallback = () => (
  <div className="absolute inset-0 flex items-center justify-center bg-[#0b0b0f] text-[#e9e2d2]/60">
    <Loader2 className="mr-2 size-5 animate-spin text-[#d9b65b]" /> 천문도를 펼치는 중…
  </div>
);

// 3D 무대가 런타임에 죽어도(드라이버·셰이더·버그) 흰 화면 대신 Lite 로 — 풀이 패널은 그대로 산다.
class StageErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: unknown): void {
    console.error('[saju] 3D 무대 오류 — Lite 로 전환', error);
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const PHASE_TEXT = { casting: '천문도를 맞추는 중…', stamping: '인장을 찍는 중…' } as const;

export const SajuPage = () => {
  const { headerHeight } = usePublicLayout();
  const [params] = useSearchParams();
  const embed = params.get('embed') === '1';
  const [render] = useState(() => detectTarotRender());
  const isDesktop = useMediaQuery('(min-width: 64rem)', true);

  const session = useSajuSession({
    initialTab: sajuInitialTab(params.get('tab'), params.get('tool')),
    initialMode: sajuInitialMode(params.get('tool')),
    // Lite 는 연출이 없다 — 바로 풀이로.
    skipAnimation: render.mode === 'lite',
  });
  const { state, dispatch, tab, pair } = session;

  // 효과음은 웹 무대만의 몫 — 풀이가 시작되는 제스처(클릭) 안에서 오디오 컨텍스트를 준비한다.
  const onSubmit = (save: SajuSaveRequest) => {
    if (session.submit(save)) primeSajuSound();
  };
  const onPairDetail = () => {
    if (session.openSelfFromPair()) primeSajuSound();
  };

  const callbacks = useMemo<SajuStageCallbacks>(
    () => ({
      onCastingDone: () => {
        playSajuChime();
        dispatch({ type: 'casting_done' });
      },
      onStamp: () => {
        playSajuStamp();
        dispatch({ type: 'stamp' });
      },
    }),
    [dispatch],
  );
  // 효과음 — 기본 꺼짐, 기기에 기억. 토글 클릭(제스처)에서 오디오 컨텍스트를 만든다.
  const [sound, setSound] = useState(sajuSoundEnabled);
  const toggleSound = () => {
    const next = !sound;
    setSajuSoundEnabled(next);
    setSound(next);
  };

  const panelSide = isDesktop ? 'right' : 'bottom';
  const { readingOpen, pairOpen, animating } = session;
  // 패널이 오른쪽 30~34rem 을 차지하므로 시선을 조금 더 오른쪽으로.
  const focusX = (readingOpen || pairOpen) && panelSide === 'right' ? 1.7 : 0;
  const focusYOffset = (readingOpen || pairOpen) && panelSide === 'bottom' ? 1.6 : 0;

  return (
    <div className="relative overflow-hidden bg-[#0b0b0f] text-[#e9e2d2]" style={{ height: `calc(100dvh - ${embed ? 0 : headerHeight}px)` }} data-saju-mode={render.mode}>
      {render.mode === '3d' ? (
        <StageErrorBoundary fallback={<SajuLite chart={state.chart} phase={state.phase} />}>
          <Suspense fallback={<StageFallback />}>
            <SajuStage
              phase={state.phase}
              chart={state.chart}
              stamped={state.stamped}
              quality={render.quality}
              focusX={focusX}
              focusYOffset={focusYOffset}
              focus={readingOpen && tab === 'elements' ? 'elements' : 'none'}
              callbacks={callbacks}
            />
          </Suspense>
        </StageErrorBoundary>
      ) : (
        <SajuLite chart={state.chart} phase={state.phase} />
      )}

      <div className="pointer-events-none absolute inset-0">
        {render.mode === '3d' && (
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={sound}
            aria-label={sound ? '효과음 끄기' : '효과음 켜기'}
            title={sound ? '효과음 켜짐 — 인장·다이얼 소리' : '효과음 꺼짐'}
            className={cn(glass, 'pointer-events-auto absolute left-3 top-3 flex size-9 items-center justify-center rounded-full', sound ? 'text-[#d9b65b]' : 'text-[#e9e2d2]/50')}
          >
            {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
        )}
        {state.phase === 'setup' && !pairOpen && (
          <SajuForm
            mode={session.mode}
            onMode={session.setMode}
            input={session.birth}
            error={session.mode === 'pair' ? session.pairError : state.error}
            isMember={session.isMember}
            onChange={session.setInput}
            onSubmit={onSubmit}
            partner={session.partner}
            partnerLabel={session.partnerLabel}
            onPartnerChange={session.patchPartner}
            onPartnerLabel={session.setPartnerLabel}
            onSubmitPair={session.submitPair}
          />
        )}
        {pairOpen && pair && (
          <SajuPairPanel
            labels={{ a: '나', b: pair.labelB }}
            result={session.match.data ?? null}
            status={session.pairStatus}
            side={panelSide}
            onRetry={() => void session.match.refetch()}
            onEdit={session.editPair}
            onDetail={onPairDetail}
          />
        )}
        {animating && (
          <div className={cn(glass, 'pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 px-3 py-2 text-xs sm:text-sm')}>
            <Loader2 className="size-4 animate-spin text-[#d9b65b]" />
            <span>
              {PHASE_TEXT[state.phase as 'casting' | 'stamping']}
              {state.phase === 'stamping' && ` ${state.stamped}/${sajuStampTotal(state.chart)}`}
            </span>
            <button type="button" onClick={() => dispatch({ type: 'skip_animation' })} className="rounded px-2 py-0.5 text-[11px] text-[#e9e2d2]/60 hover:text-[#e9e2d2]">
              건너뛰기
            </button>
          </div>
        )}
        {readingOpen && state.chart && (
          <SajuReadingPanel
            chart={state.chart}
            birth={session.birth}
            result={session.result}
            status={session.status}
            themes={session.themes}
            themeStatus={session.themeStatus}
            animate={render.mode === '3d'}
            side={panelSide}
            tab={tab}
            onTab={session.setTab}
            onOpenThemes={session.requestThemes}
            onRetryThemes={session.retryThemes}
            onRetry={session.retry}
            onEdit={session.edit}
            onPair={session.openPairFromReading}
          />
        )}
      </div>
    </div>
  );
};
