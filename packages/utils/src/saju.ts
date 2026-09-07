// 사주 엔진 — 천간·지지·오행·60갑자, 사주팔자 산출, 십신·지장간·십이운성·공망·신살·합충형파해,
// 오행 분포·신강약·보완 오행, 대운·세운·월운·일진. 순수 함수(웹·앱·friendly 공용).
//
// 계산 규칙은 docs/PLAN-saju.md "엔진 설계" 가 단일 출처다. 학파 차이 항목의 기본값:
//  - 진태양시(경도) 보정 켬(sajuCalendar), 일주 경계는 보정 후 23:00(자시 시작), 야자시 옵션은 끔.
//  - 지지의 십신은 정기(본기) 천간 기준. 오행 점수는 천간 1.0 / 지지 정기 1.0·중기 0.3·여기 0.2.
//  - 대운 수는 절기까지 일수 ÷ 3 (1일 = 4개월). 양남음녀 순행.
// 시간 모름(hour null)이면 시주 없이 3기둥으로 계산하고 시주 의존 항목은 null.

import {
  civilFromMinutes,
  findMonthTermAt,
  formatCivilDate,
  ipchunUtcMinutes,
  isLunarYearSupported,
  isSolarTermYearSupported,
  isValidCivilDate,
  lunarToSolar,
  MINUTES_PER_DAY,
  monthBranchOfTerm,
  resolveKoreaWallClock,
  sajuDayNumber,
  SEOUL_MEAN_SOLAR_OFFSET_MINUTES,
  solarToLunar,
  type CivilDate,
  type CivilDateTime,
  type LunarDate,
} from './sajuCalendar.js';

// ── 기본 데이터 ──────────────────────────────────────────────────────────────

export type Wuxing = 'wood' | 'fire' | 'earth' | 'metal' | 'water';
export const SAJU_WUXING: readonly Wuxing[] = ['wood', 'fire', 'earth', 'metal', 'water'];

export interface WuxingMeta {
  id: Wuxing;
  ko: string;
  hanja: string;
  /** 무대·표 색(hex). */
  color: string;
}
export const SAJU_WUXING_META: Record<Wuxing, WuxingMeta> = {
  wood: { id: 'wood', ko: '목', hanja: '木', color: '#3f9b7a' },
  fire: { id: 'fire', ko: '화', hanja: '火', color: '#d9482b' },
  earth: { id: 'earth', ko: '토', hanja: '土', color: '#c9973a' },
  metal: { id: 'metal', ko: '금', hanja: '金', color: '#dcdcd2' },
  water: { id: 'water', ko: '수', hanja: '水', color: '#2f4d7a' },
};

/** 상생: 목→화→토→금→수→목. */
export const wuxingGenerates = (a: Wuxing): Wuxing => (SAJU_WUXING[(SAJU_WUXING.indexOf(a) + 1) % 5] as Wuxing);
/** 상극: 목→토→수→화→금→목. */
export const wuxingControls = (a: Wuxing): Wuxing => (SAJU_WUXING[(SAJU_WUXING.indexOf(a) + 2) % 5] as Wuxing);
export const wuxingGeneratedBy = (a: Wuxing): Wuxing => (SAJU_WUXING[(SAJU_WUXING.indexOf(a) + 4) % 5] as Wuxing);
export const wuxingControlledBy = (a: Wuxing): Wuxing => (SAJU_WUXING[(SAJU_WUXING.indexOf(a) + 3) % 5] as Wuxing);

export type Stem = number; // 0..9
export type Branch = number; // 0..11

export interface StemMeta {
  index: Stem;
  ko: string;
  hanja: string;
  element: Wuxing;
  yang: boolean;
  /** 일간 캐릭터 상징(성격 풀이 앵커). */
  symbol: string;
}
export const SAJU_STEMS: readonly StemMeta[] = [
  { index: 0, ko: '갑', hanja: '甲', element: 'wood', yang: true, symbol: '큰 나무' },
  { index: 1, ko: '을', hanja: '乙', element: 'wood', yang: false, symbol: '풀과 덩굴' },
  { index: 2, ko: '병', hanja: '丙', element: 'fire', yang: true, symbol: '태양' },
  { index: 3, ko: '정', hanja: '丁', element: 'fire', yang: false, symbol: '등불' },
  { index: 4, ko: '무', hanja: '戊', element: 'earth', yang: true, symbol: '큰 산' },
  { index: 5, ko: '기', hanja: '己', element: 'earth', yang: false, symbol: '논밭' },
  { index: 6, ko: '경', hanja: '庚', element: 'metal', yang: true, symbol: '바위와 무쇠' },
  { index: 7, ko: '신', hanja: '辛', element: 'metal', yang: false, symbol: '보석' },
  { index: 8, ko: '임', hanja: '壬', element: 'water', yang: true, symbol: '바다' },
  { index: 9, ko: '계', hanja: '癸', element: 'water', yang: false, symbol: '이슬비' },
];

export interface BranchMeta {
  index: Branch;
  ko: string;
  hanja: string;
  element: Wuxing;
  yang: boolean;
  animal: string;
  /** 지장간 — 여기·(중기)·정기 순. 마지막이 정기(본기). */
  hidden: readonly Stem[];
  /** 시지 시작 시(보정 지방시). 자시 23시. */
  hourStart: number;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
}
export const SAJU_BRANCHES: readonly BranchMeta[] = [
  { index: 0, ko: '자', hanja: '子', element: 'water', yang: true, animal: '쥐', hidden: [8, 9], hourStart: 23, season: 'winter' },
  { index: 1, ko: '축', hanja: '丑', element: 'earth', yang: false, animal: '소', hidden: [9, 7, 5], hourStart: 1, season: 'winter' },
  { index: 2, ko: '인', hanja: '寅', element: 'wood', yang: true, animal: '호랑이', hidden: [4, 2, 0], hourStart: 3, season: 'spring' },
  { index: 3, ko: '묘', hanja: '卯', element: 'wood', yang: false, animal: '토끼', hidden: [0, 1], hourStart: 5, season: 'spring' },
  { index: 4, ko: '진', hanja: '辰', element: 'earth', yang: true, animal: '용', hidden: [1, 9, 4], hourStart: 7, season: 'spring' },
  { index: 5, ko: '사', hanja: '巳', element: 'fire', yang: false, animal: '뱀', hidden: [4, 6, 2], hourStart: 9, season: 'summer' },
  { index: 6, ko: '오', hanja: '午', element: 'fire', yang: true, animal: '말', hidden: [2, 5, 3], hourStart: 11, season: 'summer' },
  { index: 7, ko: '미', hanja: '未', element: 'earth', yang: false, animal: '양', hidden: [3, 1, 5], hourStart: 13, season: 'summer' },
  { index: 8, ko: '신', hanja: '申', element: 'metal', yang: true, animal: '원숭이', hidden: [4, 8, 6], hourStart: 15, season: 'autumn' },
  { index: 9, ko: '유', hanja: '酉', element: 'metal', yang: false, animal: '닭', hidden: [6, 7], hourStart: 17, season: 'autumn' },
  { index: 10, ko: '술', hanja: '戌', element: 'earth', yang: true, animal: '개', hidden: [7, 3, 4], hourStart: 19, season: 'autumn' },
  { index: 11, ko: '해', hanja: '亥', element: 'water', yang: false, animal: '돼지', hidden: [4, 0, 8], hourStart: 21, season: 'winter' },
];

export const stemMeta = (i: Stem): StemMeta => SAJU_STEMS[i] as StemMeta;
export const branchMeta = (i: Branch): BranchMeta => SAJU_BRANCHES[i] as BranchMeta;
export const mainHiddenStem = (branch: Branch): Stem => branchMeta(branch).hidden[branchMeta(branch).hidden.length - 1] as Stem;

/** 60갑자 index(0=갑자) → 천간·지지. */
export const stemOfGanzhi = (g: number): Stem => ((g % 10) + 10) % 10;
export const branchOfGanzhi = (g: number): Branch => ((g % 12) + 12) % 12;
/** 천간·지지 → 60갑자 index. 음양이 어긋나는 조합(예: 갑축)은 -1. */
export const ganzhiIndex = (stem: Stem, branch: Branch): number => {
  for (let g = 0; g < 60; g++) if (g % 10 === stem && g % 12 === branch) return g;
  return -1;
};
export const ganzhiKo = (g: number): string => `${stemMeta(stemOfGanzhi(g)).ko}${branchMeta(branchOfGanzhi(g)).ko}`;
export const ganzhiHanja = (g: number): string =>
  `${stemMeta(stemOfGanzhi(g)).hanja}${branchMeta(branchOfGanzhi(g)).hanja}`;

// ── 십신·십이운성·공망 ───────────────────────────────────────────────────────

export type TenGod =
  | 'bigyeon' | 'geopjae' // 비견·겁재(비겁)
  | 'siksin' | 'sanggwan' // 식신·상관(식상)
  | 'pyeonjae' | 'jeongjae' // 편재·정재(재성)
  | 'pyeongwan' | 'jeonggwan' // 편관·정관(관성)
  | 'pyeonin' | 'jeongin'; // 편인·정인(인성)
export const SAJU_TEN_GODS: readonly TenGod[] = [
  'bigyeon', 'geopjae', 'siksin', 'sanggwan', 'pyeonjae', 'jeongjae', 'pyeongwan', 'jeonggwan', 'pyeonin', 'jeongin',
];
export type TenGodGroup = 'self' | 'output' | 'wealth' | 'power' | 'resource';
export const SAJU_TEN_GOD_META: Record<TenGod, { ko: string; hanja: string; group: TenGodGroup; groupKo: string }> = {
  bigyeon: { ko: '비견', hanja: '比肩', group: 'self', groupKo: '비겁' },
  geopjae: { ko: '겁재', hanja: '劫財', group: 'self', groupKo: '비겁' },
  siksin: { ko: '식신', hanja: '食神', group: 'output', groupKo: '식상' },
  sanggwan: { ko: '상관', hanja: '傷官', group: 'output', groupKo: '식상' },
  pyeonjae: { ko: '편재', hanja: '偏財', group: 'wealth', groupKo: '재성' },
  jeongjae: { ko: '정재', hanja: '正財', group: 'wealth', groupKo: '재성' },
  pyeongwan: { ko: '편관', hanja: '偏官', group: 'power', groupKo: '관성' },
  jeonggwan: { ko: '정관', hanja: '正官', group: 'power', groupKo: '관성' },
  pyeonin: { ko: '편인', hanja: '偏印', group: 'resource', groupKo: '인성' },
  jeongin: { ko: '정인', hanja: '正印', group: 'resource', groupKo: '인성' },
};

/** 일간 기준 대상 천간의 십신. */
export const tenGodOf = (dayMaster: Stem, target: Stem): TenGod => {
  const d = stemMeta(dayMaster);
  const t = stemMeta(target);
  const same = d.yang === t.yang;
  if (d.element === t.element) return same ? 'bigyeon' : 'geopjae';
  if (wuxingGenerates(d.element) === t.element) return same ? 'siksin' : 'sanggwan';
  if (wuxingControls(d.element) === t.element) return same ? 'pyeonjae' : 'jeongjae';
  if (wuxingControls(t.element) === d.element) return same ? 'pyeongwan' : 'jeonggwan';
  return same ? 'pyeonin' : 'jeongin';
};

/** 오행 관계로 본 십신 그룹(일간 → 대상 오행). */
export const tenGodGroupOfElement = (dayMaster: Wuxing, target: Wuxing): TenGodGroup => {
  if (dayMaster === target) return 'self';
  if (wuxingGenerates(dayMaster) === target) return 'output';
  if (wuxingControls(dayMaster) === target) return 'wealth';
  if (wuxingControls(target) === dayMaster) return 'power';
  return 'resource';
};
/** 십신 그룹 → 그 그룹의 오행(일간 기준). */
export const elementOfTenGodGroup = (dayMaster: Wuxing, group: TenGodGroup): Wuxing => {
  switch (group) {
    case 'self':
      return dayMaster;
    case 'output':
      return wuxingGenerates(dayMaster);
    case 'wealth':
      return wuxingControls(dayMaster);
    case 'power':
      return wuxingControlledBy(dayMaster);
    case 'resource':
      return wuxingGeneratedBy(dayMaster);
  }
};

export const SAJU_TWELVE_STAGES = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양'] as const;
export const SAJU_TWELVE_STAGES_HANJA = ['長生', '沐浴', '冠帶', '建祿', '帝旺', '衰', '病', '死', '墓', '絶', '胎', '養'] as const;
export type TwelveStage = (typeof SAJU_TWELVE_STAGES)[number];
// 장생 지지: 양간 순행(갑 해·병 인·무 인·경 사·임 신), 음간 역행(을 오·정 유·기 유·신 자·계 묘).
const STAGE_START: readonly Branch[] = [11, 6, 2, 9, 2, 9, 5, 0, 8, 3];
/** 일간이 지지에서 갖는 십이운성. */
export const twelveStageOf = (dayMaster: Stem, branch: Branch): TwelveStage => {
  const start = STAGE_START[dayMaster] as Branch;
  const yang = stemMeta(dayMaster).yang;
  const k = yang ? (branch - start + 12) % 12 : (start - branch + 12) % 12;
  return SAJU_TWELVE_STAGES[k] as TwelveStage;
};

/** 일주 60갑자의 공망 지지 2개. */
export const voidBranchesOf = (dayGanzhi: number): [Branch, Branch] => {
  const q = Math.floor(dayGanzhi / 10);
  return [((10 - 2 * q) % 12 + 12) % 12, ((11 - 2 * q) % 12 + 12) % 12];
};

// ── 관계(합·충·형·파·해·원진) ────────────────────────────────────────────────

export type RelationType =
  | 'stem-combine' | 'stem-clash'
  | 'six-combine' | 'three-combine' | 'half-combine' | 'directional'
  | 'clash' | 'punish' | 'self-punish' | 'break' | 'harm' | 'wonjin';
export const SAJU_RELATION_META: Record<RelationType, { ko: string; hanja: string; positive: boolean }> = {
  'stem-combine': { ko: '천간합', hanja: '天干合', positive: true },
  'stem-clash': { ko: '천간충', hanja: '天干沖', positive: false },
  'six-combine': { ko: '육합', hanja: '六合', positive: true },
  'three-combine': { ko: '삼합', hanja: '三合', positive: true },
  'half-combine': { ko: '반합', hanja: '半合', positive: true },
  directional: { ko: '방합', hanja: '方合', positive: true },
  clash: { ko: '충', hanja: '沖', positive: false },
  punish: { ko: '형', hanja: '刑', positive: false },
  'self-punish': { ko: '자형', hanja: '自刑', positive: false },
  break: { ko: '파', hanja: '破', positive: false },
  harm: { ko: '해', hanja: '害', positive: false },
  wonjin: { ko: '원진', hanja: '怨嗔', positive: false },
};

export type PillarKey = 'year' | 'month' | 'day' | 'hour';
export const SAJU_PILLAR_KEYS: readonly PillarKey[] = ['year', 'month', 'day', 'hour'];
export const SAJU_PILLAR_LABEL: Record<PillarKey, string> = { year: '년주', month: '월주', day: '일주', hour: '시주' };

// 삼합 국(局): 인오술 화 / 신자진 수 / 사유축 금 / 해묘미 목. [생지, 왕지, 묘지]
export const SAJU_THREE_COMBINES: ReadonlyArray<{ branches: readonly [Branch, Branch, Branch]; element: Wuxing }> = [
  { branches: [2, 6, 10], element: 'fire' },
  { branches: [8, 0, 4], element: 'water' },
  { branches: [5, 9, 1], element: 'metal' },
  { branches: [11, 3, 7], element: 'wood' },
];
const DIRECTIONALS: ReadonlyArray<{ branches: readonly [Branch, Branch, Branch]; element: Wuxing }> = [
  { branches: [2, 3, 4], element: 'wood' },
  { branches: [5, 6, 7], element: 'fire' },
  { branches: [8, 9, 10], element: 'metal' },
  { branches: [11, 0, 1], element: 'water' },
];
// 육합 화기(化氣): 자축 토·인해 목·묘술 화·진유 금·사신 수·오미 화(작은 지지 기준).
const SIX_COMBINE_ELEMENT: Record<number, Wuxing> = { 0: 'earth', 2: 'wood', 3: 'fire', 4: 'metal', 5: 'water', 6: 'fire' };
export const sixCombineElement = (a: Branch, b: Branch): Wuxing => SIX_COMBINE_ELEMENT[Math.min(a, b)] ?? 'earth';
const PUNISH_PAIRS: ReadonlyArray<[Branch, Branch]> = [[2, 5], [5, 8], [2, 8], [1, 10], [10, 7], [1, 7], [0, 3]];
const SELF_PUNISH: readonly Branch[] = [4, 6, 9, 11];
const BREAK_PAIRS: ReadonlyArray<[Branch, Branch]> = [[0, 9], [1, 4], [2, 11], [3, 6], [5, 8], [10, 7]];
const HARM_PAIRS: ReadonlyArray<[Branch, Branch]> = [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]];
const WONJIN_PAIRS: ReadonlyArray<[Branch, Branch]> = [[0, 7], [1, 6], [2, 9], [3, 8], [4, 11], [5, 10]];
const pairHas = (pairs: ReadonlyArray<[Branch, Branch]>, a: Branch, b: Branch): boolean =>
  pairs.some(([p, q]) => (p === a && q === b) || (p === b && q === a));

export const isSixCombine = (a: Branch, b: Branch): boolean => a !== b && (a + b) % 12 === 1;
export const isClash = (a: Branch, b: Branch): boolean => (a + 6) % 12 === b;
export const isPunish = (a: Branch, b: Branch): boolean => pairHas(PUNISH_PAIRS, a, b);
export const isBreak = (a: Branch, b: Branch): boolean => pairHas(BREAK_PAIRS, a, b);
export const isHarm = (a: Branch, b: Branch): boolean => pairHas(HARM_PAIRS, a, b);
export const isWonjin = (a: Branch, b: Branch): boolean => pairHas(WONJIN_PAIRS, a, b);
export const isStemCombine = (a: Stem, b: Stem): boolean => (a + 5) % 10 === b || (b + 5) % 10 === a;
export const isStemClash = (a: Stem, b: Stem): boolean => Math.abs(a - b) === 6 && Math.min(a, b) < 4;
export const stemCombineElement = (a: Stem): Wuxing => (['earth', 'metal', 'water', 'wood', 'fire'] as const)[a % 5] as Wuxing;
/** 두 지지가 같은 삼합 국에 속하고 왕지를 포함하면 반합. */
export const halfCombineOf = (a: Branch, b: Branch): Wuxing | null => {
  for (const tc of SAJU_THREE_COMBINES) {
    const [, king] = tc.branches;
    if (tc.branches.includes(a) && tc.branches.includes(b) && a !== b && (a === king || b === king)) return tc.element;
  }
  return null;
};

export interface SajuRelation {
  type: RelationType;
  /** 관계에 참여한 기둥. 세운·일진 등 원국 밖 글자는 'luck'. */
  pillars: ReadonlyArray<PillarKey | 'luck'>;
  /** 참여 글자(한글). */
  chars: readonly string[];
  element?: Wuxing;
  label: string;
}

interface CharAt {
  key: PillarKey | 'luck';
  stem: Stem;
  branch: Branch;
}

/** 글자 집합(원국 + 선택적 운 글자) 사이의 관계 전부. */
export const findRelations = (chars: readonly CharAt[]): SajuRelation[] => {
  const out: SajuRelation[] = [];
  const stemKo = (s: Stem): string => stemMeta(s).ko;
  const brKo = (b: Branch): string => branchMeta(b).ko;
  const seen = new Set<string>();
  const push = (r: SajuRelation): void => {
    const key = `${r.type}:${[...r.pillars].sort().join(',')}:${r.chars.join('')}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const a = chars[i] as CharAt;
      const b = chars[j] as CharAt;
      if (isStemCombine(a.stem, b.stem)) {
        const el = stemCombineElement(Math.min(a.stem, b.stem) % 5 === a.stem % 5 ? a.stem : b.stem);
        push({ type: 'stem-combine', pillars: [a.key, b.key], chars: [stemKo(a.stem), stemKo(b.stem)], element: el, label: `${stemKo(a.stem)}${stemKo(b.stem)}합 ${SAJU_WUXING_META[el].ko}` });
      }
      if (isStemClash(a.stem, b.stem)) push({ type: 'stem-clash', pillars: [a.key, b.key], chars: [stemKo(a.stem), stemKo(b.stem)], label: `${stemKo(a.stem)}${stemKo(b.stem)}충` });
      if (isSixCombine(a.branch, b.branch)) {
        const el = sixCombineElement(a.branch, b.branch);
        push({ type: 'six-combine', pillars: [a.key, b.key], chars: [brKo(a.branch), brKo(b.branch)], element: el, label: `${brKo(a.branch)}${brKo(b.branch)} 육합` });
      }
      if (isClash(a.branch, b.branch)) push({ type: 'clash', pillars: [a.key, b.key], chars: [brKo(a.branch), brKo(b.branch)], label: `${brKo(a.branch)}${brKo(b.branch)}충` });
      if (isPunish(a.branch, b.branch)) push({ type: 'punish', pillars: [a.key, b.key], chars: [brKo(a.branch), brKo(b.branch)], label: `${brKo(a.branch)}${brKo(b.branch)}형` });
      if (a.branch === b.branch && SELF_PUNISH.includes(a.branch)) push({ type: 'self-punish', pillars: [a.key, b.key], chars: [brKo(a.branch), brKo(b.branch)], label: `${brKo(a.branch)}${brKo(b.branch)} 자형` });
      if (isBreak(a.branch, b.branch)) push({ type: 'break', pillars: [a.key, b.key], chars: [brKo(a.branch), brKo(b.branch)], label: `${brKo(a.branch)}${brKo(b.branch)}파` });
      if (isHarm(a.branch, b.branch)) push({ type: 'harm', pillars: [a.key, b.key], chars: [brKo(a.branch), brKo(b.branch)], label: `${brKo(a.branch)}${brKo(b.branch)}해` });
      if (isWonjin(a.branch, b.branch)) push({ type: 'wonjin', pillars: [a.key, b.key], chars: [brKo(a.branch), brKo(b.branch)], label: `${brKo(a.branch)}${brKo(b.branch)} 원진` });
    }
  }
  // 삼합·방합(3글자) — 있으면 그 글자 쌍의 반합은 생략.
  const branchesOf = (set: readonly Branch[]): CharAt[][] => {
    const groups: CharAt[][] = [];
    const found = set.map((b) => chars.filter((c) => c.branch === b));
    if (found.every((f) => f.length > 0)) groups.push(found.map((f) => f[0] as CharAt));
    return groups;
  };
  const tripleKeys = new Set<string>();
  for (const tc of SAJU_THREE_COMBINES) {
    for (const g of branchesOf(tc.branches)) {
      push({ type: 'three-combine', pillars: g.map((c) => c.key), chars: g.map((c) => brKo(c.branch)), element: tc.element, label: `${tc.branches.map(brKo).join('')} 삼합 ${SAJU_WUXING_META[tc.element].ko}국` });
      g.forEach((c) => tripleKeys.add(`${c.key}:${c.branch}`));
    }
  }
  for (const dc of DIRECTIONALS) {
    for (const g of branchesOf(dc.branches)) {
      push({ type: 'directional', pillars: g.map((c) => c.key), chars: g.map((c) => brKo(c.branch)), element: dc.element, label: `${dc.branches.map(brKo).join('')} 방합 ${SAJU_WUXING_META[dc.element].ko}국` });
    }
  }
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const a = chars[i] as CharAt;
      const b = chars[j] as CharAt;
      const el = halfCombineOf(a.branch, b.branch);
      if (!el) continue;
      if (tripleKeys.has(`${a.key}:${a.branch}`) && tripleKeys.has(`${b.key}:${b.branch}`)) continue;
      push({ type: 'half-combine', pillars: [a.key, b.key], chars: [brKo(a.branch), brKo(b.branch)], element: el, label: `${brKo(a.branch)}${brKo(b.branch)} 반합 ${SAJU_WUXING_META[el].ko}` });
    }
  }
  return out;
};

// ── 신살 ─────────────────────────────────────────────────────────────────────

export type StarId =
  | 'cheoneul' | 'munchang' | 'yangin' | 'dohwa' | 'yeokma' | 'hwagae' | 'goegang' | 'baekho'
  // 7차 확장 — 홍염·귀문관·천라지망·금여·천덕귀인·월덕귀인
  | 'hongyeom' | 'gwimun' | 'cheonra' | 'geumyeo' | 'cheondeok' | 'woldeok';
export const SAJU_STAR_META: Record<StarId, { ko: string; hanja: string; positive: boolean }> = {
  cheoneul: { ko: '천을귀인', hanja: '天乙貴人', positive: true },
  munchang: { ko: '문창귀인', hanja: '文昌貴人', positive: true },
  yangin: { ko: '양인', hanja: '羊刃', positive: false },
  dohwa: { ko: '도화', hanja: '桃花', positive: true },
  yeokma: { ko: '역마', hanja: '驛馬', positive: true },
  hwagae: { ko: '화개', hanja: '華蓋', positive: true },
  goegang: { ko: '괴강', hanja: '魁罡', positive: false },
  baekho: { ko: '백호', hanja: '白虎', positive: false },
  hongyeom: { ko: '홍염', hanja: '紅艶', positive: true },
  gwimun: { ko: '귀문관', hanja: '鬼門關', positive: false },
  cheonra: { ko: '천라지망', hanja: '天羅地網', positive: false },
  geumyeo: { ko: '금여', hanja: '金輿', positive: true },
  cheondeok: { ko: '천덕귀인', hanja: '天德貴人', positive: true },
  woldeok: { ko: '월덕귀인', hanja: '月德貴人', positive: true },
};
// 일간 → 천을귀인 지지.
const CHEONEUL: readonly (readonly Branch[])[] = [[1, 7], [0, 8], [11, 9], [11, 9], [1, 7], [0, 8], [1, 7], [2, 6], [5, 3], [5, 3]];
const MUNCHANG: readonly Branch[] = [5, 6, 8, 9, 8, 9, 11, 0, 2, 3];
const YANGIN: Record<number, Branch> = { 0: 3, 2: 6, 4: 6, 6: 9, 8: 0 };
const GOEGANG_GANZHI = [16, 46, 28, 34]; // 경진·경술·임진·무술
const BAEKHO_GANZHI = [40, 31, 22, 13, 4, 58, 49]; // 갑진·을미·병술·정축·무진·임술·계축
// 삼합 기준 도화·역마·화개: [인오술, 신자진, 사유축, 해묘미] 순.
const DOHWA: readonly Branch[] = [3, 9, 6, 0];
const YEOKMA: readonly Branch[] = [8, 2, 11, 5];
const HWAGAE: readonly Branch[] = [10, 4, 1, 7];
// 일간 → 홍염 지지(갑오·을신·병인·정미·무진·기진·경술·신유·임자·계신), 금여 지지(갑진·을사·병미·정신·무미·기신·경술·신해·임축·계인).
const HONGYEOM: readonly Branch[] = [6, 8, 2, 7, 4, 4, 10, 9, 0, 8];
const GEUMYEO: readonly Branch[] = [4, 5, 7, 8, 7, 8, 10, 11, 1, 2];
// 귀문관 지지 쌍(자유·축오·인미·묘신·진해·사술) — 일지와 다른 기둥.
const GWIMUN_PAIRS: ReadonlyArray<readonly [Branch, Branch]> = [[0, 9], [1, 6], [2, 7], [3, 8], [4, 11], [5, 10]];
// 천덕귀인 — 월지 → 천간(s) 또는 지지(b). 자:사(b) 축:경 인:정 묘:신(b) 진:임 사:신 오:해(b) 미:갑 신:계 유:인(b) 술:병 해:을.
const CHEONDEOK: ReadonlyArray<{ kind: 'stem' | 'branch'; v: number }> = [
  { kind: 'branch', v: 5 }, { kind: 'stem', v: 6 }, { kind: 'stem', v: 3 }, { kind: 'branch', v: 8 }, { kind: 'stem', v: 8 }, { kind: 'stem', v: 7 },
  { kind: 'branch', v: 11 }, { kind: 'stem', v: 0 }, { kind: 'stem', v: 9 }, { kind: 'branch', v: 2 }, { kind: 'stem', v: 2 }, { kind: 'stem', v: 1 },
];
// 월덕귀인 — 월지 삼합(인오술 병·신자진 임·사유축 경·해묘미 갑) → 천간. SAJU_THREE_COMBINES 순서(화·수·금·목).
const WOLDEOK_BY_GROUP: readonly Stem[] = [2, 8, 6, 0];
const combineGroupOf = (b: Branch): number => SAJU_THREE_COMBINES.findIndex((tc) => tc.branches.includes(b));

export interface SajuStar {
  id: StarId;
  ko: string;
  hanja: string;
  positive: boolean;
  /** 신살이 붙은 기둥. */
  pillars: readonly PillarKey[];
}

// ── 사주 산출 ────────────────────────────────────────────────────────────────

export type SajuGender = 'M' | 'F';
export type SajuCalendarKind = 'solar' | 'lunar';

export interface SajuOptions {
  /** 서울 평균태양시 보정(기본 true). */
  solarTimeCorrection: boolean;
  /** 야자시 — 23시 이후를 당일 일주 + 다음날 시간 천간으로(기본 false = 23시부터 다음날). */
  lateRatHour: boolean;
}
export const SAJU_DEFAULT_OPTIONS: SajuOptions = { solarTimeCorrection: true, lateRatHour: false };

export interface SajuBirthInput {
  calendar: SajuCalendarKind;
  year: number;
  month: number;
  day: number;
  /** 음력 윤달. */
  leapMonth?: boolean;
  /** null = 시간 모름. */
  hour: number | null;
  minute?: number | null;
  gender: SajuGender;
  options?: Partial<SajuOptions>;
}

export const SAJU_SUPPORTED_YEARS = { from: 1900, to: 2050 } as const;

export type SajuInputErrorCode =
  | 'invalid_date'
  | 'invalid_time'
  | 'invalid_lunar'
  | 'out_of_range'
  | 'unsupported_lunar_year';

export class SajuInputError extends Error {
  constructor(
    public readonly code: SajuInputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SajuInputError';
  }
}

export interface SajuPillar {
  key: PillarKey;
  stem: Stem;
  branch: Branch;
  ganzhi: number;
  ko: string;
  hanja: string;
  stemElement: Wuxing;
  branchElement: Wuxing;
  /** 천간의 십신. 일주 천간(일간)은 null. */
  stemTenGod: TenGod | null;
  /** 지지 정기의 십신. */
  branchTenGod: TenGod;
  hidden: readonly Stem[];
  twelveStage: TwelveStage;
  isVoid: boolean;
}

export interface SajuElementScore {
  element: Wuxing;
  score: number;
  percent: number;
}

export type SajuStrengthLevel = 'strong' | 'balanced' | 'weak';

export interface SajuStrength {
  level: SajuStrengthLevel;
  /** 0~100. 높을수록 신강. */
  score: number;
  gotSeason: boolean; // 득령
  gotPlace: boolean; // 득지
  supportCount: number; // 득세(비겁·인성 글자 수, 월지·일지 제외)
}

export interface SajuFavorable {
  primary: Wuxing;
  secondary: Wuxing | null;
  reason: 'weak' | 'strong' | 'balanced' | 'season';
}

export interface SajuLuckPillar {
  index: number;
  ganzhi: number;
  stem: Stem;
  branch: Branch;
  ko: string;
  hanja: string;
  /** 만 나이 시작(소수 포함)·끝. */
  fromAge: number;
  toAge: number;
  fromYear: number;
  stemTenGod: TenGod;
  branchTenGod: TenGod;
  twelveStage: TwelveStage;
}

export interface SajuLuck {
  forward: boolean;
  /** 대운 수 — 시작 만 나이. */
  startAgeYears: number;
  startAgeMonths: number;
  pillars: readonly SajuLuckPillar[];
  /** 기준일 현재 대운 index(-1 = 아직 첫 대운 전). */
  currentIndex: number;
}

export interface SajuYearLuck {
  year: number;
  ganzhi: number;
  ko: string;
  hanja: string;
  stemTenGod: TenGod;
  branchTenGod: TenGod;
  twelveStage: TwelveStage;
  relations: readonly SajuRelation[];
}

export interface SajuChart {
  input: {
    calendar: SajuCalendarKind;
    year: number;
    month: number;
    day: number;
    leapMonth: boolean;
    hour: number | null;
    minute: number | null;
    gender: SajuGender;
    options: SajuOptions;
  };
  /** 양력 생년월일. */
  solar: CivilDate;
  /** 음력(표 범위 밖이면 null). */
  lunar: LunarDate | null;
  /** 출생 순간. hourKnown=false 면 정오 기준(년·월·일주만 의미). */
  instant: {
    utcMinutes: number;
    hourKnown: boolean;
    /** 벽시계 오프셋·서머타임. */
    offsetMinutes: number;
    dst: boolean;
    /** 일주·시주 결정에 쓴 보정 지방시. */
    corrected: CivilDateTime;
    correctionMinutes: number;
  };
  pillars: {
    year: SajuPillar;
    month: SajuPillar;
    day: SajuPillar;
    hour: SajuPillar | null;
  };
  dayMaster: StemMeta;
  /** 띠(년지). */
  zodiac: BranchMeta;
  /** 월지 계절. */
  season: BranchMeta['season'];
  tenGodCounts: Record<TenGod, number>;
  elements: readonly SajuElementScore[];
  excess: readonly Wuxing[];
  lacking: readonly Wuxing[];
  strength: SajuStrength;
  favorable: SajuFavorable;
  relations: readonly SajuRelation[];
  stars: readonly SajuStar[];
  voidBranches: readonly [Branch, Branch];
  luck: SajuLuck;
  yearLuck: SajuYearLuck;
  /** 기준 시각(오늘) — 만 나이·현재 대운·세운 계산 기준. */
  asOf: { utcMinutes: number; age: number; year: number };
  warnings: readonly string[];
}

const HOUR_BRANCH_OF = (hour: number): Branch => Math.floor(((hour + 1) % 24) / 2);
/** 월간: 갑기년 병인월 시작(오호둔). */
export const monthStemOf = (yearStem: Stem, monthBranch: Branch): Stem => {
  const fromIn = (monthBranch - 2 + 12) % 12;
  return ((yearStem % 5) * 2 + 2 + fromIn) % 10;
};
/** 시간: 갑기일 갑자시 시작(오서둔). */
export const hourStemOf = (dayStem: Stem, hourBranch: Branch): Stem => ((dayStem % 5) * 2 + hourBranch) % 10;
/** 년주 60갑자(입춘 기준 연도). 1984 = 갑자. */
export const yearGanzhiOf = (year: number): number => (((year - 4) % 60) + 60) % 60;
/** 일주 60갑자 — 1900-01-01 = 갑술(10). */
export const dayGanzhiOfDayNumber = (dayNumber: number): number => (((dayNumber + 10) % 60) + 60) % 60;

/** 입춘 기준 사주 연도(그 해 입춘 전이면 전년). */
export const sajuYearAt = (utcMinutes: number, civilYear: number): number => {
  const ip = ipchunUtcMinutes(civilYear);
  if (ip === null) return civilYear;
  return utcMinutes < ip ? civilYear - 1 : civilYear;
};

/** 어떤 UTC 순간의 년·월 60갑자(입춘·절 기준). 표 밖이면 null. */
export const yearMonthGanzhiAt = (utcMinutes: number): { year: number; yearGanzhi: number; monthGanzhi: number; termYear: number; termIndex: number } | null => {
  const hit = findMonthTermAt(utcMinutes);
  if (!hit) return null;
  const civil = civilFromMinutes(utcMinutes, 9 * 60);
  const sajuYear = sajuYearAt(utcMinutes, civil.year);
  const yg = yearGanzhiOf(sajuYear);
  const mb = monthBranchOfTerm(hit.index);
  const ms = monthStemOf(stemOfGanzhi(yg), mb);
  return { year: sajuYear, yearGanzhi: yg, monthGanzhi: ganzhiIndex(ms, mb), termYear: hit.year, termIndex: hit.index };
};

const makePillar = (key: PillarKey, ganzhi: number, dayMaster: Stem, voids: readonly Branch[]): SajuPillar => {
  const stem = stemOfGanzhi(ganzhi);
  const branch = branchOfGanzhi(ganzhi);
  return {
    key,
    stem,
    branch,
    ganzhi,
    ko: ganzhiKo(ganzhi),
    hanja: ganzhiHanja(ganzhi),
    stemElement: stemMeta(stem).element,
    branchElement: branchMeta(branch).element,
    stemTenGod: key === 'day' ? null : tenGodOf(dayMaster, stem),
    branchTenGod: tenGodOf(dayMaster, mainHiddenStem(branch)),
    hidden: branchMeta(branch).hidden,
    twelveStage: twelveStageOf(dayMaster, branch),
    isVoid: voids.includes(branch),
  };
};

const HIDDEN_WEIGHTS_3 = [0.2, 0.3, 1.0];
const HIDDEN_WEIGHTS_2 = [0.3, 1.0];

/** 오행 점수(천간 1.0, 지장간 가중). */
export const elementScoresOf = (pillars: readonly SajuPillar[]): SajuElementScore[] => {
  const score: Record<Wuxing, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const p of pillars) {
    score[p.stemElement] += 1;
    const w = p.hidden.length === 3 ? HIDDEN_WEIGHTS_3 : HIDDEN_WEIGHTS_2;
    p.hidden.forEach((s, i) => {
      score[stemMeta(s).element] += w[i] ?? 0;
    });
  }
  const total = SAJU_WUXING.reduce((a, e) => a + score[e], 0) || 1;
  return SAJU_WUXING.map((element) => ({
    element,
    score: Math.round(score[element] * 100) / 100,
    percent: Math.round((score[element] / total) * 1000) / 10,
  }));
};

const isSupport = (g: TenGod): boolean => SAJU_TEN_GOD_META[g].group === 'self' || SAJU_TEN_GOD_META[g].group === 'resource';

/** 신강·신약 — 월지 3 / 일지 2 / 시지 1.5 / 년지 1 / 천간 각 1 가중, 비겁·인성이면 득점. */
export const strengthOf = (pillars: { year: SajuPillar; month: SajuPillar; day: SajuPillar; hour: SajuPillar | null }): SajuStrength => {
  const parts: Array<{ god: TenGod; weight: number }> = [
    { god: pillars.month.branchTenGod, weight: 3 },
    { god: pillars.day.branchTenGod, weight: 2 },
    { god: pillars.year.branchTenGod, weight: 1 },
    { god: pillars.year.stemTenGod as TenGod, weight: 1 },
    { god: pillars.month.stemTenGod as TenGod, weight: 1 },
  ];
  if (pillars.hour) {
    parts.push({ god: pillars.hour.branchTenGod, weight: 1.5 });
    parts.push({ god: pillars.hour.stemTenGod as TenGod, weight: 1 });
  }
  const max = parts.reduce((a, p) => a + p.weight, 0);
  const got = parts.reduce((a, p) => a + (isSupport(p.god) ? p.weight : 0), 0);
  const score = Math.round((got / max) * 100);
  const supportCount = parts.slice(2).filter((p) => isSupport(p.god)).length;
  return {
    level: score >= 55 ? 'strong' : score <= 35 ? 'weak' : 'balanced',
    score,
    gotSeason: isSupport(pillars.month.branchTenGod),
    gotPlace: isSupport(pillars.day.branchTenGod),
    supportCount,
  };
};

/** 보완 오행 — 억부 + 조후 근사. */
export const favorableOf = (dayMaster: Wuxing, strength: SajuStrength, elements: readonly SajuElementScore[], season: BranchMeta['season']): SajuFavorable => {
  const scoreOf = (e: Wuxing): number => elements.find((x) => x.element === e)?.score ?? 0;
  const lowestOf = (cands: Wuxing[]): Wuxing[] => [...cands].sort((a, b) => scoreOf(a) - scoreOf(b));
  let primary: Wuxing;
  let secondary: Wuxing | null;
  let reason: SajuFavorable['reason'];
  if (strength.level === 'weak') {
    primary = elementOfTenGodGroup(dayMaster, 'resource');
    secondary = dayMaster;
    reason = 'weak';
  } else if (strength.level === 'strong') {
    const [a, b] = lowestOf([
      elementOfTenGodGroup(dayMaster, 'output'),
      elementOfTenGodGroup(dayMaster, 'wealth'),
      elementOfTenGodGroup(dayMaster, 'power'),
    ]);
    primary = a as Wuxing;
    secondary = b ?? null;
    reason = 'strong';
  } else {
    const [a, b] = lowestOf([...SAJU_WUXING]);
    primary = a as Wuxing;
    secondary = b ?? null;
    reason = 'balanced';
  }
  // 조후: 겨울생인데 화가 거의 없거나, 여름생인데 수가 거의 없으면 그 오행을 앞세운다.
  const seasonal: Wuxing | null = season === 'winter' ? 'fire' : season === 'summer' ? 'water' : null;
  if (seasonal && scoreOf(seasonal) < 0.5 && primary !== seasonal) {
    secondary = primary;
    primary = seasonal;
    reason = 'season';
  }
  return { primary, secondary, reason };
};

const findStars = (pillars: { year: SajuPillar; month: SajuPillar; day: SajuPillar; hour: SajuPillar | null }): SajuStar[] => {
  const list = [pillars.year, pillars.month, pillars.day, ...(pillars.hour ? [pillars.hour] : [])];
  const dm = pillars.day.stem;
  const out: SajuStar[] = [];
  const add = (id: StarId, keys: PillarKey[]): void => {
    if (keys.length === 0) return;
    const m = SAJU_STAR_META[id];
    out.push({ id, ko: m.ko, hanja: m.hanja, positive: m.positive, pillars: keys });
  };
  add('cheoneul', list.filter((p) => (CHEONEUL[dm] ?? []).includes(p.branch)).map((p) => p.key));
  add('munchang', list.filter((p) => MUNCHANG[dm] === p.branch).map((p) => p.key));
  if (YANGIN[dm] !== undefined) add('yangin', list.filter((p) => YANGIN[dm] === p.branch).map((p) => p.key));
  // 도화·역마·화개는 년지·일지 삼합 기준으로 다른 기둥을 본다.
  const bases = [pillars.year.branch, pillars.day.branch];
  const byBase = (table: readonly Branch[]): PillarKey[] => {
    const keys = new Set<PillarKey>();
    for (const base of bases) {
      const g = combineGroupOf(base);
      if (g < 0) continue;
      for (const p of list) if (p.branch === table[g]) keys.add(p.key);
    }
    return [...keys];
  };
  add('dohwa', byBase(DOHWA));
  add('yeokma', byBase(YEOKMA));
  add('hwagae', byBase(HWAGAE));
  if (GOEGANG_GANZHI.includes(pillars.day.ganzhi)) add('goegang', ['day']);
  add('baekho', list.filter((p) => BAEKHO_GANZHI.includes(p.ganzhi)).map((p) => p.key));
  // 7차 확장.
  add('hongyeom', list.filter((p) => p.key !== 'day' && HONGYEOM[dm] === p.branch).map((p) => p.key));
  add('geumyeo', list.filter((p) => GEUMYEO[dm] === p.branch).map((p) => p.key));
  const dayB = pillars.day.branch;
  add('gwimun', list.filter((p) => p.key !== 'day' && GWIMUN_PAIRS.some(([a, b]) => (a === dayB && b === p.branch) || (b === dayB && a === p.branch))).map((p) => p.key));
  const has = (b: Branch): PillarKey[] => list.filter((p) => p.branch === b).map((p) => p.key);
  const cheonra = has(10).length && has(11).length ? [...has(10), ...has(11)] : [];
  const jimang = has(4).length && has(5).length ? [...has(4), ...has(5)] : [];
  add('cheonra', [...new Set([...cheonra, ...jimang])]);
  const cd = CHEONDEOK[pillars.month.branch];
  if (cd) add('cheondeok', list.filter((p) => (cd.kind === 'stem' ? p.stem === cd.v : p.branch === cd.v)).map((p) => p.key));
  const wg = combineGroupOf(pillars.month.branch);
  if (wg >= 0) add('woldeok', list.filter((p) => p.stem === WOLDEOK_BY_GROUP[wg]).map((p) => p.key));
  return out;
};

const normalizeInput = (input: SajuBirthInput): SajuChart['input'] & { solar: CivilDate; lunar: LunarDate | null } => {
  const options: SajuOptions = { ...SAJU_DEFAULT_OPTIONS, ...(input.options ?? {}) };
  const leapMonth = !!input.leapMonth;
  const minute = input.hour === null ? null : (input.minute ?? 0);
  if (input.hour !== null && (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23)) {
    throw new SajuInputError('invalid_time', '시간은 0~23 사이여야 합니다.');
  }
  if (minute !== null && (!Number.isInteger(minute) || minute < 0 || minute > 59)) {
    throw new SajuInputError('invalid_time', '분은 0~59 사이여야 합니다.');
  }
  let solar: CivilDate;
  let lunar: LunarDate | null;
  if (input.calendar === 'lunar') {
    if (!isLunarYearSupported(input.year)) {
      throw new SajuInputError('unsupported_lunar_year', `음력은 ${SAJU_SUPPORTED_YEARS.from}~${SAJU_SUPPORTED_YEARS.to}년만 지원합니다.`);
    }
    const s = lunarToSolar(input.year, input.month, input.day, leapMonth);
    if (!s) throw new SajuInputError('invalid_lunar', '없는 음력 날짜입니다(윤달·30일 여부를 확인해 주세요).');
    solar = s;
    lunar = { year: input.year, month: input.month, day: input.day, leap: leapMonth };
  } else {
    if (!isValidCivilDate(input.year, input.month, input.day)) throw new SajuInputError('invalid_date', '없는 날짜입니다.');
    solar = { year: input.year, month: input.month, day: input.day };
    lunar = solarToLunar(solar.year, solar.month, solar.day);
  }
  if (solar.year < SAJU_SUPPORTED_YEARS.from || solar.year > SAJU_SUPPORTED_YEARS.to || !isSolarTermYearSupported(solar.year)) {
    throw new SajuInputError('out_of_range', `${SAJU_SUPPORTED_YEARS.from}~${SAJU_SUPPORTED_YEARS.to}년 출생만 지원합니다.`);
  }
  return {
    calendar: input.calendar,
    year: input.year,
    month: input.month,
    day: input.day,
    leapMonth,
    hour: input.hour,
    minute,
    gender: input.gender,
    options,
    solar,
    lunar,
  };
};

/** 만 나이(기준 UTC 순간). */
export const ageAt = (birthUtcMinutes: number, asOfUtcMinutes: number): number => {
  const b = civilFromMinutes(birthUtcMinutes, 9 * 60);
  const a = civilFromMinutes(asOfUtcMinutes, 9 * 60);
  let age = a.year - b.year;
  if (a.month < b.month || (a.month === b.month && a.day < b.day)) age -= 1;
  return Math.max(0, age);
};

export interface ComputeSajuOptions {
  /** 기준 시각(기본 지금). 현재 대운·세운·만 나이 계산. */
  asOf?: Date;
}

/** 사주 산출. 입력 오류는 SajuInputError. */
export const computeSajuChart = (input: SajuBirthInput, opts: ComputeSajuOptions = {}): SajuChart => {
  const n = normalizeInput(input);
  const hourKnown = n.hour !== null;
  const wallHour = hourKnown ? (n.hour as number) : 12;
  const wallMinute = hourKnown ? (n.minute as number) : 0;
  const wallDt: CivilDateTime = { ...n.solar, hour: wallHour, minute: wallMinute };
  const resolved = resolveKoreaWallClock(wallDt);
  const correctionOffset = n.options.solarTimeCorrection ? SEOUL_MEAN_SOLAR_OFFSET_MINUTES : resolved.offsetMinutes;
  const corrected = civilFromMinutes(resolved.utcMinutes, correctionOffset);
  const correctionMinutes = correctionOffset - resolved.offsetMinutes;

  // 년·월주(절기 기준, UTC 순간).
  const ym = yearMonthGanzhiAt(resolved.utcMinutes);
  if (!ym) throw new SajuInputError('out_of_range', '절기 표 범위를 벗어났습니다.');
  const hit = findMonthTermAt(resolved.utcMinutes);
  if (!hit) throw new SajuInputError('out_of_range', '절기 표 범위를 벗어났습니다.');

  // 일주: 보정 지방시 23:00 이후는 다음날(야자시 옵션이면 당일 유지).
  let dayNo = sajuDayNumber(corrected.year, corrected.month, corrected.day);
  const inLateRat = hourKnown && corrected.hour === 23;
  if (inLateRat && !n.options.lateRatHour) dayNo += 1;
  const dayGanzhi = dayGanzhiOfDayNumber(dayNo);
  const dayStem = stemOfGanzhi(dayGanzhi);
  const voids = voidBranchesOf(dayGanzhi);

  // 시주.
  let hourPillar: SajuPillar | null = null;
  if (hourKnown) {
    const hb = HOUR_BRANCH_OF(corrected.hour);
    // 야자시: 시간 천간은 다음날 일간 기준.
    const stemBase = inLateRat && n.options.lateRatHour ? stemOfGanzhi(dayGanzhiOfDayNumber(dayNo + 1)) : dayStem;
    hourPillar = makePillar('hour', ganzhiIndex(hourStemOf(stemBase, hb), hb), dayStem, voids);
  }

  const pillars = {
    year: makePillar('year', ym.yearGanzhi, dayStem, voids),
    month: makePillar('month', ym.monthGanzhi, dayStem, voids),
    day: makePillar('day', dayGanzhi, dayStem, voids),
    hour: hourPillar,
  };
  const list = [pillars.year, pillars.month, pillars.day, ...(hourPillar ? [hourPillar] : [])];

  const tenGodCounts = Object.fromEntries(SAJU_TEN_GODS.map((g) => [g, 0])) as Record<TenGod, number>;
  for (const p of list) {
    if (p.stemTenGod) tenGodCounts[p.stemTenGod] += 1;
    tenGodCounts[p.branchTenGod] += 1;
  }
  const elements = elementScoresOf(list);
  const excess = elements.filter((e) => e.percent >= 30).map((e) => e.element);
  const lacking = elements.filter((e) => e.score === 0).map((e) => e.element);
  const strength = strengthOf(pillars);
  const season = branchMeta(pillars.month.branch).season;
  const dayMaster = stemMeta(dayStem);
  const favorable = favorableOf(dayMaster.element, strength, elements, season);
  const relations = findRelations(list.map((p) => ({ key: p.key, stem: p.stem, branch: p.branch })));
  const stars = findStars(pillars);

  // 대운.
  const forward = stemMeta(pillars.year.stem).yang === (n.gender === 'M');
  const toTerm = forward ? hit.nextMonthTermUtcMinutes - resolved.utcMinutes : resolved.utcMinutes - hit.atUtcMinutes;
  const days = toTerm / MINUTES_PER_DAY;
  const totalMonths = Math.round(days * 4); // 3일 = 1년 = 12개월
  const startAgeYears = Math.floor(totalMonths / 12);
  const startAgeMonths = totalMonths % 12;
  const startAge = totalMonths / 12;
  const asOfDate = opts.asOf ?? new Date();
  const asOfUtc = Math.floor((asOfDate.getTime() - Date.UTC(1900, 0, 1)) / 60_000);
  const age = ageAt(resolved.utcMinutes, asOfUtc);
  const luckPillars: SajuLuckPillar[] = [];
  for (let k = 1; k <= 10; k++) {
    const g = (((pillars.month.ganzhi + (forward ? k : -k)) % 60) + 60) % 60;
    const stem = stemOfGanzhi(g);
    const branch = branchOfGanzhi(g);
    const fromAge = Math.round((startAge + 10 * (k - 1)) * 10) / 10;
    luckPillars.push({
      index: k - 1,
      ganzhi: g,
      stem,
      branch,
      ko: ganzhiKo(g),
      hanja: ganzhiHanja(g),
      fromAge,
      toAge: Math.round((fromAge + 10) * 10) / 10,
      fromYear: n.solar.year + Math.floor(fromAge),
      stemTenGod: tenGodOf(dayStem, stem),
      branchTenGod: tenGodOf(dayStem, mainHiddenStem(branch)),
      twelveStage: twelveStageOf(dayStem, branch),
    });
  }
  const ageExact = (asOfUtc - resolved.utcMinutes) / (MINUTES_PER_DAY * 365.2425);
  const currentIndex = luckPillars.findIndex((p) => ageExact >= p.fromAge && ageExact < p.toAge);

  // 세운(기준 시각의 사주 연도).
  const asOfCivil = civilFromMinutes(asOfUtc, 9 * 60);
  const asOfYear = sajuYearAt(asOfUtc, asOfCivil.year);
  const yearLuck = yearLuckOf(pillars, dayStem, asOfYear);

  const warnings: string[] = [];
  const edge = 120;
  if (resolved.utcMinutes - hit.atUtcMinutes < edge || hit.nextMonthTermUtcMinutes - resolved.utcMinutes < edge) {
    warnings.push('절기 경계에 가까운 출생이라 월주가 달라질 수 있어요. 출생 시각을 다시 확인해 주세요.');
  }
  const ip = ipchunUtcMinutes(n.solar.year);
  if (ip !== null && Math.abs(resolved.utcMinutes - ip) < edge) {
    warnings.push('입춘 경계에 가까운 출생이라 년주(띠)가 달라질 수 있어요.');
  }
  if (!hourKnown) warnings.push('출생 시간을 모르면 시주 없이 세 기둥으로 풀이해요. 시간을 알면 더 정확해져요.');
  if (resolved.dst) warnings.push('출생 당시 서머타임이 적용된 기간이라 1시간을 되돌려 계산했어요.');

  return {
    input: {
      calendar: n.calendar,
      year: n.year,
      month: n.month,
      day: n.day,
      leapMonth: n.leapMonth,
      hour: n.hour,
      minute: n.minute,
      gender: n.gender,
      options: n.options,
    },
    solar: n.solar,
    lunar: n.lunar,
    instant: {
      utcMinutes: resolved.utcMinutes,
      hourKnown,
      offsetMinutes: resolved.offsetMinutes,
      dst: resolved.dst,
      corrected,
      correctionMinutes,
    },
    pillars,
    dayMaster,
    zodiac: branchMeta(pillars.year.branch),
    season,
    tenGodCounts,
    elements,
    excess,
    lacking,
    strength,
    favorable,
    relations,
    stars,
    voidBranches: voids,
    luck: { forward, startAgeYears, startAgeMonths, pillars: luckPillars, currentIndex },
    yearLuck,
    asOf: { utcMinutes: asOfUtc, age, year: asOfYear },
    warnings,
  };
};

/** 특정 해의 세운(원국과의 관계 포함). */
export const yearLuckOf = (
  pillars: { year: SajuPillar; month: SajuPillar; day: SajuPillar; hour: SajuPillar | null },
  dayStem: Stem,
  year: number,
): SajuYearLuck => {
  const g = yearGanzhiOf(year);
  const stem = stemOfGanzhi(g);
  const branch = branchOfGanzhi(g);
  const chars = [pillars.year, pillars.month, pillars.day, ...(pillars.hour ? [pillars.hour] : [])].map((p) => ({ key: p.key, stem: p.stem, branch: p.branch }));
  const all = findRelations([...chars, { key: 'luck', stem, branch }]);
  return {
    year,
    ganzhi: g,
    ko: ganzhiKo(g),
    hanja: ganzhiHanja(g),
    stemTenGod: tenGodOf(dayStem, stem),
    branchTenGod: tenGodOf(dayStem, mainHiddenStem(branch)),
    twelveStage: twelveStageOf(dayStem, branch),
    relations: all.filter((r) => r.pillars.includes('luck')),
  };
};

/** 사주 8글자(시주 없으면 6) 문자열 — 캐시 키·공유 제목용. "갑자 병인 무진 임술". */
export const chartSignature = (chart: SajuChart): string =>
  [chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.hour]
    .map((p) => (p ? p.ko : '--'))
    .join(' ');

/** 양력 날짜 문자열. */
export const chartSolarLabel = (chart: SajuChart): string => formatCivilDate(chart.solar);
