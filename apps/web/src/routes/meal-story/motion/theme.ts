// 건강식단 모션 — 화면 크기·빠르기·글꼴. 세로 9:16(휴대폰·쇼츠 공용), 30fps. 색은 paper/palette.ts(종이 오리기).
// 이 폴더(motion/)는 웹 재생기와 MP4 렌더 도구(tools/meal-motion)가 함께 쓴다 — remotion·react·타입만 import 한다
// (~/ 별칭·CSS·공용 훅 금지). 크림 바탕에 색종이 — 무대만 이야기의 주제색, 빨강은 판정(많음)에만.
export const W = 1080;
export const H = 1920;
export const FPS = 30;
/**
 * 빠르기 — 장면 안 움직임의 시계 배율(실제 프레임 ÷ TEMPO = 설계 프레임). 0.72 면 설계보다 약 1.4배 빠르다. 영상 전체를 더
 * 빠르게·느리게 하려면 이 숫자 하나만 바꾼다. 글 읽는 시간은 이 숫자로 줄지 않는다(timeline.ts 가 따로 지킨다).
 */
export const TEMPO = 0.72;

/**
 * 글씨 크기 하한(1080 폭 기준 px) — 실제 휴대폰 브라우저는 화면이 낮아 영상이 폭 330px 안팎으로 줄어든다(1080 의 0.3배).
 * 읽으라고 놓는 글은 본문 40, 보조(덧말·옆 값·이름표) 34, 각주 30 아래로 내리지 않는다. 소품 안의 꾸밈 글자는 예외
 * (data-deco). 장면 그림 테스트(chapters.test)가 이 하한을 지키는지 본다.
 */
export const TYPE = { body: 40, sub: 34, foot: 30 } as const;

export const FONT = "'Wanted Sans Variable', 'Wanted Sans', 'Pretendard Variable', system-ui, sans-serif";
/** 손글씨(개구, OFL) — 종이 오리기의 제목·짧은 덧말. 숫자·작은 글은 FONT. */
export const HAND = "'Gaegu', 'Wanted Sans Variable', system-ui, sans-serif";

// 나트륨 → 소금(염화나트륨) 그램. 식약처 안내 기준 나트륨 1g = 소금 2.5g.
export const sodiumToSaltG = (sodiumMg: number): number => (sodiumMg * 2.5) / 1000;

/** 소수 자릿수 — 10g 미만의 g 만 한 자리(글 장면 formatStoryAmount 와 같은 규칙, .0 은 빼고). */
export const amountDecimals = (value: number, unit: string): number =>
  unit === 'g' && value < 10 && Math.round(value * 10) % 10 !== 0 ? 1 : 0;

export const formatAmount = (value: number, unit: string): string =>
  value.toLocaleString('ko-KR', { maximumFractionDigits: amountDecimals(value, unit) });
