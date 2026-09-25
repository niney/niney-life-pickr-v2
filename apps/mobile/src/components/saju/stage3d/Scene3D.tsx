import { useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber/native';
import * as THREE from 'three';
import { SAJU_GOLD, SAJU_HANJI, SAJU_JUSA, SAJU_STONE, WUXING_COLOR } from '@repo/shared';
import { SAJU_BRANCHES, SAJU_STEMS, SAJU_WUXING, SAJU_WUXING_META, branchMeta, stemMeta, type SajuChart, type SajuPhase, type Wuxing } from '@repo/utils';
import { SAJU_STAGE_TIMING } from '../stageConfig';
import { SAJU_GLYPH_ATLAS, glyphGeometry } from './glyphs';
import { dotTexture } from '../../common/stage3d/dataTexture';
import { backgroundTexture, discGlowTexture, rippleTexture, sealFaceTexture } from './textures';

// 천문도 3D 장면 — 웹 stage/SajuScene 을 앱(expo-gl)으로 옮긴 것. 같은 치수·타이밍·조명.
//   setup     고리 3겹이 천천히 자전, 별·별가루.
//   casting   고리가 빠르게 돌다 바깥→안 순으로 멈춘다(1.4·2.1·2.8초).
//   stamping  인장이 떨어져 원판에 찍힌다 — 착지하면 금빛 파문 + 오행색 별가루.
//   reading   (화면이 풀이로 넘어가기 전 잠깐) 인장 전부 + 일간 인장 발광.
// 앱에서 다른 점: PBR(MeshStandard) 대신 Phong — expo-gl 에서 넓은 PBR 면이 그려지지 않는 프레임이 있어서다.
// 후처리(Bloom)는 부동소수 렌더 타깃이 없어 빼고 가산 합성 평면·점으로 빛을 낸다. 글자는 미리 구운 아틀라스.
// 흐름 전환(onCastingDone·onStamp)은 바깥 JS 타이머가 내고, 여기선 시간에 맞춰 그리기만 한다.

const DISC_R = 3.4;
const DISC_H = 0.26;
const RING_R = { branches: 3.0, stems: 2.3, elements: 1.35 } as const;
const SEAL_S = 0.86;
const SEAL_T = 0.16;
const SEAL_COL_GAP = 1.12;
const SEAL_ROW_Z = { stem: -0.62, branch: 0.62 } as const;
const SEAL_DROP_Y = 4.2;
const SEAL_REST_Y = DISC_H / 2 + SEAL_T / 2;
const LOOK = new THREE.Vector3(0, 0.2, 0);
const CAM_DIR = new THREE.Vector3(0, 7.6, 6.6).normalize();

const T = SAJU_STAGE_TIMING;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const easeOutCubic = (t: number): number => 1 - (1 - clamp(t, 0, 1)) ** 3;
const easeInOutCubic = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
const dampK = (dt: number, lambda: number): number => 1 - Math.exp(-lambda * dt);

/** 원판을 화면 어디에 얼마만 하게 둘지 — 캔버스 좌표(pt). 카메라가 거리·세로 오프셋으로 맞춘다. */
export interface SajuStageFraming {
  centerY: number;
  radiusPx: number;
}

// 카메라 — 웹과 같은 위 45° 방향. 거리는 원판 반지름이 radiusPx 로 보이게, 세로 위치는 view offset 으로. 부드럽게 따라간다.
const CameraRig = ({ framing }: { framing: SajuStageFraming }) => {
  const cur = useRef<{ d: number; oy: number } | null>(null);
  useFrame((st, dt) => {
    const cam = st.camera as THREE.PerspectiveCamera;
    const W = st.size.width;
    const H = st.size.height;
    if (W <= 0 || H <= 0) return;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const targetD = (DISC_R * 1.04 * (H / 2)) / (Math.max(40, framing.radiusPx) * tanHalf);
    const targetOy = H / 2 - framing.centerY;
    if (!cur.current) cur.current = { d: targetD, oy: targetOy };
    const k = dampK(dt, 3.2);
    cur.current.d += (targetD - cur.current.d) * k;
    cur.current.oy += (targetOy - cur.current.oy) * k;
    cam.position.copy(LOOK).addScaledVector(CAM_DIR, cur.current.d);
    cam.lookAt(LOOK);
    cam.far = cur.current.d + 200;
    cam.setViewOffset(W, H, 0, cur.current.oy, W, H);
  });
  return null;
};

const BRANCH_GLYPHS = SAJU_BRANCHES.map((b) => b.hanja);
const STEM_GLYPHS = SAJU_STEMS.map((s) => s.hanja);
const ELEMENT_GLYPHS = SAJU_WUXING.map((e) => SAJU_WUXING_META[e].hanja);

// 고리 하나 — 글자 n개를 원 둘레에 눕혀 놓고 금선 원. 회전은 부모 group 이.
const Ring = ({ radius, glyphs, size, material }: { radius: number; glyphs: readonly string[]; size: number; material: THREE.Material }) => {
  const items = useMemo(
    () =>
      glyphs.map((g, i) => {
        const a = Math.PI / 2 - (i * 2 * Math.PI) / glyphs.length;
        return { key: `${g}${i}`, geo: glyphGeometry(g, size), x: Math.cos(a) * radius, z: -Math.sin(a) * radius, rot: a - Math.PI / 2 };
      }),
    [glyphs, radius, size],
  );
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={DISC_H / 2 + 0.006}>
        <ringGeometry args={[radius - 0.02, radius + 0.02, 160]} />
        <meshBasicMaterial color={SAJU_GOLD} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {items.map((it) => (
        <mesh key={it.key} geometry={it.geo} material={material} position={[it.x, DISC_H / 2 + 0.01, it.z]} rotation={[-Math.PI / 2, 0, it.rot]} />
      ))}
    </group>
  );
};

// 별자리 선각 — 원판 위 금선 조각(천상열차분야지도 느낌). 웹과 같은 시드.
const StarChart = ({ count }: { count: number }) => {
  const geo = useMemo(() => {
    const pts: number[] = [];
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.4 + rnd() * (DISC_R - 1.2);
      const len = 0.15 + rnd() * 0.5;
      const b = a + (rnd() - 0.5) * 1.2;
      pts.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(a) * r + Math.cos(b) * len, 0, Math.sin(a) * r + Math.sin(b) * len);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [count]);
  return (
    <lineSegments geometry={geo} position-y={DISC_H / 2 + 0.004}>
      <lineBasicMaterial color={SAJU_GOLD} transparent opacity={0.22} depthWrite={false} />
    </lineSegments>
  );
};

// 원판 + 고리 3겹. casting 에서 고리가 각각 다른 속도로 돌다 바깥→안 순으로 멈춘다(웹과 같은 속도 곡선).
// 고리 글자는 웹(0.34·0.3·0.28)보다 크게 — 폰 화면에선 원판이 작아 웹 크기면 읽히지 않는다.
const Disc = ({ phase, glyphTex }: { phase: SajuPhase; glyphTex: THREE.Texture }) => {
  const outer = useRef<THREE.Group>(null);
  const middle = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const spin = useRef({ o: 0, m: 0, i: 0 });
  const castStart = useRef<number | null>(null);
  const mats = useMemo(
    () => ({
      branch: new THREE.MeshBasicMaterial({ map: glyphTex, color: SAJU_GOLD, transparent: true, depthWrite: false }),
      stem: new THREE.MeshBasicMaterial({ map: glyphTex, color: '#e6d7a8', transparent: true, depthWrite: false }),
      element: new THREE.MeshBasicMaterial({ map: glyphTex, color: SAJU_JUSA, transparent: true, depthWrite: false }),
    }),
    [glyphTex],
  );
  useFrame((state, dt) => {
    const s = spin.current;
    if (phase === 'casting') {
      const now = state.clock.elapsedTime;
      if (castStart.current === null) castStart.current = now;
      const el = now - castStart.current;
      const speed = (stopAt: number, base: number): number => base * (1 - easeInOutCubic(el / stopAt));
      const [o, m, i] = T.stopsMs;
      s.o += dt * speed(o / 1000, 9);
      s.m -= dt * speed(m / 1000, 7);
      s.i += dt * speed(i / 1000, 5);
    } else {
      castStart.current = null;
      if (phase === 'setup') {
        s.o += dt * 0.06;
        s.m -= dt * 0.04;
        s.i += dt * 0.03;
      } else {
        s.o += dt * 0.01;
      }
    }
    if (outer.current) outer.current.rotation.y = s.o;
    if (middle.current) middle.current.rotation.y = s.m;
    if (inner.current) inner.current.rotation.y = s.i;
  });
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[DISC_R, DISC_R * 1.02, DISC_H, 96]} />
        <meshPhongMaterial color={SAJU_STONE} shininess={40} specular="#3a3a44" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={DISC_H / 2 + 0.002}>
        <circleGeometry args={[DISC_R * 0.98, 96]} />
        <meshBasicMaterial map={discGlowTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={DISC_H / 2 + 0.008}>
        <ringGeometry args={[DISC_R - 0.12, DISC_R - 0.06, 160]} />
        <meshBasicMaterial color={SAJU_GOLD} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <StarChart count={70} />
      <group ref={outer}>
        <Ring radius={RING_R.branches} glyphs={BRANCH_GLYPHS} size={0.5} material={mats.branch} />
      </group>
      <group ref={middle}>
        <Ring radius={RING_R.stems} glyphs={STEM_GLYPHS} size={0.44} material={mats.stem} />
      </group>
      <group ref={inner}>
        <Ring radius={RING_R.elements} glyphs={ELEMENT_GLYPHS} size={0.42} material={mats.element} />
      </group>
      {/* 정렬 표식 — 12시 방향 작은 삼각. */}
      <mesh position={[0, DISC_H / 2 + 0.02, -DISC_R + 0.22]} rotation={[-Math.PI / 2, 0, Math.PI]}>
        <circleGeometry args={[0.09, 3]} />
        <meshBasicMaterial color={SAJU_JUSA} />
      </mesh>
    </group>
  );
};

interface SealSpec {
  index: number;
  hanja: string;
  element: Wuxing;
  accent: boolean;
  x: number;
  z: number;
}

/** 인장 순서(0..7): 년간·년지·월간·월지·일간·일지·시간·시지. 자리: 기둥 4열 × 천간(뒤)·지지(앞). */
const sealSpecs = (chart: SajuChart): SealSpec[] => {
  const keys = (['year', 'month', 'day', 'hour'] as const).filter((k) => !!chart.pillars[k]);
  const total = keys.length;
  const out: SealSpec[] = [];
  keys.forEach((key, col) => {
    const p = chart.pillars[key];
    if (!p) return;
    const x = (col - (total - 1) / 2) * SEAL_COL_GAP;
    const stem = stemMeta(p.stem);
    const branch = branchMeta(p.branch);
    out.push({ index: out.length, hanja: stem.hanja, element: stem.element, accent: key === 'day', x, z: SEAL_ROW_Z.stem });
    out.push({ index: out.length, hanja: branch.hanja, element: branch.element, accent: false, x, z: SEAL_ROW_Z.branch });
  });
  return out;
};

// 착지 별가루 — 인장 위 상자 안의 점들이 파문과 함께 떠오르며 사라진다(웹 drei Sparkles 대신).
const burstGeometry = (() => {
  let g: THREE.BufferGeometry | null = null;
  return (): THREE.BufferGeometry => {
    if (g) return g;
    const pts: number[] = [];
    let seed = 3;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 24; i++) pts.push((rnd() - 0.5) * 1.6, rnd() * 1.1, (rnd() - 0.5) * 1.6);
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  };
})();

type SealState = 'hidden' | 'dropping' | 'landed';

const Seal = ({ spec, state, glyphMaterial }: { spec: SealSpec; state: SealState; glyphMaterial: THREE.Material }) => {
  const drop = useRef<THREE.Group>(null);
  const ripple = useRef<THREE.Mesh>(null);
  const burst = useRef<THREE.Points>(null);
  const faceMat = useRef<THREE.MeshPhongMaterial>(null);
  const rippleMat = useRef<THREE.MeshBasicMaterial>(null);
  const burstMat = useRef<THREE.PointsMaterial>(null);
  const clock = useRef({ dropStart: null as number | null, landedAt: null as number | null });

  useFrame((st) => {
    const now = st.clock.elapsedTime;
    const c = clock.current;
    const g = drop.current;
    if (!g) return;
    if (state === 'hidden') {
      c.dropStart = null;
      c.landedAt = null;
      g.visible = false;
      return;
    }
    g.visible = true;
    let y = SEAL_REST_Y;
    let tilt = 0;
    if (state === 'dropping') {
      if (c.dropStart === null) c.dropStart = now;
      const p = clamp((now - c.dropStart - T.dropStartMs / 1000) / (T.dropMs / 1000), 0, 1);
      if (p <= 0) {
        g.visible = false;
      } else if (p < 1) {
        const e = easeOutCubic(p);
        y = SEAL_DROP_Y + (SEAL_REST_Y - SEAL_DROP_Y) * e;
        tilt = (1 - e) * 0.35;
      } else if (c.landedAt === null) {
        c.landedAt = now;
      }
    } else if (c.landedAt === null) {
      // 건너뛰기·다시 그리기로 바로 착지 상태가 된 인장 — 파문 없이.
      c.landedAt = c.dropStart === null ? now - T.rippleMs / 1000 : now;
    }
    g.position.y = y;
    g.rotation.set(tilt, 0, tilt * 0.6);
    const since = c.landedAt === null ? -1 : now - c.landedAt;
    const rt = since >= 0 ? clamp(since / (T.rippleMs / 1000), 0, 1) : 1;
    if (ripple.current && rippleMat.current) {
      ripple.current.visible = rt < 1;
      ripple.current.scale.setScalar(0.6 + rt * 2.4);
      rippleMat.current.opacity = (1 - rt) * 0.9;
    }
    if (burst.current && burstMat.current) {
      burst.current.visible = rt < 1;
      burst.current.position.y = SEAL_REST_Y + rt * 0.5;
      burstMat.current.opacity = (1 - rt) * 0.95;
    }
    if (faceMat.current) faceMat.current.emissiveIntensity = spec.accent && c.landedAt !== null ? 0.35 + Math.sin(now * 2.2) * 0.2 : 0;
  });

  return (
    <group position={[spec.x, 0, spec.z]}>
      <group ref={drop} visible={false}>
        {/* 몸통(금) + 윗면(인주 바탕·금 테두리) + 글자(한지색). 윗면을 따로 둬 일간 발광만 그 면에 준다. */}
        <mesh>
          <boxGeometry args={[SEAL_S, SEAL_T, SEAL_S]} />
          <meshPhongMaterial color={SAJU_GOLD} shininess={80} specular="#fff1c0" />
        </mesh>
        <mesh position-y={SEAL_T / 2 + 0.002} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[SEAL_S * 0.98, SEAL_S * 0.98]} />
          <meshPhongMaterial ref={faceMat} map={sealFaceTexture(spec.accent)} shininess={20} specular="#553322" emissive={spec.accent ? '#ff5a3c' : '#000000'} emissiveIntensity={0} />
        </mesh>
        <mesh geometry={glyphGeometry(spec.hanja, SEAL_S * 0.84)} material={glyphMaterial} position-y={SEAL_T / 2 + 0.005} rotation-x={-Math.PI / 2} />
      </group>
      <mesh ref={ripple} rotation-x={-Math.PI / 2} position-y={DISC_H / 2 + 0.012} visible={false}>
        <planeGeometry args={[SEAL_S * 1.6, SEAL_S * 1.6]} />
        <meshBasicMaterial ref={rippleMat} map={rippleTexture()} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <points ref={burst} geometry={burstGeometry()} visible={false}>
        <pointsMaterial ref={burstMat} map={dotTexture()} color={WUXING_COLOR[spec.element]} size={0.1} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
};

const Seals = ({ chart, phase, stamped, glyphTex }: { chart: SajuChart; phase: SajuPhase; stamped: number; glyphTex: THREE.Texture }) => {
  const specs = useMemo(() => sealSpecs(chart), [chart]);
  const glyphMaterial = useMemo(() => new THREE.MeshBasicMaterial({ map: glyphTex, color: SAJU_HANJI, transparent: true, depthWrite: false }), [glyphTex]);
  return (
    <group>
      {specs.map((spec) => {
        const state: SealState =
          phase === 'reading' ? 'landed' : phase !== 'stamping' ? 'hidden' : spec.index < stamped ? 'landed' : spec.index === stamped ? 'dropping' : 'hidden';
        return <Seal key={spec.index} spec={spec} state={state} glyphMaterial={glyphMaterial} />;
      })}
    </group>
  );
};

// 먼 별 + 떠도는 금빛 별가루(웹 drei Stars·Sparkles 대신 점 두 겹).
const Sky = () => {
  const stars = useRef<THREE.Points>(null);
  const dust = useRef<THREE.Points>(null);
  const geos = useMemo(() => {
    let seed = 21;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const far: number[] = [];
    for (let i = 0; i < 420; i++) {
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const r = 90 + rnd() * 30;
      const k = Math.sqrt(1 - u * u);
      far.push(Math.cos(th) * k * r, Math.abs(u) * r * 0.9 + 5, Math.sin(th) * k * r);
    }
    const near: number[] = [];
    for (let i = 0; i < 70; i++) near.push((rnd() - 0.5) * 14, 0.6 + rnd() * 5, (rnd() - 0.5) * 14);
    const a = new THREE.BufferGeometry();
    a.setAttribute('position', new THREE.Float32BufferAttribute(far, 3));
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute(near, 3));
    return { far: a, near: b };
  }, []);
  const dustMat = useRef<THREE.PointsMaterial>(null);
  useFrame((st, dt) => {
    if (stars.current) stars.current.rotation.y += dt * 0.004;
    if (dust.current) dust.current.rotation.y += dt * 0.03;
    if (dustMat.current) dustMat.current.opacity = 0.4 + Math.sin(st.clock.elapsedTime * 0.9) * 0.12;
  });
  return (
    <>
      <points ref={stars} geometry={geos.far}>
        <pointsMaterial map={dotTexture()} color="#ffffff" size={0.9} transparent opacity={0.7} depthWrite={false} />
      </points>
      <points ref={dust} geometry={geos.near}>
        <pointsMaterial ref={dustMat} map={dotTexture()} color="#e8cf8f" size={0.09} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </>
  );
};

const Lights = () => {
  const key = useRef<THREE.PointLight>(null);
  useFrame((st) => {
    if (key.current) key.current.intensity = 55 + Math.sin(st.clock.elapsedTime * 0.8) * 5;
  });
  return (
    <>
      <ambientLight intensity={0.35} color="#d9cfb8" />
      <pointLight ref={key} position={[2.5, 6.5, 3.5]} intensity={55} color="#ffe6c0" distance={20} decay={2} />
      <pointLight position={[-4.5, 3.5, -2]} intensity={16} color={SAJU_JUSA} distance={14} decay={2} />
      <pointLight position={[4.5, 2.5, -3]} intensity={12} color={SAJU_GOLD} distance={14} decay={2} />
    </>
  );
};

// 셰이더 예열 — 인장 윗면(Phong + map) 프로그램을 캔버스를 올리자마자 몇 프레임 그려 미리 컴파일하고 숨긴다. 연출 도중
// 새 프로그램이 컴파일되면 three 가 GL 에 동기 질의를 해 JS 가 GL 큐 뒤에서 기다린다(느린 GPU·시뮬레이터에서 멈칫). 재질은
// 모듈에 하나(버리지 않는다) — JSX 재질이면 예열이 내려갈 때 R3F 가 버려 프로그램이 해제되고, 첫 인장이 떨어지는 프레임에
// 다시 컴파일하며 멈칫했다(시뮬레이터 실측 0.45초). 별가루(점)는 하늘 별가루가 같은 프로그램을 늘 쓴다. 원판 밑에 작게.
let warmSealFace: THREE.MeshPhongMaterial | null = null;
const warmSealFaceMaterial = (): THREE.MeshPhongMaterial =>
  (warmSealFace ??= new THREE.MeshPhongMaterial({ map: sealFaceTexture(true), shininess: 20, specular: new THREE.Color('#553322'), emissive: new THREE.Color('#ff5a3c'), emissiveIntensity: 0 }));
const warmPlane = new THREE.PlaneGeometry(1, 1);
const WARMUP_FRAMES = 3;
const ShaderWarmup = () => {
  const ref = useRef<THREE.Group>(null);
  const frames = useRef(0);
  useFrame(() => {
    const g = ref.current;
    if (!g || !g.visible) return;
    frames.current += 1;
    if (frames.current > WARMUP_FRAMES) g.visible = false;
  });
  return (
    <group ref={ref} position={[0, -0.4, 0]} scale={0.2}>
      <mesh rotation-x={-Math.PI / 2} geometry={warmPlane} material={warmSealFaceMaterial()} />
    </group>
  );
};

export interface SajuScene3DProps {
  phase: SajuPhase;
  chart: SajuChart | null;
  stamped: number;
  framing: SajuStageFraming;
}

/** 장면 본체 — 글리프 아틀라스를 읽는 동안 Suspense 로 대기(바깥 Canvas 안쪽 경계에서). */
export const SajuScene3D = ({ phase, chart, stamped, framing }: SajuScene3DProps) => {
  // 아틀라스는 흰 글자라 색공간 변환이 결과를 바꾸지 않는다 — 색은 재질 색으로 곱한다.
  const glyphTex = useLoader(THREE.TextureLoader, SAJU_GLYPH_ATLAS as unknown as string);
  return (
    <>
      <primitive attach="background" object={backgroundTexture()} />
      <CameraRig framing={framing} />
      <Lights />
      <Sky />
      <Disc phase={phase} glyphTex={glyphTex} />
      <ShaderWarmup />
      {chart && (phase === 'stamping' || phase === 'reading') ? <Seals chart={chart} phase={phase} stamped={stamped} glyphTex={glyphTex} /> : null}
    </>
  );
};
