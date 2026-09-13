import { Footprints } from 'lucide-react';
import type { RestaurantTourSummaryType } from '@repo/api-contract';
import { TourSourceNote } from '~/components/tour/TourSourceNote';

// 공개 상세의 여행로그 요약 — 헤더 배지("여행자 N명 · 만족 x.xx · 2023")와 홈 탭의 요약 줄. 어드민 TourMatchBadge 와
// 달리 매칭 근거(거리·유사도)나 폐업 상태는 싣지 않는다(공개 집계 요약만). 근거는 title 의 표본 문구.

export const TourSummaryBadge = ({ tour }: { tour: RestaurantTourSummaryType | null }) => {
  if (!tour) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-teal-600/40 bg-teal-600/10 px-1.5 py-0.5 text-[11px] font-medium text-teal-800 dark:text-teal-300"
      title={`${tour.sampleLabel} — 방문 ${tour.nVisits}건 · 평가 ${tour.nRated}건`}
      data-testid="tour-summary-badge"
    >
      <Footprints className="size-3" aria-hidden />
      여행자 {tour.nTravelers}명{tour.bayesScore !== null ? ` · 만족 ${tour.bayesScore.toFixed(2)}` : ''} · 2023
    </span>
  );
};

const won = (v: number | null): string => (v === null ? '–' : v >= 10000 ? `${(v / 10000).toFixed(v % 10000 === 0 ? 0 : 1)}만원` : `${Math.round(v).toLocaleString('ko-KR')}원`);

// 홈 탭 요약 줄 — 4칸 + 표본·출처 한 줄. 자세한 분포는 "여행자" 탭.
export const TourSummaryLine = ({ tour }: { tour: RestaurantTourSummaryType }) => (
  <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Cell value={String(tour.nTravelers)} unit="명" label={`여행자 · 방문 ${tour.nVisits}건`} />
      <Cell value={tour.bayesScore !== null ? tour.bayesScore.toFixed(2) : '–'} unit="/5" label={`보정 만족도 · 평가 ${tour.nRated}건`} />
      <Cell value={tour.revisitRate !== null ? `${Math.round(tour.revisitRate * 100)}` : '–'} unit="%" label="재방문 방문" />
      <Cell value={won(tour.spendPpMedian)} label={tour.stayMedian !== null ? `1인당 지출 · 체류 ${tour.stayMedian}분` : '1인당 지출 중앙'} />
    </div>
    {tour.topReasonNm && <p className="text-[11px] text-muted-foreground">가장 많은 방문 이유: {tour.topReasonNm}</p>}
    <TourSourceNote note={tour.sourceNote} />
  </div>
);

const Cell = ({ value, unit, label }: { value: string; unit?: string; label: string }) => (
  <div className="rounded-md bg-muted px-2.5 py-2">
    <div className="text-base font-semibold tabular-nums leading-tight">
      {value}
      {unit && <span className="ml-0.5 text-[11px] font-medium text-muted-foreground">{unit}</span>}
    </div>
    <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
  </div>
);
