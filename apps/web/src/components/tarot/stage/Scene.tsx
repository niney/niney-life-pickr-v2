import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Sparkles, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { getTarotCard, type TarotElement } from '@repo/utils';
import type { TarotQuality } from '../tarotQuality';
import { TAROT_BG, TAROT_ELEMENT_COLOR, TAROT_GOLD } from '@repo/shared';
import { DrawnCard } from './DrawnCard';
import { FanDeck } from './FanDeck';
import { FrameDriver } from './FrameDriver';
import {
  StageContext,
  fireOnce,
  segmentKey,
  syncTimeline,
  type StageCallbacks,
  type StageContextValue,
  type StageFlow,
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
import { sparkleColors } from './sparkles';
import { fallbackBackTexture, glowTexture, loadCardBack } from './textures';

// 무대 — 배경·조명·별·파티클·테이블·덱·뽑힌 카드·후처리. 흐름 상태 중 무대가 보는 필드(StageFlow)를 받아
// 그리기만 하고, 애니메이션이 끝나면 콜백으로 상태 머신을 진행시킨다.

interface Props extends StageFlow {
  // 스프레드의 자리 수(뽑을 장수).
  total: number;
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

// 후처리 — props 가 없어 한 번만 그린다(memo). multisampling 은 래퍼 기본값이 8 인데, bloom 을 켠 등급은 화면 전체를
// HalfFloat 버퍼에 그리므로 4 로 낮춘다(가장자리 계단은 4 배로도 충분히 잡힌다).
const Effects = memo(() => (
  <EffectComposer multisampling={4}>
    <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.62} luminanceSmoothing={0.25} radius={0.6} />
    <Vignette eskil={false} offset={0.2} darkness={0.75} />
  </EffectComposer>
));

// 수트 원소 림 라이트 색 — 프레임마다 색 문자열을 파싱하지 않게 미리 Color 로.
const ELEMENT_COLOR: Record<TarotElement, THREE.Color> = {
  fire: new THREE.Color(TAROT_ELEMENT_COLOR.fire),
  water: new THREE.Color(TAROT_ELEMENT_COLOR.water),
  air: new THREE.Color(TAROT_ELEMENT_COLOR.air),
  earth: new THREE.Color(TAROT_ELEMENT_COLOR.earth),
};

export const Scene = ({ phase, deckOrder, picked, drawn, revealed, total, quality, focusX, focusYOffset, fanOffsetRef, callbacks }: Props) => {
  const backTexture = useBackTexture();
  const timelineRef = useRef<StageTimeline>({ key: '', start: 0 });
  const firedRef = useRef(new Set<string>());
  const hoveredRef = useRef(-1);
  const cardHoverRef = useRef(false);
  // body 에 지금 걸어 둔 커서가 pointer 인지 — 바뀔 때만 DOM 에 쓴다.
  const cursorRef = useRef(false);
  const fanGroup = useRef<THREE.Group>(null);
  const elementLight = useRef<THREE.PointLight>(null);
  const elementColorRef = useRef<THREE.Color | null>(null);
  if (elementColorRef.current === null) elementColorRef.current = new THREE.Color(TAROT_ELEMENT_COLOR.water);

  const ctx = useMemo<StageContextValue>(
    () => ({ timelineRef, firedRef, fanOffsetRef, hoveredRef, cardHoverRef, callbacks, backTexture }),
    [fanOffsetRef, callbacks, backTexture],
  );

  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const aspect = useThree((s) => s.viewport.aspect);
  // 소수점을 뭉개 리사이즈마다 재계산·리렌더가 튀지 않게.
  const spread = Math.round(slotSpreadFor(aspect) * 20) / 20;
  // 뽑힌 카드의 출발 포즈 — 부채꼴에서 그 카드가 있던 자리.
  const fromPoses = useMemo(() => {
    const map = new Map<string, Pose>();
    for (const id of picked) {
      const idx = deckOrder.indexOf(id);
      map.set(id, fanPose(idx < 0 ? 0 : idx, deckOrder.length || 78));
    }
    return map;
  }, [picked, deckOrder]);

  // 마지막으로 뒤집힌 카드의 원소 → 림 라이트 색.
  const lastElement = (() => {
    const d = drawn[revealed - 1];
    return d ? (getTarotCard(d.cardId)?.element ?? 'water') : 'water';
  })();

  // 타임라인 세그먼트 키 — 프레임마다 문자열을 새로 만들지 않게 렌더에서 한 번.
  const segment = segmentKey(phase, revealed);

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    const elapsed = syncTimeline(timelineRef, segment, t);
    if (phase === 'placing' && elapsed > TIMING.placeS && fireOnce(firedRef, `placed:${timelineRef.current.start}`)) {
      callbacks.onPlaced();
    }
    // 부채꼴 훑기 — 뽑는 동안만 드래그 값, 그 밖엔 0 으로 되돌린다.
    if (phase !== 'picking') fanOffsetRef.current += (0 - fanOffsetRef.current) * dampK(dt, 4);
    if (fanGroup.current) fanGroup.current.rotation.y = fanOffsetRef.current;
    const light = elementLight.current;
    const color = elementColorRef.current;
    if (light && color) {
      color.lerp(ELEMENT_COLOR[lastElement], dampK(dt, 2));
      light.color.copy(color);
      light.intensity = 12 + Math.sin(t * 1.3) * 2;
    }
    // 커서 — 덱 호버(뽑는 중)와 뽑힌 카드 호버(읽는 중)를 모아 여기서만 body 에 쓴다. 카드가 호버 중에 사라지면
    // (다시 뽑기) pointerout 이 오지 않으므로 읽는 단계를 벗어나면 카드 호버를 내린다.
    if (phase !== 'reading') cardHoverRef.current = false;
    const pointer = (phase === 'picking' && hoveredRef.current !== -1) || cardHoverRef.current;
    if (pointer !== cursorRef.current) {
      cursorRef.current = pointer;
      document.body.style.cursor = pointer ? 'pointer' : '';
    }
  });

  // 무대가 사라질 때 커서를 원래대로 — 호버 중에 페이지를 떠나면 body 에 pointer 가 남는다.
  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    [],
  );

  const showFan = phase === 'picking';
  // 연출이 도는 단계 — 섞기·뽑기(부채꼴 호흡·호버)·자리 잡기·뒤집기. 설정 폼과 해석을 읽는 동안은 느린 박자로.
  const animated = phase === 'shuffling' || phase === 'picking' || phase === 'placing' || phase === 'revealing';

  return (
    <StageContext.Provider value={ctx}>
      <FrameDriver active={animated} settleKey={`${phase}:${revealed}:${picked.length}:${focusX}:${focusYOffset}`} />
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
        color={sparkleColors('#ffd98a', quality.sparkles)}
      />
      <Table />

      <group ref={fanGroup} position={[0, 0, FAN_CZ]}>
        <FanDeck deckOrder={deckOrder} picked={pickedSet} phase={phase} revealed={revealed} canPick={showFan} />
        {(phase === 'picking' || phase === 'placing') && <SlotOutlines total={total} spread={spread} />}
        {picked.map((id, i) => {
          const d = drawn[i];
          return (
            <DrawnCard
              key={id}
              index={i}
              total={total}
              cardId={id}
              reversed={d?.reversed ?? false}
              fromPose={fromPoses.get(id) ?? fanPose(0, 78)}
              phase={phase}
              revealed={revealed}
              spread={spread}
            />
          );
        })}
      </group>

      {quality.bloom && <Effects />}
    </StageContext.Provider>
  );
};
