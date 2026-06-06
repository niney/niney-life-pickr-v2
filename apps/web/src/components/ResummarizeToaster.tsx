import { toast } from 'sonner';
import {
  useResummarizeWatcher,
  type ResummarizeInFlight,
} from '@repo/shared';
import type { RestaurantSummaryReviewEventType } from '@repo/api-contract';

const SENTIMENT_LABEL: Record<string, string> = {
  positive: '긍정',
  negative: '부정',
  neutral: '중립',
  mixed: '혼합',
};

// 단건 재요약 완료 결과를 토스트로. 재분류되면 그 리뷰가 현재 필터(예: 부정)
// 에서 사라져 직접 못 보므로, 사라지기 직전 SSE 가 실어온 새 분석(sentiment/
// 만족도/요약/모델)을 토스트로 보여준다. in-flight 에 기억해둔 이전 sentiment
// 와 비교해 "부정 → 긍정" 델타를 표시.
const showResummarizeToast = (
  ev: RestaurantSummaryReviewEventType,
  inFlight: ResummarizeInFlight,
): void => {
  if (ev.status === 'failed') {
    toast.error('재요약 실패', {
      description: ev.errorMessage ?? ev.errorCode ?? '알 수 없는 오류',
    });
    return;
  }

  const prev = inFlight.prevSentiment;
  const newLabel = ev.sentiment
    ? SENTIMENT_LABEL[ev.sentiment] ?? ev.sentiment
    : '—';
  const delta =
    prev && ev.sentiment && prev !== ev.sentiment
      ? `${SENTIMENT_LABEL[prev] ?? prev} → ${newLabel}`
      : newLabel;
  const bits = [delta];
  if (ev.satisfactionScore != null) bits.push(`만족도 ${ev.satisfactionScore}`);
  if (ev.model) bits.push(ev.model);

  toast.success(`재요약 완료 · ${bits.join(' · ')}`, {
    description: ev.text ?? undefined,
  });
};

// App 에 1개만 마운트. 진행 중인 단건 재요약을 앱 전역에서 지켜보다가 완료되면
// 토스트를 띄운다 — ReviewsTab 을 떠나(탭 전환/페이지 이동) 있어도 동작한다.
// 렌더 출력은 없다(토스트는 sonner 의 <Toaster> 가 그린다).
export const ResummarizeToaster = (): null => {
  useResummarizeWatcher({ onResult: showResummarizeToast });
  return null;
};
