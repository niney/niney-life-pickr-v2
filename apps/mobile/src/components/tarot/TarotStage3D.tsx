import type { MutableRefObject } from 'react';
import type { TarotDrawnCardType } from '@repo/api-contract';
import type { TarotPhase } from '@repo/utils';
import { STAGE_RENDER_SCALE, Stage3DCanvas } from '../common/stage3d/Stage3DCanvas';
import { CAMERA_FOV, CAMERA_POS } from './stage3d/layout';
import { TarotScene3D, type TarotSceneFraming, type TarotStage3DControl } from './stage3d/TarotScene3D';

// 타로 3D 무대(expo-gl + react-three-fiber) — 화면 전체 뒤에 깔리는 캔버스. 그리기만 하고 흐름 전환(shuffle_done·placed·
// reveal_next)은 타로 화면의 JS 타이머가 낸다. GL 배관(준비·성능 판정·역압·틱·페이드)은 공용 Stage3DCanvas.
// 카드 고르기·부채꼴 훑기는 화면이 캔버스 위에 얹은 터치 층이 controlRef 로 넘긴다(캔버스는 터치를 받지 않는다).
// 입력·해석 화면은 30fps, 섞기~뒤집기 연출 중엔 화면 새로 고침마다 그린다.

export type { TarotStage3DControl };

export interface TarotStage3DProps {
  phase: TarotPhase;
  deckOrder: readonly string[];
  picked: readonly string[];
  drawn: readonly TarotDrawnCardType[];
  revealed: number;
  /** 스프레드 장수. */
  total: number;
  /** 캔버스 영역(pt) — 화면 전체. */
  width: number;
  height: number;
  /** 입력 화면에서 덱이 올 화면 높이(pt). */
  heroCenterY: number;
  /** 해석 패널이 덮는 아래 높이(pt, 0 = 없음) — 카메라가 카드 줄을 그 위 공간 가운데로 옮긴다. */
  panelHeight: number;
  /** false 면 투명하게 그리기만(준비·판정은 계속). */
  visible: boolean;
  controlRef: MutableRefObject<TarotStage3DControl>;
  /** 개발용 — 성능 판정을 건너뛰고 무조건 3D. */
  force?: boolean;
  onReady: () => void;
  onFail: (definite: boolean, reason: unknown) => void;
  onLost: () => void;
}

export const TarotStage3D = ({ phase, deckOrder, picked, drawn, revealed, total, width, height, heroCenterY, panelHeight, visible, controlRef, force = false, onReady, onFail, onLost }: TarotStage3DProps) => {
  const s = STAGE_RENDER_SCALE;
  const framing: TarotSceneFraming =
    phase === 'setup'
      ? { mode: 'hero', screenY: heroCenterY * s }
      : panelHeight > 0
        ? { mode: 'read', screenY: ((height - panelHeight) / 2 + 12) * s }
        : { mode: 'stage', screenY: height * 0.5 * s };
  return (
    <Stage3DCanvas
      tag="tarot3d"
      width={width}
      height={height}
      visible={visible}
      fps={phase === 'setup' || phase === 'reading' ? 30 : null}
      camera={{ fov: CAMERA_FOV, near: 0.1, far: 90, position: [CAMERA_POS[0], CAMERA_POS[1], CAMERA_POS[2]] }}
      force={force}
      onReady={onReady}
      onFail={onFail}
      onLost={onLost}
    >
      <TarotScene3D phase={phase} deckOrder={deckOrder} picked={picked} drawn={drawn} revealed={revealed} total={total} framing={framing} controlRef={controlRef} />
    </Stage3DCanvas>
  );
};
