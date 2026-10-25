// 등산 "오늘의 조건"(3차) — 코스 날씨(정상 기온 추정·체감)·산불위험·대기·해 지기 전 하산을 고른 날짜·출발 시각의 산행 시간대로
// 접는 순수 규칙. 서버 응답(GET /v1/hiking/courses/:id/conditions)은 3일치 원자료를 주고, 웹이 날짜·출발 시각을 바꿀 때마다
// 여기서 다시 접는다(4차 추천도 같은 규칙을 쓴다). docs/PLAN-hiking.md §3차
import { formatHikingDuration } from './hiking.js';

const round1 = (v: number): number => Math.round(v * 10) / 10;
const HOUR_MS = 3_600_000;

// ── 정상 기온 ──────────────────────────────────────────────────────────────────
// 단기예보 격자(5km) 기온을 코스 가장 높은 곳으로 옮긴다 — 100m 오를 때마다 0.6°C(표준 감률). 격자의 모델 고도는 알 수 없어
// 들머리(코스 시작) 고도를 기준으로 본다. 화면에는 "추정"으로 적는다.
export const HIKING_LAPSE_C_PER_100M = 0.6;
export const estimateTopTemp = (tmp: number | null, refEle: number | null, topEle: number | null): number | null => {
  if (tmp === null) return null;
  if (refEle === null || topEle === null || topEle <= refEle) return tmp;
  return round1(tmp - (HIKING_LAPSE_C_PER_100M * (topEle - refEle)) / 100);
};

// 체감온도 — 기상청 겨울철 식(JAG/TI). 기온 10°C 이하·풍속 4.8km/h(1.3m/s) 이상에서만 쓰고, 그 밖은 기온 그대로.
export const windChillC = (t: number | null, wsdMs: number | null): number | null => {
  if (t === null) return null;
  if (wsdMs === null) return t;
  const v = wsdMs * 3.6;
  if (t > 10 || v < 4.8) return t;
  const p = v ** 0.16;
  return round1(13.12 + 0.6215 * t - 11.37 * p + 0.3965 * p * t);
};

// ── 산행 시간대 날씨 ────────────────────────────────────────────────────────────
export interface HikingHourLike {
  // 그 시각부터 한 시간(단기예보 한 칸).
  at: string;
  tmp: number | null;
  // 코스 가장 높은 곳 추정 기온(estimateTopTemp).
  topTmp: number | null;
  sky: number | null;
  pty: number | null;
  pop: number | null;
  wsd: number | null;
}

export interface HikingWindowWeather {
  hours: number;
  tmpMin: number | null;
  tmpMax: number | null;
  topTmpMin: number | null;
  // 가장 높은 곳 추정 기온·그 시각 바람으로 낸 가장 낮은 체감.
  topChillMin: number | null;
  popMax: number | null;
  // 비·눈이 오는 칸 수와 가장 잦은 강수형태(1 비 · 2 비/눈 · 3 눈 · 4 소나기).
  wetHours: number;
  pty: number | null;
  windMax: number | null;
  // 가장 흐린 하늘(1 맑음 · 3 구름많음 · 4 흐림).
  sky: number | null;
}

const minOf = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length > 0 ? Math.min(...v) : null;
};
const maxOf = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length > 0 ? Math.max(...v) : null;
};

// [fromMs, toMs) 과 겹치는 칸만. 겹치는 칸이 없으면 null(예보 범위 밖).
export const summarizeHikingWeather = (hours: readonly HikingHourLike[], fromMs: number, toMs: number): HikingWindowWeather | null => {
  const inside = hours.filter((h) => {
    const t = Date.parse(h.at);
    return Number.isFinite(t) && t < toMs && t + HOUR_MS > fromMs;
  });
  if (inside.length === 0) return null;
  const ptyCount = new Map<number, number>();
  for (const h of inside) if (h.pty !== null && h.pty > 0) ptyCount.set(h.pty, (ptyCount.get(h.pty) ?? 0) + 1);
  let pty: number | null = inside.some((h) => h.pty !== null) ? 0 : null;
  let best = 0;
  for (const [k, c] of ptyCount) if (c > best) [best, pty] = [c, k];
  return {
    hours: inside.length,
    tmpMin: minOf(inside.map((h) => h.tmp)),
    tmpMax: maxOf(inside.map((h) => h.tmp)),
    topTmpMin: minOf(inside.map((h) => h.topTmp)),
    topChillMin: minOf(inside.map((h) => windChillC(h.topTmp, h.wsd))),
    popMax: maxOf(inside.map((h) => h.pop)),
    wetHours: [...ptyCount.values()].reduce((s, c) => s + c, 0),
    pty,
    windMax: maxOf(inside.map((h) => h.wsd)),
    sky: maxOf(inside.map((h) => h.sky)),
  };
};

// ── 산불위험 ────────────────────────────────────────────────────────────────────
// 산림청 산불위험예보(시군구, 3시간 간격 분석·예보)의 등급별 면적(d1~d4, %). 면적이 조금이라도 있는 가장 높은 등급을 그
// 시군구의 등급으로 보고 그 면적을 함께 적는다(경계값을 우리가 정하지 않는다).
export const HIKING_FIRE_LEVELS = [1, 2, 3, 4] as const;
export type HikingFireLevel = (typeof HIKING_FIRE_LEVELS)[number];
export const HIKING_FIRE_LABEL: Record<HikingFireLevel, string> = { 1: '낮음', 2: '다소높음', 3: '높음', 4: '매우높음' };

export interface HikingFireSlotLike {
  // 분석·예보 시각(그 시각부터 3시간을 대표한다).
  at: string;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
}

export const hikingFireLevel = (s: Pick<HikingFireSlotLike, 'd1' | 'd2' | 'd3' | 'd4'>): { level: HikingFireLevel; sharePct: number } => {
  if (s.d4 > 0) return { level: 4, sharePct: s.d4 };
  if (s.d3 > 0) return { level: 3, sharePct: s.d3 };
  if (s.d2 > 0) return { level: 2, sharePct: s.d2 };
  return { level: 1, sharePct: s.d1 };
};

export const HIKING_FIRE_SLOT_MS = 3 * HOUR_MS;

export interface HikingFireAreaLike {
  name: string;
  slots: readonly HikingFireSlotLike[];
}

export interface HikingWindowFire {
  level: HikingFireLevel;
  sharePct: number;
  // 그 등급이 나온 시군구·시각.
  area: string;
  at: string;
}

// 산행 시간대와 겹치는 칸(3시간) 중 가장 높은 등급. 같은 등급이면 면적이 큰 것. 겹치는 칸이 없으면 null.
export const hikingFireInWindow = (areas: readonly HikingFireAreaLike[], fromMs: number, toMs: number): HikingWindowFire | null => {
  let best: HikingWindowFire | null = null;
  for (const a of areas) {
    for (const s of a.slots) {
      const t = Date.parse(s.at);
      if (!Number.isFinite(t) || t >= toMs || t + HIKING_FIRE_SLOT_MS <= fromMs) continue;
      const f = hikingFireLevel(s);
      if (!best || f.level > best.level || (f.level === best.level && f.sharePct > best.sharePct)) {
        best = { ...f, area: a.name, at: s.at };
      }
    }
  }
  return best;
};

// ── 해 지기 전 하산 ─────────────────────────────────────────────────────────────
// 하산 마감 = 일몰 − 예상 시간 − 여유 30분(docs/PLAN-hiking.md §계산 규칙). 여유 안쪽이면 빠듯, 일몰을 넘기면 어두워진다.
export const HIKING_SUNSET_BUFFER_MIN = 30;
export type HikingDaylightStatus = 'ok' | 'tight' | 'dark';

export interface HikingDaylight {
  endAt: Date;
  // 늦어도 이때 출발 — 일몰을 모르면 null.
  latestStartAt: Date | null;
  // 일몰까지 남는 분(음수면 일몰 뒤 하산).
  marginMin: number | null;
  status: HikingDaylightStatus | null;
  // 해 뜨기 전 출발.
  beforeSunrise: boolean;
}

export const hikingDaylight = (startAt: Date, outingMin: number, sun: { sunrise: Date | null; sunset: Date | null }): HikingDaylight => {
  const endAt = new Date(startAt.getTime() + outingMin * 60_000);
  const sunset = sun.sunset;
  const marginMin = sunset ? Math.round((sunset.getTime() - endAt.getTime()) / 60_000) : null;
  return {
    endAt,
    latestStartAt: sunset ? new Date(sunset.getTime() - (outingMin + HIKING_SUNSET_BUFFER_MIN) * 60_000) : null,
    marginMin,
    status: marginMin === null ? null : marginMin >= HIKING_SUNSET_BUFFER_MIN ? 'ok' : marginMin >= 0 ? 'tight' : 'dark',
    beforeSunrise: sun.sunrise !== null && startAt.getTime() < sun.sunrise.getTime(),
  };
};

// ── 주의할 점 ────────────────────────────────────────────────────────────────────
// 한 줄씩. warn 은 계획을 바꿀 만한 것, info 는 챙길 것. 기준(우리가 정한 값): 강수확률 60%, 바람 9m/s(기상청 풍속 구간의
// "강함" — 정상은 더 세다), 정상 영하, 체감 −10°C, 더위 30°C, 산불 높음 이상(warn)·다소높음(info), 대기 나쁨.
export const HIKING_CAUTION_RULE = {
  popFrom: 60,
  windFromMs: 9,
  freezeAtC: 0,
  chillBelowC: -10,
  hotFromC: 30,
  fireWarnFrom: 3,
  airWarnFrom: 3,
} as const;

export interface HikingCaution {
  level: 'warn' | 'info';
  text: string;
}

export interface HikingCautionInput {
  weather: HikingWindowWeather | null;
  fire: HikingWindowFire | null;
  // 대기 등급(1 좋음 · 2 보통 · 3 나쁨 · 4 매우나쁨) — 미세먼지·초미세먼지 중 나쁜 쪽.
  airGrade: number | null;
  daylight: HikingDaylight | null;
}

const hm = (d: Date): string => {
  const k = new Date(d.getTime() + 9 * HOUR_MS);
  return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
};
const PTY_WORD: Record<number, string> = { 1: '비', 2: '비나 눈', 3: '눈', 4: '소나기' };

export const hikingCautions = (i: HikingCautionInput): HikingCaution[] => {
  const R = HIKING_CAUTION_RULE;
  const out: HikingCaution[] = [];
  const d = i.daylight;
  if (d?.status === 'dark' && d.latestStartAt) {
    out.push({ level: 'warn', text: `해 지기 전에 내려오기 어렵습니다 — ${hm(d.latestStartAt)}까지 출발하세요` });
  } else if (d?.status === 'tight' && d.marginMin !== null) {
    out.push({ level: 'warn', text: `일몰 ${formatHikingDuration(Math.max(d.marginMin, 5))} 전에야 내려옵니다 — 여유가 빠듯합니다` });
  }
  if (d?.beforeSunrise) out.push({ level: 'info', text: '해 뜨기 전 출발 — 전등을 챙기세요' });
  const w = i.weather;
  if (w) {
    if (w.wetHours > 0 && w.pty) out.push({ level: 'warn', text: `${PTY_WORD[w.pty] ?? '비'} 예보(${w.wetHours}시간)` });
    else if (w.popMax !== null && w.popMax >= R.popFrom) out.push({ level: 'warn', text: `강수확률 ${w.popMax}%` });
    if (w.windMax !== null && w.windMax >= R.windFromMs) {
      out.push({ level: 'warn', text: `바람 ${w.windMax}m/s — 능선·정상은 더 셉니다` });
    }
    if (w.topChillMin !== null && w.topChillMin <= R.chillBelowC) {
      out.push({ level: 'warn', text: `정상 체감 ${w.topChillMin}°C(추정) — 방한 장비가 필요합니다` });
    } else if (w.topTmpMin !== null && w.topTmpMin <= R.freezeAtC) {
      out.push({ level: 'info', text: `정상 영하(추정 ${w.topTmpMin}°C) — 길이 얼 수 있습니다` });
    }
    if (w.tmpMax !== null && w.tmpMax >= R.hotFromC) out.push({ level: 'info', text: `낮 기온 ${w.tmpMax}°C — 물을 넉넉히` });
  }
  const f = i.fire;
  if (f && f.level >= R.fireWarnFrom) {
    out.push({ level: 'warn', text: `산불위험 ${HIKING_FIRE_LABEL[f.level]}(${f.area} ${f.sharePct}%) — 입산 통제·화기 금지를 확인하세요` });
  } else if (f && f.level === 2) {
    out.push({ level: 'info', text: `산불위험 다소높음(${f.area} ${f.sharePct}%) — 화기 금지` });
  }
  if (i.airGrade !== null && i.airGrade >= R.airWarnFrom) {
    out.push({ level: 'warn', text: `미세먼지 ${i.airGrade >= 4 ? '매우나쁨' : '나쁨'}` });
  }
  return out;
};
