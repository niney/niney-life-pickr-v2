import { useState } from 'react';
import { Loader2, Play, Sparkles } from 'lucide-react';
import type { AdminVisitorReviewType } from '@repo/api-contract';
import { reviewThumbnailUrl } from '@repo/utils';
import { Lightbox } from '~/components/Lightbox';
import { VideoPlayerModal } from '~/components/restaurant/sections';
import {
  ReviewAnalysisDetails,
  SatisfactionChip,
  SourceBadge,
} from '~/components/restaurant/detail/shared';
import { cn } from '~/lib/utils';

// 어드민 상세 리뷰 한 줄. 분석 표현(만족도 칩·요약·메뉴/팁/키워드)은 공개 ReviewCard 와 같은
// 부품을 쓰고, 운영에 필요한 것만 더한다: 별점, 요약 상태·실패 사유·모델, 동영상, 긴 본문 접기,
// 작은 썸네일(수백 건을 훑는 목록이라 공개 카드의 큰 사진 띠 대신).

const KNOWN_SOURCES = ['naver', 'diningcode', 'tabling'] as const;
type KnownSource = (typeof KNOWN_SOURCES)[number];
const isKnownSource = (s: string): s is KnownSource =>
  (KNOWN_SOURCES as readonly string[]).includes(s);

const BODY_CLAMP_CHARS = 140;

type Summary = AdminVisitorReviewType['summary'];

// done 이 아닌 요약의 상태 한 줄 — 실패는 사유까지.
const SummaryStatusLine = ({ summary }: { summary: Summary }) => {
  if (!summary) {
    return <span className="text-xs italic text-muted-foreground">AI 요약 없음</span>;
  }
  switch (summary.status) {
    case 'failed':
      return (
        <span className="text-xs text-destructive">
          요약 실패: {summary.errorMessage ?? summary.errorCode ?? '알 수 없는 오류'}
        </span>
      );
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> 요약 진행 중…
        </span>
      );
    case 'cancelled':
      return <span className="text-xs text-muted-foreground">요약 중지됨</span>;
    default:
      // queued / pending
      return <span className="text-xs text-muted-foreground">요약 대기 중…</span>;
  }
};

export const AdminReviewItem = ({
  r,
  showSource,
  isResummarizing,
  onResummarize,
}: {
  r: AdminVisitorReviewType;
  // 출처가 둘 이상 섞인 목록일 때만 출처 배지.
  showSource: boolean;
  isResummarizing: boolean;
  onResummarize(): void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const s = r.summary;
  const analysis = s && s.status === 'done' ? s : null;
  const isLong = r.body.length > BODY_CLAMP_CHARS;
  const authorLabel = r.authorName ?? '익명';

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {showSource &&
            (isKnownSource(r.source) ? (
              <SourceBadge source={r.source} />
            ) : (
              <span className="rounded-full bg-muted px-1.5 text-[10px] leading-4">{r.source}</span>
            ))}
          {r.source === 'tabling' && (
            <span
              title="테이블링 예약/웨이팅 방문자만 작성할 수 있는 리뷰"
              className="inline-flex shrink-0 items-center rounded-full border border-[var(--tonal-blue-fg)]/30 px-1.5 py-0 text-[10px] font-medium leading-4 text-[var(--tonal-blue-fg)]"
            >
              방문 인증
            </span>
          )}
          <span className="font-medium text-foreground/80">{authorLabel}</span>
          {r.rating !== null && <span className="tabular-nums">★ {r.rating}</span>}
          {analysis?.sentiment && analysis.satisfactionScore !== null && (
            <SatisfactionChip sentiment={analysis.sentiment} score={analysis.satisfactionScore} />
          )}
        </div>
        <span
          className="shrink-0 tabular-nums"
          title={`수집 ${new Date(r.fetchedAt).toLocaleString('ko-KR')}`}
        >
          {r.visitedAt ?? r.fetchedAt.slice(0, 10)}
        </span>
      </div>

      {/* AI 요약 자리 — done 이면 요약문, 아니면 상태. 같은 줄 오른쪽에 다른 모델로
          이 리뷰만 1회성 재요약. */}
      <div className="mt-1 flex items-start justify-between gap-2">
        {analysis ? (
          <div className="text-sm font-medium">{analysis.text ?? '(요약 텍스트 없음)'}</div>
        ) : (
          <SummaryStatusLine summary={s} />
        )}
        <button
          type="button"
          onClick={onResummarize}
          disabled={isResummarizing}
          title="다른 모델로 이 리뷰만 다시 요약"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {isResummarizing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Sparkles className="size-3" />
          )}
          {isResummarizing ? '재요약 중' : '재요약'}
        </button>
      </div>

      <p
        className={cn(
          'mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground',
          isLong && !expanded && 'line-clamp-3',
        )}
      >
        {r.body}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {expanded ? '접기' : '더 보기'}
        </button>
      )}

      {(r.videos.length > 0 || r.imageUrls.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {r.videos.map((v) => (
            <li key={v.videoUrl}>
              <button
                type="button"
                onClick={() => setPlayingVideoUrl(v.videoUrl)}
                className="group relative block size-16 overflow-hidden rounded bg-muted"
                aria-label={`${authorLabel} 리뷰 동영상 재생`}
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
          {r.imageUrls.map((u, i) => (
            <li key={`${u}-${i}`}>
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="block size-16 overflow-hidden rounded bg-muted"
                aria-label={`${authorLabel} 리뷰 ${i + 1}번 사진 크게 보기`}
              >
                <img
                  src={reviewThumbnailUrl(u, 200)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-opacity hover:opacity-80"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {analysis && (
        <ReviewAnalysisDetails
          menus={analysis.menus ?? []}
          tips={analysis.tips ?? []}
          keywords={analysis.keywords ?? []}
        />
      )}

      {s?.model && (
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          모델 {s.model}
          {s.finishedAt && ` · ${new Date(s.finishedAt).toLocaleString('ko-KR')}`}
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          images={r.imageUrls}
          index={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
      {playingVideoUrl && (
        <VideoPlayerModal url={playingVideoUrl} onClose={() => setPlayingVideoUrl(null)} />
      )}
    </div>
  );
};
