import { describe, expect, it } from 'vitest';
import {
  formatMenuPrice,
  formatTimeOfDay,
  isCountedMealDay,
  mealItemLabels,
  mealDateLabel,
  mealDateTitle,
  mealPortionFactor,
  parseTimeOfDay,
} from './mealSlot.js';

// 시각 직접 입력 파서 — 사용자가 치는 값이라 관대하되, 말이 안 되는 값은 거절한다.
describe('parseTimeOfDay', () => {
  it('콜론이 있어도 없어도 받는다', () => {
    expect(parseTimeOfDay('12:40')).toBe(760);
    expect(parseTimeOfDay('1240')).toBe(760);
  });

  it('한 자리 시각도 받는다 — 840 은 8:40', () => {
    expect(parseTimeOfDay('840')).toBe(520);
    expect(parseTimeOfDay('8:40')).toBe(520);
  });

  it('말이 안 되는 값은 null — 화면이 조용히 되돌린다', () => {
    expect(parseTimeOfDay('25:00')).toBeNull();
    expect(parseTimeOfDay('12:60')).toBeNull();
    expect(parseTimeOfDay('')).toBeNull();
    expect(parseTimeOfDay('점심')).toBeNull();
  });
});

describe('formatTimeOfDay', () => {
  it('두 자리로 채운다', () => {
    expect(formatTimeOfDay(520)).toBe('08:40');
  });

  it('24시를 넘으면 되감는다 — 야식 중앙값이 25:10 으로 나오는 경우', () => {
    expect(formatTimeOfDay(1510)).toBe('01:10');
  });
});

describe('mealPortionFactor', () => {
  it('양이 없으면 1인분으로 본다', () => {
    expect(mealPortionFactor(null)).toBe(1);
    expect(mealPortionFactor('small')).toBe(0.6);
    expect(mealPortionFactor('large')).toBe(1.5);
  });
});

// 화면 날짜 — 상대 라벨(목록 머리)과 날짜 제목(달력·통계·입력)이 같은 규칙을 쓴다.
describe('mealDateLabel', () => {
  it('일주일 안은 상대 라벨, 그 밖은 월·일', () => {
    expect(mealDateLabel('2026-10-25', '2026-10-25')).toBe('오늘');
    expect(mealDateLabel('2026-10-24', '2026-10-25')).toBe('어제');
    expect(mealDateLabel('2026-10-22', '2026-10-25')).toBe('3일 전');
    expect(mealDateLabel('2026-10-16', '2026-10-25')).toBe('10월 16일');
  });
});

describe('mealDateTitle', () => {
  it('월·일과 요일을 붙인다', () => {
    expect(mealDateTitle('2026-10-25', '2026-10-25')).toBe('10월 25일 (일)');
    expect(mealDateTitle('2026-09-26', '2026-10-25', { weekday: false })).toBe('9월 26일');
  });

  it('올해가 아니면 연도를 붙인다', () => {
    expect(mealDateTitle('2025-12-03', '2026-10-25')).toBe('2025년 12월 3일 (수)');
  });

  it('형식이 틀리면 받은 값을 그대로 돌려준다', () => {
    expect(mealDateTitle('어제', '2026-10-25')).toBe('어제');
  });
});

// 하루 평균에 넣는 날 — 영양소 점검·통계와 웹의 '안 먹음' 묻기가 같이 쓴다.
describe('isCountedMealDay', () => {
  it('두 끼 이상 기록한 날은 안 먹음 표시와 상관없이 넣는다', () => {
    expect(isCountedMealDay(2, 0)).toBe(true);
    expect(isCountedMealDay(3, 0)).toBe(true);
    expect(isCountedMealDay(2, 1)).toBe(true);
  });

  it('한 끼만 기록한 날은 남은 두 끼를 모두 안 먹음으로 표시해야 넣는다', () => {
    expect(isCountedMealDay(1, 0)).toBe(false);
    // 하나만 표시하면 남은 끼니를 모른다 — 아침만 표시하고 저녁을 안 적은 날이 평균에 들면 안 된다.
    expect(isCountedMealDay(1, 1)).toBe(false);
    expect(isCountedMealDay(1, 2)).toBe(true);
  });

  it('기록이 없는 날은 안 먹음만으로는 넣지 않는다', () => {
    expect(isCountedMealDay(0, 3)).toBe(false);
    expect(isCountedMealDay(0, 0)).toBe(false);
  });
});

describe('mealItemLabels', () => {
  it('식당 메뉴에서 넣은 항목은 그 집 메뉴명으로, 아니면 이름으로 부른다', () => {
    expect(
      mealItemLabels([
        { name: '김치찌개', menuName: '묵은지 김치찌개' },
        { name: '공기밥', menuName: null },
        { name: '달걀말이' },
      ]),
    ).toEqual(['묵은지 김치찌개', '공기밥', '달걀말이']);
  });

  it('세트를 풀어 넣어 같은 메뉴명이 여러 줄이면 구성요소 이름을 쓴다', () => {
    expect(
      mealItemLabels([
        { name: '돈가스', menuName: '수제돈까스 + 우동' },
        { name: '우동', menuName: '수제돈까스 + 우동' },
        { name: '곰탕', menuName: '특곰탕' },
      ]),
    ).toEqual(['돈가스', '우동', '특곰탕']);
  });

  it('가격은 천 단위 쉼표와 원', () => {
    expect(formatMenuPrice(9000)).toBe('9,000원');
  });
});
