import { useMemo, useState, type PointerEvent } from 'react';
import type { HikingPoiType, HikingProfileType, HikingSurfaceType } from '@repo/api-contract';
import { HIKING_SURFACE_COLOR, formatHikingEle, hikingPoiLabel, isHikingRoughSurface } from '@repo/utils';
import { formatAtM } from './hikingFormat';

// 고도 그래프 — 인라인 SVG(차트 라이브러리 없음). 면은 viewBox 를 늘려 채우고(preserveAspectRatio none) 글자는 HTML 로
// 얹어 찌그러지지 않게 한다. 가리키면 그 거리·고도를 띄우고 onHover 로 지도에 위치를 알린다. 아래 띠는 험한 노면 구간,
// 위 눈금은 봉우리·위험 지점.

const W = 600;
const H = 140;
// 범위가 코스의 이 비율을 넘는 노면은 띠로 그리지 않는다(원본 범위가 "처음~마지막으로 나온 곳"이라 거의 전 구간이 되면
// 위치 정보가 없다 — 칩으로만 보인다).
const BAND_MAX_RATIO = 0.6;
const TICK_CATEGORIES = new Set(['PEAK', 'DANGER', 'SHELTER']);

interface Props {
  profile: HikingProfileType;
  lengthM: number;
  surfaces: HikingSurfaceType[];
  pois: HikingPoiType[];
  onHover?: (atM: number | null) => void;
}

export const ElevationProfile = ({ profile, lengthM, surfaces, pois, onHover }: Props) => {
  const [hover, setHover] = useState<number | null>(null);
  const { d, e } = profile;

  const geom = useMemo(() => {
    if (d.length < 2) return null;
    const lo = Math.min(...e);
    const hi = Math.max(...e);
    const pad = Math.max((hi - lo) * 0.1, 10);
    const min = lo - pad;
    const max = hi + pad;
    const x = (m: number) => (m / Math.max(lengthM, 1)) * W;
    const y = (v: number) => H - ((v - min) / (max - min)) * H;
    const line = d.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(m).toFixed(1)},${y(e[i]!).toFixed(1)}`).join('');
    return { lo, hi, x, y, line, area: `${line}L${W},${H}L0,${H}Z` };
  }, [d, e, lengthM]);

  const bands = useMemo(
    () => surfaces.filter((s) => isHikingRoughSurface(s.type) && s.toM > s.fromM && s.toM - s.fromM <= lengthM * BAND_MAX_RATIO),
    [surfaces, lengthM],
  );
  const ticks = useMemo(() => pois.filter((p) => TICK_CATEGORIES.has(p.category)), [pois]);

  if (!geom) return <p className="text-xs text-muted-foreground">이 코스는 원본에 고도가 없어 고도 그래프를 그릴 수 없습니다.</p>;

  const handleMove = (ev: PointerEvent<HTMLDivElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (ev.clientX - rect.left) / Math.max(rect.width, 1)));
    // 프로필은 20m 간격이라 가장 가까운 칸은 비율로 바로 찾는다.
    const i = Math.min(d.length - 1, Math.max(0, Math.round(frac * (d.length - 1))));
    setHover(i);
    onHover?.(d[i]!);
  };
  const handleLeave = () => {
    setHover(null);
    onHover?.(null);
  };
  const pct = (m: number) => `${(m / Math.max(lengthM, 1)) * 100}%`;

  return (
    <div className="flex flex-col gap-1" data-testid="hiking-profile">
      <div className="relative h-36 touch-none select-none" onPointerMove={handleMove} onPointerDown={handleMove} onPointerLeave={handleLeave}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d={geom.area} className="fill-emerald-500/20" />
          <path d={geom.line} className="fill-none stroke-emerald-600 dark:stroke-emerald-400" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {hover !== null && (
            <line x1={geom.x(d[hover]!)} x2={geom.x(d[hover]!)} y1={0} y2={H} className="stroke-foreground/50" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {ticks.map((p) => (
          <span
            key={p.id}
            title={`${p.name ?? hikingPoiLabel(p.category)} · ${formatAtM(p.atM)}`}
            className={`absolute top-0 size-2 -translate-x-1/2 rotate-45 ${p.category === 'PEAK' ? 'bg-red-600' : p.category === 'DANGER' ? 'bg-amber-500' : 'bg-violet-600'}`}
            style={{ left: pct(p.atM) }}
          />
        ))}
        <span className="absolute left-1 top-1 text-[10px] tabular-nums text-muted-foreground">{formatHikingEle(geom.hi)}</span>
        <span className="absolute bottom-1 left-1 text-[10px] tabular-nums text-muted-foreground">{formatHikingEle(geom.lo)}</span>
        {hover !== null && (
          <span
            className="pointer-events-none absolute top-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[11px] tabular-nums text-background"
            style={{ left: `clamp(2.5rem, ${pct(d[hover]!)}, calc(100% - 2.5rem))` }}
            data-testid="hiking-profile-tip"
          >
            {formatAtM(d[hover]!)} · {formatHikingEle(e[hover]!)}
          </span>
        )}
      </div>
      {bands.length > 0 && (
        <div className="relative h-1.5 rounded-full bg-muted" aria-label="험한 노면 구간">
          {bands.map((b, i) => (
            <span
              key={`${b.type}-${i}`}
              title={`${b.type} ${formatAtM(b.fromM)}~${formatAtM(b.toM)}`}
              className="absolute inset-y-0 rounded-full"
              style={{ left: pct(b.fromM), width: pct(Math.max(b.toM - b.fromM, lengthM * 0.01)), backgroundColor: HIKING_SURFACE_COLOR[b.type] }}
            />
          ))}
        </div>
      )}
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>0</span>
        <span>{formatAtM(lengthM / 2)}</span>
        <span>{formatAtM(lengthM)}</span>
      </div>
    </div>
  );
};
