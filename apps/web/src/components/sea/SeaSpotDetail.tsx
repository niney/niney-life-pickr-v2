import { ArrowLeft, Loader2, Waves } from 'lucide-react';
import { useSeaTide } from '@repo/shared';
import type { SeaSlotType, SeaSpotType } from '@repo/api-contract';
import {
  SEA_RIP_COLOR,
  formatYmdWithWeekday,
  relativeDayLabel,
  seaActivityHasPeriod,
  seaIndexColor,
  type SeaActivity,
  type SeaRipLevel,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { formatSeaDistance, seaSlotFor, seaSlotSummary, type SeaPeriod } from './seaFormat';

// 선택 지점 상세 — 7일 × 오전/오후 지수 띠(누르면 그 날짜·시간대로) → 선택 슬롯 수치·세부(어종·등급) 지수 칩 →
// 이안류(해수욕, 6~9월) → 가장 가까운 조석 예보지점의 만조·간조.

interface Props {
  spot: SeaSpotType;
  activity: SeaActivity;
  dates: string[];
  date: string;
  period: SeaPeriod;
  today: string;
  distM: number | null;
  onPick: (date: string, period: SeaPeriod) => void;
  onBack: () => void;
}

const LevelDot = ({
  slot,
  active,
  onClick,
  title,
  tall = false,
}: {
  slot: SeaSlotType | null;
  active: boolean;
  onClick: () => void;
  title: string;
  // 하루 한 번 예보(오전/오후 칸 두 개 높이).
  tall?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={cn('w-full rounded-sm transition-shadow', tall ? 'h-[2.625rem]' : 'h-5', active && 'ring-2 ring-foreground ring-offset-1 ring-offset-background')}
    style={{ backgroundColor: seaIndexColor(slot?.level) }}
  />
);

export const SeaSpotDetail = ({ spot, activity, dates, date, period, today, distM, onPick, onBack }: Props) => {
  const hasPeriod = seaActivityHasPeriod(activity);
  const slot = seaSlotFor(spot, activity, date, period);
  const tideQ = useSeaTide({ lat: spot.lat, lng: spot.lng }, date);
  const rip = spot.rip;
  return (
    <div className="flex flex-col gap-3" data-testid="sea-detail">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{spot.name}</h2>
          {distM !== null && <p className="text-xs text-muted-foreground">내 위치에서 {formatSeaDistance(distM)}</p>}
        </div>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> 목록
        </button>
      </div>

      {/* 7일 지수 띠 — 칸 = 날짜, 오전/오후가 있으면 위아래 두 칸. */}
      <div>
        <div className="mb-1 text-[11px] text-muted-foreground">7일 지수{hasPeriod ? ' (위 오전 · 아래 오후, 한 칸은 하루 예보)' : ''}</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}>
          {dates.map((d) => {
            const dayLabel = relativeDayLabel(d, today);
            const am = hasPeriod ? (spot.slots.find((s) => s.date === d && s.period === 'am') ?? null) : null;
            const pm = hasPeriod ? (spot.slots.find((s) => s.date === d && s.period === 'pm') ?? null) : null;
            // 오전/오후가 없는 날(갯벌·바다갈라짐, 해수욕·바다여행의 D+3 이후 '일' 예보)은 한 칸.
            const whole = am || pm ? null : seaSlotFor(spot, activity, d, period);
            return (
              <div key={d} className="flex flex-col items-center gap-0.5">
                <span className={cn('text-[10px] tabular-nums', d === date ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{dayLabel}</span>
                {am || pm ? (
                  <>
                    <LevelDot slot={am} active={d === date && period === 'am'} onClick={() => onPick(d, 'am')} title={`${formatYmdWithWeekday(d)} 오전 ${am?.label ?? '예보 없음'}`} />
                    <LevelDot slot={pm} active={d === date && period === 'pm'} onClick={() => onPick(d, 'pm')} title={`${formatYmdWithWeekday(d)} 오후 ${pm?.label ?? '예보 없음'}`} />
                  </>
                ) : (
                  <LevelDot
                    slot={whole}
                    tall={hasPeriod}
                    active={d === date}
                    onClick={() => onPick(d, period)}
                    title={`${formatYmdWithWeekday(d)}${hasPeriod ? ' 하루' : ''} ${whole?.label ?? '예보 없음'}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 선택 슬롯 */}
      <div className="rounded-md border p-3" data-testid="sea-detail-slot">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">
            {formatYmdWithWeekday(date)}
            {slot?.period ? ` ${slot.period === 'am' ? '오전' : '오후'}` : hasPeriod ? ' 하루' : ''}
          </span>
          {slot?.label ? (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: seaIndexColor(slot.level) }}>
              {slot.label}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">예보 없음</span>
          )}
        </div>
        {slot && <p className="mt-1 text-xs text-muted-foreground">{seaSlotSummary(activity, slot) || '세부 수치 없음'}</p>}
        {slot && slot.variants.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={activity === 'fishing' ? '어종별 지수' : '등급별 지수'}>
            {slot.variants.map((v) => (
              <li key={v.name} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: seaIndexColor(v.level) }} />
                {v.name} <span className="font-semibold">{v.label ?? '-'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 이안류 — 해수욕장 10곳, 6~9월 실시간 관측. */}
      {rip && (
        <div className="flex items-center gap-2 text-xs" data-testid="sea-detail-rip">
          <span className="text-muted-foreground">이안류</span>
          <span
            className="rounded-full px-2 py-0.5 font-semibold text-white"
            style={{ backgroundColor: rip.level ? SEA_RIP_COLOR[rip.level as SeaRipLevel] : seaIndexColor(null) }}
          >
            {rip.label ?? '-'}
          </span>
          <span className="tabular-nums text-muted-foreground">{rip.observedAt.slice(11)} 관측</span>
        </div>
      )}

      {/* 물때 — 선택 날짜의 만조·간조. */}
      <div data-testid="sea-detail-tide">
        <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Waves className="size-3" aria-hidden /> 물때
          {tideQ.data && (
            <span>
              · {tideQ.data.station.name} 기준({formatSeaDistance(tideQ.data.station.distM)})
            </span>
          )}
        </div>
        {tideQ.isLoading ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> 불러오는 중…
          </p>
        ) : tideQ.isError ? (
          <p className="text-xs text-muted-foreground">물때를 불러오지 못했습니다.</p>
        ) : tideQ.data && tideQ.data.extremes.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {tideQ.data.extremes.map((e) => (
              <li key={e.time} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs tabular-nums">
                <span className={e.kind === 'high' ? 'text-sky-600 dark:text-sky-400' : 'text-amber-700 dark:text-amber-400'}>
                  {e.kind === 'high' ? '만조' : '간조'}
                </span>
                {e.time}
                {e.levelCm !== null && <span className="text-muted-foreground">{e.levelCm.toFixed(0)}cm</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">이 날짜의 물때 예보가 없습니다.</p>
        )}
      </div>
    </div>
  );
};
