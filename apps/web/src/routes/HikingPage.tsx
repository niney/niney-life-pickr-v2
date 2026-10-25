import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crosshair, ExternalLink, Loader2, Search } from 'lucide-react';
import { Routes } from '@repo/api-contract';
import { ApiError, useHikingCourse, useHikingMountain, useHikingMountains, useUserLocation } from '@repo/shared';
import { HIKING_REGION_GROUPS, formatHikingEle, formatHikingLength, isHikingRegionGroup } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { CourseDetail } from '~/components/hiking/CourseDetail';
import { HikingMap } from '~/components/hiking/HikingMap';
import { MountainDetail } from '~/components/hiking/MountainDetail';
import { decodePieces, formatHikingDistance, isHikingSort, pointAtDistance, rankMountains, type HikingSort } from '~/components/hiking/hikingFormat';
import { cn } from '~/lib/utils';

// 등산 — 100대 명산 607개 코스(한국등산트레킹지원센터 GPX + 산림청). 산 목록(검색·권역·정렬) → 산 상세(사진·선정 이유·
// 코스 카드) → 코스 상세(고도 그래프·노면·지점). 상태는 URL(?m 산 · c 코스 · q 검색 · r 권역 · s 정렬) — 공유·뒤로가기.
// 고도 그래프에서 가리킨 자리·고른 지점은 화면 상태(공유 대상 아님). docs/PLAN-hiking.md

const SORT_LABEL: Record<HikingSort, string> = { name: '이름순', height: '높은순', near: '가까운순' };

export const HikingPage = () => {
  const [params, setParams] = useSearchParams();
  const mountainId = params.get('m');
  const courseId = mountainId ? params.get('c') : null;
  const q = params.get('q') ?? '';
  const rawGroup = params.get('r');
  const group = isHikingRegionGroup(rawGroup) ? rawGroup : null;
  const rawSort = params.get('s');
  const sort: HikingSort = isHikingSort(rawSort) ? rawSort : 'name';

  const mountainsQ = useHikingMountains();
  const mountainQ = useHikingMountain(mountainId);
  const courseQ = useHikingCourse(courseId);
  const userLoc = useUserLocation({ auto: false });
  const me = userLoc.coords;

  const update = useCallback(
    (patch: Record<string, string | null>, replace = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );

  const ranked = useMemo(
    () => rankMountains(mountainsQ.data?.items ?? [], { q, group, sort, me }),
    [mountainsQ.data, q, group, sort, me],
  );

  // 산·코스 데이터가 URL 과 어긋난 동안(다른 산을 막 고름)은 이전 것을 쓰지 않는다.
  const mountain = mountainQ.data && mountainQ.data.id === mountainId ? mountainQ.data : null;
  const course = courseQ.data && courseQ.data.id === courseId ? courseQ.data : null;

  // 고른 지점 — 코스가 바뀌면 자동으로 풀리게 코스 id 와 같이 들고 있는다(effect 없이).
  const [picked, setPicked] = useState<{ courseId: string; poiId: string } | null>(null);
  const selectedPoiId = picked && picked.courseId === courseId ? picked.poiId : null;
  const [hoverAtM, setHoverAtM] = useState<number | null>(null);
  const lines = useMemo(() => (course ? decodePieces(course.pieces) : []), [course]);
  const hoverPoint = course && hoverAtM !== null ? pointAtDistance(lines, course.lengthM, hoverAtM) : null;

  const notLoaded = mountainsQ.error instanceof ApiError && mountainsQ.error.statusCode === 503;

  const selectMountain = (id: string) => update({ m: id, c: null }, false);
  const nearMe = () => {
    update({ s: 'near' });
    if (!me) userLoc.refetch();
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-4">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">등산</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            산림청 100대 명산의 코스 607개 — 코스 선과 고도 그래프, 갈림길 이정표, 험한 구간, 화장실·주차장·정류장까지 한눈에.
          </p>
        </header>

        {mountainsQ.isError ? (
          <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            {notLoaded ? '등산 데이터가 아직 준비되지 않았습니다.' : '산 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.'}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
            <HikingMap
              mountains={mountainsQ.data?.items ?? []}
              selectedMountainId={mountainId}
              courses={mountain?.courses ?? null}
              selectedCourseId={courseId}
              pois={course?.pois ?? []}
              selectedPoiId={selectedPoiId}
              hoverPoint={hoverPoint}
              myLocation={me}
              onSelectMountain={selectMountain}
              onSelectPoi={(poiId) => courseId && setPicked({ courseId, poiId })}
              className="h-[360px] lg:h-[640px]"
            />
            <aside className="flex min-h-0 flex-col gap-3 lg:h-[640px] lg:overflow-y-auto lg:pr-1" aria-label="산·코스">
              {courseId ? (
                course ? (
                  <CourseDetail
                    course={course}
                    selectedPoiId={selectedPoiId}
                    onSelectPoi={(poiId) => setPicked({ courseId: course.id, poiId })}
                    onHover={setHoverAtM}
                    onBack={() => update({ c: null }, false)}
                  />
                ) : courseQ.isError ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">코스를 불러오지 못했습니다.</p>
                ) : (
                  <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> 코스를 불러오는 중…
                  </p>
                )
              ) : mountainId ? (
                mountain ? (
                  <MountainDetail mountain={mountain} onSelectCourse={(c) => update({ c }, false)} onBack={() => update({ m: null }, false)} />
                ) : mountainQ.isError ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">산 정보를 불러오지 못했습니다.</p>
                ) : (
                  <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> 산 정보를 불러오는 중…
                  </p>
                )
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => update({ q: e.target.value })}
                      placeholder="산 이름·지역 검색"
                      aria-label="산 검색"
                      className="pl-8"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="권역">
                    {[{ key: null, label: '전체' }, ...HIKING_REGION_GROUPS].map((g) => (
                      <button
                        key={g.key ?? 'all'}
                        type="button"
                        aria-pressed={group === g.key}
                        onClick={() => update({ r: g.key })}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                          group === g.key ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="정렬">
                      {(['name', 'height'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={sort === s}
                          onClick={() => update({ s: s === 'name' ? null : s })}
                          className={cn('rounded px-2 py-0.5 text-xs font-medium', sort === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                        >
                          {SORT_LABEL[s]}
                        </button>
                      ))}
                    </div>
                    <Button type="button" variant={sort === 'near' ? 'default' : 'outline'} size="sm" onClick={nearMe} disabled={userLoc.status === 'pending'}>
                      {userLoc.status === 'pending' ? <Loader2 className="animate-spin" /> : <Crosshair />}
                      가까운순
                    </Button>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">{ranked.length}개 산</span>
                  </div>
                  {mountainsQ.isLoading ? (
                    <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> 산 목록을 불러오는 중…
                    </p>
                  ) : (
                    <ol className="flex flex-col divide-y rounded-md border" data-testid="hiking-list">
                      {ranked.map(({ mountain: m, distM }) => (
                        <li key={m.id}>
                          <button type="button" onClick={() => selectMountain(m.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent">
                            {m.images[0] !== undefined ? (
                              <img src={Routes.Hiking.image(m.id, m.images[0])} alt="" loading="lazy" className="size-12 shrink-0 rounded bg-muted object-cover" />
                            ) : (
                              <span aria-hidden className="size-12 shrink-0 rounded bg-muted" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-1.5">
                                <span className="truncate text-sm font-medium">{m.name}</span>
                                {m.heightM !== null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatHikingEle(m.heightM)}</span>}
                                {distM !== null && <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{formatHikingDistance(distM)}</span>}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">{m.area}</span>
                              <span className="block text-xs tabular-nums text-muted-foreground">
                                코스 {m.courseCount}개
                                {m.minLengthM !== null && m.maxLengthM !== null && ` · ${formatHikingLength(m.minLengthM)}~${formatHikingLength(m.maxLengthM)}`}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                      {ranked.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">조건에 맞는 산이 없습니다.</li>}
                    </ol>
                  )}
                </>
              )}
            </aside>
          </div>
        )}

        <footer className="flex flex-col gap-1 text-[11px] leading-relaxed text-muted-foreground" data-testid="hiking-footer">
          <div>
            코스·지점은 2022년 1월 기준 조사 자료입니다. 입산통제·탐방로 폐쇄·공사는 반영되지 않으니 산행 전 국립공원·지자체 안내를
            확인하세요.
          </div>
          <div>
            출처{' '}
            <a href="https://www.data.go.kr/data/15098177/fileData.do" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
              한국등산트레킹지원센터 <ExternalLink className="size-3" />
            </a>{' '}
            100대명산 GPX·봉우리·갈림길·교통 정보,{' '}
            <a href="https://www.forest.go.kr" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
              산림청 <ExternalLink className="size-3" />
            </a>{' '}
            명산등산로·산정보(공공데이터포털).
          </div>
        </footer>
      </div>
    </div>
  );
};
