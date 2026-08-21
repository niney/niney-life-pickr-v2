import type { WeatherMidSeaResultType } from '@repo/api-contract';
import { KMA_CONDITION_LABEL, WEATHER_MID_SEA_REGIONS, kmaConditionFromText } from '@repo/utils';
import { cn } from '~/lib/utils';
import { formatYmdWithWeekday, relativeDayLabel } from '~/components/air/airGrade';
import { WeatherConditionIcon } from './weatherIcons';

// 중기해상예보 — 해역 선택 + 날짜별 오전/오후(D+8~ 하루) 날씨·파고(최저~최고 m) 표.
// 파고는 숫자 그대로(색 없음), 날씨는 아이콘+문구.

interface Props {
  regId: string;
  onChangeRegion: (regId: string) => void;
  data: WeatherMidSeaResultType | null;
  todayYmd: string;
  dim?: boolean;
}

const cell = (h: { wf: string | null; whMin: number | null; whMax: number | null } | null) => {
  if (!h) return <span className="text-muted-foreground">-</span>;
  const cond = kmaConditionFromText(h.wf);
  const wave = h.whMin === null && h.whMax === null ? '-' : `${h.whMin ?? '-'}~${h.whMax ?? '-'}m`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <WeatherConditionIcon condition={cond} className="size-4" label={h.wf ?? KMA_CONDITION_LABEL[cond]} />
      <span>{h.wf ?? KMA_CONDITION_LABEL[cond]}</span>
      <span className="tabular-nums text-muted-foreground">파고 {wave}</span>
    </span>
  );
};

export const WeatherSeaSection = ({ regId, onChangeRegion, data, todayYmd, dim }: Props) => (
  <div className={cn('flex flex-col gap-3', dim && 'opacity-60')}>
    <label className="flex items-center gap-2 text-sm">
      <span className="text-xs text-muted-foreground">해역</span>
      <select
        value={regId}
        onChange={(e) => onChangeRegion(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        aria-label="해역 선택"
      >
        {WEATHER_MID_SEA_REGIONS.map((r) => (
          <option key={r.regId} value={r.regId}>
            {r.label} ({r.regId})
          </option>
        ))}
      </select>
    </label>
    {!data || data.days.length === 0 ? (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        이 해역의 중기해상예보가 없습니다.
      </div>
    ) : (
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr className="[&>th]:h-9 [&>th]:px-2 [&>th]:text-left [&>th]:font-medium">
              <th>날짜</th>
              <th>오전</th>
              <th>오후</th>
            </tr>
          </thead>
          <tbody>
            {data.days.map((d) => (
              <tr key={d.date} className="border-t [&>td]:px-2 [&>td]:py-1.5">
                <td className="whitespace-nowrap">
                  <span className="font-medium">{relativeDayLabel(d.date, todayYmd)}</span>{' '}
                  <span className="text-xs text-muted-foreground">{formatYmdWithWeekday(d.date)} · D+{d.day}</span>
                </td>
                {d.all ? (
                  <td colSpan={2}>{cell(d.all)} <span className="text-xs text-muted-foreground">(하루 한 값)</span></td>
                ) : (
                  <>
                    <td>{cell(d.am)}</td>
                    <td>{cell(d.pm)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
