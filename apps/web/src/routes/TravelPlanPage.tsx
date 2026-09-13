import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Loader2, Vote } from 'lucide-react';
import { useTourPlan, type TourInsightsParams } from '@repo/shared';
import type { TourPlanPlaceType, VoteOptionInputType } from '@repo/api-contract';
import { Button } from '~/components/ui/button';
import { TourFilterBar } from '~/components/tour/TourFilterBar';
import { TourSourceNote } from '~/components/tour/TourSourceNote';
import { KindDot, Section, SeqChips } from '~/components/tour/charts';
import { nightsLabel, shortAccompany } from '~/components/tour/tourFormat';
import { cn } from '~/lib/utils';

// 코스 추천 — "나와 비슷한 여행자(연령·성별·동반·박수·월)가 만족한 곳" 을 여행로그에서 고른다. 서버가 비슷한 여행을 세그먼트
// 일치로 찾고(20건 미만이면 month→gender→nights→ageGrp 순으로 풀며 알려줌) 장소를 n × (만족도 − 3.3) 으로 점수화한다.
// 등록된 맛집(placeId)은 상세로 이어지고, 2곳 이상 고르면 그룹투표 후보로 넘긴다(/vote/new state 프리필).

const LADDER_LABEL: Record<string, string> = { month: '월', gender: '성별', nights: '박수', ageGrp: '연령' };

export const TravelPlanPage = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TourInsightsParams>({ region: 'jeju', ageGrp: '30', accompany: '2인 여행(가족 외)', nights: 2 });
  const [onlyRestaurants, setOnlyRestaurants] = useState(false);
  const [picked, setPicked] = useState<Record<string, TourPlanPlaceType>>({});
  const plan = useTourPlan();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPicked({});
    plan.mutate({
      region: filters.region ?? 'jeju',
      ageGrp: filters.ageGrp,
      gender: filters.gender,
      accompany: filters.accompany,
      month: filters.month,
      nights: filters.nights,
    });
  };

  const r = plan.data;
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
    const options: VoteOptionInputType[] = pickedList.map((p) => ({ placeId: p.placeId!, name: p.name, category: p.kind, thumbnailUrl: null }));
    navigate('/vote/new', { state: { presetTitle: '제주에서 뭐 먹지?', presetOptions: options } });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">코스 추천</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              2023년 제주 여행자 표본에서 나와 비슷한 사람들이 만족한 곳을 골라 드립니다. 개별 여행자는 보이지 않고 5명 미만 장소는 빠집니다.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/travel/jeju">
              <BarChart3 className="size-4" /> 인사이트
            </Link>
          </Button>
        </header>

        <form onSubmit={onSubmit} className="space-y-3">
          <TourFilterBar value={filters} onChange={setFilters} showRegion={false} />
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={plan.isPending} className="bg-teal-600 text-white hover:bg-teal-700">
              {plan.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              비슷한 여행 찾기
            </Button>
            <span className="text-xs text-muted-foreground">추천 점수 = 방문 여행 수 × (평균 만족도 − 3.3)</span>
          </div>
        </form>

        {plan.isError && <p className="text-sm text-destructive">{(plan.error as Error).message}</p>}

        {r && (
          <>
            <div className={cn('rounded-md border px-3 py-2 text-xs', r.insufficient ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'border-teal-600/30 bg-teal-600/5')}>
              같은 조건의 여행 <b>{r.matchedTrips}건</b>
              {r.relaxed.length > 0 && <> — 표본이 적어 {r.relaxed.map((k) => LADDER_LABEL[k] ?? k).join(' · ')} 조건은 풀었습니다</>}
              {r.insufficient && ' · 그래도 20건 미만이라 참고만 하세요'}
            </div>

            <Section title="비슷한 여행자가 만족한 곳" hint={`${filters.ageGrp ? `${filters.ageGrp}대` : ''} ${filters.accompany ? shortAccompany(filters.accompany) : ''} ${nightsLabel(filters.nights)}`.trim()}>
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
                <p className="text-sm text-muted-foreground">조건에 맞는 장소가 없습니다. 조건을 줄여 보세요.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {places.map((p) => {
                    const checked = p.placeId ? Boolean(picked[p.placeId]) : false;
                    return (
                      <li key={`${p.name}-${p.sigungu}-${p.kind}`} className={cn('rounded-md border p-2.5', checked && 'border-teal-600 bg-teal-600/5')}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-semibold">
                              <KindDot kind={p.kind} />
                              {p.placeId ? (
                                <Link to={`/restaurants-v2/${p.placeId}`} className="truncate underline-offset-2 hover:underline">
                                  {p.name}
                                </Link>
                              ) : (
                                <span className="truncate">{p.name}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {p.kind} · {[p.sigungu, p.emd].filter(Boolean).join(' ')} · {p.n}팀 · 만족 {p.mean !== null ? p.mean.toFixed(1) : '–'}
                            </div>
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
                <p className="text-[11px] text-muted-foreground">식당 자리는 홈의 골라주기("여행자 만족 기준")로, 자연·상업 자리는 위 추천으로 채워 보세요.</p>
              </Section>
            )}

            <TourSourceNote note={r.sourceNote} className="border-t pt-3" />
          </>
        )}
      </div>
    </div>
  );
};
