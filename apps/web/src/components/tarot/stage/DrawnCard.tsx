import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import type { TarotPhase } from '@repo/utils';
import { TAROT_GOLD } from '../tarotTheme';
import { fireOnce, segmentKey, syncTimeline, useStage } from './StageContext';
import { CARD_H, CARD_T, CARD_W, TIMING, clamp, clonePose, dampK, easeInOutCubic, slotPose, type Pose } from './layout';
import { loadCardFront, placeholderFrontTexture } from './textures';

// 뽑힌 카드 한 장 — 부채꼴에서 이어받은 포즈(fromPose)에서 슬롯으로 날아가 엎어져 있다가,
// 자기 차례(index === revealed, phase revealing)에 뒤집힌다. 뒤집기는 시간 기반(yaw π→0,
// 역방향이면 roll 0→π, 들렸다 내려앉음, 금색 발광 피크 → bloom 이 받는다).
// 앞면 텍스처는 마운트 직후 지연 로드 — 뒤집힐 때까지 1초 이상 여유가 있다. 실패(미생성 카드)면
// 이름을 그린 캔버스 텍스처.

interface Props {
  index: number;
  total: number;
  cardId: string;
  reversed: boolean;
  fromPose: Pose;
  phase: TarotPhase;
  revealed: number;
  // 세로 화면 슬롯 간격 축소(layout.slotSpreadFor).
  spread: number;
}

const geometry = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T);
const edgeMaterial = new THREE.MeshStandardMaterial({ color: TAROT_GOLD, metalness: 0.85, roughness: 0.3 });

export const DrawnCard = ({ index, total, cardId, reversed, fromPose, phase, revealed, spread }: Props) => {
  const { timelineRef, firedRef, callbacks, backTexture } = useStage();
  const meshRef = useRef<THREE.Mesh>(null);
  const burstRef = useRef<THREE.Group>(null);
  const live = useRef<Pose>(clonePose(fromPose));
  const [front, setFront] = useState<THREE.Texture>(() => placeholderFrontTexture(cardId));
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCardFront(cardId)
      .then((tex) => {
        if (alive) setFront(tex);
      })
      .catch(() => {
        // 아직 생성되지 않은 카드 — placeholder 유지.
      });
    return () => {
      alive = false;
    };
  }, [cardId]);

  const frontMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: front,
        roughness: 0.5,
        metalness: 0.08,
        emissive: new THREE.Color(TAROT_GOLD),
        emissiveIntensity: 0,
      }),
    [front],
  );
  const backMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.6, metalness: 0.12 }),
    [backTexture],
  );
  // BoxGeometry 재질 순서: +x, -x, +y, -y, +z(앞면), -z(뒷면).
  const materials = useMemo(
    () => [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, frontMaterial, backMaterial],
    [frontMaterial, backMaterial],
  );

  const isUp = index < revealed;
  const isFlipping = phase === 'revealing' && revealed === index;
  const interactive = phase === 'reading';

  useFrame((st, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = st.clock.elapsedTime;
    const elapsed = syncTimeline(timelineRef, segmentKey(phase, revealed), t);

    let progress = isUp ? 1 : 0;
    if (isFlipping) {
      const raw = (elapsed - TIMING.flipGapS) / TIMING.flipS;
      progress = clamp(raw, 0, 1);
      if (raw >= 1 && fireOnce(firedRef, `reveal:${index}:${timelineRef.current.start}`)) callbacks.onRevealed();
    }
    const e = easeInOutCubic(progress);
    const yaw = Math.PI * (1 - e);
    const roll = reversed ? Math.PI * e : 0;
    const lift = Math.sin(e * Math.PI) * 0.6 + (hover ? 0.12 : 0);
    const target = slotPose(index, total, yaw, roll, lift, spread);
    const targetScale = target.s * (hover ? 1.06 : 1);

    const cur = live.current;
    cur.p.lerp(target.p, dampK(dt, 8));
    if (isFlipping) cur.q.copy(target.q);
    else cur.q.slerp(target.q, dampK(dt, 8));
    cur.s += (targetScale - cur.s) * dampK(dt, 8);

    mesh.position.copy(cur.p);
    mesh.quaternion.copy(cur.q);
    mesh.scale.setScalar(cur.s);
    // 앞면(+z, index 4) 발광 — 뒤집히는 순간 피크.
    const front = (mesh.material as THREE.Material[])[4] as THREE.MeshStandardMaterial | undefined;
    if (front) front.emissiveIntensity = Math.sin(e * Math.PI) * 0.45;
    if (burstRef.current) burstRef.current.position.copy(cur.p);
  });

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={materials}
        onPointerOver={(ev) => {
          if (!interactive) return;
          ev.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      />
      {isFlipping && (
        <group ref={burstRef}>
          <Sparkles count={70} scale={[2.4, 3.2, 1.6]} size={5} speed={1.4} opacity={0.9} color={TAROT_GOLD} />
        </group>
      )}
    </>
  );
};
