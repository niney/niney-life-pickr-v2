import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

// 무대 프레임 구동 — Canvas 는 frameloop="demand" 로 두고 다음 프레임을 여기서 요청한다(타로·사주 무대 공용).
//
//   매 프레임   연출 단계(active) · 단계나 시선이 바뀐 직후 · 포인터가 무대 위에서 움직인 직후(STAGE_SETTLE_S 동안)
//   느리게      그 밖 — 폼을 채우거나 풀이를 읽는 동안. 별·파티클만 흐르면 되므로 STAGE_IDLE_FPS 로 충분하다.
//
// Canvas 의 frameloop prop 을 always ↔ demand 로 바꾸지 않는 이유: R3F 는 frameloop 가 바뀔 때마다 clock 을 0 으로
// 되돌린다(setFrameloop). 별·파티클·조명 맥동과 무대 타임라인이 전부 clock.elapsedTime 으로 돌아서 그 순간 튄다.

/** 연출이 없을 때의 초당 프레임 수 — 이 값 하나로 조절한다. */
export const STAGE_IDLE_FPS = 30;
/** 단계 전환·포인터 이동 뒤 감쇠 보간(카메라·덱·카드)이 가라앉을 때까지 매 프레임으로 두는 시간(초). */
export const STAGE_SETTLE_S = 2;

interface Props {
  /** 연출 단계 — 켜져 있는 동안은 매 프레임. */
  active: boolean;
  /** 바뀌면 STAGE_SETTLE_S 동안 매 프레임 — 단계·시선처럼 감쇠 보간이 새로 시작되는 값을 이어 붙인 문자열. */
  settleKey: string;
}

export const FrameDriver = ({ active, settleKey }: Props) => {
  const invalidate = useThree((s) => s.invalidate);
  const live = useRef({ key: '', px: 0, py: 0, until: 0 });

  useFrame((st) => {
    const s = live.current;
    const now = st.clock.elapsedTime;
    if (s.key !== settleKey || s.px !== st.pointer.x || s.py !== st.pointer.y) {
      s.key = settleKey;
      s.px = st.pointer.x;
      s.py = st.pointer.y;
      s.until = now + STAGE_SETTLE_S;
    }
    // useFrame 안에서 부르면 R3F 가 다음 프레임을 바로 잇는다(always 와 같은 박자).
    if (active || now < s.until) invalidate();
  });

  // 느린 박자 — 타이머가 한 프레임씩 요청한다(이미 매 프레임 도는 중이면 겹쳐도 한 프레임). 탭이 숨으면 rAF 가 멈춰
  // 요청만 쌓이고 그리지 않는다.
  useEffect(() => {
    const id = window.setInterval(() => invalidate(), 1000 / STAGE_IDLE_FPS);
    return () => window.clearInterval(id);
  }, [invalidate]);

  return null;
};
