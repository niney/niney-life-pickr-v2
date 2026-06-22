import { useState } from 'react';
import { Loader2, MessageSquareText, Send, Sparkles, Star } from 'lucide-react';
import { useReviewAskPublic, useReviewQaReady } from '@repo/shared';
import type { ReviewAskResultType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';

interface Props {
  placeId: string;
}

const SUGGESTED = ['주차 돼요?', '웨이팅 긴가요?', '대표 메뉴 뭐예요?', '분위기 어때요?'];

const CONFIDENCE_LABEL: Record<ReviewAskResultType['confidence'], string> = {
  high: '신뢰도 높음',
  medium: '신뢰도 보통',
  low: '신뢰도 낮음',
  none: '정보 부족',
};

// 공개 질문(RAG) 탭 — 식당 리뷰 근거로 AI 가 답한다. 탭이 열릴 때만 ready 조회
// (LLM 호출 없음), enrich 안 된 식당은 안내만. 질문은 레이트리밋되는 공개 엔드포인트.
export const AskTab = ({ placeId }: Props) => {
  const ready = useReviewQaReady(placeId);
  const askMut = useReviewAskPublic();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ReviewAskResultType | null>(null);

  const submit = (q: string) => {
    const text = q.trim();
    if (!text || askMut.isPending) return;
    setQuery(text);
    askMut.mutate(
      { placeId, query: text },
      { onSuccess: (r) => setResult(r), onError: () => setResult(null) },
    );
  };

  if (ready.isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }

  if (!ready.data?.ready) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <MessageSquareText className="size-6 opacity-40" />
        아직 이 식당은 리뷰 분석이 준비되지 않았어요.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <section className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> 리뷰로 물어보기
        </div>
        <p className="text-xs text-muted-foreground">
          방문자 리뷰 {ready.data.count.toLocaleString()}건을 근거로 AI 가 답합니다. 리뷰에 없는 내용은 답하지
          않아요.
        </p>
      </section>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit(query)}
          placeholder="이 식당에 대해 물어보세요"
          maxLength={200}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => submit(query)}
          disabled={!query.trim() || askMut.isPending}
          className="flex items-center justify-center rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50"
          aria-label="질문하기"
        >
          {askMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => submit(s)}
            disabled={askMut.isPending}
            className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {askMut.isError && (
        <p className="text-sm text-destructive">답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      )}

      {result && !askMut.isPending && (
        <section className="space-y-2">
          <div className="rounded-md border bg-muted/30 p-3">
            <Badge
              variant="secondary"
              className={`mb-1.5 ${result.confidence === 'none' ? 'text-muted-foreground' : ''}`}
            >
              {CONFIDENCE_LABEL[result.confidence]}
            </Badge>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</p>
          </div>

          {result.verification?.applied && result.verification.dropped.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              ※ 근거가 부족한 내용 {result.verification.dropped.length}건은 답변에서 제외했어요.
            </p>
          )}

          {result.citations.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                근거 리뷰 {result.citations.length}건
              </summary>
              <ul className="mt-2 space-y-2">
                {result.citations.map((c, i) => (
                  <li key={c.reviewId} className="rounded-md border p-2.5 text-xs">
                    <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                      <span className="tabular-nums">[{i + 1}]</span>
                      {c.rating != null && (
                        <span className="flex items-center gap-0.5 text-amber-600">
                          <Star className="size-3 fill-current" /> {c.rating}
                        </span>
                      )}
                    </div>
                    <p className="text-foreground">{c.body}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-[11px] text-muted-foreground">AI 가 리뷰를 요약한 답변으로, 실제와 다를 수 있어요.</p>
        </section>
      )}
    </div>
  );
};
