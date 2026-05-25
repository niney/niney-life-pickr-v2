import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useRestaurantsPublic } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

interface PickedRestaurant {
  placeId: string;
  name: string;
}

interface Props {
  open: boolean;
  // 이미 다른 차수에서 고른 placeId 들 — 같은 차수 중복 선택을 막진 않지만
  // (사용자가 의도적일 수 있음) 시각적으로 회색 처리.
  alreadyPicked?: Set<string>;
  onClose: () => void;
  onPick: (r: PickedRestaurant) => void;
}

// 차수의 식당을 검색해 고르는 모달. 공개 식당 리스트(useRestaurantsPublic)
// 와 같은 데이터 소스라 별도 backend 없이 즉시 검색.
//
// 디바운싱은 단순히 input 의 onChange 를 setQuery 로 받고, useQuery 가
// staleTime 으로 어느 정도 흡수. 300ms 디바운스로 fetch 트래픽을 더 줄인다.
export const RestaurantSearchDialog = ({
  open,
  alreadyPicked,
  onClose,
  onPick,
}: Props) => {
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');

  // 디바운스 — q 에만 들어가고 fetch 가 그 q 만 사용.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(raw.trim()), 300);
    return () => window.clearTimeout(t);
  }, [raw]);

  // 다이얼로그 닫힐 때 검색어 초기화 — 다음에 다시 열었을 때 빈 상태로.
  useEffect(() => {
    if (!open) {
      setRaw('');
      setQ('');
    }
  }, [open]);

  // 검색어가 없으면 fetch 막아 둠 — 추천 식당 같은 별도 UX 가 아직 없어
  // 빈 검색은 의미가 적다.
  const list = useRestaurantsPublic({ q: q || undefined, limit: 30 });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:h-[600px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b px-3 py-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              autoFocus
              value={raw}
              placeholder="식당명·주소 검색"
              onChange={(e) => setRaw(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="닫기">
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {q === '' && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              검색어를 입력해 주세요.
            </div>
          )}
          {q !== '' && list.isLoading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> 검색 중…
            </div>
          )}
          {q !== '' && !list.isLoading && items.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              결과가 없습니다.
            </div>
          )}
          <ul className="divide-y">
            {items.map((it) => {
              const dim = alreadyPicked?.has(it.placeId);
              return (
                <li key={it.placeId}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ placeId: it.placeId, name: it.name });
                      onClose();
                    }}
                    className={
                      'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-accent ' +
                      (dim ? 'opacity-60' : '')
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{it.name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {it.category && <>{it.category} · </>}
                        {it.address || it.roadAddress || '주소 없음'}
                      </div>
                    </div>
                    {dim && (
                      <span className="self-center rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        이미 선택됨
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};
