import { Loader2, Search } from 'lucide-react';
import type { SubwayStationGroupItemType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import { SubwayLineBadge } from './SubwayLineBadge';

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
// SubwayStationSearchBar — 라이브 검색 인풋 + 메타 행(총수·갱신). 로컬 DB 조회라
// 쿼터 부담이 없어 제출 버튼/Enter 없이 onChange 즉시 검색한다(값=URL q 단일 진실
// 이라 IME 가드도 불필요 — 입력값과 controlled value 가 항상 일치). 모바일
// 레이아웃에서는 지도 위 고정 영역으로 단독 사용.
// ─────────────────────────────────────────────────────────────────────────────

export interface SubwayStationSearchBarProps {
  q: string;
  total: number;
  fetchedAt: string | null;
  // items.length < total — 서버가 그룹 수를 절단했음을 알린다.
  truncated: boolean;
  onChangeQ(next: string): void;
}

export const SubwayStationSearchBar = ({
  q,
  total,
  fetchedAt,
  truncated,
  onChangeQ,
}: SubwayStationSearchBarProps) => {
  const hasQ = q.trim().length >= 1;
  return (
    <div className="space-y-2 p-3">
      <div className="relative">
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

      {hasQ && fetchedAt && (
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
  items: SubwayStationGroupItemType[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  // 선택 id 가 현재 결과에 없음 — 리스트 상단 안내만, URL 정리는 안 함.
  selectedMissing: boolean;
  onSelect(id: string): void;
  onRetry(): void;
  // 초기 화면(검색어 없음)일 때 기본 안내 대신 렌더할 즐겨찾기 섹션. 즐겨찾기는
  // 4차 예정이라 지금은 미사용(자리만) — 미지정이면 기존 안내를 그대로 보여준다.
  favoritesContent?: React.ReactNode;
}

export const SubwayStationListBody = ({
  q,
  items,
  isLoading,
  isError,
  selectedId,
  selectedMissing,
  onSelect,
  onRetry,
  favoritesContent,
}: SubwayStationListBodyProps) => {
  const trimmed = q.trim();
  if (trimmed.length === 0) {
    // 초기 화면 — 즐겨찾기(4차)가 오면 섹션을, 없으면 기존 안내를 보여준다.
    return favoritesContent ?? <Hint>역 이름을 입력해 검색하세요.</Hint>;
  }
  // 인풋 maxLength 로는 못 막는 URL 직접 진입 케이스 — 서버 제약(50자) 안내.
  if (trimmed.length > 50) {
    return <Hint>검색어는 50자 이하로 입력하세요.</Hint>;
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
    return <Hint>검색 결과가 없습니다.</Hint>;
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
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onSelect(it.id)}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
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
                <span className="flex shrink-0 items-center gap-1">
                  {it.lines.map((l) => (
                    <SubwayLineBadge key={l.stationId} lineId={l.lineId} />
                  ))}
                </span>
              </button>
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
  total: number;
  fetchedAt: string | null;
  items: SubwayStationGroupItemType[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  selectedMissing: boolean;
  onChangeQ(next: string): void;
  onSelect(id: string): void;
  onRetry(): void;
  favoritesContent?: React.ReactNode;
}

export const SubwayStationList = ({
  q,
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
  favoritesContent,
}: Props) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <div className="border-b">
      <SubwayStationSearchBar
        q={q}
        total={total}
        fetchedAt={fetchedAt}
        truncated={items.length < total}
        onChangeQ={onChangeQ}
      />
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <SubwayStationListBody
        q={q}
        items={items}
        isLoading={isLoading}
        isError={isError}
        selectedId={selectedId}
        selectedMissing={selectedMissing}
        onSelect={onSelect}
        onRetry={onRetry}
        favoritesContent={favoritesContent}
      />
    </div>
  </div>
);
