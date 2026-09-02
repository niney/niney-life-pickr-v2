import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Sparkles, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import type { TarotReadingResultType } from '@repo/api-contract';
import { getTarotCard, tarotRequiredPicks, type TarotFlowState } from '@repo/utils';
import type { TarotQuality } from '../tarotQuality';
import { ELEMENT_COLOR, TAROT_BG, TAROT_GOLD } from '../tarotTheme';
import { DrawnCard } from './DrawnCard';
import { FanDeck } from './FanDeck';
import {
  StageContext,
  fireOnce,
  segmentKey,
  syncTimeline,
  type StageCallbacks,
  type StageContextValue,
  type StageTimeline,
} from './StageContext';
import {
  CAMERA_FOV,
  CAMERA_POS,
  CARD_H,
  CARD_W,
  FAN_CZ,
  LOOK_AT_Y,
  TIMING,
  clamp,
  dampK,
  fanPose,
  slotPose,
  slotSpreadFor,
  type Pose,
} from './layout';
import { fallbackBackTexture, glowTexture, loadCardBack } from './textures';

// 무대 — 배경·조명·별·파티클·테이블·덱·뽑힌 카드·후처리. 흐름 상태(TarotFlowState)를 받아
// 그리기만 하고, 애니메이션이 끝나면 콜백으로 상태 머신을 진행시킨다.

interface Props {
  state: TarotFlowState<TarotReadingResultType>;
  quality: TarotQuality;
  // 읽기 패널이 오른쪽을 차지할 때 카메라 시선을 오른쪽으로 옮겨 카드가 왼쪽에 오게.
  focusX: number;
  // 세로 화면에서 패널이 아래를 덮을 때 시선을 내려 카드가 위로 올라오게(음수).
  focusYOffset: number;
  fanOffsetRef: React.MutableRefObject<number>;
  callbacks: StageCallbacks;
}

const useBackTexture = (): THREE.Texture => {
  const [tex, setTex] = useState<THREE.Texture>(() => fallbackBackTexture());
  useEffect(() => {
    let alive = true;
    loadCardBack()
      .then((t) => {
        if (alive) setTex(t);
      })
      .catch(() => {
        // 뒷면 미생성 — fallback 유지.
      });
    return () => {
      alive = false;
    };
  }, []);
  return tex;
};

// 카메라 — 마우스 시차 + 세로 화면이면 뒤로 물러나 부채꼴이 들어오게.
const CameraRig = ({ focusX, focusYOffset }: { focusX: number; focusYOffset: number }) => {
  const { camera, pointer, viewport } = useThree();
  const lookRef = useRef<THREE.Vector3 | null>(null);
  if (lookRef.current === null) lookRef.current = new THREE.Vector3(0, LOOK_AT_Y, 0);
  useFrame((_, dt) => {
    const look = lookRef.current;
    if (!look) return;
    // 세로 화면은 조금만 물러난다 — 더 물러나면 카드가 손톱만 해져 못 고른다. 부채꼴 양끝은 드래그로.
    const zoomOut = clamp(1.7 / viewport.aspect, 1, 1.35);
    const k = dampK(dt, 3);
    const { x, y, z } = camera.position;
    camera.position.set(
      x + (pointer.x * 0.55 - x) * k,
      y + (CAMERA_POS[1] + pointer.y * 0.25 - y) * k,
      z + (CAMERA_POS[2] * zoomOut - z) * k,
    );
    look.setX(look.x + (focusX - look.x) * k);
    look.setY(look.y + (LOOK_AT_Y + focusYOffset - look.y) * k);
    camera.lookAt(look);
  });
  return null;
};

const Table = () => {
  const glow = useMemo(() => glowTexture(), []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0a0f2e" roughness={1} metalness={0} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0.4]}>
        <planeGeometry args={[11, 11]} />
        <meshBasicMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0.4]}>
        <ringGeometry args={[3.1, 3.16, 128]} />
        <meshBasicMaterial color={TAROT_GOLD} transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
};

// 슬롯 윤곽 — 어디로 날아갈지 미리 보여 준다(뽑는 동안만).
const SlotOutlines = ({ total, spread }: { total: number; spread: number }) => {
  const items = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => {
        const pose = slotPose(i, total, 0, 0, 0, spread);
        const geo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(CARD_W * pose.s, CARD_H * pose.s));
        return { pose, geo };
      }),
    [total, spread],
  );
  return (
    <group>
      {items.map(({ pose, geo }, i) => (
        <lineSegments key={i} geometry={geo} position={pose.p} quaternion={pose.q}>
          <lineBasicMaterial color={TAROT_GOLD} transparent opacity={0.35} />
        </lineSegments>
      ))}
    </group>
  );
};

const Effects = () => (
  <EffectComposer>
    <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.62} luminanceSmoothing={0.25} radius={0.6} />
    <Vignette eskil={false} offset={0.2} darkness={0.75} />
  </EffectComposer>
);

export const Scene = ({ state, quality, focusX, focusYOffset, fanOffsetRef, callbacks }: Props) => {
  const backTexture = useBackTexture();
  const timelineRef = useRef<StageTimeline>({ key: '', start: 0 });
  const firedRef = useRef(new Set<string>());
  const hoveredRef = useRef(-1);
  const fanGroup = useRef<THREE.Group>(null);
  const elementLight = useRef<THREE.PointLight>(null);
  const elementColorRef = useRef<THREE.Color | null>(null);
  if (elementColorRef.current === null) elementColorRef.current = new THREE.Color(ELEMENT_COLOR.water);
  const targetColorRef = useRef<THREE.Color | null>(null);
  if (targetColorRef.current === null) targetColorRef.current = new THREE.Color();

  const ctx = useMemo<StageContextValue>(
    () => ({ timelineRef, firedRef, fanOffsetRef, hoveredRef, callbacks, backTexture }),
    [fanOffsetRef, callbacks, backTexture],
  );

  const picked = useMemo(() => new Set(state.picked), [state.picked]);
  const total = tarotRequiredPicks(state);
  const aspect = useThree((s) => s.viewport.aspect);
  // 소수점을 뭉개 리사이즈마다 재계산·리렌더가 튀지 않게.
  const spread = Math.round(slotSpreadFor(aspect) * 20) / 20;
  // 뽑힌 카드의 출발 포즈 — 부채꼴에서 그 카드가 있던 자리.
  const fromPoses = useMemo(() => {
    const map = new Map<string, Pose>();
    for (const id of state.picked) {
      const idx = state.deckOrder.indexOf(id);
      map.set(id, fanPose(idx < 0 ? 0 : idx, state.deckOrder.length || 78));
    }
    return map;
  }, [state.picked, state.deckOrder]);

  // 마지막으로 뒤집힌 카드의 원소 → 림 라이트 색.
  const lastElement = (() => {
    const d = state.drawn[state.revealed - 1];
    return d ? (getTarotCard(d.cardId)?.element ?? 'water') : 'water';
  })();

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    const elapsed = syncTimeline(timelineRef, segmentKey(state.phase, state.revealed), t);
    if (state.phase === 'placing' && elapsed > TIMING.placeS && fireOnce(firedRef, `placed:${timelineRef.current.start}`)) {
      callbacks.onPlaced();
    }
    // 부채꼴 훑기 — 뽑는 동안만 드래그 값, 그 밖엔 0 으로 되돌린다.
    if (state.phase !== 'picking') fanOffsetRef.current += (0 - fanOffsetRef.current) * dampK(dt, 4);
    if (fanGroup.current) fanGroup.current.rotation.y = fanOffsetRef.current;
    const light = elementLight.current;
    const color = elementColorRef.current;
    const target = targetColorRef.current;
    if (light && color && target) {
      color.lerp(target.set(ELEMENT_COLOR[lastElement]), dampK(dt, 2));
      light.color.copy(color);
      light.intensity = 12 + Math.sin(t * 1.3) * 2;
    }
  });

  const showFan = state.phase === 'picking';

  return (
    <StageContext.Provider value={ctx}>
      <color attach="background" args={[TAROT_BG]} />
      <fog attach="fog" args={[TAROT_BG, 16, 40]} />
      <PerspectiveCamera makeDefault fov={CAMERA_FOV} position={[...CAMERA_POS]} near={0.1} far={90} />
      <CameraRig focusX={focusX} focusYOffset={focusYOffset} />

      <ambientLight intensity={0.55} color="#b9c3ff" />
      <pointLight position={[0, 5.5, 4]} intensity={60} color="#ffe3b3" distance={18} decay={2} />
      <pointLight ref={elementLight} position={[-4.5, 3, 2.5]} intensity={12} distance={14} decay={2} />
      <pointLight position={[4.5, 2.5, -1.5]} intensity={10} color="#8a7cff" distance={14} decay={2} />

      <Stars radius={60} depth={40} count={quality.stars} factor={3.2} saturation={0} fade speed={0.35} />
      <Sparkles
        count={quality.sparkles}
        scale={[16, 7, 16]}
        position={[0, 3, -1]}
        size={2.6}
        speed={0.22}
        opacity={0.55}
        color="#ffd98a"
      />
      <Table />

      <group ref={fanGroup} position={[0, 0, FAN_CZ]}>
        <FanDeck
          deckOrder={state.deckOrder}
          picked={picked}
          phase={state.phase}
          revealed={state.revealed}
          canPick={showFan}
        />
        {(state.phase === 'picking' || state.phase === 'placing') && <SlotOutlines total={total} spread={spread} />}
        {state.picked.map((id, i) => {
          const d = state.drawn[i];
          return (
            <DrawnCard
              key={id}
              index={i}
              total={total}
              cardId={id}
              reversed={d?.reversed ?? false}
              fromPose={fromPoses.get(id) ?? fanPose(0, 78)}
              phase={state.phase}
              revealed={state.revealed}
              spread={spread}
            />
          );
        })}
      </group>

      {quality.bloom && <Effects />}
    </StageContext.Provider>
  );
};
