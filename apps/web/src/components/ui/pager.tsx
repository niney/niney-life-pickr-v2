import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '~/lib/utils';

interface PagerProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

const DEFAULT_PAGE_SIZES = [25, 50, 100];

// 양 끝(1, total) + 현재 ±2 만 노출. 그 외 구간은 ellipsis. 페이지 수가 늘어도
// 폭이 일정 → 표 하단 레이아웃 안정.
const buildRange = (current: number, totalPages: number): Array<number | 'ellipsis'> => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const items: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, current - 2);
  const end = Math.min(totalPages - 1, current + 2);
  if (start > 2) items.push('ellipsis');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < totalPages - 1) items.push('ellipsis');
  items.push(totalPages);
  return items;
};

export const Pager = ({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  className,
}: PagerProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const canPrev = clampedPage > 1;
  const canNext = clampedPage < totalPages;

  // total=0 도 페이저는 살려서 빈 상태 표시 — 사라지면 레이아웃이 점프함.
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 text-sm text-muted-foreground',
        className,
      )}
    >
      {/* 좌측 — 표시 범위. 모바일은 컴팩트. */}
      <div className="min-w-0 flex-1 truncate">
        {total === 0 ? (
          <span>0건</span>
        ) : (
          <span>
            <span className="hidden sm:inline">
              {(clampedPage - 1) * pageSize + 1}-
              {Math.min(clampedPage * pageSize, total)} / {total}
            </span>
            <span className="sm:hidden">
              {clampedPage}/{totalPages}
            </span>
          </span>
        )}
      </div>

      {/* 데스크탑(xl+) 풀 페이저 */}
      <div className="hidden items-center gap-1 xl:flex">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!canPrev}
          onClick={() => onPageChange(1)}
          aria-label="첫 페이지"
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!canPrev}
          onClick={() => onPageChange(clampedPage - 1)}
          aria-label="이전 페이지"
        >
          <ChevronLeft className="size-4" />
        </Button>
        {buildRange(clampedPage, totalPages).map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`e${idx}`} className="px-1 text-muted-foreground/60">
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === clampedPage ? 'default' : 'ghost'}
              size="sm"
              className="h-8 min-w-8 px-2"
              onClick={() => onPageChange(item)}
              aria-current={item === clampedPage ? 'page' : undefined}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!canNext}
          onClick={() => onPageChange(clampedPage + 1)}
          aria-label="다음 페이지"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!canNext}
          onClick={() => onPageChange(totalPages)}
          aria-label="마지막 페이지"
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>

      {/* 모바일(<xl) 컴팩트 페이저 — prev/next 만 */}
      <div className="flex items-center gap-1 xl:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!canPrev}
          onClick={() => onPageChange(clampedPage - 1)}
          aria-label="이전 페이지"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={!canNext}
          onClick={() => onPageChange(clampedPage + 1)}
          aria-label="다음 페이지"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* 페이지당 드롭다운 — 데스크탑만(모바일은 공간 절약). */}
      {onPageSizeChange && (
        <div className="hidden items-center gap-1 xl:flex">
          <span className="text-xs">페이지당</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            aria-label="페이지당 항목 수"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
