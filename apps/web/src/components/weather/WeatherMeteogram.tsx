import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { WeatherForecastHourType } from '@repo/api-contract';
import {
  KMA_CONDITION_LABEL,
  formatKmaTemp,
  kmaCondition,
  kmaWindDirection16,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { relativeDayLabel } from '~/components/air/airGrade';
import { tempTicks, useElementWidth } from './weatherFormat';
import { WeatherConditionIcon } from './weatherIcons';

// 3일 시간별 메테오그램 — 이 페이지의 서명 요소. 위에서 아래로 [날씨 아이콘 행] → [기온
// 선(한 축, ℃)] → [강수확률 막대(한 축, %) + 강수량 글자]. 두 패널은 x 를 공유하는 소형
// 다중(small multiples)이지 이중 축이 아니다. 마크 규격: 2px 선, 끝점 r=4 + 표면 링, 일
// 최저/최고(TMN/TMX)에만 직접 라벨, 헤어라인 격자, 날짜 경계 세로선. 호버 크로스헤어 +
// 툴팁(키보드 ←/→ 동일), 표 쌍둥이로 툴팁이 유일한 경로가 되지 않게 한다.

interface Props {
  hours: WeatherForecastHourType[]; // 시각 오름차순
  todayYmd: string;
  dim?: boolean;
}

const MARGIN = { top: 8, right: 16, bottom: 22, left: 36 };
const ICON_ROW = 30;
const TEMP_H = 150;
const GAP = 18;
const POP_H = 64;
const HEIGHT = MARGIN.top + ICON_ROW + TEMP_H + GAP + POP_H + MARGIN.bottom;

const dateOf = (h: WeatherForecastHourType): string => `${h.fcstDate.slice(0, 4)}-${h.fcstDate.slice(4, 6)}-${h.fcstDate.slice(6, 8)}`;
const hourOf = (h: WeatherForecastHourType): number => Number(h.fcstTime.slice(0, 2));

export const WeatherMeteogram = ({ hours, todayYmd, dim }: Props) => {
  const [wrapRef, width] = useElementWidth();
  const [hover, setHover] = useState<number | null>(null);
  const tooltipId = useId();
  const n = hours.length;
  if (n === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">표시할 예보가 없습니다.</div>;
  }

  const w = Math.max(width, 320);
  const plotW = w - MARGIN.left - MARGIN.right;
  const band = plotW / n;
  const x = (i: number): number => MARGIN.left + (i + 0.5) * band;

  const temps = hours.map((h) => h.tmp).filter((v): v is number => v !== null);
  const tMin = temps.length ? Math.min(...temps) : 0;
  const tMax = temps.length ? Math.max(...temps) : 30;
  const { lo, hi, ticks } = tempTicks(tMin - 1, tMax + 1);
  const tempTop = MARGIN.top + ICON_ROW;
  const yT = (v: number): number => tempTop + TEMP_H - ((v - lo) / (hi - lo)) * TEMP_H;
  const popTop = tempTop + TEMP_H + GAP;
  const yP = (v: number): number => popTop + POP_H - (v / 100) * POP_H;

  let path = '';
  let open = false;
  hours.forEach((h, i) => {
    if (h.tmp === null) {
      open = false;
      return;
    }
    path += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${yT(h.tmp).toFixed(1)} `;
    open = true;
  });

  // 날짜 경계(자정 00시 칸의 왼쪽) + 날짜별 시작 인덱스.
  const dayStarts: Array<{ i: number; date: string }> = [];
  hours.forEach((h, i) => {
    const prev = hours[i - 1];
    if (i === 0 || (prev && prev.fcstDate !== h.fcstDate)) dayStarts.push({ i, date: dateOf(h) });
  });
  // 일 최저/최고 라벨 위치 — TMN/TMX 가 실린 시각(06시/15시) 칸.
  const extremes = hours
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.tmn !== null || h.tmx !== null);

  const iconEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 26))));
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 44))));
  const showHourLabel = (i: number): boolean => i % labelEvery === 0 && hourOf(hours[i]!) % 3 === 0;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const idx = Math.floor((px - MARGIN.left) / band);
    setHover(Math.min(n - 1, Math.max(0, idx)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover((h) => Math.max(0, (h ?? n) - 1));
    } else if (e.key === 'Escape') setHover(null);
  };
  const hovered = hover !== null ? hours[hover] : undefined;
  const tooltipLeft = hover !== null ? Math.min(Math.max(x(hover) + 12, 0), Math.max(0, w - 200)) : 0;

  return (
    <div className={cn('flex flex-col gap-2', dim && 'opacity-60')}>
      <ul className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-label="범례">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: 'var(--weather-temp)' }} /> 기온 ℃
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-[2px] opacity-80" style={{ background: 'var(--weather-precip)' }} /> 강수확률 %
        </li>
        <li className="ml-auto">막대 위 글자 = 1시간 강수량(범주) · 06/15시 라벨 = 일 최저/최고</li>
      </ul>
      <div ref={wrapRef} className="relative w-full">
        {/* 아이콘 행 — SVG 와 같은 밴드 배치(HTML, lucide 아이콘) */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 flex"
          style={{ paddingLeft: MARGIN.left, paddingRight: MARGIN.right, width: w, height: ICON_ROW + MARGIN.top, paddingTop: MARGIN.top }}
        >
          {hours.map((h, i) => (
            <div key={h.at} className="flex items-center justify-center" style={{ width: band }}>
              {i % iconEvery === 0 && <WeatherConditionIcon condition={kmaCondition(h.sky, h.pty)} hour={hourOf(h)} className="size-5" />}
            </div>
          ))}
        </div>
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${w} ${HEIGHT}`}
          role="img"
          aria-label={`3일 시간별 예보 (${n}시각): 기온 선과 강수확률 막대`}
          aria-describedby={hovered ? tooltipId : undefined}
          tabIndex={0}
          className="block touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
        >
          {/* 날짜 경계 + 날짜 라벨 */}
          {dayStarts.map(({ i, date }, k) => {
            const x0 = MARGIN.left + i * band;
            const next = dayStarts[k + 1]?.i ?? n;
            const segW = (next - i) * band;
            return (
              <g key={date}>
                {i > 0 && <line x1={x0} x2={x0} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} className="stroke-border" strokeWidth={1} />}
                {segW > 36 && (
                  <text x={x0 + 4} y={tempTop + 10} fontSize={10} className="fill-foreground font-medium">
                    {relativeDayLabel(date, todayYmd)}
                  </text>
                )}
              </g>
            );
          })}
          {/* 기온 격자/눈금 */}
          {ticks.map((t) => (
            <g key={`t-${t}`}>
              <line x1={MARGIN.left} x2={w - MARGIN.right} y1={yT(t)} y2={yT(t)} className="stroke-border" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 3'} />
              <text x={MARGIN.left - 5} y={yT(t) + 3} textAnchor="end" fontSize={10} className="fill-muted-foreground tabular-nums">
                {t}°
              </text>
            </g>
          ))}
          {/* 기온 선 */}
          <path d={path.trim()} fill="none" stroke="var(--weather-temp)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* 일 최저/최고 라벨 */}
          {extremes.map(({ h, i }) => {
            const v = h.tmx ?? h.tmn;
            if (v === null || h.tmp === null) return null;
            const isMax = h.tmx !== null;
            return (
              <g key={`ex-${h.at}`}>
                <circle cx={x(i)} cy={yT(h.tmp)} r={3.5} fill="var(--weather-temp)" className="stroke-card" strokeWidth={2} />
                <text
                  x={x(i)}
                  y={isMax ? yT(h.tmp) - 8 : yT(h.tmp) + 14}
                  textAnchor="middle"
                  fontSize={11}
                  className="fill-foreground font-medium tabular-nums"
                >
                  {isMax ? '최고 ' : '최저 '}
                  {formatKmaTemp(v)}°
                </text>
              </g>
            );
          })}
          {/* 강수확률 패널 */}
          <line x1={MARGIN.left} x2={w - MARGIN.right} y1={yP(0)} y2={yP(0)} className="stroke-border" strokeWidth={1} />
          {[50, 100].map((t) => (
            <g key={`p-${t}`}>
              <line x1={MARGIN.left} x2={w - MARGIN.right} y1={yP(t)} y2={yP(t)} className="stroke-border" strokeWidth={1} strokeDasharray="2 3" />
              <text x={MARGIN.left - 5} y={yP(t) + 3} textAnchor="end" fontSize={10} className="fill-muted-foreground tabular-nums">
                {t}%
              </text>
            </g>
          ))}
          {hours.map((h, i) => {
            if (h.pop === null) return null;
            const bw = Math.max(2, band - 2);
            const top = yP(h.pop);
            return (
              <g key={`b-${h.at}`}>
                <rect x={x(i) - bw / 2} y={top} width={bw} height={Math.max(0, yP(0) - top)} rx={2} fill="var(--weather-precip)" opacity={0.75} />
                {/* 강수량 글자 — "1mm 미만" 까지 전부 적으면 칸이 좁을 때 겹친다. 1mm 이상은 항상,
                    미만 범주는 칸이 넉넉할 때만. */}
                {!h.pcp.none && h.pcp.value !== null && (h.pcp.value >= 1 ? band >= 14 : band >= 24) && (
                  <text x={x(i)} y={top - 3} textAnchor="middle" fontSize={9} className="fill-foreground tabular-nums">
                    {h.pcp.text.replace('mm', '').replace(' 미만', '↓').replace(' 이상', '↑')}
                  </text>
                )}
              </g>
            );
          })}
          {/* x 라벨 */}
          {hours.map((h, i) =>
            showHourLabel(i) ? (
              <text key={`x-${h.at}`} x={x(i)} y={HEIGHT - 7} textAnchor="middle" fontSize={10} className="fill-muted-foreground tabular-nums">
                {hourOf(h)}시
              </text>
            ) : null,
          )}
          {/* 크로스헤어 */}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} className="stroke-foreground/40" strokeWidth={1} />
              {hours[hover]?.tmp !== null && hours[hover]?.tmp !== undefined && (
                <circle cx={x(hover)} cy={yT(hours[hover]!.tmp as number)} r={4.5} fill="var(--weather-temp)" className="stroke-card" strokeWidth={2} />
              )}
            </g>
          )}
        </svg>
        {hovered && (
          <div
            id={tooltipId}
            role="status"
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-md border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
            style={{ left: tooltipLeft }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <WeatherConditionIcon condition={kmaCondition(hovered.sky, hovered.pty)} hour={hourOf(hovered)} className="size-4" />
              <span className="text-muted-foreground">
                {relativeDayLabel(dateOf(hovered), todayYmd)} {hourOf(hovered)}시
              </span>
              <span className="font-medium">{KMA_CONDITION_LABEL[kmaCondition(hovered.sky, hovered.pty)]}</span>
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
              <li>기온 <b>{formatKmaTemp(hovered.tmp)}℃</b></li>
              <li>강수확률 <b>{hovered.pop ?? '-'}%</b></li>
              <li>강수량 <b>{hovered.pcp.text}</b></li>
              <li>습도 <b>{hovered.reh ?? '-'}%</b></li>
              <li>바람 <b>{kmaWindDirection16(hovered.vec)} {hovered.wsd ?? '-'}m/s</b></li>
              {!hovered.sno.none && <li>적설 <b>{hovered.sno.text}</b></li>}
              {hovered.wav !== null && hovered.wav > 0 && <li>파고 <b>{hovered.wav}m</b></li>}
            </ul>
          </div>
        )}
      </div>
      {/* 표 쌍둥이 */}
      <details className="group text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">표로 보기 ({n}행)</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-md border">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b [&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium [&>th]:text-muted-foreground">
                <th>시각</th>
                <th>날씨</th>
                <th className="!text-right">기온</th>
                <th className="!text-right">강수확률</th>
                <th>강수량</th>
                <th>적설</th>
                <th className="!text-right">습도</th>
                <th>바람</th>
                <th className="!text-right">파고</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h.at} className="border-b last:border-0 [&>td]:px-2 [&>td]:py-1">
                  <td className="tabular-nums">
                    {relativeDayLabel(dateOf(h), todayYmd)} {hourOf(h)}시
                  </td>
                  <td>{KMA_CONDITION_LABEL[kmaCondition(h.sky, h.pty)]}</td>
                  <td className="text-right tabular-nums">
                    {formatKmaTemp(h.tmp)}
                    {h.tmn !== null ? ` (최저 ${formatKmaTemp(h.tmn)})` : ''}
                    {h.tmx !== null ? ` (최고 ${formatKmaTemp(h.tmx)})` : ''}
                  </td>
                  <td className="text-right tabular-nums">{h.pop ?? '-'}</td>
                  <td>{h.pcp.text}</td>
                  <td>{h.sno.text}</td>
                  <td className="text-right tabular-nums">{h.reh ?? '-'}</td>
                  <td className="tabular-nums">
                    {kmaWindDirection16(h.vec)} {h.wsd ?? '-'}
                  </td>
                  <td className="text-right tabular-nums">{h.wav ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};
