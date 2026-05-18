import type { ReactNode } from 'react';
import { Loader2, Play, PlayCircle, Sparkles, StopCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  RestaurantSummaryProgressType,
  VisitorReviewWithSummaryType,
} from '@repo/api-contract';
import { reviewThumbnailUrl } from '@repo/utils';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

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
  onCancel,
  cancelPending = false,
  onResume,
  resumePending = false,
}: {
  status: RestaurantSummaryProgressType;
  // 지정 시 진행 중일 때만 "중지" 버튼이 노출된다. inFlight=0 이면 숨김.
  onCancel?: () => void;
  // mutation pending 상태 — 버튼 비활성화 + 스피너.
  cancelPending?: boolean;
  // 지정 시 cancelled>0 일 때 "재개" 버튼이 노출된다. 중지된 행만 다시 큐잉.
  onResume?: () => void;
  resumePending?: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const inFlight = status.queued + status.pending + status.running;
  const accountedFor = inFlight + status.done + status.failed + status.cancelled;
  const total = accountedFor;
  // totalReviews 와 accountedFor 가 다르면 ReviewSummary 행이 없는 리뷰 존재.
  // 구버전 데이터(여기 변경 전 적재 누락분)에서만 일어나야 정상.
  const orphan = Math.max(0, status.totalReviews - accountedFor);
  const recent = status.recentDone;
  const hasMore = recent.length > 1;
  const visibleRecent = expanded ? recent : recent.slice(0, 1);
  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<Sparkles className="size-4 text-primary" />}
        label="AI 요약"
        meta={
          <span className="flex items-center gap-2">
            <span>
              저장된 리뷰 {status.totalReviews}개 · {status.done}/{total} 완료
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-primary hover:underline"
              >
                {expanded ? '접기' : `전체 보기 (${recent.length})`}
              </button>
            )}
          </span>
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {status.queued > 0 && (
          <Badge variant="outline">큐 {status.queued}</Badge>
        )}
        <Badge variant="secondary">대기 {status.pending}</Badge>
        <Badge variant="secondary">진행 {status.running}</Badge>
        <Badge variant="secondary">완료 {status.done}</Badge>
        {status.failed > 0 && <Badge variant="destructive">실패 {status.failed}</Badge>}
        {status.cancelled > 0 && (
          <Badge variant="outline" className="text-muted-foreground">
            중지 {status.cancelled}
          </Badge>
        )}
        {orphan > 0 && (
          // ReviewSummary 행이 없는 리뷰 — 구버전 chain 휘발 잔여물. backfill
          // 또는 재크롤 필요. queued 상태 도입 이후엔 신규로는 발생하지 않음.
          <Badge
            variant="outline"
            className="border-amber-500 text-amber-700 dark:text-amber-300"
            title="ReviewSummary 행이 없는 리뷰 — 구버전 chain 휘발 잔여. backfill 또는 재크롤 필요."
          >
            누락 {orphan}
          </Badge>
        )}
        {onCancel && inFlight > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-7 gap-1 px-2 text-xs"
            onClick={onCancel}
            disabled={cancelPending}
            title="이 가게의 진행 중인 요약 작업을 중지합니다. 현재 청크는 끝까지 처리됩니다."
          >
            {cancelPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <StopCircle className="size-3" />
            )}
            요약 중지
          </Button>
        )}
        {/* 진행 중이 아니고 직전에 중지한 행이 남아 있을 때만 노출. 진행 중일
            땐 "중지" 버튼이 자리잡으므로 두 버튼이 동시에 보이지 않는다. */}
        {onResume && inFlight === 0 && status.cancelled > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-7 gap-1 px-2 text-xs"
            onClick={onResume}
            disabled={resumePending}
            title="직전에 중지된 행만 다시 큐잉합니다. 실패한 행은 별도 '재분석' 으로 처리하세요."
          >
            {resumePending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <PlayCircle className="size-3" />
            )}
            요약 재개
          </Button>
        )}
      </div>
      {visibleRecent.length > 0 && (
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {visibleRecent.map((s) => (
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
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const isLong = r.body.length > 140;
  const hasMedia = r.imageUrls.length > 0 || r.videos.length > 0;
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
      {hasMedia && (
        <ul className="flex flex-wrap gap-1.5">
          {r.videos.map((v) => (
            <li key={v.videoUrl}>
              <button
                type="button"
                onClick={() => setPlayingVideoUrl(v.videoUrl)}
                className="group relative block size-16 overflow-hidden rounded"
                aria-label="동영상 재생"
              >
                <img
                  src={reviewThumbnailUrl(v.posterUrl, 200)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-opacity group-hover:opacity-80"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="size-5 fill-white text-white drop-shadow" />
                </span>
              </button>
            </li>
          ))}
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
      {playingVideoUrl && (
        <VideoPlayerModal url={playingVideoUrl} onClose={() => setPlayingVideoUrl(null)} />
      )}
      <ReviewSummaryBlock r={r} />
    </li>
  );
};

// Lightweight modal — no portal, no focus trap. The video element is the
// only interactive child; ESC closes. Backdrop click also closes.
const VideoPlayerModal = ({ url, onClose }: { url: string; onClose: () => void }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute -top-10 right-0 text-white/80 hover:text-white"
        >
          <X className="size-6" />
        </button>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={url}
          controls
          autoPlay
          className="max-h-[80vh] w-full rounded bg-black"
        />
      </div>
    </div>
  );
};

// 감정 → 색상. 같은 팔레트를 인사이트 페이지에서도 쓸 수 있도록 단순한
// tailwind 클래스로 통일.
const sentimentClass = (s: string | null | undefined): string => {
  if (s === 'positive') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  if (s === 'negative') return 'bg-rose-500/10 text-rose-600 dark:text-rose-400';
  if (s === 'mixed') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  return 'bg-muted text-muted-foreground';
};

const sentimentLabel: Record<string, string> = {
  positive: '긍정',
  negative: '부정',
  neutral: '중립',
  mixed: '혼합',
};

const ReviewSummaryBlock = ({ r }: { r: VisitorReviewWithSummaryType }) => {
  const echoes =
    r.summary?.status === 'done' && summaryEchoesBody(r.body, r.summary.text);
  const s = r.summary;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${
            s?.status === 'failed'
              ? 'bg-destructive/10 text-destructive'
              : echoes
                ? 'bg-muted text-muted-foreground'
                : 'bg-primary/10 text-primary'
          }`}
        >
          AI 요약
        </span>
        <div className={`flex-1 ${echoes ? 'text-muted-foreground' : ''}`}>
          {!s && <span className="text-muted-foreground">없음</span>}
          {s?.status === 'pending' && (
            <span className="text-muted-foreground">대기 중…</span>
          )}
          {s?.status === 'running' && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> 진행 중…
            </span>
          )}
          {s?.status === 'done' && <span>{s.text}</span>}
          {s?.status === 'failed' && (
            <span className="text-destructive">
              실패: {s.errorMessage ?? s.errorCode ?? 'unknown'}
            </span>
          )}
        </div>
      </div>
      {s?.status === 'done' && (s.sentiment || s.satisfactionScore !== null) && (
        <div className="flex flex-wrap items-center gap-1.5 pl-[3.5rem] text-xs">
          {s.sentiment && (
            <span className={`rounded px-1.5 py-0.5 ${sentimentClass(s.sentiment)}`}>
              {sentimentLabel[s.sentiment] ?? s.sentiment}
            </span>
          )}
          {s.satisfactionScore !== null && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
              만족도 {s.satisfactionScore}/5
            </span>
          )}
        </div>
      )}
      {s?.status === 'done' && s.menus && s.menus.length > 0 && (
        <ul className="flex flex-wrap gap-1 pl-[3.5rem] text-[11px]">
          {s.menus.map((m, i) => (
            <li
              key={`${m.name}-${i}`}
              className={`rounded px-1.5 py-0.5 ${sentimentClass(m.sentiment ?? null)}`}
            >
              {m.name}
            </li>
          ))}
        </ul>
      )}
      {s?.status === 'done' && s.tips && s.tips.length > 0 && (
        <ul className="space-y-0.5 pl-[3.5rem] text-[11px] text-muted-foreground">
          {s.tips.map((t, i) => (
            <li key={`${t}-${i}`}>💡 {t}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Compact reviews list used in the inline ActiveJobPanel — caps at 50 rows
// since the panel is meant for a quick "did the crawl land?" peek. The
// dedicated detail page uses its own list with filter/sort/paginate.
// Default-collapsed to 1 row so streaming reviews don't blow up the panel
// height; toggle in the header expands to the full 50-row preview.
export const ReviewSummarySection = ({
  reviews,
}: {
  reviews: VisitorReviewWithSummaryType[];
}) => {
  const [expanded, setExpanded] = useState(false);
  if (reviews.length === 0) return null;
  const cap = 50;
  const previewCount = 1;
  const capped = reviews.slice(0, cap);
  const visible = expanded ? capped : capped.slice(0, previewCount);
  const hasMore = reviews.length > previewCount;
  return (
    <section className="space-y-2">
      <SectionHeader
        label={`리뷰 (${reviews.length})`}
        meta={
          hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-primary hover:underline"
            >
              {expanded
                ? '접기'
                : `전체 보기 (${Math.min(reviews.length, cap)})`}
            </button>
          )
        }
      />
      <ul className="divide-y">
        {visible.map((r) => (
          <ReviewSummaryItem key={r.id} r={r} />
        ))}
      </ul>
    </section>
  );
};
