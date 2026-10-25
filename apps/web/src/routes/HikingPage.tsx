import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ApiError, useHikingCourse, useHikingMountain, useHikingMountains, useUserLocation } from '@repo/shared';
import { isHikingRegionGroup, type HikingRegionGroup } from '@repo/utils';
import { usePublicLayout } from '~/components/PublicLayout';
import { CourseDetail } from '~/components/hiking/CourseDetail';
import { HikingFooter, HikingListHeader, HikingMountainList } from '~/components/hiking/HikingList';
import { HikingMap } from '~/components/hiking/HikingMap';
import { MountainDetail } from '~/components/hiking/MountainDetail';
import { decodePieces, isHikingSort, pointAtDistance, rankMountains, type HikingSort } from '~/components/hiking/hikingFormat';
import { BottomSheet } from '~/components/sheet/BottomSheet';
import { SHEET_PEEK_HEIGHT, sheetHalfInset, useMapSheets } from '~/components/sheet/useMapSheets';
import { useIsDesktopXl } from '~/lib/useMediaQuery';
import { cn } from '~/lib/utils';
import { usePanelSide } from '~/stores/panelPrefsStore';

// 등산 — 100대 명산 607개 코스(한국등산트레킹지원센터 GPX + 산림청). 산 목록(검색·권역·정렬) → 산 상세(사진·선정 이유·
// 코스 카드) → 코스 상세(예상 시간·난이도·고도 그래프·노면·지점). 상태는 URL(?m 산 · c 코스 · q 검색 · r 권역 · s 정렬) —
// 공유·뒤로가기. 고도 그래프에서 가리킨 자리·고른 지점은 화면 상태(공유 대상 아님). docs/PLAN-hiking.md
//
// 레이아웃은 맛집(RestaurantsV2Page)과 같은 틀 — useIsDesktopXl(JS)로 한 벌만 그린다.
//   - xl+ : 헤더 아래 한 화면에 [산 목록 400 | 상세 440(산 → 코스) | 지도]. 패널 좌/우는 맛집처럼 바꿀 수 있다.
//   - xl- : 지도는 헤더 아래 fixed 배경, 그 위에 목록 시트(peek/half/full)와 상세 시트(산을 고르면 half 로).
//           검색·권역·정렬은 상단바 subBar 에(산을 고르면 내린다). 산·코스 범위는 half 시트에 가리지 않게 맞춘다.

export const HikingPage = () => {
  const isDesktop = useIsDesktopXl();
  const { setSubBar, headerHeight } = usePublicLayout();
  const [panelSide, togglePanelSide] = usePanelSide('public.hiking');

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

  // 목록/상세 시트 스냅 조율(상세가 열리면 목록 peek·상세 half, 닫히면 복원) — 맛집·주차와 같은 공용 훅.
  const sheets = useMapSheets(mountainId !== null);

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

  const selectMountain = useCallback((id: string) => update({ m: id, c: null }, false), [update]);
  const refetchLocation = userLoc.refetch;
  const changeSort = useCallback(
    (s: HikingSort) => {
      update({ s: s === 'name' ? null : s });
      if (s === 'near' && !me) refetchLocation();
    },
    [update, me, refetchLocation],
  );
  const changeQ = useCallback((next: string) => update({ q: next }), [update]);
  const changeGroup = useCallback((g: HikingRegionGroup | null) => update({ r: g }), [update]);

  const count = ranked.length;
  const locating = sort === 'near' && userLoc.status === 'pending';
  const headerProps = { q, group, sort, count, locating, onChangeQ: changeQ, onChangeGroup: changeGroup, onChangeSort: changeSort };

  // 모바일 subBar — 산 목록일 때만(상세가 열리면 내려 시트가 더 넓게). 데스크톱은 목록 칸이 자기 머리를 갖는다.
  // 상단바 상태로 올라가는 요소라 값이 같으면 같은 참조여야 한다(아니면 등록 → 다시 그리기가 돈다).
  const showSubBar = !isDesktop && mountainId === null && !mountainsQ.isError;
  const subBarContent = useMemo(
    () =>
      showSubBar ? (
        <HikingListHeader
          q={q}
          group={group}
          sort={sort}
          count={count}
          locating={locating}
          onChangeQ={changeQ}
          onChangeGroup={changeGroup}
          onChangeSort={changeSort}
        />
      ) : null,
    [showSubBar, q, group, sort, count, locating, changeQ, changeGroup, changeSort],
  );
  // paint 전에 상단바에 등록 — 첫 프레임부터 통합 헤더 높이로 시트가 자리 잡게(맛집과 같음).
  useLayoutEffect(() => {
    setSubBar(subBarContent);
    return () => setSubBar(null);
  }, [setSubBar, subBarContent]);

  const listBody = mountainsQ.isError ? (
    <div className="mx-3 my-4 rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      {notLoaded ? '등산 데이터가 아직 준비되지 않았습니다.' : '산 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.'}
    </div>
  ) : (
    <HikingMountainList ranked={ranked} isLoading={mountainsQ.isLoading} selectedId={mountainId} onSelect={selectMountain} />
  );

  const loading = (text: string) => (
    <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {text}
    </p>
  );
  const failed = (text: string) => <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
  const detail = courseId
    ? course
      ? (
          <CourseDetail
            course={course}
            selectedPoiId={selectedPoiId}
            onSelectPoi={(poiId) => setPicked({ courseId: course.id, poiId })}
            onHover={setHoverAtM}
            onBack={() => update({ c: null }, false)}
          />
        )
      : courseQ.isError
        ? failed('코스를 불러오지 못했습니다.')
        : loading('코스를 불러오는 중…')
    : mountain
      ? <MountainDetail mountain={mountain} onSelectCourse={(c) => update({ c }, false)} onBack={() => update({ m: null }, false)} />
      : mountainQ.isError
        ? failed('산 정보를 불러오지 못했습니다.')
        : loading('산 정보를 불러오는 중…');

  return (
    <div
      className={cn('relative w-full', isDesktop && 'flex', isDesktop && panelSide === 'right' && 'flex-row-reverse')}
      // 데스크톱은 헤더 아래 한 화면에 꼭 맞춘다(실측 헤더 높이 — 맛집·주차와 같은 방식).
      style={isDesktop ? { height: `calc(100dvh - ${headerHeight}px)` } : undefined}
    >
      <h1 className="sr-only">등산</h1>
      {/* 지도 — 데스크톱은 마지막 칸(order-3), 모바일은 헤더 아래 fixed 배경. 두 분기에서 같은 자리(첫 칸)라 폭이 xl 경계를
          넘나들어도 지도 인스턴스는 그대로다. --map-bottom-inset: 좌하단 레이어 컨트롤이 peek 시트 위로. */}
      <section
        className={cn(isDesktop ? 'relative order-3 min-h-0 flex-1' : 'fixed inset-x-0 bottom-0 z-0')}
        style={
          isDesktop
            ? undefined
            : ({ top: `${headerHeight}px`, '--map-bottom-inset': `${SHEET_PEEK_HEIGHT}px` } as React.CSSProperties)
        }
      >
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
          fitBottomInset={isDesktop ? 0 : sheetHalfInset(headerHeight)}
          className="h-full w-full"
        />
      </section>

      {isDesktop ? (
        /* ━━━ 데스크톱 (xl+) — [산 목록 | 상세 | 지도] ━━━ */
        <>
          <aside
            className={cn('order-1 flex h-full w-[400px] shrink-0 flex-col bg-background', panelSide === 'left' ? 'border-r' : 'border-l')}
            aria-label="산 목록"
          >
            <div className="border-b">
              <HikingListHeader {...headerProps} panelSide={panelSide} onTogglePanelSide={togglePanelSide} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {listBody}
              <HikingFooter />
            </div>
          </aside>
          {mountainId && (
            <aside
              className={cn('order-2 h-full w-[440px] shrink-0 overflow-y-auto bg-background p-4', panelSide === 'left' ? 'border-r' : 'border-l')}
              aria-label="산·코스 상세"
            >
              {detail}
            </aside>
          )}
        </>
      ) : (
        /* ━━━ 모바일 (xl-) — 지도 배경 + 목록 시트 + 상세 시트 ━━━ */
        <>
          <BottomSheet
            snap={sheets.listSnap}
            onSnapChange={sheets.setListSnap}
            topOffset={headerHeight}
            peekHeight={SHEET_PEEK_HEIGHT}
            hidden={sheets.listHidden}
            disableScrollLock={sheets.listHidden}
            zIndex={20}
          >
            <div className="pb-6" data-testid="hiking-list-sheet">
              {listBody}
              <HikingFooter />
            </div>
          </BottomSheet>
          {mountainId && (
            <BottomSheet
              key={mountainId}
              snap={sheets.detailSnap}
              onSnapChange={sheets.setDetailSnap}
              topOffset={headerHeight}
              peekHeight={SHEET_PEEK_HEIGHT}
              zIndex={30}
            >
              <div className="px-4 pb-6 pt-1" data-testid="hiking-detail-sheet">
                {detail}
              </div>
            </BottomSheet>
          )}
        </>
      )}
    </div>
  );
};
