// 오늘의 운세 — 하루(일진)를 내 사주와 견주어 점수(0~100)·별점(1~5)·태그로 만든다.
// 택일(sajuDatePick)도 같은 점수 위에 용도 가중을 얹는다. 규칙은 docs/PLAN-saju.md "오늘의 운세".
//
//  - 일진 천간의 십신: 정재·정관·정인·식신 +, 편관·상관·겁재 −
//  - 일진 지지 vs 일지(육합·삼합·방합 + / 충·형·해·파·원진 −), 년지는 절반 가중
//  - 일진 지지의 십이운성(일간 기준): 장생·관대·건록·제왕 + / 사·묘·절 −
//  - 천을귀인 +, 공망일 −, 문창·도화·역마는 태그(택일 용도 가중)
//  - 일진 천간 오행이 보완 오행이면 +, 과다 오행이면 −

import {
  civilFromMinutes,
  KST_OFFSET_MINUTES,
  kstDayNumberOfDate,
  sajuDateFromDayNumber,
  solarToLunar,
  type CivilDate,
  type LunarDate,
} from './sajuCalendar.js';
import {
  branchMeta,
  branchOfGanzhi,
  dayGanzhiOfDayNumber,
  findRelations,
  ganzhiHanja,
  ganzhiKo,
  mainHiddenStem,
  SAJU_THREE_COMBINES,
  stemMeta,
  stemOfGanzhi,
  tenGodOf,
  twelveStageOf,
  type Branch,
  type SajuChart,
  type SajuRelation,
  type Stem,
  type TenGod,
  type TwelveStage,
  type Wuxing,
} from './saju.js';
import { SAJU_WUXING_LUCKY, type WuxingLucky } from './sajuText.js';

export type SajuDayTag =
  | 'cheoneul' | 'munchang' | 'dohwa' | 'yeokma'
  | 'void' | 'favorable' | 'excess' | 'son-eomneun'
  | 'six-combine' | 'three-combine' | 'directional'
  | 'clash' | 'punish' | 'harm' | 'break' | 'wonjin'
  | 'stage-good' | 'stage-bad' | 'god-good' | 'god-bad';

export const SAJU_DAY_TAG_LABEL: Record<SajuDayTag, string> = {
  cheoneul: '귀인이 돕는 날',
  munchang: '공부·시험에 좋은 날',
  dohwa: '매력이 빛나는 날',
  yeokma: '움직임이 좋은 날',
  void: '공망일 — 뜻대로 안 풀릴 수 있음',
  favorable: '보완 기운이 들어오는 날',
  excess: '과한 기운이 겹치는 날',
  'son-eomneun': '손 없는 날',
  'six-combine': '인연이 이어지는 날',
  'three-combine': '힘이 모이는 날',
  directional: '기운이 강해지는 날',
  clash: '부딪힘이 있는 날',
  punish: '마찰을 조심할 날',
  harm: '서운함이 생길 수 있는 날',
  break: '흩어지기 쉬운 날',
  wonjin: '어긋나기 쉬운 날',
  'stage-good': '기운이 오르는 날',
  'stage-bad': '기운이 쉬어 가는 날',
  'god-good': '흐름이 순한 날',
  'god-bad': '흐름이 거친 날',
};

const GOD_SCORE: Record<TenGod, number> = {
  jeongjae: 12, jeonggwan: 12, jeongin: 10, siksin: 10, bigyeon: 4, pyeonjae: 6, pyeonin: 2,
  geopjae: -6, sanggwan: -6, pyeongwan: -8,
};
const STAGE_SCORE: Record<TwelveStage, number> = {
  장생: 8, 목욕: 2, 관대: 6, 건록: 8, 제왕: 8, 쇠: -2, 병: -4, 사: -6, 묘: -4, 절: -6, 태: 2, 양: 3,
};
// 일간 → 천을귀인·문창 지지(saju.ts 와 동일 표).
const CHEONEUL: readonly (readonly Branch[])[] = [[1, 7], [0, 8], [11, 9], [11, 9], [1, 7], [0, 8], [1, 7], [2, 6], [5, 3], [5, 3]];
const MUNCHANG: readonly Branch[] = [5, 6, 8, 9, 8, 9, 11, 0, 2, 3];
const DOHWA: readonly Branch[] = [3, 9, 6, 0];
const YEOKMA: readonly Branch[] = [8, 2, 11, 5];
const groupOf = (b: Branch): number => SAJU_THREE_COMBINES.findIndex((tc) => tc.branches.includes(b));

export interface SajuDayScore {
  dayNumber: number;
  date: CivilDate;
  lunar: LunarDate | null;
  weekday: number;
  ganzhi: number;
  ko: string;
  hanja: string;
  /** 일진 천간의 오행. */
  element: Wuxing;
  stemTenGod: TenGod;
  branchTenGod: TenGod;
  twelveStage: TwelveStage;
  score: number;
  stars: 1 | 2 | 3 | 4 | 5;
  tags: readonly SajuDayTag[];
  relations: readonly SajuRelation[];
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
export const starsOfScore = (score: number): 1 | 2 | 3 | 4 | 5 => (score >= 80 ? 5 : score >= 65 ? 4 : score >= 50 ? 3 : score >= 35 ? 2 : 1);

/** 하루 점수. */
/** 간지 하나를 원국에 대 본 점수(50 기준, 미클램프)·표식 — 일진·월운·세운·시진이 같은 규칙을 쓴다. 관계는 luck 기둥으로 넣어 계산. */
export const scoreGanzhiForChart = (
  chart: SajuChart,
  stem: Stem,
  branch: Branch,
): { score: number; tags: SajuDayTag[]; stemTenGod: TenGod; branchTenGod: TenGod; stage: TwelveStage; element: Wuxing; relations: SajuRelation[] } => {
  const dm = chart.dayMaster.index;
  const stemTenGod = tenGodOf(dm, stem);
  const branchTenGod = tenGodOf(dm, mainHiddenStem(branch));
  const stage = twelveStageOf(dm, branch);
  const tags: SajuDayTag[] = [];
  let score = 50;

  const gs = GOD_SCORE[stemTenGod];
  score += gs;
  if (gs >= 10) tags.push('god-good');
  if (gs < 0) tags.push('god-bad');

  const ss = STAGE_SCORE[stage];
  score += ss;
  if (ss >= 6) tags.push('stage-good');
  if (ss <= -4) tags.push('stage-bad');

  const p = chart.pillars;
  const chars = [p.year, p.month, p.day, ...(p.hour ? [p.hour] : [])].map((x) => ({ key: x.key, stem: x.stem, branch: x.branch }));
  const rels = findRelations([...chars, { key: 'luck', stem, branch }]).filter((r) => r.pillars.includes('luck'));
  const weightOf = (r: SajuRelation): number => (r.pillars.includes('day') ? 1 : r.pillars.includes('year') ? 0.5 : 0.25);
  for (const r of rels) {
    const w = weightOf(r);
    switch (r.type) {
      case 'six-combine': score += 12 * w; tags.push('six-combine'); break;
      case 'three-combine': case 'half-combine': score += 10 * w; tags.push('three-combine'); break;
      case 'directional': score += 5 * w; tags.push('directional'); break;
      case 'clash': score -= 14 * w; tags.push('clash'); break;
      case 'punish': case 'self-punish': score -= 10 * w; tags.push('punish'); break;
      case 'harm': score -= 6 * w; tags.push('harm'); break;
      case 'break': score -= 6 * w; tags.push('break'); break;
      case 'wonjin': score -= 8 * w; tags.push('wonjin'); break;
      case 'stem-combine': score += 4 * w; break;
      case 'stem-clash': score -= 4 * w; break;
    }
  }

  if ((CHEONEUL[dm] ?? []).includes(branch)) { score += 10; tags.push('cheoneul'); }
  if (MUNCHANG[dm] === branch) { score += 4; tags.push('munchang'); }
  if (chart.voidBranches.includes(branch)) { score -= 8; tags.push('void'); }
  for (const base of [p.year.branch, p.day.branch]) {
    const gi = groupOf(base);
    if (gi < 0) continue;
    if (DOHWA[gi] === branch && !tags.includes('dohwa')) { score += 3; tags.push('dohwa'); }
    if (YEOKMA[gi] === branch && !tags.includes('yeokma')) { score += 3; tags.push('yeokma'); }
  }
  const el = stemMeta(stem).element;
  if (el === chart.favorable.primary) { score += 6; tags.push('favorable'); }
  else if (el === chart.favorable.secondary) score += 3;
  if (chart.excess.includes(el)) { score -= 3; tags.push('excess'); }
  return { score, tags, stemTenGod, branchTenGod, stage, element: el, relations: rels };
};

export const scoreDayForChart = (chart: SajuChart, dayNumber: number): SajuDayScore => {
  const g = dayGanzhiOfDayNumber(dayNumber);
  const stem = stemOfGanzhi(g);
  const branch = branchOfGanzhi(g);
  const core = scoreGanzhiForChart(chart, stem, branch);
  const { stemTenGod, branchTenGod, stage, element: el, relations: rels, tags } = core;
  let score = core.score;

  const date = sajuDateFromDayNumber(dayNumber);
  const lunar = solarToLunar(date.year, date.month, date.day);
  if (lunar && (lunar.day % 10 === 9 || lunar.day % 10 === 0)) tags.push('son-eomneun');

  score = Math.round(clamp(score, 5, 98));
  return {
    dayNumber,
    date,
    lunar,
    weekday: (((dayNumber + 1) % 7) + 7) % 7,
    ganzhi: g,
    ko: ganzhiKo(g),
    hanja: ganzhiHanja(g),
    element: el,
    stemTenGod,
    branchTenGod,
    twelveStage: stage,
    score,
    stars: starsOfScore(score),
    tags: [...new Set(tags)],
    relations: rels,
  };
};

export interface SajuDailyFortune {
  day: SajuDayScore;
  /** 보완 오행 기준 행운 요소. */
  lucky: WuxingLucky;
  /** 오늘의 한 줄 태그(가장 두드러진 것). */
  headline: string;
  /** 오늘 지지의 띠 동물(재미 요소). */
  dayAnimal: string;
}

const TAG_PRIORITY: readonly SajuDayTag[] = [
  'cheoneul', 'six-combine', 'three-combine', 'clash', 'punish', 'wonjin', 'favorable', 'munchang', 'dohwa', 'yeokma',
  'void', 'harm', 'break', 'stage-good', 'god-good', 'god-bad', 'stage-bad', 'directional', 'excess', 'son-eomneun',
];

/** 오늘(KST)의 운세. date 를 주면 그날. */
export const dailyFortune = (chart: SajuChart, date: Date = new Date()): SajuDailyFortune => {
  const day = scoreDayForChart(chart, kstDayNumberOfDate(date));
  const top = TAG_PRIORITY.find((t) => day.tags.includes(t));
  const headline = top ? SAJU_DAY_TAG_LABEL[top] : day.stars >= 4 ? '순하게 흘러가는 날' : day.stars <= 2 ? '천천히 가도 괜찮은 날' : '평온한 날';
  return {
    day,
    lucky: SAJU_WUXING_LUCKY[chart.favorable.primary],
    headline,
    dayAnimal: branchMeta(day.ganzhi % 12).animal,
  };
};

/** KST 기준 오늘 날짜 문자열(yyyy-mm-dd). */
export const kstDayKey = (date: Date = new Date()): string => {
  const c = civilFromMinutes(Math.floor((date.getTime() - Date.UTC(1900, 0, 1)) / 60_000), KST_OFFSET_MINUTES);
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
};
