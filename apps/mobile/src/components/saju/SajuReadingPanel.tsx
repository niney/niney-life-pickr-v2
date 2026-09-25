import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SajuBirthInputType, SajuReadingResultType, SajuSectionIdType, SajuSectionsType, SajuThemesType } from '@repo/api-contract';
import { SAJU_DISCLAIMER, SAJU_PANEL_GROUPS, SAJU_SOURCE_LABEL, isSajuThemeTab, sajuPanelGroupOf, type SajuPanelGroup, type SajuPanelTab, type SajuReadingStatus, type SajuThemeStatus } from '@repo/shared';
import { SAJU_TEN_GOD_META, dayMasterText, zodiacTraitLine, type SajuChart, type TenGod } from '@repo/utils';
import { SajuAskBox } from './SajuAsk';
import { SajuChartTable } from './SajuChartTable';
import {
  ChartInsightCard,
  DayPillarCard,
  ElementsAdvice,
  LuckPillarStrip,
  LuckTimeline,
  MonthLuckGrid,
  SajuChartHeader,
  SectionShell,
  TwoLists,
  YearLuckFacts,
  YearOutlookTable,
} from './SajuReadingParts';
import { SajuShareSheet, type SajuShareBase } from './SajuShareSheet';
import { SajuCareerBox, SajuLoveBox, SajuWealthBox } from './SajuThemes';
import { SajuDailyBox, SajuDatePickBox, SajuFoodBox } from './SajuTools';
import { Box, Caption, ErrorBox, Muted, Pill, SegButton, TextButton, Title, TypedText } from './sajuUi';
import { SERIF, SJ, gold, ink, white } from './sajuTokens';

// 풀이 패널 — 웹 SajuReadingPanel 과 같은 탭 체계(그룹 3 × 서브).
//   원국(명식·성격·오행) / 흐름(대운·올해·오늘·택일) / 테마(인연·재물·직업·질문·음식)
// 섹션은 도착 순으로 채워지고(pending 이면 정적 본문 + "AI 가 읽는 중"), LLM 문장은 타자 효과.
// 폰 한 화면을 다 쓴다 — 머리(간지·출처) · 탭 · 본문 스크롤 · 바닥(다시 입력·공유·고지).

export interface SajuReadingPanelProps {
  chart: SajuChart;
  /** 도구(오늘·음식·택일·질문)가 쓰는 계약형 입력. */
  birth: SajuBirthInputType;
  result: SajuReadingResultType | null;
  status: SajuReadingStatus;
  themes: SajuThemesType | null;
  themeStatus: SajuThemeStatus;
  animate: boolean;
  tab: SajuPanelTab;
  onTab: (tab: SajuPanelTab) => void;
  /** 테마 탭이 열릴 때(요청이 아직이면 세션이 시작). */
  onOpenThemes: () => void;
  onRetryThemes: () => void;
  onRetry: () => void;
  onEdit: () => void;
  /** 인연 탭 "이 사람과 궁합 보기" — 폼을 궁합 모드로. */
  onPair?: () => void;
}

const godKo = (g: TenGod): string => SAJU_TEN_GOD_META[g].ko;

export const SajuReadingPanel = ({ chart, birth, result, status, themes, themeStatus, animate, tab, onTab, onOpenThemes, onRetryThemes, onRetry, onEdit, onPair }: SajuReadingPanelProps) => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const sections = result?.sections ?? null;
  // 공유 근거 — 회원은 저장된 readingId, 게스트는 입력(서버가 캐시된 풀이로 행을 만든다). 결과가 아직이면 없음.
  const shareBase: SajuShareBase | null = !result ? null : result.readingId ? { readingId: result.readingId } : { birth };
  const dm = dayMasterText(chart.dayMaster.index);
  const sectionOf = <K extends SajuSectionIdType>(id: K): SajuSectionsType[K] | null => sections?.[id] ?? null;
  const isPending = (id: SajuSectionIdType): boolean => status === 'pending' || sectionOf(id)?.status === 'pending';
  const animateFor = (id: SajuSectionIdType): boolean => animate && sectionOf(id)?.status === 'ready';
  const group = sajuPanelGroupOf(tab);
  const select = (next: SajuPanelTab) => {
    onTab(next);
    if (isSajuThemeTab(next)) onOpenThemes();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const selectGroup = (g: SajuPanelGroup) => select(SAJU_PANEL_GROUPS.find((x) => x.id === g)?.tabs[0]?.id ?? 'chart');

  const body = (): ReactNode => {
    switch (tab) {
      case 'chart':
        return (
          <View style={{ gap: 12 }}>
            <SajuChartHeader chart={chart} />
            <ChartInsightCard chart={chart} />
            <SajuChartTable chart={chart} />
          </View>
        );
      case 'personality': {
        const sec = sectionOf('personality');
        return (
          <SectionShell pending={isPending('personality')}>
            <Title>{sec?.headline ?? dm.tagline}</Title>
            <TypedText text={sec?.body ?? dm.personality} animate={animateFor('personality')} />
            <TwoLists left={{ title: '강점', items: sec?.strengths ?? dm.strengths }} right={{ title: '주의', items: sec?.cautions ?? dm.cautions }} />
            <DayPillarCard chart={chart} />
            <Muted>띠로 보면 {zodiacTraitLine(chart)}. 일간이 타고난 성격이라면 띠는 겉으로 드러나는 분위기예요. 연애·일 스타일은 테마 탭(인연·직업)에서 자세히.</Muted>
          </SectionShell>
        );
      }
      case 'elements':
        return <ElementsAdvice chart={chart} advice={sectionOf('advice')} pending={isPending('advice')} animate={animateFor('advice')} />;
      case 'cycle': {
        const sec = sectionOf('cycle');
        const cur = chart.luck.currentIndex >= 0 ? chart.luck.pillars[chart.luck.currentIndex] : null;
        return (
          <SectionShell pending={isPending('cycle')}>
            <LuckTimeline chart={chart} />
            <LuckPillarStrip chart={chart} />
            <Muted dim={0.5}>
              {chart.luck.forward ? '순행' : '역행'} · {chart.luck.startAgeYears}세 {chart.luck.startAgeMonths}개월부터 10년마다 바뀌어요. 칸의 작은 글씨는 그 시기에 들어오는 기운(십신)과 힘의 단계(십이운성).
            </Muted>
            <YearOutlookTable chart={chart} />
            <TypedText text={sec?.body ?? ''} animate={animateFor('cycle')} />
            <Box>
              <Caption>현재 {cur ? `${cur.ko} 대운 (${Math.floor(cur.fromAge)}~${Math.floor(cur.toAge)}세) · ${godKo(cur.stemTenGod)}·${godKo(cur.branchTenGod)} · ${cur.twelveStage}` : '첫 대운 전'}</Caption>
              <Muted size={12} dim={0.8}>
                {sec?.current ?? ''}
              </Muted>
            </Box>
            <Box tone="dim">
              <Caption color={ink(0.55)}>다음</Caption>
              <Muted size={12} dim={0.8}>
                {sec?.next ?? ''}
              </Muted>
            </Box>
          </SectionShell>
        );
      }
      case 'year': {
        const sec = sectionOf('year');
        return (
          <SectionShell pending={isPending('year')}>
            <Title>
              {chart.yearLuck.year}년 {chart.yearLuck.ko} <Text style={{ fontSize: 13, fontWeight: '400', color: ink(0.6) }}>{chart.yearLuck.hanja}</Text>
            </Title>
            <YearLuckFacts chart={chart} />
            <TypedText text={sec?.body ?? ''} animate={animateFor('year')} />
            {sec && sec.months.length > 0 ? (
              <View style={{ gap: 4 }}>
                {sec.months.map((m) => (
                  <View key={m.month} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ fontSize: 12, color: SJ.gold }}>{m.month}월</Text>
                    <Muted size={12} dim={0.8} style={{ flex: 1 }}>
                      {m.note}
                    </Muted>
                  </View>
                ))}
              </View>
            ) : null}
            <MonthLuckGrid chart={chart} />
          </SectionShell>
        );
      }
      case 'daily':
        return <SajuDailyBox birth={birth} chart={chart} />;
      case 'date':
        return <SajuDatePickBox birth={birth} />;
      case 'food':
        return <SajuFoodBox birth={birth} />;
      case 'ask':
        return <SajuAskBox birth={birth} chart={chart} />;
      case 'love':
        return <SajuLoveBox chart={chart} section={themes?.love ?? null} status={themeStatus} animate={animate} onRetry={onRetryThemes} onPair={onPair} />;
      case 'wealth':
        return <SajuWealthBox chart={chart} section={themes?.wealth ?? null} status={themeStatus} animate={animate} onRetry={onRetryThemes} />;
      case 'career':
        return <SajuCareerBox chart={chart} section={themes?.career ?? null} status={themeStatus} animate={animate} onRetry={onRetryThemes} />;
    }
  };

  const subTabs = SAJU_PANEL_GROUPS.find((g) => g.id === group)?.tabs ?? [];

  return (
    <View style={styles.root} accessibilityLabel="풀이">
      <View style={styles.header}>
        <Text style={styles.signature} numberOfLines={1}>
          {[chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.hour].map((p) => (p ? p.hanja : '--')).join(' ')}
        </Text>
        {result ? (
          <Pill border={result.source === 'llm' ? gold(0.6) : white(0.2)} color={result.source === 'llm' ? SJ.gold : ink(0.6)}>
            {SAJU_SOURCE_LABEL[result.source]}
          </Pill>
        ) : null}
      </View>
      <View style={styles.tabs}>
        <View style={styles.groupRow}>
          {SAJU_PANEL_GROUPS.map((g) => (
            <SegButton key={g.id} flex label={g.label} active={group === g.id} onPress={() => selectGroup(g.id)} accessibilityLabel={`${g.label} 그룹`} />
          ))}
        </View>
        <View style={styles.subRow}>
          {subTabs.map((t) => (
            <SegButton key={t.id} round tool={t.tool} label={t.label} active={tab === t.id} onPress={() => select(t.id)} accessibilityLabel={`${t.label} 탭`} />
          ))}
        </View>
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets testID="saju-reading-body">
        {body()}
        {status === 'gone' ? <ErrorBox message="AI 풀이 연결이 끊겼어요. 기본 풀이를 보여 드리고 있어요." onRetry={onRetry} /> : null}
        {status === 'failed' ? <ErrorBox message="풀이 요청이 실패했어요." onRetry={onRetry} /> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(8, insets.bottom) }]}>
        <TextButton label="다시 입력" icon="pencil-outline" onPress={onEdit} />
        {shareBase ? <TextButton label="공유" icon="share-variant-outline" color={SJ.gold} onPress={() => setShareOpen(true)} /> : null}
        <Text style={styles.disclaimer} numberOfLines={2}>
          {SAJU_DISCLAIMER}
        </Text>
      </View>
      {shareBase ? <SajuShareSheet open={shareOpen} onClose={() => setShareOpen(false)} base={shareBase} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: white(0.12) },
  signature: { flex: 1, fontFamily: SERIF, fontSize: 15, color: SJ.cream, letterSpacing: 1 },
  tabs: { gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: white(0.12) },
  groupRow: { flexDirection: 'row', gap: 6 },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  body: { padding: 16, gap: 12, paddingBottom: 28 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: white(0.12), backgroundColor: 'rgba(18,18,24,0.96)' },
  disclaimer: { flex: 1, textAlign: 'right', fontSize: 10, lineHeight: 13, color: ink(0.4) },
});
