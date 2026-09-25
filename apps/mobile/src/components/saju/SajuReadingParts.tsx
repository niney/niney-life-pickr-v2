import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { SajuSectionsType } from '@repo/api-contract';
import { WUXING_COLOR, WUXING_TEXT_COLOR } from '@repo/shared';
import {
  SAJU_SAMJAE_STAGE_KO,
  SAJU_TEN_GOD_META,
  SAJU_WUXING_LUCKY,
  SAJU_WUXING_META,
  dayMasterText,
  sajuBirthSummary,
  sajuDayPillarReadingOf,
  sajuFiveGodsOf,
  sajuHealthHintsOf,
  sajuMonthLucksOf,
  sajuPatternOf,
  sajuSamjaeOf,
  sajuYearOutlooksOf,
  stemMeta,
  zodiacTraitLine,
  type SajuChart,
  type TenGod,
  type Wuxing,
} from '@repo/utils';
import { SajuChartTable } from './SajuChartTable';
import { sajuBranchImage, sajuStemImage } from './sajuImages';
import { Box, Caption, DefRow, ElChip, Muted, Para, Pill, Stars5, Title, TypedText, Wrap } from './sajuUi';
import { SERIF, SJ, gold, ink, white } from './sajuTokens';

// 풀이 패널·2D 뷰(기록 상세) 공용 조각 — 웹 SajuReadingPanel 의 export 들과 같은 구성·문구.
// 웹의 SVG 대운 타임라인은 react-native-svg 없이 View 막대로 그린다(네이티브 모듈 추가 없이).

const godKo = (g: TenGod): string => SAJU_TEN_GOD_META[g].ko;

/** 원국 헤더 — 일간 캐릭터 + 띠 동물 + 출생 요약(음력·태양시 보정·계절). hideBirth: 생년월일을 숨긴 공유본. */
export const SajuChartHeader = ({ chart, headline, size = 'sm', hideBirth = false, children }: { chart: SajuChart; headline?: string; size?: 'sm' | 'lg'; hideBirth?: boolean; children?: ReactNode }) => {
  const dm = dayMasterText(chart.dayMaster.index);
  const birth = sajuBirthSummary(chart);
  const big = size === 'lg' ? 80 : 64;
  const small = size === 'lg' ? 46 : 40;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.headerRow}>
        <View style={{ width: big + 10, height: big + 4 }}>
          <Image source={sajuStemImage(chart.dayMaster.index)} style={[styles.avatar, { width: big, height: big, borderRadius: big / 2, borderWidth: size === 'lg' ? 2 : 1 }]} contentFit="cover" accessibilityLabel={`${chart.dayMaster.ko} 일간`} />
          <Image source={sajuBranchImage(chart.zodiac.index)} style={[styles.avatar, styles.zodiac, { width: small, height: small, borderRadius: small / 2 }]} contentFit="cover" accessibilityLabel={`${chart.zodiac.animal}띠`} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Caption style={{ fontSize: 11 }}>일간(나)</Caption>
          <Text style={[styles.dmTitle, size === 'lg' && { fontSize: 20 }]}>
            {dm.title} <Text style={{ fontSize: 13, color: ink(0.6) }}>{dm.hanja}</Text>
          </Text>
          <Para style={{ fontSize: 12, lineHeight: 17, color: ink(0.7) }}>
            {dm.symbol} · {zodiacTraitLine(chart)} · {headline || dm.tagline}
          </Para>
          {children}
        </View>
      </View>
      <Wrap gap={10}>
        {!hideBirth ? <Muted>양력 {birth.solar}</Muted> : null}
        {!hideBirth && birth.lunar ? <Muted>음력 {birth.lunar}</Muted> : null}
        {!hideBirth && birth.corrected ? <Muted>태양시 {birth.corrected}</Muted> : null}
        <Muted>{birth.season}</Muted>
        <Muted>만 {birth.age}세</Muted>
      </Wrap>
    </View>
  );
};

/** 대운 한 칸 — 간지·시작 나이 + 십신·십이운성. */
export const LuckPillarChip = ({ p, current }: { p: SajuChart['luck']['pillars'][number]; current: boolean }) => (
  <View style={[styles.luckChip, current ? { borderColor: SJ.gold, backgroundColor: gold(0.1) } : null]}>
    <Text style={{ fontFamily: SERIF, fontSize: 14, color: current ? SJ.cream : ink(0.65) }}>{p.hanja}</Text>
    <Text style={{ fontSize: 10, color: current ? SJ.cream : ink(0.6) }}>{Math.floor(p.fromAge)}세</Text>
    <Para style={{ marginTop: 2, fontSize: 9, lineHeight: 12, color: ink(0.5), textAlign: 'center' }}>
      {godKo(p.stemTenGod)}·{godKo(p.branchTenGod)}
      {'\n'}
      {p.twelveStage}
    </Para>
  </View>
);

/** 세운 한 줄 + 원국과의 관계 칩. */
export const YearLuckFacts = ({ chart }: { chart: SajuChart }) => {
  const y = chart.yearLuck;
  return (
    <View style={{ gap: 4 }}>
      <Muted dim={0.65}>
        천간 {godKo(y.stemTenGod)} · 지지 {godKo(y.branchTenGod)} · 십이운성 {y.twelveStage}
      </Muted>
      {y.relations.length > 0 ? (
        <Wrap>
          {y.relations.map((r, i) => (
            <Pill key={`${r.type}-${i}`}>올해 {r.label}</Pill>
          ))}
        </Wrap>
      ) : null}
    </View>
  );
};

/** 행운 요소 표 — LLM 이 준 색·방향·숫자·음식 + 정적 표의 키워드·활동·맛·계절. */
export const LuckyTable = ({ lucky }: { lucky: { element: Wuxing; colors: string[]; directions: string[]; numbers: number[]; foods: string[] } }) => {
  const extra = SAJU_WUXING_LUCKY[lucky.element];
  return (
    <Box>
      <DefRow term="기운">
        <Para style={{ fontSize: 12, lineHeight: 18, color: WUXING_TEXT_COLOR[lucky.element] }}>
          {SAJU_WUXING_META[lucky.element].ko} <Text style={{ color: ink(0.5) }}>— {extra.keywords.join(' · ')}</Text>
        </Para>
      </DefRow>
      <DefRow term="색">{lucky.colors.join(' · ')}</DefRow>
      <DefRow term="방향">{lucky.directions.join(' · ')}</DefRow>
      <DefRow term="숫자">{lucky.numbers.join(' · ')}</DefRow>
      <DefRow term="음식">{`${lucky.foods.join(' · ')} (${extra.taste})`}</DefRow>
      <DefRow term="활동">{extra.activities.join(' · ')}</DefRow>
      <DefRow term="계절">{extra.season}</DefRow>
    </Box>
  );
};

const ymd = (d: { year: number; month: number; day: number }): number => d.year * 10000 + d.month * 100 + d.day;
const todayYmd = (): number => {
  const t = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
};

/** 명식 한눈에 — 격국·오신(용신…한신)·삼재. 유파별 차이가 있어 "재미로" 톤. */
export const ChartInsightCard = ({ chart }: { chart: SajuChart }) => {
  const pat = sajuPatternOf(chart);
  const gods = sajuFiveGodsOf(chart);
  const sam = sajuSamjaeOf(chart);
  return (
    <Box style={{ gap: 10 }} accessibilityLabel="명식 한눈에">
      <View>
        <Caption>격국</Caption>
        <Text style={styles.cardTitle}>
          {pat.ko} <Text style={{ fontSize: 12, fontWeight: '400', color: ink(0.5) }}>{pat.hanja}</Text>
          <Text style={{ fontSize: 12, fontWeight: '400', color: ink(0.8) }}> — {pat.summary}</Text>
        </Text>
        <Muted size={12} dim={0.7}>
          {pat.detail}
        </Muted>
      </View>
      <View style={{ gap: 4 }}>
        <Caption>오신 — 나에게 필요한 기운과 조심할 기운</Caption>
        <Wrap>
          <ElChip label="용신" e={gods.yong} />
          <ElChip label="희신" e={gods.hee} />
          <ElChip label="기신" e={gods.gi} />
          <ElChip label="구신" e={gods.gu} />
          <ElChip label="한신" e={gods.han} />
        </Wrap>
        <Muted size={12} dim={0.6}>
          {gods.reason}
        </Muted>
      </View>
      <View>
        <Caption>삼재{sam.stage ? ` · ${SAJU_SAMJAE_STAGE_KO[sam.stage]}` : ''}</Caption>
        <Muted size={12} dim={0.7}>
          {sam.stage ? `${chart.zodiac.animal}띠의 삼재는 ${sam.branchesKo}년. ` : `${chart.zodiac.animal}띠 · `}
          {sam.note}
        </Muted>
      </View>
    </Box>
  );
};

/** 오행 건강 힌트 — 부족·과다 오행 기준 생활 습관 제안(진단 아님). */
export const HealthHints = ({ chart }: { chart: SajuChart }) => {
  const hints = sajuHealthHintsOf(chart);
  if (hints.length === 0) return <Muted dim={0.5}>오행이 고르게 있어 특별히 치우친 기운이 없어요.</Muted>;
  return (
    <View style={{ gap: 6 }} accessibilityLabel="오행 건강 힌트">
      <Caption>몸으로 보면 — 부족·넘치는 기운의 생활 힌트</Caption>
      {hints.map((h) => (
        <View key={`${h.kind}-${h.element}`} style={{ flexDirection: 'row', gap: 6 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 12, color: WUXING_TEXT_COLOR[h.element] }}>{SAJU_WUXING_META[h.element].hanja}</Text>
          <Muted size={12} dim={0.75} style={{ flex: 1 }}>
            {h.text}
          </Muted>
        </View>
      ))}
      <Muted size={10} dim={0.4}>
        재미로 보는 오행 관념이에요. 몸이 불편하면 병원이 먼저예요.
      </Muted>
    </View>
  );
};

/** 향후 5년 세운 표 — 올해 강조, 별점·십신·테마·변동/인연 표식. */
export const YearOutlookTable = ({ chart }: { chart: SajuChart }) => {
  const years = sajuYearOutlooksOf(chart);
  return (
    <View style={{ gap: 4 }} accessibilityLabel="향후 5년">
      <Caption>앞으로 5년 — 해마다 들어오는 기운</Caption>
      {years.map((y) => (
        <View key={y.year} style={[styles.yearRow, y.isCurrent ? { borderColor: gold(0.6), backgroundColor: gold(0.1) } : null]}>
          <View style={styles.yearHead}>
            <Text style={{ fontFamily: SERIF, fontSize: 12, color: SJ.cream }}>
              {y.year} {y.ko}
            </Text>
            <Stars5 n={y.stars} />
          </View>
          <Para style={{ fontSize: 11, lineHeight: 16, color: ink(0.65) }}>
            {godKo(y.stemTenGod)}·{godKo(y.branchTenGod)} · {y.theme}
            {y.flags.map((f) => (
              <Text key={f} style={{ color: f === '변동' || f === '공망' ? SJ.salmon : SJ.gold }}>
                {'  '}[{f}]
              </Text>
            ))}
          </Para>
        </View>
      ))}
    </View>
  );
};

/** 월운 12개월 — 절기 기준(입춘~다음 입춘). 이번 달 강조, 점수는 점 색으로. */
export const MonthLuckGrid = ({ chart }: { chart: SajuChart }) => {
  const months = sajuMonthLucksOf(chart);
  if (months.length === 0) return null;
  const today = todayYmd();
  const best = [...months]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m) => m.index);
  return (
    <View style={{ gap: 6 }} accessibilityLabel="월운">
      <Caption>{chart.yearLuck.year}년 월운 — 절기 기준 12개월(입춘부터)</Caption>
      <View style={styles.monthGrid}>
        {months.map((m) => {
          const current = today >= ymd(m.from) && today <= ymd(m.to);
          const tone = m.stars >= 4 ? SJ.gold : m.stars <= 2 ? SJ.salmon : ink(0.7);
          return (
            <View key={m.index} style={[styles.monthCell, current ? { borderColor: SJ.gold, backgroundColor: gold(0.1) } : null]}>
              <Text style={{ fontSize: 9, color: ink(0.5) }}>
                {m.from.month}/{m.from.day}~
              </Text>
              <Text style={{ fontFamily: SERIF, fontSize: 14, color: SJ.cream }}>{m.hanja}</Text>
              <Text style={{ fontSize: 9, color: tone }}>{'●'.repeat(m.stars)}</Text>
              <Text style={{ fontSize: 9, color: ink(0.5) }}>{godKo(m.stemTenGod)}</Text>
            </View>
          );
        })}
      </View>
      <Muted size={10} dim={0.5}>
        좋은 달{' '}
        {best
          .map((i) => months[i])
          .filter((m): m is NonNullable<typeof m> => !!m)
          .map((m) => `${m.from.month}월(${m.ko})`)
          .join(' · ')}
        . 점은 그달의 기운을 내 사주에 대 본 점수(5점 만점).
      </Muted>
    </View>
  );
};

/** 대운 타임라인 — 0~100세를 한 줄 띠로. 구간 색은 대운 천간 오행, 지금 나이에 표식. */
export const LuckTimeline = ({ chart }: { chart: SajuChart }) => {
  const { width: screenW } = useWindowDimensions();
  // 패널 좌우 여백(16·2) 안쪽 폭. 기록 상세 등 다른 곳에서도 거의 같은 폭이라 화면 폭 기준으로 둔다.
  const W = Math.max(240, screenW - 32);
  const x = (age: number) => (Math.max(0, Math.min(100, age)) / 100) * W;
  const pillars = chart.luck.pillars.filter((p) => p.fromAge < 100);
  const age = chart.asOf.age;
  const ax = x(age);
  return (
    <View style={{ gap: 4 }} accessibilityLabel={`대운 타임라인, 지금 만 ${age}세`}>
      <View style={{ width: W, height: 96 }}>
        {pillars.map((p) => {
          const x0 = x(p.fromAge);
          const x1 = x(Math.min(100, p.toAge));
          const w = Math.max(0, x1 - x0);
          const el = stemMeta(p.stem).element;
          const cur = p.index === chart.luck.currentIndex;
          return (
            <View key={p.index} style={{ position: 'absolute', left: x0, width: w, top: 0, height: 80 }}>
              {w >= 22 ? <Text style={styles.tlHanja}>{p.hanja}</Text> : <View style={{ height: 16 }} />}
              <View style={[styles.tlBand, { backgroundColor: WUXING_COLOR[el], opacity: cur ? 0.55 : 0.28 }]} />
              {w >= 40 ? (
                <Text style={styles.tlAge} numberOfLines={1}>
                  {Math.floor(p.fromAge)}세·{godKo(p.stemTenGod)}
                </Text>
              ) : null}
            </View>
          );
        })}
        {/* 강물 — 띠 가운데를 흐르는 금빛 결. */}
        <LinearGradient colors={['rgba(217,182,91,0)', 'rgba(217,182,91,0.55)', 'rgba(217,182,91,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.river, { width: W }]} pointerEvents="none" />
        <View style={[styles.nowLine, { left: ax - 1 }]} pointerEvents="none" />
        <View style={[styles.nowDot, { left: ax - 4 }]} pointerEvents="none" />
        <Text style={[styles.nowText, { left: Math.min(Math.max(0, ax - 30), W - 60) }]}>지금 {age}세</Text>
      </View>
      <Muted size={10} dim={0.45}>
        구간 색은 그 대운 천간의 오행, 밝은 구간이 지금 대운. 강물은 나이 순으로 흘러가요.
      </Muted>
    </View>
  );
};

/** 대운 칸 가로 스크롤. */
export const LuckPillarStrip = ({ chart }: { chart: SajuChart }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingBottom: 2 }} accessibilityLabel="대운">
    {chart.luck.pillars.map((p, i) => (
      <LuckPillarChip key={p.index} p={p} current={i === chart.luck.currentIndex} />
    ))}
  </ScrollView>
);

/** 60갑자 일주론 카드 — 별칭 + 성향(배우자 자리는 인연 테마로). */
export const DayPillarCard = ({ chart }: { chart: SajuChart }) => {
  const r = sajuDayPillarReadingOf(chart);
  return (
    <Box accessibilityLabel="일주로 보면">
      <Caption>
        일주로 보면 — {r.ko} {r.hanja}
      </Caption>
      <Text style={styles.cardTitle}>“{r.title}”</Text>
      <Muted size={12} dim={0.75}>
        {r.traitBody}
      </Muted>
    </Box>
  );
};

/** AI 가 읽는 중 띠. */
export const PendingNote = ({ text }: { text: string }) => (
  <View style={styles.pending}>
    <ActivityIndicator size="small" color={SJ.gold} />
    <Para style={{ flex: 1, fontSize: 11, lineHeight: 16, color: SJ.gold }}>{text}</Para>
  </View>
);

export const SectionShell = ({ pending, children }: { pending: boolean; children: ReactNode }) => (
  <View style={{ gap: 12 }}>
    {pending ? <PendingNote text="AI 가 사주를 읽는 중이에요 — 먼저 기본 풀이를 보여 드려요." /> : null}
    {children}
  </View>
);

/** 오행 서브 — 분포·건강 힌트 + 조언 본문·행운 표. */
export const ElementsAdvice = ({ chart, advice, pending, animate }: { chart: SajuChart; advice: SajuSectionsType['advice'] | null; pending: boolean; animate: boolean }) => (
  <SectionShell pending={pending}>
    <SajuChartTable chart={chart} compact />
    <Para style={{ fontSize: 12, lineHeight: 19, color: ink(0.7) }}>
      보완하면 좋은 기운은 <Text style={{ color: WUXING_TEXT_COLOR[chart.favorable.primary] }}>{SAJU_WUXING_META[chart.favorable.primary].ko}</Text>
      이에요. 막대 길이가 각 기운의 비율이에요.
    </Para>
    <HealthHints chart={chart} />
    {advice?.keyword ? <Title>“{advice.keyword}”</Title> : null}
    {advice?.body ? <TypedText text={advice.body} animate={animate} /> : null}
    {advice?.lucky ? <LuckyTable lucky={advice.lucky} /> : null}
  </SectionShell>
);

/** 강점·주의 두 칸. */
export const TwoLists = ({ left, right }: { left: { title: string; items: readonly string[] }; right: { title: string; items: readonly string[] } }) => (
  <View style={{ flexDirection: 'row', gap: 8 }}>
    <Box style={{ flex: 1 }}>
      <Caption>{left.title}</Caption>
      {left.items.map((x) => (
        <Muted key={x} size={12} dim={0.8}>
          · {x}
        </Muted>
      ))}
    </Box>
    <Box tone="salmon" style={{ flex: 1 }}>
      <Caption color={SJ.salmon}>{right.title}</Caption>
      {right.items.map((x) => (
        <Muted key={x} size={12} dim={0.8}>
          · {x}
        </Muted>
      ))}
    </Box>
  </View>
);

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { borderColor: gold(0.6), backgroundColor: SJ.panel },
  zodiac: { position: 'absolute', right: 0, bottom: 0, borderWidth: 1 },
  dmTitle: { fontFamily: SERIF, fontSize: 18, fontWeight: '700', color: SJ.cream, lineHeight: 24 },
  cardTitle: { fontFamily: SERIF, fontSize: 14, fontWeight: '700', color: SJ.cream, lineHeight: 20 },
  luckChip: { minWidth: 56, alignItems: 'center', borderWidth: 1, borderColor: white(0.1), borderRadius: 9, paddingHorizontal: 4, paddingVertical: 4 },
  yearRow: { borderWidth: 1, borderColor: white(0.1), borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, gap: 2 },
  yearHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  monthCell: { width: '23.5%', alignItems: 'center', borderWidth: 1, borderColor: white(0.1), borderRadius: 9, paddingVertical: 4 },
  tlHanja: { height: 16, textAlign: 'center', fontFamily: SERIF, fontSize: 11, color: SJ.cream },
  tlBand: { height: 44, marginTop: 2, marginHorizontal: 1, borderRadius: 6 },
  tlAge: { marginTop: 3, textAlign: 'center', fontSize: 8, color: ink(0.6) },
  river: { position: 'absolute', top: 39, height: 2 },
  nowLine: { position: 'absolute', top: 14, height: 52, width: 0, borderLeftWidth: 2, borderColor: SJ.salmon, borderStyle: 'dashed' },
  nowDot: { position: 'absolute', top: 36, width: 8, height: 8, borderRadius: 4, backgroundColor: SJ.salmon },
  nowText: { position: 'absolute', top: 82, width: 60, textAlign: 'center', fontSize: 9, color: SJ.salmon },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: gold(0.25), borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: gold(0.05) },
});

