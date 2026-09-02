import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import type { TarotReadingSummaryType } from '@repo/api-contract';
import { useDeleteTarotReading, useMyTarotReadingsInfinite } from '@repo/shared';
import { getTarotSpread, TAROT_TOPIC_LABEL } from '@repo/utils';
import { TarotCardImage } from '~/components/tarot/TarotCardImage';
import { Button } from '~/components/ui/button';

// 내 타로 기록 — 회원 자동 저장분 목록(최신순, 커서 더 보기). 항목 클릭 → 상세(/me/tarot/:id).
// 삭제는 두 번 클릭(확인) — 모달 없이 행 안에서.

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

export const MyTarotPage = () => {
  const query = useMyTarotReadingsInfinite(20);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">내 타로 기록</h1>
          <p className="text-sm text-muted-foreground">로그인 상태로 본 리딩은 자동으로 저장돼요.</p>
        </div>
        <Button asChild size="sm" className="ml-auto">
          <Link to="/tarot">
            <Sparkles className="size-4" /> 타로 보기
          </Link>
        </Button>
      </header>

      {query.isLoading ? (
        <p className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </p>
      ) : query.isError ? (
        <p className="py-12 text-center text-sm text-destructive">기록을 불러오지 못했습니다.</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">아직 저장된 리딩이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <ReadingRow item={item} />
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="mt-4 text-center">
          <Button type="button" variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null} 더 보기
          </Button>
        </div>
      )}
    </div>
  );
};

const ReadingRow = ({ item }: { item: TarotReadingSummaryType }) => {
  const del = useDeleteTarotReading();
  const [confirming, setConfirming] = useState(false);
  const spread = getTarotSpread(item.spreadId);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 transition hover:bg-muted/40">
      <Link to={`/me/tarot/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex shrink-0 -space-x-2">
          {item.cards.slice(0, 3).map((c) => (
            <TarotCardImage key={c.cardId} cardId={c.cardId} reversed={c.reversed} className="w-8 border border-background" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-serif-kr text-base font-bold">{item.keyword}</span>
            <span className="text-xs text-muted-foreground">
              {spread?.nameKo} · {TAROT_TOPIC_LABEL[item.topic]}
              {item.source === 'static' ? ' · 기본 해석' : ''}
            </span>
          </div>
          <div className="truncate text-sm text-muted-foreground">{item.question || '질문 없음'}</div>
          <div className="text-[11px] text-muted-foreground/70">{fmtDate(item.createdAt)}</div>
        </div>
      </Link>
      {confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="destructive" disabled={del.isPending} onClick={() => del.mutate(item.id)}>
            삭제
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            취소
          </Button>
        </div>
      ) : (
        <button
          type="button"
          aria-label="기록 삭제"
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded p-2 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
};
