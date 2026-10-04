import type { CanonicalListItemType, RestaurantSourceSummaryType } from './schemas/restaurant.js';

// zod 없는 모듈 — FE 훅(useRestaurant)이 값으로 import 해도 스키마 파일과 zod 가 번들에 딸려 오지 않게
// schemas/restaurant.ts 에서 떼어 냈다(constants.ts 머리 주석 참조). 타입만 스키마에서 가져온다.

// SSE patch 등 클라이언트가 source 갱신 후 통합 카운트를 다시 계산할 때 호출.
// 서버 list() 가 처음 내려준 값과 동일 로직.
export const recomputeCanonicalAggregates = (
  sources: RestaurantSourceSummaryType[],
): Pick<
  CanonicalListItemType,
  | 'totalReviews'
  | 'summaryPending'
  | 'summaryRunning'
  | 'summaryDone'
  | 'summaryFailed'
  | 'avgSentimentScore'
  | 'avgSatisfactionScore'
  | 'positiveCount'
  | 'negativeCount'
  | 'neutralCount'
  | 'mixedCount'
> => {
  let totalReviews = 0;
  let summaryPending = 0;
  let summaryRunning = 0;
  let summaryDone = 0;
  let summaryFailed = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let mixedCount = 0;
  // 가중평균: source 의 (avg, done 수) 곱을 합산 / 전체 done 수.
  let sentSum = 0;
  let sentN = 0;
  let satSum = 0;
  let satN = 0;
  for (const s of sources) {
    totalReviews += s.totalReviews;
    summaryPending += s.summaryPending;
    summaryRunning += s.summaryRunning;
    summaryDone += s.summaryDone;
    summaryFailed += s.summaryFailed;
    positiveCount += s.positiveCount;
    negativeCount += s.negativeCount;
    neutralCount += s.neutralCount;
    mixedCount += s.mixedCount;
    if (s.avgSentimentScore !== null && s.summaryDone > 0) {
      sentSum += s.avgSentimentScore * s.summaryDone;
      sentN += s.summaryDone;
    }
    if (s.avgSatisfactionScore !== null && s.summaryDone > 0) {
      satSum += s.avgSatisfactionScore * s.summaryDone;
      satN += s.summaryDone;
    }
  }
  return {
    totalReviews,
    summaryPending,
    summaryRunning,
    summaryDone,
    summaryFailed,
    avgSentimentScore: sentN > 0 ? sentSum / sentN : null,
    avgSatisfactionScore: satN > 0 ? satSum / satN : null,
    positiveCount,
    negativeCount,
    neutralCount,
    mixedCount,
  };
};
