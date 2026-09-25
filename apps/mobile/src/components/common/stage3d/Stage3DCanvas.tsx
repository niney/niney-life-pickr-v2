import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber/native';
import * as THREE from 'three';

// 3D 무대 공용 캔버스(expo-gl + react-three-fiber) — 사주 천문도·타로 무대가 같이 쓰는 GL 배관. 장면은 children.
// 이 모듈은 R3F 를 불러오므로 expo-gl 이 든 빌드에서만 늦게 불러온다(각 무대 모듈을 화면이 조건부 require).
//  - visible 이 아니면 투명하게 그리기만 한다(준비·성능 판정은 계속). 보이게 되면 0.4초에 걸쳐 나타난다.
//  - 준비(장면이 Suspense 를 빠져나온 뒤 첫 프레임들 실측 통과)되면 onReady, 내려가면(unmount) onLost. 3D 로 할지는
//    화면이 정한다(useStage3DGate). 판정 동안은 화면 새로 고침마다 그려 빨리 끝낸다(30fps 틱이면 0.23초, 60fps 면 0.12초 —
//    처음 보는 기기의 기다림 0.9초 안에 들어오기 쉽게).
//  - 내려갈 때 장면이 쓴 GPU 자원을 모두 dispose 한다(DisposeOnUnmount — 공유 자원이 옛 렌더러를 붙잡지 않게).
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
 * 넘으면 onSlow — 셋 이상이면 확실히 느린 GL(시뮬레이터의 소프트웨어 렌더러 실측 150~700ms/프레임)이라 definite.
 * 판정 동안은 화면 새로 고침마다 그려 정상 기기의 dt 는 17ms 안팎(60Hz)이다.
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

// ── 개발 계측 ──────────────────────────────────────────────────────────────
// 프레임 구간: 갱신(useFrame 들, JS) → 렌더 명령(three 가 GL 명령을 쌓는 JS) → GL 대기(역압 getError — GL 스레드가 이
// 프레임을 다 처리할 때까지). FrameStart·setupRenderer 가 채우고 DevStats 가 모은다. 개발 빌드에서만 잰다.
const perf = { frameStart: 0, upd: 0, issue: 0, gl: 0 };

/**
 * 캔버스를 내릴 때 장면이 쓴 GPU 자원(지오메트리·재질·텍스처·인스턴스 버퍼)을 모두 dispose 한다. 모듈에 두고 다시 쓰는
 * 공유 자원(예열 재질·절차 텍스처·카드 모양 등)엔 렌더러마다 dispose 리스너가 붙는데, 그냥 내리면 그 리스너가 옛 렌더러
 * (와 GL 컨텍스트 래퍼)를 붙잡아 캔버스를 올릴 때마다 하나씩 메모리에 남는다(실측: 공유 텍스처 하나에 리스너 5개).
 * 레이아웃 정리라 R3F 가 장면에서 떼어 내기 전에 돈다(캔버스 첫 자식이라 형제들보다 먼저). 공유 자원은 다음 렌더러가 쓸 때
 * 다시 올린다.
 */
const TEXTURE_SLOTS = ['map', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap', 'normalMap', 'specularMap', 'lightMap', 'envMap'] as const;
const disposeScene = (scene: THREE.Scene): void => {
  const found = new Set<{ dispose: () => void }>();
  const add = (r: unknown): void => {
    if (r && typeof (r as { dispose?: unknown }).dispose === 'function') found.add(r as { dispose: () => void });
  };
  scene.traverse((o) => {
    const m = o as Partial<THREE.Mesh>;
    add(m.geometry);
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      add(mat);
      const slots = mat as unknown as Record<string, unknown>;
      for (const k of TEXTURE_SLOTS) if (slots[k] instanceof THREE.Texture) add(slots[k]);
    }
    if ((o as THREE.InstancedMesh).isInstancedMesh) add(o);
  });
  if (scene.background instanceof THREE.Texture) add(scene.background);
  for (const r of found) {
    try {
      r.dispose();
    } catch {
      // GL 컨텍스트가 먼저 사라졌으면 GL 호출이 실패할 수 있다 — 리스너는 이미 떨어졌다.
    }
  }
};

const DisposeOnUnmount = () => {
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => () => disposeScene(scene), [scene]);
  return null;
};

/** 프레임 시작 시각 — 우선순위 -1 로 다른 useFrame 보다 먼저(양수가 아니라 렌더를 가로채지 않는다). */
const FrameStart = () => {
  useFrame(() => {
    perf.frameStart = performance.now();
  }, -1);
  return null;
};

interface PhaseStat {
  n: number;
  dt: number;
  upd: number;
  issue: number;
  gl: number;
  worst: number;
  calls: number;
}

/**
 * 개발 빌드 전용 — 1초마다 fps·최악 프레임·구간 평균(ms)·그리기 수·GPU 자원 수를 전역(__stage3dStats)에, 구간 이름
 * (statsKey, 보통 phase)별 누적을 __stage3dPhaseStats[tag][key] 에 적는다(로그 없음, 디버거로 읽는다). 구간 시간은
 * 이 useFrame 이 렌더보다 먼저 돌아 직전 프레임 것이다.
 */
const DevStats = ({ tag, statsKey }: { tag: string; statsKey: string | undefined }) => {
  const acc = useRef({ frames: 0, t: 0, worst: 0, upd: 0, issue: 0, gl: 0 });
  useFrame((st, dt) => {
    const a = acc.current;
    a.frames += 1;
    a.t += dt;
    a.worst = Math.max(a.worst, dt);
    a.upd += perf.upd;
    a.issue += perf.issue;
    a.gl += perf.gl;
    const info = st.gl.info;
    const g = globalThis as unknown as { __stage3dStats?: unknown; __stage3dPhaseStats?: Record<string, Record<string, PhaseStat>> };
    if (statsKey) {
      const byTag = (g.__stage3dPhaseStats ??= {});
      const byKey = (byTag[tag] ??= {});
      const p = (byKey[statsKey] ??= { n: 0, dt: 0, upd: 0, issue: 0, gl: 0, worst: 0, calls: 0 });
      p.n += 1;
      p.dt += dt * 1000;
      p.upd += perf.upd;
      p.issue += perf.issue;
      p.gl += perf.gl;
      p.worst = Math.max(p.worst, dt * 1000);
      p.calls = info.render.calls;
      // 최근 프레임 200개(원인 찾기용) — [구간, 프레임, 갱신, 렌더 명령, GL 대기, 그리기 수, 셰이더 프로그램 수].
      const ring = ((g as unknown as { __stage3dFrames?: unknown[] }).__stage3dFrames ??= []);
      ring.push([statsKey, Math.round(dt * 1000), Math.round(perf.upd * 10) / 10, Math.round(perf.issue * 10) / 10, Math.round(perf.gl), info.render.calls, info.programs?.length ?? 0]);
      if (ring.length > 200) ring.shift();
    }
    if (a.t >= 1) {
      const avg = (v: number): number => Math.round((v / a.frames) * 10) / 10;
      g.__stage3dStats = {
        tag,
        fps: Math.round(a.frames / a.t),
        worstMs: Math.round(a.worst * 1000),
        updMs: avg(a.upd),
        issueMs: avg(a.issue),
        glMs: avg(a.gl),
        calls: info.render.calls,
        tris: info.render.triangles,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
        programs: info.programs?.length ?? 0,
        at: Date.now(),
      };
      acc.current = { frames: 0, t: 0, worst: 0, upd: 0, issue: 0, gl: 0 };
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
    const t0 = __DEV__ ? performance.now() : 0;
    render(scene, camera);
    const t1 = __DEV__ ? performance.now() : 0;
    // 역압 — expo-gl 은 GL 명령을 GL 스레드 큐에 비동기로 쌓는다. JS 가 GPU 보다 빨리 프레임을 만들면 큐가 끝없이
    // 밀려(시뮬레이터 소프트웨어 GL 실측: 수십 초) 다음 동기 질의가 그 뒤에서 기다리며 앱이 멈춘다. 매 프레임
    // 동기 호출로 GL 이 이 프레임 명령을 다 처리할 때까지 기다려, 느린 GPU 에선 프레임 수가 줄 뿐 멈추지 않게 한다.
    // (첫 프레임들의 무거운 셰이더가 화면에 안 나오던 문제도 이 강제 처리로 사라진다.)
    gl.getError();
    if (__DEV__) {
      perf.upd = t0 - perf.frameStart;
      perf.issue = t1 - t0;
      perf.gl = performance.now() - t1;
    }
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
  /** 개발 계측 구간 이름(보통 phase) — __stage3dPhaseStats 에 구간별로 모은다. */
  statsKey?: string;
  onReady: () => void;
  /** GL 오류 또는 느린 GPU — 화면이 2D 로 간다. definite: 이 기기를 "느림"으로 기억해도 될 만큼 확실한지. */
  onFail: (definite: boolean, reason: unknown) => void;
  /** 캔버스가 내려갔다(unmount) — 다시 올리면 새 캔버스가 처음부터 잰다. */
  onLost: () => void;
  children: ReactNode;
}

export const Stage3DCanvas = ({ tag, width, height, visible, fps, camera, force = false, statsKey, onReady, onFail, onLost, children }: Stage3DCanvasProps) => {
  useEffect(() => () => onLost(), [onLost]);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'));
    return () => sub.remove();
  }, []);
  // 준비 판정 중엔 화면 새로 고침마다 그린다(판정이 끝나면 화면이 준 fps).
  const [probing, setProbing] = useState(true);
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
          <DisposeOnUnmount />
          {__DEV__ ? <FrameStart /> : null}
          {appActive ? <Ticker fps={probing ? null : fps} /> : null}
          <Suspense fallback={null}>
            {children}
            <ReadyProbe
              onReady={() => {
                setProbing(false);
                onReady();
              }}
              onSlow={(definite) => {
                setProbing(false);
                if (force) onReady();
                else onFail(definite, new Error('slow-gl'));
              }}
            />
            {__DEV__ ? <DevStats tag={tag} statsKey={statsKey} /> : null}
          </Suspense>
        </Canvas>
      </GlBoundary>
    </Animated.View>
  );
};
