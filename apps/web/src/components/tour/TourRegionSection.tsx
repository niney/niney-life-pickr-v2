import { Loader2 } from 'lucide-react';
import type { TourRegionGroupType, TourRegionsResultType } from '@repo/api-contract';
import { cn } from '~/lib/utils';
import { KindDot, Section } from './charts';
import { won } from './tourFormat';

// 지역 비교(6차) — 제주시·서귀포시·부속섬 3집단 카드(방문 비중·만족도·식당·체류·1인 지출·유형·읍면동) + 읍면동 표(방문
// 5건 이상). 필터는 인사이트 바와 같은 축(서버가 region 은 제주로 고정).

const GROUP_BAR: Record<TourRegionGroupType['key'], string> = { 'jeju-si': 'bg-teal-600', seogwipo: 'bg-sky-500', island: 'bg-amber-500' };

const GroupCard = ({ g }: { g: TourRegionGroupType }) => (
  <div className="rounded-md border p-3" data-testid={`tour-region-${g.key}`}>
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold">{g.label}</h3>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        여행 {g.trips.toLocaleString('ko-KR')} · 방문 {g.visits.toLocaleString('ko-KR')}
      </span>
    </div>
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
      <i className={cn('block h-full', GROUP_BAR[g.key])} style={{ width: `${Math.round(g.share * 100)}%` }} />
    </div>
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      <Row k="방문 비중" v={`${Math.round(g.share * 100)}%`} />
      <Row k="만족도" v={g.mean !== null ? g.mean.toFixed(2) : '–'} />
      <Row k="식당 방문" v={`${g.restaurants.toLocaleString('ko-KR')}${g.restaurantMean !== null ? ` · ${g.restaurantMean.toFixed(2)}` : ''}`} />
      <Row k="체류 중앙" v={g.stayMedian !== null ? `${Math.round(g.stayMedian)}분` : '–'} />
      <Row k="1인 지출 중앙" v={won(g.spendPpMedian)} />
    </dl>
    {g.topTypes.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-1">
        {g.topTypes.map((t) => (
          <span key={t.label} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
            <KindDot kind={t.label} />
            {t.label} {t.n.toLocaleString('ko-KR')}
          </span>
        ))}
      </div>
    )}
    {g.topEmd.length > 0 && <p className="mt-1.5 text-[11px] text-muted-foreground">많이 간 곳 · {g.topEmd.map((e) => `${e.label} ${e.n}`).join(' · ')}</p>}
  </div>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <>
    <dt className="text-muted-foreground">{k}</dt>
    <dd className="text-right tabular-nums">{v}</dd>
  </>
);

export const TourRegionSection = ({ data, loading, className }: { data: TourRegionsResultType | undefined; loading: boolean; className?: string }) => (
  <Section title="지역 비교" hint="제주시 · 서귀포시 · 부속섬(우도·마라도 등) · 읍면동" className={className}>
    {loading && !data ? (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> 지역 비교 불러오는 중…
      </p>
    ) : !data || data.groups.length === 0 ? (
      <p className="text-xs text-muted-foreground">표본이 부족해 숨겼습니다(5건 미만).</p>
    ) : (
      <>
        <div className="grid gap-3 md:grid-cols-3">
          {data.groups.map((g) => (
            <GroupCard key={g.key} g={g} />
          ))}
        </div>
        {data.emd.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="tour-region-emd">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="py-1 font-medium">읍면동</th>
                  <th className="py-1 text-right font-medium">방문</th>
                  <th className="py-1 text-right font-medium">만족도</th>
                  <th className="py-1 text-right font-medium">식당</th>
                  <th className="py-1 text-right font-medium">체류</th>
                  <th className="py-1 text-right font-medium">1인 지출</th>
                </tr>
              </thead>
              <tbody>
                {data.emd.map((e) => (
                  <tr key={`${e.sigungu}-${e.emd}-${e.island}`} className="border-t">
                    <td className="py-1">
                      {e.island ? '부속섬 ' : e.sigungu === '서귀포시' ? '서귀포 ' : ''}
                      {e.emd}
                    </td>
                    <td className="py-1 text-right tabular-nums">{e.n.toLocaleString('ko-KR')}</td>
                    <td className="py-1 text-right tabular-nums">{e.mean !== null ? e.mean.toFixed(2) : '–'}</td>
                    <td className="py-1 text-right tabular-nums">{e.restaurants.toLocaleString('ko-KR')}</td>
                    <td className="py-1 text-right tabular-nums">{e.stayMedian !== null ? `${Math.round(e.stayMedian)}분` : '–'}</td>
                    <td className="py-1 text-right tabular-nums">{won(e.spendPpMedian)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    )}
  </Section>
);
