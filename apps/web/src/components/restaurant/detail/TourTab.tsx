import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useRestaurantPublicTourStats } from '@repo/shared';
import type { RestaurantPublicDetailType, TourCountType, TourPlaceRefType } from '@repo/api-contract';
import { TourSourceNote } from '~/components/tour/TourSourceNote';
import { cn } from '~/lib/utils';

interface Props {
  placeId: string;
  detail: RestaurantPublicDetailType;
}

// "여행자" 탭 — AI 허브 여행로그(2023 제주 패널)에서 이 가게를 방문한 여행자 집계. 리뷰 AI 분석(분석 탭)과 다른 신호라
// teal 톤으로 구분한다. 전부 집계값이고 5명 미만 집단은 서버가 뺀다. 탭이 열릴 때만 조회(useRestaurantPublicTourStats).

const won = (v: number | null): string => (v === null ? '–' : v >= 10000 ? `${(v / 10000).toFixed(v % 10000 === 0 ? 0 : 1)}만원` : `${Math.round(v).toLocaleString('ko-KR')}원`);
const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–');
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'];

export const TourTab = ({ placeId, detail }: Props) => {
  const q = useRestaurantPublicTourStats(detail.tour ? placeId : null);
  if (!detail.tour) {
    return <div className="mx-4 my-6 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">이 가게와 연결된 여행로그 장소가 없습니다.</div>;
  }
  if (q.isPending) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> 여행자 통계 불러오는 중…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return <div className="mx-4 my-6 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">여행자 통계를 불러오지 못했습니다.</div>;
  }
  const s = q.data;
  const t = s.summary;
  const nSat = sum(s.satisfaction);
  const revisitTotal = s.revisit.first + s.revisit.again;
  const dayTotal = s.dayPosition.first + s.dayPosition.mid + s.dayPosition.last;

  return (
    <div className="space-y-6 p-4">
      <div className="rounded-md border border-teal-600/30 bg-teal-600/5 px-3 py-2 text-xs text-foreground">
        <b>{t.sampleLabel}</b> — 이 가게를 방문한 여행자 {t.nTravelers}명(방문 {t.nVisits}건)이 여행 직후 직접 입력한 만족도·체류·지출·이유를 집계했습니다. 개인별 기록은 표시하지 않고 5명 미만 구간은 숨깁니다.
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat value={t.bayesScore !== null ? t.bayesScore.toFixed(2) : '–'} unit="/5" label={`보정 만족도 · 평가 ${t.nRated}건`} />
        <Stat value={sum(s.recommend) > 0 ? (s.recommend.reduce((acc, n, i) => acc + n * (i + 1), 0) / sum(s.recommend)).toFixed(2) : '–'} unit="/5" label="추천 의향" />
        <Stat value={t.revisitRate !== null ? `${Math.round(t.revisitRate * 100)}%` : '–'} label={`재방문 방문${revisitTotal ? ` (${s.revisit.again}/${revisitTotal})` : ''}`} />
        <Stat value={t.stayMedian !== null ? `${t.stayMedian}` : '–'} unit="분" label="체류 중앙값" />
        <Stat value={won(t.spendPpMedian)} label={`1인당 지출 중앙${s.spend.n ? ` · 결제 ${s.spend.n}건` : ''}`} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section title="만족도 분포" hint={`1~5점 · ${nSat}건`}>
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-xs">
            {[5, 4, 3, 2, 1].map((k) => {
              const n = s.satisfaction[k - 1] ?? 0;
              return (
                <Bar key={k} label={`★ ${k}`} value={n} max={nSat} text={`${n} · ${pct(n, nSat)}`} labelClass="text-amber-600 dark:text-amber-400" />
              );
            })}
          </div>
        </Section>
        <Section title="방문 시간대" hint="도착 시각 기준">
          <HourChart hours={s.hours} />
          {sum(s.weekdays) > 0 && (
            <p className="text-[11px] text-muted-foreground">요일: {s.weekdays.map((n, i) => `${WEEKDAY[i]} ${n}`).join(' · ')}</p>
          )}
        </Section>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {s.reasons.length > 0 && (
          <Section title="왜 골랐나" hint="방문 이유">
            <CountBars items={s.reasons.map((r) => ({ ...r, label: shortReason(r.label) }))} total={sum(s.reasons.map((r) => r.n))} />
          </Section>
        )}
        {s.menuTerms.length > 0 && (
          <Section title="실제 주문한 메뉴" hint="취식 기록 어절 · 2건 이상">
            <Chips items={s.menuTerms} />
            <p className="text-[11px] text-muted-foreground">메뉴판이 아니라 여행자가 적은 주문 내역입니다.</p>
          </Section>
        )}
      </div>

      {(s.accompany.length > 0 || s.ages.length > 0) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {s.accompany.length > 0 && (
            <Section title="누구와 왔나" hint="동반 형태별 만족도 · 5명 이상만">
              <GroupTable items={s.accompany} />
            </Section>
          )}
          {s.ages.length > 0 && (
            <Section title="연령대" hint="5명 이상만">
              <GroupTable items={s.ages} />
            </Section>
          )}
        </div>
      )}

      {(dayTotal > 0 || s.stay.some((b) => b.n > 0) || s.months.length > 0) && (
        <Section title="여행 중 언제 오나" hint="첫날 · 중간 · 마지막 날">
          {dayTotal > 0 && (
            <>
              <div className="flex h-2.5 overflow-hidden rounded-full">
                <i className="block h-full bg-teal-600" style={{ width: `${(s.dayPosition.first / dayTotal) * 100}%` }} />
                <i className="block h-full bg-sky-500" style={{ width: `${(s.dayPosition.mid / dayTotal) * 100}%` }} />
                <i className="block h-full bg-violet-500" style={{ width: `${(s.dayPosition.last / dayTotal) * 100}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                첫날 {pct(s.dayPosition.first, dayTotal)} · 중간 {pct(s.dayPosition.mid, dayTotal)} · 마지막 날 {pct(s.dayPosition.last, dayTotal)}
                {s.months.length > 0 && ` · 월별 ${s.months.map((m) => `${m.label} ${m.n}`).join(' · ')}`}
              </p>
            </>
          )}
          {s.stay.some((b) => b.n > 0) && <p className="text-[11px] text-muted-foreground">체류: {s.stay.filter((b) => b.n > 0).map((b) => `${b.label} ${b.n}`).join(' · ')}</p>}
        </Section>
      )}

      {(s.prevPlaces.length > 0 || s.nextPlaces.length > 0 || s.togetherPlaces.length > 0) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {(s.prevPlaces.length > 0 || s.nextPlaces.length > 0) && (
            <Section title="바로 전·후에 간 곳" hint="3회 이상">
              {s.prevPlaces.length > 0 && <PlaceChips label="전" items={s.prevPlaces} />}
              {s.nextPlaces.length > 0 && <PlaceChips label="후" items={s.nextPlaces} />}
            </Section>
          )}
          {s.togetherPlaces.length > 0 && (
            <Section title="같은 여행에서 함께 간 곳" hint="여행자 5명 이상">
              <PlaceChips items={s.togetherPlaces} unit="명" />
            </Section>
          )}
        </div>
      )}

      {s.spend.n >= 3 && (
        <Section title="결제" hint={`활동 소비 ${s.spend.n}건`}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">건당 중앙값</dt>
            <dd>
              {won(s.spend.medianAmount)}
              {s.spend.avgPayNum !== null ? ` · 결제당 ${s.spend.avgPayNum}명` : ''}
            </dd>
            <dt className="text-muted-foreground">1인당 사분위</dt>
            <dd>
              {won(s.spend.q1Pp)} ~ {won(s.spend.q3Pp)}
            </dd>
            {s.spend.methods.length > 0 && (
              <>
                <dt className="text-muted-foreground">결제 수단</dt>
                <dd>{s.spend.methods.map((m) => `${m.label} ${m.n}`).join(' · ')}</dd>
              </>
            )}
          </dl>
        </Section>
      )}

      <TourSourceNote note={t.sourceNote} className="border-t pt-3" />
    </div>
  );
};

const shortReason = (r: string): string =>
  r
    .replace('온라인(SNS, 블로그 등) 평가가 좋아서', '온라인 평가가 좋아서')
    .replace('미디어(TV 정보 프로그램 등) 평가가 좋아서', '미디어 평가가 좋아서')
    .replace('가기 편해서/교통이 좋아서', '가기 편해서')
    .replace('지명도/명소/핫플레이스', '명소·핫플레이스');

const Stat = ({ value, unit, label }: { value: string; unit?: string; label: string }) => (
  <div className="rounded-md bg-muted px-2.5 py-2">
    <div className="text-base font-semibold tabular-nums leading-tight">
      {value}
      {unit && <span className="ml-0.5 text-[11px] font-medium text-muted-foreground">{unit}</span>}
    </div>
    <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
  </div>
);

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
    {children}
  </section>
);

const Bar = ({ label, value, max, text, labelClass }: { label: string; value: number; max: number; text: string; labelClass?: string }) => (
  <>
    <span className={cn('whitespace-nowrap', labelClass)}>{label}</span>
    <span className="h-2 overflow-hidden rounded-full bg-muted">
      <i className="block h-full rounded-full bg-teal-600" style={{ width: `${max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0}%` }} />
    </span>
    <span className="whitespace-nowrap tabular-nums text-muted-foreground">{text}</span>
  </>
);

const CountBars = ({ items, total }: { items: TourCountType[]; total: number }) => {
  const max = Math.max(...items.map((i) => i.n), 1);
  return (
    <div className="grid grid-cols-[minmax(0,11em)_1fr_auto] items-center gap-x-2 gap-y-1 text-xs">
      {items.map((it) => (
        <Bar key={it.label} label={it.label} value={it.n} max={max} text={`${it.n} · ${pct(it.n, total)}`} />
      ))}
    </div>
  );
};

const Chips = ({ items }: { items: TourCountType[] }) => (
  <div className="flex flex-wrap gap-1">
    {items.map((it) => (
      <span key={it.label} className="inline-flex items-center gap-1 rounded-md border border-teal-600/40 bg-teal-600/10 px-1.5 py-0.5 text-[11px] font-medium text-teal-800 dark:text-teal-300">
        {it.label} <span className="font-normal text-muted-foreground">{it.n}</span>
      </span>
    ))}
  </div>
);

const PlaceChips = ({ label, items, unit = '회' }: { label?: string; items: TourPlaceRefType[]; unit?: string }) => (
  <div className="flex flex-wrap items-center gap-1">
    {label && <span className="mr-1 text-[11px] text-muted-foreground">{label}</span>}
    {items.map((p) => {
      const body = (
        <>
          {p.name} <span className="font-normal text-muted-foreground">{p.typeShort} · {p.n}{unit}</span>
        </>
      );
      const cls = 'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]';
      return p.placeId ? (
        <Link key={`${p.name}-${p.placeId}`} to={`/restaurants-v2/${p.placeId}`} className={cn(cls, 'border-teal-600/40 bg-teal-600/5 hover:bg-teal-600/10')}>
          {body}
        </Link>
      ) : (
        <span key={p.name} className={cls}>
          {body}
        </span>
      );
    })}
  </div>
);

const GroupTable = ({ items }: { items: Array<{ label: string; n: number; mean: number | null }> }) => (
  <table className="w-full text-xs">
    <thead>
      <tr className="text-left text-[11px] text-muted-foreground">
        <th className="py-1 font-medium">구분</th>
        <th className="py-1 text-right font-medium">방문</th>
        <th className="py-1 text-right font-medium">만족도</th>
      </tr>
    </thead>
    <tbody>
      {items.map((g) => (
        <tr key={g.label} className="border-t">
          <td className="py-1">{g.label.replace('(가족 외)', '').replace('(친척 포함)', '')}</td>
          <td className="py-1 text-right tabular-nums">{g.n}</td>
          <td className="py-1 text-right tabular-nums">{g.mean !== null ? g.mean.toFixed(2) : '–'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

// 6~23시 막대 — 최다 시간대 강조. SVG 텍스트는 테마 토큰 색.
const HourChart = ({ hours }: { hours: number[] }) => {
  const hs = Array.from({ length: 18 }, (_, i) => ({ h: i + 6, n: hours[i + 6] ?? 0 }));
  const max = Math.max(...hs.map((x) => x.n), 1);
  const W = 360;
  const H = 110;
  const top = 14;
  const bottom = 20;
  const bw = W / hs.length;
  const peak = hs.reduce((a, b) => (b.n > a.n ? b : a), hs[0]!);
  if (max === 1 && sum(hours) === 0) return <p className="text-xs text-muted-foreground">시간대 기록이 없습니다.</p>;
  const px = Math.min(W - 30, Math.max(30, hs.indexOf(peak) * bw + bw / 2));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="시간대별 방문 건수" className="w-full">
      {hs.map((x, i) => {
        const bh = ((H - top - bottom) * x.n) / max;
        return <rect key={x.h} x={(i * bw + 2).toFixed(1)} y={(H - bottom - bh).toFixed(1)} width={(bw - 4).toFixed(1)} height={bh.toFixed(1)} rx={2} className={x.h === peak.h ? 'fill-teal-700 dark:fill-teal-300' : 'fill-teal-600/70'} />;
      })}
      <line x1={0} x2={W} y1={H - bottom} y2={H - bottom} className="stroke-border" />
      {hs
        .filter((x) => x.h % 3 === 0)
        .map((x) => (
          <text key={x.h} x={(hs.indexOf(x) * bw + bw / 2).toFixed(1)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {x.h}시
          </text>
        ))}
      <text x={px.toFixed(1)} y={top - 3} textAnchor="middle" className="fill-teal-700 text-[10px] font-semibold dark:fill-teal-300">
        {peak.h}시 {peak.n}건
      </text>
    </svg>
  );
};
