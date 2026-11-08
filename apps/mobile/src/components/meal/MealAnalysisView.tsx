import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { MealNutritionAdvice, MealNutritionCheck, type MealNutritionPeriod } from './MealNutritionView';
import { MealStatsDetails, MealStatsOverview, type MealStatsRangeKey } from './MealStatsView';
import { useMealFabInsets } from './mealTokens';

export type MealAnalysisFocus = 'nutrition';

// 분석 — 예전 '통계'·'영양' 두 탭을 한 화면의 섹션으로 합쳤다. 위에서부터 한눈에 → 주간 인사이트 →
// 영양소 점검 → 분포·자주 먹은 음식·날짜별·추천 반응 → 영양제 조언. 통계 기간(1주/1달/3달)과 영양 기간
// (7/14/28일)은 서버 계산이 달라(영양은 두 끼 이상 기록한 날만) 각자 섹션 안에서 고른다.
//
// focus='nutrition' — 추천 카드의 '영양 보기'나 옛 ?tab=nutrition 으로 들어오면 영양소 점검을 화면 위에 둔다.
// 위 섹션(한눈에)이 데이터를 받아 늘어나면 영양소 점검 자리도 내려가므로, 사용자가 직접 끌기 전까지는 자리가
// 바뀔 때마다 다시 맞춘다. 탭을 오갈 때마다 이 화면은 새로 그려지므로 focus 는 처음 그릴 때만 본다.
export const MealAnalysisView = ({ focus = null }: { focus?: MealAnalysisFocus | null }) => {
  const { contentBottom } = useMealFabInsets();
  const [rangeKey, setRangeKey] = useState<MealStatsRangeKey>('30');
  const [nutritionDays, setNutritionDays] = useState<MealNutritionPeriod>(14);
  const scrollRef = useRef<ScrollView>(null);
  const followNutrition = useRef(focus === 'nutrition');

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={() => {
        followNutrition.current = false;
      }}
    >
      <MealStatsOverview rangeKey={rangeKey} onChangeRange={setRangeKey} />
      <View
        onLayout={(e) => {
          if (!followNutrition.current) return;
          // 위 여백은 섹션 사이 간격(gap 12)만큼 남긴다.
          scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 12), animated: false });
        }}
      >
        <MealNutritionCheck days={nutritionDays} onChangeDays={setNutritionDays} />
      </View>
      <MealStatsDetails rangeKey={rangeKey} />
      <MealNutritionAdvice days={nutritionDays} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
});
