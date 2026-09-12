// 사주 테마 3종(8차, 순수 계산) — 인연(연애·결혼) · 재물 · 직업. 전부 SajuChart 만으로 계산하므로 웹(테마 탭 정적
// 카드)·서버(LLM 사실 블록)가 같은 함수를 쓴다. 전통 명리의 배우자성(남=재성·여=관성)은 성별 이분법이라 문장에
// "전통 해석으로는" 을 붙이고, 결혼 여부·시기는 단정하지 않고 "인연이 가까워지는 해" 로만 말한다(docs/PLAN-saju.md 8차).

import {
  branchMeta,
  elementOfTenGodGroup,
  SAJU_PILLAR_LABEL,
  SAJU_STAR_META,
  SAJU_TEN_GOD_META,
  SAJU_TEN_GODS,
  SAJU_WUXING_META,
  yearLuckOf,
  type PillarKey,
  type SajuChart,
  type SajuLuckPillar,
  type SajuRelation,
  type StarId,
  type TenGod,
  type TenGodGroup,
  type TwelveStage,
  type Wuxing,
} from './saju.js';
import { sajuPatternOf, type SajuPattern } from './sajuInsights.js';
import { dayMasterText, SAJU_STRENGTH_TEXT, SAJU_TEN_GOD_TEXT, SAJU_TWELVE_STAGE_TEXT, tenGodKo } from './sajuText.js';

export type SajuThemeId = 'love' | 'wealth' | 'career';
export const SAJU_THEME_IDS: readonly SajuThemeId[] = ['love', 'wealth', 'career'];
export const SAJU_THEME_LABEL: Record<SajuThemeId, string> = { love: '인연', wealth: '재물', career: '직업' };

// ── 공통 ─────────────────────────────────────────────────────

export interface SajuGodPosition {
  pillar: PillarKey;
  where: 'stem' | 'branch';
  tenGod: TenGod;
  /** '월간 정재' 처럼 사람이 읽는 위치. */
  ko: string;
}

const PILLAR_MEANING: Record<PillarKey, string> = { year: '초년·집안·사회', month: '청년·부모·직장', day: '나·배우자 자리', hour: '말년·자녀·아랫사람' };
const WHERE_KO: Record<'stem' | 'branch', Record<PillarKey, string>> = {
  stem: { year: '년간', month: '월간', day: '일간', hour: '시간' },
  branch: { year: '년지', month: '월지', day: '일지', hour: '시지' },
};

/** 특정 십신들이 원국 어디에 있는지(천간 + 지지 정기). */
export const sajuGodPositions = (chart: SajuChart, gods: readonly TenGod[]): SajuGodPosition[] => {
  const out: SajuGodPosition[] = [];
  const p = chart.pillars;
  for (const x of [p.year, p.month, p.day, ...(p.hour ? [p.hour] : [])]) {
    if (x.stemTenGod && gods.includes(x.stemTenGod)) out.push({ pillar: x.key, where: 'stem', tenGod: x.stemTenGod, ko: `${WHERE_KO.stem[x.key]} ${tenGodKo(x.stemTenGod)}` });
    if (gods.includes(x.branchTenGod)) out.push({ pillar: x.key, where: 'branch', tenGod: x.branchTenGod, ko: `${WHERE_KO.branch[x.key]} ${tenGodKo(x.branchTenGod)}` });
  }
  return out;
};

const godsOfGroup = (group: TenGodGroup): TenGod[] => SAJU_TEN_GODS.filter((g) => SAJU_TEN_GOD_META[g].group === group);
const groupCount = (chart: SajuChart, group: TenGodGroup): number => godsOfGroup(group).reduce((s, g) => s + (chart.tenGodCounts[g] ?? 0), 0);
const groupKo = (group: TenGodGroup): string => SAJU_TEN_GOD_META[godsOfGroup(group)[0] as TenGod].groupKo;
const positionsKo = (positions: readonly SajuGodPosition[]): string => positions.map((x) => `${x.ko}(${PILLAR_MEANING[x.pillar]})`).join(', ');
const wuxingKo = (e: Wuxing): string => SAJU_WUXING_META[e].ko;

export interface SajuThemeLuckPeriod {
  index: number;
  ko: string;
  hanja: string;
  fromAge: number;
  toAge: number;
  current: boolean;
  /** 천간·지지 십신 중 테마와 맞는 쪽. */
  gods: TenGod[];
  note: string;
}

const luckPeriodsOfGroups = (chart: SajuChart, groups: readonly TenGodGroup[], noteOf: (gods: TenGod[]) => string): SajuThemeLuckPeriod[] => {
  const want = new Set(groups.flatMap(godsOfGroup));
  const out: SajuThemeLuckPeriod[] = [];
  for (const lp of chart.luck.pillars) {
    if (lp.fromAge > 100) continue;
    const gods = [lp.stemTenGod, lp.branchTenGod].filter((g) => want.has(g));
    if (gods.length === 0) continue;
    out.push({ index: lp.index, ko: lp.ko, hanja: lp.hanja, fromAge: Math.floor(lp.fromAge), toAge: Math.floor(lp.toAge), current: lp.index === chart.luck.currentIndex, gods, note: noteOf(gods) });
  }
  return out;
};

export interface SajuThemeYear {
  year: number;
  ko: string;
  hanja: string;
  stemTenGod: TenGod;
  branchTenGod: TenGod;
  isCurrent: boolean;
  /** 테마 관점의 근거(사람이 읽는 짧은 구). */
  reasons: string[];
  score: number;
}

const yearsOf = (chart: SajuChart, count: number): Array<ReturnType<typeof yearLuckOf>> => {
  const out: Array<ReturnType<typeof yearLuckOf>> = [];
  for (let y = chart.asOf.year; y < chart.asOf.year + count; y++) out.push(yearLuckOf(chart.pillars, chart.dayMaster.index, y));
  return out;
};
const relationsWithDay = (relations: readonly SajuRelation[]): SajuRelation[] => relations.filter((r) => r.pillars.includes('day'));
const isCombine = (r: SajuRelation): boolean => r.type === 'six-combine' || r.type === 'three-combine' || r.type === 'half-combine' || r.type === 'stem-combine';
const isClashLike = (r: SajuRelation): boolean => r.type === 'clash' || r.type === 'punish' || r.type === 'self-punish' || r.type === 'harm' || r.type === 'wonjin';

// 삼합 기준 도화 지지 — [인오술→묘, 신자진→유, 사유축→오, 해묘미→자] (saju.ts 의 DOHWA 와 같은 값).
const DOHWA_OF_GROUP: readonly number[] = [3, 9, 6, 0];
const THREE_COMBINE_GROUPS: ReadonlyArray<readonly number[]> = [[2, 6, 10], [8, 0, 4], [5, 9, 1], [11, 3, 7]];
const dohwaBranchOf = (branch: number): number | null => {
  const gi = THREE_COMBINE_GROUPS.findIndex((g) => g.includes(branch));
  return gi < 0 ? null : (DOHWA_OF_GROUP[gi] as number);
};

// ── 인연(연애·결혼) ──────────────────────────────────────────

export interface SajuLoveTheme {
  /** 전통 배우자성 — 남: 정재(주)·편재(부) / 여: 정관(주)·편관(부). */
  spouseGod: { main: TenGod; sub: TenGod; group: TenGodGroup; groupKo: string; note: string };
  spouseCount: number;
  spousePositions: SajuGodPosition[];
  /** 배우자성 개수로 본 한 줄(없음·하나·여럿). */
  spouseNote: string;
  /** 배우자궁(일지). */
  palace: {
    branchKo: string;
    branchHanja: string;
    tenGod: TenGod;
    tenGodKo: string;
    stage: TwelveStage;
    isVoid: boolean;
    relations: SajuRelation[];
    text: string;
  };
  /** 연애 표식 — 도화·홍염(있으면), 원진(관계). */
  marks: Array<{ id: StarId | 'wonjin'; ko: string; text: string }>;
  /** 연애 스타일 — 일간 정적 문장 + 배우자성 기운 한 줄. */
  style: string;
  /** 인연이 가까워지는 해 — 향후 8년 중 상위 3(점수 ≥ 3 만). */
  chanceYears: SajuThemeYear[];
  chanceNote: string;
  /** 배우자성이 들어오는 대운(현재·미래). */
  luckPeriods: SajuThemeLuckPeriod[];
}

const SPOUSE_MARK_TEXT: Partial<Record<StarId, string>> = {
  dohwa: '사람을 끄는 매력이 있어 연애의 기회가 잦아요. 인기가 관계의 깊이를 대신하지 않게만 하세요.',
  hongyeom: '정이 많고 표현이 따뜻해 마음이 잘 통해요. 감정에 앞서 상대의 사정도 봐 주세요.',
};

export const sajuLoveThemeOf = (chart: SajuChart): SajuLoveTheme => {
  const female = chart.input.gender === 'F';
  const group: TenGodGroup = female ? 'power' : 'wealth';
  const main: TenGod = female ? 'jeonggwan' : 'jeongjae';
  const sub: TenGod = female ? 'pyeongwan' : 'pyeonjae';
  const spouseGods = [main, sub];
  const spousePositions = sajuGodPositions(chart, spouseGods);
  const spouseCount = (chart.tenGodCounts[main] ?? 0) + (chart.tenGodCounts[sub] ?? 0);
  const spouseGodNote = `전통 해석으로는 ${female ? '여성에게 관성(정관·편관)' : '남성에게 재성(정재·편재)'}이 배우자·연인의 기운이에요.`;
  const spouseNote =
    spouseCount === 0
      ? `원국에 ${groupKo(group)}이 드러나 있지 않아요 — 인연이 없다는 뜻이 아니라, 운(대운·세운)에서 ${groupKo(group)}이 들어올 때 만남이 활발해지는 타입이에요.`
      : spouseCount === 1
        ? `${groupKo(group)}이 ${positionsKo(spousePositions)}에 하나 있어요 — 한 사람에게 깊이 마음을 두는 편이에요.`
        : spouseCount >= 3
          ? `${groupKo(group)}이 ${spouseCount}개(${positionsKo(spousePositions)})로 많아요 — 인연의 기회는 많지만 마음이 나뉘기 쉬워 선택과 집중이 관건이에요.`
          : `${groupKo(group)}이 ${positionsKo(spousePositions)}에 있어요 — 인연의 기운이 자연스럽게 흘러요.`;

  const d = chart.pillars.day;
  const palaceRelations = relationsWithDay(chart.relations);
  const palaceStageKo = ['장생', '관대', '건록', '제왕'].includes(d.twelveStage) ? '든든해요' : ['목욕', '쇠', '태', '양'].includes(d.twelveStage) ? '보통이에요' : '약한 편이라 서로 아껴 주는 게 좋아요';
  const relText = palaceRelations.length
    ? ` 배우자 자리와 ${palaceRelations.map((r) => r.label).join(', ')}이 있어 ${palaceRelations.some(isClashLike) ? '가까운 사이일수록 부딪힘이 생기기 쉬워요 — 말투와 거리 조절이 관계를 지켜요.' : '가까운 사람과 잘 맞물려요.'}`
    : '';
  const palace = {
    branchKo: branchMeta(d.branch).ko,
    branchHanja: branchMeta(d.branch).hanja,
    tenGod: d.branchTenGod,
    tenGodKo: tenGodKo(d.branchTenGod),
    stage: d.twelveStage,
    isVoid: d.isVoid,
    relations: palaceRelations,
    text: `배우자 자리(일지 ${branchMeta(d.branch).ko})는 ${tenGodKo(d.branchTenGod)} — ${SAJU_TEN_GOD_TEXT[d.branchTenGod].short}의 기운이에요. 가까운 사람에게서 ${SAJU_TEN_GOD_TEXT[d.branchTenGod].personality} 십이운성 ${d.twelveStage}(${SAJU_TWELVE_STAGE_TEXT[d.twelveStage]})이라 그 자리의 힘이 ${palaceStageKo}.${d.isVoid ? ' 일지가 공망이라 관계에서 허전함을 느끼기 쉬워 정신적 교감을 더 챙기면 좋아요.' : ''}${relText}`,
  };

  const marks: SajuLoveTheme['marks'] = [];
  for (const s of chart.stars) {
    const t = SPOUSE_MARK_TEXT[s.id];
    if (t) marks.push({ id: s.id, ko: s.ko, text: t });
  }
  if (chart.relations.some((r) => r.type === 'wonjin')) marks.push({ id: 'wonjin', ko: '원진', text: '이유 없이 서운해지는 관계 패턴이 있어요. 말로 확인하는 습관이 오해를 줄여요.' });

  const dm = dayMasterText(chart.dayMaster.index);
  const styleGod = spousePositions[0]?.tenGod ?? main;
  const style = `${dm.love} 인연의 기운(${tenGodKo(styleGod)})으로 보면 ${SAJU_TEN_GOD_TEXT[styleGod].short}을 상대에게서 찾는 편이에요.`;

  const dohwa = dohwaBranchOf(d.branch);
  const scored: SajuThemeYear[] = yearsOf(chart, 8).map((yl) => {
    const reasons: string[] = [];
    let score = 0;
    if (yl.stemTenGod === main) { score += 3; reasons.push(`천간 ${tenGodKo(main)} — 인연의 기운이 밖으로 드러나는 해`); }
    else if (yl.stemTenGod === sub) { score += 2; reasons.push(`천간 ${tenGodKo(sub)} — 새로운 만남의 기운`); }
    if (yl.branchTenGod === main) { score += 2; reasons.push(`지지 ${tenGodKo(main)} — 인연이 자리를 잡는 기운`); }
    else if (yl.branchTenGod === sub) { score += 1; reasons.push(`지지 ${tenGodKo(sub)}`); }
    const dayRels = relationsWithDay(yl.relations);
    if (dayRels.some(isCombine)) { score += 3; reasons.push('배우자 자리와 합 — 가까워지는 인연'); }
    if (dayRels.some(isClashLike)) { score -= 3; reasons.push('배우자 자리와 충·형 — 관계의 변동'); }
    if (dohwa !== null && yl.ganzhi % 12 === dohwa) { score += 1; reasons.push('도화 해 — 매력이 살아나요'); }
    if (chart.voidBranches.includes(yl.ganzhi % 12)) { score -= 1; }
    return { year: yl.year, ko: yl.ko, hanja: yl.hanja, stemTenGod: yl.stemTenGod, branchTenGod: yl.branchTenGod, isCurrent: yl.year === chart.asOf.year, reasons, score };
  });
  const chanceYears = scored.filter((y) => y.score >= 3).sort((a, b) => b.score - a.score || a.year - b.year).slice(0, 3).sort((a, b) => a.year - b.year);
  const chanceNote = chanceYears.length
    ? `앞으로 8년 중 ${chanceYears.map((y) => `${y.year}년(${y.ko})`).join(' · ')}에 인연의 기운이 가까워져요. 결혼을 정하는 건 두 사람의 마음이고, 사주는 흐름만 보여 줘요.`
    : `앞으로 8년은 ${groupKo(group)}이 크게 드러나는 해가 없어 잔잔한 흐름이에요. 조용히 관계를 다지기 좋은 시기예요.`;

  const luckPeriods = luckPeriodsOfGroups(chart, [group], (gods) => `${gods.map(tenGodKo).join('·')}이 들어와 인연·관계가 활발해지는 10년`).filter((p) => p.toAge >= chart.asOf.age);

  return {
    spouseGod: { main, sub, group, groupKo: groupKo(group), note: spouseGodNote },
    spouseCount,
    spousePositions,
    spouseNote,
    palace,
    marks,
    style,
    chanceYears,
    chanceNote,
    luckPeriods,
  };
};

// ── 재물 ─────────────────────────────────────────────────────

export type SajuWealthStyleId = 'jeongjae' | 'pyeonjae' | 'siksang' | 'bigeop' | 'none';

export interface SajuWealthTheme {
  counts: { jeongjae: number; pyeonjae: number; total: number; output: number; self: number; resource: number };
  positions: SajuGodPosition[];
  /** 재성 오행(일간이 극하는 오행) — 돈이 오는 색. */
  element: Wuxing;
  style: { id: SajuWealthStyleId; ko: string; summary: string; detail: string };
  /** 신강약과 재의 크기 — 재를 감당하는 힘. */
  capacity: { level: 'good' | 'ok' | 'burden'; text: string };
  /** 흐름 노트(식상생재·군겁쟁재·재다신약·인성 과다). */
  notes: string[];
  luckPeriods: SajuThemeLuckPeriod[];
  years: SajuThemeYear[];
  keyword: string;
}

const WEALTH_STYLE_TEXT: Record<SajuWealthStyleId, { ko: string; summary: string; detail: string; keyword: string }> = {
  jeongjae: { ko: '정재형', summary: '꾸준히 모아 실속을 쌓는 돈', detail: '월급·저축·관리처럼 예측 가능한 흐름에서 돈이 안정돼요. 한 방보다 누적이, 투기보다 적립이 어울려요. 지나친 신중함으로 기회를 놓치지만 않으면 돼요.', keyword: '적립' },
  pyeonjae: { ko: '편재형', summary: '움직이며 크게 굴리는 돈', detail: '사업·영업·투자처럼 흐름을 타는 데서 돈이 커져요. 사람과 시장을 읽는 눈이 강점이고, 들어오는 만큼 나가기도 쉬워 분산과 상한선을 미리 정해 두면 좋아요.', keyword: '순환' },
  siksang: { ko: '식상생재형', summary: '재능이 돈으로 이어지는 흐름', detail: '식상(재능·표현)이 재성(돈)을 낳는 구조예요. 좋아하고 잘하는 일을 오래 하면 수입이 따라와요. 콘텐츠·기술·서비스처럼 내가 만든 것이 팔리는 방식이 잘 맞아요.', keyword: '창출' },
  bigeop: { ko: '비겁쟁재형', summary: '나눠 갖기 쉬운 돈, 지키는 게 관건', detail: '비겁(경쟁·동료)이 재성보다 많아 돈이 여러 손을 거치기 쉬워요. 동업·보증·공동 투자는 문서로 선을 긋고, 수입원을 내 이름으로 분명히 두면 새는 걸 막아요.', keyword: '수성' },
  none: { ko: '무재형', summary: '돈보다 일과 사람이 먼저 오는 흐름', detail: '원국에 재성이 드러나 있지 않아요 — 돈에 집착이 적고 일·명예·배움이 먼저 오는 타입이에요. 재성 대운·세운이 들어올 때 수입이 활발해지므로 그 시기를 알고 준비하면 돼요.', keyword: '준비' },
};

export const sajuWealthThemeOf = (chart: SajuChart): SajuWealthTheme => {
  const jeongjae = chart.tenGodCounts.jeongjae ?? 0;
  const pyeonjae = chart.tenGodCounts.pyeonjae ?? 0;
  const total = jeongjae + pyeonjae;
  const output = groupCount(chart, 'output');
  const self = groupCount(chart, 'self');
  const resource = groupCount(chart, 'resource');
  const positions = sajuGodPositions(chart, ['jeongjae', 'pyeonjae']);
  const element = elementOfTenGodGroup(chart.dayMaster.element, 'wealth');

  let id: SajuWealthStyleId;
  if (total === 0) id = 'none';
  else if (output >= 1 && chart.strength.level !== 'weak') id = 'siksang';
  else if (self >= 3 && total <= 2) id = 'bigeop';
  else if (pyeonjae > jeongjae) id = 'pyeonjae';
  else id = 'jeongjae';
  const st = WEALTH_STYLE_TEXT[id];

  const capacity: SajuWealthTheme['capacity'] =
    chart.strength.level === 'weak' && total >= 3
      ? { level: 'burden', text: '재성은 많은데 일간이 약한 편(재다신약)이라 돈이 기회이면서 부담이 되기 쉬워요. 크게 벌리기보다 관리 가능한 규모로, 나를 받쳐 주는 사람·배움을 먼저 채우면 돈이 따라와요.' }
      : chart.strength.level === 'strong' && total >= 1
        ? { level: 'good', text: '일간이 튼튼해 재성을 감당하는 힘이 있어요. 벌어들인 것을 굴리고 키우는 쪽이 잘 맞아요.' }
        : { level: 'ok', text: `${SAJU_STRENGTH_TEXT[chart.strength.level].ko}한 사주라 재물은 무리하지 않는 선에서 꾸준히 흘러요.` };

  const notes: string[] = [];
  if (output >= 1 && total >= 1) notes.push('식상이 재성을 낳는 흐름(식상생재) — 재능·표현이 수입으로 이어져요.');
  if (self >= 3) notes.push('비겁이 많아 돈을 나누게 되는 자리(동업·보증·형제)를 조심하면 좋아요.');
  if (resource >= 3 && total <= 1) notes.push('인성이 많고 재성이 적어 배움·명분이 돈보다 앞서요. 배운 것을 파는 구조를 만들면 균형이 맞아요.');
  if (pyeonjae >= 2) notes.push('편재가 여럿이라 돈의 들고 남이 커요. 상한선과 분산이 관건이에요.');
  if (positions.length) notes.push(`재성 위치: ${positionsKo(positions)} — 그 시기·관계에서 돈의 인연이 생겨요.`);

  const luckPeriods = luckPeriodsOfGroups(chart, ['wealth', 'output'], (gods) =>
    gods.some((g) => SAJU_TEN_GOD_META[g].group === 'wealth') ? `${gods.map(tenGodKo).join('·')} — 수입·활동이 활발해지는 10년` : `${gods.map(tenGodKo).join('·')} — 재능을 펼쳐 돈을 만드는 10년`,
  ).filter((p) => p.toAge >= chart.asOf.age);

  const years: SajuThemeYear[] = yearsOf(chart, 5)
    .map((yl) => {
      const reasons: string[] = [];
      let score = 0;
      const sg = SAJU_TEN_GOD_META[yl.stemTenGod].group;
      const bg = SAJU_TEN_GOD_META[yl.branchTenGod].group;
      if (sg === 'wealth') { score += 3; reasons.push(`천간 ${tenGodKo(yl.stemTenGod)} — 수입·기회가 드러나는 해`); }
      if (bg === 'wealth') { score += 2; reasons.push(`지지 ${tenGodKo(yl.branchTenGod)} — 돈의 바탕이 생기는 해`); }
      if (sg === 'output') { score += 1; reasons.push(`천간 ${tenGodKo(yl.stemTenGod)} — 재능을 펼쳐 만드는 해`); }
      if (sg === 'self' && total <= 2) { score -= 1; reasons.push(`천간 ${tenGodKo(yl.stemTenGod)} — 나눠 쓰기 쉬운 해, 지출 관리`); }
      if (yl.relations.some(isClashLike)) { score -= 1; reasons.push('원국과 충·형 — 변동 있는 해'); }
      return { year: yl.year, ko: yl.ko, hanja: yl.hanja, stemTenGod: yl.stemTenGod, branchTenGod: yl.branchTenGod, isCurrent: yl.year === chart.asOf.year, reasons, score };
    });

  return { counts: { jeongjae, pyeonjae, total, output, self, resource }, positions, element, style: { id, ko: st.ko, summary: st.summary, detail: st.detail }, capacity, notes, luckPeriods, years, keyword: st.keyword };
};

// ── 직업 ─────────────────────────────────────────────────────

export interface SajuCareerTheme {
  pattern: SajuPattern;
  groups: Array<{ group: TenGodGroup; ko: string; count: number }>;
  aptitude: { group: TenGodGroup; ko: string; summary: string; detail: string };
  /** 격국 기준 직업군 키워드 + 일간 오행 업종. */
  jobs: string[];
  industries: string[];
  stars: Array<{ id: StarId; ko: string; hint: string }>;
  /** 일간 정적 일 스타일. */
  workStyle: string;
  luckPeriods: SajuThemeLuckPeriod[];
  years: SajuThemeYear[];
  keyword: string;
}

const APTITUDE_TEXT: Record<TenGodGroup, { ko: string; summary: string; detail: string; keyword: string }> = {
  power: { ko: '조직·명예형', summary: '규칙 있는 조직 안에서 신뢰로 올라가는 사람', detail: '관성이 앞서 책임과 직함이 힘이 돼요. 공직·대기업·전문 자격처럼 체계가 있는 곳에서 안정적으로 성장해요.', keyword: '책임' },
  output: { ko: '창작·표현형', summary: '만들고 표현하며 재능으로 승부하는 사람', detail: '식상이 앞서 내 손으로 결과물을 내는 일이 맞아요. 창작·기술·교육·서비스처럼 재능이 곧 성과가 되는 자리에서 빛나요.', keyword: '재능' },
  resource: { ko: '학문·전문형', summary: '배우고 파고들어 전문성으로 서는 사람', detail: '인성이 앞서 지식·문서·자격이 무기예요. 연구·교육·의료·상담처럼 깊이가 필요한 분야에서 오래 가요.', keyword: '전문' },
  wealth: { ko: '사업·실속형', summary: '흐름을 읽고 성과를 만드는 사람', detail: '재성이 앞서 결과와 숫자에 밝아요. 영업·사업·금융·유통처럼 움직임이 곧 성과인 자리가 맞아요.', keyword: '성과' },
  self: { ko: '자립·독립형', summary: '제 힘으로 판을 여는 사람', detail: '비겁이 앞서 남 밑보다 내 이름으로 하는 일이 맞아요. 프리랜서·전문 자영업·체육·현장직처럼 실력이 곧 자리인 곳에서 강해요.', keyword: '자립' },
};

const PATTERN_JOBS: Record<SajuPattern['id'], string[]> = {
  jeonggwan: ['공무원·공공기관', '대기업 관리·인사', '법무·행정', '교사·교육행정'],
  pyeongwan: ['군·경·소방', '의료·수술', '스포츠·코칭', '보안·위기관리'],
  jeongjae: ['회계·재무', '금융·은행', '제조·유통 관리', '부동산·자산관리'],
  pyeonjae: ['창업·사업', '영업·마케팅', '무역·유통', '투자·벤처'],
  siksin: ['요리·식품', '콘텐츠·창작', '교육·강의', '서비스·접객'],
  sanggwan: ['예술·디자인', '기획·광고', '방송·언론', '엔지니어링·기술'],
  jeongin: ['연구·학문', '교육', '출판·문서', '자격 전문직'],
  pyeonin: ['IT·데이터', '의학·한의학', '상담·심리', '철학·종교'],
  geonrok: ['프리랜서·독립 사업', '체육·기술직', '전문 자영업', '현장 관리'],
  yangin: ['군·경·검', '외과·응급의료', '운동선수', '중장비·제철·건설'],
};
const ELEMENT_INDUSTRIES: Record<Wuxing, string[]> = {
  wood: ['교육·출판', '섬유·의류', '목재·가구', '조경·농업'],
  fire: ['전기·전자', '미디어·방송', '화학·에너지', '조명·뷰티'],
  earth: ['부동산·건설', '농업·식품', '중개·컨설팅', '종교·복지'],
  metal: ['금융·보험', '기계·금속', '법률·회계', '의료·정밀'],
  water: ['유통·무역', '해외·물류', '서비스·관광', '연구·정보'],
};
const CAREER_STAR_HINT: Partial<Record<StarId, string>> = {
  yeokma: '이동·출장·해외와 인연이 있어 움직이는 일에서 운이 붙어요.',
  munchang: '글·시험·기획에 강해 문서와 학문이 무기가 돼요.',
  cheoneul: '조직 안에서 끌어 주는 귀인이 있어요. 사람을 통해 자리가 열려요.',
  yangin: '결단과 돌파의 기운 — 권한이 큰 자리(군경·의료·법)에서 힘을 써요.',
  goegang: '카리스마와 극단의 힘 — 리더십이 필요한 자리에서 빛나요.',
  hwagae: '예술·종교·연구처럼 혼자 파고드는 일에서 깊이가 나와요.',
  geumyeo: '안정된 직장과 복지의 기운 — 오래 다니는 자리가 맞아요.',
  cheondeok: '덕망의 기운 — 공적인 자리에서 신뢰를 얻어요.',
  woldeok: '덕망의 기운 — 사람을 돕는 일에서 평판이 쌓여요.',
};

export const sajuCareerThemeOf = (chart: SajuChart): SajuCareerTheme => {
  const pattern = sajuPatternOf(chart);
  const order: readonly TenGodGroup[] = ['power', 'output', 'resource', 'wealth', 'self'];
  const groups = order.map((group) => ({ group, ko: groupKo(group), count: groupCount(chart, group) }));
  const basisGroup = SAJU_TEN_GOD_META[pattern.basis].group;
  // 가장 많은 그룹, 동률이면 격국의 그룹 우선.
  const max = Math.max(...groups.map((g) => g.count));
  const top = groups.filter((g) => g.count === max);
  const dominant = (top.find((g) => g.group === basisGroup) ?? top[0] ?? groups[0]) as (typeof groups)[number];
  const apt = APTITUDE_TEXT[dominant.group];

  const stars: SajuCareerTheme['stars'] = [];
  for (const s of chart.stars) {
    const hint = CAREER_STAR_HINT[s.id];
    if (hint && !stars.some((x) => x.id === s.id)) stars.push({ id: s.id, ko: SAJU_STAR_META[s.id].ko, hint });
  }
  const dm = dayMasterText(chart.dayMaster.index);

  const luckPeriods = luckPeriodsOfGroups(chart, ['power', 'output', 'resource'], (gods) => {
    const g = SAJU_TEN_GOD_META[gods[0] as TenGod].group;
    return g === 'power' ? `${gods.map(tenGodKo).join('·')} — 직함·책임이 커지는 10년` : g === 'output' ? `${gods.map(tenGodKo).join('·')} — 새로 만들고 펼치는 10년` : `${gods.map(tenGodKo).join('·')} — 배우고 자격을 갖추는 10년`;
  }).filter((p) => p.toAge >= chart.asOf.age);

  const years: SajuThemeYear[] = yearsOf(chart, 5).map((yl) => {
    const reasons: string[] = [];
    let score = 0;
    const sg = SAJU_TEN_GOD_META[yl.stemTenGod].group;
    const bg = SAJU_TEN_GOD_META[yl.branchTenGod].group;
    if (sg === 'power') { score += 3; reasons.push(`천간 ${tenGodKo(yl.stemTenGod)} — 승진·이직·시험에 힘이 실리는 해`); }
    if (sg === 'output') { score += 2; reasons.push(`천간 ${tenGodKo(yl.stemTenGod)} — 새 프로젝트·표현이 잘 풀리는 해`); }
    if (sg === 'resource') { score += 2; reasons.push(`천간 ${tenGodKo(yl.stemTenGod)} — 공부·자격·문서가 따르는 해`); }
    if (sg === 'wealth') { score += 1; reasons.push(`천간 ${tenGodKo(yl.stemTenGod)} — 성과와 수입이 보이는 해`); }
    if (bg === 'power' && sg !== 'power') { score += 1; reasons.push(`지지 ${tenGodKo(yl.branchTenGod)} — 자리가 단단해지는 해`); }
    if (yl.relations.some(isClashLike)) { score -= 1; reasons.push('원국과 충·형 — 이동·변화가 생기기 쉬운 해'); }
    return { year: yl.year, ko: yl.ko, hanja: yl.hanja, stemTenGod: yl.stemTenGod, branchTenGod: yl.branchTenGod, isCurrent: yl.year === chart.asOf.year, reasons, score };
  });

  return {
    pattern,
    groups,
    aptitude: { group: dominant.group, ko: apt.ko, summary: apt.summary, detail: apt.detail },
    jobs: PATTERN_JOBS[pattern.id],
    industries: ELEMENT_INDUSTRIES[chart.dayMaster.element],
    stars,
    workStyle: dm.work,
    luckPeriods,
    years,
    keyword: apt.keyword,
  };
};

// ── LLM 사실 블록(서버 프롬프트용) ───────────────────────────

const yearLine = (y: SajuThemeYear): string => `${y.year}년 ${y.ko}(${y.hanja})${y.isCurrent ? '·올해' : ''}: ${y.reasons.length ? y.reasons.join(' / ') : '특별한 표식 없음'}`;
const periodLine = (p: SajuThemeLuckPeriod): string => `${p.ko}(${p.hanja}) ${p.fromAge}~${p.toAge}세${p.current ? '·현재' : ''}: ${p.note}`;

export const sajuLoveFactLines = (t: SajuLoveTheme): string[] => [
  `배우자성: ${t.spouseGod.note} 주 ${tenGodKo(t.spouseGod.main)} / 부 ${tenGodKo(t.spouseGod.sub)} — 원국에 ${t.spouseCount}개${t.spousePositions.length ? ` (${positionsKo(t.spousePositions)})` : ''}`,
  `배우자성 해석: ${t.spouseNote}`,
  `배우자궁(일지): ${t.palace.branchKo}(${t.palace.branchHanja}) ${t.palace.tenGodKo} · 십이운성 ${t.palace.stage}${t.palace.isVoid ? ' · 공망' : ''}${t.palace.relations.length ? ` · 관계 ${t.palace.relations.map((r) => r.label).join(', ')}` : ''}`,
  `연애 표식: ${t.marks.length ? t.marks.map((m) => `${m.ko}(${m.text})`).join(' / ') : '없음'}`,
  `연애 스타일(정적): ${t.style}`,
  `인연이 가까워지는 해(향후 8년, 계산): ${t.chanceYears.length ? t.chanceYears.map(yearLine).join(' | ') : '없음(잔잔한 흐름)'}`,
  `배우자성 대운: ${t.luckPeriods.length ? t.luckPeriods.slice(0, 4).map(periodLine).join(' | ') : '가까운 대운에 없음'}`,
];

export const sajuWealthFactLines = (t: SajuWealthTheme): string[] => [
  `재성: 정재 ${t.counts.jeongjae} · 편재 ${t.counts.pyeonjae}${t.positions.length ? ` (${positionsKo(t.positions)})` : ' — 원국에 드러나지 않음'} / 식상 ${t.counts.output} · 비겁 ${t.counts.self} · 인성 ${t.counts.resource}`,
  `재성 오행: ${wuxingKo(t.element)}`,
  `재물 스타일(계산): ${t.style.ko} — ${t.style.summary}. ${t.style.detail}`,
  `재를 감당하는 힘: ${t.capacity.text}`,
  `흐름 노트: ${t.notes.length ? t.notes.join(' / ') : '특별한 노트 없음'}`,
  `재성·식상 대운: ${t.luckPeriods.length ? t.luckPeriods.slice(0, 4).map(periodLine).join(' | ') : '가까운 대운에 없음'}`,
  `향후 5년 재물 세운(계산): ${t.years.map(yearLine).join(' | ')}`,
];

export const sajuCareerFactLines = (t: SajuCareerTheme): string[] => [
  `격국: ${t.pattern.ko}(${t.pattern.hanja}) — ${t.pattern.summary}. ${t.pattern.detail}`,
  `십신 그룹 개수: ${t.groups.map((g) => `${g.ko} ${g.count}`).join(' · ')} → 적성 ${t.aptitude.ko}(${t.aptitude.summary})`,
  `직업군 후보(격국 기준): ${t.jobs.join(', ')} / 업종 색(일간 오행): ${t.industries.join(', ')}`,
  `직업 관련 신살: ${t.stars.length ? t.stars.map((s) => `${s.ko}(${s.hint})`).join(' / ') : '없음'}`,
  `일 스타일(정적): ${t.workStyle}`,
  `관성·식상·인성 대운: ${t.luckPeriods.length ? t.luckPeriods.slice(0, 4).map(periodLine).join(' | ') : '가까운 대운에 없음'}`,
  `향후 5년 직업 세운(계산): ${t.years.map(yearLine).join(' | ')}`,
];

export const sajuThemeFactLines = (chart: SajuChart, theme: SajuThemeId): string[] => {
  switch (theme) {
    case 'love':
      return sajuLoveFactLines(sajuLoveThemeOf(chart));
    case 'wealth':
      return sajuWealthFactLines(sajuWealthThemeOf(chart));
    case 'career':
      return sajuCareerFactLines(sajuCareerThemeOf(chart));
  }
};

// 사용처 힌트 — 대운 타입은 계약 DTO 와 같은 모양이라 웹도 그대로 쓴다.
export type { SajuLuckPillar as SajuThemeLuckPillarRef };
