import type { PrismaClient } from '@prisma/client';
import {
  FoodAllergenStatus,
  MealAllergen,
  MEAL_ALLERGEN_LABEL,
  type FoodAllergenStatusType,
  type MealAllergenType,
} from '@repo/api-contract';

// 음식명은 "우유식빵", "게맛살"처럼 실제 배합을 보장하지 않으므로 추론에 쓰지 않는다.
// 공개 레시피의 재료 문자열만 결정 규칙으로 훑고, 결과는 반드시 inferred로 표시한다.
const ALLERGEN_KEYWORDS: Record<MealAllergenType, readonly string[]> = {
  egg: ['달걀', '계란', '메추리알', '난백', '난황', '전란', '마요네즈'],
  milk: ['우유', '치즈', '버터', '분유', '유청', '카제인', '요구르트', '요거트', '생크림'],
  buckwheat: ['메밀'],
  peanut: ['땅콩'],
  soybean: ['대두', '콩', '두부', '유부', '된장', '간장', '고추장', '청국장', '미소'],
  wheat: [
    '밀가루',
    '빵가루',
    '부침가루',
    '튀김가루',
    '칼국수',
    '국수',
    '소면',
    '우동',
    '라면',
    '파스타',
    '스파게티',
    '만두피',
  ],
  pine_nut: ['잣'],
  walnut: ['호두'],
  crab: ['꽃게', '대게', '홍게', '참게', '게살'],
  shrimp: ['새우', '쉬림프'],
  squid: ['오징어'],
  mackerel: ['고등어'],
  shellfish: ['조개', '홍합', '전복', '굴', '바지락', '꼬막', '가리비', '골뱅이'],
  peach: ['복숭아'],
  tomato: ['토마토'],
  chicken: ['닭고기', '닭가슴', '닭다리', '닭안심', '치킨'],
  pork: ['돼지고기', '돈육', '삼겹살', '목살', '베이컨', '햄', '소시지'],
  beef: ['소고기', '쇠고기', '우육', '한우', '차돌박이'],
  sulfites: ['아황산', '메타중아황산', '산성아황산'],
};

const normalizeIngredient = (value: string): string =>
  value.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, '');

const parseStringArray = (raw: string | null): string[] | null => {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) return null;
    return parsed.map((item) => item.trim()).filter((item) => item.length > 0);
  } catch {
    return null;
  }
};

export interface FoodAllergenMetadata {
  allergens: MealAllergenType[];
  evidence: string[];
  status: FoodAllergenStatusType;
}

export const inferFoodAllergens = (ingredients: string[] | null): FoodAllergenMetadata => {
  const cleaned =
    ingredients
      ?.map((ingredient) => ingredient.trim())
      .filter((ingredient) => ingredient.length > 0) ?? [];
  if (cleaned.length === 0) return { allergens: [], evidence: [], status: 'unknown' };

  const evidenceByAllergen = new Map<MealAllergenType, string[]>();
  for (const ingredient of cleaned) {
    const normalized = normalizeIngredient(ingredient);
    for (const allergen of MealAllergen.options) {
      if (!ALLERGEN_KEYWORDS[allergen].some((keyword) => normalized.includes(keyword))) continue;
      const evidence = evidenceByAllergen.get(allergen) ?? [];
      // 재료표가 길어도 같은 알레르겐 근거는 대표 3개면 운영 검토에 충분하다.
      if (evidence.length < 3)
        evidence.push(`${MEAL_ALLERGEN_LABEL[allergen]}: 재료 “${ingredient}”`);
      evidenceByAllergen.set(allergen, evidence);
    }
  }

  const allergens = MealAllergen.options.filter((allergen) => evidenceByAllergen.has(allergen));
  return {
    allergens,
    evidence: allergens.flatMap((allergen) => evidenceByAllergen.get(allergen) ?? []).slice(0, 50),
    status: 'inferred',
  };
};

// 음식명 단어 — 카탈로그 메타(위 재료 규칙·검수)에는 쓰지 않는다(배합 보장 없음). 사용자가 알레르기를 밝혔을 때
// 추천 후보에서 **보수적으로 빼는** 데만 쓴다 — 잘못 빼는 쪽(우유식빵·게맛살)은 안전하지만 놓치는 쪽은 위험하다.
// 재료 정보가 있는 행이 거의 없어(2026-10-04 dev 1,266행 중 0) 재료 규칙만으로는 깐풍새우·꽃게찜이 그대로 추천됐다.
const ALLERGEN_NAME_KEYWORDS: Record<MealAllergenType, readonly string[]> = {
  ...ALLERGEN_KEYWORDS,
  egg: [...ALLERGEN_KEYWORDS.egg, '오므라이스', '에그'],
  milk: [...ALLERGEN_KEYWORDS.milk, '크림', '라떼', '아이스크림', '까르보나라'],
  buckwheat: [...ALLERGEN_KEYWORDS.buckwheat, '모밀', '냉면'],
  peanut: [...ALLERGEN_KEYWORDS.peanut, '피넛'],
  wheat: [
    ...ALLERGEN_KEYWORDS.wheat,
    '만두',
    '빵',
    '토스트',
    '피자',
    '케이크',
    '쿠키',
    '비스킷',
    '크로와상',
    '돈가스',
    '돈까스',
    '짜장면',
    '짬뽕',
    '수제비',
  ],
  crab: [...ALLERGEN_KEYWORDS.crab, '킹크랩', '크랩', '게장', '게맛살', '게찜', '게탕', '게국'],
  shrimp: [...ALLERGEN_KEYWORDS.shrimp, '대하', '감바스'],
  squid: [...ALLERGEN_KEYWORDS.squid, '한치', '꼴뚜기'],
  shellfish: [...ALLERGEN_KEYWORDS.shellfish, '재첩', '소라', '키조개', '피조개'],
  tomato: [...ALLERGEN_KEYWORDS.tomato, '케첩', '케찹'],
  chicken: [...ALLERGEN_KEYWORDS.chicken, '닭', '삼계탕', '백숙'],
  pork: [
    ...ALLERGEN_KEYWORDS.pork,
    '돼지',
    '삼겹',
    '제육',
    '족발',
    '보쌈',
    '돈가스',
    '돈까스',
    '순대',
    '탕수육',
    '동그랑땡',
    '감자탕',
  ],
  beef: [
    ...ALLERGEN_KEYWORDS.beef,
    '차돌',
    '불고기',
    '육회',
    '육개장',
    '갈비탕',
    '설렁탕',
    '곰탕',
    '스테이크',
    '소갈비',
  ],
};
// 이름에 단어가 들어 있어도 해당 알레르겐과 무관한 음식(굴비는 조기).
const ALLERGEN_NAME_EXCEPTIONS: Partial<Record<MealAllergenType, readonly string[]>> = {
  shellfish: ['굴비'],
};

/** 음식명에 보이는 알레르겐(가능성) — 추천 후보 제외 전용. 카탈로그 메타로 저장하지 않는다. */
export const allergensInFoodName = (name: string): MealAllergenType[] => {
  const normalized = normalizeIngredient(name);
  return MealAllergen.options.filter((allergen) => {
    let target = normalized;
    for (const exception of ALLERGEN_NAME_EXCEPTIONS[allergen] ?? []) {
      target = target.replaceAll(exception, '');
    }
    return ALLERGEN_NAME_KEYWORDS[allergen].some((keyword) => target.includes(keyword));
  });
};

export const verifiedFoodAllergens =(allergens: MealAllergenType[]): FoodAllergenMetadata => {
  const unique = MealAllergen.options.filter((allergen) => allergens.includes(allergen));
  return {
    allergens: unique,
    evidence:
      unique.length > 0
        ? unique.map((allergen) => `${MEAL_ALLERGEN_LABEL[allergen]}: 운영자 검증`)
        : ['운영자 검증: 공개 정보에서 표시 대상 알레르겐 없음'],
    status: 'verified',
  };
};

export const unknownFoodAllergens = (): FoodAllergenMetadata => ({
  allergens: [],
  evidence: [],
  status: 'unknown',
});

export const serializeFoodAllergenMetadata = (
  metadata: FoodAllergenMetadata,
): { allergensJson: string; allergenEvidenceJson: string; allergenStatus: string } => ({
  allergensJson: JSON.stringify(metadata.allergens),
  allergenEvidenceJson: JSON.stringify(metadata.evidence),
  allergenStatus: metadata.status,
});

export const parseFoodAllergenStatus = (value: string): FoodAllergenStatusType =>
  FoodAllergenStatus.safeParse(value).success ? (value as FoodAllergenStatusType) : 'unknown';

export interface FoodAllergenBackfillResult {
  scanned: number;
  eligible: number;
  updated: number;
  withWarnings: number;
  noneKnown: number;
  invalidIngredients: number;
  skippedVerified: number;
}

export const backfillFoodAllergens = async (
  prisma: PrismaClient,
  opts: { dryRun?: boolean; onProgress?: (processed: number, total: number) => void } = {},
): Promise<FoodAllergenBackfillResult> => {
  const total = await prisma.foodItem.count();
  const result: FoodAllergenBackfillResult = {
    scanned: 0,
    eligible: 0,
    updated: 0,
    withWarnings: 0,
    noneKnown: 0,
    invalidIngredients: 0,
    skippedVerified: 0,
  };
  let cursor: string | undefined;

  while (true) {
    const rows = await prisma.foodItem.findMany({
      take: 250,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        ingredientsJson: true,
        allergensJson: true,
        allergenEvidenceJson: true,
        allergenStatus: true,
      },
    });
    if (rows.length === 0) break;
    cursor = rows.at(-1)!.id;

    for (const row of rows) {
      result.scanned += 1;
      if (parseFoodAllergenStatus(row.allergenStatus) === 'verified') {
        result.skippedVerified += 1;
        continue;
      }
      const ingredients = parseStringArray(row.ingredientsJson);
      if (row.ingredientsJson !== null && ingredients === null) {
        result.invalidIngredients += 1;
        continue;
      }
      if (!ingredients || ingredients.length === 0) continue;
      result.eligible += 1;
      const inferred = inferFoodAllergens(ingredients);
      if (inferred.allergens.length > 0) result.withWarnings += 1;
      else result.noneKnown += 1;
      const next = serializeFoodAllergenMetadata(inferred);
      if (
        row.allergensJson === next.allergensJson &&
        row.allergenEvidenceJson === next.allergenEvidenceJson &&
        row.allergenStatus === next.allergenStatus
      ) {
        continue;
      }
      result.updated += 1;
      if (!opts.dryRun) await prisma.foodItem.update({ where: { id: row.id }, data: next });
    }
    opts.onProgress?.(result.scanned, total);
  }
  return result;
};
