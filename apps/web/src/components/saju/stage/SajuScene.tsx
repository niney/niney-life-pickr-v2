import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Sparkles, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import {
  SAJU_BRANCHES,
  SAJU_STEMS,
  SAJU_WUXING,
  SAJU_WUXING_META,
  branchMeta,
  stemMeta,
  wuxingControls,
  type SajuChart,
  type SajuPhase,
  type Wuxing,
} from '@repo/utils';
import type { TarotQuality } from '../../tarot/tarotQuality';
import { SAJU_BG, SAJU_GOLD, SAJU_JUSA, SAJU_STONE, WUXING_COLOR } from '../sajuTheme';
import {
  CAMERA_FOV,
  CAMERA_POS,
  DISC_H,
  DISC_R,
  LOOK_AT,
  PILLAR_ORDER,
  RING_R,
  SEAL_DROP_Y,
  SEAL_S,
  SEAL_T,
  TIMING,
  clamp,
  dampK,
  easeInOutCubic,
  easeOutCubic,
  elementPosition,
  sealOrder,
  sealRestPosition,
} from './sajuLayout';
import { discGlowTexture, loadDayMasterTexture, ringGlyphTexture, rippleTexture, sealFaceTexture } from './sajuTextures';

// 천문도 무대 — 흑요석 원판(고리 3겹: 지지 12·천간 10·오행 5) 위에 인장 8개가 내려찍히고, 일간 캐릭터가 떠오른다.
// 흐름 상태(phase·stamped)를 받아 그리기만 하고, 애니메이션이 끝나면 콜백으로 상태 머신을 진행시킨다.
//
//   setup     고리가 천천히 자전, 별가루.
//   casting   고리 3겹이 빠르게 돌다 바깥→안 순서로 멈춘다(다이얼). 끝나면 onCastingDone.
//   stamping  stamped 개수까지 인장이 찍혀 있고, 다음 인장이 낙하 중이다. 착지 순간 onStamp(리플·파티클).
//   reading   인장 8개 + 일간 카드. focus 가 'elements' 면 오행 구슬이 분포만큼 커지고 상생 빛줄이 그어진다.

export interface SajuStageCallbacks {
  onCastingDone: () => void;
  onStamp: () => void;
}

export type SajuStageFocus = 'none' | 'elements';

interface Props {
  phase: SajuPhase;
  chart: SajuChart | null;
  stamped: number;
  quality: TarotQuality;
  focusX: number;
  focusYOffset: number;
  focus: SajuStageFocus;
  callbacks: SajuStageCallbacks;
}

const CameraRig = ({ focusX, focusYOffset }: { focusX: number; focusYOffset: number }) => {
  const { camera, pointer, viewport } = useThree();
  const lookRef = useRef<THREE.Vector3 | null>(null);
  if (lookRef.current === null) lookRef.current = new THREE.Vector3(...LOOK_AT);
  useFrame((_, dt) => {
    const look = lookRef.current;
    if (!look) return;
    // 세로 폰(aspect ≈ 0.5)은 인장 4열이 잘리지 않게 더 물러난다.
    const zoomOut = clamp(1.75 / viewport.aspect, 1, 1.8);
    const k = dampK(dt, 3);
    const { x, y, z } = camera.position;
    camera.position.set(
      x + (pointer.x * 0.5 - x) * k,
      y + (CAMERA_POS[1] * zoomOut + pointer.y * 0.2 - y) * k,
      z + (CAMERA_POS[2] * zoomOut - z) * k,
    );
    look.setX(look.x + (focusX - look.x) * k);
    look.setZ(look.z + (LOOK_AT[2] + focusYOffset - look.z) * k);
    camera.lookAt(look);
  });
  return null;
};

// 고리 하나 — 글자 n개를 원 둘레에 놓고 금선 원을 그린다. 회전은 부모 group 이 한다.
const Ring = ({ radius, glyphs, size, color }: { radius: number; glyphs: readonly string[]; size: number; color: string }) => {
  const items = useMemo(
    () =>
      glyphs.map((g, i) => {
        const a = Math.PI / 2 - (i * 2 * Math.PI) / glyphs.length;
        return { key: `${g}${i}`, tex: ringGlyphTexture(g, color), x: Math.cos(a) * radius, z: -Math.sin(a) * radius, rot: a - Math.PI / 2 };
      }),
    [glyphs, radius, color],
  );
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={DISC_H / 2 + 0.006}>
        <ringGeometry args={[radius - 0.02, radius + 0.02, 160]} />
        <meshBasicMaterial color={SAJU_GOLD} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {items.map((it) => (
        <mesh key={it.key} position={[it.x, DISC_H / 2 + 0.01, it.z]} rotation={[-Math.PI / 2, 0, it.rot]}>
          <planeGeometry args={[size, size]} />
          <meshBasicMaterial map={it.tex} transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
};

// 별자리 선각 — 원판 위 금선 조각(천상열차분야지도 느낌).
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
      const r = 0.4 + rnd() * (DISC_R - 0.5);
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

// 원판 + 고리 3겹. casting 에서 고리가 각각 다른 속도로 돌다 바깥→안 순으로 멈춘다.
const Disc = ({ phase, elapsed }: { phase: SajuPhase; elapsed: number }) => {
  const outer = useRef<THREE.Group>(null);
  const middle = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const spin = useRef({ o: 0, m: 0, i: 0 });
  const glow = useMemo(() => discGlowTexture(), []);
  const branchGlyphs = useMemo(() => SAJU_BRANCHES.map((b) => b.hanja), []);
  const stemGlyphs = useMemo(() => SAJU_STEMS.map((s) => s.hanja), []);
  const elementGlyphs = useMemo(() => SAJU_WUXING.map((e) => SAJU_WUXING_META[e].hanja), []);

  useFrame((_, dt) => {
    const s = spin.current;
    if (phase === 'setup') {
      s.o += dt * 0.06;
      s.m -= dt * 0.04;
      s.i += dt * 0.03;
    } else if (phase === 'casting') {
      // 각 고리가 서로 다른 시각에 감속·정지 — 바깥 1.4s, 중간 2.1s, 안 2.8s.
      const speed = (stopAt: number, base: number): number => {
        const t = clamp(elapsed / stopAt, 0, 1);
        return base * (1 - easeInOutCubic(t));
      };
      s.o += dt * speed(1.4, 9);
      s.m -= dt * speed(2.1, 7);
      s.i += dt * speed(2.8, 5);
    }
    // stamping·reading 은 멈춘 채 아주 느리게 숨 쉬듯.
    if (phase === 'stamping' || phase === 'reading') s.o += dt * 0.01;
    if (outer.current) outer.current.rotation.y = s.o;
    if (middle.current) middle.current.rotation.y = s.m;
    if (inner.current) inner.current.rotation.y = s.i;
  });

  return (
    <group>
      <mesh position-y={0} receiveShadow>
        <cylinderGeometry args={[DISC_R, DISC_R * 1.02, DISC_H, 96]} />
        <meshStandardMaterial color={SAJU_STONE} roughness={0.38} metalness={0.25} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={DISC_H / 2 + 0.002}>
        <circleGeometry args={[DISC_R * 0.98, 96]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={DISC_H / 2 + 0.008}>
        <ringGeometry args={[DISC_R - 0.12, DISC_R - 0.06, 160]} />
        <meshBasicMaterial color={SAJU_GOLD} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <StarChart count={70} />
      <group ref={outer}>
        <Ring radius={RING_R.branches} glyphs={branchGlyphs} size={0.34} color={SAJU_GOLD} />
      </group>
      <group ref={middle}>
        <Ring radius={RING_R.stems} glyphs={stemGlyphs} size={0.3} color="#e6d7a8" />
      </group>
      <group ref={inner}>
        <Ring radius={RING_R.elements} glyphs={elementGlyphs} size={0.28} color={SAJU_JUSA} />
      </group>
      {/* 정렬 표식 — 12시 방향 작은 삼각. */}
      <mesh position={[0, DISC_H / 2 + 0.02, -DISC_R + 0.22]} rotation={[-Math.PI / 2, 0, Math.PI]}>
        <circleGeometry args={[0.09, 3]} />
        <meshBasicMaterial color={SAJU_JUSA} />
      </mesh>
      {/* 바닥 — 먹빛 무한 평면. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-DISC_H / 2 - 0.01}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#07070a" roughness={1} metalness={0} />
      </mesh>
    </group>
  );
};

interface SealSpec {
  index: number;
  hanja: string;
  element: Wuxing;
  accent: boolean;
  rest: THREE.Vector3;
}

const sealSpecs = (chart: SajuChart): SealSpec[] => {
  const total: 3 | 4 = chart.pillars.hour ? 4 : 3;
  return sealOrder(total).map((o, index) => {
    const key = PILLAR_ORDER[o.pillar] as keyof SajuChart['pillars'];
    const p = chart.pillars[key];
    if (!p) throw new Error('pillar missing');
    const meta = o.row === 'stem' ? stemMeta(p.stem) : branchMeta(p.branch);
    return { index, hanja: meta.hanja, element: meta.element, accent: key === 'day' && o.row === 'stem', rest: sealRestPosition(o.pillar, o.row, total) };
  });
};

// 인장 하나 — 낙하 → 착지 → (accent 면 발광). 착지 순간 리플·파티클을 켠다.
const Seal = ({
  spec,
  landedAt,
  dropping,
  dropProgress,
  now,
}: {
  spec: SealSpec;
  landedAt: number | null;
  dropping: boolean;
  dropProgress: number;
  now: number;
}) => {
  const face = useMemo(() => sealFaceTexture(spec.hanja, undefined, spec.accent), [spec.hanja, spec.accent]);
  const ripple = useMemo(() => rippleTexture(), []);
  // 훅은 전부 조기 반환보다 앞에(순서 고정).
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: SAJU_GOLD, roughness: 0.35, metalness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: SAJU_GOLD, roughness: 0.35, metalness: 0.7 }),
      new THREE.MeshStandardMaterial({ map: face, roughness: 0.6, metalness: 0.05, emissive: new THREE.Color(spec.accent ? '#ff5a3c' : '#000000'), emissiveIntensity: 0 }),
      new THREE.MeshStandardMaterial({ color: '#6b1f1a', roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: SAJU_GOLD, roughness: 0.35, metalness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: SAJU_GOLD, roughness: 0.35, metalness: 0.7 }),
    ],
    [face, spec.accent],
  );
  const visible = landedAt !== null || dropping;
  if (!visible) return null;
  const y = dropping ? SEAL_DROP_Y + (spec.rest.y - SEAL_DROP_Y) * easeOutCubic(dropProgress) : spec.rest.y;
  const tilt = dropping ? (1 - easeOutCubic(dropProgress)) * 0.35 : 0;
  const since = landedAt === null ? -1 : now - landedAt;
  const rippleT = since >= 0 ? clamp(since / TIMING.rippleS, 0, 1) : 1;
  const rippleScale = 0.6 + rippleT * 2.4;
  const rippleOpacity = (1 - rippleT) * 0.9;
  const glowPulse = spec.accent ? 0.6 + Math.sin(now * 2.2) * 0.25 : 0;
  const top = materials[2];
  if (top) top.emissiveIntensity = glowPulse;
  return (
    <group position={[spec.rest.x, 0, spec.rest.z]}>
      <mesh position-y={y} rotation={[tilt, 0, tilt * 0.6]} material={materials} castShadow>
        <boxGeometry args={[SEAL_S, SEAL_T, SEAL_S]} />
      </mesh>
      {rippleT < 1 && (
        <mesh rotation-x={-Math.PI / 2} position-y={DISC_H / 2 + 0.012} scale={rippleScale}>
          <planeGeometry args={[SEAL_S * 1.6, SEAL_S * 1.6]} />
          <meshBasicMaterial map={ripple} transparent opacity={rippleOpacity} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}
      {rippleT < 1 && (
        <Sparkles count={24} scale={[1.6, 1.2, 1.6]} position={[0, 0.5, 0]} size={4} speed={1.4} opacity={rippleOpacity} color={WUXING_COLOR[spec.element]} />
      )}
    </group>
  );
};

// 인장 8개 — stamped 개까지 착지, 다음 하나가 낙하 중. 착지 시각을 세그먼트 시작 기준으로 계산한다.
const Seals = ({ chart, phase, stamped, elapsed, now, onStamp }: { chart: SajuChart; phase: SajuPhase; stamped: number; elapsed: number; now: number; onStamp: () => void }) => {
  const specs = useMemo(() => sealSpecs(chart), [chart]);
  // 착지 시각은 프레임 안에서만 갱신되는 상태(렌더에서 ref 를 읽지 않게).
  const [landed, setLanded] = useState<ReadonlyMap<number, number>>(() => new Map());
  const firedRef = useRef(-1);
  // stamping: 세그먼트(stamped) 시작 후 잠깐 뒤 다음 인장이 낙하 시작, stampDropS 뒤 착지 → onStamp.
  const dropIndex = phase === 'stamping' ? stamped : -1;
  const dropStart = TIMING.stampGapS * 0.4;
  const dropProgress = dropIndex >= 0 ? clamp((elapsed - dropStart) / TIMING.stampDropS, 0, 1) : 0;
  const dropping = dropIndex >= 0 && dropIndex < specs.length && elapsed >= dropStart && dropProgress < 1;
  // 착지 판정·콜백은 렌더가 아니라 프레임 안에서(렌더 중 dispatch 금지).
  useFrame(() => {
    if (dropIndex >= 0 && dropIndex < specs.length && dropProgress >= 1 && firedRef.current !== dropIndex) {
      firedRef.current = dropIndex;
      setLanded((m) => new Map(m).set(dropIndex, now));
      onStamp();
    }
    if (phase === 'reading' && landed.size < specs.length) {
      setLanded((m) => {
        const next = new Map(m);
        for (let i = 0; i < specs.length; i++) if (!next.has(i)) next.set(i, now - TIMING.rippleS);
        return next;
      });
    }
    if ((phase === 'setup' || phase === 'casting') && (landed.size > 0 || firedRef.current !== -1)) {
      setLanded(new Map());
      firedRef.current = -1;
    }
  });
  return (
    <group>
      {specs.map((spec) => (
        <Seal
          key={spec.index}
          spec={spec}
          landedAt={spec.index < stamped || phase === 'reading' ? (landed.get(spec.index) ?? now - TIMING.rippleS) : null}
          dropping={dropping && spec.index === dropIndex}
          dropProgress={dropProgress}
          now={now}
        />
      ))}
    </group>
  );
};

// 일간 캐릭터 — 원판 중앙 뒤에서 떠오르는 정사각 이미지(placeholder 면 한자 글자).
const DayMasterCard = ({ chart, visible, elapsed }: { chart: SajuChart; visible: boolean; elapsed: number }) => {
  const [loaded, setLoaded] = useState<{ stem: number; tex: THREE.Texture } | null>(null);
  const stem = chart.dayMaster.index;
  // 일간이 바뀌면 이전 텍스처는 렌더에서 걸러진다(효과 안 setState 없음).
  const tex = loaded && loaded.stem === stem ? loaded.tex : null;
  useEffect(() => {
    let alive = true;
    loadDayMasterTexture(stem)
      .then((t) => {
        if (alive) setLoaded({ stem, tex: t });
      })
      .catch(() => {
        // 이미지 없음 — 글자 카드로.
      });
    return () => {
      alive = false;
    };
  }, [stem]);
  const fallback = useMemo(() => sealFaceTexture(chart.dayMaster.hanja, SAJU_GOLD, true), [chart.dayMaster.hanja]);
  const ref = useRef<THREE.Group>(null);
  useFrame((st) => {
    if (!ref.current) return;
    const t = visible ? easeOutCubic(clamp(elapsed / TIMING.cardS, 0, 1)) : 0;
    ref.current.position.y = 1.15 + t * 0.5 + Math.sin(st.clock.elapsedTime * 1.1) * 0.05;
    ref.current.scale.setScalar(0.001 + t);
  });
  if (!visible) return null;
  return (
    <group ref={ref} position={[0, 1.2, -1.1]} rotation={[-0.35, 0, 0]}>
      <mesh>
        <planeGeometry args={[2.1, 2.1]} />
        <meshBasicMaterial map={tex ?? fallback} transparent toneMapped={false} />
      </mesh>
      <mesh position-z={-0.01}>
        <planeGeometry args={[2.22, 2.22]} />
        <meshBasicMaterial color={SAJU_GOLD} transparent opacity={0.9} />
      </mesh>
    </group>
  );
};

// 오행 구슬 5개 — 분포만큼 크기, 상생(이웃) 빛줄, 상극(별) 점선. focus 가 elements 일 때 커진다.
const ElementOrbs = ({ chart, active }: { chart: SajuChart; active: boolean }) => {
  const group = useRef<THREE.Group>(null);
  const scaleRef = useRef(0.001);
  const orbs = useMemo(
    () =>
      SAJU_WUXING.map((e, i) => {
        const pct = chart.elements.find((x) => x.element === e)?.percent ?? 0;
        return { e, i, pos: elementPosition(i, RING_R.elements + 0.55), r: 0.1 + (pct / 100) * 0.55, color: WUXING_COLOR[e] };
      }),
    [chart],
  );
  const lines = useMemo(() => {
    const gen = new THREE.BufferGeometry();
    const con = new THREE.BufferGeometry();
    const g: number[] = [];
    const c: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = elementPosition(i, RING_R.elements + 0.55);
      const b = elementPosition((i + 1) % 5, RING_R.elements + 0.55);
      g.push(a.x, a.y + 0.1, a.z, b.x, b.y + 0.1, b.z);
      const target = SAJU_WUXING.indexOf(wuxingControls(SAJU_WUXING[i] as Wuxing));
      const t = elementPosition(target, RING_R.elements + 0.55);
      c.push(a.x, a.y + 0.08, a.z, t.x, t.y + 0.08, t.z);
    }
    gen.setAttribute('position', new THREE.Float32BufferAttribute(g, 3));
    con.setAttribute('position', new THREE.Float32BufferAttribute(c, 3));
    return { gen, con };
  }, []);
  useFrame((st, dt) => {
    const target = active ? 1 : 0.001;
    scaleRef.current += (target - scaleRef.current) * dampK(dt, 4);
    if (group.current) {
      group.current.scale.setScalar(scaleRef.current);
      group.current.position.y = active ? 0.35 + Math.sin(st.clock.elapsedTime * 0.9) * 0.05 : 0;
    }
  });
  return (
    <group ref={group}>
      {orbs.map((o) => (
        <mesh key={o.e} position={[o.pos.x, o.pos.y + 0.1 + o.r, o.pos.z]}>
          <sphereGeometry args={[o.r, 32, 32]} />
          <meshStandardMaterial color={o.color} emissive={o.color} emissiveIntensity={0.7} roughness={0.3} metalness={0.2} />
        </mesh>
      ))}
      <lineSegments geometry={lines.gen}>
        <lineBasicMaterial color={SAJU_GOLD} transparent opacity={0.75} />
      </lineSegments>
      <lineSegments geometry={lines.con}>
        <lineDashedMaterial color={SAJU_JUSA} transparent opacity={0.45} dashSize={0.12} gapSize={0.1} />
      </lineSegments>
    </group>
  );
};

const Effects = () => (
  <EffectComposer>
    <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.55} luminanceSmoothing={0.3} radius={0.65} />
    <Vignette eskil={false} offset={0.22} darkness={0.8} />
  </EffectComposer>
);

export const SajuScene = ({ phase, chart, stamped, quality, focusX, focusYOffset, focus, callbacks }: Props) => {
  const timeline = useRef({ key: '', start: 0 });
  const fired = useRef(new Set<string>());
  const [tick, setTick] = useState({ elapsed: 0, now: 0 });
  const keyLight = useRef<THREE.PointLight>(null);

  useFrame((st) => {
    const now = st.clock.elapsedTime;
    const key = `${phase}:${stamped}`;
    if (timeline.current.key !== key) timeline.current = { key, start: now };
    const elapsed = now - timeline.current.start;
    if (phase === 'casting' && elapsed > TIMING.castS && !fired.current.has(`cast:${timeline.current.start}`)) {
      fired.current.add(`cast:${timeline.current.start}`);
      callbacks.onCastingDone();
    }
    if (keyLight.current) keyLight.current.intensity = 55 + Math.sin(now * 0.8) * 5;
    // 프레임 시각을 React 상태로 — 인장·리플은 시간 기반이라 리렌더가 필요하다(초당 ~30회로 제한).
    if (now - tick.now > 1 / 30) setTick({ elapsed, now });
  });

  const dayCardVisible = !!chart && phase === 'reading';

  return (
    <>
      <color attach="background" args={[SAJU_BG]} />
      <fog attach="fog" args={[SAJU_BG, 14, 34]} />
      <PerspectiveCamera makeDefault fov={CAMERA_FOV} position={[...CAMERA_POS]} near={0.1} far={80} />
      <CameraRig focusX={focusX} focusYOffset={focusYOffset} />

      <ambientLight intensity={0.35} color="#d9cfb8" />
      <pointLight ref={keyLight} position={[2.5, 6.5, 3.5]} intensity={55} color="#ffe6c0" distance={20} decay={2} castShadow />
      <pointLight position={[-4.5, 3.5, -2]} intensity={16} color={SAJU_JUSA} distance={14} decay={2} />
      <pointLight position={[4.5, 2.5, -3]} intensity={12} color={SAJU_GOLD} distance={14} decay={2} />

      <Stars radius={50} depth={30} count={Math.round(quality.stars * 0.6)} factor={2.6} saturation={0} fade speed={0.25} />
      <Sparkles count={Math.round(quality.sparkles * 0.7)} scale={[14, 6, 14]} position={[0, 2.5, 0]} size={2.2} speed={0.18} opacity={0.5} color="#e8cf8f" />

      <Disc phase={phase} elapsed={tick.elapsed} />
      {chart && (phase === 'stamping' || phase === 'reading') && (
        <Seals chart={chart} phase={phase} stamped={stamped} elapsed={tick.elapsed} now={tick.now} onStamp={callbacks.onStamp} />
      )}
      {chart && <DayMasterCard chart={chart} visible={dayCardVisible} elapsed={tick.elapsed} />}
      {chart && phase === 'reading' && <ElementOrbs chart={chart} active={focus === 'elements'} />}

      {quality.bloom && <Effects />}
    </>
  );
};
