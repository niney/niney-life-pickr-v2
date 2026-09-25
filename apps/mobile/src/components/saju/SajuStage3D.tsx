import type { SajuChart, SajuPhase } from '@repo/utils';
import { STAGE_RENDER_SCALE, Stage3DCanvas } from '../common/stage3d/Stage3DCanvas';
import { SajuScene3D, type SajuStageFraming } from './stage3d/Scene3D';

// 천문도 3D 무대(expo-gl + react-three-fiber) — 화면 위쪽(원판이 오가는 영역)에 깔리는 캔버스. 그리기만 하고 흐름
// 전환은 사주 화면의 JS 타이머가 낸다. GL 배관(준비·성능 판정·역압·틱·페이드)은 공용 Stage3DCanvas.
// 입력 화면(setup)은 30fps, 연출 중엔 화면 새로 고침마다 그린다.

export type { SajuStageFraming };

export interface SajuStage3DProps {
  /** 개발용 — 성능 판정(소프트웨어 GL·느린 프레임)을 건너뛰고 무조건 3D. */
  force?: boolean;
  phase: SajuPhase;
  chart: SajuChart | null;
  stamped: number;
  /** 캔버스 영역(화면 위쪽부터) — 원판이 입력·연출 때 오가는 범위를 덮는다. */
  width: number;
  height: number;
  /** 영역 좌표(pt)로 원판 위치·크기. */
  framing: SajuStageFraming;
  /** false 면 투명하게 그리기만(준비·판정은 계속). true 가 되면 0.4초에 걸쳐 나타난다. */
  visible: boolean;
  onReady: () => void;
  /** GL 오류 또는 느린 GPU — 화면이 2D 로 간다. definite: 이 기기를 "느림"으로 기억해도 될 만큼 확실한지. */
  onFail: (definite: boolean, reason: unknown) => void;
  onLost: () => void;
}

export const SajuStage3D = ({ phase, chart, stamped, width, height, framing, visible, onReady, onFail, onLost, force = false }: SajuStage3DProps) => {
  const s = STAGE_RENDER_SCALE;
  const localFraming: SajuStageFraming = { centerY: framing.centerY * s, radiusPx: framing.radiusPx * s };
  return (
    <Stage3DCanvas
      tag="saju3d"
      width={width}
      height={height}
      visible={visible}
      fps={phase === 'setup' ? 30 : null}
      camera={{ fov: 34, near: 0.1, far: 300, position: [0, 20, 17] }}
      force={force}
      statsKey={phase}
      onReady={onReady}
      onFail={onFail}
      onLost={onLost}
    >
      <SajuScene3D phase={phase} chart={chart} stamped={stamped} framing={localFraming} />
    </Stage3DCanvas>
  );
};
