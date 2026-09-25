import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber/native';

// 3D 무대 공용 캔버스(expo-gl + react-three-fiber) — 사주 천문도·타로 무대가 같이 쓰는 GL 배관. 장면은 children.
// 이 모듈은 R3F 를 불러오므로 expo-gl 이 든 빌드에서만 늦게 불러온다(각 무대 모듈을 화면이 조건부 require).
//  - visible 이 아니면 투명하게 그리기만 한다(준비·성능 판정은 계속). 보이게 되면 0.4초에 걸쳐 나타난다.
//  - 준비(장면이 Suspense 를 빠져나온 뒤 첫 프레임들 실측 통과)되면 onReady, 내려가면(unmount) onLost. 3D 로 할지는
//    화면이 정한다(useStage3DGate).
//  - GL 오류, 소프트웨어 GL, 또는 첫 프레임들이 느리면 onFail — definite 는 "이 기기는 느리다"고 기억해도 될 만큼
//    확실한지(오류·소프트웨어 GL·다섯 프레임 중 셋 이상 느림). 한 프레임만 튄 건 이번 방문만 2D.
//  - 해상도: expo-gl 은 뷰 크기 × 화면 배율로만 그린다. 캔버스를 2/3 크기로 두고 1.5배 확대해 화소 수를 절반 아래로
//    줄인다(3배 화면에서 2배 밀도). 느린 GPU·시뮬레이터(소프트웨어 GL)에서 프레임이 GL 큐에 쌓이지 않게.
//    화면 좌표 → 정규화 좌표(NDC) 변환은 이 확대와 무관하다(캔버스가 영역 전체를 가운데 기준으로 덮는다).
//  - 루프는 demand 하나 — fps 가 있으면 그 간격, null 이면 requestAnimationFrame 마다 깨운다. 앱이 백그라운드면 멈춘다.
//    (demand ↔ always 를 오가면 R3F 루프가 다시 안 깨어나 멈춘 적이 있다.)
//  - three 의 셰이더 오류 확인(getProgramInfoLog 등 동기 질의)은 끈다 — JS 가 GL 큐 뒤에서 기다리며 멈칫한다.
//  - 매 프레임 렌더 뒤 getError()(동기)로 GL 스레드가 그 프레임을 다 처리할 때까지 기다린다 — 역압(setupRenderer).
//  - 캔버스는 터치를 받지 않는다(R3F 네이티브는 자체 PanResponder 로 모든 터치를 잡는다) — 고르기 같은 입력은 화면이
//    위에 얹은 RN 제스처로.

/** 캔버스를 이 비율로 그려 1/비율로 확대한다. 장면이 픽셀 단위 프레이밍을 쓸 때 곱한다. */
export const STAGE_RENDER_SCALE = 2 / 3;

class GlBoundary extends Component<{ tag: string; onFail: (e: unknown) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: unknown): void {
    console.warn(`[${this.props.tag}] 3D 무대 오류 — 2D 로 전환`, error);
    this.props.onFail(error);
  }
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * 준비·성능 판정 — 장면의 첫 2프레임(셰이더 컴파일)을 건너뛰고 다음 5프레임의 실제 프레임 시간을 잰다. 역압(매
 * 프레임 GL 동기) 덕에 dt 가 GPU 처리 시간을 반영한다. 다섯 프레임이 모두 SLOW_FRAME_MS 안이면 onReady. 하나라도
 * 넘으면 onSlow — 셋 이상이면 확실히 느린 GL(시뮬레이터의 소프트웨어 렌더러 실측 300~700ms/프레임)이라 definite.
 * 30fps 틱이면 정상 기기의 dt 는 33ms 안팎이다.
 */
const SLOW_FRAME_MS = 120;
const PROBE_FRAMES = 5;
const DEFINITE_SLOW_FRAMES = 3;
const ReadyProbe = ({ onReady, onSlow }: { onReady: () => void; onSlow: (definite: boolean) => void }) => {
  const frames = useRef(0);
  const slow = useRef(0);
  const done = useRef(false);
  useFrame((_, dt) => {
    if (done.current) return;
    frames.current += 1;
    if (frames.current <= 2) return;
    if (dt * 1000 > SLOW_FRAME_MS) slow.current += 1;
    // 셋째 느린 프레임에서 바로 끝낸다(느린 GL 에선 한 프레임이 수백 ms).
    if (slow.current >= DEFINITE_SLOW_FRAMES) {
      done.current = true;
      onSlow(true);
      return;
    }
    if (frames.current - 2 >= PROBE_FRAMES) {
      done.current = true;
      if (slow.current === 0) onReady();
      else onSlow(false);
    }
  });
  return null;
};

/** 개발 빌드 전용 — 1초마다 fps·최악 프레임 시간을 전역(__stage3dStats)에 적는다(로그 없음, 디버거로 읽는다). */
const DevStats = ({ tag }: { tag: string }) => {
  const acc = useRef({ frames: 0, t: 0, worst: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames += 1;
    a.t += dt;
    a.worst = Math.max(a.worst, dt);
    if (a.t >= 1) {
      (globalThis as unknown as { __stage3dStats?: unknown }).__stage3dStats = { tag, fps: Math.round(a.frames / a.t), worstMs: Math.round(a.worst * 1000), at: Date.now() };
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

export interface Stage3DCanvasProps {
  /** 로그·개발 통계 표시용 이름(saju3d·tarot3d). */
  tag: string;
  /** 캔버스 영역(pt) — 화면이 무대를 깔 범위. */
  width: number;
  height: number;
  /** false 면 투명하게 그리기만(준비·판정은 계속). true 가 되면 0.4초에 걸쳐 나타난다. */
  visible: boolean;
  /** 틱 간격 — 숫자면 그 fps, null 이면 화면 새로 고침마다(연출 중). */
  fps: number | null;
  camera: { fov: number; near: number; far: number; position: [number, number, number] };
  /** 개발용 — 성능 판정(소프트웨어 GL·느린 프레임)을 건너뛰고 무조건 3D. */
  force?: boolean;
  onReady: () => void;
  /** GL 오류 또는 느린 GPU — 화면이 2D 로 간다. definite: 이 기기를 "느림"으로 기억해도 될 만큼 확실한지. */
  onFail: (definite: boolean, reason: unknown) => void;
  /** 캔버스가 내려갔다(unmount) — 다시 올리면 새 캔버스가 처음부터 잰다. */
  onLost: () => void;
  children: ReactNode;
}

export const Stage3DCanvas = ({ tag, width, height, visible, fps, camera, force = false, onReady, onFail, onLost, children }: Stage3DCanvasProps) => {
  useEffect(() => () => onLost(), [onLost]);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'));
    return () => sub.remove();
  }, []);
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    opacity.set(visible ? withTiming(1, { duration: 400 }) : 0);
  }, [visible, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const s = STAGE_RENDER_SCALE;
  const canvasStyle: ViewStyle = {
    position: 'absolute',
    left: (width - width * s) / 2,
    top: (height - height * s) / 2,
    width: width * s,
    height: height * s,
    transform: [{ scale: 1 / s }],
  };
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width, height }, fade]}>
      <GlBoundary tag={tag} onFail={(e) => onFail(true, e)}>
        <Canvas
          style={canvasStyle}
          pointerEvents="none"
          frameloop="demand"
          camera={camera}
          onCreated={(st) => {
            setupRenderer(st);
            const name = glRendererName(st.gl.getContext());
            if (__DEV__) console.warn(`[${tag}] GL`, name);
            if (!force && /software/i.test(name)) onFail(true, new Error(`software-gl: ${name}`));
          }}
        >
          {appActive ? <Ticker fps={fps} /> : null}
          <Suspense fallback={null}>
            {children}
            <ReadyProbe onReady={onReady} onSlow={(definite) => (force ? onReady() : onFail(definite, new Error('slow-gl')))} />
            {__DEV__ ? <DevStats tag={tag} /> : null}
          </Suspense>
        </Canvas>
      </GlBoundary>
    </Animated.View>
  );
};
