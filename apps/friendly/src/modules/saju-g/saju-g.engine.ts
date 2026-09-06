import { Temporal } from '@js-temporal/polyfill';
import KoreanLunarCalendar from 'korean-lunar-calendar';
import { Solar } from 'lunar-typescript';
import type {
  CreateSajuGReadingInputType,
  SajuGBirthType,
  SajuGChartType,
} from '@repo/api-contract';
import {
  SAJU_G_BRANCHES,
  SAJU_G_ELEMENTS,
  SAJU_G_ELEMENT_META,
  SAJU_GOD_MEANING,
  SAJU_G_PILLAR_LABEL,
  SAJU_G_STEMS,
  sajuGPronunciation,
  sajuGTenGod,
} from '@repo/utils';

export const SAJU_G_CALCULATION_VERSION = 1;
export class SajuGInputError extends Error {}
const pad = (v: number) => String(v).padStart(2, '0');
const dateText = (v: { year: number; month: number; day: number }) =>
  `${v.year}-${pad(v.month)}-${pad(v.day)}`;
const solarAt = (v: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}) => Solar.fromYmdHms(v.year, v.month, v.day, v.hour, v.minute, v.second);
const utc8 = (t: Temporal.Instant) => t.toZonedDateTimeISO('+08:00');
const keys = ['year', 'month', 'day', 'hour'] as const;

// IANA Asia/Seoul 표준 오프셋 변경. 입력의 DST는 Temporal이 실제 순간으로 해석한다.
// 그 순간에 당시 표준 오프셋을 더해 일주·시주용 시계를 얻는다. 절입 비교에는 UTC+8을 사용한다.
export function standardOffsetSeconds(t: Temporal.Instant): number {
  const ms = t.epochMilliseconds;
  if (ms < Date.parse('1908-03-31T15:32:08Z')) return 8 * 3600 + 27 * 60 + 52;
  if (ms < Date.parse('1911-12-31T15:30:00Z')) return 8.5 * 3600;
  if (ms < Date.parse('1954-03-20T15:00:00Z')) return 9 * 3600;
  if (ms < Date.parse('1961-08-09T15:30:00Z')) return 8.5 * 3600;
  return 9 * 3600;
}
const standardClock = (t: Temporal.Instant) =>
  t
    .toZonedDateTimeISO('UTC')
    .add({ seconds: standardOffsetSeconds(t) })
    .toPlainDateTime();

export function normalizeSajuGDate(
  birth: SajuGBirthType,
  now = new Date(),
): { solarDate: string; lunarDate: string } {
  const [year, month, day] = birth.date.split('-').map(Number) as [number, number, number];
  const calendar = new KoreanLunarCalendar();
  const ok =
    birth.calendar === 'lunar'
      ? calendar.setLunarDate(year, month, day, birth.leapMonth)
      : calendar.setSolarDate(year, month, day);
  if (!ok)
    throw new SajuGInputError('존재하지 않는 날짜이거나 윤달이에요. 생년월일을 확인해 주세요.');
  const solarDate = dateText(calendar.getSolarCalendar());
  const today = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO('Asia/Seoul')
    .toPlainDate()
    .toString();
  if (solarDate < '1900-01-01' || solarDate > today)
    throw new SajuGInputError('대한민국에서 1900년부터 오늘까지 태어난 분의 사주를 지원해요.');
  const lunar = calendar.getLunarCalendar();
  return {
    solarDate,
    lunarDate: `${lunar.year}.${pad(lunar.month)}.${pad(lunar.day)}${lunar.intercalation ? ' (윤달)' : ''}`,
  };
}

function birthInstants(date: string, birth: SajuGBirthType): Temporal.Instant[] {
  const times =
    birth.timeAccuracy === 'exact'
      ? [`${birth.time}:00`, `${birth.time}:59`]
      : Array.from({ length: birth.timeAccuracy === 'unknown' ? 24 : 6 }, (_, i) => {
          const start =
            birth.timeAccuracy === 'unknown'
              ? 0
              : { night: 0, morning: 6, afternoon: 12, evening: 18 }[birth.timeRange!];
          return `${pad(start + i)}:00:00`;
        }).flatMap((t) => [t, t.replace(':00:00', ':59:59')]);
  const found = new Map<number, Temporal.Instant>();
  for (const time of times) {
    const plain = Temporal.PlainDateTime.from(`${date}T${time}`);
    const choices =
      birth.timeAccuracy === 'exact' ? [birth.disambiguation] : (['earlier', 'later'] as const);
    for (const disambiguation of choices) {
      try {
        const zoned = plain.toZonedDateTime('Asia/Seoul', { disambiguation });
        if (!zoned.toPlainDateTime().equals(plain)) {
          if (birth.timeAccuracy === 'exact')
            throw new SajuGInputError(
              '시계가 앞당겨진 날의 존재하지 않는 시각이에요. 시간을 확인해 주세요.',
            );
          continue;
        }
        found.set(zoned.epochMilliseconds, zoned.toInstant());
      } catch (error) {
        if (error instanceof SajuGInputError) throw error;
        if (birth.timeAccuracy === 'exact')
          throw new SajuGInputError(
            '당시 시계 변경으로 없거나 두 번 나타나는 시각이에요. 고급 설정에서 시각 구분을 선택하거나 시간을 다시 확인해 주세요.',
          );
      }
    }
  }
  if (!found.size)
    throw new SajuGInputError('이 날짜와 시간대를 확인할 수 없어요. 입력을 확인해 주세요.');
  return [...found.values()].sort((a, b) => a.epochMilliseconds - b.epochMilliseconds);
}

function pillarsAt(t: Temporal.Instant, boundary: SajuGBirthType['dayBoundary']) {
  const china = solarAt(utc8(t)).getLunar();
  const clock = standardClock(t);
  const local = solarAt(clock).getLunar();
  const nextDay = boundary === 'zi' && clock.hour === 23 ? 1 : 0;
  const stem = (local.getDayGanIndexExact2() + nextDay) % 10;
  const branch = (local.getDayZhiIndexExact2() + nextDay) % 12;
  const hourBranch = Math.floor((clock.hour + 1) / 2) % 12;
  return {
    year: china.getYearInGanZhiExact(),
    month: china.getMonthInGanZhiExact(),
    day: SAJU_G_STEMS[stem]!.hanja + SAJU_G_BRANCHES[branch]!.hanja,
    hour:
      SAJU_G_STEMS[((stem % 5) * 2 + hourBranch) % 10]!.hanja + SAJU_G_BRANCHES[hourBranch]!.hanja,
  };
}

const TERM_NAMES = [
  '小寒',
  '立春',
  '惊蛰',
  '清明',
  '立夏',
  '芒种',
  '小暑',
  '立秋',
  '白露',
  '寒露',
  '立冬',
  '大雪',
];
const TERM_KO = [
  '소한',
  '입춘',
  '경칩',
  '청명',
  '입하',
  '망종',
  '소서',
  '입추',
  '백로',
  '한로',
  '입동',
  '대설',
];
const termInstant = (s: Solar) => Temporal.Instant.from(`${s.toYmdHms().replace(' ', 'T')}+08:00`);
const monthlyCache = new Map<
  number,
  { month: number; term: string; instant: Temporal.Instant }[]
>();
export function sajuGMonthBoundaries(year: number) {
  const hit = monthlyCache.get(year);
  if (hit) return hit;
  const table = Solar.fromYmd(year, 7, 1).getLunar().getJieQiTable();
  const terms = TERM_NAMES.map((name, i) => {
    const solar = table[name];
    if (!solar || solar.getYear() !== year) throw new Error(`solar term missing: ${year}/${name}`);
    return { month: i + 1, term: TERM_KO[i]!, instant: termInstant(solar) };
  });
  if (monthlyCache.size > 130) monthlyCache.clear();
  monthlyCache.set(year, terms);
  return terms;
}

function periodFor(
  kind: CreateSajuGReadingInputType['kind'],
  dayStem: string | null,
  boundary: SajuGBirthType['dayBoundary'],
  now: Date,
): SajuGChartType['period'] {
  const today = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO('Asia/Seoul');
  if (kind === 'natal')
    return {
      kind,
      label: '타고난 나의 지도',
      key: 'natal',
      ganZhi: null,
      relation: null,
      months: [],
    };
  if (kind === 'daily') {
    // 일별 결과는 날짜 시작 기준으로 고정한다. 실제 열람 시각에 따라 바뀌지 않는다.
    const day = today.toPlainDate().toString();
    const t = Temporal.Instant.from(`${day}T12:00:00+09:00`);
    const ganZhi = pillarsAt(t, boundary).day;
    return {
      kind,
      label: `${today.month}월 ${today.day}일의 흐름`,
      key: day,
      ganZhi,
      relation: sajuGTenGod(dayStem, ganZhi[0]!),
      months: [],
    };
  }
  const terms = sajuGMonthBoundaries(today.year);
  const next = sajuGMonthBoundaries(today.year + 1)[0]!;
  const yearGanZhi = pillarsAt(terms[1]!.instant.add({ seconds: 60 }), boundary).year;
  const months = terms.map((term, i) => {
    const ganZhi = pillarsAt(term.instant.add({ seconds: 60 }), boundary).month;
    const relation = sajuGTenGod(dayStem, ganZhi[0]!);
    return {
      month: term.month,
      term: term.term,
      start: term.instant.toZonedDateTimeISO('Asia/Seoul').toPlainDateTime().toString(),
      end: (terms[i + 1] ?? next).instant
        .toZonedDateTimeISO('Asia/Seoul')
        .toPlainDateTime()
        .toString(),
      ganZhi,
      relation,
      description: relation
        ? `이 시기의 키워드는 ‘${SAJU_GOD_MEANING[relation]}’이에요. 지금의 생활에 비추어 살펴보세요.`
        : '출생시간에 따라 일간이 달라져 개인 관계 해석은 열어 두었어요.',
    };
  });
  return {
    kind,
    label: `${today.year}년의 흐름`,
    key: String(today.year),
    ganZhi: yearGanZhi,
    relation: sajuGTenGod(dayStem, yearGanZhi[0]!),
    months,
  };
}

export function calculateSajuG(
  input: CreateSajuGReadingInputType,
  now = new Date(),
): SajuGChartType {
  const normalized = normalizeSajuGDate(input.birth, now);
  const instants = birthInstants(normalized.solarDate, input.birth);
  const snapshots = instants.map((t) => pillarsAt(t, input.birth.dayBoundary));
  const possible = Object.fromEntries(
    keys.map((key) => [key, [...new Set(snapshots.map((s) => s[key]))]]),
  ) as Record<(typeof keys)[number], string[]>;
  const dayStem = possible.day.length === 1 ? possible.day[0]![0]! : null;
  const pillars = keys.map((key) => {
    const candidates = possible[key];
    const ganZhi =
      candidates.length === 1 && !(key === 'hour' && input.birth.timeAccuracy === 'unknown')
        ? candidates[0]!
        : null;
    const stem = SAJU_G_STEMS.find((s) => s.hanja === ganZhi?.[0]);
    const branch = SAJU_G_BRANCHES.find((s) => s.hanja === ganZhi?.[1]);
    return {
      key,
      label: SAJU_G_PILLAR_LABEL[key],
      ganZhi,
      pronunciation: ganZhi ? sajuGPronunciation(ganZhi) : null,
      stemElement: stem?.element ?? null,
      branchElement: branch?.element ?? null,
      tenGod: key === 'day' ? null : sajuGTenGod(dayStem, ganZhi?.[0] ?? ''),
      candidates,
      hiddenStems: [...(branch?.hidden ?? '')].map((char) => {
        const hidden = SAJU_G_STEMS.find((s) => s.hanja === char)!;
        return {
          hanja: char,
          ko: hidden.ko,
          element: hidden.element,
          tenGod: sajuGTenGod(dayStem, char),
        };
      }),
    };
  });
  const elements = SAJU_G_ELEMENTS.map((element) => ({
    element,
    count: pillars.reduce(
      (n, p) => n + Number(p.stemElement === element) + Number(p.branchElement === element),
      0,
    ),
  }));
  const unknownCharacters = 8 - elements.reduce((n, e) => n + e.count, 0);
  const master = SAJU_G_STEMS.find((s) => s.hanja === dayStem) ?? null;
  const period = periodFor(input.kind, dayStem, input.birth.dayBoundary, now);
  const notices = [
    '대한민국 출생 · 당시 표준시(서머타임 제외) · 지역 태양시 보정 없음',
    input.birth.dayBoundary === 'midnight'
      ? '일주는 자정에 바뀌며, 23시의 시주도 해당 날짜의 일간으로 계산해요.'
      : '일주는 23시에 다음 날로 바뀌는 기준이에요.',
  ];
  if (unknownCharacters)
    notices.push(
      '입력한 시간 범위에서 달라지는 기둥은 비워 두었어요. 오행도 확인된 글자만 셌어요.',
    );
  if (possible.year.length > 1 || possible.month.length > 1)
    notices.push(
      '입춘 또는 절기 경계에 해당해요. 태어난 시각에 따라 연주·월주가 달라질 수 있어요.',
    );
  if (input.kind === 'annual')
    notices.push(
      '올해의 연주는 입춘 이후 기준이에요. 월별 카드는 양력 1일이 아닌 절기 시작부터 다음 절기까지를 나타내요.',
    );
  const timeLabel =
    input.birth.timeAccuracy === 'exact'
      ? input.birth.time!
      : input.birth.timeAccuracy === 'unknown'
        ? '태어난 시간 모름'
        : {
            night: '새벽 00~06시',
            morning: '오전 06~12시',
            afternoon: '오후 12~18시',
            evening: '저녁 18~24시',
          }[input.birth.timeRange!];
  const facts: SajuGChartType['facts'] = [
    {
      id: 'scope',
      label: '해석의 범위',
      description: unknownCharacters
        ? '시간 정보가 충분하지 않아 확정된 기둥만 설명합니다. 빈 기둥과 확정되지 않은 일간을 추정하지 않습니다.'
        : '네 기둥을 모두 계산했습니다. 전통 상징을 자기이해의 참고로 풉니다.',
    },
    ...pillars
      .filter((p) => p.ganZhi)
      .map((p) => ({
        id: `pillar-${p.key}`,
        label: `${p.label} ${p.pronunciation}`,
        description: `${p.ganZhi}, 천간 ${SAJU_G_ELEMENT_META[p.stemElement!].name}, 지지 ${SAJU_G_ELEMENT_META[p.branchElement!].name}${p.tenGod ? `, 일간과의 십성 ${p.tenGod}(${SAJU_GOD_MEANING[p.tenGod]})` : ''}`,
      })),
    ...elements.map((e) => ({
      id: `element-${e.element}`,
      label: `${SAJU_G_ELEMENT_META[e.element].name}의 구성`,
      description: `확정된 글자 중 ${e.count}개. 전통 상징은 ${SAJU_G_ELEMENT_META[e.element].meaning}. 개수가 많거나 적다는 사실만으로 좋고 나쁨·용신을 판단하지 않습니다.`,
    })),
  ];
  if (master)
    facts.push({
      id: 'day-master',
      label: `${master.ko}${SAJU_G_ELEMENT_META[master.element].name} · ${master.symbol}`,
      description: master.description,
    });
  if (period.ganZhi)
    facts.push({
      id: 'period',
      label: period.label,
      description: `${period.ganZhi}${period.relation ? `, 일간과의 관계 ${period.relation}(${SAJU_GOD_MEANING[period.relation]})` : ', 일간 미확정으로 관계 해석을 보류합니다.'}`,
    });
  return {
    calculationVersion: SAJU_G_CALCULATION_VERSION,
    ...normalized,
    timeLabel,
    standardTime:
      input.birth.timeAccuracy === 'exact' ? standardClock(instants[0]!).toString() : null,
    dayBoundary: input.birth.dayBoundary,
    pillars,
    elements,
    unknownCharacters,
    dayMaster: master,
    notices,
    facts,
    period,
  };
}
