import { Loader2 } from 'lucide-react';
import type { TourLodgingResultType } from '@repo/api-contract';
import { Section } from './charts';
import { won } from './tourFormat';

// 숙소 통계(6차) — 숙박 결제 유형별 이용 여행·만족도·1박 추정·1인 결제·예약률. 1박은 체크인·아웃이 export 에 없어
// "결제액 × 그 여행의 숙박 결제 건수 ÷ 박수" 로 추정한다(힌트에 표기). 여행 5건 미만 유형은 서버가 뺀다.

const pct = (v: number | null): string => (v === null ? '–' : `${Math.round(v * 100)}%`);

export const TourLodgingSection = ({ data, loading, className }: { data: TourLodgingResultType | undefined; loading: boolean; className?: string }) => (
  <Section title="어디서 잤나" hint="숙박 결제 기준 · 1박 = 결제액 × 숙박 건수 ÷ 박수 추정" className={className}>
    {loading && !data ? (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> 숙소 통계 불러오는 중…
      </p>
    ) : !data || data.types.length === 0 ? (
      <p className="text-xs text-muted-foreground">표본이 부족해 숨겼습니다(5건 미만).</p>
    ) : (
      <>
        <p className="text-[11px] text-muted-foreground">
          여행 {data.total.trips.toLocaleString('ko-KR')}건 중 숙박 결제 기록 {data.total.withLodging.toLocaleString('ko-KR')}건 · 예약률 {pct(data.total.rsvtRate)}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="tour-lodging-table">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="py-1 font-medium">유형</th>
                <th className="py-1 text-right font-medium">이용 여행</th>
                <th className="py-1 text-right font-medium">만족도</th>
                <th className="py-1 text-right font-medium">1박 추정</th>
                <th className="py-1 text-right font-medium">1인 결제</th>
                <th className="py-1 text-right font-medium">예약률</th>
              </tr>
            </thead>
            <tbody>
              {data.types.map((t) => (
                <tr key={t.label} className="border-t">
                  <td className="py-1">{t.label}</td>
                  <td className="py-1 text-right tabular-nums">{t.trips.toLocaleString('ko-KR')}</td>
                  <td className="py-1 text-right tabular-nums">{t.mean !== null ? t.mean.toFixed(2) : '–'}</td>
                  <td className="py-1 text-right tabular-nums">{won(t.nightlyMedian)}</td>
                  <td className="py-1 text-right tabular-nums">{won(t.perPersonMedian)}</td>
                  <td className="py-1 text-right tabular-nums">{pct(t.rsvtRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </Section>
);
