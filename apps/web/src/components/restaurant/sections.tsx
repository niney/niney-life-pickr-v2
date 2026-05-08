import type { ReactNode } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type {
  RestaurantSummaryProgressType,
  VisitorReviewWithSummaryType,
} from '@repo/api-contract';
import { reviewThumbnailUrl } from '@repo/utils';
import { Badge } from '~/components/ui/badge';

// Small icon + label + optional trailing meta. Used as a header inside flat
// section layouts (CardContent + divide-y), replacing nested Card/CardHeader.
export const SectionHeader = ({
  icon,
  label,
  meta,
}: {
  icon?: ReactNode;
  label: string;
  meta?: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-2 text-sm font-medium">
    <span className="flex items-center gap-2">
      {icon}
      {label}
    </span>
    {meta && <span className="text-xs font-normal text-muted-foreground">{meta}</span>}
  </div>
);

export const SummaryProgressSection = ({
  status,
}: {
  status: RestaurantSummaryProgressType;
}) => {
  const inFlight = status.pending + status.running;
  const total = inFlight + status.done + status.failed;
  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<Sparkles className="size-4 text-primary" />}
        label="AI 요약"
        meta={
          <>
            저장된 리뷰 {status.totalReviews}개 · {status.done}/{total} 완료
          </>
        }
      />
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">대기 {status.pending}</Badge>
        <Badge variant="secondary">진행 {status.running}</Badge>
        <Badge variant="secondary">완료 {status.done}</Badge>
        {status.failed > 0 && <Badge variant="destructive">실패 {status.failed}</Badge>}
      </div>
      {status.recentDone.length > 0 && (
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {status.recentDone.map((s) => (
            <li key={s.reviewId} className="line-clamp-2 leading-relaxed">
              · {s.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// True when the AI summary just parrots the body. Common for very short
// reviews where there's nothing meaningful to compress. We render those at
// reduced visual weight so the eye doesn't bounce between two near-identical
// lines.
const summaryEchoesBody = (body: string, summary: string | null): boolean => {
  if (!summary) return false;
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const a = norm(body);
  const b = norm(summary);
  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;
  // Either side fully contained in the other (and the difference is small).
  return (a.includes(b) || b.includes(a)) && Math.abs(a.length - b.length) < 10;
};

export const ReviewSummaryItem = ({ r }: { r: VisitorReviewWithSummaryType }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = r.body.length > 140;
  return (
    <li className="space-y-2 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {r.authorName && <span className="font-medium text-foreground/80">{r.authorName}</span>}
        {r.rating !== null && <Badge variant="secondary">★ {r.rating}</Badge>}
        {r.visitedAt && <span>· {r.visitedAt}</span>}
      </div>
      <p className={`text-sm leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>{r.body}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? '접기' : '더 보기'}
        </button>
      )}
      {r.imageUrls.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {r.imageUrls.map((u) => (
            <li key={u}>
              <a
                href={u}
                target="_blank"
                rel="noreferrer"
                className="block"
                aria-label="원본 이미지 열기"
              >
                <img
                  src={reviewThumbnailUrl(u, 200)}
                  alt=""
                  loading="lazy"
                  className="size-16 rounded object-cover transition-opacity hover:opacity-80"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
      <ReviewSummaryBlock r={r} />
    </li>
  );
};

const ReviewSummaryBlock = ({ r }: { r: VisitorReviewWithSummaryType }) => {
  const echoes =
    r.summary?.status === 'done' && summaryEchoesBody(r.body, r.summary.text);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${
          r.summary?.status === 'failed'
            ? 'bg-destructive/10 text-destructive'
            : echoes
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary/10 text-primary'
        }`}
      >
        AI 요약
      </span>
      <div className={`flex-1 ${echoes ? 'text-muted-foreground' : ''}`}>
        {!r.summary && <span className="text-muted-foreground">없음</span>}
        {r.summary?.status === 'pending' && (
          <span className="text-muted-foreground">대기 중…</span>
        )}
        {r.summary?.status === 'running' && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> 진행 중…
          </span>
        )}
        {r.summary?.status === 'done' && <span>{r.summary.text}</span>}
        {r.summary?.status === 'failed' && (
          <span className="text-destructive">
            실패: {r.summary.errorMessage ?? r.summary.errorCode ?? 'unknown'}
          </span>
        )}
      </div>
    </div>
  );
};

// Compact reviews list used in the inline ActiveJobPanel — caps at 50 rows
// since the panel is meant for a quick "did the crawl land?" peek. The
// dedicated detail page uses its own list with filter/sort/paginate.
export const ReviewSummarySection = ({
  reviews,
}: {
  reviews: VisitorReviewWithSummaryType[];
}) => {
  if (reviews.length === 0) return null;
  return (
    <section className="space-y-2">
      <SectionHeader label={`리뷰 (${reviews.length})`} />
      <ul className="divide-y">
        {reviews.slice(0, 50).map((r) => (
          <ReviewSummaryItem key={r.id} r={r} />
        ))}
      </ul>
    </section>
  );
};
