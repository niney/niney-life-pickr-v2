import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SajuChartType, SajuSectionsType, SajuThemesType } from '@repo/api-contract';
import { SAJU_SOURCE_LABEL } from '@repo/shared';
import type { SajuChart } from '@repo/utils';
import { SajuChartTable } from './SajuChartTable';
import { ChartInsightCard, DayPillarCard, ElementsAdvice, LuckPillarStrip, LuckTimeline, MonthLuckGrid, SajuChartHeader, TwoLists, YearLuckFacts, YearOutlookTable } from './SajuReadingParts';
import { SajuCareerBox, SajuLoveBox, SajuWealthBox } from './SajuThemes';
import { Body, Glass, Muted, Pill } from './sajuUi';
import { SERIF, SJ, gold, ink, white } from './sajuTokens';

// 한 장짜리 풀이 보기 — 회원 기록 상세(웹 SajuReadingView 와 같은 순서). 패널과 같은 그룹 순서로:
// 원국(명식·성격·오행+조언) → 흐름(올해·대운) → 테마(인연·재물·직업 — 계산 카드는 항상, LLM 문장은 저장된 경우).

const Card = ({ title, children }: { title?: ReactNode; children: ReactNode }) => (
  <Glass style={styles.card}>
    {title ? <Text style={styles.h2}>{title}</Text> : null}
    {children}
  </Glass>
);

export const SajuReadingView = ({ chart, sections, themes, source, birthHidden }: { chart: SajuChartType; sections: SajuSectionsType; themes?: SajuThemesType | null; source: 'llm' | 'static' | 'mixed'; birthHidden?: boolean }) => {
  // 계약형 DTO 는 엔진 SajuChart 와 같은 모양(서버 toChartDto 가 그대로 보냄) — 조각들은 엔진 타입을 받는다.
  const c = chart as unknown as SajuChart;
  const themeStatus = themes ? 'ready' : 'idle';
  return (
    <View style={{ gap: 14 }} testID="saju-reading-view">
      <Card>
        <SajuChartHeader chart={c} headline={sections.personality.headline} size="lg" hideBirth={birthHidden}>
          <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <Pill border={source === 'llm' ? gold(0.6) : white(0.2)} color={source === 'llm' ? SJ.gold : ink(0.6)}>
              {SAJU_SOURCE_LABEL[source]}
            </Pill>
          </View>
        </SajuChartHeader>
        {birthHidden ? <Muted dim={0.45}>생년월일은 공유에서 숨겨졌어요.</Muted> : null}
        <ChartInsightCard chart={c} />
        <SajuChartTable chart={chart} />
      </Card>

      <Card title="성격과 기질">
        <Body>{sections.personality.body}</Body>
        <TwoLists left={{ title: '강점', items: sections.personality.strengths }} right={{ title: '주의', items: sections.personality.cautions }} />
        <DayPillarCard chart={c} />
      </Card>

      <Card
        title={
          <>
            오행과 조언 {sections.advice.keyword ? <Text style={{ color: SJ.gold }}>“{sections.advice.keyword}”</Text> : null}
          </>
        }
      >
        <ElementsAdvice chart={c} advice={{ ...sections.advice, keyword: '' }} pending={false} animate={false} />
      </Card>

      <Card
        title={
          <>
            {chart.yearLuck.year}년 {chart.yearLuck.ko} <Text style={{ fontSize: 13, fontWeight: '400', color: ink(0.6) }}>{chart.yearLuck.hanja}</Text>
          </>
        }
      >
        <YearLuckFacts chart={c} />
        <Body>{sections.year.body}</Body>
        {sections.year.months.length > 0 ? (
          <View style={{ gap: 4 }}>
            {sections.year.months.map((m) => (
              <View key={m.month} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={{ fontSize: 12, color: SJ.gold }}>{m.month}월</Text>
                <Muted size={12} dim={0.8} style={{ flex: 1 }}>
                  {m.note}
                </Muted>
              </View>
            ))}
          </View>
        ) : null}
        <MonthLuckGrid chart={c} />
      </Card>

      <Card title="인생의 큰 흐름">
        <LuckTimeline chart={c} />
        <LuckPillarStrip chart={c} />
        <Body>{sections.cycle.body}</Body>
        <Muted size={12} dim={0.8}>
          {sections.cycle.current}
        </Muted>
        <Muted size={12} dim={0.6}>
          {sections.cycle.next}
        </Muted>
        <YearOutlookTable chart={c} />
      </Card>

      <Card title="인연">
        <SajuLoveBox chart={c} section={themes?.love ?? null} status={themeStatus} animate={false} />
      </Card>
      <Card title="재물">
        <SajuWealthBox chart={c} section={themes?.wealth ?? null} status={themeStatus} animate={false} />
      </Card>
      <Card title="직업">
        <SajuCareerBox chart={c} section={themes?.career ?? null} status={themeStatus} animate={false} />
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  h2: { fontFamily: SERIF, fontSize: 16, fontWeight: '700', color: SJ.cream },
});
