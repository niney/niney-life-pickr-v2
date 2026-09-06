import { Canvas } from '@react-three/fiber';
import type { SajuChart, SajuPhase } from '@repo/utils';
import type { TarotQuality } from '../tarot/tarotQuality';
import { SajuScene, type SajuStageCallbacks, type SajuStageFocus } from './stage/SajuScene';

// 3D 무대 진입점 — lazy 청크(three 는 타로와 같은 벤더 청크). 품질 등급·Lite 판정은 타로 tarotQuality 를 재사용.

export interface SajuStageProps {
  phase: SajuPhase;
  chart: SajuChart | null;
  stamped: number;
  quality: TarotQuality;
  focusX: number;
  focusYOffset: number;
  focus: SajuStageFocus;
  callbacks: SajuStageCallbacks;
}

export default function SajuStage(props: SajuStageProps) {
  return (
    <div className="absolute inset-0" style={{ touchAction: 'none' }} data-testid="saju-stage">
      <Canvas
        dpr={props.quality.dpr}
        gl={{ antialias: !props.quality.bloom, powerPreference: 'high-performance', alpha: false }}
        shadows="percentage"
        frameloop="always"
        flat={false}
      >
        <SajuScene {...props} />
      </Canvas>
    </div>
  );
}
