import type { PrismaClient } from '@prisma/client';
import {
  MealRecognitionSnapshot,
  type FoodRecognitionQualityQueryType,
  type FoodRecognitionQualityResultType,
  type RecognizedDishType,
} from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';

// 음식명은 인식 오탐 개선에 필요하지만 개인의 식단을 추론할 수 있다.
// 응답에는 서로 다른 사용자 두 명 이상이 기여한 텍스트 집계만 내보낸다. userId는 이 경계를
// 계산하는 요청 내 메모리에서만 쓰고 응답·로그에는 절대 담지 않는다.
export const MEAL_RECOGNITION_QUALITY_K = 2;
const TOP_LIMIT = 20;
const DAY_MS = 86_400_000;

type ConfidenceBucket = NonNullable<FoodRecognitionQualityQueryType['confidenceBucket']>;
type Outcome = 'confirmed' | 'corrected' | 'deleted';

interface QualityMealItem {
  name: string;
  nameNorm: string;
  foodId: string | null;
  recognitionDishId: string | null;
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
  recognitionDishId: string | null;
  displayName: string;
  foodId: string | null;
  confidence: number;
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

interface DishOutcome {
  model: string | null;
  version: number | null;
  bucket: ConfidenceBucket;
  outcome: Outcome;
}

interface OutcomeSummary {
  originalDishCount: number;
  confirmedCount: number;
  correctedCount: number;
  deletedCount: number;
  correctionRate: number;
}

interface ModelVersionSummary extends OutcomeSummary {
  model: string | null;
  version: number | null;
  recognitionEntryCount: number;
}

const parseSnapshot = (raw: string | null) => {
  if (!raw) return null;
  try {
    const parsed = MealRecognitionSnapshot.safeParse(JSON.parse(raw) as unknown);
    // 과거의 정상 프롬프트 버전도 추이 비교에 필요한 유효 데이터다. 현재 버전과 다르다는
    // 이유만으로 invalid 처리하지 않고, 실제 JSON/계약 손상만 제외한다.
    return parsed.success ? parsed.data : null;
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
    recognitionDishId: dish.recognitionDishId ?? null,
    displayName: dish.name,
    foodId: dish.foodId ?? null,
    confidence: dish.confidence,
    nameNorms,
  };
};

const isSameDish = (original: OriginalDish, finalItem: QualityMealItem): boolean => {
  if (original.foodId && finalItem.foodId && original.foodId === finalItem.foodId) return true;
  const finalNorm = finalItem.nameNorm || normalizeTerm(finalItem.name);
  return finalNorm.length > 0 && original.nameNorms.has(finalNorm);
};

const toConfidenceBucket = (confidence: number): ConfidenceBucket => {
  if (confidence < 0.4) return 'low';
  if (confidence < 0.75) return 'medium';
  return 'high';
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

const summarizeOutcomes = (outcomes: DishOutcome[]): OutcomeSummary => {
  const confirmedCount = outcomes.filter((item) => item.outcome === 'confirmed').length;
  const correctedCount = outcomes.filter((item) => item.outcome === 'corrected').length;
  const deletedCount = outcomes.filter((item) => item.outcome === 'deleted').length;
  const originalDishCount = outcomes.length;
  return {
    originalDishCount,
    confirmedCount,
    correctedCount,
    deletedCount,
    correctionRate:
      originalDishCount === 0 ? 0 : (correctedCount + deletedCount) / originalDishCount,
  };
};

const modelVersionKey = (model: string | null, version: number | null): string =>
  JSON.stringify([model, version]);

/**
 * recognitionDishId가 있으면 최우선으로 원본과 최종 항목을 연결한다. 이름·foodId가 바뀌고
 * 정렬 순서까지 달라져도 올바른 교정 쌍을 얻는다. 구버전 데이터에 id가 없을 때만
 * foodId/정규화 이름 → 인식 출처 순서의 보수적 폴백을 사용한다.
 */
export const aggregateMealRecognitionQuality = (
  rows: QualityMealRow[],
  days: number,
  from: Date,
  to: Date,
  filters: Pick<FoodRecognitionQualityQueryType, 'model' | 'version' | 'confidenceBucket'> = {},
): FoodRecognitionQualityResultType => {
  let recognitionEntryCount = 0;
  let invalidRecognitionCount = 0;
  let manuallyAddedCount = 0;
  let unmatchedFinalItemCount = 0;
  const correctionCounts = new Map<string, CountedCorrection>();
  const unmatchedCounts = new Map<string, CountedName>();
  const outcomes: DishOutcome[] = [];
  const modelEntryCounts = new Map<string, ModelVersionSummary>();
  const hasSnapshotFilter =
    filters.model !== undefined ||
    filters.version !== undefined ||
    filters.confidenceBucket !== undefined;

  for (const row of rows) {
    const snapshot = parseSnapshot(row.recognitionJson);
    if (!snapshot) {
      // 손상된 JSON은 model/version/confidence를 판별할 수 없다. 필터가 없을 때만 전체 표본과
      // invalid에 포함해, 필터 결과에 정체불명의 행이 섞이지 않게 한다.
      if (!hasSnapshotFilter) {
        recognitionEntryCount += 1;
        invalidRecognitionCount += 1;
      }
      continue;
    }
    if (filters.model !== undefined && snapshot.model !== filters.model) continue;
    if (filters.version !== undefined && snapshot.version !== filters.version) continue;

    const allOriginals = snapshot.dishes.map(toOriginal);
    const originals = allOriginals.filter(
      (original) =>
        filters.confidenceBucket === undefined ||
        toConfidenceBucket(original.confidence) === filters.confidenceBucket,
    );
    if (filters.confidenceBucket !== undefined && originals.length === 0) continue;

    recognitionEntryCount += 1;
    const key = modelVersionKey(snapshot.model, snapshot.version);
    const existingModel = modelEntryCounts.get(key);
    if (existingModel) {
      existingModel.recognitionEntryCount += 1;
    } else {
      modelEntryCounts.set(key, {
        model: snapshot.model,
        version: snapshot.version,
        recognitionEntryCount: 1,
        originalDishCount: 0,
        confirmedCount: 0,
        correctedCount: 0,
        deletedCount: 0,
        correctionRate: 0,
      });
    }

    const finalItems = [...row.items].sort((a, b) => a.sortOrder - b.sortOrder);

    const unmatchedOriginalIndexes = new Set(originals.map((_, index) => index));
    const unmatchedFinalIndexes = new Set(finalItems.map((_, index) => index));

    // confidence 필터에서 제외된 원본의 lineage 항목은 수동 추가로 잘못 세지 않는다.
    const selectedIds = new Set(
      originals.flatMap((item) => (item.recognitionDishId ? [item.recognitionDishId] : [])),
    );
    const allIds = new Set(
      allOriginals.flatMap((item) => (item.recognitionDishId ? [item.recognitionDishId] : [])),
    );
    // confidence 필터를 쓸 때는 선택한 원본 lineage에 연결된 최종 항목만 unmatched에
    // 포함한다. lineage 없는 수동 추가/다른 confidence 항목은 해당 bucket으로 귀속할
    // 근거가 없으므로 섞지 않는다.
    for (const item of finalItems) {
      if (
        item.foodId === null &&
        (filters.confidenceBucket === undefined ||
          (item.recognitionDishId !== null && selectedIds.has(item.recognitionDishId)))
      ) {
        unmatchedFinalItemCount += 1;
        bumpName(unmatchedCounts, item.name, row.userId);
      }
    }
    for (let finalIndex = 0; finalIndex < finalItems.length; finalIndex += 1) {
      const id = finalItems[finalIndex]!.recognitionDishId;
      if (id && allIds.has(id) && !selectedIds.has(id)) unmatchedFinalIndexes.delete(finalIndex);
    }

    const recordOutcome = (original: OriginalDish, outcome: Outcome): void => {
      outcomes.push({
        model: snapshot.model,
        version: snapshot.version,
        bucket: toConfidenceBucket(original.confidence),
        outcome,
      });
    };

    // 1) 신규 데이터: stable lineage id를 최우선으로 1:1 소비.
    for (let originalIndex = 0; originalIndex < originals.length; originalIndex += 1) {
      const original = originals[originalIndex]!;
      if (!original.recognitionDishId) continue;
      const finalIndex = finalItems.findIndex(
        (item, index) =>
          unmatchedFinalIndexes.has(index) && item.recognitionDishId === original.recognitionDishId,
      );
      if (finalIndex < 0) continue;
      const finalItem = finalItems[finalIndex]!;
      unmatchedOriginalIndexes.delete(originalIndex);
      unmatchedFinalIndexes.delete(finalIndex);
      if (isSameDish(original, finalItem)) {
        recordOutcome(original, 'confirmed');
      } else {
        recordOutcome(original, 'corrected');
        bumpCorrection(correctionCounts, original.displayName, finalItem.name, row.userId);
      }
    }

    // 2) 레거시 폴백: foodId 또는 원본 name/matchedName 정규화값이 같으면 그대로 확정.
    for (let originalIndex = 0; originalIndex < originals.length; originalIndex += 1) {
      if (!unmatchedOriginalIndexes.has(originalIndex)) continue;
      const original = originals[originalIndex]!;
      const finalIndex = finalItems.findIndex(
        (item, index) => unmatchedFinalIndexes.has(index) && isSameDish(original, item),
      );
      if (finalIndex < 0) continue;
      unmatchedOriginalIndexes.delete(originalIndex);
      unmatchedFinalIndexes.delete(finalIndex);
      recordOutcome(original, 'confirmed');
    }

    // 3) lineage가 없는 남은 인식/카탈로그 항목만 순서 폴백으로 교정 쌍을 추정.
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
      recordOutcome(original, 'corrected');
      bumpCorrection(correctionCounts, original.displayName, finalItem.name, row.userId);
    }

    for (const originalIndex of unmatchedOriginalIndexes) {
      recordOutcome(originals[originalIndex]!, 'deleted');
    }
    manuallyAddedCount += unmatchedFinalIndexes.size;
  }

  const total = summarizeOutcomes(outcomes);
  for (const item of modelEntryCounts.values()) {
    const summary = summarizeOutcomes(
      outcomes.filter(
        (outcome) => outcome.model === item.model && outcome.version === item.version,
      ),
    );
    Object.assign(item, summary);
  }

  const bucketOrder: ConfidenceBucket[] = ['low', 'medium', 'high'];
  return {
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    recognitionEntryCount,
    invalidRecognitionCount,
    ...total,
    manuallyAddedCount,
    unmatchedFinalItemCount,
    topCorrections: topCorrectionsWithPrivacy(correctionCounts.values()),
    topUnmatched: topUnmatchedWithPrivacy(unmatchedCounts.values()),
    byModelVersion: [...modelEntryCounts.values()].sort(
      (a, b) =>
        (b.version ?? -1) - (a.version ?? -1) || (a.model ?? '').localeCompare(b.model ?? '', 'ko'),
    ),
    byConfidence: bucketOrder.map((bucket) => ({
      bucket,
      ...summarizeOutcomes(outcomes.filter((outcome) => outcome.bucket === bucket)),
    })),
  };
};

export class FoodRecognitionQualityService {
  constructor(private readonly prisma: PrismaClient) {}

  async aggregate(
    query: FoodRecognitionQualityQueryType,
    now = new Date(),
  ): Promise<FoodRecognitionQualityResultType> {
    const to = new Date(now);
    const from = new Date(to.getTime() - query.days * DAY_MS);
    const rows = await this.prisma.mealEntry.findMany({
      where: {
        recognitionJson: { not: null },
        createdAt: { gte: from, lte: to },
      },
      // userId는 distinct-user 수를 위해 내부에서만 읽는다. 메모·사진·개별 기록 id는
      // 아예 조회하지 않고, userId도 최종 map에서 버려 응답/로그 경계를 넘지 않는다.
      select: {
        userId: true,
        recognitionJson: true,
        items: {
          select: {
            name: true,
            nameNorm: true,
            foodId: true,
            recognitionDishId: true,
            source: true,
            sortOrder: true,
          },
        },
      },
    });
    return aggregateMealRecognitionQuality(rows, query.days, from, to, {
      model: query.model,
      version: query.version,
      confidenceBucket: query.confidenceBucket,
    });
  }
}
