import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Receipt } from 'lucide-react';
import { ApiError, useListSettlements } from '@repo/shared';
import { Card, CardContent } from '~/components/ui/card';
import { Pager } from '~/components/ui/pager';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

// 로그인 사용자의 정산 이력 — 최근순 단순 리스트. 식당명·날짜·합계·인원수·항목수.
// 행 클릭 시 결과 페이지로 이동. server 는 page=offset+limit, 응답은
// SettlementSessionSummary 만 내려 본문이 가볍다.
export const SettlementHistoryPage = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const query = useMemo(
    () => ({ offset: (page - 1) * pageSize, limit: pageSize }),
    [page, pageSize],
  );
  const list = useListSettlements(query);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-4 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Receipt className="size-4" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">내 정산 이력</h1>
          <p className="text-sm text-muted-foreground">
            저장한 정산을 최근순으로 보여줍니다.
          </p>
        </div>
      </header>

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
          {list.data.items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <p>아직 저장된 정산이 없습니다.</p>
                <p>식당 상세에서 ‘정산’ 버튼으로 시작해 보세요.</p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {list.data.items.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/restaurants/${s.restaurantPlaceId}/settle/${s.id}`}
                    className="block"
                  >
                    <Card className="transition-colors hover:border-primary/40 hover:bg-accent">
                      <div className="flex items-center justify-between gap-3 p-4 sm:p-5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {s.restaurantName}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {new Date(s.createdAt).toLocaleString('ko-KR')}
                            {' · '}항목 {s.itemCount}개 · 참여 {s.participantCount}명
                            {' · '}
                            {s.source === 'RECEIPT' ? '영수증' : '직접 입력'}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold">
                            {s.itemsSubtotal.toLocaleString('ko-KR')}원
                          </div>
                          {s.totalAmount != null && s.totalAmount !== s.itemsSubtotal && (
                            <div className="text-xs text-muted-foreground">
                              총 {s.totalAmount.toLocaleString('ko-KR')}원
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <Pager
              total={list.data.total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          </div>
        </>
      )}
    </main>
  );
};
