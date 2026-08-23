import type { PrismaClient } from '@prisma/client';
import {
  MealRecognitionSnapshot,
  type FoodRecognitionQualityResultType,
  type RecognizedDishType,
} from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';
import { MEAL_RECOGNITION_VERSION } from '../meal-recognition/meal-recognition.prompts.js';

// 음식명은 인식 오탐 개선에 필요하지만 개인의 식단을 추론할 수 있다.
// 응답에는 서로 다른 사용자 두 명 이상이 기여한 집계만 내보낸다. userId는 이 경계를
// 계산하는 요청 내 메모리에서만 쓰고 응답·로그에는 절대 담지 않는다.
export const MEAL_RECOGNITION_QUALITY_K = 2;
const TOP_LIMIT = 20;
const DAY_MS = 86_400_000;

// 프롬프트 버전이 다르면 동일한 조건으로 품질을 비교할 수 없으므로 invalid 로 세고
// 집계에서 제외한다. 스키마를 엄격히 해 손상된/구버전 JSON 을 조용히 건너뛸 수 있다.

interface QualityMealItem {
  name: string;
  nameNorm: string;
  foodId: string | null;
  source: string;
  sortOrder: number;
}

interface QualityMealRow {
  // 오직 distinct-user privacy 경계 계산용. 공개 결과 타입으로 전파하지 않는다.
  userId: string;
  recognitionJson: string | null;
  items: QualityMealItem[];
}

interface OriginalDish {
  displayName: string;
  foodId: string | null;
  nameNorms: Set<string>;
}

interface CountedName {
  name: string;
  count: number;
  userIds: Set<string>;
}

interface CountedCorrection {
  originalName: string;
  finalName: string;
  count: number;
  userIds: Set<string>;
}

const parseSnapshot = (raw: string | null) => {
  if (!raw) return null;
  try {
    const parsed = MealRecognitionSnapshot.safeParse(JSON.parse(raw) as unknown);
    if (
      !parsed.success ||
      parsed.data.model === null ||
      parsed.data.version !== MEAL_RECOGNITION_VERSION
    ) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
};

const toOriginal = (dish: RecognizedDishType): OriginalDish => {
  const nameNorms = new Set([normalizeTerm(dish.name)]);
  if (dish.matchedName) {
    const matchedNorm = normalizeTerm(dish.matchedName);
    if (matchedNorm) nameNorms.add(matchedNorm);
  }
  return {
    displayName: dish.name,
    foodId: dish.foodId ?? null,
    nameNorms,
  };
};

const isSameDish = (original: OriginalDish, finalItem: QualityMealItem): boolean => {
  if (original.foodId && finalItem.foodId && original.foodId === finalItem.foodId) return true;
  const finalNorm = finalItem.nameNorm || normalizeTerm(finalItem.name);
  return finalNorm.length > 0 && original.nameNorms.has(finalNorm);
};

const bumpName = (map: Map<string, CountedName>, name: string, userId: string): void => {
  const key = normalizeTerm(name);
  if (!key) return;
  const current = map.get(key);
  if (current) {
    current.count += 1;
    current.userIds.add(userId);
  } else {
    map.set(key, { name, count: 1, userIds: new Set([userId]) });
  }
};

const bumpCorrection = (
  map: Map<string, CountedCorrection>,
  originalName: string,
  finalName: string,
  userId: string,
): void => {
  const originalNorm = normalizeTerm(originalName);
  const finalNorm = normalizeTerm(finalName);
  if (!originalNorm || !finalNorm) return;
  const key = `${originalNorm}\u0000${finalNorm}`;
  const current = map.get(key);
  if (current) {
    current.count += 1;
    current.userIds.add(userId);
  } else {
    map.set(key, { originalName, finalName, count: 1, userIds: new Set([userId]) });
  }
};

const topCorrectionsWithPrivacy = (
  values: Iterable<CountedCorrection>,
): FoodRecognitionQualityResultType['topCorrections'] =>
  [...values]
    .filter((item) => item.userIds.size >= MEAL_RECOGNITION_QUALITY_K)
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.originalName.localeCompare(b.originalName, 'ko') ||
        a.finalName.localeCompare(b.finalName, 'ko'),
    )
    .slice(0, TOP_LIMIT)
    // userIds Set은 필터링 직후 명시적으로 버려 직렬화 경계에 도달하지 않게 한다.
    .map(({ originalName, finalName, count }) => ({ originalName, finalName, count }));

const topUnmatchedWithPrivacy = (
  values: Iterable<CountedName>,
): FoodRecognitionQualityResultType['topUnmatched'] =>
  [...values]
    .filter((item) => item.userIds.size >= MEAL_RECOGNITION_QUALITY_K)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
    .slice(0, TOP_LIMIT)
    .map(({ name, count }) => ({ name, count }));

/**
 * 이름/foodId 일치를 먼저 1:1로 소비한다. 남은 인식/카탈로그 출처 항목은 순서대로
 * 원본과 짝지어 교정으로 본다. 출처가 manual 이거나 짝이 없는 최종 항목은 수동 추가,
 * 짝이 없는 원본은 삭제다. 저장 모델에 항목별 출처 id 가 없어 가능한 보수적 추정이다.
 */
export const aggregateMealRecognitionQuality = (
  rows: QualityMealRow[],
  days: number,
  from: Date,
  to: Date,
): FoodRecognitionQualityResultType => {
  let invalidRecognitionCount = 0;
  let originalDishCount = 0;
  let confirmedCount = 0;
  let correctedCount = 0;
  let deletedCount = 0;
  let manuallyAddedCount = 0;
  let unmatchedFinalItemCount = 0;
  const correctionCounts = new Map<string, CountedCorrection>();
  const unmatchedCounts = new Map<string, CountedName>();

  for (const row of rows) {
    const snapshot = parseSnapshot(row.recognitionJson);
    if (!snapshot) {
      invalidRecognitionCount += 1;
      continue;
    }

    const originals = snapshot.dishes.map(toOriginal);
    const finalItems = [...row.items].sort((a, b) => a.sortOrder - b.sortOrder);
    originalDishCount += originals.length;

    for (const item of finalItems) {
      if (item.foodId === null) {
        unmatchedFinalItemCount += 1;
        bumpName(unmatchedCounts, item.name, row.userId);
      }
    }

    const unmatchedOriginalIndexes = new Set(originals.map((_, index) => index));
    const unmatchedFinalIndexes = new Set(finalItems.map((_, index) => index));

    // foodId 또는 원본 name/matchedName 정규화값이 같으면 그대로 확정.
    for (let originalIndex = 0; originalIndex < originals.length; originalIndex += 1) {
      const finalIndex = finalItems.findIndex(
        (item, index) => unmatchedFinalIndexes.has(index) && isSameDish(originals[originalIndex]!, item),
      );
      if (finalIndex < 0) continue;
      unmatchedOriginalIndexes.delete(originalIndex);
      unmatchedFinalIndexes.delete(finalIndex);
      confirmedCount += 1;
    }

    // 사진 인식에서 시작한 항목은 편집 후에도 recognized/catalog 출처를 유지한다.
    const correctionFinalIndexes = [...unmatchedFinalIndexes].filter((index) => {
      const source = finalItems[index]!.source;
      return source === 'recognized' || source === 'catalog';
    });
    const originalIndexes = [...unmatchedOriginalIndexes];
    const pairCount = Math.min(originalIndexes.length, correctionFinalIndexes.length);
    for (let index = 0; index < pairCount; index += 1) {
      const originalIndex = originalIndexes[index]!;
      const finalIndex = correctionFinalIndexes[index]!;
      const original = originals[originalIndex]!;
      const finalItem = finalItems[finalIndex]!;
      unmatchedOriginalIndexes.delete(originalIndex);
      unmatchedFinalIndexes.delete(finalIndex);
      correctedCount += 1;
      bumpCorrection(correctionCounts, original.displayName, finalItem.name, row.userId);
    }

    deletedCount += unmatchedOriginalIndexes.size;
    manuallyAddedCount += unmatchedFinalIndexes.size;
  }

  const changedOriginalCount = correctedCount + deletedCount;
  return {
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    recognitionEntryCount: rows.length,
    invalidRecognitionCount,
    originalDishCount,
    confirmedCount,
    correctedCount,
    deletedCount,
    manuallyAddedCount,
    correctionRate: originalDishCount === 0 ? 0 : changedOriginalCount / originalDishCount,
    unmatchedFinalItemCount,
    topCorrections: topCorrectionsWithPrivacy(correctionCounts.values()),
    topUnmatched: topUnmatchedWithPrivacy(unmatchedCounts.values()),
  };
};

export class FoodRecognitionQualityService {
  constructor(private readonly prisma: PrismaClient) {}

  async aggregate(days: number, now = new Date()): Promise<FoodRecognitionQualityResultType> {
    const to = new Date(now);
    const from = new Date(to.getTime() - days * DAY_MS);
    const rows = await this.prisma.mealEntry.findMany({
      where: {
        recognitionJson: { not: null },
        createdAt: { gte: from, lte: to },
      },
      // userId는 distinct-user 수를 위해 내부에서만 읽는다. 메모·사진·개별 기록 id는
      // 아예 조회하지 않고, userId도 위 최종 map에서 버려 응답/로그 경계를 넘지 않는다.
      select: {
        userId: true,
        recognitionJson: true,
        items: {
          select: {
            name: true,
            nameNorm: true,
            foodId: true,
            source: true,
            sortOrder: true,
          },
        },
      },
    });
    return aggregateMealRecognitionQuality(rows, days, from, to);
  }
}
