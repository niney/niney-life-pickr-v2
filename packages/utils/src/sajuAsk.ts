// 사주에 묻기(9차, 순수 계산) — "만약에 이랬다면" 질문을 주제 칩(9) + 시점 + 자유 텍스트로 구조화한다.
// 계산은 코드가: 주제 → 관련 십신 그룹·신살·테마 요약(재사용) + 시점 점수(월운·세운·일진에 택일 용도 가중치) +
// 더 좋은 대안 시점 2개 + 판정(좋음/무난/조심). LLM 은 그 위에 질문 문장을 엮어 답만 쓴다.
// 자유 텍스트는 계산에 쓰지 않고 데이터 블록으로만 프롬프트에 들어간다(인젝션 방어). 답할 수 없는 주제(건강·소송·임신 등)는
// 키워드로 막아 정적 안내로 돌린다(docs/PLAN-saju.md 9차).

import { civilFromMinutes, KST_OFFSET_MINUTES, sajuDayNumber } from './sajuCalendar.js';
import {
  branchOfGanzhi,
  SAJU_STAR_META,
  SAJU_TEN_GOD_META,
  SAJU_TEN_GODS,
  stemOfGanzhi,
  yearLuckOf,
  type SajuChart,
  type StarId,
  type TenGod,
  type TenGodGroup,
} from './saju.js';
import { scoreDayForChart, scoreGanzhiForChart, starsOfScore, SAJU_DAY_TAG_LABEL } from './sajuDaily.js';
import { applyDatePurposeRule, pickDates, type SajuDatePurpose } from './sajuDatePick.js';
import { sajuMonthLucksOf, type SajuMonthLuck } from './sajuInsights.js';
import { SAJU_STAR_TEXT, SAJU_TEN_GOD_TEXT, tenGodKo } from './sajuText.js';
import { sajuCareerThemeOf, sajuLoveThemeOf, sajuWealthThemeOf, type SajuThemeId } from './sajuThemes.js';

export type SajuAskTopic = 'job-change' | 'startup' | 'move' | 'marriage' | 'exam' | 'invest' | 'trip' | 'contract' | 'confess';
export const SAJU_ASK_TOPICS: readonly SajuAskTopic[] = ['job-change', 'startup', 'move', 'marriage', 'exam', 'invest', 'trip', 'contract', 'confess'];

/** 타로 주제 id(utils tarot.ts TAROT_TOPICS)와 같은 값 — "타로로도 보기" 링크에 넘긴다. */
export type SajuAskTarotTopic = 'general' | 'love' | 'work' | 'money' | 'relationship' | 'choice';

export interface SajuAskTopicMeta {
  ko: string;
  hint: string;
  /** 시점 채점에 쓰는 택일 용도 가중치. */
  purpose: SajuDatePurpose;
  /** 근거로 요약할 테마(없으면 원국 십신만). */
  themes: readonly SajuThemeId[];
  /** 관련 십신 그룹 — 개수·해설을 근거 줄로. 'spouse' 는 성별 배우자성 그룹. */
  groups: ReadonlyArray<TenGodGroup | 'spouse'>;
  stars: readonly StarId[];
  tarotTopic: SajuAskTarotTopic;
}

export const SAJU_ASK_TOPIC_META: Record<SajuAskTopic, SajuAskTopicMeta> = {
  'job-change': { ko: '이직', hint: '옮길까 말까, 언제가 좋을까', purpose: 'interview', themes: ['career'], groups: ['power', 'output'], stars: ['yeokma', 'cheoneul', 'munchang'], tarotTopic: 'work' },
  startup: { ko: '창업', hint: '내 일을 시작해도 될까', purpose: 'contract', themes: ['career', 'wealth'], groups: ['wealth', 'output', 'self'], stars: ['yeokma', 'goegang', 'cheoneul'], tarotTopic: 'work' },
  move: { ko: '이사', hint: '옮기기 좋은 때인가', purpose: 'move', themes: [], groups: ['resource'], stars: ['yeokma', 'cheondeok', 'woldeok'], tarotTopic: 'general' },
  marriage: { ko: '결혼·연애', hint: '이 인연, 이 시기', purpose: 'date', themes: ['love'], groups: ['spouse'], stars: ['dohwa', 'hongyeom'], tarotTopic: 'love' },
  exam: { ko: '시험', hint: '준비·응시 시기', purpose: 'interview', themes: ['career'], groups: ['resource', 'power'], stars: ['munchang', 'cheoneul'], tarotTopic: 'work' },
  invest: { ko: '투자', hint: '크게 움직여도 될까', purpose: 'contract', themes: ['wealth'], groups: ['wealth', 'self'], stars: ['geumyeo'], tarotTopic: 'money' },
  trip: { ko: '여행', hint: '떠나기 좋은 때', purpose: 'trip', themes: [], groups: ['output'], stars: ['yeokma'], tarotTopic: 'general' },
  contract: { ko: '계약', hint: '도장 찍어도 될까', purpose: 'contract', themes: ['wealth'], groups: ['wealth', 'power', 'resource'], stars: ['cheoneul', 'geumyeo'], tarotTopic: 'money' },
  confess: { ko: '고백', hint: '마음을 전할 때', purpose: 'date', themes: ['love'], groups: ['spouse'], stars: ['dohwa', 'hongyeom'], tarotTopic: 'love' },
};

export type SajuAskWhen = { kind: 'this-month' } | { kind: 'this-year' } | { kind: 'year'; year: number } | { kind: 'date'; date: string };

export type SajuAskVerdict = 'good' | 'ok' | 'careful';
export const SAJU_ASK_VERDICT_KO: Record<SajuAskVerdict, string> = { good: '해 볼 만해요', ok: '무난해요', careful: '조심스러워요' };
const verdictOf = (score: number): SajuAskVerdict => (score >= 65 ? 'good' : score >= 45 ? 'ok' : 'careful');

export interface SajuAskWindow {
  /** '2026년 9월(을유월)' · '2027년 정미' · '2026-10-03 갑자일'. */
  label: string;
  ganzhiKo: string;
  score: number;
  stars: 1 | 2 | 3 | 4 | 5;
  /** 채점 근거(십신·표식·관계). */
  reasons: string[];
}

export interface SajuAskFacts {
  topic: SajuAskTopic;
  topicKo: string;
  when: SajuAskWhen;
  whenKo: string;
  window: SajuAskWindow;
  verdict: SajuAskVerdict;
  verdictKo: string;
  /** 더 좋은 시점(같은 단위, 점수 높은 순 최대 2). 비어 있으면 요청 시점이 이미 상위. */
  alternatives: SajuAskWindow[];
  /** 원국 근거 — 관련 십신 그룹 개수·신살. */
  basis: string[];
  /** 테마 한 줄 요약(재물 스타일·적성·인연). */
  themeSummary: string[];
  /** 현재 대운 한 줄. */
  luckNote: string;
}

// ── 답하지 않는 주제 ────────────────────────────────────────

const BLOCKED: ReadonlyArray<{ re: RegExp; ko: string }> = [
  { re: /건강|질병|병원|수술|암\b|치료|약\b|우울|자살|죽|사망|임신|출산|유산/, ko: '건강·생명' },
  { re: /소송|재판|고소|고발|법원|형사|이혼\s*소송/, ko: '법률' },
  { re: /로또|복권|도박|카지노|코인\s*(몇|얼마)|주식\s*(몇|얼마)/, ko: '사행성·금액 예측' },
];
/** 자유 텍스트가 답하지 않는 주제면 그 이름, 아니면 null. */
export const sajuAskBlockedReason = (text: string | null | undefined): string | null => {
  const t = (text ?? '').trim();
  if (!t) return null;
  for (const b of BLOCKED) if (b.re.test(t)) return b.ko;
  return null;
};

// ── 시점 채점 ────────────────────────────────────────────────

const reasonsOf = (stemTenGod: TenGod, tags: readonly string[], relLabels: readonly string[]): string[] => {
  const out: string[] = [`${tenGodKo(stemTenGod)} — ${SAJU_TEN_GOD_TEXT[stemTenGod].short}`];
  for (const t of tags.slice(0, 3)) {
    const label = SAJU_DAY_TAG_LABEL[t as keyof typeof SAJU_DAY_TAG_LABEL];
    if (label) out.push(label);
  }
  if (relLabels.length) out.push(`원국과 ${relLabels.join('·')}`);
  return out;
};

const monthWindow = (m: SajuMonthLuck, purpose: SajuDatePurpose): SajuAskWindow => {
  const score = applyDatePurposeRule(m.score, m.tags, m.stemTenGod, purpose);
  return { label: `${m.from.year}년 ${m.from.month}월(${m.ko}월)`, ganzhiKo: m.ko, score, stars: starsOfScore(score), reasons: reasonsOf(m.stemTenGod, m.tags, m.relations.map((r) => r.label)) };
};

const yearWindow = (chart: SajuChart, year: number, purpose: SajuDatePurpose): SajuAskWindow => {
  const yl = yearLuckOf(chart.pillars, chart.dayMaster.index, year);
  const core = scoreGanzhiForChart(chart, stemOfGanzhi(yl.ganzhi), branchOfGanzhi(yl.ganzhi));
  const score = applyDatePurposeRule(core.score, core.tags, core.stemTenGod, purpose);
  return { label: `${year}년 ${yl.ko}`, ganzhiKo: yl.ko, score, stars: starsOfScore(score), reasons: reasonsOf(yl.stemTenGod, core.tags, yl.relations.map((r) => r.label)) };
};

const dayWindow = (chart: SajuChart, dayNumber: number, purpose: SajuDatePurpose): SajuAskWindow => {
  const d = scoreDayForChart(chart, dayNumber);
  const score = applyDatePurposeRule(d.score, d.tags, d.stemTenGod, purpose);
  const date = `${d.date.year}-${String(d.date.month).padStart(2, '0')}-${String(d.date.day).padStart(2, '0')}`;
  return { label: `${date} ${d.ko}일`, ganzhiKo: d.ko, score, stars: starsOfScore(score), reasons: reasonsOf(d.stemTenGod, d.tags, d.relations.map((r) => r.label)) };
};

const todayCivil = (chart: SajuChart): { year: number; month: number; day: number } => {
  const c = civilFromMinutes(chart.asOf.utcMinutes, KST_OFFSET_MINUTES);
  return { year: c.year, month: c.month, day: c.day };
};
const ymd = (d: { year: number; month: number; day: number }): number => d.year * 10000 + d.month * 100 + d.day;

const betterThan = (base: SajuAskWindow, candidates: SajuAskWindow[]): SajuAskWindow[] =>
  candidates.filter((w) => w.score > base.score + 4).sort((a, b) => b.score - a.score).slice(0, 2);

// ── 근거 ─────────────────────────────────────────────────────

const godsOfGroup = (group: TenGodGroup): TenGod[] => SAJU_TEN_GODS.filter((g) => SAJU_TEN_GOD_META[g].group === group);
const groupKo = (group: TenGodGroup): string => SAJU_TEN_GOD_META[godsOfGroup(group)[0] as TenGod].groupKo;
const GROUP_MAIN: Record<TenGodGroup, TenGod> = { self: 'bigyeon', output: 'siksin', wealth: 'jeongjae', power: 'jeonggwan', resource: 'jeongin' };

const basisOf = (chart: SajuChart, meta: SajuAskTopicMeta): string[] => {
  const out: string[] = [];
  for (const g of meta.groups) {
    const group: TenGodGroup = g === 'spouse' ? (chart.input.gender === 'F' ? 'power' : 'wealth') : g;
    const n = godsOfGroup(group).reduce((s, x) => s + (chart.tenGodCounts[x] ?? 0), 0);
    const text = n === 0 ? SAJU_TEN_GOD_TEXT[GROUP_MAIN[group]].none : n >= 3 ? SAJU_TEN_GOD_TEXT[GROUP_MAIN[group]].many : SAJU_TEN_GOD_TEXT[GROUP_MAIN[group]].personality;
    out.push(`${g === 'spouse' ? '배우자성(' + groupKo(group) + ')' : groupKo(group)} ${n}개 — ${text}`);
  }
  for (const s of chart.stars) {
    if (meta.stars.includes(s.id)) out.push(`${SAJU_STAR_META[s.id].ko}: ${SAJU_STAR_TEXT[s.id]}`);
  }
  return out;
};

const themeSummaryOf = (chart: SajuChart, meta: SajuAskTopicMeta): string[] => {
  const out: string[] = [];
  for (const t of meta.themes) {
    if (t === 'career') {
      const c = sajuCareerThemeOf(chart);
      out.push(`직업: ${c.pattern.ko} · ${c.aptitude.ko} — ${c.aptitude.summary}. 어울리는 일 ${c.jobs.slice(0, 3).join('·')}`);
    } else if (t === 'wealth') {
      const w = sajuWealthThemeOf(chart);
      out.push(`재물: ${w.style.ko} — ${w.style.summary}. ${w.capacity.text}`);
    } else {
      const l = sajuLoveThemeOf(chart);
      out.push(`인연: ${l.spouseNote} ${l.chanceNote}`);
    }
  }
  return out;
};

const luckNoteOf = (chart: SajuChart): string => {
  const cur = chart.luck.currentIndex >= 0 ? chart.luck.pillars[chart.luck.currentIndex] : null;
  if (!cur) return `아직 첫 대운 전 — 월주 ${chart.pillars.month.ko}의 기운이 배경이에요.`;
  return `현재 ${cur.ko} 대운(${Math.floor(cur.fromAge)}~${Math.floor(cur.toAge)}세): ${tenGodKo(cur.stemTenGod)}·${tenGodKo(cur.branchTenGod)} — ${SAJU_TEN_GOD_TEXT[cur.stemTenGod].short}의 10년, 십이운성 ${cur.twelveStage}.`;
};

// ── 진입점 ───────────────────────────────────────────────────

export const sajuAskOf = (chart: SajuChart, input: { topic: SajuAskTopic; when: SajuAskWhen }): SajuAskFacts => {
  const meta = SAJU_ASK_TOPIC_META[input.topic];
  const purpose = meta.purpose;
  const today = todayCivil(chart);
  let window: SajuAskWindow;
  let alternatives: SajuAskWindow[] = [];
  let whenKo: string;

  switch (input.when.kind) {
    case 'this-month': {
      const months = sajuMonthLucksOf(chart);
      const t = ymd(today);
      const idx = months.findIndex((m) => t >= ymd(m.from) && t <= ymd(m.to));
      const cur = months[idx >= 0 ? idx : 0];
      window = cur ? monthWindow(cur, purpose) : yearWindow(chart, chart.asOf.year, purpose);
      alternatives = betterThan(window, months.slice(idx + 1).map((m) => monthWindow(m, purpose)));
      whenKo = '이번 달';
      break;
    }
    case 'this-year': {
      window = yearWindow(chart, chart.asOf.year, purpose);
      alternatives = betterThan(window, [1, 2, 3, 4, 5].map((i) => yearWindow(chart, chart.asOf.year + i, purpose)));
      whenKo = `올해(${chart.asOf.year}년)`;
      break;
    }
    case 'year': {
      const y = input.when.year;
      window = yearWindow(chart, y, purpose);
      const around = [-2, -1, 1, 2, 3].map((d) => y + d).filter((yy) => yy >= chart.asOf.year);
      alternatives = betterThan(window, around.map((yy) => yearWindow(chart, yy, purpose)));
      whenKo = `${y}년`;
      break;
    }
    case 'date': {
      const [y, m, d] = input.when.date.split('-').map(Number) as [number, number, number];
      const n = sajuDayNumber(y, m, d);
      window = dayWindow(chart, n, purpose);
      const picked = pickDates(chart, n + 1, 30, purpose);
      alternatives = betterThan(
        window,
        picked.top.map((x) => ({ label: `${x.date.year}-${String(x.date.month).padStart(2, '0')}-${String(x.date.day).padStart(2, '0')} ${x.ko}일`, ganzhiKo: x.ko, score: x.purposeScore, stars: x.purposeStars, reasons: reasonsOf(x.stemTenGod, x.tags, x.relations.map((r) => r.label)) })),
      );
      whenKo = input.when.date;
      break;
    }
  }

  const verdict = verdictOf(window.score);
  return {
    topic: input.topic,
    topicKo: meta.ko,
    when: input.when,
    whenKo,
    window,
    verdict,
    verdictKo: SAJU_ASK_VERDICT_KO[verdict],
    alternatives,
    basis: basisOf(chart, meta),
    themeSummary: themeSummaryOf(chart, meta),
    luckNote: luckNoteOf(chart),
  };
};

const windowLine = (w: SajuAskWindow): string => `${w.label} ${w.score}점(${'★'.repeat(w.stars)}) — ${w.reasons.join(' / ')}`;

/** LLM 사실 블록(서버 프롬프트). 자유 텍스트는 여기 넣지 않는다 — 프롬프트가 [질문] 블록으로 따로 넣는다. */
export const sajuAskFactLines = (f: SajuAskFacts): string[] => [
  `주제: ${f.topicKo} / 시점: ${f.whenKo}`,
  `시점 점수(계산): ${windowLine(f.window)} → 판정 ${f.verdictKo}`,
  `더 좋은 시점(계산): ${f.alternatives.length ? f.alternatives.map(windowLine).join(' | ') : '없음 — 요청 시점이 이미 상위'}`,
  `원국 근거: ${f.basis.join(' / ')}`,
  ...(f.themeSummary.length ? [`테마 요약: ${f.themeSummary.join(' / ')}`] : []),
  `대운: ${f.luckNote}`,
];
