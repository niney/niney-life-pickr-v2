export interface MealRecognitionEvalDish {
  name: string;
  confidence: number;
  foodId: string | null;
  matchedName: string | null;
}

export interface MealRecognitionEvalRecord {
  phase: 'success' | 'parse_error' | 'llm_error';
  model: string | null;
  rawIncluded: boolean;
  labelKeys: string[];
  dishes: MealRecognitionEvalDish[] | null;
}

export interface MealRecognitionModelEval {
  total: number;
  success: number;
  parseError: number;
  llmError: number;
  rawSuccess: number;
  dishes: number;
  lowConfidence: number;
  matched: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseDish = (value: unknown): MealRecognitionEvalDish | null => {
  if (!isObject(value) || typeof value.name !== 'string' || typeof value.confidence !== 'number') {
    return null;
  }
  const foodId = value.foodId;
  const matchedName = value.matchedName;
  if (foodId !== null && foodId !== undefined && typeof foodId !== 'string') return null;
  if (matchedName !== null && matchedName !== undefined && typeof matchedName !== 'string')
    return null;
  return {
    name: value.name,
    confidence: value.confidence,
    foodId: typeof foodId === 'string' ? foodId : null,
    matchedName: typeof matchedName === 'string' ? matchedName : null,
  };
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

// v2 개인정보 보호 덤프(photoTokenHashes/rawIncluded)와 구버전 덤프(photoTokens)를
// 함께 읽는다. 성공 덤프라도 rawIncluded=false면 dishes가 없는 것이 정상이다.
export const parseMealRecognitionEvalRecord = (
  value: unknown,
  fileName: string,
): MealRecognitionEvalRecord | null => {
  if (!isObject(value)) return null;
  if (value.phase !== 'success' && value.phase !== 'parse_error' && value.phase !== 'llm_error') {
    return null;
  }
  if (value.model !== null && value.model !== undefined && typeof value.model !== 'string')
    return null;

  const hashes = stringArray(value.photoTokenHashes);
  const legacyTokens = stringArray(value.photoTokens);
  const labelKeys = [
    fileName.replace(/\.json$/i, ''),
    ...hashes,
    ...hashes.map((hash) => hash.slice(0, 12)),
    ...legacyTokens,
  ].filter((item, index, all) => item.length > 0 && all.indexOf(item) === index);

  let dishes: MealRecognitionEvalDish[] | null = null;
  if (Array.isArray(value.dishes)) {
    const parsed = value.dishes.map(parseDish);
    if (parsed.every((dish): dish is MealRecognitionEvalDish => dish !== null)) dishes = parsed;
  }

  return {
    phase: value.phase,
    model: typeof value.model === 'string' ? value.model : null,
    rawIncluded: value.rawIncluded === true || dishes !== null,
    labelKeys,
    dishes,
  };
};

export const aggregateMealRecognitionEval = (
  records: MealRecognitionEvalRecord[],
): Map<string, MealRecognitionModelEval> => {
  const byModel = new Map<string, MealRecognitionModelEval>();
  for (const record of records) {
    const key = record.model ?? '(unknown)';
    const stat = byModel.get(key) ?? {
      total: 0,
      success: 0,
      parseError: 0,
      llmError: 0,
      rawSuccess: 0,
      dishes: 0,
      lowConfidence: 0,
      matched: 0,
    };
    stat.total += 1;
    if (record.phase === 'parse_error') stat.parseError += 1;
    else if (record.phase === 'llm_error') stat.llmError += 1;
    else {
      stat.success += 1;
      if (record.dishes !== null) {
        stat.rawSuccess += 1;
        stat.dishes += record.dishes.length;
        stat.lowConfidence += record.dishes.filter((dish) => dish.confidence < 0.4).length;
        stat.matched += record.dishes.filter((dish) => dish.foodId !== null).length;
      }
    }
    byModel.set(key, stat);
  }
  return byModel;
};

export const normalizeMealLabel = (value: string): string =>
  value
    .toLocaleLowerCase('ko')
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
