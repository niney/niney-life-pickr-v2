import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, View, type ViewStyle } from 'react-native';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber/native';
import type { SajuChart, SajuPhase } from '@repo/utils';
import { SajuScene3D, type SajuStageFraming } from './stage3d/Scene3D';

// 천문도 3D 무대(expo-gl + react-three-fiber) — 화면 위쪽(원판이 오가는 영역)에 깔리는 캔버스. 그리기만 하고 흐름
// 전환은 사주 화면의 JS 타이머가 낸다.
//  - 준비(아틀라스 로드 뒤 몇 프레임)되면 onReady — 그 전까지 화면은 2D 무대를 보여 준다(빈 화면 없음).
//  - GL 오류, 또는 첫 프레임들의 실측 시간이 느리면(소프트웨어 GL 등) onFail — 화면이 2D 로 돌아간다.
//  - 해상도: expo-gl 은 뷰 크기 × 화면 배율로만 그린다. 캔버스를 2/3 크기로 두고 1.5배 확대해 화소 수를 절반 아래로
//    줄인다(3배 화면에서 2배 밀도). 느린 GPU·시뮬레이터(소프트웨어 GL)에서 프레임이 GL 큐에 쌓이지 않게.
//  - 루프는 demand 하나 — 입력 화면(setup)은 30fps, 연출 중엔 requestAnimationFrame 마다 깨운다. 앱이 백그라운드면 멈춘다.
//    (demand ↔ always 를 오가면 R3F 루프가 다시 안 깨어나 멈춘 적이 있다.)
//  - three 의 셰이더 오류 확인(getProgramInfoLog 등 동기 질의)은 끈다 — JS 가 GL 큐 뒤에서 기다리며 멈칫한다.
//  - 매 프레임 렌더 뒤 getError()(동기)로 GL 스레드가 그 프레임을 다 처리할 때까지 기다린다 — 역압(아래 onCreated).

export type { SajuStageFraming };

const RENDER_SCALE = 2 / 3;

class GlBoundary extends Component<{ onFail: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: unknown): void {
    console.warn('[saju] 3D 무대 오류 — 2D 로 전환', error);
    this.props.onFail(error);
  }
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * 준비·성능 판정 — 장면(아틀라스 로드 뒤)의 첫 2프레임(셰이더 컴파일)을 건너뛰고 다음 5프레임의 실제 프레임 시간을
 * 잰다. 역압(매 프레임 GL 동기) 덕에 dt 가 GPU 처리 시간을 반영한다. 한 프레임이라도 SLOW_FRAME_MS 를 넘으면
 * 느린 GL(시뮬레이터의 소프트웨어 렌더러 실측 300~700ms/프레임)로 보고 onSlow — 화면은 2D 로 간다. 통과하면 onReady.
 * 입력 화면은 30fps(33ms) 틱이라 정상 기기의 dt 는 33ms 안팎이다.
 */
const SLOW_FRAME_MS = 120;
const ReadyProbe = ({ onReady, onSlow }: { onReady: () => void; onSlow: () => void }) => {
  const frames = useRef(0);
  const done = useRef(false);
  useFrame((_, dt) => {
    if (done.current) return;
    frames.current += 1;
    if (frames.current <= 2) return;
    if (dt * 1000 > SLOW_FRAME_MS) {
      done.current = true;
      onSlow();
      return;
    }
    if (frames.current >= 7) {
      done.current = true;
      onReady();
    }
  });
  return null;
};

/** 개발 빌드 전용 — 1초마다 fps·최악 프레임 시간을 전역(__saju3dStats)에 적는다(로그 없음, 디버거로 읽는다). */
const DevStats = () => {
  const acc = useRef({ frames: 0, t: 0, worst: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames += 1;
    a.t += dt;
    a.worst = Math.max(a.worst, dt);
    if (a.t >= 1) {
      (globalThis as unknown as { __saju3dStats?: unknown }).__saju3dStats = { fps: Math.round(a.frames / a.t), worstMs: Math.round(a.worst * 1000), at: Date.now() };
      a.frames = 0;
      a.t = 0;
      a.worst = 0;
    }
  });
  return null;
};

/** demand 루프를 깨운다 — fps 가 있으면 그 간격으로, 없으면 화면 새로 고침(rAF)마다. */
const Ticker = ({ fps }: { fps: number | null }) => {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (fps !== null) {
      const id = setInterval(() => invalidate(), 1000 / fps);
      return () => clearInterval(id);
    }
    let raf = 0;
    const tick = () => {
      invalidate();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [invalidate, fps]);
  return null;
};

/** GL 렌더러 이름 — 소프트웨어 렌더러(시뮬레이터 "Apple Software Renderer")면 재 볼 것도 없이 느리다. */
const glRendererName = (gl: WebGLRenderingContext | WebGL2RenderingContext): string => {
  try {
    return String(gl.getParameter(gl.RENDERER));
  } catch {
    return '';
  }
};

const setupRenderer = (st: RootState): void => {
  st.gl.debug.checkShaderErrors = false;
  const render = st.gl.render;
  const gl = st.gl.getContext();
  st.gl.render = (scene, camera) => {
    render(scene, camera);
    // 역압 — expo-gl 은 GL 명령을 GL 스레드 큐에 비동기로 쌓는다. JS 가 GPU 보다 빨리 프레임을 만들면 큐가 끝없이
    // 밀려(시뮬레이터 소프트웨어 GL 실측: 수십 초) 다음 동기 질의가 그 뒤에서 기다리며 앱이 멈춘다. 매 프레임
    // 동기 호출로 GL 이 이 프레임 명령을 다 처리할 때까지 기다려, 느린 GPU 에선 프레임 수가 줄 뿐 멈추지 않게 한다.
    // (첫 프레임들의 무거운 셰이더가 화면에 안 나오던 문제도 이 강제 처리로 사라진다.)
    gl.getError();
  };
};

export interface SajuStage3DProps {
  /** 개발용 — 성능 판정(소프트웨어 GL·느린 프레임)을 건너뛰고 무조건 3D. */
  force?: boolean;
  phase: SajuPhase;
  chart: SajuChart | null;
  stamped: number;
  /** 캔버스 영역(화면 위쪽부터) — 원판이 입력·연출 때 오가는 범위를 덮는다. */
  width: number;
  height: number;
  /** 영역 좌표(pt)로 원판 위치·크기. */
  framing: SajuStageFraming;
  onReady: () => void;
  /** GL 오류 또는 느린 GPU — 화면이 2D 로 돌아간다. */
  onFail: (reason: unknown) => void;
}

export const SajuStage3D = ({ phase, chart, stamped, width, height, framing, onReady, onFail, force = false }: SajuStage3DProps) => {
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'));
    return () => sub.remove();
  }, []);
  const s = RENDER_SCALE;
  const canvasStyle: ViewStyle = {
    position: 'absolute',
    left: (width - width * s) / 2,
    top: (height - height * s) / 2,
    width: width * s,
    height: height * s,
    transform: [{ scale: 1 / s }],
  };
  const localFraming: SajuStageFraming = { centerY: framing.centerY * s, radiusPx: framing.radiusPx * s };
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
      <GlBoundary onFail={onFail}>
        <Canvas
          style={canvasStyle}
          pointerEvents="none"
          frameloop="demand"
          camera={{ fov: 34, near: 0.1, far: 300, position: [0, 20, 17] }}
          onCreated={(st) => {
            setupRenderer(st);
            const name = glRendererName(st.gl.getContext());
            if (__DEV__) console.warn('[saju3d] GL', name);
            if (!force && /software/i.test(name)) onFail(new Error(`software-gl: ${name}`));
          }}
        >
          {appActive ? <Ticker fps={phase === 'setup' ? 30 : null} /> : null}
          <Suspense fallback={null}>
            <SajuScene3D phase={phase} chart={chart} stamped={stamped} framing={localFraming} />
            <ReadyProbe onReady={onReady} onSlow={() => (force ? onReady() : onFail(new Error('slow-gl')))} />
            {__DEV__ ? <DevStats /> : null}
          </Suspense>
        </Canvas>
      </GlBoundary>
    </View>
  );
};
