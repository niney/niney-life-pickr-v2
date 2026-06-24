import { ChefHat, FolderTree, Loader2, MessageSquare } from 'lucide-react';
import { useRestaurantPublicCategoryTree, useRestaurantClusters } from '@repo/shared';
import type {
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { AiSummary } from './shared';
import { CategoryTree } from './CategoryTree';
import { ClusterTopics } from './ClusterTopics';

interface Props {
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
  insightsLoading: boolean;
  onSelectTip(term: string): void;
  onSelectMenu(name: string): void;
}

// 분석/통계 탭 — 홈 탭의 AI 분석 카드의 풀 버전 + 메뉴 순위 (멘션 많은 순,
// 긍/부 분포 막대). 향후 카테고리 비교·트렌드·키워드 시각화 등이 추가될
// 자리. 데이터는 root 의 useRestaurantPublicInsights 한 번 fetch — 탭
// 전환만으론 추가 호출 없음.
export const InsightsTab = ({
  detail,
  insights,
  insightsLoading,
  onSelectTip,
  onSelectMenu,
}: Props) => {
  // 카테고리 트리는 insights 와 별도 endpoint — 훅 규칙상 early return 위에서 호출.
  // 전역 머지가 닿은 식당만 roots 가 채워지므로 비면 섹션을 숨긴다.
  const categoryTree = useRestaurantPublicCategoryTree(detail.placeId);
  // 리뷰 주제 군집(배치 결과 읽기 전용) — 아직 없으면(ready=false) 섹션 숨김.
  const clusters = useRestaurantClusters(detail.placeId);

  if (insightsLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 분석 정보 불러오는 중…
      </div>
    );
  }
  if (!insights || insights.analyzedCount === 0) {
    return (
      <div className="rounded-md border border-dashed mx-4 my-6 px-4 py-8 text-center text-sm text-muted-foreground">
        아직 분석된 리뷰가 없습니다.
        <br />
        리뷰가 충분히 모이면 자동으로 표시됩니다.
      </div>
    );
  }

  // 멘션순 정렬, 동률은 이름 asc 로 안정화. backend 의 getInsights 가 이미
  // 같은 순서로 내려주지만 수정 가능성 대비해 클라에서도 한 번 더.
  const ranked = [...insights.topMenus]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 20);

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="size-4" />
          AI 분석 종합
          <span className="text-xs font-normal text-muted-foreground">
            ({insights.analyzedCount}개 리뷰 분석)
          </span>
        </h3>
        <AiSummary insights={insights} onSelectTip={onSelectTip} />
      </section>

      {clusters.data?.ready && (
        <ClusterTopics
          clusters={clusters.data.clusters}
          total={clusters.data.total}
          clustered={clusters.data.clustered}
        />
      )}

      {categoryTree.data && categoryTree.data.roots.length > 0 && (
        <section className="space-y-3 border-t pt-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <FolderTree className="size-4" />
            메뉴 카테고리
            <span className="text-xs font-normal text-muted-foreground">
              (언급 횟수 · 긍정/부정)
            </span>
          </h3>
          <CategoryTree roots={categoryTree.data.roots} />
        </section>
      )}

      {ranked.length > 0 && (
        <section className="space-y-3 border-t pt-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <ChefHat className="size-4" />
            인기 메뉴 순위
            <span className="text-xs font-normal text-muted-foreground">
              (멘션 많은 순)
            </span>
          </h3>
          <ol className="divide-y divide-border">
            {ranked.map((m, i) => {
              const total = m.positive + m.negative + m.neutral;
              const posPct = total > 0 ? (m.positive / total) * 100 : 0;
              const negPct = total > 0 ? (m.negative / total) * 100 : 0;
              const neuPct = Math.max(0, 100 - posPct - negPct);
              return (
                <li key={m.name}>
                  <button
                    type="button"
                    onClick={() => onSelectMenu(m.name)}
                    className="flex w-full items-start gap-3 py-3 text-left transition-colors hover:bg-muted"
                    title={`"${m.name}" 메뉴가 언급된 리뷰 보기`}
                  >
                  <div className="w-6 shrink-0 pt-0.5 text-center text-base font-bold tabular-nums text-muted-foreground">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    {total > 0 && (
                      <>
                        <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="bg-emerald-500"
                            style={{ width: `${posPct}%` }}
                          />
                          <div
                            className="bg-zinc-400"
                            style={{ width: `${neuPct}%` }}
                          />
                          <div
                            className="bg-rose-500"
                            style={{ width: `${negPct}%` }}
                          />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] tabular-nums text-muted-foreground">
                          <span>{m.count}회 언급</span>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{m.positive}
                          </span>
                          <span className="text-rose-600 dark:text-rose-400">
                            -{m.negative}
                          </span>
                          {m.neutral > 0 && <span>· 중립 {m.neutral}</span>}
                        </div>
                      </>
                    )}
                  </div>
                  </button>
                </li>
              );
            })}
          </ol>
          {detail.menus.length > 0 && (
            <p className="pt-1 text-xs text-muted-foreground">
              메뉴 가격·사진은 메뉴 탭에서 볼 수 있습니다.
            </p>
          )}
        </section>
      )}
    </div>
  );
};
