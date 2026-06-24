import { Layers, MessageSquare, Star } from 'lucide-react';
import type {
  ClusterToneType,
  ReviewClusterAspectSummaryType,
  ReviewClusterItemType,
} from '@repo/api-contract';

interface Props {
  clusters: ReviewClusterItemType[];
  aspectSummary: ReviewClusterAspectSummaryType[];
  total: number;
  clustered: number;
}

// 토픽 군집이 안 잡히는(전부 노이즈) 식당의 폴백 — 관점별 긍/부/중립 집계.
const AspectSummary = ({
  aspects,
  total,
}: {
  aspects: ReviewClusterAspectSummaryType[];
  total: number;
}) => (
  <section className="space-y-3 border-t pt-4">
    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
      <MessageSquare className="size-4" />
      리뷰 관점별 평
      <span className="text-xs font-normal text-muted-foreground">
        (리뷰 {total.toLocaleString()}건 · 관점별 긍정/부정)
      </span>
    </h3>
    <ul className="space-y-2">
      {aspects.map((a) => {
        const sum = a.pos + a.neg + a.neu || 1;
        return (
          <li key={a.aspect}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">{a.aspect}</span>
              <span className="flex gap-2 text-[11px] tabular-nums text-muted-foreground">
                {a.pos > 0 && <span className="text-emerald-600 dark:text-emerald-400">👍 {a.pos}</span>}
                {a.neg > 0 && <span className="text-rose-600 dark:text-rose-400">👎 {a.neg}</span>}
                {a.neu > 0 && <span>· {a.neu}</span>}
              </span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="bg-emerald-500" style={{ width: `${(a.pos / sum) * 100}%` }} />
              <div className="bg-zinc-400" style={{ width: `${(a.neu / sum) * 100}%` }} />
              <div className="bg-rose-500" style={{ width: `${(a.neg / sum) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
    <p className="text-[11px] text-muted-foreground">
      이 식당은 뚜렷한 주제 묶음이 형성되지 않아 관점별 집계로 보여드려요.
    </p>
  </section>
);

// 군집 tone → 색/한글 라벨. positive/negative/mixed/neutral.
const TONE: Record<ClusterToneType, { dot: string; label: string; text: string }> = {
  positive: { dot: 'bg-emerald-500', label: '긍정', text: 'text-emerald-600 dark:text-emerald-400' },
  negative: { dot: 'bg-rose-500', label: '부정', text: 'text-rose-600 dark:text-rose-400' },
  mixed: { dot: 'bg-amber-500', label: '혼합', text: 'text-amber-600 dark:text-amber-400' },
  neutral: { dot: 'bg-zinc-400', label: '중립', text: 'text-muted-foreground' },
};

// 리뷰 주제 군집 — 비슷한 문맥 리뷰를 묶어 라벨·카운트·대표리뷰로 보여준다.
// 막대 너비 = 군집 크기 / 최대 군집(상대 비중 직관). 배치 계산 결과를 읽기만.
export const ClusterTopics = ({ clusters, aspectSummary, total, clustered }: Props) => {
  // 토픽 군집이 없으면 관점별 집계 폴백(그것도 없으면 미표시).
  if (clusters.length === 0) {
    return aspectSummary.length > 0 ? <AspectSummary aspects={aspectSummary} total={total} /> : null;
  }
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
