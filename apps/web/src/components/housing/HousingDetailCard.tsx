import { useState } from 'react';
import { ArrowLeft, Crosshair, Loader2 } from 'lucide-react';
import { useHousingTrades, type HousingAxis } from '@repo/shared';
import type { HousingBandStatType, HousingComplexDetailType, HousingOfficialPriceType, HousingTradeType } from '@repo/api-contract';
import {
  HOUSING_AREA_BANDS,
  HOUSING_AREA_BAND_LABEL,
  HOUSING_COMPLEX_KIND_LABEL,
  HOUSING_DEAL_COLOR,
  HOUSING_DEAL_TYPES,
  HOUSING_DEAL_TYPE_LABEL,
  formatDistanceM,
  formatHousingArea,
  formatHousingDateShort,
  formatHousingDealPrice,
  formatHousingPrice,
  formatHousingUnitPrice,
  housingPyeong,
  type HousingDealType,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { isHousingRental } from './housingMarkers';

// 선택 단지 상세 — 헤더(단지명·종류·세대·동수·사용승인·보강 속성(분양형태·난방·승강기·주차·최고층·구조)·
// 지번/도로명 주소·다른 이름) → 거래 유형 탭(로컬, 초기값은 전역 축) → 면적 구간별 통계 표(최근 거래·
// 12개월 건수·평당가) → 공시가격 표(구간별 중위·범위·호수, 있을 때만) → 거래 목록(전역 면적 구간, '더 보기'
// offset 페이징). 패널의 주변 목록 자리를 대신 차지하고 '← 목록' 으로 돌아간다.

interface Props {
  item: HousingComplexDetailType;
  // 전역 축 — 탭 초기값(dealType)과 거래 목록 면적 구간(band).
  axis: HousingAxis;
  // 내 위치가 있으면 거리(m).
  distM: number | null;
  onBack: () => void;
  onFlyTo: (lat: number, lng: number) => void;
}

const BAND_ORDER: Record<string, number> = Object.fromEntries(HOUSING_AREA_BANDS.map((b, i) => [b, i]));
const sortStats = (stats: HousingBandStatType[]): HousingBandStatType[] =>
  [...stats].sort((a, b) => (BAND_ORDER[a.band] ?? 99) - (BAND_ORDER[b.band] ?? 99));
const sortPrices = (prices: HousingOfficialPriceType[]): HousingOfficialPriceType[] =>
  [...prices].sort((a, b) => (BAND_ORDER[a.band] ?? 99) - (BAND_ORDER[b.band] ?? 99));

// 보강 속성 한 줄 — K-apt(분양형태·난방·승강기)·건축물대장(주차·최고층·구조). null 은 생략.
const complexFacts = (item: HousingComplexDetailType): string[] => {
  const out: string[] = [];
  if (item.saleType) out.push(`분양형태 ${item.saleType}`);
  if (item.heating) out.push(item.heating);
  if (item.elevatorCount !== null) out.push(`승강기 ${item.elevatorCount.toLocaleString('ko-KR')}대`);
  if (item.parkingCount !== null) {
    const per = item.households !== null && item.households > 0 ? ` (세대당 ${(item.parkingCount / item.households).toFixed(1)}대)` : '';
    out.push(`주차 ${item.parkingCount.toLocaleString('ko-KR')}대${per}`);
  }
  if (item.floorsMax !== null) out.push(`최고 ${item.floorsMax}층`);
  if (item.structure) out.push(item.structure);
  return out;
};

// 거래 행 배지 — 매매: 직거래·해제, 전월세: 신규·갱신(+갱신요구권 사용).
const tradeBadges = (t: HousingTradeType): string[] => {
  const out: string[] = [];
  if (t.canceled) out.push('해제');
  if (t.dealingGbn === '직거래') out.push('직거래');
  if (t.contractType === '갱신') out.push(t.useRRRight === '사용' ? '갱신·갱신요구권 사용' : '갱신');
  else if (t.contractType === '신규') out.push('신규');
  return out;
};

export const HousingDetailCard = ({ item, axis, distM, onBack, onFlyTo }: Props) => {
  const [tab, setTab] = useState<HousingDealType>(axis.dealType);
  const hasCoords = item.lat !== null && item.lng !== null;
  const stats = sortStats(item.stats[tab]);
  const tradesQ = useHousingTrades(item.id, { dealType: tab, band: axis.band });
  const trades = tradesQ.data?.pages.flatMap((p) => p.items) ?? [];
  const total = tradesQ.data?.pages[0]?.total ?? 0;
  const remaining = Math.max(0, total - trades.length);

  const meta: string[] = [HOUSING_COMPLEX_KIND_LABEL[item.kind]];
  if (item.households !== null) meta.push(`${item.households.toLocaleString('ko-KR')}세대`);
  if (item.dongCount !== null) meta.push(`${item.dongCount}개동`);
  if (item.approvedDate) meta.push(`${item.approvedDate.slice(0, 4)}년 사용승인`);
  const facts = complexFacts(item);
  const rental = isHousingRental(item.saleType);
  const prices = sortPrices(item.officialPrices);
  const priceYear = prices[0]?.year ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="housing-detail">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-7 gap-1 px-2 text-xs">
          <ArrowLeft className="size-3.5" /> 목록
        </Button>
        {hasCoords && (
          <Button variant="ghost" size="sm" onClick={() => onFlyTo(item.lat!, item.lng!)} className="ml-auto h-7 gap-1 px-2 text-xs">
            <Crosshair className="size-3.5" /> 지도 중심으로
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base font-semibold leading-tight">
            <span>{item.name}</span>
            {rental && <span className="rounded border border-foreground/30 px-1.5 py-px text-[10px] font-medium text-foreground">임대단지</span>}
          </h2>
          <p className="text-xs text-muted-foreground">
            {meta.join(' · ')}
            {distM !== null ? ` · 내 위치에서 ${formatDistanceM(distM)}` : ''}
          </p>
          {facts.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground" data-testid="housing-detail-facts">
              {facts.join(' · ')}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{item.addr}</p>
          {item.roadAddr && <p className="text-[11px] text-muted-foreground">{item.roadAddr}</p>}
          {item.altNames.length > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">다른 이름: {item.altNames.join(', ')}</p>
          )}
          {item.source === 'rtms' && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              실거래 주소로만 확인된 단지 — 세대수·사용승인일 등 단지 정보가 없습니다.
            </p>
          )}
        </div>

        {/* 거래 유형 탭 — 상세 안에서만 바꾸는 로컬 축(지도·목록 축은 그대로). */}
        <div className="mt-3 inline-flex rounded-md border p-0.5" role="tablist" aria-label="상세 거래 유형" data-testid="housing-detail-tabs">
          {HOUSING_DEAL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors',
                tab === t ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span aria-hidden className="size-2 rounded-full ring-1 ring-white/70" style={{ backgroundColor: HOUSING_DEAL_COLOR[t] }} />
              {HOUSING_DEAL_TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {/* 면적 구간별 통계 — 거래가 있는 구간만. */}
        {stats.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">적재된 기간에 {HOUSING_DEAL_TYPE_LABEL[tab]} 거래가 없습니다.</p>
        ) : (
          <div className="mt-3 overflow-x-auto" data-testid="housing-detail-stats">
            <table className="w-full text-xs">
              <thead className="text-[11px] text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1 pr-2 text-left font-normal">면적</th>
                  <th className="py-1 pr-2 text-right font-normal">최근 거래</th>
                  <th className="py-1 pr-2 text-right font-normal">12개월</th>
                  <th className="py-1 text-right font-normal">평당가</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stats.map((s) => (
                  <tr key={s.band}>
                    <td className="py-1.5 pr-2 align-top">{s.band === 'all' ? '전체' : HOUSING_AREA_BAND_LABEL[s.band]}</td>
                    <td className="py-1.5 pr-2 text-right align-top tabular-nums">
                      <span className="block font-semibold">{formatHousingDealPrice(tab, s.latest.price, s.latest.rent)}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatHousingArea(s.latest.area, false)} ({housingPyeong(s.latest.area)}평)
                        {s.latest.floor !== null ? ` · ${s.latest.floor}층` : ''} · {formatHousingDateShort(s.latest.dealDate)}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right align-top tabular-nums">{s.count12.toLocaleString('ko-KR')}건</td>
                    <td className="py-1.5 text-right align-top tabular-nums">{formatHousingUnitPrice(s.unitPrice12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 공시가격 — 단지 × 면적 구간(호별 공시가격을 접은 값). 적재됐을 때만. */}
        {prices.length > 0 && (
          <div className="mt-4 overflow-x-auto" data-testid="housing-official-prices">
            <div className="text-[11px] text-muted-foreground">{priceYear} 공시가격 (1월 1일 기준, 국토교통부)</div>
            <table className="mt-1 w-full text-xs">
              <thead className="text-[11px] text-muted-foreground">
                <tr className="border-b">
                  <th className="py-1 pr-2 text-left font-normal">면적</th>
                  <th className="py-1 pr-2 text-right font-normal">중위</th>
                  <th className="py-1 pr-2 text-right font-normal">범위</th>
                  <th className="py-1 pr-2 text-right font-normal">호수</th>
                  <th className="py-1 text-right font-normal">평균 전용</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {prices.map((p) => (
                  <tr key={p.band}>
                    <td className="py-1.5 pr-2 align-top">{p.band === 'all' ? '전체' : HOUSING_AREA_BAND_LABEL[p.band]}</td>
                    <td className="py-1.5 pr-2 text-right align-top font-semibold tabular-nums">{formatHousingPrice(p.median)}</td>
                    <td className="py-1.5 pr-2 text-right align-top tabular-nums text-muted-foreground">
                      {formatHousingPrice(p.min)}~{formatHousingPrice(p.max)}
                    </td>
                    <td className="py-1.5 pr-2 text-right align-top tabular-nums">{p.count.toLocaleString('ko-KR')}호</td>
                    <td className="py-1.5 text-right align-top tabular-nums">{formatHousingArea(p.avgArea, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 거래 목록 — 전역 면적 구간, 계약일 내림차순. */}
        <div className="mt-4" data-testid="housing-trades">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {HOUSING_DEAL_TYPE_LABEL[tab]} 거래 · {HOUSING_AREA_BAND_LABEL[axis.band]}
            </span>
            {tradesQ.data && <span>{total.toLocaleString('ko-KR')}건</span>}
          </div>
          {tradesQ.isLoading ? (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 거래를 불러오는 중…
            </p>
          ) : tradesQ.isError ? (
            <p className="py-4 text-sm text-muted-foreground">거래 목록을 불러오지 못했습니다.</p>
          ) : trades.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">이 조건의 거래가 없습니다.</p>
          ) : (
            <ul className="mt-1 divide-y">
              {trades.map((t) => {
                const badges = tradeBadges(t);
                return (
                  <li key={t.id} className={cn('flex items-start gap-2 py-1.5 text-xs', t.canceled && 'text-muted-foreground line-through')}>
                    <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{formatHousingDateShort(t.dealDate)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        {formatHousingArea(t.area, false)} ({housingPyeong(t.area)}평)
                        {t.floor !== null ? ` · ${t.floor}층` : ''}
                        {t.aptDong ? ` · ${t.aptDong}동` : ''}
                      </span>
                      {badges.length > 0 && (
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {badges.map((b) => (
                            <span key={b} className="rounded border px-1 py-px text-[10px] text-muted-foreground no-underline">
                              {b}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-semibold">{formatHousingDealPrice(tab, t.price, t.rent)}</span>
                      {t.preDeposit !== null && t.preDeposit > 0 && (
                        <span className="block text-[10px] text-muted-foreground">
                          종전 {tab === 'monthly' && t.preRent !== null ? `${formatHousingPrice(t.preDeposit)}/${t.preRent}` : formatHousingPrice(t.preDeposit)}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {tradesQ.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-8 w-full text-xs"
              disabled={tradesQ.isFetchingNextPage}
              onClick={() => void tradesQ.fetchNextPage()}
            >
              {tradesQ.isFetchingNextPage ? '불러오는 중…' : `더 보기 (${remaining.toLocaleString('ko-KR')}건 남음)`}
            </Button>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          국토교통부 실거래가 공개시스템 신고 자료 — 신고 지연(계약 후 30일)으로 최근 거래가 늦게 반영되고, 해제된 거래는 제외했습니다.
          {prices.length > 0 ? ' 공시가격은 매년 1월 1일 기준 국토교통부 공시로, 시세보다 낮게 형성되는 것이 보통입니다.' : ''}
          {rental ? ' 임대단지는 분양 거래가 없어 실거래가가 잡히지 않는 것이 정상입니다.' : ''}
          {item.geoSource ? ' 위치는 주소를 VWorld 지오코더로 변환한 값이라 단지 입구와 차이 날 수 있습니다.' : item.lat === null ? ' 주소를 좌표로 변환하지 못해 지도에는 표시되지 않습니다.' : ''}
        </p>
      </div>
    </div>
  );
};
