import type { WeatherForecastDayType, WeatherMidResultType } from '@repo/api-contract';
import { formatKmaTemp } from '@repo/utils';
import { cn } from '~/lib/utils';
import { formatYmdWithWeekday, relativeDayLabel } from '~/components/air/airGrade';
import { mergeDailyRows, type WeatherDailyHalf } from './weatherDaily';
import { WeatherConditionIcon } from './weatherIcons';

// 열흘 — 단기예보 일별 요약(오늘~D+3)과 중기예보(D+4~D+10)를 날짜로 이어 붙인 한 줄(병합은
// weatherDaily.ts). 각 날은 오전/오후(중기 D+8 이후는 하루 한 값) 아이콘 + 강수확률, 최저/
// 최고 기온, 그리고 전체 기간 기온 범위 안의 위치를 보여주는 막대(공통 축 — 날짜끼리 비교
// 가능). 중기 기온은 오차 범위(±)를 적는다.

interface Props {
  shortDays: WeatherForecastDayType[];
  mid: WeatherMidResultType | null;
  todayYmd: string;
  dim?: boolean;
}

export const WeatherDailyStrip = ({ shortDays, mid, todayYmd, dim }: Props) => {
  const rows = mergeDailyRows(shortDays, mid);
  if (rows.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">표시할 일별 예보가 없습니다.</div>;
  }
  const temps = rows.flatMap((r) => [r.tmn, r.tmx]).filter((v): v is number => v !== null);
  const lo = temps.length ? Math.min(...temps) : 0;
  const hi = temps.length ? Math.max(...temps) : 1;
  const span = Math.max(1, hi - lo);
  const pct = (v: number): number => ((v - lo) / span) * 100;

  return (
    <div className={cn('flex flex-col gap-3', dim && 'opacity-60')}>
      <div className="overflow-x-auto">
        <div role="table" aria-label="열흘 예보" className="grid min-w-[720px] gap-x-1" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map((r) => {
            const head = relativeDayLabel(r.date, todayYmd);
            const isToday = head === '오늘';
            const halves: Array<{ key: string; tag: string; half: WeatherDailyHalf | null }> = r.all
              ? [{ key: 'all', tag: '하루', half: r.all }]
              : [
                  { key: 'am', tag: '오전', half: r.am },
                  { key: 'pm', tag: '오후', half: r.pm },
                ];
            return (
              <div
                key={r.date}
                role="cell"
                className={cn('flex flex-col items-stretch gap-2 rounded-md border px-1.5 py-2 text-center', isToday && 'border-primary/50 bg-primary/5')}
              >
                <div className="leading-tight">
                  <div className="text-sm font-semibold">{head}</div>
                  <div className="text-[11px] text-muted-foreground">{formatYmdWithWeekday(r.date)}</div>
                </div>
                <div className={cn('grid gap-1', halves.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
                  {halves.map(({ key, tag, half }) => (
                    <div key={key} className="flex flex-col items-center gap-0.5" title={half ? `${tag} ${half.label} · 강수확률 ${half.pop ?? '-'}%` : `${tag} 자료 없음`}>
                      <span className="text-[10px] text-muted-foreground">{tag}</span>
                      {half ? (
                        <>
                          <WeatherConditionIcon condition={half.condition} className="size-6" label={half.label} />
                          <span className={cn('text-[11px] tabular-nums', (half.pop ?? 0) >= 60 ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                            {half.pop ?? '-'}%
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">-</span>
                      )}
                    </div>
                  ))}
                </div>
                {/* 기온 범위 막대 — 공통 축(전 기간 최저~최고) 위의 위치 */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-center gap-1.5 tabular-nums">
                    <span className="text-xs text-muted-foreground" title={r.tmnNote ?? undefined}>
                      {formatKmaTemp(r.tmn)}°
                    </span>
                    <span className="text-sm font-semibold" title={r.tmxNote ?? undefined}>
                      {formatKmaTemp(r.tmx)}°
                    </span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-muted" aria-hidden>
                    {r.tmn !== null && r.tmx !== null && (
                      <div
                        className="absolute top-0 h-1.5 rounded-full"
                        style={{
                          left: `${pct(r.tmn)}%`,
                          width: `${Math.max(4, pct(r.tmx) - pct(r.tmn))}%`,
                          background: 'linear-gradient(90deg, var(--weather-precip), var(--weather-temp))',
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="text-[10px] leading-3 text-muted-foreground">
                  {r.source === 'short' ? (r.partial ? '단기 · 남은 시각' : '단기예보') : '중기예보'}
                  {r.source === 'mid' && r.tmnNote ? ` · ${r.tmnNote.replace('오차 ', '±')}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <details className="group text-xs">
        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">표로 보기 ({rows.length}일)</summary>
        <div className="mt-2 overflow-auto rounded-md border">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="bg-card">
              <tr className="border-b [&>th]:px-2 [&>th]:py-1 [&>th]:text-left [&>th]:font-medium [&>th]:text-muted-foreground">
                <th>날짜</th>
                <th>오전</th>
                <th>오후</th>
                <th className="!text-right">최저</th>
                <th className="!text-right">최고</th>
                <th>출처</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const first = r.all ?? r.am;
                return (
                  <tr key={r.date} className="border-b last:border-0 [&>td]:px-2 [&>td]:py-1">
                    <td>
                      {relativeDayLabel(r.date, todayYmd)} {formatYmdWithWeekday(r.date)}
                    </td>
                    <td>{first ? `${first.label} ${first.pop ?? '-'}%` : '-'}</td>
                    <td>{r.all ? '(하루 한 값)' : r.pm ? `${r.pm.label} ${r.pm.pop ?? '-'}%` : '-'}</td>
                    <td className="text-right tabular-nums">
                      {formatKmaTemp(r.tmn)}
                      {r.tmnNote ? ` (${r.tmnNote})` : ''}
                    </td>
                    <td className="text-right tabular-nums">
                      {formatKmaTemp(r.tmx)}
                      {r.tmxNote ? ` (${r.tmxNote})` : ''}
                    </td>
                    <td>{r.source === 'short' ? '단기예보' : '중기예보'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};
