import { useRef, useState } from 'react';
import { ExternalLink, Loader2, PanelLeftOpen, PanelRightOpen, Search, XCircle } from 'lucide-react';
import { Routes } from '@repo/api-contract';
import { HIKING_REGION_GROUPS, formatHikingEle, formatHikingLength, type HikingRegionGroup } from '@repo/utils';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import type { PanelSide } from '~/stores/panelPrefsStore';
import { formatHikingDistance, type HikingSort, type RankedMountain } from './hikingFormat';

// 등산 산 목록 — 맛집 목록과 같은 틀. 머리(검색·권역 칩·개수·정렬)는 데스크톱이면 목록 칸 위, 모바일이면 상단바 subBar 에
// 들어가고, 본문(산 행)과 푸터(기준 시점·출처)는 목록 칸·목록 시트 안에 들어간다.

const SORT_OPTIONS: { value: HikingSort; label: string }[] = [
  { value: 'name', label: '이름순' },
  { value: 'height', label: '높은순' },
  { value: 'near', label: '가까운순' },
];

interface HeaderProps {
  q: string;
  group: HikingRegionGroup | null;
  sort: HikingSort;
  count: number;
  locating: boolean;
  onChangeQ: (q: string) => void;
  onChangeGroup: (g: HikingRegionGroup | null) => void;
  onChangeSort: (s: HikingSort) => void;
  // 데스크톱만 — 패널 좌/우 바꾸기.
  panelSide?: PanelSide;
  onTogglePanelSide?: () => void;
}

export const HikingListHeader = ({
  q,
  group,
  sort,
  count,
  locating,
  onChangeQ,
  onChangeGroup,
  onChangeSort,
  panelSide,
  onTogglePanelSide,
}: HeaderProps) => {
  // 한글 IME — 입력은 로컬 draft 로 바로 보이고, 조합 중에는 URL 을 바꾸지 않는다(맛집 목록과 같은 이유: 조합 중 URL →
  // 다시 그리기가 미완성 글자를 덮어 "ㅅ사산" 이 된다). 조합이 끝나면 한 번에 반영.
  const composingRef = useRef(false);
  const [draft, setDraft] = useState(q);

  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="산 검색"
            placeholder="산 이름·지역 검색"
            className="pl-9 pr-9"
            value={draft}
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              if (!composingRef.current) onChangeQ(next);
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              const next = e.currentTarget.value;
              setDraft(next);
              onChangeQ(next);
            }}
          />
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft('');
                onChangeQ('');
              }}
              aria-label="검색어 지우기"
              className="absolute right-2.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <XCircle className="size-4" />
            </button>
          )}
        </div>
        {panelSide && onTogglePanelSide && (
          <button
            type="button"
            onClick={onTogglePanelSide}
            aria-label={`패널을 ${panelSide === 'right' ? '왼쪽' : '오른쪽'}으로`}
            title={`패널을 ${panelSide === 'right' ? '왼쪽' : '오른쪽'}으로`}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent"
          >
            {panelSide === 'right' ? <PanelLeftOpen className="size-4" /> : <PanelRightOpen className="size-4" />}
          </button>
        )}
      </div>

      {/* 모바일은 가로 한 줄 스와이프, md+ 는 줄바꿈(맛집 카테고리 칩과 같다). */}
      <div
        className="-mx-3 flex gap-1.5 overflow-x-auto whitespace-nowrap px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
        role="group"
        aria-label="권역"
      >
        {[{ key: null, label: '전체' }, ...HIKING_REGION_GROUPS].map((g) => (
          <button
            key={g.key ?? 'all'}
            type="button"
            aria-pressed={group === g.key}
            onClick={() => onChangeGroup(g.key)}
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors',
              group === g.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{count}개 산</span>
        <label className="inline-flex items-center gap-1.5">
          {locating && <Loader2 className="size-3.5 animate-spin" aria-label="내 위치 찾는 중" />}
          정렬
          <select
            value={sort}
            onChange={(e) => onChangeSort(e.target.value as HikingSort)}
            aria-label="정렬"
            className="h-7 rounded border bg-background px-1.5 text-xs"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};

interface ListProps {
  ranked: RankedMountain[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export const HikingMountainList = ({ ranked, isLoading, selectedId, onSelect }: ListProps) => {
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 px-3 py-8 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 산 목록을 불러오는 중…
      </p>
    );
  }
  return (
    <ol className="flex flex-col divide-y" data-testid="hiking-list">
      {ranked.map(({ mountain: m, distM }) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onSelect(m.id)}
            aria-current={m.id === selectedId ? 'true' : undefined}
            className={cn('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent', m.id === selectedId && 'bg-accent')}
          >
            {m.images[0] !== undefined ? (
              <img src={Routes.Hiking.image(m.id, m.images[0])} alt="" loading="lazy" className="size-12 shrink-0 rounded bg-muted object-cover" />
            ) : (
              <span aria-hidden className="size-12 shrink-0 rounded bg-muted" />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="truncate text-sm font-medium">{m.name}</span>
                {m.heightM !== null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatHikingEle(m.heightM)}</span>}
                {distM !== null && <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{formatHikingDistance(distM)}</span>}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{m.area}</span>
              <span className="block text-xs tabular-nums text-muted-foreground">
                코스 {m.courseCount}개
                {m.minLengthM !== null && m.maxLengthM !== null && ` · ${formatHikingLength(m.minLengthM)}~${formatHikingLength(m.maxLengthM)}`}
              </span>
            </span>
          </button>
        </li>
      ))}
      {ranked.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">조건에 맞는 산이 없습니다.</li>}
    </ol>
  );
};

export const HikingFooter = () => (
  <footer className="flex flex-col gap-1 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground" data-testid="hiking-footer">
    <div>코스·지점은 2022년 1월 기준 조사 자료입니다. 입산통제·탐방로 폐쇄·공사는 반영되지 않으니 산행 전 국립공원·지자체 안내를 확인하세요.</div>
    <div>
      출처{' '}
      <a href="https://www.data.go.kr/data/15098177/fileData.do" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
        한국등산트레킹지원센터 <ExternalLink className="size-3" />
      </a>{' '}
      100대명산 GPX·봉우리·갈림길·교통 정보,{' '}
      <a href="https://www.forest.go.kr" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
        산림청 <ExternalLink className="size-3" />
      </a>{' '}
      명산등산로·산정보(공공데이터포털).
    </div>
  </footer>
);
