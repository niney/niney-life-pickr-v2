import type { AirHistoryPointType } from '@repo/api-contract';
import {
  AIR_GRADE_LEVELS,
  airGradeFromValue,
  airPollutantMeta,
  formatAirHourLabel,
  formatAirValue,
  type AirPollutant,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { AIR_GRADE_STYLE, airGradeStyle } from './airGrade';

// 24시간 등급 띠 — 이 페이지의 서명 요소. 시간별 농도를 등급색 칸으로만 펼쳐
// "어제 이 시간부터 지금까지 공기가 어땠나"를 한 줄에 읽게 한다. 값은 툴팁(title)과
// 아래 차트·표에 있으므로 칸은 색+위치만 담당한다. 칸 사이 2px 는 표면색 간격(테두리
// 없음), 날짜가 바뀌는 칸에는 얇은 경계선으로 하루 경계를 드러낸다.

interface Props {
  points: AirHistoryPointType[]; // 시간 오름차순
  todayYmd: string;
  dim?: boolean;
}

const ROWS: Array<Exclude<AirPollutant, 'khai' | 'no2' | 'co' | 'so2'>> = ['pm10', 'pm25', 'o3'];

export const AirHourStrip = ({ points, todayYmd, dim }: Props) => {
  if (points.length === 0) return null;
  const n = points.length;
  // 시간 라벨 — 6칸마다 + 마지막 칸.
  const labelEvery = n > 30 ? 6 : 3;

  return (
    <div className={cn('flex flex-col gap-2', dim && 'opacity-60')}>
      <div
        className="grid gap-x-2 gap-y-1"
        style={{ gridTemplateColumns: `3.25rem repeat(${n}, minmax(0, 1fr))` }}
        role="table"
        aria-label="시간별 등급 띠"
      >
        {ROWS.map((k) => {
          const meta = airPollutantMeta(k);
          return (
            <div key={k} className="contents" role="row">
              <div
                className="flex items-center text-xs font-medium text-muted-foreground"
                role="rowheader"
              >
                {meta.short}
              </div>
              {points.map((p, i) => {
                const value = p[k];
                const grade = airGradeFromValue(k, value);
                const style = airGradeStyle(grade);
                const prev = points[i - 1];
                const dayBreak = i > 0 && prev && prev.time.slice(0, 10) !== p.time.slice(0, 10);
                const label = `${formatAirHourLabel(p.time, todayYmd)} · ${meta.short} ${formatAirValue(k, value)}${meta.unit ? ` ${meta.unit}` : ''} · ${style.label}`;
                return (
                  <div
                    key={p.time}
                    role="cell"
                    title={label}
                    aria-label={label}
                    className={cn(
                      'h-5 rounded-[3px]',
                      grade ? style.dot : 'bg-muted',
                      dayBreak && 'border-l-2 border-card',
                    )}
                    style={dayBreak ? { marginLeft: -2 } : undefined}
                  />
                );
              })}
            </div>
          );
        })}
        {/* 시간 축 — 칸이 좁아 "M/D H시" 는 잘린다. 날짜가 바뀌는 칸(과 첫 칸)에만 M/D 를,
            그 외 라벨 칸에는 "H시" 만 적어 하루 경계와 시각을 함께 읽게 한다. */}
        <div className="contents" role="row">
          <div role="rowheader" />
          {points.map((p, i) => {
            const prev = points[i - 1];
            const dayStart =
              i === 0 || (prev !== undefined && prev.time.slice(0, 10) !== p.time.slice(0, 10));
            const show = dayStart || i % labelEvery === 0 || i === n - 1;
            const m = /^\d{4}-(\d{2})-(\d{2})\s+(\d{1,2}):/.exec(p.time);
            const label = !show || !m ? '' : dayStart ? `${Number(m[1])}/${Number(m[2])}` : `${Number(m[3])}시`;
            return (
              <div
                key={p.time}
                role="cell"
                title={formatAirHourLabel(p.time, todayYmd)}
                className={cn(
                  'truncate text-[10px] leading-4 tabular-nums',
                  dayStart ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {AIR_GRADE_LEVELS.map((g) => (
          <span key={g} className="inline-flex items-center gap-1">
            <span aria-hidden className={cn('size-2 rounded-[2px]', AIR_GRADE_STYLE[g].dot)} />
            {AIR_GRADE_STYLE[g].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-[2px] bg-muted" /> 결측
        </span>
        <span className="ml-auto">칸에 마우스를 올리면 농도가 보입니다</span>
      </div>
    </div>
  );
};
