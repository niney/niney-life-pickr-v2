import { useState, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import type { HikingConditionsType, HikingCourseDetailType } from '@repo/api-contract';
import { useHikingConditions } from '@repo/shared';
import {
  AIR_GRADE_LABEL,
  HIKING_FIRE_LABEL,
  formatHikingDuration,
  formatHikingEle,
  hikingCautions,
  hikingDaylight,
  hikingFireInWindow,
  kmaPtyLabel,
  kmaSkyLabel,
  summarizeHikingWeather,
  type AirGradeLevel,
  type HikingDaylightStatus,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { HIKING_DEFAULT_START_MIN, hikingDayLabel, hikingDefaultPick, hikingStartsFor, isoHm, kstHm, minToHm, startMs } from './hikingFormat';

// 코스 상세의 "산행 조건" 카드(3차) — 오늘·내일·모레 중 날짜와 출발 시각을 고르면 그 산행 시간대(출발 ~ 출발 + 예상 시간)로
// 날씨(가장 높은 곳 추정 기온·체감)·대기·산불위험·해 지기 전 하산을 접어 주의할 점을 한 줄씩 보인다. 서버는 3일치를 한 번에 주고
// 날짜·시각을 바꿔도 다시 받지 않는다(@repo/utils hikingConditions). docs/PLAN-hiking.md §3차

// 예상 시간이 없는 코스(고도 없음)는 날씨만 이만큼 본다.
const FALLBACK_WINDOW_MIN = 240;

const worstGrade = (...gs: (number | null)[]): AirGradeLevel | null => {
  const v = gs.filter((g): g is number => g !== null);
  return v.length > 0 ? (Math.max(...v) as AirGradeLevel) : null;
};

const STATUS_CHIP: Record<HikingDaylightStatus, { label: string; cls: string }> = {
  ok: { label: '해 지기 전 하산', cls: 'bg-green-500/10 text-green-700 dark:text-green-300' },
  tight: { label: '일몰 직전 하산', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  dark: { label: '해 진 뒤 하산', cls: 'bg-red-500/10 text-red-700 dark:text-red-300' },
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex gap-2">
    <dt className="w-14 shrink-0 text-muted-foreground">{label}</dt>
    <dd className="min-w-0 flex-1">{children}</dd>
  </div>
);

interface Choice {
  day: number;
  startMin: number;
}

const ConditionsBody = ({ course, data }: { course: HikingCourseDetailType; data: HikingConditionsType }) => {
  // 렌더 중 Date.now() 를 부르지 않게 처음 그린 시각을 잡아 둔다(오늘 지난 시각 거르기·기본 출발).
  const [openedAt] = useState(() => Date.now());
  const [pick, setPick] = useState<Choice | null>(null);
  const days = data.days;
  const cur = pick ?? hikingDefaultPick(days.map((d) => d.date), openedAt);
  const day = days[cur.day];
  if (!day) return null;
  const starts = hikingStartsFor(day.date, cur.day, openedAt);

  const selectDay = (i: number) => {
    const next = days[i];
    if (!next) return;
    const allowed = hikingStartsFor(next.date, i, openedAt);
    setPick({ day: i, startMin: allowed.includes(cur.startMin) ? cur.startMin : (allowed[0] ?? HIKING_DEFAULT_START_MIN) });
  };

  const outingMin = course.roundTripMin ?? course.timeMin;
  const from = startMs(day.date, cur.startMin);
  const to = from + (outingMin ?? FALLBACK_WINDOW_MIN) * 60_000;
  const weather = data.weather ? summarizeHikingWeather(data.weather.hours, from, to) : null;
  const fire = data.fire ? hikingFireInWindow(data.fire.areas, from, to) : null;
  const forecast = data.air?.forecast.find((f) => f.date === day.date) ?? null;
  const airNow = cur.day === 0 && data.air?.station ? data.air : null;
  const airGrade = airNow ? worstGrade(airNow.pm10Grade, airNow.pm25Grade) : forecast ? worstGrade(forecast.pm10Grade, forecast.pm25Grade) : null;
  const sun = { sunrise: day.sunrise ? new Date(day.sunrise) : null, sunset: day.sunset ? new Date(day.sunset) : null };
  const daylight = outingMin !== null ? hikingDaylight(new Date(from), outingMin, sun) : null;
  const cautions = hikingCautions({ weather, fire, airGrade, daylight });

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="산행 날짜" className="flex gap-1">
          {days.map((d, i) => (
            <button
              key={d.date}
              type="button"
              onClick={() => selectDay(i)}
              aria-pressed={i === cur.day}
              disabled={hikingStartsFor(d.date, i, openedAt).length === 0}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs disabled:opacity-40',
                i === cur.day ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {hikingDayLabel(d.date, i)}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">출발</span>
          <select
            aria-label="출발 시각"
            value={cur.startMin}
            onChange={(e) => setPick({ day: cur.day, startMin: Number(e.target.value) })}
            className="rounded-md border bg-background px-1.5 py-0.5 tabular-nums"
          >
            {starts.map((m) => (
              <option key={m} value={m}>
                {minToHm(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {daylight && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm" data-testid="hiking-daylight">
          <span className="tabular-nums">
            {minToHm(cur.startMin)} 출발 → <span className="font-semibold">{kstHm(daylight.endAt.getTime())}</span> 하산 예상
          </span>
          {daylight.status && <span className={cn('rounded px-1.5 text-xs font-medium', STATUS_CHIP[daylight.status].cls)}>{STATUS_CHIP[daylight.status].label}</span>}
          <span className="w-full text-xs text-muted-foreground tabular-nums">
            일몰 {isoHm(day.sunset)}
            {daylight.marginMin !== null && daylight.marginMin >= 0 && ` · 여유 ${formatHikingDuration(Math.max(daylight.marginMin, 5))}`}
            {daylight.latestStartAt && ` · 늦어도 ${kstHm(daylight.latestStartAt.getTime())}에 출발(일몰 30분 전 하산)`}
          </span>
        </div>
      )}
      {outingMin === null && <p className="text-xs text-muted-foreground">예상 시간이 없는 코스라 해 지기 전 하산은 판단하지 못했습니다(날씨는 출발 뒤 4시간).</p>}

      {cautions.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="hiking-cautions">
          {cautions.map((c) => (
            <li key={c.text} className={cn('flex items-start gap-1.5 text-xs', c.level === 'warn' ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}>
              {c.level === 'warn' ? <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" /> : <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        weather && <p className="text-xs text-muted-foreground">고른 시간대에 비·강풍·추위·산불·미세먼지로 주의할 신호가 없습니다.</p>
      )}

      <dl className="flex flex-col gap-1 text-xs">
        <Row label="날씨">
          {weather ? (
            <span>
              {weather.pty ? kmaPtyLabel(weather.pty) : kmaSkyLabel(weather.sky)}
              {weather.tmpMin !== null && ` · 들머리 ${weather.tmpMin === weather.tmpMax ? weather.tmpMin : `${weather.tmpMin}~${weather.tmpMax}`}°C`}
              {weather.topTmpMin !== null && data.topEle !== null && (
                <>
                  {' · '}가장 높은 곳({formatHikingEle(data.topEle)}) {weather.topTmpMin}°C
                  {weather.topChillMin !== null && weather.topChillMin < weather.topTmpMin && `(체감 ${weather.topChillMin}°C)`}
                  <span className="text-muted-foreground"> 추정</span>
                </>
              )}
              {weather.popMax !== null && ` · 강수확률 ${weather.popMax}%`}
              {weather.windMax !== null && ` · 바람 ${weather.windMax}m/s`}
            </span>
          ) : (
            <span className="text-muted-foreground">{data.errors.weather ?? '고른 시간대의 단기예보가 없습니다.'}</span>
          )}
        </Row>
        <Row label="대기">
          {airNow ? (
            <span>
              미세먼지 {airNow.pm10Grade ? AIR_GRADE_LABEL[airNow.pm10Grade] : '—'}
              {airNow.pm10 !== null && ` ${airNow.pm10}`} · 초미세먼지 {airNow.pm25Grade ? AIR_GRADE_LABEL[airNow.pm25Grade] : '—'}
              {airNow.pm25 !== null && ` ${airNow.pm25}`}
              <span className="text-muted-foreground">
                {' '}
                지금, {airNow.station!.name} 측정소({(airNow.station!.distM / 1000).toFixed(0)}km)
              </span>
            </span>
          ) : forecast ? (
            <span>
              예보 미세먼지 {forecast.pm10Grade ? AIR_GRADE_LABEL[forecast.pm10Grade] : '—'} · 초미세먼지 {forecast.pm25Grade ? AIR_GRADE_LABEL[forecast.pm25Grade] : '—'}
              <span className="text-muted-foreground"> {data.air!.regions.join('·')} 권역</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{data.errors.air ?? (cur.day === 0 ? '가까운 측정소 값이 없습니다.' : '이 날의 대기 예보가 아직 없습니다.')}</span>
          )}
        </Row>
        <Row label="산불위험">
          {fire ? (
            <span>
              {HIKING_FIRE_LABEL[fire.level]}
              {fire.level > 1 && ` ${fire.sharePct}%`}
              <span className="text-muted-foreground"> {fire.level > 1 ? fire.area : data.fire!.areas.map((a) => a.name).join('·')}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{data.errors.fire ?? '고른 시간대의 산불위험예보가 없습니다.'}</span>
          )}
        </Row>
        <Row label="해">
          <span className="tabular-nums">
            일출 {isoHm(day.sunrise)} · 일몰 {isoHm(day.sunset)}
          </span>
        </Row>
      </dl>
      <p className="text-[11px] text-muted-foreground">
        기상청 단기예보(들머리 격자{data.weather?.base ? ` · ${Number(data.weather.base.time.slice(0, 2))}시 발표` : ''}) · 에어코리아 · 산림청 산불위험예보. 가장 높은 곳
        기온은 들머리에서 100m 오를 때마다 0.6°C 낮춘 추정이고, 산불은 시군구 면적 중 그 등급의 비율입니다.
      </p>
    </>
  );
};

export const CourseConditions = ({ course }: { course: HikingCourseDetailType }) => {
  const q = useHikingConditions(course.id);
  return (
    <section className="flex flex-col gap-2 rounded-md border p-3" data-testid="hiking-conditions" aria-label="산행 조건">
      <h3 className="text-sm font-semibold">산행 조건</h3>
      {q.data ? (
        <ConditionsBody key={course.id} course={course} data={q.data} />
      ) : q.isError ? (
        <p className="text-xs text-muted-foreground">산행 조건을 불러오지 못했습니다.</p>
      ) : (
        <p className="text-xs text-muted-foreground">날씨·대기·산불위험을 불러오는 중…</p>
      )}
    </section>
  );
};
