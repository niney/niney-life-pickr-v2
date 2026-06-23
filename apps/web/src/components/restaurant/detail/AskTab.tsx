import { useState } from 'react';
import { Loader2, MessageSquareText, Send, Sparkles, Star } from 'lucide-react';
import { useReviewAskStore, useReviewQaReady } from '@repo/shared';
import type { ReviewAskResultType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';

interface Props {
  placeId: string;
  // 완료 토스트 제목에 식당명을 싣기 위해 부모(상세)가 전달.
  restaurantName?: string | null;
}

const SUGGESTED = [
  '주차 돼요?',
  '웨이팅 긴가요?',
  '대표 메뉴 뭐예요?',
  '분위기 어때요?',
  '양은 푸짐한가요?',
  '가격대 어때요?',
  '가성비 좋아요?',
  '맛없다는 평도 있어요?',
  '직원분들 친절해요?',
  '아이랑 가도 괜찮아요?',
  '데이트하기 좋아요?',
  '단체 모임 가능해요?',
  '재방문하고 싶다는 평 많아요?',
  '매운 메뉴 있어요?',
  '혼밥하기 괜찮아요?',
  '술 한잔하기 좋아요?',
  '룸(개별 공간) 있어요?',
  '매장 깨끗한가요?',
  '어떤 메뉴가 인기예요?',
  '예약 되나요?',
  // 특별 관련 주제 (상황·니치)
  '여기만의 특별한 점이 있어요?',
  '기념일에 가기 좋아요?',
  '반려동물 동반 되나요?',
  '채식 메뉴 있어요?',
  '뷰가 좋아요?',
  '사진 찍기 좋아요?',
  '콜키지 되나요?',
  '노키즈존인가요?',
  '시즌 한정 메뉴 있어요?',
];

const CONFIDENCE_LABEL: Record<ReviewAskResultType['confidence'], string> = {
  high: '신뢰도 높음',
  medium: '신뢰도 보통',
  low: '신뢰도 낮음',
  none: '정보 부족',
};

// 공개 질문(RAG) 탭 — 식당 리뷰 근거로 AI 가 답한다. 탭이 열릴 때만 ready 조회
// (LLM 호출 없음), enrich 안 된 식당은 안내만. 질문은 레이트리밋되는 공개 엔드포인트.
export const AskTab = ({ placeId, restaurantName }: Props) => {
  const ready = useReviewQaReady(placeId);
  // 진행 중 요청·결과는 전역 store — 탭/페이지를 떠나도 살아남고, 재진입 시
  // 식당별 마지막 Q&A 가 즉시 복원된다(영속).
  const ask = useReviewAskStore((s) => s.ask);
  const pending = useReviewAskStore((s) => !!s.inFlight[placeId]);
  const isError = useReviewAskStore((s) => !!s.errorByPlace[placeId]);
  const last = useReviewAskStore((s) => s.lastByPlace[placeId]);
  const [query, setQuery] = useState(last?.query ?? '');

  const result: ReviewAskResultType | null = last?.result ?? null;
  // 방금(5분 이내) 받은 답이 아니라 영속 복원된 '지난 답변'이면 안내. '더보기'로
  // 막 받은 답을 보러 돌아온 경우(재마운트)도 시각 기준이라 오인하지 않는다.
  const isRestored = !!last && Date.now() - last.answeredAt > 5 * 60_000;

  const submit = (q: string) => {
    const text = q.trim();
    if (!text || pending) return;
    setQuery(text);
    void ask(placeId, text, restaurantName ?? null);
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
          disabled={!query.trim() || pending}
          className="flex items-center justify-center rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50"
          aria-label="질문하기"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => submit(s)}
            disabled={pending}
            className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      {pending && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> 답변을 만드는 중이에요. 다른 화면을 봐도
          완료되면 알려드릴게요.
        </p>
      )}

      {isError && !pending && (
        <p className="text-sm text-destructive">답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      )}

      {result && !pending && (
        <section className="space-y-2">
          {isRestored && (
            <p className="text-[11px] text-muted-foreground">
              지난번에 물어본 답변이에요. 다시 물어보면 최신 리뷰로 답해드려요.
            </p>
          )}
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
