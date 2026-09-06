// 택일 — 날짜 범위(최대 60일)를 내 사주로 채점해 용도별 상위 3일을 고른다. "선택을 대신 골라주는" 갈래.
// 기본 점수는 오늘의 운세(sajuDaily)와 같고, 용도(이사·계약·면접·여행·데이트)마다 태그 가중을 얹는다.

import { scoreDayForChart, type SajuDayScore, type SajuDayTag } from './sajuDaily.js';
import type { SajuChart } from './saju.js';

export type SajuDatePurpose = 'general' | 'move' | 'contract' | 'interview' | 'trip' | 'date';
export const SAJU_DATE_PURPOSES: readonly SajuDatePurpose[] = ['general', 'move', 'contract', 'interview', 'trip', 'date'];
export const SAJU_DATE_PURPOSE_LABEL: Record<SajuDatePurpose, string> = {
  general: '좋은 날',
  move: '이사',
  contract: '계약·개업',
  interview: '면접·시험',
  trip: '여행',
  date: '데이트·만남',
};
export const SAJU_DATE_PICK_MAX_DAYS = 60;
export const SAJU_DATE_PICK_TOP = 3;

interface PurposeRule {
  tags: Partial<Record<SajuDayTag, number>>;
  gods: Partial<Record<SajuDayScore['stemTenGod'], number>>;
}
const RULES: Record<SajuDatePurpose, PurposeRule> = {
  general: { tags: {}, gods: {} },
  move: { tags: { 'son-eomneun': 10, clash: -5, yeokma: 3 }, gods: {} },
  contract: { tags: { break: -6, void: -4 }, gods: { jeongjae: 8, jeonggwan: 6, geopjae: -6, pyeonjae: 3 } },
  interview: { tags: { munchang: 6, cheoneul: 3, wonjin: -3 }, gods: { jeonggwan: 8, jeongin: 8, sanggwan: -4 } },
  trip: { tags: { yeokma: 8, clash: -4, punish: -3 }, gods: { siksin: 4, pyeonjae: 4 } },
  date: { tags: { dohwa: 8, 'six-combine': 5, wonjin: -6, harm: -3 }, gods: { jeongjae: 3, jeonggwan: 3, siksin: 3 } },
};

export interface SajuDatePickDay extends SajuDayScore {
  purposeScore: number;
  purposeStars: 1 | 2 | 3 | 4 | 5;
}

export interface SajuDatePickResult {
  purpose: SajuDatePurpose;
  fromDayNumber: number;
  days: readonly SajuDatePickDay[];
  top: readonly SajuDatePickDay[];
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const stars = (s: number): 1 | 2 | 3 | 4 | 5 => (s >= 80 ? 5 : s >= 65 ? 4 : s >= 50 ? 3 : s >= 35 ? 2 : 1);

/** 시작 일수부터 days 일(≤ 60)을 채점. */
export const pickDates = (chart: SajuChart, fromDayNumber: number, days: number, purpose: SajuDatePurpose): SajuDatePickResult => {
  const n = clamp(Math.floor(days), 1, SAJU_DATE_PICK_MAX_DAYS);
  const rule = RULES[purpose];
  const list: SajuDatePickDay[] = [];
  for (let i = 0; i < n; i++) {
    const base = scoreDayForChart(chart, fromDayNumber + i);
    let s = base.score;
    for (const t of base.tags) s += rule.tags[t] ?? 0;
    s += rule.gods[base.stemTenGod] ?? 0;
    const purposeScore = Math.round(clamp(s, 5, 99));
    list.push({ ...base, purposeScore, purposeStars: stars(purposeScore) });
  }
  const top = [...list].sort((a, b) => b.purposeScore - a.purposeScore || a.dayNumber - b.dayNumber).slice(0, SAJU_DATE_PICK_TOP);
  return { purpose, fromDayNumber, days: list, top };
};
