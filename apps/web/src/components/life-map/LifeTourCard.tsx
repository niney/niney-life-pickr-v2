import { Footprints, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TourDensityCellType, TourDensityResultType } from '@repo/api-contract';
import { useRestaurantsPublic } from '@repo/shared';
import {
  TOUR_DENSITY_GRADES,
  TOUR_DENSITY_GRADE_COLOR,
  TOUR_DENSITY_GRADE_LABEL,
  TOUR_DENSITY_KINDS,
  TOUR_DENSITY_KIND_LABEL,
  formatBbox,
  tourDensityCellBbox,
  tourDensityGrade,
  type TourDensityKind,
} from '@repo/utils';
import { cn } from '~/lib/utils';

// 여행자 밀도 요약 카드 — 배경 레이어 "여행자 밀도" 가 켜져 있을 때 주변 목록 머리 아래에 하나. 범죄 통계 카드와 같은 자리·
// 같은 규율(점 레이어의 내주변·상세와 섞지 않는다). 종류 칩(전체/식당만)은 지도 색칠과 함께 바뀐다. 칸을 누르면 그 칸의
// 방문·여행자 수와, 그 안에 등록된 맛집(공개 목록 bbox 조회, 여행자 순)을 보여 준다 — 여행로그 장소 자체는 공개하지 않고
// "우리 DB 에 있는 식당" 만 잇는다(docs/PLAN-tour-log.md 6차).

interface Props {
  data: TourDensityResultType | undefined;
  loading: boolean;
  error: boolean;
  kind: TourDensityKind;
  onKind: (kind: TourDensityKind) => void;
  // 클릭으로 고른 칸 — null 이면 안내 + 전체 규모.
  cell: TourDensityCellType | null;
  onClearCell: () => void;
  onFlyTo: (lat: number, lng: number) => void;
  className?: string;
}

const chipClass = (active: boolean): string =>
  cn(
    'inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs transition-colors',
    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
  );

export const LifeTourCard = ({ data, loading, error, kind, onKind, cell, onClearCell, onFlyTo, className }: Props) => {
  const grade = data && cell ? tourDensityGrade(cell.n, data.breaks) : null;
  return (
    <section className={cn('border-b px-3 py-2', className)} data-testid="life-tour-card" aria-label="여행자 밀도">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        <Footprints className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium">여행자 방문 밀도</span>
        {data && <span className="text-muted-foreground">{data.sampleLabel} · 0.02° 격자 · 표본 안 5등급</span>}
      </div>

      <div className="-mr-3 mt-1.5 flex gap-1.5 overflow-x-auto whitespace-nowrap pr-3 [scrollbar-width:none]" role="group" aria-label="방문 종류" data-testid="life-tour-kinds">
        {TOUR_DENSITY_KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => onKind(k)} className={chipClass(kind === k)}>
            {TOUR_DENSITY_KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> 밀도 격자 불러오는 중…
        </p>
      ) : error || !data ? (
        <p className="mt-2 text-xs text-muted-foreground">여행자 밀도를 불러오지 못했습니다.</p>
      ) : cell && grade !== null ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-sm font-semibold" data-testid="life-tour-cell">
              선택한 칸 · 방문 {cell.n.toLocaleString('ko-KR')}건 · 여행자 {cell.travelers.toLocaleString('ko-KR')}명
            </h3>
            <button type="button" onClick={onClearCell} className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
              선택 해제
            </button>
          </div>
          <div className="mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium" data-testid="life-tour-grade">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: TOUR_DENSITY_GRADE_COLOR[grade] }} />
            {grade}등급 · {TOUR_DENSITY_GRADE_LABEL[grade]}
          </div>
          <CellRestaurants cell={cell} cellDeg={data.cellDeg} onFlyTo={onFlyTo} />
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="life-tour-summary">
          색칠된 칸을 누르면 그 안에 등록된 맛집을 보여 줍니다. 칸 {data.total.cells.toLocaleString('ko-KR')} · 방문{' '}
          {data.total.visits.toLocaleString('ko-KR')}건 · 여행자 5명 미만 칸은 표시하지 않습니다.
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground" aria-label="등급 범례">
        {TOUR_DENSITY_GRADES.map((g) => (
          <span key={g} className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: TOUR_DENSITY_GRADE_COLOR[g] }} />
            {g} {TOUR_DENSITY_GRADE_LABEL[g]}
            {data && g < 5 ? ` ≤${Math.round(data.breaks[g - 1] ?? 0)}` : ''}
          </span>
        ))}
      </div>
    </section>
  );
};

// 선택 칸 안의 등록 맛집 — 공개 목록을 칸 bbox 로 조회(여행자 수 순, 최대 12). 훅은 칸이 있을 때만 마운트된다.
const CellRestaurants = ({ cell, cellDeg, onFlyTo }: { cell: TourDensityCellType; cellDeg: number; onFlyTo: (lat: number, lng: number) => void }) => {
  const bbox = formatBbox(tourDensityCellBbox(cell.x, cell.y, cellDeg));
  const q = useRestaurantsPublic({ bbox, sort: 'tourTravelers', limit: 12 });
  const items = q.data?.items ?? [];
  return (
    <div className="mt-2" data-testid="life-tour-cell-restaurants">
      <div className="text-[11px] font-medium text-muted-foreground">이 칸에 등록된 맛집{q.data ? ` ${q.data.total.toLocaleString('ko-KR')}곳` : ''}</div>
      {q.isLoading && !q.data ? (
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> 맛집 찾는 중…
        </p>
      ) : items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">아직 등록된 맛집이 없습니다. 여행자가 많이 간 칸이면 어드민 여행로그 시드에서 발굴해 보세요.</p>
      ) : (
        <ul className="mt-1 divide-y">
          {items.map((r) => (
            <li key={r.placeId} className="flex items-center justify-between gap-2 py-1 text-xs">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                onClick={() => {
                  if (r.latitude !== null && r.longitude !== null) onFlyTo(r.latitude, r.longitude);
                }}
                title={r.name}
              >
                {r.name}
                {r.category && <span className="ml-1 text-muted-foreground">{r.category}</span>}
              </button>
              {r.tour && <span className="shrink-0 tabular-nums text-muted-foreground">🧭 {r.tour.nTravelers}명</span>}
              <Link to={`/restaurants-v2/${r.placeId}`} className="shrink-0 text-primary underline-offset-2 hover:underline">
                상세
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
