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
// phase 별 목표 포즈: setup 스택 → shuffling 산개(박자마다) → picking 부채꼴(+호버 들림) →
// 이후 슬롯 뒤로 물러난 스택. 매 프레임 현재 포즈를 목표로 감쇠 보간해 어느 전이든 부드럽다.

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

const HOVER_LIFT = 0.55;

export const FanDeck = ({ deckOrder, picked, phase, revealed, canPick }: Props) => {
  const { timelineRef, firedRef, hoveredRef, callbacks, backTexture } = useStage();
  const meshRef = useRef<THREE.InstancedMesh>(null);

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
  const tmpRef = useRef<{ m: THREE.Matrix4; p: THREE.Vector3; s: THREE.Vector3 } | null>(null);
  if (tmpRef.current === null) {
    tmpRef.current = { m: new THREE.Matrix4(), p: new THREE.Vector3(), s: new THREE.Vector3() };
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
    const hov = phase === 'picking' ? hoveredRef.current : -1;
    const beat = Math.min(SHUFFLE_BEATS, Math.floor(elapsed / TIMING.shuffleBeatS));

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
        // 호버 들림 + 잔잔한 물결.
        tmp.p.y += (hov === i ? HOVER_LIFT : 0) + Math.sin(t * 1.4 + i * 0.21) * 0.025;
      }
      if (!isPicked) cur.p.lerp(tmp.p, k);
      cur.q.slerp(target.q, k);
      cur.s += (targetScale - cur.s) * dampK(dt, 12);
      tmp.m.compose(cur.p, cur.q, tmp.s.setScalar(Math.max(cur.s, 0.0001)));
      mesh.setMatrixAt(i, tmp.m);
    }
    mesh.instanceMatrix.needsUpdate = true;

    if (phase === 'shuffling' && elapsed > TIMING.shuffleS && fireOnce(firedRef, `shuffle:${timelineRef.current.start}`)) {
      callbacks.onShuffleDone();
    }
  });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!canPick) return;
    const idx = e.instanceId ?? -1;
    const id = idx >= 0 ? deckOrder[idx] : undefined;
    const ok = id !== undefined && !picked.has(id);
    hoveredRef.current = ok ? idx : -1;
    document.body.style.cursor = ok ? 'pointer' : '';
  };
  const onOut = () => {
    hoveredRef.current = -1;
    document.body.style.cursor = '';
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!canPick) return;
    // 드래그(훑기) 끝의 클릭은 무시 — R3F 가 pointerdown 이후 이동 거리를 delta 로 준다.
    if (e.delta > 6) return;
    const idx = e.instanceId ?? -1;
    const id = idx >= 0 ? deckOrder[idx] : undefined;
    if (id === undefined || picked.has(id)) return;
    e.stopPropagation();
    hoveredRef.current = -1;
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
