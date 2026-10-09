import { useNavigate } from 'react-router-dom';
import { Car, ExternalLink, Loader2, SquareParking } from 'lucide-react';
import type { RestaurantPublicDetailType } from '@repo/api-contract';
import { useParkingLotNearby, useRestaurantParkingReviews } from '@repo/shared';
import {
  PARKING_LEVEL_LABEL,
  PARKING_RESTAURANT_RADIUS_M,
  formatDistanceM,
  formatParkingFeeRule,
  parkingLevelColor,
  roundCoord,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { feeRuleOf, lotTypeLine } from '~/components/parking/parkingFormat';

// 식당 상세의 주차 — '가는 법' 탭 섹션(리뷰 속 주차 평가·팁 + 다이닝코드 시설 + 반경 300m 주차장·실시간 여석 + 주차 페이지
// 링크)과 홈 탭 한 줄 요약. 둘은 같은 조회 키(반경·건수)를 써서 React Query 캐시를 공유한다. docs/PLAN-parking.md

const NEARBY_LIMIT = 5;

// enabled=false 면 조회(와 5분 폴링)를 걸지 않는다 — 캐시에 이미 있으면(가는 법 탭을 먼저 본 경우) 그 값은 그대로 쓴다.
const useParkingData = (detail: RestaurantPublicDetailType, enabled = true) => {
  const lat = detail.latitude;
  const lng = detail.longitude;
  const reviews = useRestaurantParkingReviews(enabled ? detail.placeId : null);
  const nearby = useParkingLotNearby(lat, lng, { radius: PARKING_RESTAURANT_RADIUS_M, limit: NEARBY_LIMIT, enabled });
  const dcParking = detail.diningcode?.facilities.some((f) => f.includes('주차')) ?? false;
  return { reviews, nearby, dcParking };
};

// 리뷰 평가 한 마디 — 긍·부정 언급 수로. 언급이 없으면 null.
const verdictOf = (aspect: { pos: number; neg: number; neu: number } | undefined): string | null => {
  if (!aspect) return null;
  const { pos, neg } = aspect;
  if (pos + neg === 0) return null;
  if (pos > neg) return '리뷰: 주차 편한 편';
  if (neg > pos) return '리뷰: 주차 불편한 편';
  return '리뷰: 주차 평가 엇갈림';
};

const parkingPageUrl = (lat: number, lng: number, sel?: string): string =>
  `/parking?ll=${roundCoord(lat)},${roundCoord(lng)}&z=17${sel ? `&sel=${encodeURIComponent(sel)}` : ''}`;

// ── 가는 법 탭 섹션 ─────────────────────────────────────────────────────────
// 좌표가 없는 식당(lat/lng null)은 리뷰 평가·팁·다이닝코드 시설만 — 주변 주차장 목록·주차 페이지 링크는 좌표가 있어야 한다.
// 그때 보여 줄 리뷰 정보도 없으면 섹션을 그리지 않는다(탭의 '좌표 없음' 안내만 남는다).
export const ParkingNearbySection = ({ detail, lat, lng }: { detail: RestaurantPublicDetailType; lat: number | null; lng: number | null }) => {
  const navigate = useNavigate();
  const { reviews, nearby, dcParking } = useParkingData(detail);
  const aspect = reviews.data?.aspect;
  const mentions = aspect ? aspect.pos + aspect.neg + aspect.neu : 0;
  const items = nearby.data?.items ?? [];
  const hasReviewInfo = mentions > 0 || (reviews.data?.tips.length ?? 0) > 0 || dcParking;
  const located = lat !== null && lng !== null;
  if (!located && !hasReviewInfo) return null;
  return (
    <section data-testid="restaurant-parking">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <SquareParking className="size-4" />
          주차
        </h3>
        {located && (
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" onClick={() => navigate(parkingPageUrl(lat, lng))}>
            주차 페이지에서 보기
            <ExternalLink className="size-3" />
          </Button>
        )}
      </header>

      {hasReviewInfo && (
        <div className="mb-2 space-y-1.5 rounded-md border bg-muted/20 px-3 py-2 text-sm">
          {mentions > 0 && aspect && (
            <p>
              <span className="font-medium">{verdictOf(aspect) ?? '리뷰 속 주차 언급'}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                좋음 {aspect.pos} · 아쉬움 {aspect.neg}
                {aspect.neu > 0 ? ` · 보통 ${aspect.neu}` : ''} (분석 리뷰 {reviews.data!.analyzed}건 중)
              </span>
            </p>
          )}
          {(reviews.data?.tips.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {reviews.data!.tips.map((t) => (
                <span key={t.term} className="rounded-full border bg-background px-2 py-0.5 text-[11px]">
                  {t.term}
                  {t.count > 1 ? ` ×${t.count}` : ''}
                </span>
              ))}
            </div>
          )}
          {dcParking && <p className="text-xs text-muted-foreground">다이닝코드 시설 정보: 주차 가능</p>}
        </div>
      )}

      {!located ? null : nearby.isLoading && items.length === 0 ? (
        <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
        </div>
      ) : nearby.isError && items.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">주차장 정보를 불러오지 못했어요.</p>
      ) : items.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">
          반경 {formatDistanceM(PARKING_RESTAURANT_RADIUS_M)} 안에 등록된 주차장이 없어요.
          <span className="block text-xs">공영·표준데이터 기준이라 건물 부설주차장은 대부분 빠져 있어요.</span>
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => (it.lat !== null && it.lng !== null ? navigate(parkingPageUrl(it.lat, it.lng, it.id)) : undefined)}
                className="flex w-full min-w-0 items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
              >
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: parkingLevelColor(it.live?.level) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{it.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {lotTypeLine(it)}
                    {it.feeType !== 'free' && it.fee.baseFee !== null ? ` · ${formatParkingFeeRule(feeRuleOf(it))}` : ''}
                  </span>
                  {it.live && it.live.available !== null && (
                    <span className="block text-xs font-medium">
                      {it.live.level ? PARKING_LEVEL_LABEL[it.live.level] : '실시간'} · 여석 {it.live.available.toLocaleString('ko-KR')}
                    </span>
                  )}
                </span>
                <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{formatDistanceM(it.dist)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ── 홈 탭 한 줄 요약 ────────────────────────────────────────────────────────
// 리뷰 평가 한 마디 + 가장 가까운 주차장(무료·여석). 둘 다 없으면 그리지 않는다.
// onOpen 이 없으면('가는 법' 탭이 없는 어드민 상세) 누를 수 없는 정보 줄로만 그린다.
// enabled — 이 줄은 홈 탭 맨 아래라 대개 첫 화면 밖이다. 홈 탭이 "영업 정보" 가 화면에 들어온 뒤에
// true 로 넘겨, 상세를 열 때마다 안 보이는 한 줄을 위해 조회 2건(+주변 주차장 5분 폴링)이 나가지 않게 한다.
export const ParkingSummaryLine = ({
  detail,
  onOpen,
  enabled = true,
}: {
  detail: RestaurantPublicDetailType;
  onOpen?: () => void;
  enabled?: boolean;
}) => {
  const { reviews, nearby, dcParking } = useParkingData(detail, enabled);
  const topTip = reviews.data?.tips[0]?.term ?? null;
  const verdict = verdictOf(reviews.data?.aspect) ?? (topTip ? `리뷰: '${topTip}'` : dcParking ? '주차 가능(다이닝코드)' : null);
  const nearest = nearby.data?.items[0] ?? null;
  const lot = nearest
    ? `${nearest.name} ${formatDistanceM(nearest.dist)}${nearest.feeType === 'free' ? ' · 무료' : ''}${nearest.live?.available != null ? ` · 여석 ${nearest.live.available}` : ''}`
    : null;
  if (!verdict && !lot) return null;
  const content = (
    <>
      <Car className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 truncate">{[verdict, lot].filter(Boolean).join(' · ')}</span>
    </>
  );
  if (!onOpen) {
    return (
      <div className="flex w-full gap-2" data-testid="restaurant-parking-summary">
        {content}
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} className="flex w-full gap-2 text-left hover:text-foreground" data-testid="restaurant-parking-summary">
      {content}
    </button>
  );
};
