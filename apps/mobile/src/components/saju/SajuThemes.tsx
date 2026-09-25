import { StyleSheet, Text, View } from 'react-native';
import type { SajuCareerSectionType, SajuLoveSectionType, SajuWealthSectionType } from '@repo/api-contract';
import { WUXING_TEXT_COLOR, type SajuThemeStatus } from '@repo/shared';
import { SAJU_WUXING_META, dayMasterText, sajuCareerThemeOf, sajuLoveThemeOf, sajuWealthThemeOf, type SajuChart, type SajuThemeLuckPeriod, type SajuThemeYear } from '@repo/utils';
import { PendingNote } from './SajuReadingParts';
import { Box, Caption, ErrorBox, Muted, OutlineButton, Para, Pill, Title, TypedText, Wrap } from './sajuUi';
import { SERIF, SJ, gold, ink, white, wuxingAlpha } from './sajuTokens';

// 테마 탭 — 인연 · 재물 · 직업(웹 SajuThemes 와 같은 구성). 계산값(utils sajuThemes)은 정적 카드로 즉시 그리고,
// LLM 문장(섹션)은 도착 순으로 타자 효과. 풀이 패널·기록 상세 공용.

const Tips = ({ tips }: { tips: readonly string[] }) => (
  <Box>
    <Caption>이렇게 해 보세요</Caption>
    {tips.map((t) => (
      <Muted key={t} size={12} dim={0.8}>
        · {t}
      </Muted>
    ))}
  </Box>
);

/** 대운 목록 — 테마와 맞는 10년 구간(현재·미래 최대 3). */
const Periods = ({ periods, title }: { periods: readonly SajuThemeLuckPeriod[]; title: string }) => {
  if (periods.length === 0) return null;
  return (
    <View style={{ gap: 4 }} accessibilityLabel={title}>
      <Caption>{title}</Caption>
      {periods.slice(0, 3).map((p) => (
        <View key={p.index} style={[styles.row, p.current ? styles.rowActive : null]}>
          <Para style={{ fontSize: 11, lineHeight: 17, color: ink(0.65) }}>
            <Text style={{ fontFamily: SERIF, color: SJ.cream }}>
              {p.ko} {p.fromAge}~{p.toAge}세
            </Text>
            {p.current ? <Text style={{ color: SJ.gold }}> [지금]</Text> : null}
            {'  '}
            {p.note}
          </Para>
        </View>
      ))}
    </View>
  );
};

/** 세운 목록 — 해마다 테마 관점의 근거. 올해 강조, 점수 높은 해는 금색. */
const Years = ({ years, title, minScore = 2 }: { years: readonly SajuThemeYear[]; title: string; minScore?: number }) => (
  <View style={{ gap: 4 }} accessibilityLabel={title}>
    <Caption>{title}</Caption>
    {years.map((y) => {
      const good = y.score >= minScore;
      return (
        <View key={y.year} style={[styles.row, styles.yearRow, y.isCurrent ? styles.rowActive : null]}>
          <Text style={{ fontFamily: SERIF, fontSize: 11, color: good ? SJ.gold : SJ.cream }}>
            {y.year} {y.ko}
          </Text>
          <Para style={{ flex: 1, fontSize: 11, lineHeight: 16, color: ink(0.65) }}>{y.reasons.length ? y.reasons.join(' · ') : '특별한 표식 없음'}</Para>
        </View>
      );
    })}
  </View>
);

const ThemeErrors = ({ status, onRetry }: { status: SajuThemeStatus; onRetry?: () => void }) => {
  if (status !== 'failed' && status !== 'gone') return null;
  return <ErrorBox message={status === 'gone' ? 'AI 테마 풀이 연결이 끊겼어요. 계산된 사실만 보여 드리고 있어요.' : '테마 풀이 요청이 실패했어요.'} onRetry={onRetry} />;
};

export interface SajuThemeBoxProps<S> {
  chart: SajuChart;
  section: S | null;
  status: SajuThemeStatus;
  animate: boolean;
  onRetry?: () => void;
}

// ── 인연 ────────────────────────────────────────────────────────────────────

export const SajuLoveBox = ({ chart, section, status, animate, onRetry, onPair }: SajuThemeBoxProps<SajuLoveSectionType> & { onPair?: () => void }) => {
  const t = sajuLoveThemeOf(chart);
  const dm = dayMasterText(chart.dayMaster.index);
  const pending = status === 'pending' || section?.status === 'pending';
  const typed = animate && section?.status === 'ready';
  return (
    <View style={styles.col} testID="saju-theme-love">
      {pending ? <PendingNote text="AI 가 인연의 흐름을 읽는 중이에요 — 먼저 계산된 사실을 보여 드려요." /> : null}
      <Title>{section?.headline ?? '인연의 결'}</Title>
      {section?.body ? <TypedText text={section.body} animate={typed} /> : null}
      <Box accessibilityLabel="배우자성">
        <Caption>인연의 기운 — {t.spouseGod.groupKo}</Caption>
        <Muted size={12} dim={0.8}>
          {t.spouseNote}
        </Muted>
        <Muted size={10} dim={0.45}>
          {t.spouseGod.note}
        </Muted>
      </Box>
      <Box tone="dim" accessibilityLabel="배우자 자리">
        <Caption>
          배우자 자리 — 일지 {t.palace.branchKo}({t.palace.branchHanja}) {t.palace.tenGodKo} · {t.palace.stage}
          {t.palace.isVoid ? ' · 공망' : ''}
        </Caption>
        <Muted size={12} dim={0.8}>
          {t.palace.text}
        </Muted>
      </Box>
      <Box tone="dim">
        <Caption>연애 스타일</Caption>
        <Muted size={12} dim={0.8}>
          {dm.love}
        </Muted>
        {section?.style ? (
          <TypedText text={section.style} animate={typed} size={12} dim={0.8} />
        ) : (
          <Muted size={12} dim={0.6}>
            {t.style}
          </Muted>
        )}
        {t.marks.length > 0
          ? t.marks.map((m) => (
              <Para key={m.id} style={{ fontSize: 11, lineHeight: 16, color: ink(0.7) }}>
                <Text style={{ color: SJ.gold }}>{m.ko}</Text> — {m.text}
              </Para>
            ))
          : null}
      </Box>
      {t.chanceYears.length > 0 ? <Years years={t.chanceYears} title="인연이 가까워지는 해 — 앞으로 8년 중" minScore={3} /> : <Muted>{t.chanceNote}</Muted>}
      <Periods periods={t.luckPeriods} title={`${t.spouseGod.groupKo}이 들어오는 대운`} />
      {section?.timing ? <TypedText text={section.timing} animate={typed} /> : <Muted>{t.chanceNote}</Muted>}
      {section?.tips && section.tips.length > 0 ? <Tips tips={section.tips} /> : null}
      {onPair ? <OutlineButton label="이 사람과 궁합 보기" icon="heart-outline" color={SJ.cream} onPress={onPair} style={{ alignSelf: 'flex-start', borderColor: 'rgba(184,50,42,0.55)' }} /> : null}
      <ThemeErrors status={status} onRetry={onRetry} />
    </View>
  );
};

// ── 재물 ────────────────────────────────────────────────────────────────────

export const SajuWealthBox = ({ chart, section, status, animate, onRetry }: SajuThemeBoxProps<SajuWealthSectionType>) => {
  const t = sajuWealthThemeOf(chart);
  const pending = status === 'pending' || section?.status === 'pending';
  const typed = animate && section?.status === 'ready';
  return (
    <View style={styles.col} testID="saju-theme-wealth">
      {pending ? <PendingNote text="AI 가 재물의 흐름을 읽는 중이에요 — 먼저 계산된 사실을 보여 드려요." /> : null}
      <Title>{section?.headline ?? t.style.summary}</Title>
      {section?.body ? <TypedText text={section.body} animate={typed} /> : null}
      <Box accessibilityLabel="재물 스타일">
        <View style={styles.inline}>
          <Caption>재물 스타일</Caption>
          <Text style={styles.cardTitle}>{t.style.ko}</Text>
          <View style={{ marginLeft: 'auto' }}>
            <Pill border={wuxingAlpha(t.element, 0.55)} color={WUXING_TEXT_COLOR[t.element]}>
              재성 {SAJU_WUXING_META[t.element].ko}
            </Pill>
          </View>
        </View>
        <Muted size={12} dim={0.8}>
          {t.style.detail}
        </Muted>
        <Muted dim={0.6}>
          정재 {t.counts.jeongjae} · 편재 {t.counts.pyeonjae} · 식상 {t.counts.output} · 비겁 {t.counts.self} · 인성 {t.counts.resource}
        </Muted>
      </Box>
      <Box tone="dim">
        <Caption>재를 감당하는 힘</Caption>
        <Muted size={12} dim={0.8}>
          {t.capacity.text}
        </Muted>
        {t.notes.map((n) => (
          <Muted key={n} dim={0.7}>
            · {n}
          </Muted>
        ))}
      </Box>
      {section?.style ? (
        <Box tone="dim">
          <Caption>돈을 다루는 방식</Caption>
          <TypedText text={section.style} animate={typed} size={12} dim={0.8} />
        </Box>
      ) : null}
      <Periods periods={t.luckPeriods} title="재성·식상이 들어오는 대운" />
      <Years years={t.years} title="앞으로 5년 — 재물의 기운" />
      {section?.timing ? <TypedText text={section.timing} animate={typed} /> : null}
      {section?.tips && section.tips.length > 0 ? <Tips tips={section.tips} /> : null}
      <ThemeErrors status={status} onRetry={onRetry} />
    </View>
  );
};

// ── 직업 ────────────────────────────────────────────────────────────────────

export const SajuCareerBox = ({ chart, section, status, animate, onRetry }: SajuThemeBoxProps<SajuCareerSectionType>) => {
  const t = sajuCareerThemeOf(chart);
  const pending = status === 'pending' || section?.status === 'pending';
  const typed = animate && section?.status === 'ready';
  const jobs = section?.jobs?.length ? section.jobs : t.jobs;
  return (
    <View style={styles.col} testID="saju-theme-career">
      {pending ? <PendingNote text="AI 가 일의 흐름을 읽는 중이에요 — 먼저 계산된 사실을 보여 드려요." /> : null}
      <Title>{section?.headline ?? t.aptitude.summary}</Title>
      {section?.body ? <TypedText text={section.body} animate={typed} /> : null}
      <Box accessibilityLabel="적성">
        <View style={[styles.inline, { flexWrap: 'wrap' }]}>
          <Caption>격국</Caption>
          <Text style={styles.cardTitle}>
            {t.pattern.ko} <Text style={{ fontSize: 12, fontWeight: '400', color: ink(0.5) }}>{t.pattern.hanja}</Text>
          </Text>
          <Caption style={{ marginLeft: 8 }}>적성</Caption>
          <Text style={styles.cardTitle}>{t.aptitude.ko}</Text>
        </View>
        <Muted size={12} dim={0.8}>
          {t.aptitude.detail}
        </Muted>
        <Wrap style={{ marginTop: 2 }}>
          {t.groups.map((g) => (
            <Pill key={g.group} border={g.group === t.aptitude.group ? gold(0.6) : white(0.15)} color={g.group === t.aptitude.group ? SJ.gold : ink(0.6)}>
              {g.ko} {g.count}
            </Pill>
          ))}
        </Wrap>
      </Box>
      <Box tone="dim" accessibilityLabel="어울리는 일">
        <Caption>어울리는 일</Caption>
        <Wrap>
          {jobs.map((j) => (
            <Pill key={j} border={gold(0.4)} color={SJ.cream}>
              {j}
            </Pill>
          ))}
        </Wrap>
        <Muted dim={0.6}>
          업종 색(일간 {SAJU_WUXING_META[chart.dayMaster.element].ko}): {t.industries.join(' · ')}
        </Muted>
        <Muted size={12} dim={0.8}>
          {t.workStyle}
        </Muted>
        {t.stars.map((st) => (
          <Para key={st.id} style={{ fontSize: 11, lineHeight: 16, color: ink(0.7) }}>
            <Text style={{ color: SJ.gold }}>{st.ko}</Text> — {st.hint}
          </Para>
        ))}
      </Box>
      <Periods periods={t.luckPeriods} title="관성·식상·인성이 들어오는 대운" />
      <Years years={t.years} title="앞으로 5년 — 일의 기운" />
      {section?.timing ? <TypedText text={section.timing} animate={typed} /> : null}
      {section?.tips && section.tips.length > 0 ? <Tips tips={section.tips} /> : null}
      <ThemeErrors status={status} onRetry={onRetry} />
    </View>
  );
};

const styles = StyleSheet.create({
  col: { gap: 12 },
  row: { borderWidth: 1, borderColor: white(0.1), borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  rowActive: { borderColor: gold(0.6), backgroundColor: gold(0.1) },
  yearRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontFamily: SERIF, fontSize: 14, fontWeight: '700', color: SJ.cream },
});
