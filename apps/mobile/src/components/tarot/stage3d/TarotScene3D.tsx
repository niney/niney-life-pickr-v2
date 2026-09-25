import { createContext, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber/native';
import type { TarotDrawnCardType } from '@repo/api-contract';
import { TAROT_BG, TAROT_ELEMENT_COLOR, TAROT_GOLD } from '@repo/shared';
import { getTarotCard, type TarotPhase } from '@repo/utils';
import { dotTexture } from '../../common/stage3d/dataTexture';
import {
  CAMERA_POS,
  CARD_H,
  CARD_T,
  CARD_W,
  DECK_SIZE,
  FAN_CZ,
  LOOK_AT_Y,
  SHUFFLE_BEATS,
  TIMING,
  clamp,
  clonePose,
  dampK,
  easeInOutCubic,
  fanPose,
  restPose,
  scatterPose,
  slotPose,
  slotPoseInto,
  slotSpreadFor,
  stackPose,
  type Pose,
} from './layout';
import { fallbackFrontTexture, loadCardFront, prepareBackTexture, tableGlowTexture } from './textures';

// 타로 3D 장면 — 웹 stage/Scene·FanDeck·DrawnCard 를 앱(expo-gl)으로 옮긴 것. 같은 치수·포즈·타이밍.
//   setup      탁자 위에 엎어 쌓인 덱(입력 화면 위쪽 자리에 크게).
//   shuffling  78장이 네 박자로 흩어졌다 다시 쌓인다.
//   picking    부채꼴 — 화면 드래그로 훑고(controlRef.fanOffset) 누르는 동안 가까운 카드가 들린다(controlRef.hovered).
//              고른 카드는 그 자리에서 날아가 슬롯에 엎어진다. 슬롯 윤곽이 갈 자리를 보여 준다.
//   placing    덱이 슬롯 뒤로 물러나 쉰다.
//   revealing  자기 차례에 0.25초 쉬고 1.1초에 걸쳐 뒤집힌다(들렸다 내려앉음·금빛 발광·반짝이).
//   reading    해석 패널이 아래를 덮으면 카메라가 카드 줄을 패널 위 공간 가운데로 옮긴다.
// 앱에서 다른 점: PBR 대신 Phong(expo-gl 에서 넓은 PBR 면이 안 그려지는 프레임), 후처리(Bloom) 없음, 별·반짝이는 점
// 두 겹(drei 대신), 마우스 호버·클릭 대신 화면이 준 controlRef(드래그·누름), 흐름 전환은 화면 타이머(장면은 그리기만).

/** 화면 ↔ 장면 공유 값 — 화면의 터치 층이 쓰고 장면이 매 프레임 읽는다(렌더와 무관한 ref). */
export interface TarotStage3DControl {
  /** 부채꼴 그룹 회전(rad) — 드래그로 훑기. */
  fanOffset: number;
  /** 들린 카드(deckOrder index, -1 없음). */
  hovered: number;
  /** 화면 정규화 좌표(NDC) → 가장 가까운 부채꼴 카드 index(-1 없음). 장면이 채운다. */
  nearestAt: ((x: number, y: number) => number) | null;
}

/** 카메라 프레이밍 — hero: 덱을 screenY 에 크게 / stage: 기본 시점 / read: 카드 줄을 screenY 에. screenY 는 캔버스 로컬 px. */
export interface TarotSceneFraming {
  mode: 'hero' | 'stage' | 'read';
  screenY: number;
}

export interface TarotScene3DProps {
  phase: TarotPhase;
  deckOrder: readonly string[];
  picked: readonly string[];
  drawn: readonly TarotDrawnCardType[];
  revealed: number;
  /** 스프레드 장수. */
  total: number;
  framing: TarotSceneFraming;
  controlRef: MutableRefObject<TarotStage3DControl>;
}

// eslint 가 require 결과를 any 로 둔다(사주 글리프 아틀라스와 같은 방식) — useLoader 는 모듈 번호를 받는다.
const BACK_JPG = require('../../../../assets/tarot/back-384.jpg');

// ── 구간 시계 — phase(:revealed) 가 바뀐 첫 프레임을 구간 시작으로. 모든 useFrame 이 같은 키로 부른다. ──
interface Timeline {
  key: string;
  start: number;
}
const syncTimeline = (ref: MutableRefObject<Timeline>, key: string, now: number): number => {
  if (ref.current.key !== key) ref.current = { key, start: now };
  return now - ref.current.start;
};
const segmentKey = (phase: string, revealed: number): string => `${phase}:${revealed}`;

interface StageCtxValue {
  timelineRef: MutableRefObject<Timeline>;
  controlRef: MutableRefObject<TarotStage3DControl>;
  back: THREE.Texture;
}
const StageCtx = createContext<StageCtxValue | null>(null);
const useStage = (): StageCtxValue => {
  const v = useContext(StageCtx);
  if (!v) throw new Error('StageCtx 밖');
  return v;
};

// ── 카메라 ──────────────────────────────────────────────────────────────────
// 웹과 같은 방향(위 16°)에서 거리·바라보는 점·화면 높이(view offset)를 바꾼다(입력 화면만 더 위에서). 세로 화면은 조금 물러난다(부채꼴 양끝은
// 드래그로). 바뀔 때는 부드럽게 따라간다.
const CAM_DIR = new THREE.Vector3(0, CAMERA_POS[1] - LOOK_AT_Y, CAMERA_POS[2]).normalize();
// 입력 화면(덱)은 더 위(약 50°)에서 — 낮은 시점으로 가까이 보면 78장 덱의 옆면이 벽돌처럼 보인다.
const CAM_DIR_HERO = new THREE.Vector3(0, 1.2, 1).normalize();
const BASE_DIST = Math.hypot(CAMERA_POS[1] - LOOK_AT_Y, CAMERA_POS[2]);
const LOOK_STAGE = new THREE.Vector3(0, LOOK_AT_Y, 0);
const LOOK_HERO = new THREE.Vector3(0, 0.25, 0.95);
const LOOK_READ = new THREE.Vector3(0, 1.55, 0.25);

const CameraRig = ({ framing }: { framing: TarotSceneFraming }) => {
  const cur = useRef<{ look: THREE.Vector3; dir: THREE.Vector3; d: number; oy: number } | null>(null);
  useFrame((st, dt) => {
    const cam = st.camera as THREE.PerspectiveCamera;
    const W = st.size.width;
    const H = st.size.height;
    if (W <= 0 || H <= 0) return;
    const zoomOut = clamp(1.7 / (W / H), 1, 1.35);
    const look = framing.mode === 'hero' ? LOOK_HERO : framing.mode === 'read' ? LOOK_READ : LOOK_STAGE;
    // 입력 화면은 캔버스(화면 전체)에 비해 덱 자리가 작아(150pt) 멀리서 — 덱이 그 안에 110pt 남짓으로 들어온다.
    const d = framing.mode === 'hero' ? BASE_DIST * 1.6 : BASE_DIST * zoomOut;
    const dir = framing.mode === 'hero' ? CAM_DIR_HERO : CAM_DIR;
    const oy = H / 2 - framing.screenY;
    if (!cur.current) cur.current = { look: look.clone(), dir: dir.clone(), d, oy };
    const c = cur.current;
    const k = dampK(dt, 3);
    c.look.lerp(look, k);
    c.dir.lerp(dir, k).normalize();
    c.d += (d - c.d) * k;
    c.oy += (oy - c.oy) * k;
    cam.position.copy(c.look).addScaledVector(c.dir, c.d);
    cam.lookAt(c.look);
    cam.setViewOffset(W, H, 0, c.oy, W, H);
  });
  return null;
};

// ── 빛 ──────────────────────────────────────────────────────────────────────
// 웹과 같은 네 개. 왼쪽 림 라이트는 마지막으로 뒤집힌 카드의 원소 색으로 천천히 바뀌며 숨 쉰다.
const Lights = ({ element }: { element: keyof typeof TAROT_ELEMENT_COLOR }) => {
  const rim = useRef<THREE.PointLight>(null);
  const tmp = useRef<THREE.Color | null>(null);
  if (tmp.current === null) tmp.current = new THREE.Color();
  useFrame((st, dt) => {
    const l = rim.current;
    const t = tmp.current;
    if (!l || !t) return;
    l.color.lerp(t.set(TAROT_ELEMENT_COLOR[element]), dampK(dt, 2));
    l.intensity = 12 + Math.sin(st.clock.elapsedTime * 1.3) * 2;
  });
  return (
    <>
      <ambientLight intensity={0.55} color="#b9c3ff" />
      <pointLight position={[0, 5.5, 4]} intensity={60} color="#ffe3b3" distance={18} decay={2} />
      <pointLight ref={rim} position={[-4.5, 3, 2.5]} intensity={12} color={TAROT_ELEMENT_COLOR.water} distance={14} decay={2} />
      <pointLight position={[4.5, 2.5, -1.5]} intensity={10} color="#8a7cff" distance={14} decay={2} />
    </>
  );
};

// ── 별·반짝이 ───────────────────────────────────────────────────────────────
// 먼 별(큰 구 껍질) + 떠오르는 금빛 반짝이(웹 drei Stars·Sparkles 대신 점 두 겹). 시드 고정.
const rand = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const STAR_COUNT = 600;
const SPARK_COUNT = 90;

const Sky = () => {
  const stars = useMemo(() => {
    const r = rand(3);
    const a = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const rad = 40 + r() * 30;
      const s = Math.sqrt(1 - u * u);
      a[i * 3] = rad * s * Math.cos(th);
      a[i * 3 + 1] = Math.abs(rad * u) * 0.9 + 2;
      a[i * 3 + 2] = rad * s * Math.sin(th) - 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    return g;
  }, []);
  const sparkBase = useMemo(() => {
    const r = rand(9);
    return Array.from({ length: SPARK_COUNT }, () => ({ x: (r() - 0.5) * 16, y: r() * 7, z: (r() - 0.5) * 16 - 1, sp: 0.1 + r() * 0.25, ph: r() * Math.PI * 2 }));
  }, []);
  const sparkGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));
    return g;
  }, []);
  const sparkRef = useRef<THREE.Points>(null);
  useFrame((st) => {
    const pts = sparkRef.current;
    if (!pts) return;
    const t = st.clock.elapsedTime;
    const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const b = sparkBase[i]!;
      const y = (b.y + t * b.sp) % 7;
      pos.setXYZ(i, b.x + Math.sin(t * 0.4 + b.ph) * 0.3, y, b.z);
    }
    pos.needsUpdate = true;
  });
  return (
    <>
      <points geometry={stars}>
        <pointsMaterial map={dotTexture()} color="#ffffff" size={0.7} transparent opacity={0.75} depthWrite={false} fog={false} />
      </points>
      <points ref={sparkRef} geometry={sparkGeo}>
        <pointsMaterial map={dotTexture()} color="#ffd98a" size={0.12} transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </>
  );
};

// ── 탁자 ────────────────────────────────────────────────────────────────────
const Table = () => (
  <group>
    {/* 바닥은 거의 검어 빛 계산을 하지 않는다(화면 대부분을 덮어, 빛을 계산하면 조각 셰이더 비용이 가장 크다). */}
    <mesh rotation-x={-Math.PI / 2} position-y={0}>
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial color="#0a0f2e" />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0.4]}>
      <planeGeometry args={[11, 11]} />
      <meshBasicMaterial map={tableGlowTexture()} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0.4]}>
      <ringGeometry args={[3.1, 3.16, 128]} />
      <meshBasicMaterial color={TAROT_GOLD} transparent opacity={0.28} depthWrite={false} />
    </mesh>
  </group>
);

// ── 덱(부채꼴) ──────────────────────────────────────────────────────────────
// 78장 — InstancedMesh 하나(드로우콜 1). 뒷면 텍스처만(부채꼴은 앞면을 안 보인다). 고른 카드는 인스턴스를 0 으로 줄이고
// DrawnCard 가 같은 자리에서 이어받는다. phase 별 목표 포즈로 매 프레임 감쇠 보간해 어느 전이든 부드럽다.
const HOVER_LIFT = 0.42;
const HOVER_FORWARD = 0.5;
const HOVER_SCALE = 1.05;
const SPREAD_REACH = 7;
const SPREAD_MAX = 0.24;
// 누른 곳의 세로 띠 — 카드 중심 투영에서 이만큼(NDC) 안이면 부채꼴을 누른 것.
const HOVER_BAND_Y = 0.5;
const COLOR_IDLE = new THREE.Color(1, 1, 1);
const COLOR_HOVER = new THREE.Color(1.35, 1.28, 1.1);

const FanDeck = ({ deckOrder, picked, phase, revealed }: { deckOrder: readonly string[]; picked: ReadonlySet<string>; phase: TarotPhase; revealed: number }) => {
  const { timelineRef, controlRef, back } = useStage();
  const camera = useThree((s) => s.camera);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T), []);
  const material = useMemo(() => new THREE.MeshPhongMaterial({ map: back, shininess: 24, specular: new THREE.Color('#2a2a2a') }), [back]);
  const poses = useMemo(
    () => ({
      stack: Array.from({ length: DECK_SIZE }, (_, i) => stackPose(i)),
      rest: Array.from({ length: DECK_SIZE }, (_, i) => restPose(i)),
      fan: Array.from({ length: DECK_SIZE }, (_, i) => fanPose(i, DECK_SIZE)),
      scatter: Array.from({ length: SHUFFLE_BEATS }, (_, beat) => Array.from({ length: DECK_SIZE }, (_, i) => scatterPose(i, beat))),
    }),
    [],
  );
  const liveRef = useRef<Pose[] | null>(null);
  if (liveRef.current === null) liveRef.current = poses.stack.map((p) => clonePose(p));
  const tmpRef = useRef<{ m: THREE.Matrix4; p: THREE.Vector3; s: THREE.Vector3; eye: THREE.Vector3 } | null>(null);
  if (tmpRef.current === null) tmpRef.current = { m: new THREE.Matrix4(), p: new THREE.Vector3(), s: new THREE.Vector3(), eye: new THREE.Vector3() };
  // 그리기 순서 — 인스턴스 칸을 매 프레임 카메라에 가까운 카드부터 채운다(앞 → 뒤). 겹친 카드(쌓인 덱·섞기·부채꼴)의
  // 가려진 면이 깊이 테스트에서 먼저 버려져 조각 셰이더를 덜 돈다 — 뒤에서부터 칠하면 부채꼴은 같은 화소를 여러 번,
  // 쌓인 덱은 78번 칠한다(시뮬레이터 소프트웨어 GL·가려진 면을 미리 거르지 않는 GPU. 애플 GPU 는 HSR 로 거른다).
  // 순서는 프레임마다 조금씩만 바뀌어 지난 순서에서 삽입 정렬하면 거의 공짜다.
  const sortRef = useRef<{ order: number[]; depth: Float32Array } | null>(null);
  if (sortRef.current === null) sortRef.current = { order: Array.from({ length: DECK_SIZE }, (_, i) => i), depth: new Float32Array(DECK_SIZE) };
  const seg = segmentKey(phase, revealed);
  // 화면 터치가 부르는 최근접 판정 — 최신 덱 순서·고른 카드를 본다.
  const latest = useRef({ deckOrder, picked });
  useEffect(() => {
    latest.current = { deckOrder, picked };
  });
  useEffect(() => {
    const c = controlRef.current;
    const proj = new THREE.Vector3();
    const nearestAt = (x: number, y: number): number => {
      const mesh = meshRef.current;
      if (!mesh) return -1;
      mesh.updateWorldMatrix(true, false);
      let best = -1;
      let bestDx = Infinity;
      for (let i = 0; i < DECK_SIZE; i++) {
        const id = latest.current.deckOrder[i];
        if (id === undefined || latest.current.picked.has(id)) continue;
        proj.copy(poses.fan[i]!.p).applyMatrix4(mesh.matrixWorld).project(camera);
        if (Math.abs(proj.y - y) > HOVER_BAND_Y) continue;
        const dx = Math.abs(proj.x - x);
        if (dx < bestDx) {
          bestDx = dx;
          best = i;
        }
      }
      return best;
    };
    c.nearestAt = nearestAt;
    return () => {
      if (c.nearestAt === nearestAt) c.nearestAt = null;
    };
  }, [camera, controlRef, poses]);

  useFrame((st, dt) => {
    const mesh = meshRef.current;
    const live = liveRef.current;
    const tmp = tmpRef.current;
    const sort = sortRef.current;
    if (!mesh || !live || !tmp || !sort) return;
    const t = st.clock.elapsedTime;
    const elapsed = syncTimeline(timelineRef, seg, t);
    const k = dampK(dt, 7);
    const beat = Math.min(SHUFFLE_BEATS, Math.floor(elapsed / TIMING.shuffleBeatS));
    const hov = phase === 'picking' ? controlRef.current.hovered : -1;
    // 카메라 위치를 덱 로컬 좌표로(부채꼴 그룹 회전 포함 — 한 프레임 전 행렬이면 순서 정하기엔 충분).
    const eye = mesh.worldToLocal(tmp.eye.copy(st.camera.position));
    let lit = -1;
    for (let i = 0; i < DECK_SIZE; i++) {
      const id = deckOrder[i];
      const isPicked = id !== undefined && picked.has(id);
      let target: Pose;
      let targetScale = 1;
      switch (phase) {
        case 'setup':
          target = poses.stack[i]!;
          break;
        case 'shuffling':
          target = beat < SHUFFLE_BEATS ? poses.scatter[beat]![i]! : poses.stack[i]!;
          break;
        case 'picking':
          target = poses.fan[i]!;
          break;
        default:
          target = poses.rest[i]!;
      }
      if (isPicked) targetScale = 0;
      const cur = live[i]!;
      tmp.p.copy(target.p);
      if (phase === 'picking' && !isPicked) {
        // 부채꼴 전체가 한 덩어리로 숨 쉬듯(카드마다 위상을 달리하면 정점에서 앞뒤가 뒤바뀐다).
        tmp.p.y += Math.sin(t * 1.1) * 0.02;
        if (hov === i) {
          tmp.p.y += HOVER_LIFT;
          tmp.p.z += HOVER_FORWARD;
          targetScale = HOVER_SCALE;
          lit = i;
        } else if (hov !== -1) {
          const d = i - hov;
          const ad = Math.abs(d);
          if (ad <= SPREAD_REACH) tmp.p.x += Math.sign(d) * (1 - ad / (SPREAD_REACH + 1)) * SPREAD_MAX;
        }
      }
      if (!isPicked) cur.p.lerp(tmp.p, k);
      cur.q.slerp(target.q, k);
      cur.s += (targetScale - cur.s) * dampK(dt, 12);
      sort.depth[i] = cur.p.distanceToSquared(eye);
    }
    const { order, depth } = sort;
    for (let a = 1; a < DECK_SIZE; a++) {
      const v = order[a]!;
      const dv = depth[v]!;
      let b = a - 1;
      while (b >= 0 && depth[order[b]!]! > dv) {
        order[b + 1] = order[b]!;
        b--;
      }
      order[b + 1] = v;
    }
    for (let slot = 0; slot < DECK_SIZE; slot++) {
      const i = order[slot]!;
      const cur = live[i]!;
      tmp.m.compose(cur.p, cur.q, tmp.s.setScalar(Math.max(cur.s, 0.0001)));
      mesh.setMatrixAt(slot, tmp.m);
      mesh.setColorAt(slot, i === lit ? COLOR_HOVER : COLOR_IDLE);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, DECK_SIZE]} frustumCulled={false} />;
};

// 부채꼴 그룹 — 화면 드래그 값만큼 돈다. 뽑는 동안이 아니면 0 으로 되돌아간다.
const FanGroup = ({ phase, children }: { phase: TarotPhase; children: ReactNode }) => {
  const { controlRef } = useStage();
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const c = controlRef.current;
    if (phase !== 'picking') c.fanOffset += (0 - c.fanOffset) * dampK(dt, 4);
    if (ref.current) ref.current.rotation.y = c.fanOffset;
  });
  return (
    <group ref={ref} position={[0, 0, FAN_CZ]}>
      {children}
    </group>
  );
};

// 슬롯 윤곽 — 어디로 날아갈지 미리 보여 준다(뽑는 동안만). 선 모양·재질은 모듈에 하나를 슬롯 배율로 늘여 쓴다 —
// 리딩마다 JSX 재질로 만들면 내려갈 때 R3F 가 버려 선 셰이더가 해제되고, 다음 부채꼴이 뜨는 첫 프레임에 다시 컴파일하며
// 멈칫했다(동기 대기, 시뮬레이터 실측 1.2초).
const slotLineMaterial = new THREE.LineBasicMaterial({ color: TAROT_GOLD, transparent: true, opacity: 0.35 });
const slotEdgeGeometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(CARD_W, CARD_H));

const SlotOutlines = ({ total, spread }: { total: number; spread: number }) => {
  const poses = useMemo(() => Array.from({ length: total }, (_, i) => slotPose(i, total, 0, 0, 0, spread)), [total, spread]);
  return (
    <group>
      {poses.map((pose, i) => (
        <lineSegments key={i} geometry={slotEdgeGeometry} material={slotLineMaterial} position={pose.p} quaternion={pose.q} scale={pose.s} />
      ))}
    </group>
  );
};

// ── 뽑힌 카드 ───────────────────────────────────────────────────────────────
// 부채꼴에서 이어받은 포즈(fromPose)에서 슬롯으로 날아가 엎어져 있다가 자기 차례(index === revealed, revealing)에
// 뒤집힌다(yaw π→0, 역방향이면 roll 0→π, 들렸다 내려앉음, 앞면 발광이 금빛으로 피크, 반짝이). 앞면 텍스처는 마운트 직후 서버에서
// 받는다 — 뒤집힐 때까지 1초 이상 여유가 있다. 실패하면 대체 앞면. 리딩이 끝나 내려가면 앞면 재질·GPU 사본·반짝이를 푼다
// (리딩마다 쌓이지 않게 — 셰이더는 예열 재질이 붙잡고 있어 다시 컴파일하지 않는다).
const edgeMaterial = new THREE.MeshPhongMaterial({ color: TAROT_GOLD, shininess: 60, specular: new THREE.Color('#fff2c8') });
// 카드 몸통 — 옆면 넷을 한 그룹으로 묶어 재질 [옆면, 앞면, 뒷면](그리기 3번 — BoxGeometry 그대로면 면마다 6번).
// BoxGeometry 인덱스는 +x·−x·+y·−y·+z·−z 순서로 면마다 6개라 앞 24개가 옆면 넷, 그다음이 앞면(+z)·뒷면(−z).
const cardGeometry = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T);
cardGeometry.clearGroups();
cardGeometry.addGroup(0, 24, 0);
cardGeometry.addGroup(24, 6, 1);
cardGeometry.addGroup(30, 6, 2);
// 앞면은 자기 그림으로 은은히 빛나게(emissiveMap) — 푸른 주변광·Phong 만으로는 해석을 볼 때 그림이 어둡다. 뒤집히는 순간엔
// 발광이 금빛으로 바뀌며 세진다.
const FACE_GLOW = new THREE.Color('#ffffff');
const FACE_FLASH = new THREE.Color(TAROT_GOLD);
const FACE_GLOW_BASE = 0.42;
const faceMaterial = (map: THREE.Texture): THREE.MeshPhongMaterial =>
  new THREE.MeshPhongMaterial({ map, emissiveMap: map, emissive: FACE_GLOW.clone(), emissiveIntensity: FACE_GLOW_BASE, shininess: 18, specular: new THREE.Color('#333333') });
// 뒷면 재질 — 뒷면 텍스처마다 하나를 뽑힌 카드·예열이 같이 쓴다.
const backMaterials = new WeakMap<THREE.Texture, THREE.MeshPhongMaterial>();
const backMaterialFor = (back: THREE.Texture): THREE.MeshPhongMaterial => {
  let m = backMaterials.get(back);
  if (!m) {
    m = new THREE.MeshPhongMaterial({ map: back, shininess: 24, specular: new THREE.Color('#2a2a2a') });
    backMaterials.set(back, m);
  }
  return m;
};
// 예열용 앞면 재질(대체 앞면) — 모듈에 하나. 앞면 셰이더를 붙잡아 둬 카드마다 앞면 재질을 버려도 다시 컴파일하지 않는다.
let warmFace: THREE.MeshPhongMaterial | null = null;
const warmFaceMaterial = (): THREE.MeshPhongMaterial => (warmFace ??= faceMaterial(fallbackFrontTexture()));
const BURST_COUNT = 36;

const DrawnCard = ({ index, total, cardId, reversed, fromPose, phase, revealed, spread }: { index: number; total: number; cardId: string; reversed: boolean; fromPose: Pose; phase: TarotPhase; revealed: number; spread: number }) => {
  const { timelineRef, back } = useStage();
  const meshRef = useRef<THREE.Mesh>(null);
  const burstRef = useRef<THREE.Points>(null);
  const live = useRef<Pose | null>(null);
  if (live.current === null) live.current = clonePose(fromPose);
  const aim = useRef<Pose | null>(null);
  if (aim.current === null) aim.current = clonePose(fromPose);
  const [front, setFront] = useState<THREE.Texture>(() => fallbackFrontTexture());
  useEffect(() => {
    let alive = true;
    let loaded: THREE.Texture | null = null;
    loadCardFront(cardId)
      .then((tex) => {
        if (!alive) return;
        loaded = tex;
        setFront(tex);
      })
      .catch(() => {
        // 대체 앞면 유지.
      });
    return () => {
      alive = false;
      // GPU 사본만 푼다 — 텍스처 객체는 캐시에 남아 다시 뽑히면 다시 올린다.
      loaded?.dispose();
    };
  }, [cardId]);
  const materials = useMemo(() => [edgeMaterial, faceMaterial(front), backMaterialFor(back)], [front, back]);
  useEffect(() => () => materials[1]?.dispose(), [materials]);
  const burst = useMemo(() => {
    const r = rand(17 + index * 31);
    const base = Array.from({ length: BURST_COUNT }, () => ({ x: (r() - 0.5) * 2.4, y: (r() - 0.5) * 3.2, z: (r() - 0.5) * 1.6, sp: 0.4 + r() * 0.8 }));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_COUNT * 3), 3));
    return { base, g };
  }, [index]);
  useEffect(() => () => burst.g.dispose(), [burst]);

  const isUp = index < revealed;
  const isFlipping = phase === 'revealing' && revealed === index;
  const seg = segmentKey(phase, revealed);

  useFrame((st, dt) => {
    const mesh = meshRef.current;
    const cur = live.current;
    const target = aim.current;
    if (!mesh || !cur || !target) return;
    const t = st.clock.elapsedTime;
    const elapsed = syncTimeline(timelineRef, seg, t);
    let progress = isUp ? 1 : 0;
    if (isFlipping) progress = clamp((elapsed - TIMING.flipGapS) / TIMING.flipS, 0, 1);
    const e = easeInOutCubic(progress);
    const yaw = Math.PI * (1 - e);
    const roll = reversed ? Math.PI * e : 0;
    const lift = Math.sin(e * Math.PI) * 0.6;
    slotPoseInto(target, index, total, yaw, roll, lift, spread);
    cur.p.lerp(target.p, dampK(dt, 8));
    if (isFlipping) cur.q.copy(target.q);
    else cur.q.slerp(target.q, dampK(dt, 8));
    cur.s += (target.s - cur.s) * dampK(dt, 8);
    mesh.position.copy(cur.p);
    mesh.quaternion.copy(cur.q);
    mesh.scale.setScalar(cur.s);
    // 앞면(+z, 1번 재질) 발광 — 평소엔 흰빛 은은히, 뒤집히는 순간 금빛으로 피크.
    const faceMat = (mesh.material as THREE.Material[])[1] as THREE.MeshPhongMaterial | undefined;
    if (faceMat) {
      const flash = Math.sin(e * Math.PI);
      faceMat.emissive.copy(FACE_GLOW).lerp(FACE_FLASH, flash);
      faceMat.emissiveIntensity = FACE_GLOW_BASE + flash * 0.5;
    }
    // 반짝이 — 뒤집는 동안 카드 둘레에서 떠오르며 사라진다.
    const pts = burstRef.current;
    if (pts) {
      const on = isFlipping && progress > 0 && progress < 1;
      pts.visible = on;
      if (on) {
        const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < BURST_COUNT; i++) {
          const b = burst.base[i]!;
          pos.setXYZ(i, cur.p.x + b.x * cur.s, cur.p.y + b.y * cur.s * 0.5 + progress * b.sp, cur.p.z + b.z);
        }
        pos.needsUpdate = true;
        (pts.material as THREE.PointsMaterial).opacity = Math.sin(progress * Math.PI) * 0.9;
      }
    }
  });

  return (
    <>
      <mesh ref={meshRef} geometry={cardGeometry} material={materials} />
      <points ref={burstRef} geometry={burst.g} visible={false} frustumCulled={false}>
        <pointsMaterial map={dotTexture()} color={TAROT_GOLD} size={0.14} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </>
  );
};

// 셰이더 예열 — 뽑힌 카드(옆면·앞면·뒷면 Phong)·슬롯 윤곽(선) 프로그램을 캔버스를 올리자마자 몇 프레임 그려 미리 컴파일하고
// 숨긴다. 연출 도중 새 프로그램이 컴파일되면 three 가 GL 에 동기 질의를 해 JS 가 GL 큐 뒤에서 기다린다(느린 GPU·시뮬레이터
// 에서 멈칫). 재질은 모두 모듈(또는 텍스처)마다 하나라 버려지지 않아 프로그램이 캔버스가 내려갈 때까지 남는다. 반짝이(점)는
// 별이 같은 프로그램을 늘 쓴다. 탁자 밑(카메라에서 가려짐)에 작게 둔다.
const WARMUP_FRAMES = 3;
const ShaderWarmup = ({ back }: { back: THREE.Texture }) => {
  const ref = useRef<THREE.Group>(null);
  const frames = useRef(0);
  const materials = useMemo(() => [edgeMaterial, warmFaceMaterial(), backMaterialFor(back)], [back]);
  useFrame(() => {
    const g = ref.current;
    if (!g || !g.visible) return;
    frames.current += 1;
    if (frames.current > WARMUP_FRAMES) g.visible = false;
  });
  return (
    <group ref={ref} position={[0, -0.4, 0.5]}>
      <mesh geometry={cardGeometry} material={materials} scale={0.05} />
      <lineSegments geometry={slotEdgeGeometry} material={slotLineMaterial} scale={0.1} />
    </group>
  );
};

export const TarotScene3D = ({ phase, deckOrder, picked, drawn, revealed, total, framing, controlRef }: TarotScene3DProps) => {
  const backRaw = useLoader(THREE.TextureLoader, BACK_JPG) as THREE.Texture;
  // 번들 뒷면을 못 읽으면 useLoader 가 던져 오류 경계가 2D 로 돌린다.
  const back = useMemo(() => prepareBackTexture(backRaw), [backRaw]);
  const timelineRef = useRef<Timeline>({ key: '', start: 0 });
  const ctx = useMemo<StageCtxValue>(() => ({ timelineRef, controlRef, back }), [controlRef, back]);
  const aspect = useThree((s) => s.viewport.aspect);
  // 소수점을 뭉개 리사이즈마다 재계산·리렌더가 튀지 않게.
  const spread = Math.round(slotSpreadFor(aspect) * 20) / 20;
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  // 뽑힌 카드의 출발 포즈 — 부채꼴에서 그 카드가 있던 자리.
  const fromPoses = useMemo(() => {
    const map = new Map<string, Pose>();
    for (const id of picked) {
      const idx = deckOrder.indexOf(id);
      map.set(id, fanPose(idx < 0 ? 0 : idx, deckOrder.length || DECK_SIZE));
    }
    return map;
  }, [picked, deckOrder]);
  const last = drawn[revealed - 1];
  const element = (last ? getTarotCard(last.cardId)?.element : undefined) ?? 'water';

  return (
    <StageCtx.Provider value={ctx}>
      <color attach="background" args={[TAROT_BG]} />
      <fog attach="fog" args={[TAROT_BG, 16, 40]} />
      <CameraRig framing={framing} />
      <Lights element={element} />
      <Sky />
      <Table />
      <FanGroup phase={phase}>
        <FanDeck deckOrder={deckOrder} picked={pickedSet} phase={phase} revealed={revealed} />
        {phase === 'picking' || phase === 'placing' ? <SlotOutlines total={total} spread={spread} /> : null}
        {picked.map((id, i) => (
          <DrawnCard
            key={id}
            index={i}
            total={total}
            cardId={id}
            reversed={drawn[i]?.reversed ?? false}
            fromPose={fromPoses.get(id) ?? fanPose(0, DECK_SIZE)}
            phase={phase}
            revealed={revealed}
            spread={spread}
          />
        ))}
      </FanGroup>
      <ShaderWarmup back={back} />
    </StageCtx.Provider>
  );
};
