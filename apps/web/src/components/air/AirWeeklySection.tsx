import type { AirWeeklyForecastResultType } from '@repo/api-contract';
import { sortAirRegions } from '@repo/utils';
import { cn } from '~/lib/utils';
import { airGradeStyleFromText, formatYmdWithWeekday } from './airGrade';
import { AirGradeBadge } from './AirPrimitives';

// 초미세먼지 주간예보 — 발표일 기준 D+3~D+6, 권역 × 4일 그리드(낮음/높음 2단계) +
// 대기질 전망 원문 + 신뢰도. 2단계라 좋음/나쁨 색을 빌리되 글자는 원문(낮음/높음).

interface Props {
  data: AirWeeklyForecastResultType;
  dim?: boolean;
}

export const AirWeeklySection = ({ data, dim }: Props) => {
  if (!data.presentedAt || data.days.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
        최근 발표된 주간예보가 없습니다. 주간예보는 매일 오후에 발표되며, 당일분이 없으면 전일분을 보여줍니다.
      </div>
    );
  }
  const regionSet = new Map<string, true>();
  for (const d of data.days) for (const g of d.grades) regionSet.set(g.region, true);
  const regions = sortAirRegions([...regionSet.keys()].map((region) => ({ region }))).map((r) => r.region);

  return (
    <div className={cn('flex flex-col gap-3', dim && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
        <p className="leading-relaxed">
          <span className="text-xs text-muted-foreground">발표 {data.presentedAt} · </span>
          {data.outlook ?? '대기질 전망 원문이 없습니다.'}
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 h-9 bg-muted/40 px-2 text-left font-medium backdrop-blur">권역</th>
              {data.days.map((d) => (
                <th key={d.date} className="h-9 px-2 text-left font-medium">
                  <span className="font-semibold text-foreground tabular-nums">{formatYmdWithWeekday(d.date)}</span>
                  {d.reliability && (
                    <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px]">신뢰도 {d.reliability}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.map((region) => (
              <tr key={region} className="border-t">
                <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-xs font-medium">
                  {region}
                </th>
                {data.days.map((d) => {
                  const g = d.grades.find((x) => x.region === region)?.grade ?? null;
                  const style = airGradeStyleFromText(g);
                  return (
                    <td key={d.date} className="p-1">
                      <div className={cn('flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium', style.tint)}>
                        <span aria-hidden className={cn('size-1.5 rounded-full', style.dot)} />
                        {g ?? '-'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        2단계 등급
        <AirGradeBadge text="낮음" />
        <span>보통 이하</span>
        <AirGradeBadge text="높음" />
        <span>나쁨 이상 가능</span>
      </div>
    </div>
  );
};
