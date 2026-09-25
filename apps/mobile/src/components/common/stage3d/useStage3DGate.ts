import { useCallback, useEffect, useState } from 'react';
import { loadStage3DVerdict, peekStage3DVerdict, saveStage3DVerdict, type Stage3DScope } from './stage3dVerdict';

// 3D 무대 문지기 — 무대를 3D 로 보여 줄지, 캔버스를 언제 올리고 내릴지를 정한다(사주·타로 화면 공용).
// 입력 화면의 무대 자리(hero)는 방문마다 한 번 정해 끝까지 간다 — 도중에 2D → 3D 로 바뀌지 않게.
//   pending  자리를 비워 두고 3D 준비를 기다린다 — 처음 보는 기기 0.9초, 3D 로 기억된 기기 2.5초.
//   3d       기다리는 사이 준비됐다(첫 프레임 실측 통과) — 캔버스가 나타난다.
//   2d       3D 를 안 쓰거나(모듈 없음·Android·동작 줄이기·"느림"으로 기억된 기기), 늦었거나, 실패했다.
// 늦어서 2D 로 정한 뒤에도 캔버스는 판정이 끝날 때까지(최대 8초) 투명하게 그려 기기 판정을 남긴다(다음 방문부터 바로).
// 연출 무대(stage3D)는 입력 화면을 떠나는 렌더에서 정해 다시 돌아올 때까지 간다 — 무대 자리가 3D 로 정해졌고 캔버스가
// 준비됐으면 3D. 같은 렌더에서 정해야 그 렌더의 mount 가 결정과 어긋나지 않는다. 연출 여부(performing)는 화면이 렌더
// 중에 계산한 값(사주 holding 등)이라 한 렌더 안에서 잠깐 뒤집힐 수 있어 결정 시점으로 쓰지 않는다.
// 준비 표시(ready)는 캔버스가 첫 프레임 실측을 통과하면 켜고, 캔버스가 실제로 내려가면(onLost — 커밋된 unmount) 끈다.
// 렌더 중 비교로 끄면 버려지는 렌더 패스의 잠깐 뒤집힌 값에도 꺼져, 캔버스는 그대로인데 준비를 다시 알리지 않는다.
// 개발 빌드 ?stage=3d 는 판정 없이 끝까지 기다려 3D, ?stage=2d 는 2D(판정을 읽지도 쓰지도 않는다).

export type Stage3DHeroMode = 'pending' | '3d' | '2d';

/** 무대 자리를 비워 두고 3D 준비를 기다리는 시간 — 처음 보는 기기 / 3D 로 기억된 기기. 넘기면 이번 방문은 2D. */
const HERO_WAIT_MS = { unknown: 900, ok: 2500 } as const;
/** 2D 로 정한 뒤에도 기기 판정을 마저 재는 한도 — 넘기면 판정 없이 캔버스를 내린다. */
const PROBE_GIVE_UP_MS = 8000;

export interface Stage3DGateInput {
  scope: Stage3DScope;
  /** 3D 무대 모듈을 쓸 수 있는 빌드(STAGE_3D_AVAILABLE 이고 모듈을 불러왔다). */
  available: boolean;
  /** 개발 빌드 전용 ?stage= 값(운영은 null). */
  stageParam: string | null;
  reduceMotion: boolean;
  /** 무대 영역 크기를 쟀는지 — 캔버스는 그 뒤에 올린다. */
  layoutReady: boolean;
  /** 입력 화면의 무대 자리가 보이는 중. 떠나는 렌더에서 연출 무대를 3D·2D 로 정한다. */
  inHero: boolean;
  /** 연출이 진행 중 — 3D 로 정해졌으면 그 동안 캔버스를 올려 둔다. */
  performing: boolean;
}

export interface Stage3DGate {
  force: boolean;
  heroMode: Stage3DHeroMode;
  /** 캔버스를 올려 둘지. */
  mount: boolean;
  /** 캔버스를 보이게 할지(아니면 투명하게 그리기만). */
  visible: boolean;
  /** 지금 연출을 3D 로 그리는지. 도중에 GL 이 실패하면 false — 화면은 2D 무대로 이어 간다. */
  stage3D: boolean;
  onReady: () => void;
  onFail: (definite: boolean) => void;
  /** 캔버스가 내려갔다(Stage3DCanvas 가 unmount 때 부른다). */
  onLost: () => void;
}

export function useStage3DGate({ scope, available, stageParam, reduceMotion, layoutReady, inHero, performing }: Stage3DGateInput): Stage3DGate {
  const [verdict, setVerdict] = useState(() => peekStage3DVerdict(scope)); // undefined = 아직 읽는 중
  const [hero, setHero] = useState<Stage3DHeroMode>('pending');
  const [probe, setProbe] = useState<'ok' | 'fail' | null>(null); // 이번 방문의 실측 결과
  const [probeGaveUp, setProbeGaveUp] = useState(false);
  const [ready, setReady] = useState(false);
  const force = stageParam === '3d';
  const want3D = available && stageParam !== '2d' && (force || (!reduceMotion && verdict !== 'slow'));
  const heroMode: Stage3DHeroMode = !want3D || probe === 'fail' ? '2d' : hero;

  useEffect(() => {
    if (verdict !== undefined || !available) return undefined;
    let alive = true;
    void loadStage3DVerdict(scope).then((v) => {
      if (alive) setVerdict(v);
    });
    return () => {
      alive = false;
    };
  }, [verdict, available, scope]);

  // 기다림 한도 — 판정을 읽은 뒤부터 잰다. 강제 3D 는 끝까지 기다린다.
  const heroWaitMs = verdict === 'ok' ? HERO_WAIT_MS.ok : HERO_WAIT_MS.unknown;
  useEffect(() => {
    if (heroMode !== 'pending' || verdict === undefined || force) return undefined;
    const id = setTimeout(() => setHero((h) => (h === 'pending' ? '2d' : h)), heroWaitMs);
    return () => clearTimeout(id);
  }, [heroMode, verdict, force, heroWaitMs]);

  // 연출 무대 — 입력 화면을 떠나는 렌더에서 정한다(렌더 중 이전 값 비교). 아래 mount 가 이 값을 같은 렌더에서 쓴다.
  const [leave, setLeave] = useState<{ inHero: boolean; renderer: '2d' | '3d' }>({ inHero, renderer: '2d' });
  let renderer = leave.renderer;
  if (leave.inHero !== inHero) {
    if (!inHero) renderer = heroMode === '3d' && ready ? '3d' : '2d';
    setLeave({ inHero, renderer });
  }
  const stage3DActive = performing && renderer === '3d';

  // 캔버스는 무대 자리(2D 로 정했으면 판정이 끝날 때까지)·3D 연출 동안만 — 그 밖엔 내려 GPU 를 비운다.
  const probing = probe === null && !probeGaveUp;
  const mount = want3D && probe !== 'fail' && verdict !== undefined && layoutReady && (inHero ? heroMode !== '2d' || probing : stage3DActive);
  useEffect(() => {
    if (!mount || probe !== null) return undefined;
    const id = setTimeout(() => setProbeGaveUp(true), PROBE_GIVE_UP_MS);
    return () => clearTimeout(id);
  }, [mount, probe]);

  const onReady = useCallback(() => {
    setReady(true);
    setProbe((p) => p ?? 'ok');
    setHero((h) => (h === 'pending' ? '3d' : h));
    if (!force) saveStage3DVerdict(scope, 'ok');
  }, [force, scope]);
  // GL 오류·느린 GPU — 이번 방문은 2D. 확실하면(오류·소프트웨어 GL·다섯 프레임 중 셋 이상 느림) 기기를 "느림"으로 기억.
  const onFail = useCallback(
    (definite: boolean) => {
      setProbe('fail');
      if (definite && !force) saveStage3DVerdict(scope, 'slow');
    },
    [force, scope],
  );
  // 다시 올리면 새 캔버스가 처음부터 잰다 — 그 전엔 무대 자리를 보이지 않고 연출도 3D 로 시작하지 않는다.
  const onLost = useCallback(() => setReady(false), []);

  return {
    force,
    heroMode,
    mount,
    visible: inHero ? heroMode === '3d' && ready : stage3DActive,
    stage3D: stage3DActive && probe !== 'fail',
    onReady,
    onFail,
    onLost,
  };
}
