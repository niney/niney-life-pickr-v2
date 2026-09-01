import { describe, expect, it } from 'vitest';
import { pickNutritionDonor, type NutritionDonor } from './food-nutrition.service.js';

const donor = (name: string, kcal: number | null, dishType: string | null = null): NutritionDonor => ({
  id: `id-${name}`,
  name,
  nameNorm: name,
  dishType,
  servingG: 200,
  kcal,
  carbG: 10,
  proteinG: 20,
  fatG: 5,
  sodiumMg: 800,
  sugarG: 3,
  kcalPer100g: kcal === null ? null : kcal / 2,
});

const target = (name: string, dishType: string | null = null) => ({
  id: `t-${name}`,
  name,
  nameNorm: name,
  dishType,
});

describe('pickNutritionDonor', () => {
  it('대상명으로 끝나는 후보에서 빌려온다 — 소불고기 → 불고기', () => {
    const pick = pickNutritionDonor(target('불고기'), [donor('소불고기', 300), donor('김치찌개', 200)]);
    expect(pick?.donor.name).toBe('소불고기');
    expect(pick?.donorCount).toBe(1);
  });

  it('대상명으로 시작만 하는 후보는 다른 음식이다 — 불고기피자 ✗', () => {
    expect(pickNutritionDonor(target('불고기'), [donor('불고기피자', 800)])).toBeNull();
  });

  it('후보가 여럿이면 kcal 중앙값에 가장 가까운 행을 쓴다 — 극단값에 안 흔들린다', () => {
    const pick = pickNutritionDonor(target('불고기'), [
      donor('돼지불고기', 138),
      donor('소불고기', 340),
      donor('꿩불고기', 370),
    ]);
    expect(pick?.donor.name).toBe('소불고기');
    expect(pick?.donorCount).toBe(3);
  });

  it('조리형태가 서로 다르면 빌리지 않는다', () => {
    expect(pickNutritionDonor(target('갈비', 'grill'), [donor('찜갈비', 400, 'steam')])).toBeNull();
  });

  it('조리형태가 한쪽만 비어 있으면 허용한다', () => {
    expect(pickNutritionDonor(target('갈비', 'grill'), [donor('돼지갈비', 400, null)])?.donor.name).toBe('돼지갈비');
  });

  it('영양이 없는 후보는 쓰지 않는다', () => {
    expect(pickNutritionDonor(target('불고기'), [donor('소불고기', null)])).toBeNull();
  });

  it('한 글자 대상은 범주어 위험이 커서 건너뛴다', () => {
    expect(pickNutritionDonor(target('국'), [donor('미역국', 100)])).toBeNull();
  });

  it('같은 이름은 자기 자신이므로 제외한다', () => {
    expect(pickNutritionDonor(target('불고기'), [donor('불고기', 300)])).toBeNull();
  });

  it('조리형태 낱말은 범주라 건너뛴다 — 찌개·볶음', () => {
    expect(pickNutritionDonor(target('찌개'), [donor('김치찌개', 200)])).toBeNull();
    expect(pickNutritionDonor(target('볶음'), [donor('제육볶음', 400)])).toBeNull();
  });

  it('재료·형태 낱말은 대표를 골라도 되므로 허용한다 — 김치 ← 배추김치', () => {
    expect(pickNutritionDonor(target('김치'), [donor('배추김치', 30)])?.donor.name).toBe('배추김치');
  });

  it('변형이 많은 실제 음식은 그대로 보강한다 — 불고기 16종', () => {
    const many = Array.from({ length: 16 }, (_, i) => donor(`재료${i}불고기`, 300));
    expect(pickNutritionDonor(target('불고기'), many)?.donorCount).toBe(16);
  });
});
