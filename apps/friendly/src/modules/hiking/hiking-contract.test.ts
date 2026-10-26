import { describe, expect, it } from 'vitest';
import { HikingCourseSummary, HikingRecommendQuery } from '@repo/api-contract';
import { HIKING_COURSE_SHAPES, HIKING_DIFFICULTIES, HIKING_DURATIONS, HIKING_LEVELS, HIKING_TRAVEL_MODES } from '@repo/utils';

// 계약 enum ↔ utils 목록 — 같은 값을 두 곳에 따로 적으니 어긋나면 여기서 잡는다(주차 parking-master 테스트와 같은 장치).

describe('hiking 계약 ↔ utils', () => {
  it('코스 형태·난이도, 추천 입력(산행 시간·난이도·이동 수단) enum 이 utils 목록과 같다', () => {
    expect(HikingCourseSummary.shape.shape.options).toEqual([...HIKING_COURSE_SHAPES]);
    expect(HikingCourseSummary.shape.difficulty.unwrap().options).toEqual([...HIKING_DIFFICULTIES]);
    const q = HikingRecommendQuery._def.schema.shape;
    expect(q.duration._def.innerType.options).toEqual([...HIKING_DURATIONS]);
    expect(q.level._def.innerType.options).toEqual([...HIKING_LEVELS]);
    expect(q.mode._def.innerType.options).toEqual([...HIKING_TRAVEL_MODES]);
  });
});
