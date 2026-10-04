import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Loader2, Pin, Vote, X } from 'lucide-react';
import { mergeDailyRows, useTourPlan, useWeatherForecast, useWeatherMid, type TourInsightsParams } from '@repo/shared';
import type { TourPlanBodyType, TourPlanPlaceKeyType, TourPlanPlaceType, TourPlanResultType, TourPlanStopType, VoteOptionInputType } from '@repo/api-contract';
import {
  TOUR_ITINERARY_MAX_DAYS,
  TOUR_ITINERARY_REGIONS,
  isTourItineraryRegion,
  isTourRegionKey,
  kmaConditionIsWet,
  latLngToKmaGrid,
  todayKst,
  tourItineraryDays,
  weatherMidRegionForPlace,
  weatherPlaceById,
  weatherPlaceLabel,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { TourFilterBar } from '~/components/tour/TourFilterBar';
import { TourItinerary, TourMapLink } from '~/components/tour/TourItinerary';
import { TourPlanOptions } from '~/components/tour/TourPlanOptions';
import { TourSourceNote } from '~/components/tour/TourSourceNote';
import { KindDot, Section, SeqChips } from '~/components/tour/charts';
import {
  DEFAULT_TOUR_PLAN_OPTIONS,
  TOUR_PLAN_AVOID_MAX,
  TOUR_PLAN_MUST_MAX,
  TOUR_WET_POP,
  addDaysYmd,
  durationLabel,
  nightsLabel,
  sameTourPlace,
  shortAccompany,
  tourPlaceKey,
  tourRegionLabel,
  tripLengthLabel,
  won,
  type TourDayWeather,
  type TourPlanOptionsValue,
} from '~/components/tour/tourFormat';
import { cn } from '~/lib/utils';

// 코스 추천 — "나와 비슷한 여행자(연령·성별·동반·박수·월)가 만족한 곳" 을 여행로그에서 고른다. 서버가 비슷한 여행을 세그먼트
// 일치로 찾고(20건 미만이면 month→gender→nights→ageGrp 순으로 풀며 알려줌), 장소는 지역 표본 전체에서 5건 이상인 곳을
// (보정 만족도 − 3.3) × √여행 수 × 비슷한 여행자 선호로 줄 세운다. 지역을 고르면('전체' 제외) 일정표(일차·시각·이동)까지 합성해
// 준다(10차 제주 → 13차 전 지역). 제주 밖의 넓은 지역은 일정 전체를 거점 동네 주변에서 짜고(itinerary.base), 숙소 동네를
// 고르면 그곳이 거점이 된다.
// 등록된 맛집(placeId)은 상세로 이어지고, 2곳 이상 고르면 그룹투표 후보로 넘긴다(/vote/new state 프리필).
//
// 11차 — 일정 옵션(속도·취향·이동수단)은 폼에서, 일정 편집(숙소 동네·꼭 갈 곳·뺄 곳)은 결과를 본 뒤 고른다. 편집은 고르는
// 즉시 지금 폼의 조건으로 다시 짠다. 다시 짜는 동안에도 앞 결과를 보여 준다(shown) — 뮤테이션은 새로 부르면 data 를 비운다.
//
// 12차 — 출발일을 넣으면 일차마다 날짜를 붙이고, 예보 지점의 열흘 예보(날씨 화면과 같은 훅·병합)에서 비 오는 날을 골라
// 일차 번호(wetDays)로 보낸다. 서버는 예보를 부르지 않는다. 예보 지점은 제주는 미리 정해져 있고(제주시), 그 밖의 지역은 일정의
// 거점에 따라 달라 서버가 응답(itinerary.weatherPlaceId)으로 알려 준다 — 그래서 첫 결과에는 날짜·예보만 붙고, 비 예보는 다음에
// 찾을 때(다시 찾기·일정 편집)부터 반영된다.

const LADDER_LABEL: Record<string, string> = { month: '월', gender: '성별', nights: '박수', ageGrp: '연령' };

interface PlanEdits {
  stayArea: string | null;
  must: TourPlanPlaceKeyType[];
  avoid: TourPlanPlaceKeyType[];
}
const NO_EDITS: PlanEdits = { stayArea: null, must: [], avoid: [] };

const EditChip = ({ label, tone, onRemove, disabled }: { label: string; tone: 'must' | 'avoid'; onRemove: () => void; disabled: boolean }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', tone === 'must' ? 'border-teal-600/40 bg-teal-600/10 text-teal-800 dark:text-teal-300' : 'text-muted-foreground')}>
    {tone === 'must' ? <Pin className="size-3" aria-hidden /> : <span className="text-[10px]">뺌</span>}
    <span className={cn(tone === 'avoid' && 'line-through')}>{label}</span>
    <button type="button" disabled={disabled} onClick={onRemove} aria-label={`${label} ${tone === 'must' ? '꼭 갈 곳에서' : '뺀 곳에서'} 되돌리기`} className="rounded-full hover:text-foreground disabled:opacity-40">
      <X className="size-3" />
    </button>
  </span>
);

export const TravelPlanPage = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TourInsightsParams>({ region: 'jeju', ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 });
  const [options, setOptions] = useState<TourPlanOptionsValue>(DEFAULT_TOUR_PLAN_OPTIONS);
  const [edits, setEdits] = useState<PlanEdits>(NO_EDITS);
  const [onlyRestaurants, setOnlyRestaurants] = useState(false);
  const [picked, setPicked] = useState<Record<string, TourPlanPlaceType>>({});
  const [shown, setShown] = useState<{ r: TourPlanResultType; asked: Partial<TourPlanBodyType>; startDate: string | null } | null>(null);
  const plan = useTourPlan();
  const busy = plan.isPending;

  const region = isTourRegionKey(filters.region) ? filters.region : 'jeju';
  const formItineraryRegion = isTourItineraryRegion(region);

  // 예보 — 출발일을 넣었을 때만. 지점은 지금 보이는 일정이 이 지역 것이면 그 일정의 예보 지점(거점 기준), 아니면 지역에 정해 둔
  // 지점(제주 = 제주시. 그 밖의 지역은 일정을 한 번 만들어야 정해진다). 단기(오늘~+3일) + 중기(+4~+10일).
  const today = todayKst();
  const startDate = formItineraryRegion ? options.startDate : null;
  const shownHere = shown !== null && shown.asked.region === region;
  const wxPlace = weatherPlaceById((shownHere ? shown.r.itinerary?.weatherPlaceId : null) ?? TOUR_ITINERARY_REGIONS[region]?.weatherPlaceId);
  const wxGrid = startDate && wxPlace ? latLngToKmaGrid(wxPlace.lat, wxPlace.lng) : null;
  const wxMid = startDate ? weatherMidRegionForPlace(wxPlace) : null;
  const forecast = useWeatherForecast(wxGrid?.nx ?? null, wxGrid?.ny ?? null);
  const mid = useWeatherMid(wxMid?.land.regId ?? null, wxMid && wxPlace ? wxPlace.taRegId : null, wxMid?.stnId);
  const wxRows = useMemo(() => (startDate ? mergeDailyRows(forecast.data?.days ?? [], mid.data ?? null) : []), [startDate, forecast.data, mid.data]);
  // 출발일 기준 일차별 날짜·예보(0부터). 예보가 닿지 않는 날은 날짜만.
  const dayWeather = (start: string, i: number): TourDayWeather => {
    const date = addDaysYmd(start, i);
    const row = wxRows.find((x) => x.date === date);
    const halves = row ? [row.am, row.pm, row.all].filter((h): h is NonNullable<typeof h> => h !== null) : [];
    if (halves.length === 0) return { date, forecast: null, wet: false };
    const rainy = halves.find((h) => kmaConditionIsWet(h.condition));
    const pops = halves.map((h) => h.pop).filter((v): v is number => v !== null);
    const pop = pops.length > 0 ? Math.max(...pops) : null;
    return { date, forecast: `${(rainy ?? halves[halves.length - 1]!).label}${pop !== null ? ` ${pop}%` : ''}`, wet: Boolean(rainy) || (pop ?? 0) >= TOUR_WET_POP };
  };
  const formDays = tourItineraryDays(filters.nights ?? 2);
  const formWeather = startDate ? Array.from({ length: formDays }, (_, i) => dayWeather(startDate, i)) : [];
  const dateHint = !startDate
    ? '넣으면 일정에 날짜를 붙이고, 열흘 안이면 비 오는 날을 실내 위주로 짭니다'
    : !wxPlace
      ? '일정을 만들면 그 동네 예보를 붙입니다 — 비 예보가 있으면 다시 찾을 때 실내 위주로 짭니다'
      : forecast.isLoading || mid.isLoading
        ? '예보 불러오는 중…'
        : formWeather.every((w) => w.forecast === null)
          ? forecast.isError || mid.isError
            ? '예보를 불러오지 못했습니다 — 날짜만 붙입니다'
            : '예보는 열흘 뒤까지만 나옵니다 — 날짜만 붙입니다'
          : `${weatherPlaceLabel(wxPlace)} 기준 예보 반영 · 비 예보 ${formWeather.filter((w) => w.wet).length}일`;

  // 요청 본문 — 옵션은 기본값이 아닐 때만 싣는다. 속도·이동수단·일정 편집은 일정표를 만드는 지역에서만 뜻이 있다.
  const run = (e: PlanEdits) => {
    const body: Partial<TourPlanBodyType> = {
      region,
      ageGrp: filters.ageGrp,
      gender: filters.gender,
      accompany: filters.accompany,
      month: filters.month,
      nights: filters.nights,
      ...(options.focus.length > 0 ? { focus: options.focus } : {}),
      ...(formItineraryRegion && options.pace !== 'normal' ? { pace: options.pace } : {}),
      ...(formItineraryRegion && options.transport !== 'car' ? { transport: options.transport } : {}),
      ...(formItineraryRegion && e.stayArea ? { stayArea: e.stayArea } : {}),
      ...(formItineraryRegion && e.must.length > 0 ? { must: e.must } : {}),
      ...(formItineraryRegion && e.avoid.length > 0 ? { avoid: e.avoid } : {}),
    };
    // 비 오는 일차 — 박수를 안 골랐으면 서버가 일수를 정하므로 최대 일수까지 보고 보낸다(일정 밖 번호는 서버가 무시).
    const wetDays = startDate ? Array.from({ length: TOUR_ITINERARY_MAX_DAYS }, (_, i) => i).filter((i) => dayWeather(startDate, i).wet).map((i) => i + 1) : [];
    if (wetDays.length > 0) body.wetDays = wetDays;
    plan.mutate(body, { onSuccess: (data) => setShown({ r: data, asked: body, startDate }) });
  };

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    setPicked({});
    // 숙소 동네·꼭 갈 곳·뺄 곳은 그 지역의 것 — 지역을 바꿔 찾으면 비운다.
    const keep = shown && shown.asked.region === region ? edits : NO_EDITS;
    setEdits(keep);
    run(keep);
  };
  const applyEdits = (next: PlanEdits) => {
    setEdits(next);
    run(next);
  };
  const isPinned = (p: { name: string; emd?: string | null }) => edits.must.some((m) => sameTourPlace(m, p));
  const togglePin = (p: TourPlanPlaceType) => {
    const key = tourPlaceKey(p);
    const on = isPinned(p);
    if (!on && edits.must.length >= TOUR_PLAN_MUST_MAX) return;
    applyEdits({ ...edits, must: on ? edits.must.filter((m) => !sameTourPlace(m, key)) : [...edits.must, key], avoid: edits.avoid.filter((a) => !sameTourPlace(a, key)) });
  };
  const avoidStop = (s: TourPlanStopType) => {
    const key = tourPlaceKey(s);
    if (edits.avoid.length >= TOUR_PLAN_AVOID_MAX) return;
    applyEdits({ ...edits, must: edits.must.filter((m) => !sameTourPlace(m, key)), avoid: [...edits.avoid.filter((a) => !sameTourPlace(a, key)), key] });
  };

  const r = shown?.r;
  // 결과 표시는 "물어본 조건" 기준 — 폼을 고치는 중에도 결과의 지역·박수 라벨이 따라 바뀌지 않게.
  const asked = shown?.asked;
  const askedRegion = asked?.region ?? 'jeju';
  const itineraryRegion = isTourItineraryRegion(askedRegion);
  const wantedDays = asked?.nights !== undefined ? tourItineraryDays(asked.nights) : null;
  // 일차별 날짜·예보 — 일정이 바란 일수보다 짧으면(가운데 날이 빠졌을 수 있다) 날짜가 어긋나므로 붙이지 않는다. 폼의 지역을 바꿔
  // 놓았으면(지금 불러온 예보가 다른 지역 것) 날짜만 붙인다.
  const shownWeather =
    shown?.startDate && r?.itinerary && (wantedDays === null || r.itinerary.days.length === wantedDays)
      ? r.itinerary.days.map((_, i): TourDayWeather => (shownHere ? dayWeather(shown.startDate!, i) : { date: addDaysYmd(shown.startDate!, i), forecast: null, wet: false }))
      : undefined;
  const places = r ? r.places.filter((p) => !onlyRestaurants || p.kind === '식당') : [];
  const maxScore = Math.max(1, ...places.map((p) => p.score));
  const pickedList = Object.values(picked);
  const togglePick = (p: TourPlanPlaceType) => {
    if (!p.placeId) return;
    setPicked((prev) => {
      const next = { ...prev };
      if (next[p.placeId!]) delete next[p.placeId!];
      else if (Object.keys(next).length < 8) next[p.placeId!] = p;
      return next;
    });
  };
  const toVote = () => {
    const voteOptions: VoteOptionInputType[] = pickedList.map((p) => ({ placeId: p.placeId!, name: p.name, category: p.kind, thumbnailUrl: null }));
    navigate('/vote/new', { state: { presetTitle: `${tourRegionLabel(askedRegion)}에서 뭐 먹지?`, presetOptions: voteOptions } });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">코스 추천</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              2023년 {tourRegionLabel(filters.region)} 여행자 표본에서 나와 비슷한 사람들이 만족한 곳을 골라 드립니다.
              {formItineraryRegion ? ' 박수를 고르면 하루 흐름대로 일정표도 짜 드립니다.' : ' 지역을 고르면 일정표도 짜 드립니다.'} 개별 여행자는 보이지 않고 5명 미만 장소는 빠집니다.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/travel/jeju">
              <BarChart3 className="size-4" /> 인사이트
            </Link>
          </Button>
        </header>

        <form onSubmit={onSubmit} className="space-y-3">
          <TourFilterBar value={filters} onChange={setFilters} />
          <TourPlanOptions value={options} onChange={setOptions} itinerary={formItineraryRegion} minDate={today} dateHint={dateHint} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy} className="bg-teal-600 text-white hover:bg-teal-700">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              비슷한 여행 찾기
            </Button>
            <span className="text-xs text-muted-foreground">추천 점수 = (보정 만족도 − 3.3) × √여행 수 × 비슷한 여행자 선호 × 취향</span>
          </div>
        </form>

        {plan.isError && <p className="text-sm text-destructive">{(plan.error as Error).message}</p>}

        {/* 조건 탓이 아니라 이 서버에 그 지역 여행로그가 없는 경우(미적재) — "표본이 적어 조건을 풀었다" 고 하면 조건을 바꿔 보게 만든다.
            빈 일정표·빈 목록도 내지 않고 이 안내만 보인다. */}
        {r && r.regionTrips === 0 && (
          <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            지금 이 서버에는 <b>{tourRegionLabel(askedRegion)}</b> 여행로그 데이터가 없어 추천을 만들 수 없습니다. 조건을 바꿔도 결과는 같습니다.
          </div>
        )}

        {r && r.regionTrips > 0 && (
          <>
            <div className={cn('rounded-md border px-3 py-2 text-xs', r.insufficient ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'border-teal-600/30 bg-teal-600/5')}>
              같은 조건의 여행 <b>{r.matchedTrips}건</b>
              {r.relaxed.length > 0 && <> — 표본이 적어 {r.relaxed.map((k) => LADDER_LABEL[k] ?? k).join(' · ')} 조건은 풀었습니다</>}
              {r.insufficient && ' · 그래도 20건 미만이라 참고만 하세요'}
            </div>

            {itineraryRegion && (r.itinerary || r.areas.length > 0) ? (
              <Section
                title="추천 일정"
                hint={r.itinerary ? `${tourRegionLabel(askedRegion)} · ${tripLengthLabel(r.itinerary.days.length)}${r.itinerary.transport === 'transit' ? ' · 대중교통' : ''}` : tourRegionLabel(askedRegion)}
              >
                {/* 거점(13차) — 넓은 지역은 한 동네 주변에서 짠다. 숙소 동네를 고르면 그곳이 거점이라 따로 알리지 않는다. */}
                {r.itinerary?.base && !r.itinerary.stayArea && (
                  <p className="text-xs text-muted-foreground">
                    <b className="font-medium text-foreground">{r.itinerary.base}</b> 주변에서 짰습니다 — {tourRegionLabel(askedRegion)}에서 이 조건으로 가장 알차게 채워지는 동네입니다. 다른 곳을
                    중심으로 보려면 숙소 동네를 고르거나 꼭 갈 곳을 넣으세요.
                  </p>
                )}
                {/* 일정 편집 — 숙소 동네·꼭 갈 곳·뺀 곳. 바꾸면 바로 다시 짠다. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  {r.areas.length > 0 && (
                    <label className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">숙소 동네</span>
                      <select
                        value={edits.stayArea ?? ''}
                        disabled={busy}
                        onChange={(ev) => applyEdits({ ...edits, stayArea: ev.target.value || null })}
                        className="max-w-[14rem] rounded-md border bg-background px-2 py-1 text-xs"
                      >
                        <option value="">정하지 않음</option>
                        {r.areas.map((a) => (
                          <option key={a.label} value={a.label}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {edits.must.map((m) => (
                    <EditChip key={`must-${m.name}-${m.emd ?? ''}`} label={m.name} tone="must" disabled={busy} onRemove={() => applyEdits({ ...edits, must: edits.must.filter((x) => !sameTourPlace(x, m)) })} />
                  ))}
                  {edits.avoid.map((a) => (
                    <EditChip key={`avoid-${a.name}-${a.emd ?? ''}`} label={a.name} tone="avoid" disabled={busy} onRemove={() => applyEdits({ ...edits, avoid: edits.avoid.filter((x) => !sameTourPlace(x, a)) })} />
                  ))}
                  {edits.must.length === 0 && edits.avoid.length === 0 && <span className="text-muted-foreground">아래 목록의 핀으로 꼭 갈 곳을 넣고, 일정의 ×로 장소를 뺄 수 있어요</span>}
                </div>
                {r.itinerary ? (
                  <>
                    {r.itinerary.unplaced.length > 0 && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        일정에 넣지 못한 곳: {r.itinerary.unplaced.join(', ')} — 배를 타야 하는 섬이거나 위치 정보가 없거나, 날이 모자랍니다.
                      </p>
                    )}
                    {wantedDays !== null && r.itinerary.days.length < wantedDays && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        후보가 모자라 {wantedDays}일 중 {r.itinerary.days.length}일만 채웠습니다.
                      </p>
                    )}
                    <TourItinerary itinerary={r.itinerary} weather={shownWeather} onAvoid={avoidStop} busy={busy} skipIslands={TOUR_ITINERARY_REGIONS[askedRegion]?.skipIslands ?? false} />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">일정표를 짤 만큼 후보가 모이지 않았습니다. 뺀 곳을 되돌리거나 아래 추천 장소를 참고하세요.</p>
                )}
              </Section>
            ) : (
              <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                {itineraryRegion ? '일정표를 짤 만큼 후보가 모이지 않았습니다. 아래 추천 장소를 참고하세요.' : "일정표는 지역을 골라야 만들어 드립니다('전체' 는 추천 장소만). 제주나 시도·권역을 골라 다시 찾아 보세요."}
              </p>
            )}

            <Section title="비슷한 여행자가 만족한 곳" hint={`${asked?.ageGrp ? `${asked.ageGrp}대` : ''} ${asked?.accompany ? shortAccompany(asked.accompany) : ''} ${nightsLabel(asked?.nights)}`.trim()}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button type="button" className={cn('rounded-full border px-2.5 py-1', !onlyRestaurants ? 'border-teal-600 bg-teal-600/10 font-semibold' : 'text-muted-foreground')} onClick={() => setOnlyRestaurants(false)}>
                  전체
                </button>
                <button type="button" className={cn('rounded-full border px-2.5 py-1', onlyRestaurants ? 'border-teal-600 bg-teal-600/10 font-semibold' : 'text-muted-foreground')} onClick={() => setOnlyRestaurants(true)}>
                  식당만
                </button>
                <span className="ml-auto text-muted-foreground">등록된 맛집은 체크해 그룹투표로 보낼 수 있어요</span>
              </div>
              {places.length === 0 ? (
                <p className="text-sm text-muted-foreground">{r.places.length > 0 ? '추천 목록에 식당이 없습니다.' : '추천할 장소가 없습니다. 이 지역은 표본이 모자랍니다.'}</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {places.map((p) => {
                    const checked = p.placeId ? Boolean(picked[p.placeId]) : false;
                    const pinned = isPinned(p);
                    const facts = [p.peak && `주로 ${p.peak}`, p.stayMin !== null && `${durationLabel(p.stayMin)} 머묾`, p.spendPp !== null && `1인 ${won(p.spendPp)}`].filter(Boolean);
                    return (
                      <li key={`${p.name}-${p.sigungu}-${p.kind}`} className={cn('min-w-0 rounded-md border p-2.5', (checked || pinned) && 'border-teal-600 bg-teal-600/5')}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                              <KindDot kind={p.kind} className="flex-none" />
                              {p.placeId ? (
                                <Link to={`/restaurants-v2/${p.placeId}`} className="truncate underline-offset-2 hover:underline">
                                  {p.name}
                                </Link>
                              ) : (
                                <span className="truncate">{p.name}</span>
                              )}
                              <TourMapLink name={p.name} sigungu={p.sigungu} />
                              {itineraryRegion && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  aria-pressed={pinned}
                                  aria-label={`${p.name} 꼭 갈 곳`}
                                  title={pinned ? '꼭 갈 곳에서 빼기' : '일정에 꼭 넣기'}
                                  onClick={() => togglePin(p)}
                                  className={cn('flex-none rounded p-0.5 disabled:opacity-40', pinned ? 'text-teal-700 dark:text-teal-300' : 'text-muted-foreground hover:text-foreground')}
                                >
                                  <Pin className={cn('size-3.5', pinned && 'fill-current')} />
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {p.kind} · {[p.sigungu, p.emd].filter(Boolean).join(' ')} · {p.n}팀 · 만족 {p.mean !== null ? p.mean.toFixed(1) : '–'}
                            </div>
                            {facts.length > 0 && <div className="text-[11px] text-muted-foreground">{facts.join(' · ')}</div>}
                            {p.similarN !== null && (
                              <div className="text-[11px] font-medium text-teal-700 dark:text-teal-300">
                                비슷한 여행 {p.similarN}건{p.lift !== null && p.lift >= 1.2 && ` · 평균의 ${p.lift.toFixed(1)}배`}
                              </div>
                            )}
                          </div>
                          {p.placeId ? (
                            <label className="flex flex-none items-center gap-1 text-[11px]">
                              <input type="checkbox" checked={checked} onChange={() => togglePick(p)} />
                              투표
                            </label>
                          ) : (
                            <span className="flex-none text-[10px] text-muted-foreground">미등록</span>
                          )}
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <i className="block h-full bg-teal-600" style={{ width: `${(p.score / maxScore) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="button" size="sm" disabled={pickedList.length < 2} onClick={toVote}>
                  <Vote className="size-4" /> 그룹투표 만들기{pickedList.length > 0 ? ` (${pickedList.length})` : ''}
                </Button>
                <span className="text-[11px] text-muted-foreground">2~8곳 · 로그인 필요</span>
                {r.excludedClosed > 0 && <span className="ml-auto text-[11px] text-muted-foreground">폐업·휴업이 확인된 {r.excludedClosed}곳은 뺐습니다</span>}
              </div>
            </Section>

            {r.templates.length > 0 && (
              <Section title="흔한 하루 코스" hint="같은 조건 여행의 유형 순서">
                <ul className="space-y-1.5">
                  {r.templates.map((t) => (
                    <li key={t.label} className="flex items-center justify-between gap-2">
                      <SeqChips seq={t.label} />
                      <span className="text-xs tabular-nums text-muted-foreground">{t.n}일</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  {r.itinerary ? '일정표는 이런 하루에서 이동·숙소를 빼고, 식사 자리와 볼거리 자리가 놓이는 순서를 따라 짰습니다.' : '식당 자리는 홈의 골라주기("여행자 만족 기준")로, 자연·상업 자리는 위 추천으로 채워 보세요.'}
                </p>
              </Section>
            )}

            <TourSourceNote note={r.sourceNote} className="border-t pt-3" />
          </>
        )}
      </div>
    </div>
  );
};
