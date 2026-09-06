import { Component, lazy, Suspense, useCallback, useMemo, useReducer, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { SajuReadingResultType } from '@repo/api-contract';
import { getPrimarySajuProfile, useAuthStore, useCreateSajuReading, useSajuJob, useSajuProfileStore, useUpsertSajuProfile } from '@repo/shared';
import { createSajuFlowState, SAJU_DEFAULT_OPTIONS, sajuFlowReducer, sajuStampTotal, type SajuBirthInput, type SajuFlowEvent, type SajuFlowState } from '@repo/utils';
import type { SajuBirthInputType } from '@repo/api-contract';
import { usePublicLayout } from '~/components/PublicLayout';
import { SajuForm } from '~/components/saju/SajuForm';
import { SajuLite } from '~/components/saju/SajuLite';
import { SajuReadingPanel, type SajuPanelTab } from '~/components/saju/SajuReadingPanel';
import type { SajuStageCallbacks } from '~/components/saju/stage/SajuScene';
import { glass } from '~/components/saju/SajuForm';
import { detectTarotRender } from '~/components/tarot/tarotQuality';
import { useMediaQuery } from '~/lib/useMediaQuery';
import { cn } from '~/lib/utils';

// 사주 — 로그인 없이 쓰는 공개 페이지. 흐름은 utils 의 순수 리듀서(sajuFlowReducer): setup → casting → stamping →
// reading. 원국은 submit 에서 클라이언트가 계산해 연출을 바로 시작하고, 같은 순간 서버에 풀이를 요청한다.
// 서버는 정적 본문 + jobId 를 즉시 주고, 섹션은 useSajuJob(long-poll)으로 도착 순 병합한다.
// 무대는 WebGL2 면 3D(R3F, lazy 청크) 아니면 Lite(연출 건너뜀). 품질 판정은 타로와 공용.

const SajuStage = lazy(() => import('~/components/saju/SajuStage'));

type State = SajuFlowState<SajuReadingResultType>;
type Event = SajuFlowEvent<SajuReadingResultType>;
const reducer = (s: State, e: Event): State => sajuFlowReducer(s, e);

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

// 흐름 상태의 입력(utils, options 선택) → 계약 입력(options 필수). 폼·요청·프로필 저장이 쓴다.
const toBirthInput = (b: SajuBirthInput): SajuBirthInputType => ({
  calendar: b.calendar,
  year: b.year,
  month: b.month,
  day: b.day,
  leapMonth: !!b.leapMonth,
  hour: b.hour,
  minute: b.hour === null ? null : (b.minute ?? 0),
  gender: b.gender,
  options: { ...SAJU_DEFAULT_OPTIONS, ...(b.options ?? {}) },
});

export const SajuPage = () => {
  const { headerHeight } = usePublicLayout();
  const [params] = useSearchParams();
  const embed = params.get('embed') === '1';
  const [render] = useState(() => detectTarotRender());
  const isDesktop = useMediaQuery('(min-width: 64rem)', true);

  const [state, dispatch] = useReducer(reducer, undefined, () => createSajuFlowState<SajuReadingResultType>(getPrimarySajuProfile()?.birth ?? {}));
  const isMember = useAuthStore((s) => !!s.token);
  const upsertLocalProfile = useSajuProfileStore((s) => s.upsert);
  const upsertServerProfile = useUpsertSajuProfile();
  const { mutate, data: initial, error: mutationError, isPending, reset: resetMutation } = useCreateSajuReading();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useSajuJob(jobId);
  // ?tool=daily|food|date|match 딥링크(앱 홈 카드) — 풀이가 열리면 그 탭부터.
  const toolParam = params.get('tool');
  const initialTab: SajuPanelTab = toolParam === 'daily' || toolParam === 'food' || toolParam === 'date' || toolParam === 'match' ? toolParam : 'chart';
  const [tab, setTab] = useState<SajuPanelTab>(initialTab);

  // 결과 = 즉시 응답 + job 스냅샷(도착한 섹션·readingId·source) 병합. 렌더 중 파생, useEffect 없음.
  const result: SajuReadingResultType | null = initial
    ? job.data
      ? { ...initial, sections: job.data.sections, readingId: job.data.readingId, source: job.data.source }
      : initial
    : null;
  const status: 'pending' | 'partial' | 'ready' | 'failed' | 'gone' = mutationError
    ? 'failed'
    : isPending || !result
      ? 'pending'
      : job.gone
        ? 'gone'
        : jobId && !job.data?.done
          ? 'partial'
          : 'ready';

  const request = useCallback(
    (birth: State['input']) => {
      resetMutation();
      setJobId(null);
      mutate({ birth: toBirthInput(birth) }, { onSuccess: (r) => setJobId(r.jobId) });
    },
    [mutate, resetMutation],
  );

  const onSubmit = (save: { enabled: boolean; label: string; profileId: string | null }) => {
    const next = reducer(state, { type: 'submit' });
    dispatch({ type: 'submit' });
    if (next.phase !== 'casting' || !next.chart) return;
    setTab(initialTab);
    // 저장 — 회원은 계정(서버) 프로필, 게스트는 기기 로컬. 이미 저장된 프로필을 골라 썼으면 건너뛴다.
    if (save.enabled && !save.profileId) {
      if (isMember) upsertServerProfile.mutate({ input: { label: save.label, birth: toBirthInput(next.input), isPrimary: false } });
      else upsertLocalProfile({ label: save.label, birth: toBirthInput(next.input) });
    }
    request(next.input);
    // Lite 는 연출이 없다 — 바로 풀이로.
    if (render.mode === 'lite') dispatch({ type: 'skip_animation' });
  };

  const callbacks = useMemo<SajuStageCallbacks>(
    () => ({ onCastingDone: () => dispatch({ type: 'casting_done' }), onStamp: () => dispatch({ type: 'stamp' }) }),
    [],
  );
  const onEdit = () => {
    dispatch({ type: 'edit' });
    resetMutation();
    setJobId(null);
  };
  const onRetry = () => request(state.input);

  const panelSide = isDesktop ? 'right' : 'bottom';
  const readingOpen = state.phase === 'reading' && !!state.chart;
  // 패널이 오른쪽 30~34rem 을 차지하므로 시선을 조금 더 오른쪽으로.
  const focusX = readingOpen && panelSide === 'right' ? 1.7 : 0;
  const focusYOffset = readingOpen && panelSide === 'bottom' ? 1.6 : 0;
  const animating = state.phase === 'casting' || state.phase === 'stamping';

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
        {state.phase === 'setup' && (
          <SajuForm input={toBirthInput(state.input)} error={state.error} isMember={isMember} onChange={(patch) => dispatch({ type: 'set_input', patch })} onSubmit={onSubmit} />
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
            birth={toBirthInput(state.input)}
            result={result}
            status={status}
            animate={render.mode === '3d'}
            side={panelSide}
            tab={tab}
            onTab={setTab}
            onRetry={onRetry}
            onEdit={onEdit}
          />
        )}
      </div>
    </div>
  );
};
