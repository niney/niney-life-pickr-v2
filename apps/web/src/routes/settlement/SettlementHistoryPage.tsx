import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, Receipt, Trash2 } from 'lucide-react';
import {
  ApiError,
  useDeleteSettlement,
  useListSettlements,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Pager } from '~/components/ui/pager';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { cn } from '~/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

// 로그인 사용자의 정산 이력 — 최근순 단순 리스트. 식당명·날짜·합계·인원수·항목수.
// 행 클릭 시 결과 페이지로 이동. server 는 page=offset+limit, 응답은
// SettlementSessionSummary 만 내려 본문이 가볍다.
//
// 삭제: 행 우측 휴지통(단건) + 체크박스 다중 선택 후 일괄 삭제. 일괄은
// 서버 라운드트립 N번이지만 useDeleteSettlement 가 onSuccess 마다 invalidate
// 하니까 마지막 호출에서 한 번만 refetch 된다 (react-query 가 debounce 처리).
export const SettlementHistoryPage = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const query = useMemo(
    () => ({ offset: (page - 1) * pageSize, limit: pageSize }),
    [page, pageSize],
  );
  const list = useListSettlements(query);
  const deleteMut = useDeleteSettlement();

  // 다중 선택 — 페이지 이동/사이즈 변경 시 자동 초기화.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 단건/일괄 confirm dialog 상태.
  const [confirmTarget, setConfirmTarget] = useState<
    { mode: 'single'; id: string; label: string } | { mode: 'bulk' } | null
  >(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = list.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((s) => selected.has(s.id));
  const someSelected = selected.size > 0;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((s) => s.id)));
  };

  const handleConfirmSingle = async () => {
    if (confirmTarget?.mode !== 'single') return;
    const id = confirmTarget.id;
    try {
      await deleteMut.mutateAsync(id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setConfirmTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '삭제 실패');
      setConfirmTarget(null);
    }
  };

  const handleConfirmBulk = async () => {
    if (confirmTarget?.mode !== 'bulk') return;
    setBulkPending(true);
    setError(null);
    const ids = Array.from(selected);
    const results = await Promise.allSettled(
      ids.map((id) => deleteMut.mutateAsync(id)),
    );
    setBulkPending(false);
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      setError(`${ids.length - failed}건 삭제, ${failed}건 실패`);
    }
    setSelected(new Set());
    setConfirmTarget(null);
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-4 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Receipt className="size-4" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">내 정산 이력</h1>
          <p className="text-sm text-muted-foreground">
            저장한 정산을 최근순으로 보여줍니다.
          </p>
        </div>
        <Button asChild variant="default" size="sm">
          <Link to="/me/settlements/new">
            <Plus className="size-4" />새 정산
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/me/contacts">내 단골 →</Link>
        </Button>
      </header>

      {/* 선택 있을 때 상단 sticky 바 — 일괄 액션 진입점. */}
      {someSelected && (
        <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-2 rounded-md border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="size-4"
              />
              <span>
                {allSelected ? '전체 해제' : '현재 페이지 전체 선택'}
              </span>
            </label>
            <span className="text-muted-foreground">{selected.size}개 선택됨</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              해제
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmTarget({ mode: 'bulk' })}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              {selected.size}개 삭제
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-3 text-sm text-destructive">{error}</p>
      )}

      {list.isLoading && (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
        </div>
      )}

      {list.isError && (
        <p className="text-sm text-destructive">
          이력을 불러오지 못했습니다.{' '}
          {list.error instanceof ApiError ? list.error.message : ''}
        </p>
      )}

      {list.data && (
        <>
          {items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <p>아직 저장된 정산이 없습니다.</p>
                <p>식당 상세에서 ‘정산’ 버튼으로 시작하거나 아래 버튼으로 새로 만드세요.</p>
                <Button asChild size="sm" className="mt-2">
                  <Link to="/me/settlements/new">
                    <Plus className="size-4" />새 정산
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {items.map((s) => {
                const isSelected = selected.has(s.id);
                const isDeleting =
                  deleteMut.isPending && deleteMut.variables === s.id;
                const label = `${s.restaurantName}${s.roundCount > 1 ? ` 외 ${s.roundCount - 1}곳` : ''}`;
                return (
                  <li key={s.id}>
                    <Card
                      className={cn(
                        'relative transition-colors hover:border-primary/40',
                        isSelected && 'border-primary/60 bg-primary/5',
                        isDeleting && 'opacity-50 pointer-events-none',
                      )}
                    >
                      <div className="flex items-center gap-3 p-4 sm:p-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(s.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`${label} 선택`}
                          className="size-4 shrink-0"
                        />
                        <Link
                          to={`/restaurants/${s.restaurantPlaceId}/settle/${s.id}`}
                          className="min-w-0 flex-1"
                        >
                          <div className="truncate text-sm font-medium">
                            {s.restaurantName}
                            {s.roundCount > 1 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                외 {s.roundCount - 1}곳 ({s.roundCount}차)
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {new Date(s.createdAt).toLocaleString('ko-KR')}
                            {' · '}항목 {s.itemCount}개 · 참여 {s.participantCount}명
                            {' · '}
                            {s.source === 'RECEIPT' ? '영수증' : '직접 입력'}
                            {s.roundCount > 1 ? ' 외' : ''}
                          </div>
                        </Link>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold">
                            {s.grandTotal.toLocaleString('ko-KR')}원
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="삭제"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setConfirmTarget({ mode: 'single', id: s.id, label });
                          }}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          {isDeleting ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4">
            <Pager
              total={list.data.total}
              page={page}
              pageSize={pageSize}
              onPageChange={(p) => {
                setPage(p);
                setSelected(new Set());
              }}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
                setSelected(new Set());
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmTarget?.mode === 'single'}
        title="정산 이력을 삭제할까요?"
        description={
          confirmTarget?.mode === 'single'
            ? `‘${confirmTarget.label}’ 이력이 영구 삭제됩니다.`
            : undefined
        }
        confirmLabel="삭제"
        variant="destructive"
        pending={deleteMut.isPending}
        onConfirm={handleConfirmSingle}
        onClose={() => setConfirmTarget(null)}
      />
      <ConfirmDialog
        open={confirmTarget?.mode === 'bulk'}
        title={`선택한 ${selected.size}개를 삭제할까요?`}
        description="삭제는 되돌릴 수 없습니다."
        confirmLabel={`${selected.size}개 삭제`}
        variant="destructive"
        pending={bulkPending}
        onConfirm={handleConfirmBulk}
        onClose={() => setConfirmTarget(null)}
      />
    </main>
  );
};
