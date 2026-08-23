import { describe, expect, it } from 'vitest';
import { inferFoodAllergens, verifiedFoodAllergens } from './food-allergen.js';

describe('food allergen evidence', () => {
  it('음식명 대신 공개 재료 문자열에서 19종 알레르겐과 근거를 결정적으로 찾는다', () => {
    const result = inferFoodAllergens(['다진 소고기', '달걀', '빵가루', '저염간장', '토마토']);

    expect(result.status).toBe('inferred');
    expect(result.allergens).toEqual(['egg', 'soybean', 'wheat', 'tomato', 'beef']);
    expect(result.evidence).toContain('쇠고기: 재료 “다진 소고기”');
    expect(result.evidence).toContain('대두: 재료 “저염간장”');
  });

  it('재료가 있되 일치 항목이 없으면 inferred none-known, 재료가 없으면 unknown이다', () => {
    expect(inferFoodAllergens(['물', '소금'])).toEqual({
      allergens: [],
      evidence: [],
      status: 'inferred',
    });
    expect(inferFoodAllergens(null)).toEqual({ allergens: [], evidence: [], status: 'unknown' });
  });

  it('운영자 검수는 enum 순서로 중복을 제거하고 빈 목록도 검수 근거를 남긴다', () => {
    expect(verifiedFoodAllergens(['wheat', 'egg', 'wheat']).allergens).toEqual(['egg', 'wheat']);
    expect(verifiedFoodAllergens([])).toMatchObject({
      allergens: [],
      status: 'verified',
      evidence: ['운영자 검증: 공개 정보에서 표시 대상 알레르겐 없음'],
    });
  });
});
