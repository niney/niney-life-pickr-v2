import type { WeatherForecastDayType, WeatherMidResultType } from '@repo/api-contract';
import {
  KMA_CONDITION_LABEL,
  kmaCondition,
  kmaConditionFromText,
  type KmaConditionKey,
} from '@repo/utils';

// 열흘 병합 — 단기예보 일별 요약(오늘~D+3)과 중기예보(D+4~D+10)를 날짜로 이어 붙인다.
// 같은 날짜가 양쪽에 있으면 단기예보가 우선(더 최신·상세). 순수 함수 — 웹 열흘 띠·앱 열흘 목록 공용.

export interface WeatherDailyHalf {
  condition: KmaConditionKey;
  label: string;
  pop: number | null;
}

export interface WeatherDailyRow {
  date: string;
  source: 'short' | 'mid';
  am: WeatherDailyHalf | null;
  pm: WeatherDailyHalf | null;
  // 중기 D+8 이후 — 하루 한 값.
  all: WeatherDailyHalf | null;
  tmn: number | null;
  tmx: number | null;
  // 근사/오차 설명("남은 시각 기준", "오차 −1/+2").
  tmnNote: string | null;
  tmxNote: string | null;
  partial: boolean;
}

const halfFromShort = (h: { sky: number | null; pty: number | null; pop: number | null } | null): WeatherDailyHalf | null => {
  if (!h) return null;
  const condition = kmaCondition(h.sky, h.pty);
  return { condition, label: KMA_CONDITION_LABEL[condition], pop: h.pop };
};
const halfFromMid = (h: { wf: string | null; rnSt: number | null } | null): WeatherDailyHalf | null => {
  if (!h) return null;
  const condition = kmaConditionFromText(h.wf);
  return { condition, label: h.wf ?? KMA_CONDITION_LABEL[condition], pop: h.rnSt };
};
const rangeNote = (low: number | null, high: number | null): string | null =>
  low === null && high === null ? null : `오차 −${low ?? 0}/+${high ?? 0}`;

export const mergeDailyRows = (shortDays: WeatherForecastDayType[], mid: WeatherMidResultType | null): WeatherDailyRow[] => {
  const rows = new Map<string, WeatherDailyRow>();
  for (const d of shortDays) {
    rows.set(d.date, {
      date: d.date,
      source: 'short',
      am: halfFromShort(d.am),
      pm: halfFromShort(d.pm),
      all: null,
      tmn: d.tmn,
      tmx: d.tmx,
      tmnNote: d.tmnFromHours ? '남은 시각 기준' : null,
      tmxNote: d.tmxFromHours ? '남은 시각 기준' : null,
      partial: d.partial,
    });
  }
  if (mid) {
    const taByDate = new Map((mid.ta?.days ?? []).map((d) => [d.date, d]));
    const landDays = mid.land?.days ?? [];
    const dates = new Set<string>([...landDays.map((d) => d.date), ...taByDate.keys()]);
    for (const date of dates) {
      if (rows.has(date)) continue;
      const land = landDays.find((d) => d.date === date) ?? null;
      const ta = taByDate.get(date) ?? null;
      rows.set(date, {
        date,
        source: 'mid',
        am: halfFromMid(land?.am ?? null),
        pm: halfFromMid(land?.pm ?? null),
        all: halfFromMid(land?.all ?? null),
        tmn: ta?.taMin ?? null,
        tmx: ta?.taMax ?? null,
        tmnNote: ta ? rangeNote(ta.taMinLow, ta.taMinHigh) : null,
        tmxNote: ta ? rangeNote(ta.taMaxLow, ta.taMaxHigh) : null,
        partial: false,
      });
    }
  }
  return [...rows.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, 11);
};
