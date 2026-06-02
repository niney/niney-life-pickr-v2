import { useState } from 'react';
import type {
  PublicDiningcodeScoreDetailType,
  PublicVisitorReviewType,
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { formatWonPrice } from '@repo/utils';
import {
  ExternalLink,
  Lightbulb,
  Navigation,
  Phone,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { cn } from '~/lib/utils';
import { Lightbox } from '~/components/Lightbox';

// 패널 탭들에서 공유하는 시각 요소. 데이터 fetch 는 root 에서, 여기는 순수
// 표시용.

export const QuickActions = ({ detail }: { detail: RestaurantPublicDetailType }) => {
  const naverLink = `https://map.naver.com/p/search/${encodeURIComponent(detail.name)}`;
  const dirLink =
    detail.latitude !== null && detail.longitude !== null
      ? `https://map.naver.com/p/directions/-/${detail.longitude},${detail.latitude},${encodeURIComponent(detail.name)}/-/transit?c=15`
      : naverLink;
  return (
    <div className="flex flex-wrap gap-2">
      <a href={dirLink} target="_blank" rel="noreferrer">
        <Button type="button" size="sm" className="gap-1">
          <Navigation className="size-3.5" />
          길찾기
        </Button>
      </a>
      <a href={detail.rawSourceUrl} target="_blank" rel="noreferrer">
        <Button type="button" size="sm" variant="outline" className="gap-1">
          <ExternalLink className="size-3.5" />
          네이버 지도
        </Button>
      </a>
      {detail.phone && (
        <a href={`tel:${detail.phone}`}>
          <Button type="button" size="sm" variant="outline" className="gap-1">
            <Phone className="size-3.5" />
            전화
          </Button>
        </a>
      )}
    </div>
  );
};

export const AiSummary = ({
  insights,
  onSelectTip,
}: {
  insights: RestaurantInsightsType;
  // 주어지면 방문 팁을 클릭 가능한 버튼으로 렌더해 리뷰 필터로 연결한다.
  // (홈 탭에서만 주입 — 인사이트 탭은 정적 목록 유지.)
  onSelectTip?: (term: string) => void;
}) => {
  const dist = insights.sentimentDistribution;
  const total = dist.positive + dist.negative + dist.neutral + dist.mixed;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="평균 만족도"
          value={
            insights.avgSatisfactionScore !== null
              ? `${insights.avgSatisfactionScore.toFixed(1)} / 5`
              : '—'
          }
        />
        <Stat
          label="평균 감정 점수"
          value={
            insights.avgSentimentScore !== null
              ? insights.avgSentimentScore.toFixed(2)
              : '—'
          }
          hint="-1(부정) ~ +1(긍정)"
        />
      </div>

      {total > 0 && (
        <div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-500" style={{ width: `${pct(dist.positive)}%` }} />
            <div className="bg-zinc-400" style={{ width: `${pct(dist.neutral)}%` }} />
            <div className="bg-amber-400" style={{ width: `${pct(dist.mixed)}%` }} />
            <div className="bg-rose-500" style={{ width: `${pct(dist.negative)}%` }} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400">긍정 {dist.positive}</span>
            <span>중립 {dist.neutral}</span>
            <span className="text-amber-600 dark:text-amber-400">혼합 {dist.mixed}</span>
            <span className="text-rose-600 dark:text-rose-400">부정 {dist.negative}</span>
            <span>· 총 {total}</span>
          </div>
        </div>
      )}

      {insights.topKeywords.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">자주 언급되는 키워드</div>
          <div className="flex flex-wrap gap-1.5">
            {insights.topKeywords.slice(0, 12).map((k) => (
              <Badge key={k.term} variant="secondary" className="text-[11px]">
                {k.term} ·{k.count}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {insights.topTips.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">방문 팁</div>
          {onSelectTip ? (
            <ul className="space-y-0.5 text-xs">
              {insights.topTips.slice(0, 8).map((t) => (
                <li key={t.term}>
                  <button
                    type="button"
                    onClick={() => onSelectTip(t.term)}
                    className="inline text-left underline-offset-2 hover:text-foreground hover:underline"
                    title={`"${t.term}" 팁이 달린 리뷰 보기`}
                  >
                    · {t.term}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {insights.topTips.slice(0, 8).map((t) => (
                <li key={t.term}>· {t.term}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const Stat = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-md border bg-muted/30 p-2.5">
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
    {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
  </div>
);

export const MenuGrid = ({
  menus,
  insights,
  // 주어지면 멘션 통계가 있는 메뉴를 클릭 가능하게 렌더해 리뷰 필터로 연결.
  // 멘션 없는(stats 없는) 메뉴는 클릭해도 결과가 비므로 정적 카드로 둔다.
  onSelectMenu,
}: {
  menus: RestaurantPublicDetailType['menus'];
  insights: RestaurantInsightsType | undefined;
  onSelectMenu?(name: string): void;
}) => {
  const mentionByName = new Map<string, { positive: number; negative: number; count: number }>();
  if (insights) {
    for (const m of insights.topMenus) mentionByName.set(m.name, m);
  }
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(
    null,
  );
  return (
    <div className="@container">
      <ul className="grid grid-cols-1 gap-2 @md:grid-cols-2">
        {menus.map((m, idx) => {
          const stats = mentionByName.get(m.name);
          const clickable = !!onSelectMenu && !!stats;
          const text = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{m.name}</span>
                {m.recommend && (
                  <Badge variant="secondary" className="text-[10px]">
                    추천
                  </Badge>
                )}
              </div>
              {m.price && (
                <div className="text-xs tabular-nums text-muted-foreground">
                  {formatWonPrice(m.price)}
                </div>
              )}
              {m.description && (
                <div className="line-clamp-2 text-xs text-muted-foreground">
                  {m.description}
                </div>
              )}
              {stats && (
                <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +{stats.positive}
                  </span>
                  <span className="mx-1">/</span>
                  <span className="text-rose-600 dark:text-rose-400">-{stats.negative}</span>
                  <span className="ml-1">· {stats.count}회 언급</span>
                </div>
              )}
            </>
          );
          // 카드 전체가 아니라 영역을 둘로 나눈다: 썸네일=사진 확대(라이트박스),
          // 텍스트 영역=리뷰 필터. 한 카드에서 두 동작이 겹치지 않게.
          return (
            <li
              key={`${m.name}-${idx}`}
              className="flex gap-2 rounded-md border p-2"
            >
              {m.imageUrls[0] && (
                <button
                  type="button"
                  onClick={() => setLightbox({ images: m.imageUrls, index: 0 })}
                  className="relative size-14 shrink-0 overflow-hidden rounded"
                  aria-label={`"${m.name}" 메뉴 사진 크게 보기`}
                >
                  <ImgWithFallback
                    src={m.imageUrls[0]}
                    className="size-14 rounded object-cover transition-opacity hover:opacity-90"
                  />
                  {m.imageUrls.length > 1 && (
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[9px] font-medium tabular-nums text-white">
                      {m.imageUrls.length}
                    </span>
                  )}
                </button>
              )}
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSelectMenu!(m.name)}
                  className="min-w-0 flex-1 rounded text-left transition-colors hover:bg-primary/5"
                  aria-label={`"${m.name}" 메뉴가 언급된 리뷰 보기`}
                >
                  {text}
                </button>
              ) : (
                <div className="min-w-0 flex-1">{text}</div>
              )}
            </li>
          );
        })}
      </ul>
      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onChangeIndex={(i) => setLightbox((p) => (p ? { ...p, index: i } : p))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
};

type ReviewSentimentKey = 'positive' | 'neutral' | 'negative' | 'mixed';

const SENTIMENT_LABEL: Record<ReviewSentimentKey, string> = {
  positive: '긍정',
  neutral: '중립',
  negative: '부정',
  mixed: '혼합',
};

// 만족도 칩 — sentiment 색 도트(원형 마커) + 환산 점수. 카드 좌측 컬러바를
// 대체하는 시그널 — 도트만으로 sentiment 즉시 식별, 점수로 정도 확인.
// aria-label 에 텍스트 라벨까지 실어 스크린리더 친화.
const SatisfactionChip = ({
  sentiment,
  score,
}: {
  sentiment: ReviewSentimentKey;
  score: number;
}) => (
  <span
    aria-label={`${SENTIMENT_LABEL[sentiment]} ${score}점`}
    className={cn(
      'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none',
      sentiment === 'positive' &&
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
      sentiment === 'negative' &&
        'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
      sentiment === 'mixed' &&
        'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
      sentiment === 'neutral' && 'bg-muted text-muted-foreground',
    )}
  >
    <span
      aria-hidden
      className={cn(
        'size-2 rounded-full',
        sentiment === 'positive' && 'bg-emerald-500',
        sentiment === 'negative' && 'bg-rose-500',
        sentiment === 'mixed' && 'bg-amber-500',
        sentiment === 'neutral' && 'bg-muted-foreground/50',
      )}
    />
    <span className="tabular-nums">{score}</span>
  </span>
);

// 다이닝코드 scoreDetail 의 5점 만점 카테고리별 분포 바.
// 홈 탭의 별점 영역과 정보 탭 모두에서 사용 — 컴팩트 표시.
// 모든 값이 null/0 이면 컴포넌트 자체가 null 반환.
export const ScoreDistributionBars = ({
  detail,
  showHeader = true,
}: {
  detail: PublicDiningcodeScoreDetailType;
  showHeader?: boolean;
}) => {
  const items: Array<{ label: string; value: number | null }> = [
    { label: '맛', value: detail.taste },
    { label: '서비스', value: detail.service },
    { label: '가격', value: detail.price },
    { label: '청결', value: detail.clean },
  ];
  const visible = items.filter((it) => it.value !== null && it.value > 0);
  if (visible.length === 0) return null;
  return (
    <div className="space-y-2">
      {showHeader && (
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-foreground">다이닝코드 점수 분포</span>
          {detail.reviewTotal > 0 && (
            <span className="text-muted-foreground tabular-nums">
              리뷰 {detail.reviewTotal.toLocaleString()}
            </span>
          )}
        </div>
      )}
      <ul className="space-y-1">
        {visible.map((it) => (
          <li key={it.label} className="flex items-center gap-2 text-xs">
            <span className="w-12 text-muted-foreground">{it.label}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="absolute inset-y-0 left-0 bg-primary/70"
                style={{
                  width: `${Math.min(100, ((it.value ?? 0) / 5) * 100)}%`,
                }}
              />
            </div>
            <span className="w-8 text-right font-medium tabular-nums">
              {(it.value ?? 0).toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// 출처 배지 — 두 출처가 섞인 리스트에서 한 줄로 출처 식별. 카드 또는 행의
// 헤더에 작게 배치. 단일 출처만 있을 때 호출자가 표시 여부를 결정.
export const SourceBadge = ({ source }: { source: 'naver' | 'diningcode' }) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center rounded-full px-1.5 py-0 text-[10px] font-medium leading-4',
      source === 'naver'
        ? 'bg-[var(--tonal-green-bg)] text-[var(--tonal-green-fg)]'
        : 'bg-[var(--tonal-violet-bg)] text-[var(--tonal-violet-fg)]',
    )}
  >
    {source === 'naver' ? '네이버' : '다이닝코드'}
  </span>
);

export const ReviewCard = ({
  r,
  showSource = false,
}: {
  r: PublicVisitorReviewType;
  // 머지 응답이 두 출처를 모두 가질 때만 true — 한 출처만 있는 경우엔 배지가
  // 시각적 노이즈가 되므로 호출자가 숨긴다.
  showSource?: boolean;
}) => {
  // 이미지 lightbox 인덱스. null 이면 닫힘. 카드별 독립 상태라 다른 리뷰
  // 카드의 lightbox 와 간섭하지 않는다.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const authorLabel = r.authorName ?? '익명';
  return (
    // 카드는 균일한 중립 border. sentiment 시각화는 헤더의 SatisfactionChip
    // (컬러 도트 + 점수) 한 곳으로 집중 — 묶음 스캔도 칩 색 분포로 가능.
    <div className="rounded-md border p-2.5">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {showSource && <SourceBadge source={r.source} />}
          <span>{authorLabel}</span>
          {/* 만족도 칩 — 이모지 + LLM 환산 별점(1~5). sentiment 색을 칩 배경에도
              실어 카드 좌측 컬러바와 짝이 맞게. 모바일 0.1초 스캔용. */}
          {r.analysis && (
            <SatisfactionChip
              sentiment={r.analysis.sentiment}
              score={r.analysis.satisfactionScore}
            />
          )}
        </div>
        <span>{r.visitedAt ?? r.fetchedAt.slice(0, 10)}</span>
      </div>
      {r.analysis && <div className="mt-1 text-sm font-medium">{r.analysis.text}</div>}
      <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{r.body}</div>
      {r.imageUrls.length > 0 && (
        // 카드 패딩(p-2.5) 만큼 음수 마진 — 첫·마지막 이미지가 카드 가장자리에
        // 붙어 "더 콘텐츠가 있다" 신호. snap-x + snap-start 로 한 장씩 깔끔히
        // 정렬. iOS pull-to-refresh 와 가로 스크롤 충돌 방지: overscroll-x-contain.
        <div
          className={cn(
            '-mx-2.5 mt-2 flex gap-1.5 overflow-x-auto overscroll-x-contain px-2.5',
            'snap-x snap-mandatory',
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          {r.imageUrls.map((u, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={`${authorLabel} 리뷰 ${i + 1}번 사진 크게 보기`}
              className="shrink-0 snap-start overflow-hidden rounded bg-muted"
            >
              <ImgWithFallback
                src={u}
                className="h-56 w-auto object-cover transition-transform active:scale-95 sm:h-64"
              />
            </button>
          ))}
        </div>
      )}
      {/* 언급 메뉴 — 각 메뉴별 sentiment 색 좌측 stripe + 메뉴명 + traits.
          여러 메뉴가 있어도 한 메뉴당 한 줄이라 시각적으로 가장 무거운 시그널
          (행 자체) 으로 도드라진다. neutral 은 muted, positive/negative 는
          색 stripe. */}
      {r.analysis && r.analysis.menus.length > 0 && (
        <ul className="mt-2 space-y-1">
          {r.analysis.menus.map((m, i) => (
            <li
              key={`${m.name}-${i}`}
              className={cn(
                'border-l-2 pl-2 text-xs',
                m.sentiment === 'positive'
                  ? 'border-emerald-500'
                  : m.sentiment === 'negative'
                    ? 'border-rose-500'
                    : 'border-muted-foreground/30',
              )}
            >
              <span className="font-semibold text-foreground">{m.name}</span>
              {m.traits.length > 0 && (
                <span className="ml-1.5 text-muted-foreground">
                  {m.traits.join(' · ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* 팁 — 짧은 노하우/조언. 조용한 quote 톤(muted 박스 + 💡). 메뉴와
          시각 무게가 겹치지 않도록 의도적으로 차분하게. */}
      {r.analysis && r.analysis.tips.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-md bg-muted/40 p-2">
          {r.analysis.tips.map((t, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 text-xs text-muted-foreground"
            >
              <Lightbulb className="mt-0.5 size-3 shrink-0 text-amber-500" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
      {r.analysis && r.analysis.keywords.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {r.analysis.keywords.slice(0, 8).map((k) => (
            <span
              key={k}
              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {k}
            </span>
          ))}
        </div>
      )}
      {lightboxIndex !== null && r.imageUrls.length > 0 && (
        <Lightbox
          images={r.imageUrls}
          index={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
};
