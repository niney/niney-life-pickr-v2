import { Component, lazy, Suspense, useCallback, useMemo, useReducer, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Volume2, VolumeX } from 'lucide-react';
import type { SajuBirthInputType, SajuReadingResultType, SajuThemesType } from '@repo/api-contract';
import { getPrimarySajuProfile, useAuthStore, useCreateSajuReading, useCreateSajuThemes, useSajuJob, useSajuMatchQuery, useSajuProfileStore, useSajuThemeJob, useUpsertSajuProfile } from '@repo/shared';
import { computeSajuChart, createSajuFlowState, SAJU_DEFAULT_OPTIONS, SajuInputError, sajuFlowReducer, sajuStampTotal, type SajuBirthInput, type SajuFlowEvent, type SajuFlowState } from '@repo/utils';
import { usePublicLayout } from '~/components/PublicLayout';
import { SajuForm, type SajuFormMode } from '~/components/saju/SajuForm';
import { SajuLite } from '~/components/saju/SajuLite';
import { SajuPairPanel } from '~/components/saju/SajuPairPanel';
import { playSajuChime, playSajuStamp, primeSajuSound, sajuSoundEnabled, setSajuSoundEnabled } from '~/components/saju/sajuSound';
import { SajuReadingPanel } from '~/components/saju/SajuReadingPanel';
import { isSajuPanelTab, isSajuThemeTab, type SajuPanelTab } from '~/components/saju/sajuPanelTabs';
import type { SajuStageCallbacks } from '~/components/saju/stage/SajuScene';
import { glass } from '~/components/saju/SajuForm';
import type { SajuThemeStatus } from '~/components/saju/SajuThemes';
import { detectTarotRender } from '~/components/tarot/tarotQuality';
import { useMediaQuery } from '~/lib/useMediaQuery';
import { cn } from '~/lib/utils';

// 사주 — 로그인 없이 쓰는 공개 페이지. 흐름은 utils 의 순수 리듀서(sajuFlowReducer): setup → casting → stamping →
// reading. 원국은 submit 에서 클라이언트가 계산해 연출을 바로 시작하고, 같은 순간 서버에 풀이를 요청한다.
// 서버는 정적 본문 + jobId 를 즉시 주고, 섹션은 useSajuJob(long-poll)으로 도착 순 병합한다.
// 8차: 입구 모드 "내 사주 / 우리 궁합"(궁합은 연출 없이 결과 패널), 테마(인연·재물·직업)는 테마 탭을 처음 열 때
// 별도 job 으로 요청해 같은 방식으로 병합한다. 무대는 WebGL2 면 3D(R3F, lazy 청크) 아니면 Lite(연출 건너뜀).

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

// ?tool= 딥링크(앱 홈 카드·이전 링크) → 8차 탭/모드. match 는 입구 궁합 모드.
const TOOL_TAB: Record<string, SajuPanelTab> = { daily: 'daily', food: 'food', date: 'date', love: 'love', wealth: 'wealth', career: 'career' };

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
  const toolParam = params.get('tool');
  const tabParam = params.get('tab');
  const initialTab: SajuPanelTab = isSajuPanelTab(tabParam) ? tabParam : (toolParam && TOOL_TAB[toolParam]) || 'chart';
  const [tab, setTab] = useState<SajuPanelTab>(initialTab);

  // ── 입구 모드 — 내 사주 / 우리 궁합 ─────────────────────────────────
  const [mode, setMode] = useState<SajuFormMode>(toolParam === 'match' ? 'pair' : 'self');
  const [partner, setPartner] = useState<SajuBirthInputType>(() => {
    const me = toBirthInput(state.input);
    return { ...me, month: 1, day: 1, leapMonth: false, gender: me.gender === 'M' ? 'F' : 'M', hour: null, minute: null };
  });
  const [partnerLabel, setPartnerLabel] = useState('상대');
  const [pair, setPair] = useState<{ a: SajuBirthInputType; b: SajuBirthInputType; labelB: string } | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const match = useSajuMatchQuery(pair ? { a: pair.a, b: pair.b, labels: { a: '나', b: pair.labelB } } : null);

  // ── 테마(인연·재물·직업) — 테마 탭을 처음 열 때 1회 요청 ─────────────
  const themesMutation = useCreateSajuThemes();
  const [themeJobId, setThemeJobId] = useState<string | null>(null);
  const themeJob = useSajuThemeJob(themeJobId);

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
  // 테마 — 전체 풀이 응답에 캐시된 테마가 실려 오면 그대로, 아니면 테마 job 결과 병합.
  const themes: SajuThemesType | null = themeJob.data?.themes ?? themesMutation.data?.themes ?? result?.themes ?? null;
  const themeStatus: SajuThemeStatus = themesMutation.error
    ? 'failed'
    : themesMutation.isPending
      ? 'pending'
      : !themes
        ? 'idle'
        : themeJob.gone
          ? 'gone'
          : themeJobId && !themeJob.data?.done
            ? 'partial'
            : 'ready';

  const request = useCallback(
    (birth: State['input']) => {
      resetMutation();
      setJobId(null);
      themesMutation.reset();
      setThemeJobId(null);
      mutate({ birth: toBirthInput(birth) }, { onSuccess: (r) => setJobId(r.jobId) });
    },
    // themesMutation.reset 은 안정 참조(react-query) — 객체 전체를 의존성에 넣으면 매 렌더 재생성된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate, resetMutation],
  );

  const startReading = (from: State, save: { enabled: boolean; label: string; profileId: string | null }) => {
    const next = reducer(from, { type: 'submit' });
    if (next.phase !== 'casting' || !next.chart) return false;
    setTab(initialTab);
    // 저장 — 회원은 계정(서버) 프로필, 게스트는 기기 로컬. 이미 저장된 프로필을 골라 썼으면 건너뛴다.
    if (save.enabled && !save.profileId) {
      if (isMember) upsertServerProfile.mutate({ input: { label: save.label, birth: toBirthInput(next.input), isPrimary: false } });
      else upsertLocalProfile({ label: save.label, birth: toBirthInput(next.input) });
    }
    request(next.input);
    // 딥링크로 테마 탭부터 열리면 테마도 같이 요청(회원 병합은 readingId 가 아직 없어 건너뛴다).
    if (isSajuThemeTab(initialTab)) themesMutation.mutate({ birth: toBirthInput(next.input) }, { onSuccess: (r) => setThemeJobId(r.jobId) });
    primeSajuSound();
    // Lite 는 연출이 없다 — 바로 풀이로.
    if (render.mode === 'lite') dispatch({ type: 'skip_animation' });
    return true;
  };

  const onSubmit = (save: { enabled: boolean; label: string; profileId: string | null }) => {
    dispatch({ type: 'submit' });
    startReading(state, save);
  };

  // 궁합 — 두 입력을 클라이언트에서 먼저 검증(원국 계산)하고 결과 패널로. 연출 없음.
  const onSubmitPair = () => {
    const a = toBirthInput(state.input);
    try {
      computeSajuChart(a);
      computeSajuChart(partner);
    } catch (e) {
      setPairError(e instanceof SajuInputError ? e.message : '사주를 세울 수 없는 입력이에요.');
      return;
    }
    setPairError(null);
    setPair({ a, b: partner, labelB: partnerLabel.trim() || '상대' });
  };
  const onPairEdit = () => setPair(null);
  // 궁합 결과에서 "내 사주 자세히 보기" — 나를 그대로 단독 풀이로.
  const onPairDetail = () => {
    setPair(null);
    setMode('self');
    dispatch({ type: 'submit' });
    startReading(state, { enabled: false, label: '나', profileId: null });
  };
  // 인연 탭 "이 사람과 궁합 보기" — 입구로 돌아가 궁합 모드(나는 그대로).
  const onPair = () => {
    onEdit();
    setMode('pair');
  };

  const requestThemes = () => {
    if (!state.chart || themesMutation.isPending || themesMutation.data || result?.themes) return;
    themesMutation.mutate({ birth: toBirthInput(state.input), readingId: result?.readingId ?? undefined }, { onSuccess: (r) => setThemeJobId(r.jobId) });
  };
  const onRetryThemes = () => {
    themesMutation.reset();
    setThemeJobId(null);
    if (state.chart) themesMutation.mutate({ birth: toBirthInput(state.input), readingId: result?.readingId ?? undefined }, { onSuccess: (r) => setThemeJobId(r.jobId) });
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
    [],
  );
  // 효과음 — 기본 꺼짐, 기기에 기억. 토글 클릭(제스처)에서 오디오 컨텍스트를 만든다.
  const [sound, setSound] = useState(sajuSoundEnabled);
  const toggleSound = () => {
    const next = !sound;
    setSajuSoundEnabled(next);
    setSound(next);
  };
  const onEdit = () => {
    dispatch({ type: 'edit' });
    resetMutation();
    setJobId(null);
    themesMutation.reset();
    setThemeJobId(null);
  };
  const onRetry = () => request(state.input);

  const panelSide = isDesktop ? 'right' : 'bottom';
  const readingOpen = state.phase === 'reading' && !!state.chart;
  const pairOpen = mode === 'pair' && !!pair;
  // 패널이 오른쪽 30~34rem 을 차지하므로 시선을 조금 더 오른쪽으로.
  const focusX = (readingOpen || pairOpen) && panelSide === 'right' ? 1.7 : 0;
  const focusYOffset = (readingOpen || pairOpen) && panelSide === 'bottom' ? 1.6 : 0;
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
            mode={mode}
            onMode={setMode}
            input={toBirthInput(state.input)}
            error={mode === 'pair' ? pairError : state.error}
            isMember={isMember}
            onChange={(patch) => dispatch({ type: 'set_input', patch })}
            onSubmit={onSubmit}
            partner={partner}
            partnerLabel={partnerLabel}
            onPartnerChange={(patch) => setPartner((p) => ({ ...p, ...patch }))}
            onPartnerLabel={setPartnerLabel}
            onSubmitPair={onSubmitPair}
          />
        )}
        {pairOpen && (
          <SajuPairPanel
            labels={{ a: '나', b: pair.labelB }}
            result={match.data ?? null}
            status={match.isError ? 'failed' : match.data ? 'ready' : 'pending'}
            side={panelSide}
            onRetry={() => void match.refetch()}
            onEdit={onPairEdit}
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
            birth={toBirthInput(state.input)}
            result={result}
            status={status}
            themes={themes}
            themeStatus={themeStatus}
            animate={render.mode === '3d'}
            side={panelSide}
            tab={tab}
            onTab={setTab}
            onOpenThemes={requestThemes}
            onRetryThemes={onRetryThemes}
            onRetry={onRetry}
            onEdit={onEdit}
            onPair={onPair}
          />
        )}
      </div>
    </div>
  );
};
