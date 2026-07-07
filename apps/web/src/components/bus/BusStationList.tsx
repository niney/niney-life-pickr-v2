import { useState } from 'react';
import { Loader2, LocateFixed, RefreshCcw, Search, X } from 'lucide-react';
import type {
  BusFavoriteStationItemType,
  BusStationItemType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import { BusFavoriteStar } from './BusFavoriteStar';

// 주변 모드 정류장 행 — 검색 결과(BusStationItemType)에 서버가 계산한 거리(m)를
// 덧댄 형태. 키워드 모드 항목은 dist 가 없어(undefined) 배지를 생략한다.
export type BusStationRow = BusStationItemType & { dist?: number };

// 거리(m) → 배지 문구. 1km 미만은 정수 m, 이상은 소수 1자리 km.
const formatDist = (m: number): string =>
  m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;

// 서울시 원본 수집 시각 → '갱신 N분 전' 표기. 분 단위면 충분 — 서버 캐시
// TTL 이 30일이라 초 단위 정밀도는 의미 없다.
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
// BusStationSearchBar — 제출형 검색 인풋 + 메타 행(총수·갱신·강제 새로고침).
// 일 1,000건(개발계정) 한도 보호를 위해 onChange 검색이 아니라 Enter/버튼
// 제출만 서버를 때린다. 모바일 레이아웃에서는 지도 위 고정 영역으로 단독 사용.
// ─────────────────────────────────────────────────────────────────────────────

export interface BusStationSearchBarProps {
  q: string;
  // 주변 모드 여부 — true 면 메타 행이 '내 주변' 라벨 + 총수/갱신으로 바뀌고
  // 강제 새로고침 대신 모드 해제(X) 버튼을 노출한다.
  nearMode: boolean;
  total: number;
  fetchedAt: string | null;
  refreshing: boolean;
  // items.length < total — 서버가 100건으로 절단했음을 알린다.
  truncated: boolean;
  // 응답 source==='stale' — 서울시 API 실패로 만료 캐시를 표시 중.
  stale: boolean;
  onSubmitQ(next: string): void;
  onForceRefresh(): void;
  // 주변 정류장 버튼 클릭 — Geolocation 요청은 상위(BusPage)에서.
  onNearby(): void;
  // 주변 모드 해제 — near 파라미터 제거.
  onClearNear(): void;
}

export const BusStationSearchBar = ({
  q,
  nearMode,
  total,
  fetchedAt,
  refreshing,
  truncated,
  stale,
  onSubmitQ,
  onForceRefresh,
  onNearby,
  onClearNear,
}: BusStationSearchBarProps) => {
  // 제출형이라 draft 는 로컬 — 제출 전까지 URL/q 를 건드리지 않는다.
  // q 가 외부(다른 인스턴스 제출, 뒤로가기)에서 바뀌면 렌더 중 동기화.
  const [draft, setDraft] = useState(q);
  const [prevQ, setPrevQ] = useState(q);
  if (prevQ !== q) {
    setPrevQ(q);
    setDraft(q);
  }

  const hasQ = q.trim().length >= 2;

  return (
    <div className="space-y-2 p-3">
      {/* form 제출형 — Android 가상 키보드 '검색' 키는 keydown 이 아니라
          submit 이벤트로 들어오므로 form 으로 받아야 동작한다. */}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmitQ(draft);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="정류장 이름으로 검색 (2자 이상)"
            className="pl-9"
            aria-label="정류장 검색"
            maxLength={50}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              // 한글 조합 확정용 Enter 는 form 제출로 새지 않게 차단.
              // keyCode 229 는 isComposing 이 false 로 오는 일부 IME 의
              // keydown (Step1Participants 와 동일 가드).
              if (e.nativeEvent.isComposing || e.keyCode === 229) e.preventDefault();
            }}
          />
        </div>
        <Button type="submit" size="sm">
          검색
        </Button>
        {/* 주변 정류장 — 클릭 시 상위가 Geolocation 을 요청해 near 모드로 전환. */}
        <Button
          type="button"
          size="sm"
          variant={nearMode ? 'default' : 'outline'}
          onClick={onNearby}
          aria-label="내 주변 정류장"
          title="내 주변 정류장 찾기"
        >
          <LocateFixed className="size-4" />
        </Button>
      </form>

      {/* 키워드 모드 메타 — 총수/갱신 + 강제 새로고침. */}
      {!nearMode && hasQ && fetchedAt && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 tabular-nums">
            총 {total}개 · 갱신 {formatRelative(fetchedAt)}
            {stale && (
              <Badge variant="amber" title="서울시 API 오류 — 저장된 결과를 표시 중입니다">
                서울시 API 오류 · 저장된 결과
              </Badge>
            )}
          </span>
          <button
            type="button"
            onClick={onForceRefresh}
            disabled={refreshing}
            aria-label="강제 새로고침"
            title="서울시 API 에서 다시 가져오기"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCcw className={cn('size-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>
      )}

      {/* 주변 모드 메타 — '내 주변' 라벨 + 총수/갱신 + 모드 해제(X). */}
      {nearMode && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 tabular-nums">
            <Badge variant="secondary" className="gap-1">
              <LocateFixed className="size-3" /> 내 주변
            </Badge>
            {fetchedAt && <>총 {total}개 · 갱신 {formatRelative(fetchedAt)}</>}
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

      {truncated && (
        <p className="text-xs text-muted-foreground">결과가 많아 일부만 표시합니다.</p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BusStationListBody — 상태 분기 + 정류장 행 ul. 헤더와 분리 export — 모바일
// 레이아웃이 지도 아래 별도 영역에 본체만 넣고, 차기 바텀시트 승격도 대비.
// ─────────────────────────────────────────────────────────────────────────────

export interface BusStationListBodyProps {
  q: string;
  items: BusStationRow[];
  // 주변 모드 — q 길이 힌트 대신 거리 배지·주변 전용 문구를 쓴다.
  nearMode: boolean;
  // Geolocation 실패 안내(권한 거부/타임아웃/미지원/비보안). 있으면 최우선 표시.
  geoError: string | null;
  isLoading: boolean;
  isError: boolean;
  selectedStId: string | null;
  // 선택 stId 가 확정 결과에 없음 — 리스트 상단 안내만, URL 정리는 안 함.
  selectedMissing: boolean;
  // 강제 새로고침 진행 중 — 재시도 버튼 연타 차단.
  refreshing: boolean;
  onSelect(stId: string): void;
  // 에러 시 재시도. force 재호출(useBusStationsRefresh)을 그대로 물려도 된다 —
  // 성공하면 같은 검색 키 캐시가 교체돼 에러 상태가 풀린다.
  onRetry(): void;
  // 즐겨찾기 — 행 별 토글. 미지정이면 별을 렌더하지 않는다(공개 페이지에서도
  // 접근 가능하지만 통합 지점을 좁게 유지).
  isStationFavorite?(stId: string): boolean;
  onToggleStationFavorite?(item: BusFavoriteStationItemType): void;
  // 초기 화면(검색어 없음)일 때 기본 안내 대신 렌더할 즐겨찾기 섹션. 즐겨찾기
  // 0개면 호출부가 undefined 를 넘겨 기존 빈 상태(안내)를 그대로 보여준다.
  favoritesContent?: React.ReactNode;
  // 검색 결과 하단에 붙일 상대 도메인 크로스 섹션(15차). 호출부가 검색 모드에서만
  // 넘긴다 — 결과 있음/없음(빈 상태) 분기에서 리스트 뒤에 렌더한다.
  crossSearchContent?: React.ReactNode;
}

export const BusStationListBody = ({
  q,
  items,
  nearMode,
  geoError,
  isLoading,
  isError,
  selectedStId,
  selectedMissing,
  refreshing,
  onSelect,
  onRetry,
  isStationFavorite,
  onToggleStationFavorite,
  favoritesContent,
  crossSearchContent,
}: BusStationListBodyProps) => {
  // Geolocation 실패는 모드 무관 최우선 — 좌표를 못 얻어 주변 조회 자체가 불가.
  if (geoError) {
    return <Hint>{geoError}</Hint>;
  }
  const trimmed = q.trim();
  // q 길이 힌트는 키워드 모드에서만 — 주변 모드는 검색어 없이 좌표로 조회한다.
  if (!nearMode) {
    if (trimmed.length < 2) {
      // 초기 화면 — 즐겨찾기가 있으면 섹션을, 없으면 기존 안내를 보여준다.
      return favoritesContent ?? <Hint>정류장 이름을 2자 이상 입력해 검색하세요.</Hint>;
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
        정류장을 불러오지 못했습니다.
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={onRetry}
        >
          재시도
        </Button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <>
        <Hint>{nearMode ? '주변에 정류장이 없습니다.' : '검색 결과가 없습니다.'}</Hint>
        {crossSearchContent}
      </>
    );
  }
  return (
    <>
      {selectedMissing && (
        <p className="mb-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          선택한 정류장이 현재 결과에 없습니다.
        </p>
      )}
      {/* 재검색 중에는 이전 결과(placeholder)를 디밍해 진행 중임을 표시. */}
      <ul
        className={cn(
          'flex flex-col gap-0.5',
          isLoading && 'pointer-events-none opacity-50',
        )}
        data-testid="bus-station-list"
      >
        {items.map((it) => {
          const selected = it.stId === selectedStId;
          return (
            // 행 버튼과 별을 형제로 둔다 — 버튼 중첩(무효 HTML) 회피.
            <li key={it.stId} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(it.stId)}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
                  selected
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50',
                )}
              >
                <span className="truncate font-medium">{it.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {/* 주변 모드 — 서버가 준 거리 배지(파란 톤). */}
                  {it.dist !== undefined && (
                    <Badge variant="default" className="tabular-nums">
                      {formatDist(it.dist)}
                    </Badge>
                  )}
                  {/* arsId '0' = 가상정류장(표지판 번호 없음) — 배지 숨김. */}
                  {it.arsId !== '0' && (
                    <Badge variant="secondary" className="tabular-nums">
                      {it.arsId}
                    </Badge>
                  )}
                </span>
              </button>
              {isStationFavorite && onToggleStationFavorite && (
                <BusFavoriteStar
                  active={isStationFavorite(it.stId)}
                  onToggle={() =>
                    onToggleStationFavorite({
                      stId: it.stId,
                      arsId: it.arsId,
                      name: it.name,
                      lat: it.lat,
                      lng: it.lng,
                    })
                  }
                  label={`${it.name} 즐겨찾기`}
                />
              )}
            </li>
          );
        })}
      </ul>
      {crossSearchContent}
    </>
  );
};

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-32 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// BusStationList — 데스크톱 좌측 패널용 컴포지션 (검색바 고정 + 본체 스크롤).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  q: string;
  nearMode: boolean;
  geoError: string | null;
  items: BusStationRow[];
  total: number;
  fetchedAt: string | null;
  isLoading: boolean;
  isError: boolean;
  selectedStId: string | null;
  selectedMissing: boolean;
  refreshing: boolean;
  stale: boolean;
  onSubmitQ(next: string): void;
  onSelect(stId: string): void;
  onForceRefresh(): void;
  onNearby(): void;
  onClearNear(): void;
  isStationFavorite?(stId: string): boolean;
  onToggleStationFavorite?(item: BusFavoriteStationItemType): void;
  favoritesContent?: React.ReactNode;
  crossSearchContent?: React.ReactNode;
}

export const BusStationList = ({
  q,
  nearMode,
  geoError,
  items,
  total,
  fetchedAt,
  isLoading,
  isError,
  selectedStId,
  selectedMissing,
  refreshing,
  stale,
  onSubmitQ,
  onSelect,
  onForceRefresh,
  onNearby,
  onClearNear,
  isStationFavorite,
  onToggleStationFavorite,
  favoritesContent,
  crossSearchContent,
}: Props) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <div className="border-b">
      <BusStationSearchBar
        q={q}
        nearMode={nearMode}
        total={total}
        fetchedAt={fetchedAt}
        refreshing={refreshing}
        truncated={items.length < total}
        stale={stale}
        onSubmitQ={onSubmitQ}
        onForceRefresh={onForceRefresh}
        onNearby={onNearby}
        onClearNear={onClearNear}
      />
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <BusStationListBody
        q={q}
        nearMode={nearMode}
        geoError={geoError}
        items={items}
        isLoading={isLoading}
        isError={isError}
        selectedStId={selectedStId}
        selectedMissing={selectedMissing}
        refreshing={refreshing}
        onSelect={onSelect}
        onRetry={onForceRefresh}
        isStationFavorite={isStationFavorite}
        onToggleStationFavorite={onToggleStationFavorite}
        favoritesContent={favoritesContent}
        crossSearchContent={crossSearchContent}
      />
    </div>
  </div>
);
