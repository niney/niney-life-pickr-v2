import type { AirMeasureItemType } from '@repo/api-contract';
import {
  AIR_SIDO_OPTIONS,
  airGradeFromValue,
  airPollutantMeta,
  airSidoMatches,
  formatAirValue,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { airGradeStyle } from './airGrade';
import { AirGradeBadge } from './AirPrimitives';

// 전국 시도 비교 — '전국' 응답(673개소)을 업스트림 sidoName 으로 묶어 시도별 평균을
// 가로 막대로. 막대색은 평균값의 등급(상태색)이며 등급 글자를 배지로 함께 둔다.
// 막대는 ≤ 12px, 끝만 둥글게, 값은 막대 끝 라벨. 막대 클릭 = 그 시도로 전환.

interface Props {
  items: AirMeasureItemType[]; // 전국
  metric: 'pm10' | 'pm25';
  onMetricChange: (m: 'pm10' | 'pm25') => void;
  selectedSido: string;
  onSelectSido: (value: string) => void;
  dim?: boolean;
}

interface Row {
  sido: string;
  optionValue: string | null;
  avg: number | null;
  count: number;
  valid: number;
}

export const AirSidoCompare = ({ items, metric, onMetricChange, selectedSido, onSelectSido, dim }: Props) => {
  const groups = new Map<string, AirMeasureItemType[]>();
  for (const m of items) {
    const k = m.sidoName ?? '기타';
    const list = groups.get(k);
    if (list) list.push(m);
    else groups.set(k, [m]);
  }
  const rows: Row[] = [...groups.entries()]
    .map(([sido, list]) => {
      const vals = list.map((m) => m[metric]).filter((v): v is number => v !== null);
      return {
        sido,
        optionValue:
          AIR_SIDO_OPTIONS.find((o) => o.value !== '전국' && airSidoMatches(sido, o.value))?.value ?? null,
        avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
        count: list.length,
        valid: vals.length,
      };
    })
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  const max = Math.max(1, ...rows.map((r) => r.avg ?? 0));
  const meta = airPollutantMeta(metric);

  return (
    <div className={cn('flex flex-col gap-3', dim && 'opacity-60')}>
      <div className="flex items-center gap-1 text-xs">
        {(['pm25', 'pm10'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onMetricChange(k)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 transition-colors',
              metric === k ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {airPollutantMeta(k).short}
          </button>
        ))}
        <span className="ml-2 text-muted-foreground">시도별 평균 {meta.unit} · 결측 제외 · 높은 순</span>
      </div>
      <ol className="flex flex-col gap-1.5" aria-label={`시도별 평균 ${meta.short}`}>
        {rows.map((r) => {
          const grade = airGradeFromValue(metric, r.avg);
          const style = airGradeStyle(grade);
          const active = r.optionValue !== null && r.optionValue === selectedSido;
          const pct = r.avg === null ? 0 : (r.avg / max) * 100;
          return (
            <li key={r.sido}>
              <button
                type="button"
                disabled={r.optionValue === null}
                onClick={() => r.optionValue && onSelectSido(r.optionValue)}
                aria-pressed={active}
                className={cn(
                  'grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default',
                  active && 'bg-accent',
                )}
              >
                <span className={cn('truncate text-xs', active ? 'font-semibold' : 'text-muted-foreground')}>
                  {r.sido}
                </span>
                <span className="relative h-3 overflow-hidden rounded-r-[4px] bg-muted/40">
                  <span
                    aria-hidden
                    className={cn('absolute inset-y-0 left-0 rounded-r-[4px]', style.dot)}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <span className="w-10 text-right font-medium">{formatAirValue(metric, r.avg)}</span>
                  <AirGradeBadge grade={grade} />
                  <span className="hidden w-14 text-right text-[11px] text-muted-foreground sm:inline">
                    {r.valid}/{r.count}곳
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
