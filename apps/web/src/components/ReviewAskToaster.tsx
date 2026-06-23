import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useReviewAskStore } from '@repo/shared';

// 진행 중인 공개 질문(AskTab)을 앱 전역에서 지켜보다 완료되면 토스트를 띄운다.
// 답변은 LLM 3콜이라 15초+ 걸려 사용자가 탭 전환/페이지 이동하기 쉬운데, 그래도
// 결과를 놓치지 않게 한다 — '더보기'를 누르면 해당 식당 Ask 탭으로 복귀한다.
// 지금 그 식당 Ask 탭을 보고 있으면 화면에 이미 결과가 뜨므로 토스트는 생략(노이즈 방지).
// 렌더 출력은 없다(토스트는 sonner 의 <Toaster> 가 그린다).
export const ReviewAskToaster = (): null => {
  const completion = useReviewAskStore((s) => s.completion);
  const clearCompletion = useReviewAskStore((s) => s.clearCompletion);
  const navigate = useNavigate();
  const location = useLocation();
  // location 을 effect dep 에 넣으면 탭 이동마다 재실행되므로 ref 로 최신값만 참조.
  const locRef = useRef(location);
  locRef.current = location;
  // 같은 완료 이벤트로 두 번 토스트하지 않도록 seq 추적.
  const lastSeq = useRef(0);

  useEffect(() => {
    if (!completion || completion.seq === lastSeq.current) return;
    lastSeq.current = completion.seq;
    const { placeId, restaurantName, ok, answer } = completion;
    clearCompletion();

    // 지금 그 식당 Ask 탭을 보고 있으면 토스트 생략(화면에 이미 결과/에러 표시).
    const loc = locRef.current;
    const onThisAskTab =
      loc.pathname.endsWith(`/${placeId}`) &&
      new URLSearchParams(loc.search).get('tab') === 'ask';
    if (onThisAskTab) return;

    // 어떤 상세 레이아웃에서 떠났든 canonical 상세 라우트의 Ask 탭으로 복귀.
    const goAsk = () => navigate(`/restaurants/${placeId}?tab=ask`);

    if (!ok) {
      toast.error('답변을 가져오지 못했어요', {
        description: restaurantName ?? undefined,
        action: { label: '다시 보기', onClick: goAsk },
      });
      return;
    }

    const preview =
      answer && answer.length > 90 ? `${answer.slice(0, 90)}…` : answer || undefined;
    toast.success(restaurantName ? `${restaurantName} · 답변 준비됐어요` : '답변 준비됐어요', {
      description: preview,
      action: { label: '더보기', onClick: goAsk },
      duration: 10_000,
    });
  }, [completion, clearCompletion, navigate]);

  return null;
};
