import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { AirHistoryPointType } from '@repo/api-contract';
import {
  airPollutantMeta,
  formatAirHourLabel,
  formatAirValue,
  type AirPollutant,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { AIR_GRADE_STYLE } from './airGrade';
import type { AirChartMetric } from './airOptions';

// 측정소 시계열 선 차트 — 인라인 SVG(차트 라이브러리 없음). 한 축만 쓴다: 같은 단위
// (㎍/㎥)인 PM10·PM2.5 는 2계열로, 나머지 항목은 단일 계열로 각자 그린다(이중 축 금지).
// 마크 규격: 2px 선, 끝점 r=4 + 2px 표면 링, 헤어라인 격자, 끝값만 직접 라벨. 호버는
// 가장 가까운 X 에 크로스헤어 + 모든 계열 값을 한 툴팁에. 키보드(←/→)도 같은 정보.
// 값은 아래 '표로 보기'에도 있어 툴팁이 유일한 경로가 아니다.

interface Series {
  key: AirPollutant;
  label: string;
  color: string; // CSS 값(var(--air-series-n))
}

const seriesFor = (metric: AirChartMetric): Series[] =>
  metric === 'pm'
    ? [
        { key: 'pm10', label: 'PM10', color: 'var(--air-series-1)' },
        { key: 'pm25', label: 'PM2.5', color: 'var(--air-series-2)' },
      ]
    : [{ key: metric, label: airPollutantMeta(metric).short, color: 'var(--air-series-1)' }];

interface Props {
  points: AirHistoryPointType[]; // 시간 오름차순
  unit: 'hour' | 'day';
  metric: AirChartMetric;
  todayYmd: string;
  dim?: boolean;
}

// 컨테이너 실측 폭 — SVG 를 픽셀 단위로 그려 글자가 늘어나지 않게 한다. ResizeObserver
// 는 외부 시스템이라 useEffect 가 맞는 자리.
const useElementWidth = (): [RefObject<HTMLDivElement | null>, number] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
};

// y 눈금 — 1/2/2.5/5 × 10^k 단계 중 눈금이 3~5개가 되는 가장 작은 단계를 골라
// 0 부터 상한까지 깔끔한 수로 찍는다(12.5/37.5 같은 눈금 금지). 상한은 단계의 배수.
const niceTicks = (maxV: number): { yMax: number; ticks: number[] } => {
  const v = maxV > 0 && Number.isFinite(maxV) ? maxV : 1;
  const exp = Math.floor(Math.log10(v)) - 1;
  const candidates: number[] = [];
  for (let e = exp; e <= exp + 3; e++) {
    for (const m of [1, 2, 2.5, 5]) candidates.push(m * 10 ** e);
  }
  const step = candidates.find((s) => Math.ceil(v / s) <= 5) ?? candidates[candidates.length - 1]!;
  const count = Math.max(1, Math.ceil(v / step));
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(Number((i * step).toPrecision(12)));
  return { yMax: count * step, ticks };
};

const fmtTick = (v: number, key: AirPollutant): string => {
  const d = airPollutantMeta(key).digits;
  return d === 0 ? String(Math.round(v)) : String(Number(v.toFixed(d)));
};

const xLabel = (time: string, unit: 'hour' | 'day', todayYmd: string): string => {
  if (unit === 'day') {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(time);
    return m ? `${Number(m[1])}/${Number(m[2])}` : time;
  }
  return formatAirHourLabel(time, todayYmd);
};

const MARGIN = { top: 14, right: 44, bottom: 26, left: 40 };
const HEIGHT = 230;

export const AirHistoryChart = ({ points, unit, metric, todayYmd, dim }: Props) => {
  const [wrapRef, width] = useElementWidth();
  const [hover, setHover] = useState<number | null>(null);
  const tooltipId = useId();
  const series = seriesFor(metric);
  const n = points.length;

  if (n === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">표시할 시계열이 없습니다.</div>;
  }

  const w = Math.max(width, 280);
  const plotW = w - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const primaryKey = series[0]!.key;
  const maxVal = Math.max(
    0,
    ...points.flatMap((p) => series.map((s) => p[s.key]).filter((v): v is number => v !== null)),
  );
  // 단일 항목은 등급 경계선을 같이 그려 상한이 '나쁨' 경계 이상이 되게 한다(맥락).
  const thresholds = metric === 'pm' ? [] : airPollutantMeta(primaryKey).breakpoints.slice(0, 2);
  const { yMax, ticks } = niceTicks(Math.max(maxVal * 1.1, thresholds[0] ?? 0));
  const x = (i: number): number => MARGIN.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number): number => MARGIN.top + plotH - (v / yMax) * plotH;

  const pathFor = (key: AirPollutant): string => {
    let d = '';
    let open = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null) {
        open = false;
        return;
      }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      open = true;
    });
    return d.trim();
  };
  const lastIndex = (key: AirPollutant): number => {
    for (let i = n - 1; i >= 0; i--) if (points[i]?.[key] !== null) return i;
    return -1;
  };

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 64))));
  // 마지막 라벨은 항상 찍고, 그 직전 간격이 반 칸 미만인 정기 라벨은 건너뛰어 겹침을 막는다.
  const showXLabel = (i: number): boolean =>
    i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= Math.ceil(labelEvery / 2));

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const rel = (px - MARGIN.left) / Math.max(1, plotW);
    const idx = Math.round(Math.min(1, Math.max(0, rel)) * (n - 1));
    setHover(idx);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHover((h) => Math.min(n - 1, (h ?? n - 1) + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover((h) => Math.max(0, (h ?? n) - 1));
    } else if (e.key === 'Escape') {
      setHover(null);
    }
  };

  const hovered = hover !== null ? points[hover] : undefined;
  const unitLabel = airPollutantMeta(primaryKey).unit;
  const tooltipLeft = hover !== null ? Math.min(Math.max(x(hover) + 12, 0), Math.max(0, w - 170)) : 0;

  return (
    <div className={cn('flex flex-col gap-2', dim && 'opacity-60')}>
      {series.length > 1 && (
        <ul className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-label="범례">
          {series.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
          <li className="ml-auto">{unitLabel}{unit === 'day' ? ' · 일평균' : ''}</li>
        </ul>
      )}
      {series.length === 1 && (
        <div className="flex items-center justify-end text-xs text-muted-foreground">
          {airPollutantMeta(primaryKey).label} {unitLabel}{unit === 'day' ? ' · 일평균' : ''}
        </div>
      )}
      <div ref={wrapRef} className="relative w-full">
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${w} ${HEIGHT}`}
          role="img"
          aria-label={`${series.map((s) => s.label).join('·')} ${unit === 'hour' ? '시간별' : '일별'} 추이 (${n}개 지점)`}
          aria-describedby={hovered ? tooltipId : undefined}
          tabIndex={0}
          className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-md"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
        >
          {/* 격자 + y 눈금 */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={w - MARGIN.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 6}
                y={y(t) + 3}
                textAnchor="end"
                className="fill-muted-foreground tabular-nums"
                fontSize={10}
              >
                {fmtTick(t, primaryKey)}
              </text>
            </g>
          ))}
          {/* 등급 경계(단일 항목) — 보통/나쁨 시작선 */}
          {thresholds.map((t, i) => (
            <g key={`th-${t}`}>
              <line
                x1={MARGIN.left}
                x2={w - MARGIN.right}
                y1={y(t)}
                y2={y(t)}
                stroke={AIR_GRADE_STYLE[i === 0 ? 2 : 3].hex}
                strokeOpacity={0.55}
                strokeDasharray="3 4"
                strokeWidth={1}
              />
              <text
                x={w - MARGIN.right + 4}
                y={y(t) + 3}
                fontSize={10}
                className="fill-muted-foreground"
              >
                {AIR_GRADE_STYLE[i === 0 ? 2 : 3].label}↑
              </text>
            </g>
          ))}
          {/* x 라벨 */}
          {points.map((p, i) =>
            showXLabel(i) ? (
              <text
                key={p.time}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}
                fontSize={10}
                className="fill-muted-foreground tabular-nums"
              >
                {xLabel(p.time, unit, todayYmd)}
              </text>
            ) : null,
          )}
          {/* 선 */}
          {series.map((s) => (
            <path
              key={s.key}
              d={pathFor(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {/* 끝점 + 끝값 라벨(선택적 직접 라벨) */}
          {series.map((s) => {
            const li = lastIndex(s.key);
            if (li < 0) return null;
            const v = points[li]![s.key] as number;
            return (
              <g key={`end-${s.key}`}>
                <circle cx={x(li)} cy={y(v)} r={4} fill={s.color} className="stroke-card" strokeWidth={2} />
                <text
                  x={x(li) + 7}
                  y={y(v) + 3}
                  fontSize={11}
                  className="fill-foreground font-medium"
                >
                  {formatAirValue(s.key, v)}
                </text>
              </g>
            );
          })}
          {/* 크로스헤어 + 호버 점 */}
          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotH}
                className="stroke-foreground/40"
                strokeWidth={1}
              />
              {series.map((s) => {
                const v = points[hover]?.[s.key];
                if (v === null || v === undefined) return null;
                return (
                  <circle
                    key={`h-${s.key}`}
                    cx={x(hover)}
                    cy={y(v)}
                    r={4.5}
                    fill={s.color}
                    className="stroke-card"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          )}
        </svg>
        {hovered && (
          <div
            id={tooltipId}
            role="status"
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
            style={{ left: tooltipLeft }}
          >
            <div className="mb-1 text-muted-foreground">
              {unit === 'hour' ? hovered.time : hovered.time}
            </div>
            <ul className="flex flex-col gap-0.5">
              {series.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                  <span className="font-semibold tabular-nums">{formatAirValue(s.key, hovered[s.key])}</span>
                  <span className="text-muted-foreground">{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {/* 표 쌍둥이 — 툴팁이 유일한 경로가 되지 않도록 */}
      <details className="group text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
          표로 보기 ({n}행)
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b">
                <th className="px-2 py-1 text-left font-medium text-muted-foreground">시각</th>
                {series.map((s) => (
                  <th key={s.key} className="px-2 py-1 text-right font-medium text-muted-foreground">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.time} className="border-b last:border-0">
                  <td className="px-2 py-1 tabular-nums">{p.time}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-2 py-1 text-right tabular-nums">
                      {formatAirValue(s.key, p[s.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};
