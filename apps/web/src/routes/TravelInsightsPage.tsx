import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Route as RouteIcon } from 'lucide-react';
import { useTourInsights, useTourLodging, useTourRegions, type TourInsightsParams } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { TourFilterBar } from '~/components/tour/TourFilterBar';
import { TourLodgingSection } from '~/components/tour/TourLodgingSection';
import { TourRegionSection } from '~/components/tour/TourRegionSection';
import { TourSourceNote } from '~/components/tour/TourSourceNote';
import { BarList, HeatGrid, HourLines, KindDot, Section, SeqChips, StackBar, Stat } from '~/components/tour/charts';
import { shortAccompany, won } from '~/components/tour/tourFormat';

// 제주 여행 인사이트 — AI 허브 여행로그(2023 제주 패널)를 필터(연령·성별·동반·월·박수)로 잘라 집계만 보여주는 공개 페이지.
// 필터는 URL 쿼리에 실어 링크로 공유된다(tour-c 의 "URL 이 상태" 원칙). 표본 20건 미만이면 서버가 insufficient 를 주고
// 5명 미만 셀은 서버가 이미 뺐다. 지역 비교·숙소(6차)는 같은 필터로 따로 받는다. docs/PLAN-tour-log.md 5~6차.

const HEAT_TYPES = ['식당', '숙소', '자연', '상업', '교통', '상점'];
const SPEND_CLASS: Record<string, string> = { 활동: 'bg-teal-600', 이동: 'bg-zinc-400', 숙박: 'bg-violet-500', 사전: 'bg-amber-500' };

const readParams = (sp: URLSearchParams): TourInsightsParams => {
  const num = (k: string) => (sp.get(k) !== null && sp.get(k) !== '' ? Number(sp.get(k)) : undefined);
  const ageGrp = sp.get('ageGrp');
  const gender = sp.get('gender');
  return {
    region: sp.get('region') === 'all' ? 'all' : 'jeju',
    ageGrp: ageGrp === '20' || ageGrp === '30' || ageGrp === '40' || ageGrp === '50' || ageGrp === '60' ? ageGrp : undefined,
    gender: gender === '남' || gender === '여' ? gender : undefined,
    accompany: sp.get('accompany') ?? undefined,
    month: num('month'),
    nights: num('nights'),
  };
};

export const TravelInsightsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readParams(searchParams);
  const q = useTourInsights(params);
  const regions = useTourRegions(params);
  const lodging = useTourLodging(params);
  const onChange = useCallback(
    (next: TourInsightsParams) => {
      const sp = new URLSearchParams();
      if (next.region && next.region !== 'jeju') sp.set('region', next.region);
      if (next.ageGrp) sp.set('ageGrp', next.ageGrp);
      if (next.gender) sp.set('gender', next.gender);
      if (next.accompany) sp.set('accompany', next.accompany);
      if (next.month !== undefined) sp.set('month', String(next.month));
      if (next.nights !== undefined) sp.set('nights', String(next.nights));
      setSearchParams(sp, { replace: true });
    },
    [setSearchParams],
  );
  const d = q.data;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">제주 여행 인사이트 2023</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                2023년 4~9월 제주를 다녀간 여행자 표본이 언제·어디서·무엇을 하며 얼마를 썼는지 — 전부 집계값이고 5명 미만 구간은 숨깁니다.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/travel/plan">
                <RouteIcon className="size-4" /> 코스 추천
              </Link>
            </Button>
          </div>
          <TourFilterBar value={params} onChange={onChange} />
        </header>

        {q.isPending && (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> 집계 불러오는 중…
          </div>
        )}
        {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

        {d && (
          <div className={q.isPlaceholderData ? 'opacity-60' : undefined}>
            {d.insufficient && (
              <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                조건에 맞는 여행이 {d.scale.trips}건뿐입니다(20건 미만). 5명 미만 구간이 많이 숨겨지니 조건을 줄여 보세요.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat value={d.scale.trips.toLocaleString('ko-KR')} label="여행" />
              <Stat value={d.scale.visits.toLocaleString('ko-KR')} label="공개 방문 기록" />
              <Stat value={d.scale.places.toLocaleString('ko-KR')} label={`장소 · 식당 ${d.scale.restaurants.toLocaleString('ko-KR')}`} />
              <Stat value={won(d.scale.spendMedian)} label="여행당 지출 중앙값" />
              <Stat value={d.tripSpend ? won(d.tripSpend.p90) : '–'} label="지출 상위 10%" />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Section title="몇 박" hint="실제 방문일 기준">
                {d.nights.length ? <BarList items={d.nights} /> : <Empty />}
              </Section>
              <Section title="언제 떠났나" hint="여행 시작 월">
                {d.months.length ? <BarList items={d.months} /> : <Empty />}
              </Section>
              <Section title="누구와" hint="동반 형태 · 평균 만족도">
                {d.accompany.length ? (
                  <BarList items={d.accompany.map((a) => ({ label: shortAccompany(a.label), n: a.n, text: `${a.n} · ${a.mean !== null ? a.mean.toFixed(2) : '–'}` }))} />
                ) : (
                  <Empty />
                )}
              </Section>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Section title="하루 중 언제 무엇을" hint="도착 시각 × 장소 유형">
                <HourLines series={d.hourType} />
              </Section>
              <Section title="유형별 만족도와 체류" hint="방문 5건 이상">
                {d.typeSat.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[11px] text-muted-foreground">
                          <th className="py-1 font-medium">유형</th>
                          <th className="py-1 text-right font-medium">방문</th>
                          <th className="py-1 text-right font-medium">만족도</th>
                          <th className="py-1 text-right font-medium">체류 중앙</th>
                          <th className="py-1 text-right font-medium">1인 지출</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.typeSat.slice(0, 10).map((t) => (
                          <tr key={t.type} className="border-t">
                            <td className="py-1">
                              <KindDot kind={t.type} className="mr-1.5" />
                              {t.type}
                            </td>
                            <td className="py-1 text-right tabular-nums">{t.n.toLocaleString('ko-KR')}</td>
                            <td className="py-1 text-right tabular-nums">{t.mean !== null ? t.mean.toFixed(2) : '–'}</td>
                            <td className="py-1 text-right tabular-nums">{t.stayMedian !== null ? `${t.stayMedian}분` : '–'}</td>
                            <td className="py-1 text-right tabular-nums">{won(t.spendPpMedian)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty />
                )}
              </Section>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Section title="어디서 어디로" hint="연속 방문 유형 전이 · 5건 이상">
                {d.transitions.length ? (
                  <HeatGrid types={HEAT_TYPES} valueOf={(f, t) => d.transitions.find((x) => x.from === f && x.to === t)?.n} />
                ) : (
                  <Empty />
                )}
              </Section>
              <Section title="흔한 하루 코스" hint="3~7곳 방문한 날 · 유형 순서">
                {d.templates.length ? (
                  <ul className="space-y-1.5">
                    {d.templates.slice(0, 8).map((t) => (
                      <li key={t.label} className="flex items-center justify-between gap-2">
                        <SeqChips seq={t.label} />
                        <span className="text-xs tabular-nums text-muted-foreground">{t.n}일</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty />
                )}
              </Section>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Section title="누가 여행했나" hint="연령 × 성별 · 여행 수">
                {d.ageGender.length ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {d.ageGender.map((x) => (
                      <span key={`${x.ageGrp}-${x.gender}`} className="rounded-md bg-muted px-2 py-1 tabular-nums">
                        {x.ageGrp}대 {x.gender} <b>{x.n.toLocaleString('ko-KR')}</b>
                      </span>
                    ))}
                  </div>
                ) : (
                  <Empty />
                )}
              </Section>
              <Section title="장소를 고른 이유" hint="전체 방문">
                {d.reasons.length ? <BarList items={d.reasons.map((r) => ({ label: shortReason(r.label), n: r.n }))} /> : <Empty />}
              </Section>
              <Section title="무엇에 썼나" hint="여행당 합계 · 1인당 아님">
                {d.spendComposition.length ? (
                  <>
                    <StackBar parts={d.spendComposition.map((c) => ({ label: c.category, value: c.total, className: SPEND_CLASS[c.category] ?? 'bg-zinc-400' }))} />
                    {d.tripSpend && (
                      <p className="text-[11px] text-muted-foreground">
                        여행당: 하위 10% {won(d.tripSpend.p10)} · 중앙 {won(d.tripSpend.median)} · 상위 10% {won(d.tripSpend.p90)}
                      </p>
                    )}
                  </>
                ) : (
                  <Empty />
                )}
              </Section>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Section title="어떻게 움직였나" hint="이동수단 · 이동시간 중앙">
                {d.mvmn.length ? (
                  <BarList items={d.mvmn.map((m) => ({ label: m.label.replace(/\(.*\)/, ''), n: m.n, text: `${m.n.toLocaleString('ko-KR')}${m.medianMin !== null ? ` · ${m.medianMin}분` : ''}` }))} />
                ) : (
                  <Empty />
                )}
              </Section>
              <Section title="공항 다음 첫 목적지" hint="5건 이상">
                {d.airportNext.length ? (
                  <BarList
                    items={d.airportNext.map((p) => ({ label: p.name, n: p.n }))}
                  />
                ) : (
                  <Empty />
                )}
                {d.airportNext.some((p) => p.placeId) && (
                  <p className="text-[11px] text-muted-foreground">
                    등록 맛집:{' '}
                    {d.airportNext
                      .filter((p) => p.placeId)
                      .map((p) => (
                        <Link key={p.placeId} to={`/restaurants-v2/${p.placeId}`} className="mr-2 underline">
                          {p.name}
                        </Link>
                      ))}
                  </p>
                )}
              </Section>
              <Section title="어디서 왔나" hint="거주 시도">
                {d.residence.length ? <BarList items={d.residence.map((r) => ({ label: r.label.replace('특별자치도', '').replace('특별시', '').replace('광역시', ''), n: r.n }))} /> : <Empty />}
              </Section>
            </div>

            <TourRegionSection data={regions.data} loading={regions.isPending} className="mt-4" />
            <TourLodgingSection data={lodging.data} loading={lodging.isPending} className="mt-4" />

            <TourSourceNote note={d.sourceNote} className="mt-6 border-t pt-3" />
          </div>
        )}
      </div>
    </div>
  );
};

const Empty = () => <p className="text-xs text-muted-foreground">표본이 부족해 숨겼습니다(5건 미만).</p>;

const shortReason = (r: string): string =>
  r
    .replace('온라인(SNS, 블로그 등) 평가가 좋아서', '온라인 평가')
    .replace('미디어(TV 정보 프로그램 등) 평가가 좋아서', '미디어 평가')
    .replace('가기 편해서/교통이 좋아서', '가기 편해서')
    .replace('지명도/명소/핫플레이스', '명소·핫플')
    .replace('편의시설/서비스가 좋아서', '편의시설·서비스');
