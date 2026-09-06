import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { SAJU_G_ELEMENTS, SAJU_G_ELEMENT_META, type SajuGElementId } from '@repo/utils';

function Instrument({ active, revealing }: { active: SajuGElementId | null; revealing: boolean }) {
  const orbit = useRef<Group>(null);
  useFrame((state, delta) => {
    if (orbit.current) {
      orbit.current.rotation.z += Math.min(delta, 0.05) * (revealing ? 0.25 : 0.025);
      orbit.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.18) * 0.08;
    }
  });
  return (
    <group rotation={[0.24, 0, 0]} ref={orbit}>
      {[2.05, 2.35, 2.72].map((radius, i) => (
        <mesh key={radius} rotation={[i === 1 ? 0.75 : 0, i === 2 ? -0.6 : 0, 0]}>
          <torusGeometry args={[radius, i === 1 ? 0.023 : 0.012, 12, 160]} />
          <meshStandardMaterial
            color={i === 1 ? '#b89756' : '#699f91'}
            metalness={0.8}
            roughness={0.4}
          />
        </mesh>
      ))}
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i * Math.PI) / 30;
        return (
          <mesh
            key={i}
            position={[Math.sin(a) * 2.35, Math.cos(a) * 2.35, 0]}
            rotation={[0, 0, -a]}
          >
            <boxGeometry args={[0.012, i % 5 === 0 ? 0.16 : 0.055, 0.012]} />
            <meshBasicMaterial color={i % 5 === 0 ? '#d4bb86' : '#5c837c'} />
          </mesh>
        );
      })}
      {SAJU_G_ELEMENTS.map((element, i) => {
        const a = (i * Math.PI * 2) / 5;
        return (
          <mesh key={element} position={[Math.sin(a) * 2.72, Math.cos(a) * 2.72, 0]}>
            <icosahedronGeometry args={[element === active ? 0.14 : 0.08, 1]} />
            <meshStandardMaterial
              color={SAJU_G_ELEMENT_META[element].color}
              emissive={SAJU_G_ELEMENT_META[element].color}
              emissiveIntensity={element === active ? 1.4 : 0.4}
              metalness={0.5}
              roughness={0.2}
            />
          </mesh>
        );
      })}
    </group>
  );
}
export default function SajuGStage({
  active,
  revealing,
  visible,
}: {
  active: SajuGElementId | null;
  revealing: boolean;
  visible: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 7.8], fov: 46 }}
      dpr={[1, 1.5]}
      frameloop={visible ? 'always' : 'never'}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
    >
      <ambientLight intensity={2} />
      <pointLight position={[3, 3, 5]} intensity={25} color="#ead6a7" />
      <Instrument active={active} revealing={revealing} />
    </Canvas>
  );
}
