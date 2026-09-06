import type {
  SajuAdviceSectionType,
  SajuCycleSectionType,
  SajuLuckyType,
  SajuPersonalitySectionType,
  SajuSectionsType,
  SajuYearSectionType,
} from '@repo/api-contract';
import {
  SAJU_DATE_PURPOSE_LABEL,
  SAJU_DAY_TAG_LABEL,
  SAJU_RELATION_TEXT,
  SAJU_STAR_TEXT,
  SAJU_STRENGTH_TEXT,
  SAJU_TEN_GOD_TEXT,
  SAJU_TWELVE_STAGE_TEXT,
  SAJU_WUXING_LUCKY,
  SAJU_WUXING_META,
  dayMasterText,
  tenGodKo,
  type SajuChart,
  type SajuDailyFortune,
  type SajuDatePickResult,
  type SajuDatePurpose,
  type SajuFoodSelection,
  type SajuMatchResult,
  type TenGod,
  type Wuxing,
} from '@repo/utils';

// 정적 풀이 — LLM 이 없거나(키 미설정) 실패하거나 한도를 넘었을 때. utils 의 정적 텍스트(일간 캐릭터·
// 십신·십이운성·신살·관계·오행 행운)를 원국 사실과 조립한다. 화면은 절대 비지 않는다(docs/PLAN-saju.md).
// LLM 경로는 이 위에 문장만 덮어쓴다 — lucky·keyword 같은 구조값은 정적이 진실이다.

const ko = (e: Wuxing): string => SAJU_WUXING_META[e].ko;

export const luckyOf = (chart: SajuChart): SajuLuckyType => {
  const l = SAJU_WUXING_LUCKY[chart.favorable.primary];
  return { element: l.element, colors: [...l.colors], directions: [...l.directions], numbers: [...l.numbers], foods: [...l.foods] };
};

const topTenGods = (chart: SajuChart, n: number): TenGod[] =>
  (Object.entries(chart.tenGodCounts) as [TenGod, number][])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([g]) => g);

export const buildStaticPersonality = (chart: SajuChart): Omit<SajuPersonalitySectionType, 'status' | 'source' | 'model'> => {
  const t = dayMasterText(chart.dayMaster.index);
  const gods = topTenGods(chart, 2);
  const godText = gods.map((g) => `${tenGodKo(g)}(${SAJU_TEN_GOD_TEXT[g].short})의 기운이 있어 ${SAJU_TEN_GOD_TEXT[g].personality}`).join(' ');
  const strength = SAJU_STRENGTH_TEXT[chart.strength.level];
  const balance = chart.excess.length
    ? `오행으로는 ${chart.excess.map(ko).join('·')}이 넉넉하고`
    : '오행이 비교적 고르게 퍼져 있고';
  const lack = chart.lacking.length ? ` ${chart.lacking.map(ko).join('·')}은 비어 있어 ${chart.lacking.map((e) => SAJU_WUXING_LUCKY[e].keywords[0]).join('·')} 쪽을 의식적으로 챙기면 좋아요.` : ' 특별히 비는 기운은 없어요.';
  return {
    headline: t.tagline,
    body: `${t.title}(${t.symbol}) 일간이에요. ${t.personality} ${godText} ${strength.ko}한 사주라 ${strength.text} ${balance}${lack}`,
    strengths: [...t.strengths],
    cautions: [...t.cautions],
  };
};

export const buildStaticYear = (chart: SajuChart): Omit<SajuYearSectionType, 'status' | 'source' | 'model'> => {
  const y = chart.yearLuck;
  const sg = SAJU_TEN_GOD_TEXT[y.stemTenGod];
  const bg = SAJU_TEN_GOD_TEXT[y.branchTenGod];
  const rel = y.relations.length
    ? ` 원국과는 ${y.relations.map((r) => r.label).join(', ')}이 있어요 — ${y.relations.map((r) => SAJU_RELATION_TEXT[r.type]).join(' ')}`
    : ' 원국과 특별한 합·충은 없어 흐름이 비교적 잔잔해요.';
  const seasonMonths: Array<{ month: number; note: string }> = [];
  const fav = chart.favorable.primary;
  const favMonths: Record<Wuxing, number[]> = { wood: [3, 4], fire: [6, 7], earth: [8, 11], metal: [9, 10], water: [12, 1] };
  for (const m of favMonths[fav]) seasonMonths.push({ month: m, note: `${ko(fav)} 기운이 강해져 보완 오행이 들어오는 달이에요. 새 일을 시작하기 좋아요.` });
  return {
    body: `${y.year}년은 ${y.ko}(${y.hanja})년으로, 천간은 ${tenGodKo(y.stemTenGod)}(${sg.short}), 지지는 ${tenGodKo(y.branchTenGod)}(${bg.short})의 해예요. ${sg.personality} 지지 쪽으로는 ${bg.personality} 십이운성으로는 ${y.twelveStage} — ${SAJU_TWELVE_STAGE_TEXT[y.twelveStage]}의 시기예요.${rel}`,
    months: seasonMonths,
  };
};

export const buildStaticCycle = (chart: SajuChart): Omit<SajuCycleSectionType, 'status' | 'source' | 'model'> => {
  const l = chart.luck;
  const cur = l.currentIndex >= 0 ? l.pillars[l.currentIndex] : null;
  const next = l.pillars[l.currentIndex + 1] ?? null;
  const describe = (p: NonNullable<typeof cur>): string =>
    `${p.ko}(${p.hanja}) 대운(${Math.floor(p.fromAge)}~${Math.floor(p.toAge)}세)은 ${tenGodKo(p.stemTenGod)}·${tenGodKo(p.branchTenGod)}의 시기예요. ${SAJU_TEN_GOD_TEXT[p.stemTenGod].personality} 십이운성 ${p.twelveStage}은 ${SAJU_TWELVE_STAGE_TEXT[p.twelveStage]}이에요.`;
  return {
    body: `대운은 ${l.forward ? '순행' : '역행'}으로 ${l.startAgeYears}세 ${l.startAgeMonths}개월부터 10년마다 바뀌어요. ${l.pillars.slice(0, 5).map((p) => p.ko).join(' → ')} … 순으로 흐르고, 각 시기의 십신이 그때 어떤 기운이 강해지는지를 말해 줘요.`,
    current: cur ? describe(cur) : `아직 첫 대운(${l.pillars[0]?.ko ?? ''}) 전이라 월주 ${chart.pillars.month.ko}의 기운이 삶의 배경이 돼요. ${l.startAgeYears}세부터 첫 대운이 시작돼요.`,
    next: next ? `다음은 ${next.ko} 대운(${Math.floor(next.fromAge)}세~) — ${tenGodKo(next.stemTenGod)}의 시기예요. ${SAJU_TEN_GOD_TEXT[next.stemTenGod].short}을 미리 준비해 두면 좋아요.` : '마지막 대운까지 표시했어요.',
  };
};

export const buildStaticAdvice = (chart: SajuChart): Omit<SajuAdviceSectionType, 'status' | 'source' | 'model'> => {
  const fav = chart.favorable;
  const l = SAJU_WUXING_LUCKY[fav.primary];
  const why =
    fav.reason === 'weak'
      ? '나를 받쳐 주는 기운이 적어 배움과 도움을 채우는 쪽이 좋아요'
      : fav.reason === 'strong'
        ? '나를 받쳐 주는 기운이 많아 밖으로 풀어 쓰는 쪽이 좋아요'
        : fav.reason === 'season'
          ? '태어난 계절의 기운을 보완하는 쪽이 좋아요'
          : '가장 부족한 기운을 채우는 쪽이 좋아요';
  const stars = chart.stars.slice(0, 2).map((s) => `${s.ko}: ${SAJU_STAR_TEXT[s.id]}`).join(' ');
  return {
    body: `보완하면 좋은 기운은 ${ko(fav.primary)}${fav.secondary ? `(보조 ${ko(fav.secondary)})` : ''}이에요 — ${why}. 생활에서는 ${l.colors.slice(0, 2).join('·')} 색과 ${l.directions[0]} 방향, ${l.activities.join('·')} 같은 활동이 힘이 돼요. 음식은 ${l.taste} 나는 ${l.foods.slice(0, 3).join('·')} 쪽을 가까이해 보세요.${stars ? ` ${stars}` : ''}`,
    keyword: l.keywords[0] ?? ko(fav.primary),
    lucky: luckyOf(chart),
  };
};

export const buildStaticSections = (chart: SajuChart): SajuSectionsType => {
  const base = { status: 'static' as const, source: 'static' as const, model: null };
  return {
    personality: { ...base, ...buildStaticPersonality(chart) },
    year: { ...base, ...buildStaticYear(chart) },
    cycle: { ...base, ...buildStaticCycle(chart) },
    advice: { ...base, ...buildStaticAdvice(chart) },
  };
};

// ── 오늘의 운세 ─────────────────────────────────────────────────────────────

export const buildStaticDaily = (chart: SajuChart, fortune: SajuDailyFortune): { body: string; advice: string } => {
  const d = fortune.day;
  const g = SAJU_TEN_GOD_TEXT[d.stemTenGod];
  const tags = d.tags.slice(0, 2).map((t) => SAJU_DAY_TAG_LABEL[t]).join(', ');
  const rel = d.relations.length ? ` 원국과 ${d.relations.map((r) => r.label).join(', ')}이 있어 ${SAJU_RELATION_TEXT[d.relations[0]!.type]}` : '';
  const l = fortune.lucky;
  return {
    body: `오늘은 ${d.ko}(${d.hanja})일, ${chart.dayMaster.ko} 일간에게 ${tenGodKo(d.stemTenGod)}(${g.short})의 날이에요. ${g.personality} 십이운성은 ${d.twelveStage}(${SAJU_TWELVE_STAGE_TEXT[d.twelveStage]}).${rel}${tags ? ` 오늘의 표식: ${tags}.` : ''}`,
    advice: `${fortune.headline}. ${l.colors[0]} 색 소품이나 ${l.activities[0]}이 오늘의 기운을 도와줘요.`,
  };
};

// ── 궁합 ────────────────────────────────────────────────────────────────────

export const buildStaticMatch = (
  match: SajuMatchResult,
  labels: { a: string; b: string },
): { summary: string; strengths: string[]; cautions: string[]; advice: string } => {
  // 비율 높은 순 3개가 강점, 낮은 순 2개가 주의 — 항목이 5개뿐이라 겹칠 수 있다.
  const byRatioDesc = [...match.breakdown].sort((x, y) => y.score / y.max - x.score / x.max);
  const line = (b: (typeof byRatioDesc)[number]): string => `${b.label} — ${b.note.replace(/\.$/, '')}`;
  return {
    summary: `${labels.a}와 ${labels.b}의 궁합은 ${match.score}점, ${match.gradeKo}예요. ${match.breakdown.map((b) => `${b.label}은 ${b.note}`).join(' ')}`,
    strengths: byRatioDesc.slice(0, 3).map(line),
    cautions: [...byRatioDesc].reverse().slice(0, 2).map(line),
    advice: `${labels.b}는 ${labels.a}에게 ${tenGodKo(match.mutual.bToA)}(${SAJU_TEN_GOD_TEXT[match.mutual.bToA].short})의 존재예요. 서로의 다른 점을 역할로 나누면 오래 가요.`,
  };
};

// ── 택일·음식 ───────────────────────────────────────────────────────────────

export const buildStaticDateReasons = (result: SajuDatePickResult, purpose: SajuDatePurpose): Map<number, string> => {
  const out = new Map<number, string>();
  for (const d of result.top) {
    const tags = d.tags.filter((t) => !t.startsWith('god-') && !t.startsWith('stage-')).slice(0, 2).map((t) => SAJU_DAY_TAG_LABEL[t]);
    const parts = [`${d.ko}일 — ${tenGodKo(d.stemTenGod)}(${SAJU_TEN_GOD_TEXT[d.stemTenGod].short})`];
    if (tags.length) parts.push(tags.join('·'));
    parts.push(`${SAJU_DATE_PURPOSE_LABEL[purpose]}에 ${d.purposeStars >= 4 ? '좋은' : '무난한'} 날이에요.`);
    out.set(d.dayNumber, parts.join(', '));
  }
  return out;
};

export const buildStaticFoodReasons = (selection: SajuFoodSelection): Map<string, string> => {
  const out = new Map<string, string>();
  selection.picks.forEach((p, i) => {
    const el = p.elements[0] ?? selection.primary;
    const l = SAJU_WUXING_LUCKY[el];
    out.set(p.item.id, `${ko(el)} 기운(${l.taste})이 담긴 메뉴라 ${i === 0 ? '오늘 가장' : '대안으로'} 잘 맞아요.`);
  });
  return out;
};
