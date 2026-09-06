// 사주 파생 읽을거리(6차, 순수 계산) — 격국·오신(용신/희신/기신/구신/한신)·삼재·월운 12개월·향후 세운·
// 하루 12시진·오행 건강 힌트·지장간 숨은 십신. 전부 SajuChart 만으로 계산하므로 웹(계약 DTO 도 같은 모양)·
// 서버(LLM 사실 목록)가 같은 함수를 쓴다. 유파마다 다른 항목(격국·삼재)은 가장 널리 쓰는 규칙 하나로 고정하고
// 문구는 "재미로 보는" 톤을 유지한다.

import { civilFromMinutes, KST_OFFSET_MINUTES, monthBranchOfTerm, solarTermsOfYear, type CivilDate } from './sajuCalendar.js';
import {
  branchMeta,
  branchOfGanzhi,
  dayGanzhiOfDayNumber,
  ganzhiHanja,
  ganzhiIndex,
  ganzhiKo,
  hourStemOf,
  mainHiddenStem,
  monthStemOf,
  SAJU_TEN_GOD_META,
  SAJU_THREE_COMBINES,
  SAJU_WUXING_META,
  stemMeta,
  stemOfGanzhi,
  tenGodOf,
  wuxingControlledBy,
  wuxingGeneratedBy,
  yearGanzhiOf,
  yearLuckOf,
  type Branch,
  type SajuChart,
  type SajuRelation,
  type SajuYearLuck,
  type Stem,
  type TenGod,
  type TenGodGroup,
  type TwelveStage,
  type Wuxing,
} from './saju.js';
import { scoreGanzhiForChart, starsOfScore, type SajuDayTag } from './sajuDaily.js';

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const round5 = (score: number): number => Math.round(clamp(score, 5, 98));

// ── 격국 ─────────────────────────────────────────────────────

export type SajuPatternId =
  | 'jeonggwan' | 'pyeongwan' | 'jeongjae' | 'pyeonjae' | 'siksin' | 'sanggwan' | 'jeongin' | 'pyeonin' | 'geonrok' | 'yangin';

export interface SajuPattern {
  id: SajuPatternId;
  ko: string;
  hanja: string;
  /** 월지 정기(본기) 십신 — 격의 근거. */
  basis: TenGod;
  summary: string;
  detail: string;
}

const PATTERN_TEXT: Record<SajuPatternId, { ko: string; hanja: string; summary: string; detail: string }> = {
  jeonggwan: { ko: '정관격', hanja: '正官格', summary: '규칙과 명예를 지키는 사람', detail: '정관은 질서·책임·명예의 기운이에요. 원칙을 지키고 조직 안에서 신뢰를 쌓을 때 빛나요. 정도(正道)로 가는 편이 결국 유리해요.' },
  pyeongwan: { ko: '편관격', hanja: '偏官格', summary: '도전과 권위로 밀고 가는 사람', detail: '편관(칠살)은 압박을 힘으로 바꾸는 기운이에요. 어려운 자리·경쟁이 오히려 실력을 끌어내요. 과로와 급한 결정만 조심하면 큰 그릇이 돼요.' },
  jeongjae: { ko: '정재격', hanja: '正財格', summary: '성실하게 쌓아 실속을 챙기는 사람', detail: '정재는 착실히 모으는 돈·현실 감각이에요. 꾸준함과 관리가 강점이고, 한 방보다 누적이 어울려요.' },
  pyeonjae: { ko: '편재격', hanja: '偏財格', summary: '활동 범위가 넓고 사업 감각이 있는 사람', detail: '편재는 움직이는 돈·기회의 기운이에요. 사람과 시장을 읽는 눈이 있고 스케일이 커요. 씀씀이와 분산만 관리하면 돼요.' },
  siksin: { ko: '식신격', hanja: '食神格', summary: '여유롭게 만들고 나누는 사람', detail: '식신은 재능을 편하게 풀어내는 기운이에요. 먹는 복·표현력·낙천성이 있고, 좋아하는 일을 오래 하면 돈이 따라와요.' },
  sanggwan: { ko: '상관격', hanja: '傷官格', summary: '재능과 말이 앞서는 사람', detail: '상관은 창의·언변·비판의 기운이에요. 틀을 깨는 재주가 있어 예술·기획·전문직에 어울리고, 윗사람과의 마찰만 다스리면 돼요.' },
  jeongin: { ko: '정인격', hanja: '正印格', summary: '배우고 지키는 힘이 큰 사람', detail: '정인은 학문·문서·보호의 기운이에요. 인내와 이해력이 깊고 귀인 운이 있어요. 실행이 늦어지지 않게만 하면 돼요.' },
  pyeonin: { ko: '편인격', hanja: '偏印格', summary: '직관과 전문성으로 승부하는 사람', detail: '편인은 남다른 감각·전문 지식의 기운이에요. 혼자 파고드는 힘이 세고 특수 분야에서 두각을 내요. 고립되지 않게 사람을 두세요.' },
  geonrok: { ko: '건록격', hanja: '建祿格', summary: '스스로 서서 버는 사람', detail: '월지에 내 뿌리가 있어 자립심과 체력이 좋아요. 남에게 기대기보다 제 힘으로 일구는 편이 잘 맞아요.' },
  yangin: { ko: '양인격', hanja: '羊刃格', summary: '강한 추진력으로 판을 여는 사람', detail: '양인은 날카롭고 센 기운이에요. 결단·돌파·승부에 강하고, 그 힘을 쓸 자리(직업·운동·전문)를 두면 큰 성취가 돼요.' },
};

/** 격국 — 월지 정기(본기)의 십신으로 정한다(가장 널리 쓰는 규칙). 비견이면 건록격, 겁재면 양인격. */
export const sajuPatternOf = (chart: SajuChart): SajuPattern => {
  const basis = chart.pillars.month.branchTenGod;
  const id: SajuPatternId = basis === 'bigyeon' ? 'geonrok' : basis === 'geopjae' ? 'yangin' : (basis as SajuPatternId);
  return { id, basis, ...PATTERN_TEXT[id] };
};

// ── 오신(용신·희신·기신·구신·한신) ───────────────────────────

export interface SajuFiveGods {
  /** 용신 — 가장 필요한 기운(보완 오행). */
  yong: Wuxing;
  /** 희신 — 용신을 돕는 기운. */
  hee: Wuxing;
  /** 기신 — 용신을 해치는(극하는) 기운. */
  gi: Wuxing;
  /** 구신 — 기신을 돕는 기운. */
  gu: Wuxing;
  /** 한신 — 나머지. */
  han: Wuxing;
  reason: string;
}

export const sajuFiveGodsOf = (chart: SajuChart): SajuFiveGods => {
  const yong = chart.favorable.primary;
  const hee = chart.favorable.secondary && chart.favorable.secondary !== yong ? chart.favorable.secondary : wuxingGeneratedBy(yong);
  const gi = wuxingControlledBy(yong);
  let gu = wuxingGeneratedBy(gi);
  const taken = new Set<Wuxing>([yong, hee, gi]);
  if (taken.has(gu)) gu = (['wood', 'fire', 'earth', 'metal', 'water'] as Wuxing[]).find((e) => !taken.has(e)) ?? gu;
  taken.add(gu);
  const han = (['wood', 'fire', 'earth', 'metal', 'water'] as Wuxing[]).find((e) => !taken.has(e)) ?? yong;
  const ko = (e: Wuxing): string => SAJU_WUXING_META[e].ko;
  const reason =
    chart.favorable.reason === 'weak'
      ? `일간이 약한 편이라 나를 돕는 ${ko(yong)} 기운이 용신이에요.`
      : chart.favorable.reason === 'strong'
        ? `일간이 강한 편이라 힘을 덜어 주는 ${ko(yong)} 기운이 용신이에요.`
        : chart.favorable.reason === 'season'
          ? `태어난 계절의 한열을 고르는 ${ko(yong)} 기운이 용신이에요.`
          : `균형이 좋아 가장 비어 있는 ${ko(yong)} 기운을 용신으로 봐요.`;
  return { yong, hee, gi, gu, han, reason };
};

// ── 삼재 ─────────────────────────────────────────────────────

export type SamjaeStage = 'in' | 'mid' | 'out';
export const SAJU_SAMJAE_STAGE_KO: Record<SamjaeStage, string> = { in: '들삼재', mid: '눌삼재', out: '날삼재' };

export interface SajuSamjae {
  /** 삼재에 드는 지지 3개(순서대로 들·눌·날). */
  branches: readonly [Branch, Branch, Branch];
  branchesKo: string;
  /** 기준 해가 삼재면 단계, 아니면 null. */
  stage: SamjaeStage | null;
  /** 이번(또는 다음) 삼재 3년. */
  years: readonly [number, number, number];
  note: string;
}

/** 삼재 — 띠(년지)의 삼합 묘(墓) 지지에서 끝나는 3년. 신자진→인묘진, 인오술→신유술, 사유축→해자축, 해묘미→사오미. */
export const sajuSamjaeOf = (chart: SajuChart, year = chart.asOf.year): SajuSamjae => {
  const zb = chart.zodiac.index;
  const tc = SAJU_THREE_COMBINES.find((t) => t.branches.includes(zb));
  const last = (tc ? tc.branches[2] : ((zb + 2) % 12)) as Branch;
  const branches: [Branch, Branch, Branch] = [((last + 10) % 12) as Branch, ((last + 11) % 12) as Branch, last];
  const yb = branchOfGanzhi(yearGanzhiOf(year));
  const idx = branches.indexOf(yb);
  const stage: SamjaeStage | null = idx === 0 ? 'in' : idx === 1 ? 'mid' : idx === 2 ? 'out' : null;
  // 이번 삼재의 첫 해: 기준 해가 삼재면 idx 만큼 거슬러, 아니면 다음 들삼재 해.
  let first = year - (idx >= 0 ? idx : 0);
  if (idx < 0) {
    first = year + 1;
    while (branchOfGanzhi(yearGanzhiOf(first)) !== branches[0]) first++;
  }
  const years: [number, number, number] = [first, first + 1, first + 2];
  const branchesKo = branches.map((b) => branchMeta(b).ko).join('·');
  const note = stage
    ? `${year}년은 ${SAJU_SAMJAE_STAGE_KO[stage]}예요(${years[0]}~${years[2]}). 큰 변화보다 정리·점검에 좋은 시기로 봐요.`
    : `다음 삼재는 ${years[0]}~${years[2]}년(${branchesKo}년)이에요.`;
  return { branches, branchesKo, stage, years, note };
};

// ── 월운 12개월 ───────────────────────────────────────────────

export interface SajuMonthLuck {
  /** 0 = 인월(입춘) … 11 = 축월(소한). */
  index: number;
  stem: Stem;
  branch: Branch;
  ganzhi: number;
  ko: string;
  hanja: string;
  /** 절입일(KST). */
  from: CivilDate;
  to: CivilDate;
  termName: string;
  stemTenGod: TenGod;
  branchTenGod: TenGod;
  twelveStage: TwelveStage;
  score: number;
  stars: 1 | 2 | 3 | 4 | 5;
  tags: readonly SajuDayTag[];
  relations: readonly SajuRelation[];
}

/** 사주년(입춘~다음 입춘) 기준 12개월. 절기 표 범위 밖이면 빈 배열. */
export const sajuMonthLucksOf = (chart: SajuChart, year = chart.yearLuck.year): SajuMonthLuck[] => {
  const terms = solarTermsOfYear(year);
  const next = solarTermsOfYear(year + 1);
  if (!terms || !next) return [];
  const at = (y: number, index: number): number | null => (y === year ? terms : next).find((t) => t.index === index)?.atUtcMinutes ?? null;
  const yearStem = stemOfGanzhi(yearGanzhiOf(year));
  const out: SajuMonthLuck[] = [];
  for (let i = 0; i < 12; i++) {
    // 절(節) index: 인월 2, 묘월 4 … 자월 22, 축월은 다음 해 0(소한).
    const termIndex = i < 11 ? 2 + i * 2 : 0;
    const termYear = i < 11 ? year : year + 1;
    const start = at(termYear, termIndex);
    const endIndex = termIndex === 22 ? 0 : termIndex === 0 ? 2 : termIndex + 2;
    const endYear = termIndex >= 22 || termIndex === 0 ? year + 1 : year;
    const end = at(endYear, endIndex);
    if (start === null || end === null) continue;
    const branch = monthBranchOfTerm(termIndex) as Branch;
    const stem = monthStemOf(yearStem, branch);
    const core = scoreGanzhiForChart(chart, stem, branch);
    const score = round5(core.score);
    const g = ganzhiIndex(stem, branch);
    const fromC = civilFromMinutes(start, KST_OFFSET_MINUTES);
    const toC = civilFromMinutes(end - 1, KST_OFFSET_MINUTES);
    out.push({
      index: i,
      stem,
      branch,
      ganzhi: g,
      ko: ganzhiKo(g),
      hanja: ganzhiHanja(g),
      from: { year: fromC.year, month: fromC.month, day: fromC.day },
      to: { year: toC.year, month: toC.month, day: toC.day },
      termName: terms.find((t) => t.index === termIndex)?.name ?? next.find((t) => t.index === termIndex)?.name ?? '',
      stemTenGod: core.stemTenGod,
      branchTenGod: core.branchTenGod,
      twelveStage: core.stage,
      score,
      stars: starsOfScore(score),
      tags: [...new Set(core.tags)],
      relations: core.relations,
    });
  }
  return out;
};

// ── 향후 세운 ─────────────────────────────────────────────────

export const SAJU_TEN_GOD_GROUP_THEME: Record<TenGodGroup, string> = {
  self: '경쟁·독립·동료',
  output: '표현·창작·연애',
  wealth: '재물·실속·활동',
  power: '직장·명예·책임',
  resource: '공부·문서·귀인',
};

export interface SajuYearOutlook extends SajuYearLuck {
  score: number;
  stars: 1 | 2 | 3 | 4 | 5;
  /** 천간 십신 그룹의 테마. */
  theme: string;
  /** 원국과 충·형이 있으면 '변동', 합이 있으면 '인연'. */
  flags: readonly string[];
  isCurrent: boolean;
}

export const sajuYearOutlooksOf = (chart: SajuChart, from = chart.asOf.year, count = 5): SajuYearOutlook[] => {
  const out: SajuYearOutlook[] = [];
  for (let y = from; y < from + count; y++) {
    const yl = yearLuckOf(chart.pillars, chart.dayMaster.index, y);
    const core = scoreGanzhiForChart(chart, stemOfGanzhi(yl.ganzhi), branchOfGanzhi(yl.ganzhi));
    const score = round5(core.score);
    const flags: string[] = [];
    if (yl.relations.some((r) => r.type === 'clash' || r.type === 'punish' || r.type === 'self-punish' || r.type === 'stem-clash')) flags.push('변동');
    if (yl.relations.some((r) => r.type === 'six-combine' || r.type === 'three-combine' || r.type === 'half-combine' || r.type === 'stem-combine')) flags.push('인연');
    if (chart.voidBranches.includes(branchOfGanzhi(yl.ganzhi))) flags.push('공망');
    out.push({ ...yl, score, stars: starsOfScore(score), theme: SAJU_TEN_GOD_GROUP_THEME[SAJU_TEN_GOD_META[yl.stemTenGod].group], flags, isCurrent: y === chart.asOf.year });
  }
  return out;
};

// ── 하루 12시진 ───────────────────────────────────────────────

export interface SajuHourLuck {
  branch: Branch;
  stem: Stem;
  ko: string;
  hanja: string;
  /** '23~01시'. */
  range: string;
  stemTenGod: TenGod;
  twelveStage: TwelveStage;
  score: number;
  stars: 1 | 2 | 3 | 4 | 5;
  tags: readonly SajuDayTag[];
}

const HOUR_RANGE: readonly string[] = ['23~01시', '01~03시', '03~05시', '05~07시', '07~09시', '09~11시', '11~13시', '13~15시', '15~17시', '17~19시', '19~21시', '21~23시'];

/** 어떤 날(일 번호)의 12시진을 원국에 대 본 점수 — 시간(時干)은 그날 일간으로 오서둔. */
export const sajuHourLucksOf = (chart: SajuChart, dayNumber: number): SajuHourLuck[] => {
  const dayStem = stemOfGanzhi(dayGanzhiOfDayNumber(dayNumber));
  const out: SajuHourLuck[] = [];
  for (let b = 0; b < 12; b++) {
    const branch = b as Branch;
    const stem = hourStemOf(dayStem, branch);
    const core = scoreGanzhiForChart(chart, stem, branch);
    const score = round5(core.score);
    const g = ganzhiIndex(stem, branch);
    out.push({ branch, stem, ko: ganzhiKo(g), hanja: ganzhiHanja(g), range: HOUR_RANGE[b] ?? '', stemTenGod: core.stemTenGod, twelveStage: core.stage, score, stars: starsOfScore(score), tags: [...new Set(core.tags)] });
  }
  return out;
};

/** 좋은 시간대 상위 n·주의 시간대 하위 1. */
export const sajuBestHours = (hours: readonly SajuHourLuck[], top = 2): { best: SajuHourLuck[]; worst: SajuHourLuck | null } => {
  const sorted = [...hours].sort((a, b) => b.score - a.score || a.branch - b.branch);
  return { best: sorted.slice(0, top), worst: sorted.length ? (sorted[sorted.length - 1] as SajuHourLuck) : null };
};

// ── 오행 건강 힌트 ────────────────────────────────────────────

export interface WuxingHealth {
  element: Wuxing;
  organs: string;
  body: string;
  lacking: string;
  excess: string;
}

export const SAJU_WUXING_HEALTH: Record<Wuxing, WuxingHealth> = {
  wood: { element: 'wood', organs: '간·담', body: '눈·근육·힘줄', lacking: '쉽게 피로하고 눈이 뻑뻑할 수 있어요. 스트레칭·초록 채소·이른 취침이 도움이 돼요.', excess: '화가 쌓이기 쉬워요. 걷기·심호흡으로 기운을 풀어 주세요.' },
  fire: { element: 'fire', organs: '심장·소장', body: '혈압·순환·수면', lacking: '손발이 차고 기운이 처질 수 있어요. 햇볕·가벼운 운동·따뜻한 음식이 좋아요.', excess: '잠이 얕고 조급해지기 쉬워요. 카페인·야식을 줄이고 열을 내려 주세요.' },
  earth: { element: 'earth', organs: '비장·위', body: '소화·근육·체중', lacking: '소화가 예민하고 걱정이 많아질 수 있어요. 규칙적인 식사·단맛 곡물이 좋아요.', excess: '몸이 무겁고 습이 쌓이기 쉬워요. 과식을 줄이고 땀을 내 주세요.' },
  metal: { element: 'metal', organs: '폐·대장', body: '호흡기·피부·장', lacking: '감기·피부 건조에 약할 수 있어요. 흰 음식·심호흡·규칙적인 배변이 좋아요.', excess: '건조하고 딱딱해지기 쉬워요. 수분·따뜻한 국물로 풀어 주세요.' },
  water: { element: 'water', organs: '신장·방광', body: '허리·뼈·생식·귀', lacking: '허리가 약하고 겁이 많아질 수 있어요. 검은콩·충분한 수분·따뜻한 하체가 좋아요.', excess: '몸이 차고 붓기 쉬워요. 짠 음식을 줄이고 몸을 데워 주세요.' },
};

export interface SajuHealthHint { element: Wuxing; kind: 'lacking' | 'excess'; text: string }

/** 부족·과다 오행 기준 힌트(최대 3). 진단이 아니라 생활 습관 제안 — 문구도 그 톤. */
export const sajuHealthHintsOf = (chart: SajuChart): SajuHealthHint[] => {
  const out: SajuHealthHint[] = [];
  for (const e of chart.lacking) out.push({ element: e, kind: 'lacking', text: `${SAJU_WUXING_META[e].ko}(${SAJU_WUXING_HEALTH[e].organs}·${SAJU_WUXING_HEALTH[e].body})이 부족한 편 — ${SAJU_WUXING_HEALTH[e].lacking}` });
  for (const e of chart.excess) out.push({ element: e, kind: 'excess', text: `${SAJU_WUXING_META[e].ko}(${SAJU_WUXING_HEALTH[e].organs}·${SAJU_WUXING_HEALTH[e].body})이 넘치는 편 — ${SAJU_WUXING_HEALTH[e].excess}` });
  return out.slice(0, 3);
};

// ── 지장간 숨은 십신 ──────────────────────────────────────────

export interface SajuHiddenGods { pillar: SajuChart['pillars']['day']['key']; items: Array<{ stem: Stem; ko: string; tenGod: TenGod; tenGodKo: string }> }

export const sajuHiddenGodsOf = (chart: SajuChart): SajuHiddenGods[] => {
  const p = chart.pillars;
  const cols = [p.year, p.month, p.day, ...(p.hour ? [p.hour] : [])];
  const dm = chart.dayMaster.index;
  return cols.map((c) => ({
    pillar: c.key,
    items: c.hidden.map((s) => {
      const g = tenGodOf(dm, s);
      return { stem: s, ko: stemMeta(s).ko, tenGod: g, tenGodKo: SAJU_TEN_GOD_META[g].ko };
    }),
  }));
};

/** 지지의 정기 십신(월지 격국 근거 등) — 헬퍼. */
export const mainHiddenTenGodOf = (chart: SajuChart, branch: Branch): TenGod => tenGodOf(chart.dayMaster.index, mainHiddenStem(branch));
