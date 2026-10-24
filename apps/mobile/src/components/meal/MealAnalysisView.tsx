import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { MealNutritionAdvice, MealNutritionCheck, type MealNutritionPeriod } from './MealNutritionView';
import { MealStatsDetails, MealStatsOverview, type MealStatsRangeKey } from './MealStatsView';
import { useMealFabInsets } from './mealTokens';

// 분석 — 예전 '통계'·'영양' 두 탭을 한 화면의 섹션으로 합쳤다. 위에서부터 한눈에 → 주간 인사이트 →
// 영양소 점검 → 분포·자주 먹은 음식·날짜별·추천 반응 → 영양제 조언. 통계 기간(1주/1달/3달)과 영양 기간
// (7/14/28일)은 서버 계산이 달라(영양은 두 끼 이상 기록한 날만) 각자 섹션 안에서 고른다.
export const MealAnalysisView = () => {
  const { contentBottom } = useMealFabInsets();
  const [rangeKey, setRangeKey] = useState<MealStatsRangeKey>('30');
  const [nutritionDays, setNutritionDays] = useState<MealNutritionPeriod>(14);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
      showsVerticalScrollIndicator={false}
    >
      <MealStatsOverview rangeKey={rangeKey} onChangeRange={setRangeKey} />
      <MealNutritionCheck days={nutritionDays} onChangeDays={setNutritionDays} />
      <MealStatsDetails rangeKey={rangeKey} />
      <MealNutritionAdvice days={nutritionDays} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
});
