import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import type { TarotReadingResultType } from '@repo/api-contract';
import type { TarotFlowState } from '@repo/utils';
import { Scene } from './stage/Scene';
import type { StageCallbacks } from './stage/StageContext';
import { clamp } from './stage/layout';
import type { TarotQuality } from './tarotQuality';

// 3D 무대 진입점 — lazy 청크(three 전체가 여기 뒤에 온다). Canvas 밖 div 가 드래그(부채꼴 훑기)를
// 받는다: 클릭은 R3F 가, 드래그는 여기서. touch-action none 으로 스크롤과 안 싸운다(페이지는
// 뷰포트 고정).

export interface TarotStageProps {
  state: TarotFlowState<TarotReadingResultType>;
  quality: TarotQuality;
  focusX: number;
  focusYOffset: number;
  callbacks: StageCallbacks;
}

const DRAG_GAIN = 0.0032;
const FAN_OFFSET_MAX = 0.95;

export default function TarotStage({ state, quality, focusX, focusYOffset, callbacks }: TarotStageProps) {
  const fanOffset = useRef(0);
  const drag = useRef<{ x: number } | null>(null);
  const canDrag = state.phase === 'picking';

  return (
    <div
      className="absolute inset-0"
      style={{ touchAction: 'none' }}
      data-testid="tarot-stage"
      onPointerDown={(e) => {
        if (!canDrag) return;
        drag.current = { x: e.clientX };
      }}
      onPointerMove={(e) => {
        if (!drag.current || !canDrag) return;
        const dx = e.clientX - drag.current.x;
        drag.current.x = e.clientX;
        fanOffset.current = clamp(fanOffset.current + dx * DRAG_GAIN, -FAN_OFFSET_MAX, FAN_OFFSET_MAX);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onPointerLeave={() => {
        drag.current = null;
      }}
    >
      <Canvas
        dpr={quality.dpr}
        gl={{ antialias: !quality.bloom, powerPreference: 'high-performance', alpha: false }}
        frameloop="always"
        flat={false}
      >
        <Scene
          state={state}
          quality={quality}
          focusX={focusX}
          focusYOffset={focusYOffset}
          fanOffsetRef={fanOffset}
          callbacks={callbacks}
        />
      </Canvas>
    </div>
  );
}
