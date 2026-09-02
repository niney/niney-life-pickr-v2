import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { TarotPhase } from '@repo/utils';
import { fireOnce, segmentKey, syncTimeline, useStage } from './StageContext';
import {
  CARD_H,
  CARD_T,
  CARD_W,
  DECK_SIZE,
  SHUFFLE_BEATS,
  TIMING,
  clonePose,
  dampK,
  fanPose,
  restPose,
  scatterPose,
  stackPose,
  type Pose,
} from './layout';

// 78장 덱 — InstancedMesh 하나(드로우콜 1). 뒷면 텍스처만 쓴다(부채꼴은 앞면을 안 보인다).
// 뽑힌 카드는 인스턴스를 0 으로 줄이고 DrawnCard 가 같은 자리에서 이어받는다.
//
// phase 별 목표 포즈: setup 스택 → shuffling 산개(박자마다) → picking 부채꼴(+호버) →
// 이후 슬롯 뒤로 물러난 스택. 매 프레임 현재 포즈를 목표로 감쇠 보간해 어느 전이든 부드럽다.
//
// 호버 판정은 레이캐스트가 아니라 **정지 포즈의 화면 투영 x 에 가장 가까운 카드**로 한다.
// 레이캐스트는 들려 올라간 카드의 현재 위치를 맞히므로, 카드가 포인터 밑에서 빠져나가면
// 이웃으로 바뀌고 다시 내려오며 이웃이 빠지는 식으로 떨리고(팝콘), 14px 씩 겹친 부채꼴에선
// 어느 카드가 잡히는지 예측이 안 됐다. 정지 포즈 기준이면 애니메이션과 무관하게 안정적이고,
// 이웃으로 넘어갈 때 약간의 히스테리시스를 둔다. 포인터가 덱 위에 있는지는 메시 이벤트로 안다.

interface Props {
  deckOrder: readonly string[];
  picked: ReadonlySet<string>;
  phase: TarotPhase;
  revealed: number;
  canPick: boolean;
}

interface Live {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: number;
}

// 호버 카드: 위로·카메라 쪽으로 튀어나오고 살짝 커진다. 이웃은 좌우로 밀려 자리를 내준다.
const HOVER_LIFT = 0.42;
const HOVER_FORWARD = 0.5;
const HOVER_SCALE = 1.05;
const SPREAD_REACH = 7;
const SPREAD_MAX = 0.24;
// 이웃으로 갈아타려면 이만큼(NDC) 더 가까워야 한다 — 경계에서 떨림 방지.
const HOVER_HYSTERESIS = 0.004;
// 포인터가 부채꼴 세로 띠(카드 중심 기준 ±) 안에 있을 때만 호버.
const HOVER_BAND_Y = 0.42;

const COLOR_IDLE = new THREE.Color(1, 1, 1);
const COLOR_HOVER = new THREE.Color(1.35, 1.28, 1.1);

export const FanDeck = ({ deckOrder, picked, phase, revealed, canPick }: Props) => {
  const { timelineRef, firedRef, hoveredRef, callbacks, backTexture } = useStage();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const insideRef = useRef(false);

  const geometry = useMemo(() => new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T), []);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.6, metalness: 0.12 }),
    [backTexture],
  );

  // 정적 포즈 표 — 프레임마다 Vector3 를 새로 만들지 않게 한 번만.
  const poses = useMemo(() => {
    const stack = Array.from({ length: DECK_SIZE }, (_, i) => stackPose(i));
    const rest = Array.from({ length: DECK_SIZE }, (_, i) => restPose(i));
    const fan = Array.from({ length: DECK_SIZE }, (_, i) => fanPose(i, DECK_SIZE));
    const scatter = Array.from({ length: SHUFFLE_BEATS }, (_, beat) =>
      Array.from({ length: DECK_SIZE }, (_, i) => scatterPose(i, beat)),
    );
    return { stack, rest, fan, scatter };
  }, []);

  // 프레임마다 바뀌는 가변 상태는 ref 에(렌더와 무관).
  const liveRef = useRef<Live[] | null>(null);
  if (liveRef.current === null) liveRef.current = poses.stack.map((p) => clonePose(p));
  const tmpRef = useRef<{ m: THREE.Matrix4; p: THREE.Vector3; s: THREE.Vector3; proj: THREE.Vector3; color: THREE.Color } | null>(null);
  if (tmpRef.current === null) {
    tmpRef.current = {
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      s: new THREE.Vector3(),
      proj: new THREE.Vector3(),
      color: new THREE.Color(),
    };
  }

  useFrame((st, dt) => {
    const mesh = meshRef.current;
    const live = liveRef.current;
    const tmp = tmpRef.current;
    if (!mesh || !live || !tmp) return;
    // three 는 InstancedMesh 의 boundingSphere 를 첫 레이캐스트 때 한 번만 계산한다 — 스택 상태에서
    // 계산되면 부채꼴로 펼친 뒤엔 광선이 구 밖이라 호버·클릭이 전혀 안 잡힌다. 넉넉한 고정 구로.
    if (mesh.boundingSphere === null || mesh.boundingSphere.radius < 40) {
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 60);
    }
    const t = st.clock.elapsedTime;
    const elapsed = syncTimeline(timelineRef, segmentKey(phase, revealed), t);
    const k = dampK(dt, 7);
    const beat = Math.min(SHUFFLE_BEATS, Math.floor(elapsed / TIMING.shuffleBeatS));

    // ── 호버 판정(뽑는 동안만) — 정지 포즈 투영 x 최근접 + 히스테리시스.
    if (phase === 'picking' && insideRef.current) {
      const px = st.pointer.x;
      const py = st.pointer.y;
      let best = -1;
      let bestDx = Infinity;
      let currentDx = Infinity;
      for (let i = 0; i < DECK_SIZE; i++) {
        const id = deckOrder[i];
        if (id === undefined || picked.has(id)) continue;
        tmp.proj.copy(poses.fan[i]!.p).applyMatrix4(mesh.matrixWorld).project(st.camera);
        if (Math.abs(tmp.proj.y - py) > HOVER_BAND_Y) continue;
        const dx = Math.abs(tmp.proj.x - px);
        if (i === hoveredRef.current) currentDx = dx;
        if (dx < bestDx) {
          bestDx = dx;
          best = i;
        }
      }
      if (best !== -1 && (hoveredRef.current === -1 || bestDx + HOVER_HYSTERESIS < currentDx)) {
        hoveredRef.current = best;
      } else if (best === -1) {
        hoveredRef.current = -1;
      }
    } else {
      hoveredRef.current = -1;
    }
    const hov = hoveredRef.current;

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
      tmp.color.copy(COLOR_IDLE);
      if (phase === 'picking' && !isPicked) {
        // 부채꼴 전체가 한 덩어리로 숨 쉬듯 — 카드마다 위상을 달리하면 위로 간 카드가 카메라에
        // 미세하게 가까워져 이웃과 앞뒤가 뒤바뀌고(정점에서 특히) 문양이 번갈아 가려진다.
        tmp.p.y += Math.sin(t * 1.1) * 0.02;
        if (hov === i) {
          tmp.p.y += HOVER_LIFT;
          tmp.p.z += HOVER_FORWARD;
          targetScale = HOVER_SCALE;
          tmp.color.copy(COLOR_HOVER);
        } else if (hov !== -1) {
          // 이웃은 호버 카드에서 멀어질수록 덜 밀린다.
          const d = i - hov;
          const ad = Math.abs(d);
          if (ad <= SPREAD_REACH) tmp.p.x += Math.sign(d) * (1 - ad / (SPREAD_REACH + 1)) * SPREAD_MAX;
        }
      }
      if (!isPicked) cur.p.lerp(tmp.p, k);
      cur.q.slerp(target.q, k);
      cur.s += (targetScale - cur.s) * dampK(dt, 12);
      tmp.m.compose(cur.p, cur.q, tmp.s.setScalar(Math.max(cur.s, 0.0001)));
      mesh.setMatrixAt(i, tmp.m);
      mesh.setColorAt(i, tmp.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    document.body.style.cursor = phase === 'picking' && hov !== -1 ? 'pointer' : '';

    if (phase === 'shuffling' && elapsed > TIMING.shuffleS && fireOnce(firedRef, `shuffle:${timelineRef.current.start}`)) {
      callbacks.onShuffleDone();
    }
  });

  const onMove = () => {
    insideRef.current = canPick;
  };
  const onOut = () => {
    insideRef.current = false;
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!canPick) return;
    // 드래그(훑기) 끝의 클릭은 무시 — R3F 가 pointerdown 이후 이동 거리를 delta 로 준다.
    if (e.delta > 6) return;
    // 호버 중인 카드(들려 있는 그 카드)를 우선. 터치처럼 호버가 없으면 레이캐스트 결과.
    const idx = hoveredRef.current >= 0 ? hoveredRef.current : (e.instanceId ?? -1);
    const id = idx >= 0 ? deckOrder[idx] : undefined;
    if (id === undefined || picked.has(id)) return;
    e.stopPropagation();
    hoveredRef.current = -1;
    insideRef.current = false;
    document.body.style.cursor = '';
    callbacks.onPick(id);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, DECK_SIZE]}
      frustumCulled={false}
      onPointerMove={onMove}
      onPointerOut={onOut}
      onClick={onClick}
    />
  );
};
