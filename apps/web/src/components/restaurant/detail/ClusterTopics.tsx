import { Layers, Star } from 'lucide-react';
import type { ReviewClusterItemType, ClusterToneType } from '@repo/api-contract';

interface Props {
  clusters: ReviewClusterItemType[];
  total: number;
  clustered: number;
}

// 군집 tone → 색/한글 라벨. positive/negative/mixed/neutral.
const TONE: Record<ClusterToneType, { dot: string; label: string; text: string }> = {
  positive: { dot: 'bg-emerald-500', label: '긍정', text: 'text-emerald-600 dark:text-emerald-400' },
  negative: { dot: 'bg-rose-500', label: '부정', text: 'text-rose-600 dark:text-rose-400' },
  mixed: { dot: 'bg-amber-500', label: '혼합', text: 'text-amber-600 dark:text-amber-400' },
  neutral: { dot: 'bg-zinc-400', label: '중립', text: 'text-muted-foreground' },
};

// 리뷰 주제 군집 — 비슷한 문맥 리뷰를 묶어 라벨·카운트·대표리뷰로 보여준다.
// 막대 너비 = 군집 크기 / 최대 군집(상대 비중 직관). 배치 계산 결과를 읽기만.
export const ClusterTopics = ({ clusters, total, clustered }: Props) => {
  if (clusters.length === 0) return null;
  const max = Math.max(...clusters.map((c) => c.size));

  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Layers className="size-4" />
        리뷰 주제
        <span className="text-xs font-normal text-muted-foreground">
          ({clusters.length}개 주제 · {clustered.toLocaleString()}/{total.toLocaleString()}건)
        </span>
      </h3>

      <ul className="space-y-2.5">
        {clusters.map((c) => {
          const tone = TONE[c.tone];
          return (
            <li key={c.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
                <span className={`shrink-0 text-xs font-medium ${tone.text}`}>{tone.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {c.size.toLocaleString()}건
                </span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={tone.dot} style={{ width: `${(c.size / max) * 100}%`, height: '100%' }} />
              </div>

              {c.keywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.keywords.slice(0, 6).map((k) => (
                    <span
                      key={k}
                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}

              {c.repReviews.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    대표 리뷰 {c.repReviews.length}건
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {c.repReviews.map((r) => (
                      <li key={r.reviewId} className="rounded-md border p-2.5 text-xs">
                        {r.rating != null && (
                          <div className="mb-1 flex items-center gap-0.5 text-amber-600">
                            <Star className="size-3 fill-current" /> {r.rating}
                          </div>
                        )}
                        <p className="text-foreground">{r.body}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
