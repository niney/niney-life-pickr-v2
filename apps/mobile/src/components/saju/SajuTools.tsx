import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import type { SajuBirthInputType, SajuDatePurposeType, SajuMatchResultType } from '@repo/api-contract';
import { SAJU_SOURCE_LABEL, useSajuDailyQuery, useSajuDatePickQuery, useSajuFoodQuery, WUXING_COLOR, WUXING_TEXT_COLOR } from '@repo/shared';
import {
  SAJU_DATE_PURPOSE_LABEL,
  SAJU_DATE_PURPOSES,
  SAJU_DAY_TAG_LABEL,
  SAJU_TEN_GOD_META,
  SAJU_WUXING_META,
  sajuBestHours,
  sajuDayNumber,
  sajuHourLucksOf,
  TAROT_MENU_CUISINE_LABEL,
  TAROT_MENU_DISH_LABEL,
  type SajuChart,
  type TarotMenuCuisine,
  type TarotMenuDishType,
} from '@repo/utils';
import { TwoLists } from './SajuReadingParts';
import { sajuBranchImage } from './sajuImages';
import { Body, Box, Caption, CheckRow, ErrorBox, Loading, Muted, Para, Pill, SegButton, Stars5, Wrap } from './sajuUi';
import { SERIF, SJ, gold, ink, white } from './sajuTokens';

// "선택" 도구 — 오늘의 운세 · 오행 음식 · 택일 + 궁합 결과 뷰(웹 SajuTools 와 같은 구성). 탭을 여는 순간 query 로
// 부른다(같은 입력은 캐시). 계산값(점수·후보·별점)은 서버가 utils 로 결정적으로 만들고 문장만 LLM/정적.

const SourceBadge = ({ source }: { source: 'llm' | 'static' }) => (
  <Pill border={source === 'llm' ? gold(0.6) : white(0.2)} color={source === 'llm' ? SJ.gold : ink(0.6)}>
    {SAJU_SOURCE_LABEL[source]}
  </Pill>
);

const Failed = ({ onRetry }: { onRetry: () => void }) => <ErrorBox message="불러오지 못했어요." onRetry={onRetry} />;

// ── 오늘의 운세 ─────────────────────────────────────────────────────────────

/** 하루 12시진 — 그날 일간으로 시간(時干)을 세워 내 사주에 대 본 점수. 좋은 시간 2·조심할 시간 1. */
const GoodHours = ({ chart, dayKey }: { chart: SajuChart; dayKey: string }) => {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return null;
  const hours = sajuHourLucksOf(chart, sajuDayNumber(y, m, d));
  const { best, worst } = sajuBestHours(hours);
  const max = Math.max(...hours.map((h) => h.score));
  return (
    <View style={{ gap: 6 }} accessibilityLabel="좋은 시간대">
      <Caption>오늘의 시간대 — 내 사주에 대 본 12시진</Caption>
      <View style={styles.hours}>
        {hours.map((h) => {
          const isBest = best.some((b) => b.branch === h.branch);
          const isWorst = worst?.branch === h.branch;
          const color = isBest ? SJ.gold : isWorst ? SJ.salmon : ink(0.35);
          return (
            <View key={h.branch} style={styles.hourCol}>
              <View style={styles.hourTrack}>
                <View style={{ width: '100%', height: `${Math.max(12, (h.score / max) * 100)}%`, borderRadius: 2, backgroundColor: color }} />
              </View>
              <Text style={{ fontFamily: SERIF, fontSize: 10, color: isBest ? SJ.gold : isWorst ? SJ.salmon : ink(0.55) }}>{h.ko.charAt(1)}</Text>
            </View>
          );
        })}
      </View>
      <Para style={{ fontSize: 11, lineHeight: 17, color: ink(0.75) }}>
        좋은 시간 <Text style={{ color: SJ.gold }}>{best.map((b) => `${b.range}(${b.ko}·${SAJU_TEN_GOD_META[b.stemTenGod].ko})`).join(' · ')}</Text>
        {worst ? (
          <Text>
            {' '}· 조심할 시간 <Text style={{ color: SJ.salmon }}>{`${worst.range}(${worst.ko})`}</Text>
          </Text>
        ) : null}
      </Para>
    </View>
  );
};

export const SajuDailyBox = ({ birth, chart }: { birth: SajuBirthInputType; chart?: SajuChart }) => {
  const q = useSajuDailyQuery({ birth });
  if (q.isPending) return <Loading text="오늘의 일진을 읽는 중…" />;
  if (q.isError || !q.data) return <Failed onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <View style={styles.col} testID="saju-daily">
      <View style={styles.between}>
        <View style={{ flex: 1 }}>
          <Caption style={{ fontSize: 11 }}>
            {d.dayKey} · {d.day.ko}({d.day.hanja})일
          </Caption>
          <Text style={styles.headline}>{d.headline}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Stars5 n={d.day.stars} size={14} />
          <SourceBadge source={d.source} />
        </View>
      </View>
      <Wrap>
        {d.day.tags.slice(0, 4).map((t) => (
          <Pill key={t}>{SAJU_DAY_TAG_LABEL[t]}</Pill>
        ))}
        <Pill>{SAJU_TEN_GOD_META[d.day.stemTenGod].ko}의 날</Pill>
      </Wrap>
      <Body>{d.body}</Body>
      <Box>
        <Muted size={12} dim={0.85}>
          {d.advice}
        </Muted>
      </Box>
      {chart ? <GoodHours chart={chart} dayKey={d.dayKey} /> : null}
      <Wrap gap={10}>
        <Muted dim={0.7}>
          기운 <Text style={{ color: WUXING_TEXT_COLOR[d.lucky.element] }}>{SAJU_WUXING_META[d.lucky.element].ko}</Text>
        </Muted>
        <Muted dim={0.7}>색 {d.lucky.colors.join('·')}</Muted>
        <Muted dim={0.7}>방향 {d.lucky.directions.join('·')}</Muted>
        <Muted dim={0.7}>숫자 {d.lucky.numbers.join('·')}</Muted>
      </Wrap>
    </View>
  );
};

// ── 오행 음식 ───────────────────────────────────────────────────────────────

export const SajuFoodBox = ({ birth }: { birth: SajuBirthInputType }) => {
  const [today, setToday] = useState(true);
  const q = useSajuFoodQuery({ birth, today });
  return (
    <View style={styles.col} testID="saju-food">
      <CheckRow label="오늘 일진 기운도 반영" checked={today} onChange={setToday} />
      {q.isPending ? <Loading text="오행에 맞는 메뉴를 고르는 중…" /> : null}
      {q.isError || (!q.isPending && !q.data) ? <Failed onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        <>
          <View style={styles.between}>
            <Muted dim={0.7} style={{ flex: 1 }}>
              {q.data.profile}
            </Muted>
            <SourceBadge source={q.data.source} />
          </View>
          {q.data.picks.map((p, i) => (
            <View key={p.menuId} style={[styles.card, i === 0 ? styles.cardTop : null]}>
              <View style={styles.inline}>
                <Caption>{i === 0 ? '추천' : '대안'}</Caption>
                <Text style={styles.headline}>{p.name}</Text>
                <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 4 }}>
                  {p.elements.map((e) => (
                    <View key={e} accessibilityLabel={SAJU_WUXING_META[e].ko} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: WUXING_COLOR[e] }} />
                  ))}
                </View>
              </View>
              <Muted size={10} dim={0.5}>
                {TAROT_MENU_CUISINE_LABEL[p.cuisine as TarotMenuCuisine]}·{TAROT_MENU_DISH_LABEL[p.dishType as TarotMenuDishType]}
                {p.kcal !== null ? ` · 약 ${p.kcal}kcal` : ''}
              </Muted>
              <Muted size={12} dim={0.8}>
                {p.reason}
              </Muted>
            </View>
          ))}
          <Muted dim={0.5}>{q.data.avoidText}</Muted>
        </>
      ) : null}
    </View>
  );
};

// ── 택일 ────────────────────────────────────────────────────────────────────

const STAR_BG: Record<number, { bg: string; fg: string }> = {
  5: { bg: SJ.gold, fg: '#1a1408' },
  4: { bg: gold(0.55), fg: '#1a1408' },
  3: { bg: white(0.1), fg: ink(0.8) },
  2: { bg: white(0.05), fg: ink(0.45) },
  1: { bg: 'rgba(0,0,0,0.3)', fg: ink(0.3) },
};
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export const SajuDatePickBox = ({ birth }: { birth: SajuBirthInputType }) => {
  const { width } = useWindowDimensions();
  const [purpose, setPurpose] = useState<SajuDatePurposeType>('general');
  const [days, setDays] = useState<30 | 60>(30);
  const q = useSajuDatePickQuery({ birth, purpose, days });
  // 패널 안쪽 폭(좌우 16) 기준 7칸.
  const cell = Math.floor((width - 32 - 6 * 4) / 7);
  return (
    <View style={styles.col} testID="saju-date-pick">
      <Wrap gap={6}>
        {SAJU_DATE_PURPOSES.map((p) => (
          <SegButton key={p} round label={SAJU_DATE_PURPOSE_LABEL[p]} active={purpose === p} onPress={() => setPurpose(p)} />
        ))}
        <SegButton round label={`${days}일`} active={false} onPress={() => setDays(days === 30 ? 60 : 30)} accessibilityLabel={`기간 ${days}일 — 눌러서 바꾸기`} />
      </Wrap>
      {q.isPending ? <Loading text="좋은 날을 고르는 중…" /> : null}
      {q.isError || (!q.isPending && !q.data) ? <Failed onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        <>
          {q.data.top.map((d, i) => (
            <View key={d.date} style={[styles.card, i === 0 ? styles.cardTop : null]}>
              <View style={styles.inline}>
                <Text style={styles.headline}>
                  {d.date.slice(5).replace('-', '/')} <Text style={{ fontSize: 12, fontWeight: '400', color: ink(0.6) }}>({WEEK[d.weekday]})</Text>
                </Text>
                <Muted dim={0.6}>{d.ko}일</Muted>
                <View style={{ marginLeft: 'auto' }}>
                  <Stars5 n={d.purposeStars} size={13} />
                </View>
              </View>
              <Muted size={12} dim={0.8}>
                {d.reason}
              </Muted>
            </View>
          ))}
          <View style={styles.calendar} accessibilityLabel="날짜별 점수">
            {WEEK.map((w) => (
              <Text key={w} style={[styles.calHead, { width: cell }]}>
                {w}
              </Text>
            ))}
            {Array.from({ length: q.data.days[0]?.weekday ?? 0 }, (_, i) => (
              <View key={`pad-${i}`} style={{ width: cell }} />
            ))}
            {q.data.days.map((d) => {
              const tone = STAR_BG[d.purposeStars] ?? STAR_BG[3];
              return (
                <View key={d.date} accessibilityLabel={`${d.date} ${d.ko} ${d.purposeScore}점`} style={[styles.calCell, { width: cell, backgroundColor: tone?.bg }]}>
                  <Text style={{ fontSize: 10, color: tone?.fg }}>{Number(d.date.slice(8))}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.between}>
            <Muted size={10} dim={0.5}>
              {q.data.from}부터 {days}일 · 진할수록 좋은 날
            </Muted>
            <SourceBadge source={q.data.source} />
          </View>
        </>
      ) : null}
    </View>
  );
};

// ── 궁합 ────────────────────────────────────────────────────────────────────

/** 점수 링 — SVG 없이 반원 두 개를 돌려 호를 그린다(테두리 두 변 = 180° 호). */
const ScoreRing = ({ score, size = 80, stroke = 6 }: { score: number; size?: number; stroke?: number }) => {
  const deg = (Math.max(0, Math.min(100, score)) / 100) * 360;
  const arc = { position: 'absolute' as const, width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: 'transparent', borderTopColor: SJ.gold, borderRightColor: SJ.gold };
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`궁합 ${score}점`}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: white(0.1) }} />
      <View style={{ position: 'absolute', left: size / 2, width: size / 2, height: size, overflow: 'hidden' }}>
        <View style={[arc, { left: -size / 2, transform: [{ rotate: `${-225 + Math.min(deg, 180)}deg` }] }]} />
      </View>
      {deg > 180 ? (
        <View style={{ position: 'absolute', left: 0, width: size / 2, height: size, overflow: 'hidden' }}>
          <View style={[arc, { left: 0, transform: [{ rotate: `${-45 + (deg - 180)}deg` }] }]} />
        </View>
      ) : null}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: SJ.cream }}>{score}</Text>
      </View>
    </View>
  );
};

/** 궁합 결과 — 점수 링·항목 막대·요약·강점·주의·조언. */
export const SajuMatchResultView = ({ m }: { m: SajuMatchResultType }) => (
  <View style={styles.col} testID="saju-match-result">
    <View style={styles.inline}>
      <ScoreRing score={m.score} />
      <View style={{ flexDirection: 'row' }} accessibilityLabel="두 사람의 띠">
        <Image source={sajuBranchImage(m.a.zodiac.index)} style={[styles.zodiac, { borderColor: gold(0.6) }]} contentFit="cover" accessibilityLabel={`${m.a.zodiac.animal}띠`} />
        <Image source={sajuBranchImage(m.b.zodiac.index)} style={[styles.zodiac, { borderColor: 'rgba(255,180,162,0.6)', marginLeft: -10 }]} contentFit="cover" accessibilityLabel={`${m.b.zodiac.animal}띠`} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.headline, { fontSize: 18 }]}>{m.gradeKo}</Text>
        <Muted size={12} dim={0.7}>
          {m.a.label} {m.a.dayMaster.ko}
          {m.a.dayMaster.hanja}·{m.a.zodiac.animal}띠 × {m.b.label} {m.b.dayMaster.ko}
          {m.b.dayMaster.hanja}·{m.b.zodiac.animal}띠
        </Muted>
        <View style={{ alignSelf: 'flex-start' }}>
          <SourceBadge source={m.source} />
        </View>
      </View>
    </View>
    <View style={{ gap: 8 }}>
      {m.breakdown.map((b) => (
        <View key={b.key} style={{ gap: 2 }}>
          <View style={styles.between}>
            <Muted dim={0.75}>{b.label}</Muted>
            <Muted dim={0.75}>
              {b.score}/{b.max}
            </Muted>
          </View>
          <View style={styles.barTrack}>
            <View style={{ height: '100%', borderRadius: 3, width: `${(b.score / b.max) * 100}%`, backgroundColor: SJ.gold }} />
          </View>
          <Muted size={10} dim={0.5}>
            {b.note}
          </Muted>
        </View>
      ))}
    </View>
    <Body>{m.summary}</Body>
    <TwoLists left={{ title: '잘 맞는 점', items: m.strengths }} right={{ title: '부딪힐 수 있는 점', items: m.cautions }} />
    <Box tone="dim">
      <Muted size={12} dim={0.85}>
        {m.advice}
      </Muted>
    </Box>
  </View>
);

const styles = StyleSheet.create({
  col: { gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headline: { fontFamily: SERIF, fontSize: 16, fontWeight: '700', color: SJ.cream, lineHeight: 22 },
  hours: { flexDirection: 'row', gap: 2 },
  hourCol: { flex: 1, alignItems: 'center', gap: 2 },
  hourTrack: { height: 28, width: '100%', justifyContent: 'flex-end', borderRadius: 2, backgroundColor: white(0.05) },
  card: { borderWidth: 1, borderColor: white(0.1), borderRadius: 12, padding: 12, gap: 4 },
  cardTop: { borderColor: gold(0.6), backgroundColor: gold(0.1) },
  calendar: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  calHead: { textAlign: 'center', fontSize: 10, color: ink(0.4) },
  calCell: { alignItems: 'center', paddingVertical: 4, borderRadius: 4 },
  zodiac: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, backgroundColor: SJ.panel },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: white(0.1) },
});
