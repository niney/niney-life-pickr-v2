import { AlertTriangle, Footprints } from 'lucide-react';
import type { RestaurantTourMatchInfoType } from '@repo/api-contract';

// 여행로그 매칭 배지 — AI 허브 71780 여행로그 장소(TourPlace)와 좌표·상호로 붙은 맛집에 "여행자 N명 · 만족 x.xx · 2023"
// 을, 국세청 조회로 폐업·휴업이면 경고 톤을 하나 더. StoreInfoBadges 와 같은 자리(어드민 상세 헤더, 2차). 공개 상세는
// 4차에서 별도 요약 필드로. 색만으로 뜻을 전하지 않게 아이콘 + 글자, 근거는 title.

interface Props {
  tour: RestaurantTourMatchInfoType | null;
}

export const TourMatchBadge = ({ tour }: Props) => {
  if (!tour) return null;
  const detail = [
    `여행로그 장소 "${tour.placeName}"(${tour.typeShort}) · 거리 ${tour.distM}m · 상호 유사도 ${Math.round(tour.nameScore * 100)}%`,
    `방문 ${tour.nVisits}건 · 평가 ${tour.nRated}건${tour.revisitRate !== null ? ` · 재방문 ${Math.round(tour.revisitRate * 100)}%` : ''}${tour.stayMedian !== null ? ` · 체류 중앙 ${tour.stayMedian}분` : ''}${tour.spendPpMedian !== null ? ` · 1인 ${Math.round(tour.spendPpMedian).toLocaleString('ko-KR')}원` : ''}`,
    tour.topReasonNm ? `주요 방문 이유: ${tour.topReasonNm}` : null,
    tour.sampleLabel,
    tour.status === 'missing' ? '재적재 후 장소가 후보에서 사라짐(매칭 보류)' : null,
  ]
    .filter(Boolean)
    .join('\n');
  const closed = tour.bizStatus && (tour.bizStatus.bStt === '폐업자' || tour.bizStatus.bStt === '휴업자');
  return (
    <>
      <span
        className="inline-flex items-center gap-1 rounded-md border border-teal-600/40 bg-teal-600/10 px-1.5 py-0.5 text-[11px] font-medium text-teal-800 dark:text-teal-300"
        title={detail}
        data-testid="tour-match-badge"
      >
        <Footprints className="size-3" aria-hidden />
        여행자 {tour.nTravelers}명{tour.bayesScore !== null ? ` · 만족 ${tour.bayesScore.toFixed(2)}` : ''} · 2023
      </span>
      {closed && (
        <span
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
          title={`국세청 사업자 상태 ${tour.bizStatus!.bStt}${tour.bizStatus!.endDt ? ` (${tour.bizStatus!.endDt})` : ''} · 조회 ${tour.bizStatus!.checkedAt.slice(0, 10)}. 영수증 사업자번호 기준이라 다른 사업자로 영업 중일 수 있습니다.`}
          data-testid="tour-biz-badge"
        >
          <AlertTriangle className="size-3" aria-hidden />
          국세청 {tour.bizStatus!.bStt}
        </span>
      )}
    </>
  );
};
