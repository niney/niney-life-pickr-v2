import { useState } from 'react';
import { AlertTriangle, BarChart3, Loader2, Sparkles } from 'lucide-react';
import { useGroupForRestaurant, useMenuRanking } from '@repo/shared';
import type { MenuRankingSortType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { SectionHeader } from './sections';

const SORT_OPTIONS: { value: MenuRankingSortType; label: string }[] = [
  { value: 'mentions', label: '언급 수' },
  { value: 'positive', label: '긍정 수' },
  { value: 'positiveRatio', label: '긍정 비율' },
  { value: 'negative', label: '부정 수' },
];

const SELECT_CLASS =
  'rounded border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

export const MenuRankingSection = ({ placeId }: { placeId: string }) => {
  const [sort, setSort] = useState<MenuRankingSortType>('mentions');
  const [minMentions, setMinMentions] = useState(2);
  const [showAll, setShowAll] = useState(false);

  const ranking = useMenuRanking(placeId, { sort, minMentions });
  const groupMutation = useGroupForRestaurant();

  if (ranking.isLoading) {
    return (
      <section className="space-y-3">
        <SectionHeader icon={<BarChart3 className="size-4" />} label="메뉴 순위" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </div>
      </section>
    );
  }

  if (!ranking.data || ranking.data.totalMentions === 0) {
    return (
      <section className="space-y-3">
        <SectionHeader icon={<BarChart3 className="size-4" />} label="메뉴 순위" />
        <p className="text-sm text-muted-foreground">
          분석된 리뷰에서 추출된 메뉴 멘션이 아직 없습니다.
        </p>
      </section>
    );
  }

  const data = ranking.data;
  const visible = showAll ? data.items : data.items.slice(0, 10);
  const hasUnmapped = data.unmappedMenus.length > 0;
  const isStale =
    data.modelVersion !== null && data.modelVersion < data.currentVersion;
  const showClassifyButton = hasUnmapped || isStale;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeader icon={<BarChart3 className="size-4" />} label="메뉴 순위" />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as MenuRankingSortType)}
            className={SELECT_CLASS}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}순
              </option>
            ))}
          </select>
          <select
            value={minMentions}
            onChange={(e) => setMinMentions(Number(e.target.value))}
            className={SELECT_CLASS}
          >
            <option value={1}>최소 1회</option>
            <option value={2}>최소 2회</option>
            <option value={3}>최소 3회</option>
            <option value={5}>최소 5회</option>
          </select>
        </div>
      </div>

      {showClassifyButton && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300/50 bg-amber-50/50 p-3 text-sm dark:border-amber-700/50 dark:bg-amber-950/20">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          <div className="flex-1 min-w-0">
            {hasUnmapped ? (
              <div>
                <div className="font-medium">
                  미분류 메뉴 {data.unmappedMenus.length}개
                </div>
                <div className="line-clamp-1 text-xs text-muted-foreground">
                  {data.unmappedMenus.slice(0, 5).join(', ')}
                  {data.unmappedMenus.length > 5
                    ? ` 외 ${data.unmappedMenus.length - 5}개`
                    : ''}
                </div>
              </div>
            ) : (
              <div className="font-medium">
                분류 모델이 업데이트됐습니다 — 재실행 권장
              </div>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => groupMutation.mutate(placeId)}
            disabled={groupMutation.isPending}
          >
            {groupMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 분류 중…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> 분류하기
              </>
            )}
          </Button>
        </div>
      )}

      {groupMutation.isError && (
        <p className="text-xs text-red-600 dark:text-red-400">
          분류 실패: {(groupMutation.error as Error).message}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          최소 {minMentions}회 이상 언급된 메뉴가 없습니다.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {visible.map((it, idx) => (
            <li key={it.canonicalKey} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{it.canonicalName}</span>
                  {!it.mapped && (
                    <Badge
                      variant="outline"
                      className="border-amber-300 text-[10px] text-amber-700 dark:text-amber-300"
                    >
                      미분류
                    </Badge>
                  )}
                </div>
                {it.variants.length > 1 && (
                  <div className="line-clamp-1 text-[11px] text-muted-foreground">
                    {it.variants.slice(0, 3).join(' · ')}
                    {it.variants.length > 3 ? ` +${it.variants.length - 3}` : ''}
                  </div>
                )}
                {it.topTraits.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {it.topTraits.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <SentimentBar
                positive={it.positive}
                negative={it.negative}
                neutral={it.neutral}
              />
              <div className="w-20 text-right text-xs tabular-nums">
                {it.mentionCount}회
              </div>
              <div className="w-16 text-right text-xs tabular-nums">
                {it.positiveRatio === null
                  ? '-'
                  : `${Math.round(it.positiveRatio * 100)}%`}
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.items.length > 10 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? '접기' : `전체 보기 (${data.items.length})`}
        </Button>
      )}
    </section>
  );
};

const SentimentBar = ({
  positive,
  negative,
  neutral,
}: {
  positive: number;
  negative: number;
  neutral: number;
}) => {
  const total = positive + negative + neutral;
  if (total === 0) return null;
  const pct = (n: number) => (n / total) * 100;
  return (
    <div
      className="flex h-2 w-32 overflow-hidden rounded-full bg-muted"
      title={`긍정 ${positive} · 중립 ${neutral} · 부정 ${negative}`}
    >
      <div
        className={cn('bg-emerald-500')}
        style={{ width: `${pct(positive)}%` }}
      />
      <div className={cn('bg-zinc-400')} style={{ width: `${pct(neutral)}%` }} />
      <div className={cn('bg-red-500')} style={{ width: `${pct(negative)}%` }} />
    </div>
  );
};
