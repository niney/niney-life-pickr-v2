import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Plus, Search, Vote, X } from 'lucide-react';
import type { RestaurantPublicListItemType, VoteOptionInputType } from '@repo/api-contract';
import { VOTE_OPTIONS_MAX, VOTE_OPTIONS_MIN } from '@repo/api-contract';
import {
  useCreateVote,
  useMyVotes,
  useRestaurantFavorites,
  useRestaurantsPublic,
} from '@repo/shared';
import { reviewThumbnailUrl } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { useDebounced } from '~/lib/useDebounced';
import { cn } from '~/lib/utils';

// 투표방 생성 — 방장(로그인) 전용. 제목 + 등록 맛집에서 후보 2~8곳 선택(검색 +
// 즐겨찾기) → 생성 즉시 /vote/:token 으로 이동해 링크를 공유한다. 하단에 내가
// 만든 투표(최근 20)로 링크 복구.
export const VoteNewPage = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q, 300);
  const [selected, setSelected] = useState<VoteOptionInputType[]>([]);

  const search = useRestaurantsPublic({ q: debouncedQ || undefined, limit: 20 });
  // 즐겨찾기 — 페이지당 1회 호출 원칙(이 페이지의 유일한 호출).
  const favorites = useRestaurantFavorites();
  const myVotes = useMyVotes();
  const createMutation = useCreateVote();

  const searchItems = search.data?.items ?? [];
  const isSelected = (placeId: string) => selected.some((s) => s.placeId === placeId);
  const full = selected.length >= VOTE_OPTIONS_MAX;

  const addOption = (item: {
    placeId: string;
    name: string;
    category: string | null;
    thumbnailUrl: string | null;
  }) => {
    if (full || isSelected(item.placeId)) return;
    setSelected((prev) => [
      ...prev,
      {
        placeId: item.placeId,
        name: item.name,
        category: item.category,
        thumbnailUrl: item.thumbnailUrl,
      },
    ]);
  };

  const removeOption = (placeId: string) => {
    setSelected((prev) => prev.filter((s) => s.placeId !== placeId));
  };

  const canCreate =
    title.trim().length > 0 && selected.length >= VOTE_OPTIONS_MIN && !createMutation.isPending;

  const onCreate = () => {
    if (!canCreate) return;
    createMutation.mutate(
      { title: title.trim(), options: selected },
      { onSuccess: (session) => navigate(`/vote/${session.token}`) },
    );
  };

  return (
    <main className="container mx-auto max-w-2xl px-4 py-8">
      {/* PublicLayout 밖 단독 라우트라 TopBar 가 없다 — 명시적 복귀 경로 제공. */}
      <Link
        to="/"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        ← 홈으로
      </Link>
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Vote className="size-6" /> 투표 만들기
        </h1>
        <p className="text-sm text-muted-foreground">
          후보 {VOTE_OPTIONS_MIN}~{VOTE_OPTIONS_MAX}곳을 고르고 링크를 공유하면, 친구들이 로그인
          없이 바로 투표할 수 있어요.
        </p>
      </header>

      <section className="mb-6">
        <label className="mb-1.5 block text-sm font-medium" htmlFor="vote-title">
          투표 제목
        </label>
        <Input
          id="vote-title"
          value={title}
          maxLength={80}
          placeholder="예: 오늘 회식 어디로?"
          onChange={(e) => setTitle(e.target.value)}
        />
      </section>

      <section className="mb-6">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-sm font-medium">
            후보 ({selected.length}/{VOTE_OPTIONS_MAX})
          </span>
          {selected.length < VOTE_OPTIONS_MIN && (
            <span className="text-xs text-muted-foreground">
              {VOTE_OPTIONS_MIN}곳 이상 골라주세요
            </span>
          )}
        </div>
        {selected.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            아래 검색이나 즐겨찾기에서 후보를 추가하세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {selected.map((s) => (
              <li key={s.placeId} className="flex items-center gap-3 rounded-lg border p-2">
                <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                  {s.thumbnailUrl ? (
                    <ImgWithFallback
                      src={reviewThumbnailUrl(s.thumbnailUrl, 80)}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm">🍜</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  {s.category && (
                    <div className="truncate text-xs text-muted-foreground">{s.category}</div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${s.name} 후보에서 제거`}
                  onClick={() => removeOption(s.placeId)}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <label
          className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
          htmlFor="vote-search"
        >
          <Search className="size-3.5" /> 맛집 검색
        </label>
        <Input
          id="vote-search"
          value={q}
          placeholder="식당명, 카테고리로 검색"
          onChange={(e) => setQ(e.target.value)}
        />
        {debouncedQ && (
          <div className="mt-2">
            {search.isLoading ? (
              <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" /> 검색 중…
              </div>
            ) : searchItems.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">검색 결과가 없어요.</p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {searchItems.map((item) => (
                  <CandidateRow
                    key={item.placeId}
                    item={item}
                    added={isSelected(item.placeId)}
                    disabled={full}
                    onAdd={addOption}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {favorites.items.length > 0 && (
        <section className="mb-6">
          <div className="mb-1.5 text-sm font-medium">⭐ 내 즐겨찾기에서 추가</div>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {favorites.items.map((item) => (
              <CandidateRow
                key={item.placeId}
                item={item}
                added={isSelected(item.placeId)}
                disabled={full}
                onAdd={addOption}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="mb-10 flex flex-col items-center gap-2">
        <Button size="lg" disabled={!canCreate} onClick={onCreate} className="gap-2">
          {createMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Vote className="size-4" />
          )}
          투표방 만들기
        </Button>
        {createMutation.isError && (
          <p className="text-sm text-destructive">생성에 실패했어요. 다시 시도해 주세요.</p>
        )}
      </div>

      {(myVotes.data?.items.length ?? 0) > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold tracking-tight">내가 만든 투표</h2>
          <ul className="flex flex-col gap-1.5">
            {myVotes.data!.items.map((v) => (
              <li key={v.id}>
                <Link
                  to={`/vote/${v.token}`}
                  className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="transition-colors hover:bg-accent/40">
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{v.title}</div>
                        <div className="text-xs text-muted-foreground">
                          후보 {v.optionCount}곳 ·{' '}
                          {v.closedAt
                            ? '마감됨'
                            : new Date(v.expiresAt).getTime() < Date.now()
                              ? '만료됨'
                              : '진행 중'}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-primary">열기 →</span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
};

const CandidateRow = ({
  item,
  added,
  disabled,
  onAdd,
}: {
  item: Pick<RestaurantPublicListItemType, 'placeId' | 'name' | 'category' | 'thumbnailUrl'>;
  added: boolean;
  disabled: boolean;
  onAdd(item: {
    placeId: string;
    name: string;
    category: string | null;
    thumbnailUrl: string | null;
  }): void;
}) => (
  <li
    className={cn(
      'flex items-center gap-3 rounded-lg border p-2',
      added && 'border-primary/40 bg-primary/5',
    )}
  >
    <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
      {item.thumbnailUrl ? (
        <ImgWithFallback
          src={reviewThumbnailUrl(item.thumbnailUrl, 80)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-sm">🍜</div>
      )}
    </div>
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium">{item.name}</div>
      {item.category && (
        <div className="truncate text-xs text-muted-foreground">{item.category}</div>
      )}
    </div>
    <Button
      type="button"
      variant={added ? 'secondary' : 'outline'}
      size="sm"
      disabled={added || disabled}
      className="gap-1"
      onClick={() =>
        onAdd({
          placeId: item.placeId,
          name: item.name,
          category: item.category,
          thumbnailUrl: item.thumbnailUrl,
        })
      }
    >
      {added ? (
        '추가됨'
      ) : (
        <>
          <Plus className="size-3.5" /> 추가
        </>
      )}
    </Button>
  </li>
);
