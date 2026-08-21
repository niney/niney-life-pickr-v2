import type { AirBadStationItemType } from '@repo/api-contract';
import { AIR_SIDO_OPTIONS, airSidoMatches } from '@repo/utils';
import { cn } from '~/lib/utils';

// 통합대기환경지수 '나쁨' 이상 측정소 — 전국에서 지금 공기가 나쁜 곳만 추린 목록.
// 시도(주소 앞머리 추정)로 묶어 칩으로, 칩 클릭 = 그 측정소로 이동(시도도 함께).

interface Props {
  items: AirBadStationItemType[];
  onSelectStation: (stationName: string, sidoOptionValue: string | null) => void;
  dim?: boolean;
}

export const AirBadStations = ({ items, onSelectStation, dim }: Props) => {
  if (items.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        지금 통합대기환경지수가 &lsquo;나쁨&rsquo; 이상인 측정소가 없습니다.
      </div>
    );
  }
  const groups = new Map<string, AirBadStationItemType[]>();
  for (const it of items) {
    const k = it.sidoName ?? '기타';
    const list = groups.get(k);
    if (list) list.push(it);
    else groups.set(k, [it]);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className={cn('flex flex-col gap-3', dim && 'opacity-60')}>
      <p className="text-sm">
        지금 <span className="font-semibold text-rose-600 dark:text-rose-400">{items.length}곳</span>의 측정소가
        &lsquo;나쁨&rsquo; 이상입니다. 측정소를 누르면 위 상세로 이동합니다.
      </p>
      <ul className="flex flex-col gap-2">
        {ordered.map(([sido, list]) => {
          const option =
            AIR_SIDO_OPTIONS.find((o) => o.value !== '전국' && airSidoMatches(o.value, sido))?.value ??
            AIR_SIDO_OPTIONS.find((o) => o.value !== '전국' && airSidoMatches(sido, o.value))?.value ??
            null;
          return (
            <li key={sido} className="flex flex-wrap items-center gap-1.5">
              <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">
                {sido} <span className="tabular-nums">{list.length}</span>
              </span>
              {list.map((it) => (
                <button
                  key={`${sido}:${it.stationName}`}
                  type="button"
                  title={it.addr}
                  onClick={() => onSelectStation(it.stationName, option)}
                  className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {it.stationName}
                </button>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
