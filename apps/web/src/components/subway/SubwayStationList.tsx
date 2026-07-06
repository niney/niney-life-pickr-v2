import { Loader2, LocateFixed, Search, X } from 'lucide-react';
import type {
  SubwayFavoriteStationItemType,
  SubwayStationGroupItemType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import { BusFavoriteStar } from '~/components/bus/BusFavoriteStar';
import { SubwayLineBadge } from './SubwayLineBadge';

// 주변 모드 행 — 검색 그룹(SubwayStationGroupItemType)에 서버가 계산한 거리(m)를
// 덧댄 형태. 검색 모드 항목은 dist 가 없어(undefined) 거리 표기를 생략한다.
export type SubwayStationRow = SubwayStationGroupItemType & { dist?: number };

// 거리(m) → 표기. 1km 미만은 정수 m, 이상은 소수 1자리 km.
const formatDist = (m: number): string =>
  m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;

// 역사마스터 적재 시각 → '갱신 N분 전' 표기. 마스터 기준일이라 분 단위면 충분.
const formatRelative = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
};

// ─────────────────────────────────────────────────────────────────────────────
// SubwayStationSearchBar — 라이브 검색 인풋 + '주변 역' 버튼 + 메타 행. 로컬 DB
// 조회라 쿼터 부담이 없어 제출 버튼/Enter 없이 onChange 즉시 검색한다(IME 안전은
// 호출부의 로컬 state 가 담당). 주변 모드면 메타가 '주변 역' 라벨 + 반경/총수로
// 바뀌고 강제 새로고침 대신 모드 해제(X)를 노출한다.
// ─────────────────────────────────────────────────────────────────────────────

export interface SubwayStationSearchBarProps {
  q: string;
  // 주변 모드 여부 — near 파라미터가 유효 좌표일 때.
  nearMode: boolean;
  total: number;
  fetchedAt: string | null;
  // items.length < total — 서버가 그룹 수를 절단했음을 알린다.
  truncated: boolean;
  onChangeQ(next: string): void;
  // 주변 역 버튼 — Geolocation 요청은 상위(SubwayPage)에서.
  onNearby(): void;
  // 주변 모드 해제 — near 파라미터 제거.
  onClearNear(): void;
}

export const SubwayStationSearchBar = ({
  q,
  nearMode,
  total,
  fetchedAt,
  truncated,
  onChangeQ,
  onNearby,
  onClearNear,
}: SubwayStationSearchBarProps) => {
  const hasQ = q.trim().length >= 1;
  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="역 이름으로 검색"
            className="pl-9"
            aria-label="역 검색"
            maxLength={50}
            value={q}
            onChange={(e) => onChangeQ(e.target.value)}
          />
        </div>
        {/* 주변 역 — 클릭 시 상위가 Geolocation 을 요청해 near 모드로 전환. */}
        <Button
          type="button"
          size="sm"
          variant={nearMode ? 'default' : 'outline'}
          onClick={onNearby}
          aria-label="내 주변 역"
          title="내 주변 역 찾기"
        >
          <LocateFixed className="size-4" />
        </Button>
      </div>

      {/* 주변 모드 메타 — '주변 역' 라벨 + 반경/총수/갱신 + 모드 해제(X). */}
      {nearMode && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 tabular-nums">
            <Badge variant="secondary" className="gap-1">
              <LocateFixed className="size-3" /> 주변 역
            </Badge>
            {fetchedAt && (
              <>반경 1.5km · 총 {total}개 · 갱신 {formatRelative(fetchedAt)}</>
            )}
          </span>
          <button
            type="button"
            onClick={onClearNear}
            aria-label="주변 모드 해제"
            title="주변 모드 해제"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* 검색 모드 메타 — 총수/갱신. */}
      {!nearMode && hasQ && fetchedAt && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            총 {total}개 · 갱신 {formatRelative(fetchedAt)}
          </span>
        </div>
      )}

      {truncated && (
        <p className="text-xs text-muted-foreground">결과가 많아 일부만 표시합니다.</p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SubwayStationListBody — 상태 분기 + 역 그룹 행 ul. 헤더와 분리 export — 모바일
// 레이아웃이 지도 아래 별도 영역에 본체만 넣는다.
// ─────────────────────────────────────────────────────────────────────────────

export interface SubwayStationListBodyProps {
  q: string;
  items: SubwayStationRow[];
  // 주변 모드 — q 길이 힌트 대신 거리 표기·주변 전용 문구를 쓴다.
  nearMode: boolean;
  // Geolocation 실패 안내(권한 거부/타임아웃/미지원/비보안). 있으면 최우선 표시.
  geoError: string | null;
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  // 선택 id 가 현재 결과에 없음 — 리스트 상단 안내만, URL 정리는 안 함.
  selectedMissing: boolean;
  onSelect(id: string): void;
  onRetry(): void;
  // 즐겨찾기 — 행 별 토글. 미지정이면 별을 렌더하지 않는다(공개 페이지에서도
  // 접근 가능하지만 통합 지점을 좁게 유지). 스냅샷은 행이 그룹에서 조립한다.
  isStationFavorite?(stationId: string): boolean;
  onToggleStationFavorite?(item: SubwayFavoriteStationItemType): void;
  // 초기 화면(검색어 없음)일 때 기본 안내 대신 렌더할 즐겨찾기 섹션. 미지정이면
  // 기존 빈 상태(안내)를 그대로 보여준다.
  favoritesContent?: React.ReactNode;
}

export const SubwayStationListBody = ({
  q,
  items,
  nearMode,
  geoError,
  isLoading,
  isError,
  selectedId,
  selectedMissing,
  onSelect,
  onRetry,
  isStationFavorite,
  onToggleStationFavorite,
  favoritesContent,
}: SubwayStationListBodyProps) => {
  // Geolocation 실패는 모드 무관 최우선 — 좌표를 못 얻어 주변 조회 자체가 불가.
  if (geoError) {
    return <Hint>{geoError}</Hint>;
  }
  const trimmed = q.trim();
  // q 길이 힌트는 검색 모드에서만 — 주변 모드는 검색어 없이 좌표로 조회한다.
  if (!nearMode) {
    if (trimmed.length === 0) {
      // 초기 화면 — 즐겨찾기(4차)가 오면 섹션을, 없으면 기존 안내를 보여준다.
      return favoritesContent ?? <Hint>역 이름을 입력해 검색하세요.</Hint>;
    }
    // 인풋 maxLength 로는 못 막는 URL 직접 진입 케이스 — 서버 제약(50자) 안내.
    if (trimmed.length > 50) {
      return <Hint>검색어는 50자 이하로 입력하세요.</Hint>;
    }
  }
  if (isLoading && items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-destructive">
        역을 불러오지 못했습니다.
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          재시도
        </Button>
      </div>
    );
  }
  if (items.length === 0) {
    return <Hint>{nearMode ? '주변에 역이 없습니다.' : '검색 결과가 없습니다.'}</Hint>;
  }
  return (
    <>
      {selectedMissing && (
        <p className="mb-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          선택한 역이 현재 결과에 없습니다.
        </p>
      )}
      {/* 재검색 중에는 이전 결과(placeholder)를 디밍해 진행 중임을 표시. */}
      <ul
        className={cn(
          'flex flex-col gap-0.5',
          isLoading && 'pointer-events-none opacity-50',
        )}
        data-testid="subway-station-list"
      >
        {items.map((it) => {
          const selected = it.id === selectedId;
          const transfer = it.lines.length > 1;
          return (
            // 행 버튼과 별을 형제로 둔다 — 버튼 중첩(무효 HTML) 회피.
            <li key={it.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(it.id)}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
                  selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium">{it.name}</span>
                  {transfer && (
                    <Badge variant="secondary" className="shrink-0">
                      환승
                    </Badge>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {/* 주변 모드 — 서버가 준 거리(m). */}
                  {it.dist !== undefined && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDist(it.dist)}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    {it.lines.map((l) => (
                      <SubwayLineBadge key={l.stationId} lineId={l.lineId} />
                    ))}
                  </span>
                </span>
              </button>
              {isStationFavorite && onToggleStationFavorite && (
                <BusFavoriteStar
                  active={isStationFavorite(it.id)}
                  onToggle={() =>
                    onToggleStationFavorite({
                      stationId: it.id,
                      name: it.name,
                      lat: it.lat,
                      lng: it.lng,
                      lines: it.lines.map((l) => l.lineId),
                    })
                  }
                  label={`${it.name} 즐겨찾기`}
                />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
};

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-32 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SubwayStationList — 데스크톱 좌측 패널용 컴포지션 (검색바 고정 + 본체 스크롤).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  q: string;
  nearMode: boolean;
  geoError: string | null;
  total: number;
  fetchedAt: string | null;
  items: SubwayStationRow[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  selectedMissing: boolean;
  onChangeQ(next: string): void;
  onSelect(id: string): void;
  onRetry(): void;
  onNearby(): void;
  onClearNear(): void;
  isStationFavorite?(stationId: string): boolean;
  onToggleStationFavorite?(item: SubwayFavoriteStationItemType): void;
  favoritesContent?: React.ReactNode;
}

export const SubwayStationList = ({
  q,
  nearMode,
  geoError,
  total,
  fetchedAt,
  items,
  isLoading,
  isError,
  selectedId,
  selectedMissing,
  onChangeQ,
  onSelect,
  onRetry,
  onNearby,
  onClearNear,
  isStationFavorite,
  onToggleStationFavorite,
  favoritesContent,
}: Props) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <div className="border-b">
      <SubwayStationSearchBar
        q={q}
        nearMode={nearMode}
        total={total}
        fetchedAt={fetchedAt}
        truncated={items.length < total}
        onChangeQ={onChangeQ}
        onNearby={onNearby}
        onClearNear={onClearNear}
      />
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <SubwayStationListBody
        q={q}
        items={items}
        nearMode={nearMode}
        geoError={geoError}
        isLoading={isLoading}
        isError={isError}
        selectedId={selectedId}
        selectedMissing={selectedMissing}
        onSelect={onSelect}
        onRetry={onRetry}
        isStationFavorite={isStationFavorite}
        onToggleStationFavorite={onToggleStationFavorite}
        favoritesContent={favoritesContent}
      />
    </div>
  </div>
);
