// 천문도 무대 설정 — 2D·3D 무대와 사주 화면이 함께 쓴다. 3D 를 쓸 수 있는 빌드인지는 공용 stage3dAvailable.

// 타이밍 — 웹 3D 무대(stage/sajuLayout TIMING)와 같은 값. 흐름 전환(onCastingDone·onStamp)은 사주 화면의 JS 타이머가
// 이 값으로 낸다(렌더가 버벅여도 흐름은 멈추지 않는다).
//   casting   고리 바깥·중간·안이 1.4·2.1·2.8초에 멈추고, 3초 뒤 onCastingDone.
//   stamping  구간 시작 0.22초 뒤 인장이 떨어지기 시작해 0.32초 뒤 착지(onStamp) + 파문 0.9초.
export const SAJU_STAGE_TIMING = { castMs: 3000, stopsMs: [1400, 2100, 2800], dropStartMs: 220, dropMs: 320, rippleMs: 900 } as const;
