import { memo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './stage/Scene';
import type { StageCallbacks, StageFlow } from './stage/StageContext';
import { clamp } from './stage/layout';
import type { TarotQuality } from './tarotQuality';

// 3D 무대 진입점 — lazy 청크(three 전체가 여기 뒤에 온다). Canvas 밖 div 가 드래그(부채꼴 훑기)를
// 받는다: 클릭은 R3F 가, 드래그는 여기서. touch-action none 으로 스크롤과 안 싸운다(페이지는
// 뷰포트 고정).
//
// props 는 흐름 상태 중 무대가 보는 필드(StageFlow)뿐이고 memo 로 감싼다 — 설정 폼에 글자를 치거나 해석이
// 도착하는 것 같은 다시 그리기에 Canvas 트리가 끌려오지 않는다(콜백은 세션 훅이 같은 참조로 준다).
// 프레임은 demand 로 두고 stage/FrameDriver 가 요청한다(연출 중엔 매 프레임, 그 밖엔 느리게).

export interface TarotStageProps extends StageFlow {
  // 스프레드의 자리 수(뽑을 장수).
  total: number;
  quality: TarotQuality;
  focusX: number;
  focusYOffset: number;
  callbacks: StageCallbacks;
}

const DRAG_GAIN = 0.0032;
const FAN_OFFSET_MAX = 0.95;

function TarotStage({ phase, deckOrder, picked, drawn, revealed, total, quality, focusX, focusYOffset, callbacks }: TarotStageProps) {
  const fanOffset = useRef(0);
  const drag = useRef<{ x: number } | null>(null);
  const canDrag = phase === 'picking';

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
        frameloop="demand"
        flat={false}
      >
        <Scene
          phase={phase}
          deckOrder={deckOrder}
          picked={picked}
          drawn={drawn}
          revealed={revealed}
          total={total}
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

export default memo(TarotStage);
