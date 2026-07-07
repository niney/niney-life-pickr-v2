import { useNavigate } from 'react-router-dom';
import { Bus, ChevronRight, TrainFront } from 'lucide-react';
import { useBusStationSearch, useSubwayStationSearch } from '@repo/shared';
import { Badge } from '~/components/ui/badge';
import { SubwayLineBadge } from '~/components/subway/SubwayLineBadge';

// 통합 15차 — 검색 결과 하단의 상대 도메인 크로스 섹션. 양 탭의 검색 UX 를 "Enter·
// 검색 버튼 = 이 검색어로 확정 → 상대 도메인까지 찾기"로 통일한다. 두 섹션 모두
// **확정된 검색어(제출 q)** 로 자동 조회하며(타이핑 중엔 발화하지 않음 — 호출부가
// 제출 시점에만 이 섹션을 렌더/q 갱신), 행/더보기 클릭은 상대 탭으로 딥링크하며
// q(검색어)와 선택 id 를 함께 넘겨 상대 탭이 같은 검색+선택으로 복원된다.
//
// 도메인·훅·뱃지·딥링크가 갈려 한 컴포넌트로 억지 통합하지 않고 포커스된 두 export
// 로 둔다(공통 chrome 은 작아 인라인). 0건/로딩/에러면 섹션을 숨긴다(자동 섹션이라
// 보조적 — 결과가 있을 때만 노출).

const PREVIEW_COUNT = 3;

// ── 버스 탭 → 지하철 크로스 ───────────────────────────────────────────────────
// useSubwayStationSearch 는 로컬 DB(쿼터 0)라 제출된 q 에 자동 조회해도 부담이
// 없다. 버스 탭은 제출형이라 q(=URL 의 제출된 검색어)가 곧 확정값 — 라이브 발화 없음.
export const SubwayCrossSection = ({ q }: { q: string }) => {
  const navigate = useNavigate();
  const search = useSubwayStationSearch(q);
  const items = search.data?.items ?? [];
  const total = search.data?.total ?? 0;
  if (items.length === 0) return null;
  const top = items.slice(0, PREVIEW_COUNT);
  const encQ = encodeURIComponent(q);
  return (
    <section className="mt-4 border-t pt-3">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
        <TrainFront className="size-3.5" /> 지하철역 {total}건
      </div>
      <ul className="flex flex-col gap-0.5">
        {top.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => navigate(`/subway?q=${encQ}&stn=${encodeURIComponent(g.id)}`)}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
            >
              <span className="truncate font-medium">{g.name}</span>
              <span className="flex shrink-0 items-center gap-1">
                {g.lines.map((l) => (
                  <SubwayLineBadge key={l.lineId} lineId={l.lineId} />
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => navigate(`/subway?q=${encQ}`)}
        className="mt-1 flex w-full items-center justify-center gap-1 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        지하철 탭에서 {total}건 모두 보기 <ChevronRight className="size-3.5" />
      </button>
    </section>
  );
};

// ── 지하철 탭 → 버스 크로스 ───────────────────────────────────────────────────
// 버스 검색(useBusStationSearch)은 서울시 API(캐시 미스 시 쿼터 소비)라 타이핑마다
// 발화하면 안 된다. 호출부(SubwayPage)가 '제출된 검색어(submittedQ)'일 때만 이 섹션을
// 렌더하고 q 로 그 값을 넘긴다 — 라이브 검색(역 결과)엔 안 뜨고 Enter/검색 버튼에만
// 갱신(제출 게이트). 제출 후 타이핑으로 지하철 결과가 달라져도 이 섹션은 submittedQ
// 기준을 유지하므로, 헤더에 그 검색어를 함께 보여 혼동을 막는다.
export const BusCrossSection = ({ q }: { q: string }) => {
  const navigate = useNavigate();
  const search = useBusStationSearch(q);
  const items = search.data?.items ?? [];
  const total = search.data?.total ?? 0;
  if (items.length === 0) return null;
  const top = items.slice(0, PREVIEW_COUNT);
  const encQ = encodeURIComponent(q);
  return (
    <section className="mt-4 border-t pt-3">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground">
        <Bus className="size-3.5" />
        <span className="truncate">
          <span className="text-foreground">'{q}'</span> 정류장 {total}건
        </span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {top.map((it) => (
          <li key={it.stId}>
            <button
              type="button"
              onClick={() => navigate(`/bus?q=${encQ}&stId=${encodeURIComponent(it.stId)}`)}
              className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
            >
              <span className="truncate font-medium">{it.name}</span>
              {/* arsId '0' = 가상정류장(표지판 번호 없음) — 배지 숨김(버스 규칙). */}
              {it.arsId !== '0' && (
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {it.arsId}
                </Badge>
              )}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => navigate(`/bus?q=${encQ}`)}
        className="mt-1 flex w-full items-center justify-center gap-1 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        버스 탭에서 {total}건 모두 보기 <ChevronRight className="size-3.5" />
      </button>
    </section>
  );
};
