// 타로 무대 타이밍 — 웹 3D 무대(stage/layout TIMING)와 같은 값. 흐름 전환(shuffle_done·placed·reveal_next)은 타로 화면의
// JS 타이머가 이 값으로 낸다(렌더가 버벅여도 흐름은 멈추지 않는다).
//   섞기 1.9초(0.38초 네 박자 + 모으기), 자리 잡기 0.85초, 뒤집기 한 장당 0.25초 쉬고 1.1초.
//   해석 패널이 올라오고 접히고 펴질 때 0.32초(ease-out cubic) — 패널과 무대(2D 카드·3D 카메라)가 같은 시간·곡선으로 움직인다.
export const TAROT_STAGE_TIMING = { shuffleMs: 1900, shuffleBeatMs: 380, placeMs: 850, flipGapMs: 250, flipMs: 1100, panelMs: 320 } as const;
