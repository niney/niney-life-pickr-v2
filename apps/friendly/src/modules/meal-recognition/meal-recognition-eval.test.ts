import { describe, expect, it } from 'vitest';
import {
  aggregateMealRecognitionEval,
  parseMealRecognitionEvalRecord,
} from './meal-recognition-eval.js';

describe('meal recognition debug evaluation', () => {
  it('v2 metadata-only 덤프는 성공률에는 포함하되 음식 품질 0건으로 오해하지 않는다', () => {
    const record = parseMealRecognitionEvalRecord(
      {
        phase: 'success',
        model: 'vision-v2',
        photoTokenHashes: ['a'.repeat(64)],
        rawIncluded: false,
      },
      'dump.json',
    );
    expect(record).toMatchObject({ rawIncluded: false, dishes: null });
    expect(record?.labelKeys).toEqual(['dump', 'a'.repeat(64), 'a'.repeat(12)]);

    const aggregate = aggregateMealRecognitionEval([record!]).get('vision-v2');
    expect(aggregate).toMatchObject({ total: 1, success: 1, rawSuccess: 0, dishes: 0 });
  });

  it('raw가 허용된 v2 덤프의 저신뢰·카탈로그 매칭을 집계한다', () => {
    const record = parseMealRecognitionEvalRecord(
      {
        phase: 'success',
        model: 'vision-v2',
        photoTokenHashes: ['b'.repeat(64)],
        rawIncluded: true,
        dishes: [
          { name: '김치찌개', confidence: 0.8, foodId: 'food-1', matchedName: '김치찌개' },
          { name: '반찬', confidence: 0.2, foodId: null, matchedName: null },
        ],
      },
      'raw.json',
    );
    const aggregate = aggregateMealRecognitionEval([record!]).get('vision-v2');
    expect(aggregate).toMatchObject({
      total: 1,
      success: 1,
      rawSuccess: 1,
      dishes: 2,
      lowConfidence: 1,
      matched: 1,
    });
  });

  it('구버전 photoTokens 라벨 키와 손상 레코드 거부를 지원한다', () => {
    expect(
      parseMealRecognitionEvalRecord(
        { phase: 'parse_error', model: null, photoTokens: ['legacy-token'] },
        'legacy.json',
      )?.labelKeys,
    ).toEqual(['legacy', 'legacy-token']);
    expect(parseMealRecognitionEvalRecord({ phase: 'wat' }, 'bad.json')).toBeNull();
  });
});
