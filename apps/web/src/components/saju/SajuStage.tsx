import { memo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { SajuChart, SajuPhase } from '@repo/utils';
import type { TarotQuality } from '../tarot/tarotQuality';
import { SajuScene, type SajuStageCallbacks, type SajuStageFocus } from './stage/SajuScene';

// 3D 무대 진입점 — lazy 청크(three 는 타로와 같은 벤더 청크). 품질 등급·Lite 판정은 타로 tarotQuality 를 재사용.
// props 가 전부 원시값·안정 참조라 memo 로 감싼다 — 생년월일 입력이나 풀이 섹션 도착 같은 다시 그리기에 Canvas 트리가
// 끌려오지 않는다. 프레임은 demand 로 두고 tarot/stage/FrameDriver 가 요청한다(연출 중엔 매 프레임, 그 밖엔 느리게).

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

function SajuStage(props: SajuStageProps) {
  return (
    <div className="absolute inset-0" style={{ touchAction: 'none' }} data-testid="saju-stage">
      <Canvas
        dpr={props.quality.dpr}
        gl={{ antialias: !props.quality.bloom, powerPreference: 'high-performance', alpha: false }}
        shadows="percentage"
        frameloop="demand"
        flat={false}
      >
        <SajuScene {...props} />
      </Canvas>
    </div>
  );
}

export default memo(SajuStage);
