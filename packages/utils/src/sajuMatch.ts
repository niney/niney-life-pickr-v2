// 궁합 — 두 사주의 어울림을 100점으로. 항목별 점수·근거(breakdown)를 내려 LLM 은 그 위에 서사만 쓴다.
// 규칙은 docs/PLAN-saju.md "궁합": 일간 25 + 일지 25 + 띠(년지) 15 + 오행 보완 20 + 십신 15.

import {
  findRelations,
  halfCombineOf,
  isClash,
  isHarm,
  isPunish,
  isSixCombine,
  isStemCombine,
  isWonjin,
  SAJU_TEN_GOD_META,
  SAJU_WUXING,
  SAJU_WUXING_META,
  stemMeta,
  tenGodOf,
  wuxingControls,
  wuxingGenerates,
  type Branch,
  type SajuChart,
  type SajuRelation,
  type TenGod,
  type Wuxing,
} from './saju.js';

export type SajuMatchGrade = 'excellent' | 'good' | 'fair' | 'effort' | 'caution';
export const SAJU_MATCH_GRADE_LABEL: Record<SajuMatchGrade, string> = {
  excellent: '천생연분',
  good: '잘 맞는 사이',
  fair: '무난한 사이',
  effort: '노력이 필요한 사이',
  caution: '조심스러운 사이',
};

export type SajuMatchKey = 'dayMaster' | 'dayBranch' | 'zodiac' | 'elements' | 'tenGod';
export interface SajuMatchBreakdown {
  key: SajuMatchKey;
  label: string;
  score: number;
  max: number;
  note: string;
}

export interface SajuMatchResult {
  score: number;
  grade: SajuMatchGrade;
  gradeKo: string;
  breakdown: readonly SajuMatchBreakdown[];
  /** 두 원국 사이의 글자 관계(일주·년주 기준 교차). */
  relations: readonly SajuRelation[];
  /** 서로에게 무엇인지 — a 가 b 에게, b 가 a 에게. */
  mutual: { aToB: TenGod; bToA: TenGod };
}

// 받침 유무로 조사 선택(목·금 은 받침, 화·토·수 는 없음).
const josa = (word: string, withBatchim: string, without: string): string => {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return without;
  return (code - 0xac00) % 28 === 0 ? without : withBatchim;
};

const SAME_DIRECTION = (a: Branch, b: Branch): boolean => Math.floor(((a - 2 + 12) % 12) / 3) === Math.floor(((b - 2 + 12) % 12) / 3);

const branchPairScore = (a: Branch, b: Branch, max: number): { score: number; note: string } => {
  const unit = max / 25;
  if (isSixCombine(a, b)) return { score: 25 * unit, note: '육합 — 서로를 묶어 주는 짝이에요.' };
  if (halfCombineOf(a, b)) return { score: 25 * unit, note: '삼합 — 같은 국(局)으로 힘이 모여요.' };
  if (isClash(a, b)) return { score: 3 * unit, note: '충 — 정면으로 부딪히기 쉬워 거리 조절이 필요해요.' };
  if (isPunish(a, b)) return { score: 4 * unit, note: '형 — 마찰이 잦을 수 있어요.' };
  if (isWonjin(a, b)) return { score: 4 * unit, note: '원진 — 이유 없이 어긋나기 쉬워요.' };
  if (isHarm(a, b)) return { score: 6 * unit, note: '해 — 가까울수록 서운함이 생기기 쉬워요.' };
  if (a === b) return { score: 14 * unit, note: '같은 글자 — 닮은 점이 많아요.' };
  if (SAME_DIRECTION(a, b)) return { score: 18 * unit, note: '같은 계절 — 결이 비슷해요.' };
  return { score: 12 * unit, note: '특별한 합·충 없이 무난해요.' };
};

const SPOUSE_GOD_SCORE: Record<TenGod, number> = {
  jeonggwan: 7.5, jeongjae: 7.5, jeongin: 5, siksin: 5, bigyeon: 4, pyeongwan: 4, pyeonjae: 4, pyeonin: 3, geopjae: 2, sanggwan: 2,
};

/** 두 사주의 궁합. */
export const matchCharts = (a: SajuChart, b: SajuChart): SajuMatchResult => {
  const breakdown: SajuMatchBreakdown[] = [];
  const da = a.dayMaster;
  const db = b.dayMaster;

  // 일간 25
  let dm: SajuMatchBreakdown;
  if (isStemCombine(da.index, db.index)) dm = { key: 'dayMaster', label: '일간(나와 상대)', score: 25, max: 25, note: `${da.ko}${db.ko} 천간합 — 서로 끌리고 잘 맞물려요.` };
  else if (wuxingGenerates(da.element) === db.element || wuxingGenerates(db.element) === da.element) {
    const giver = wuxingGenerates(da.element) === db.element ? a : b;
    const from = SAJU_WUXING_META[giver.dayMaster.element].ko;
    const to = SAJU_WUXING_META[wuxingGenerates(giver.dayMaster.element)].ko;
    dm = { key: 'dayMaster', label: '일간(나와 상대)', score: 18, max: 25, note: `${from}${josa(from, '이', '가')} ${to}${josa(to, '을', '를')} 낳는 상생 — 한쪽이 다른 쪽을 키워 줘요.` };
  } else if (da.element === db.element) dm = { key: 'dayMaster', label: '일간(나와 상대)', score: 14, max: 25, note: '같은 오행 — 닮아서 편하지만 부딪히면 양보가 어려워요.' };
  else dm = { key: 'dayMaster', label: '일간(나와 상대)', score: 8, max: 25, note: `${SAJU_WUXING_META[da.element].ko}과 ${SAJU_WUXING_META[db.element].ko}의 상극 — 다른 만큼 배우지만 조율이 필요해요.` };
  breakdown.push(dm);

  // 일지 25
  const dbr = branchPairScore(a.pillars.day.branch, b.pillars.day.branch, 25);
  breakdown.push({ key: 'dayBranch', label: '일지(배우자 자리)', score: Math.round(dbr.score), max: 25, note: dbr.note });

  // 띠 15
  const zb = branchPairScore(a.pillars.year.branch, b.pillars.year.branch, 15);
  breakdown.push({ key: 'zodiac', label: `띠(${a.zodiac.animal}·${b.zodiac.animal})`, score: Math.round(zb.score), max: 15, note: zb.note });

  // 오행 보완 20
  const scoreOf = (c: SajuChart, e: Wuxing): number => c.elements.find((x) => x.element === e)?.score ?? 0;
  let comp = 0;
  const filled: string[] = [];
  for (const e of SAJU_WUXING) {
    if (scoreOf(a, e) < 0.6 && scoreOf(b, e) >= 1.5) { comp += 5; filled.push(`상대의 ${SAJU_WUXING_META[e].ko}이 내 빈 곳을 채움`); }
    if (scoreOf(b, e) < 0.6 && scoreOf(a, e) >= 1.5) { comp += 5; filled.push(`내 ${SAJU_WUXING_META[e].ko}이 상대의 빈 곳을 채움`); }
  }
  comp = Math.min(20, comp);
  if (comp === 0) comp = 6;
  breakdown.push({ key: 'elements', label: '오행 보완', score: comp, max: 20, note: filled.length ? filled.join(', ') : '서로 채워 주는 오행은 뚜렷하지 않아요.' });

  // 십신 15
  const aToB = tenGodOf(db.index, da.index); // 상대 입장에서 나
  const bToA = tenGodOf(da.index, db.index); // 내 입장에서 상대
  const tg = Math.min(15, SPOUSE_GOD_SCORE[aToB] + SPOUSE_GOD_SCORE[bToA]);
  breakdown.push({ key: 'tenGod', label: '서로에게 어떤 존재', score: Math.round(tg), max: 15, note: `상대는 나에게 ${SAJU_TEN_GOD_META[bToA].ko}, 나는 상대에게 ${SAJU_TEN_GOD_META[aToB].ko}예요.` });

  const score = Math.round(breakdown.reduce((s, x) => s + x.score, 0));
  const grade: SajuMatchGrade = score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 55 ? 'fair' : score >= 40 ? 'effort' : 'caution';

  // 교차 관계(일주·년주).
  const relations = findRelations([
    { key: 'day', stem: a.pillars.day.stem, branch: a.pillars.day.branch },
    { key: 'year', stem: a.pillars.year.stem, branch: a.pillars.year.branch },
    { key: 'luck', stem: b.pillars.day.stem, branch: b.pillars.day.branch },
  ]).filter((r) => r.pillars.includes('luck'));

  return { score, grade, gradeKo: SAJU_MATCH_GRADE_LABEL[grade], breakdown, relations, mutual: { aToB, bToA } };
};

/** 일간 오행 관계 한 줄(표시용). */
export const dayMasterRelationLabel = (a: Wuxing, b: Wuxing): string => {
  if (a === b) return '같은 기운';
  if (wuxingGenerates(a) === b) return `${SAJU_WUXING_META[a].ko}생${SAJU_WUXING_META[b].ko}`;
  if (wuxingGenerates(b) === a) return `${SAJU_WUXING_META[b].ko}생${SAJU_WUXING_META[a].ko}`;
  if (wuxingControls(a) === b) return `${SAJU_WUXING_META[a].ko}극${SAJU_WUXING_META[b].ko}`;
  return `${SAJU_WUXING_META[b].ko}극${SAJU_WUXING_META[a].ko}`;
};

export const stemKoOf = (i: number): string => stemMeta(i).ko;
