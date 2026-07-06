import { useDeferredValue, useState } from 'react';
import { ArrowLeft, CornerDownRight, Loader2, Search } from 'lucide-react';
import type { SubwayPathResultType } from '@repo/api-contract';
import { useSubwayStationSearch } from '@repo/shared';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import { SubwayLineBadge } from './SubwayLineBadge';

export interface SubwayPathPanelProps {
  fromName: string;
  // 출발 stn — 도착 후보에서 제외(from===to 무효).
  fromId: string;
  // 선택된 도착 id(URL to). null 이면 도착역 검색 단계.
  to: string | null;
  toName: string;
  path: SubwayPathResultType | null;
  isLoading: boolean;
  isError: boolean;
  onSelectDest(id: string): void;
  onClearDest(): void;
  onBack(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SubwayPathPanel — 길찾기 뷰. 도착 패널 영역이 이 뷰로 전환된다('← 도착정보' 복귀).
// 도착역을 미니 검색(라이브 — 입력값은 IME 안전한 로컬 state)으로 고르면 상위가 URL
// to 를 세팅하고 경로(leg)를 받아 여기서 렌더한다.
// ─────────────────────────────────────────────────────────────────────────────

export const SubwayPathPanel = ({
  fromName,
  fromId,
  to,
  toName,
  path,
  isLoading,
  isError,
  onSelectDest,
  onClearDest,
  onBack,
}: SubwayPathPanelProps) => {
  // 도착역 검색 — 입력 진실은 로컬 state(라우터 왕복이 IME 조합을 깨지 않게, 라이브
  // 검색 규율과 동일). 실제 쿼리는 deferred.
  const [destInput, setDestInput] = useState('');
  const deferredQ = useDeferredValue(destInput);
  const search = useSubwayStationSearch(deferredQ);
  const trimmed = deferredQ.trim();
  const hasQ = trimmed.length >= 1 && trimmed.length <= 50;
  // 출발역은 후보에서 제외(같은 역 선택 무효).
  const results = hasQ ? (search.data?.items ?? []).filter((it) => it.id !== fromId) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="size-3.5" /> 도착정보
          </button>
          <span className="min-w-0 truncate text-sm">
            <span className="text-muted-foreground">출발</span>{' '}
            <span className="font-semibold">{fromName}</span>
          </span>
        </div>

        {/* 도착역 — 선택 전이면 검색, 선택 후면 칩 + '다시 선택'. */}
        {to ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">도착</span>
            <span className="min-w-0 truncate font-semibold">{toName}</span>
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={onClearDest}>
              다시 선택
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="도착역 검색"
              className="pl-9"
              aria-label="도착역 검색"
              maxLength={50}
              value={destInput}
              onChange={(e) => setDestInput(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {to ? (
          <PathResult path={path} isLoading={isLoading} isError={isError} />
        ) : (
          <DestSearchResults
            hasQ={hasQ}
            loading={search.isLoading || (search.isFetching && search.isPlaceholderData)}
            results={results}
            onSelectDest={onSelectDest}
            onPicked={() => setDestInput('')}
          />
        )}
      </div>
    </div>
  );
};

const DestSearchResults = ({
  hasQ,
  loading,
  results,
  onSelectDest,
  onPicked,
}: {
  hasQ: boolean;
  loading: boolean;
  results: { id: string; name: string; lines: { stationId: string; lineId: string }[] }[];
  onSelectDest(id: string): void;
  onPicked(): void;
}) => {
  if (!hasQ) {
    return <Hint>도착역을 검색하세요.</Hint>;
  }
  if (loading && results.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }
  if (results.length === 0) {
    return <Hint>검색 결과가 없습니다.</Hint>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {results.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            onClick={() => {
              onSelectDest(it.id);
              onPicked();
            }}
            className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50"
          >
            <span className="truncate font-medium">{it.name}</span>
            <span className="flex shrink-0 items-center gap-1">
              {it.lines.map((l) => (
                <SubwayLineBadge key={l.stationId} lineId={l.lineId} />
              ))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};

const PathResult = ({
  path,
  isLoading,
  isError,
}: {
  path: SubwayPathResultType | null;
  isLoading: boolean;
  isError: boolean;
}) => {
  if (isLoading && !path) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 경로 찾는 중…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-destructive">
        경로를 불러오지 못했습니다.
      </div>
    );
  }
  if (!path) return null;
  if (!path.found || path.legs.length === 0) {
    return <Hint>경로를 찾지 못했어요. 다른 역으로 다시 시도해 주세요.</Hint>;
  }
  return (
    <div className="space-y-3">
      {/* 요약 — 소요는 근사라 '약' 필수. */}
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <div className="font-semibold tabular-nums">
          {path.approxMinutes !== null ? `약 ${path.approxMinutes}분` : '소요 시간 미상'}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          환승 {path.transferCount}회 · {path.totalRideStations}개 역 이동
        </div>
      </div>

      <ol className="flex flex-col gap-2">
        {path.legs.map((leg, idx) => {
          const first = leg.stations[0]!;
          const last = leg.stations[leg.stations.length - 1]!;
          return (
            <li key={`${leg.lineId}-${idx}`}>
              {idx > 0 && (
                <div className="mb-2 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                  <CornerDownRight className="size-3.5" /> 환승
                </div>
              )}
              <div className="rounded-md border p-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <SubwayLineBadge lineId={leg.lineId} />
                  <span className="text-sm font-semibold">{leg.lineName}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {leg.rideCount}개 역
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="shrink-0">
                      탑승
                    </Badge>
                    <span className="min-w-0 truncate font-medium">{first.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="shrink-0">
                      하차
                    </Badge>
                    <span className="min-w-0 truncate font-medium">{last.name}</span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

const Hint = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-32 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);
