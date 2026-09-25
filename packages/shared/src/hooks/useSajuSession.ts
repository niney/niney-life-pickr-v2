import { useCallback, useReducer, useState } from 'react';
import type { SajuBirthInputType, SajuJobPollResultType, SajuReadingResultType, SajuThemesType } from '@repo/api-contract';
import { computeSajuChart, createSajuFlowState, SAJU_DEFAULT_OPTIONS, SajuInputError, sajuFlowReducer, type SajuBirthInput, type SajuFlowEvent, type SajuFlowState } from '@repo/utils';
import { isSajuThemeTab, type SajuPanelTab, type SajuSessionMode } from '../saju/sajuPanelTabs.js';
import { useAuthStore } from '../stores/authStore.js';
import { getPrimarySajuProfile, useSajuProfileStore } from '../stores/sajuProfileStore.js';
import { useCreateSajuReading, useCreateSajuThemes, useSajuJob, useSajuMatchQuery, useSajuThemeJob, useUpsertSajuProfile } from './useSaju.js';

// 사주(C) 세션 — 웹 SajuPage 와 앱 네이티브 화면이 공유하는 흐름 오케스트레이션. 화면은 무대·패널을 그리기만 한다.
//  - 흐름: utils 순수 리듀서(sajuFlowReducer) setup → casting → stamping → reading. 원국은 submit 에서 클라이언트가
//    계산해 연출을 바로 시작하고, 같은 순간 서버에 풀이를 요청한다.
//  - 풀이: 서버가 정적 본문 + jobId 를 즉시 주고, 섹션은 useSajuJob(long-poll)으로 도착 순 병합한다(렌더 중 파생).
//  - 테마(인연·재물·직업): 테마 탭을 처음 열 때 별도 job 으로 요청해 같은 방식으로 병합한다.
//  - 입구 모드 "내 사주 / 우리 궁합": 궁합은 연출 없이 결과(useSajuMatchQuery)로 간다.
//  - 프로필 저장: 회원은 계정(서버) 프로필, 게스트는 기기 로컬.
// 플랫폼 몫: 딥링크 파싱(sajuInitialTab·sajuInitialMode), 연출 유무(skipAnimation), 효과음 등 무대 부수효과.

export type SajuSessionState = SajuFlowState<SajuReadingResultType>;
export type SajuSessionEvent = SajuFlowEvent<SajuReadingResultType>;
export type SajuReadingStatus = 'pending' | 'partial' | 'ready' | 'failed' | 'gone';
export type SajuThemeStatus = 'idle' | 'pending' | 'partial' | 'ready' | 'failed' | 'gone';
export type SajuPairStatus = 'pending' | 'ready' | 'failed';

/** 입력 확정 때의 프로필 저장 요청 — 저장된 프로필(profileId)을 골라 그대로 썼으면 다시 저장하지 않는다. */
export interface SajuSaveRequest {
  enabled: boolean;
  label: string;
  profileId: string | null;
}

export interface SajuPairInput {
  a: SajuBirthInputType;
  b: SajuBirthInputType;
  labelB: string;
}

const reducer = (s: SajuSessionState, e: SajuSessionEvent): SajuSessionState => sajuFlowReducer(s, e);

/** 흐름 상태의 입력(utils, options 선택) → 계약 입력(options 필수). 폼·요청·프로필 저장이 쓴다. */
export const toSajuBirthInput = (b: SajuBirthInput): SajuBirthInputType => ({
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

/** 궁합 상대 기본값 — 나와 같은 해 1월 1일, 반대 성별, 시 모름. */
export const defaultSajuPartner = (me: SajuBirthInputType): SajuBirthInputType => ({
  ...me,
  month: 1,
  day: 1,
  leapMonth: false,
  gender: me.gender === 'M' ? 'F' : 'M',
  hour: null,
  minute: null,
});

/** 즉시 응답 + job 스냅샷(도착한 섹션·readingId·source) 병합. */
export const mergeSajuJobResult = (initial: SajuReadingResultType | undefined, job: SajuJobPollResultType | null): SajuReadingResultType | null =>
  initial ? (job ? { ...initial, sections: job.sections, readingId: job.readingId, source: job.source } : initial) : null;

export interface UseSajuSessionOptions {
  /** 딥링크로 정해진 첫 탭 — 풀이를 새로 시작할 때마다 이 탭으로 연다. */
  initialTab: SajuPanelTab;
  initialMode: SajuSessionMode;
  /** 연출이 없는 무대(웹 Lite 등) — 사주를 세우면 곧장 풀이로 간다. */
  skipAnimation?: boolean;
}

export const useSajuSession = ({ initialTab, initialMode, skipAnimation = false }: UseSajuSessionOptions) => {
  const [state, dispatch] = useReducer(reducer, undefined, () => createSajuFlowState<SajuReadingResultType>(getPrimarySajuProfile()?.birth ?? {}));
  const isMember = useAuthStore((s) => !!s.token);
  const upsertLocalProfile = useSajuProfileStore((s) => s.upsert);
  const { mutate: upsertServerProfile } = useUpsertSajuProfile();
  const { mutate, data: initial, error: mutationError, isPending, reset: resetMutation } = useCreateSajuReading();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useSajuJob(jobId);
  const [tab, setTab] = useState<SajuPanelTab>(initialTab);

  // ── 입구 모드 — 내 사주 / 우리 궁합 ─────────────────────────────────
  const [mode, setMode] = useState<SajuSessionMode>(initialMode);
  const [partner, setPartner] = useState<SajuBirthInputType>(() => defaultSajuPartner(toSajuBirthInput(state.input)));
  const [partnerLabel, setPartnerLabel] = useState('상대');
  const [pair, setPair] = useState<SajuPairInput | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const match = useSajuMatchQuery(pair ? { a: pair.a, b: pair.b, labels: { a: '나', b: pair.labelB } } : null);

  // ── 테마(인연·재물·직업) — 테마 탭을 처음 열 때 1회 요청 ─────────────
  // mutate·reset 은 react-query 가 안정 참조로 준다 — 구조 분해해 의존성에 그대로 쓴다.
  const { mutate: mutateThemes, data: themesData, error: themesError, isPending: themesPending, reset: resetThemes } = useCreateSajuThemes();
  const [themeJobId, setThemeJobId] = useState<string | null>(null);
  const themeJob = useSajuThemeJob(themeJobId);

  // 결과·상태는 렌더 중 파생 — useEffect 없음.
  const result = mergeSajuJobResult(initial, job.data);
  const status: SajuReadingStatus = mutationError
    ? 'failed'
    : isPending || !result
      ? 'pending'
      : job.gone
        ? 'gone'
        : jobId && !job.data?.done
          ? 'partial'
          : 'ready';
  // 테마 — 전체 풀이 응답에 캐시된 테마가 실려 오면 그대로, 아니면 테마 job 결과 병합.
  const themes: SajuThemesType | null = themeJob.data?.themes ?? themesData?.themes ?? result?.themes ?? null;
  const themeStatus: SajuThemeStatus = themesError
    ? 'failed'
    : themesPending
      ? 'pending'
      : !themes
        ? 'idle'
        : themeJob.gone
          ? 'gone'
          : themeJobId && !themeJob.data?.done
            ? 'partial'
            : 'ready';
  const pairStatus: SajuPairStatus = match.isError ? 'failed' : match.data ? 'ready' : 'pending';

  const request = useCallback(
    (birth: SajuBirthInput) => {
      resetMutation();
      setJobId(null);
      resetThemes();
      setThemeJobId(null);
      mutate({ birth: toSajuBirthInput(birth) }, { onSuccess: (r) => setJobId(r.jobId) });
    },
    [mutate, resetMutation, resetThemes],
  );

  const startReading = (from: SajuSessionState, save: SajuSaveRequest): boolean => {
    const next = reducer(from, { type: 'submit' });
    if (next.phase !== 'casting' || !next.chart) return false;
    setTab(initialTab);
    // 저장 — 회원은 계정(서버) 프로필, 게스트는 기기 로컬. 이미 저장된 프로필을 골라 썼으면 건너뛴다.
    if (save.enabled && !save.profileId) {
      const birth = toSajuBirthInput(next.input);
      if (isMember) upsertServerProfile({ input: { label: save.label, birth, isPrimary: false } });
      else upsertLocalProfile({ label: save.label, birth });
    }
    request(next.input);
    // 딥링크로 테마 탭부터 열리면 테마도 같이 요청(회원 병합은 readingId 가 아직 없어 건너뛴다).
    if (isSajuThemeTab(initialTab)) mutateThemes({ birth: toSajuBirthInput(next.input) }, { onSuccess: (r) => setThemeJobId(r.jobId) });
    if (skipAnimation) dispatch({ type: 'skip_animation' });
    return true;
  };

  /** 사주 세우기 — 입력이 틀리면 state.error 가 남고 false. */
  const submit = (save: SajuSaveRequest): boolean => {
    dispatch({ type: 'submit' });
    return startReading(state, save);
  };

  const edit = () => {
    dispatch({ type: 'edit' });
    resetMutation();
    setJobId(null);
    resetThemes();
    setThemeJobId(null);
  };

  const retry = () => request(state.input);

  // 궁합 — 두 입력을 클라이언트에서 먼저 검증(원국 계산)하고 결과로. 연출 없음.
  const submitPair = () => {
    const a = toSajuBirthInput(state.input);
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
  const editPair = () => setPair(null);
  /** 궁합 결과의 "내 사주 자세히 보기" — 나를 그대로 단독 풀이로. */
  const openSelfFromPair = (): boolean => {
    setPair(null);
    setMode('self');
    dispatch({ type: 'submit' });
    return startReading(state, { enabled: false, label: '나', profileId: null });
  };
  /** 인연 탭의 "이 사람과 궁합 보기" — 입구로 돌아가 궁합 모드(나는 그대로). */
  const openPairFromReading = () => {
    edit();
    setMode('pair');
  };

  const requestThemes = () => {
    if (!state.chart || themesPending || themesData || result?.themes) return;
    mutateThemes({ birth: toSajuBirthInput(state.input), readingId: result?.readingId ?? undefined }, { onSuccess: (r) => setThemeJobId(r.jobId) });
  };
  const retryThemes = () => {
    resetThemes();
    setThemeJobId(null);
    if (state.chart) mutateThemes({ birth: toSajuBirthInput(state.input), readingId: result?.readingId ?? undefined }, { onSuccess: (r) => setThemeJobId(r.jobId) });
  };

  const readingOpen = state.phase === 'reading' && !!state.chart;
  const pairOpen = mode === 'pair' && !!pair;

  return {
    state,
    /** 무대 이벤트(casting_done·stamp·skip_animation)와 입력 patch(set_input)용 — 안정 참조. */
    dispatch,
    isMember,
    birth: toSajuBirthInput(state.input),
    setInput: (patch: Partial<SajuBirthInput>) => dispatch({ type: 'set_input', patch }),
    submit,
    edit,
    retry,
    result,
    status,
    tab,
    setTab,
    themes,
    themeStatus,
    requestThemes,
    retryThemes,
    mode,
    setMode,
    partner,
    patchPartner: (patch: Partial<SajuBirthInputType>) => setPartner((p) => ({ ...p, ...patch })),
    partnerLabel,
    setPartnerLabel,
    pair,
    pairError,
    match,
    pairStatus,
    submitPair,
    editPair,
    openSelfFromPair,
    openPairFromReading,
    readingOpen,
    pairOpen,
    animating: state.phase === 'casting' || state.phase === 'stamping',
  };
};

export type SajuSession = ReturnType<typeof useSajuSession>;
