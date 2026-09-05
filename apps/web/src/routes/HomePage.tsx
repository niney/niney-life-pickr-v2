import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRestaurantFavorites, useRestaurantRanking } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import { SmartPickSection } from '~/components/restaurant/SmartPickSection';
import { RestaurantFavoritesStrip } from '~/components/restaurant/RestaurantFavoritesStrip';

const PAGE_SIZE = 20;

type Sort = 'positive' | 'negative';

export const HomePage = () => {
  const [sort, setSort] = useState<Sort>('positive');
  const [excludeNeutral, setExcludeNeutral] = useState(false);
  const [offset, setOffset] = useState(0);

  // 맛집 즐겨찾기 — 페이지당 1회 호출 원칙. 픽 섹션(즐겨찾기 뽑기 모드)과
  // 스트립이 같은 인스턴스를 공유한다.
  const favorites = useRestaurantFavorites();

  const ranking = useRestaurantRanking({
    sort,
    excludeNeutral,
    minMentions: 5,
    limit: PAGE_SIZE,
    offset,
  });

  const onChangeSort = (next: Sort) => {
    if (next === sort) return;
    setSort(next);
    setOffset(0);
  };
  const onToggleNeutral = (next: boolean) => {
    if (next === excludeNeutral) return;
    setExcludeNeutral(next);
    setOffset(0);
  };

  const items = ranking.data?.items ?? [];
  const total = ranking.data?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <SmartPickSection favorites={favorites} />

      {/* 그룹 투표 진입 — 혼자 뽑기(위 슬롯) 옆의 소셜 갈래. 생성은 로그인 필요
          (라우트 가드), 참여는 링크만 있으면 비로그인. */}
      <div className="-mt-6 mb-10 text-center">
        <Link
          to="/vote/new"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          👥 혼자 못 정하겠다면? 친구들과 투표로 정하기 →
        </Link>
      </div>

      {/* 타로 진입 — 맛집 밖의 "선택" 갈래. 로그인 없이 무료. */}
      <Link
        to="/tarot"
        className="mb-10 block rounded-2xl border border-[#d9b65b]/30 bg-[radial-gradient(ellipse_at_15%_20%,#22306a,#05071a_70%)] p-5 text-[#ece6d6] shadow-lg transition hover:border-[#d9b65b]/70"
      >
        <div className="flex items-center gap-4">
          <span className="text-3xl" aria-hidden>
            🔮
          </span>
          <div className="min-w-0">
            <div className="font-serif-kr text-lg font-bold text-[#f3e9c6]">타로로 골라 보기</div>
            <div className="text-sm text-[#ece6d6]/70">
              오늘의 카드, 세 장 리딩, 선택 타로, 오늘 뭐 먹지 메뉴 타로. 로그인 없이 무료.
            </div>
          </div>
          <span className="ml-auto shrink-0 text-[#d9b65b]" aria-hidden>
            →
          </span>
        </div>
      </Link>

      <RestaurantFavoritesStrip items={favorites.items} onToggle={favorites.toggle} />

      <header className="mb-6 flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-tight">맛집 랭킹</h2>
        <p className="text-sm text-muted-foreground">
          AI가 분석한 리뷰의 긍정/부정 비율로 정렬한 식당 랭킹입니다. 멘션 5건 이상.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <ToggleGroup
          label="정렬"
          value={sort}
          options={[
            { value: 'positive', label: '긍정 순위' },
            { value: 'negative', label: '부정 순위' },
          ]}
          onChange={onChangeSort}
        />
        <ToggleGroup
          label="중립"
          value={excludeNeutral ? 'exclude' : 'include'}
          options={[
            { value: 'include', label: '중립 포함' },
            { value: 'exclude', label: '중립 제외' },
          ]}
          onChange={(v) => onToggleNeutral(v === 'exclude')}
        />
      </div>

      {ranking.isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">불러오는 중…</p>
      ) : ranking.isError ? (
        <p className="py-12 text-center text-sm text-destructive">랭킹을 불러오지 못했습니다.</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          조건에 맞는 식당이 아직 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.placeId}>
              <RankingRow item={item} sort={sort} />
            </li>
          ))}
        </ul>
      )}

      {(hasPrev || hasNext) && (
        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            이전
          </Button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} / {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
};

interface ToggleGroupProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

const ToggleGroup = <T extends string>({
  label,
  value,
  options,
  onChange,
}: ToggleGroupProps<T>) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="inline-flex rounded-md border bg-card p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  </div>
);

interface RankingRowProps {
  item: {
    rank: number;
    placeId: string;
    name: string;
    category: string | null;
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    totalMentions: number;
    score: number;
  };
  sort: Sort;
}

const RankingRow = ({ item, sort }: RankingRowProps) => {
  const total = Math.max(1, item.totalMentions);
  const posPct = (item.positiveCount / total) * 100;
  const negPct = (item.negativeCount / total) * 100;
  const neuPct = 100 - posPct - negPct;

  return (
    <Link
      to={`/restaurants-v2/${item.placeId}`}
      // 클릭 = 신버전 맛집 레이아웃의 상세로 진입. placeId 가 그대로 라우팅 키.
      // Link 라 Cmd/Ctrl+클릭 새 탭·키보드 포커스가 그대로 동작한다.
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="transition-colors hover:border-primary/40 hover:bg-accent/40">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="w-8 shrink-0 text-center text-lg font-bold tabular-nums text-muted-foreground">
            {item.rank}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold">{item.name}</div>
                {item.category && (
                  <div className="truncate text-xs text-muted-foreground">{item.category}</div>
                )}
              </div>
              <div
                className={cn(
                  'shrink-0 text-lg font-bold tabular-nums',
                  sort === 'positive'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400',
                )}
              >
                {Math.round(item.score * 100)}%
              </div>
            </div>

            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="bg-emerald-500" style={{ width: `${posPct}%` }} />
              <div className="bg-zinc-400" style={{ width: `${neuPct}%` }} />
              <div className="bg-rose-500" style={{ width: `${negPct}%` }} />
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">
                긍정 {item.positiveCount}
              </span>
              <span>중립 {item.neutralCount}</span>
              <span className="text-rose-600 dark:text-rose-400">부정 {item.negativeCount}</span>
              <span>· 총 {item.totalMentions}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};
