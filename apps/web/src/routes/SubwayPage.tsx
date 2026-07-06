import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SubwayStationGroupItemType } from '@repo/api-contract';
import { subwayLineColor, subwayLineName } from '@repo/utils';
import {
  ApiError,
  useSubwayFavorites,
  useSubwayLineDetail,
  useSubwayNearbyStations,
  useSubwayStationArrivals,
  useSubwayStationSearch,
} from '@repo/shared';
import { usePublicLayout } from '~/components/PublicLayout';
import { TransitTabs } from '~/components/transit/TransitTabs';
import { SubwayArrivalPanel } from '~/components/subway/SubwayArrivalPanel';
import { SubwayFavoriteSection } from '~/components/subway/SubwayFavoriteSection';
import {
  SubwayStationList,
  SubwayStationListBody,
  SubwayStationSearchBar,
} from '~/components/subway/SubwayStationList';
import { SubwayStationsMap } from '~/components/subway/SubwayStationsMap';

// GPS 좌표 반올림 자릿수 — 소수 5자리(≈1.1m). URL 에 원시 좌표를 그대로 노출하지
// 않아 공유 시 위치 정밀도도 낮춘다(버스와 동일).
const roundCoord = (n: number): number => Math.round(n * 1e5) / 1e5;

// 빈 결과의 안정 참조 — 매 렌더 새 `[]` 를 만들면 지도 groups 가 identity 만으로
// 바뀐 것처럼 보여 fitToMarkers 가 재발화(선택 역으로 화면이 튐)한다. 한 인스턴스를
// 공유해 memo·effect 의존성을 안정화한다.
const EMPTY_GROUPS: SubwayStationGroupItemType[] = [];

// near 파라미터('lat,lng') 파싱 — 형식/한국 WGS84 범위(계약과 동일)를 통과해야
// 주변 모드로 인정. 딥링크·수동 편집으로 들어온 쓰레기 값은 null → 검색 모드.
const parseNear = (raw: string | null): { lat: number; lng: number } | null => {
  if (!raw) return null;
  const [latStr, lngStr] = raw.split(',');
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 33 || lat > 39 || lng < 124 || lng > 132) return null;
  return { lat, lng };
};

// 수도권 전철 역 검색 + 지도 + 주변 역. 검색어(q)·선택 역(stn)·주변 좌표(near)를
// URL 에 동기화 — 새로고침/공유 시 같은 화면 복원. 역사마스터를 로컬 DB 에서
// 조회하므로 쿼터 부담이 없어 라이브 검색(타이핑 즉시)이며, 타이핑 부하는
// useDeferredValue 로만 완화한다(디바운스 타이머/useEffect 없음).
export const SubwayPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const stn = searchParams.get('stn');
  // 추적 호선(line) — 4자리 lineId. '노선 보기'가 세팅하고 stn 과 공존한다. 쓰레기
  // 값(딥링크 편집)은 null(폴리라인 미표시).
  const rawLine = searchParams.get('line');
  const line = rawLine && /^\d{4}$/.test(rawLine) ? rawLine : null;

  // 검색 입력의 진실은 로컬 state — URL q 는 쓰기 전용 미러다. URL 을 input value 에
  // 직결하면(useSearchParams 왕복) 라우터 리렌더가 한글 IME 조합 세션을 리셋해 첫
  // 글자가 유실된다(실측: "강남" → "남"). 초기값만 URL 에서 복원(lazy initializer)해
  // 딥링크/새로고침을 살린다. 뒤로가기 등 외부 URL 변경은 input 에 역반영하지 않는다
  // (1차 수용) — URL→state effect 를 넣으면 조합 중 롤백 레이스로 같은 버그가 재발한다.
  const [qInput, setQInput] = useState(() => searchParams.get('q') ?? '');

  // 주변 모드 — near 파라미터가 유효 좌표일 때. 검색어(q)와 배타이며, URL 이 유일
  // 진실이라 새로고침/딥링크 시 Geolocation 재요청 없이 좌표로 복원된다.
  const near = parseNear(searchParams.get('near'));
  const nearMode = near !== null;

  // Geolocation 실패 안내(권한 거부/타임아웃/미지원/비보안) — 좌표를 못 얻으면 URL 을
  // 바꾸지 않으므로 이 로컬 상태로만 리스트 영역에 노출한다.
  const [geoError, setGeoError] = useState<string | null>(null);

  // 지도 자동 재조회 좌표 — 줌이 가까운 상태에서 패닝이 끝나면 지도가 넘겨준다.
  // URL(near)은 명시 액션의 몫이라 건드리지 않는다(history 오염 방지, 새로고침 시
  // 마지막 명시 지점으로 복원). 명시 액션 시 null 로 리셋.
  const [autoNear, setAutoNear] = useState<{ lat: number; lng: number } | null>(null);
  const effectiveNear = nearMode ? (autoNear ?? near) : null;

  // 통합 헤더 실측 높이 — 루트 높이를 viewport 잔여분으로 고정해 지도/리스트가
  // 내부 스크롤로만 동작하게 한다.
  const { headerHeight } = usePublicLayout();

  // 즐겨찾기 — 게스트/로그인 하이브리드. 로그인 직후 게스트 저장분을 서버로 1회
  // 병합하는 부수효과도 이 훅이 담당(SubwayPage 에서 단 한 번만 호출).
  const favorites = useSubwayFavorites();
  const hasFavorites =
    favorites.stations.length > 0 || favorites.lines.length > 0;

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // 라이브 검색 — 인풋 값은 즉시(qInput)지만, 실제 쿼리는 deferred 로 지연해 타이핑
  // 부하를 완화한다(파생 상태 — effect 없음).
  const deferredQ = useDeferredValue(qInput);
  const search = useSubwayStationSearch(deferredQ);

  // 소비 게이트 — 유효 검색어(1~50자, 훅 enabled 와 동일 조건)가 아닐 때는 캐시에
  // 남은 이전 응답을 마커·리스트로 흘리지 않는다.
  const trimmedQ = deferredQ.trim();
  const hasQ = trimmedQ.length >= 1 && trimmedQ.length <= 50;
  const items = hasQ ? (search.data?.items ?? EMPTY_GROUPS) : EMPTY_GROUPS;
  const total = hasQ ? (search.data?.total ?? 0) : 0;
  const fetchedAt = hasQ ? (search.data?.fetchedAt ?? null) : null;
  const searching =
    search.isLoading || (search.isFetching && search.isPlaceholderData);

  // 주변 역 — effectiveNear(명시 near 또는 지도 자동 조회) 좌표가 있을 때만 호출.
  // 좌표는 URL 에서 복원 → Geolocation 재요청 없이 딥링크 동작.
  const nearby = useSubwayNearbyStations(
    effectiveNear?.lat ?? null,
    effectiveNear?.lng ?? null,
  );
  const nearItems = nearMode ? (nearby.data?.items ?? EMPTY_GROUPS) : EMPTY_GROUPS;
  const nearSearching =
    nearby.isLoading || (nearby.isFetching && nearby.isPlaceholderData);

  // 추적 호선 상세(형상+경유역, 지선 sections) — line 선택 시에만. 적재 데이터라
  // 정적(폴링 없음). 색은 SUBWAY_LINES 상수에서 파생(폴리라인·경유역 점 공용).
  const lineDetail = useSubwayLineDetail(line);
  const lineColor = line ? subwayLineColor(line) : undefined;

  // ── 활성 소스 — 주변 모드면 nearby, 아니면 검색. 아래 로직(선택/지도/도착)은
  //    소스만 다를 뿐 동일하게 흐른다. 마커 누적은 없다(30그룹 상한 — 현재 결과만). ──
  const activeItems = nearMode ? nearItems : items;
  const activeTotal = nearMode ? (nearby.data?.total ?? 0) : total;
  const activeFetchedAt = nearMode ? (nearby.data?.fetchedAt ?? null) : fetchedAt;
  const activeLoading = nearMode ? nearSearching : searching;
  const activeError = nearMode ? nearby.isError : search.isError;
  const activeSuccess = nearMode ? nearby.isSuccess : search.isSuccess;
  const activePlaceholder = nearMode
    ? nearby.isPlaceholderData
    : search.isPlaceholderData;
  const truncated = (nearMode || hasQ) && activeItems.length < activeTotal;

  // 선택 역(stn)이 확정 결과에 없음 — 안내만 하고 URL 은 건드리지 않는다.
  // placeholder 표시 중에는 판정 보류.
  const selectedMissing =
    stn !== null &&
    (nearMode || hasQ) &&
    activeSuccess &&
    !activePlaceholder &&
    !activeItems.some((it) => it.id === stn);

  // 경유역 점 클릭 시 그룹 대표 id 재해석용 — 활성 결과의 각 호선 stationId → 그룹 id.
  // 렌더 중 갱신(ref) — handleSelectStop 이 클릭 시점의 최신 값을 읽는다(버스 패턴).
  const groupIdByLineStationRef = useRef<Map<string, string>>(new Map());
  groupIdByLineStationRef.current = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of activeItems) for (const l of g.lines) m.set(l.stationId, g.id);
    return m;
  }, [activeItems]);

  // 추적 호선의 경유역 집합(id + 역명) — 역 전환 시 line 유지 판정용. 환승역 딥링크는
  // 그룹 대표 id 가 달라(다른 lineId 접두) 역명 비교도 병행한다.
  const lineStationKeyRef = useRef<{ ids: Set<string>; names: Set<string> }>({
    ids: new Set(),
    names: new Set(),
  });
  lineStationKeyRef.current = useMemo(() => {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const sec of lineDetail.data?.sections ?? []) {
      for (const st of sec.stations) {
        ids.add(st.stationId);
        names.add(st.name);
      }
    }
    return { ids, names };
  }, [lineDetail.data]);

  // 라이브 검색 — 로컬 state 를 먼저 갱신(IME 안전한 input 진실)하고, URL q 는 그 뒤에
  // replace 로 미러링한다. 검색어 입력은 주변 모드와 배타라 near 를 제거하고, 이전
  // 선택(stn)도 다른 결과셋의 것이라 해제한다.
  const handleChangeQ = useCallback(
    (next: string) => {
      setQInput(next);
      setGeoError(null);
      setAutoNear(null);
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (next) sp.set('q', next);
          else sp.delete('q');
          sp.delete('near');
          sp.delete('stn');
          sp.delete('line');
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // 역 선택 — stn 세팅 + 추적 호선(line) 유지 판정. 새 역이 추적 호선 경유역(id 또는
  // 역명 일치)이면 line 유지(노선 위를 역 단위로 이어 탐색), 아니면 해제(다른 호선
  // 맥락). line 미추적이면 stn 만 바꾼다.
  const selectStation = useCallback(
    (id: string) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (sp.get('line')) {
            const name = id.slice(id.indexOf(':') + 1);
            const onLine =
              lineStationKeyRef.current.ids.has(id) ||
              lineStationKeyRef.current.names.has(name);
            if (!onLine) sp.delete('line');
          }
          sp.set('stn', id);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleSelect = selectStation;

  // 경유역 점 클릭 — 환승역은 활성 결과의 그룹 대표 id 로 재해석(각 호선 stationId →
  // 그룹 id), 없으면 원본 stationId 그대로. 점은 항상 추적 호선 위라 line 은 유지된다.
  const handleSelectStop = useCallback(
    (stationId: string) => {
      selectStation(groupIdByLineStationRef.current.get(stationId) ?? stationId);
    },
    [selectStation],
  );

  // '← 목록' — 선택(stn)·추적 호선(line) 해제로 리스트 뷰 복귀. 지도/검색/주변은 그대로.
  const handleBack = useCallback(() => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete('stn');
        sp.delete('line');
        return sp;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // '노선 보기' 토글 — 같은 호선 재탭이면 해제. stn 은 유지(현재 역 패널 그대로).
  const handleTrackLine = useCallback(
    (lineId: string) => {
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          if (sp.get('line') === lineId) sp.delete('line');
          else sp.set('line', lineId);
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // 노선 정보 카드 '노선 닫기' — line 만 해제(stn 유지).
  const handleCloseLine = useCallback(() => setParam('line', null), [setParam]);

  // '주변 역' — Geolocation 으로 좌표를 얻어 near 모드로. 성공 시 q(입력 포함)를 지워
  // (배타) URL 을 near 로 교체, 실패 시 리스트 영역에 안내만 남긴다.
  const handleNearby = useCallback(() => {
    setGeoError(null);
    setAutoNear(null);
    // HTTPS(또는 localhost) 아니면 브라우저가 Geolocation 자체를 막는다.
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      setGeoError(
        '내 위치를 사용하려면 보안 연결(HTTPS)이 필요합니다. 이 기기의 브라우저에서 위치 접근이 제한됐을 수 있어요.',
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = roundCoord(pos.coords.latitude);
        const lng = roundCoord(pos.coords.longitude);
        // 라이브 검색 입력도 비운다(near↔q 배타 — 입력이 남으면 다음 타이핑 없이도
        // 검색 잔상이 될 수 있다).
        setQInput('');
        setSearchParams(
          (prev) => {
            const sp = new URLSearchParams(prev);
            sp.set('near', `${lat},${lng}`);
            sp.delete('q');
            sp.delete('stn');
            sp.delete('line');
            return sp;
          },
          { replace: true },
        );
      },
      (err) => {
        // 코드별 안내 — 권한 거부(1)/위치 불가(2)/타임아웃(3).
        const msg =
          err.code === err.PERMISSION_DENIED
            ? '위치 접근이 거부됐습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.'
            : err.code === err.TIMEOUT
              ? '위치를 가져오는 데 시간이 너무 오래 걸렸어요. 다시 시도해 주세요.'
              : '현재 위치를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.';
        setGeoError(msg);
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }, [setSearchParams]);

  // '이 위치에서 재검색' — 지도 중심 좌표로 near 를 교체(명시 액션). 이전 선택(stn)은
  // 새 영역과 무관해 함께 해제. 자동 조회 좌표(autoNear)는 리셋.
  const handleResearchAt = useCallback(
    (center: { lat: number; lng: number }) => {
      setGeoError(null);
      setAutoNear(null);
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev);
          sp.set('near', `${roundCoord(center.lat)},${roundCoord(center.lng)}`);
          sp.delete('q');
          sp.delete('stn');
          sp.delete('line');
          return sp;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // 지도 자동 재조회 — 줌이 가까운 상태의 패닝 종료 시 지도에서 호출. URL 은 건드리지
  // 않고 로컬 좌표만 교체 → 리스트/마커가 새 지점 기준으로 갱신된다(명시 재검색만 URL).
  const handleAutoResearchAt = useCallback((center: { lat: number; lng: number }) => {
    setAutoNear({ lat: roundCoord(center.lat), lng: roundCoord(center.lng) });
  }, []);

  // 주변 모드 해제 — near/geoError/자동좌표 제거하고 검색 화면으로 복귀.
  const handleClearNear = useCallback(() => {
    setGeoError(null);
    setAutoNear(null);
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        sp.delete('near');
        sp.delete('stn');
        sp.delete('line');
        return sp;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleRetry = useCallback(() => {
    if (nearMode) void nearby.refetch();
    else void search.refetch();
  }, [nearMode, nearby, search]);

  // 선택 역 도착정보 — 30초 폴링(stn 있을 때만). 패널 헤더 소스는 "현재 stn 의
  // 응답"이 진실이라 딥링크로 검색 결과가 없어도 헤더가 선다. 단 placeholder(직전
  // 역 응답)는 stationId 불일치라 걸러내 역 전환 순간 이전 역명이 새지 않게 한다.
  const arrivals = useSubwayStationArrivals(stn);
  const arrivalsForStn =
    arrivals.data && arrivals.data.stationId === stn ? arrivals.data : null;
  // 응답 → 활성 결과 그룹(검색/주변) → stn id 의 역명 부분(`${lineId}:${name}`) 폴백.
  const selectedGroup = stn ? activeItems.find((it) => it.id === stn) : undefined;
  const panelStationName =
    arrivalsForStn?.name ??
    selectedGroup?.name ??
    (stn ? stn.slice(stn.indexOf(':') + 1) : '');
  const panelLines =
    arrivalsForStn?.lines ?? selectedGroup?.lines.map((l) => l.lineId) ?? [];
  const arrivalItems = arrivalsForStn?.items ?? [];
  // 현재 stn 응답이 아직 없으면(최초/역 전환) 로딩 — placeholder(직전 역)를 목록으로
  // 흘리지 않고 스피너를 보인다. 같은 역 30초 폴링 중에는 arrivalsForStn 이 유지돼
  // 로딩이 뜨지 않는다(잔상 없이 교체).
  const arrivalLoading =
    arrivals.isLoading || (arrivals.isFetching && arrivalsForStn === null);

  // 도착 404 = 죽은 즐겨찾기 id(마스터 재적재로 대표 소멸) — 재시도 무의미, 재등록 안내.
  const arrivalNotFound =
    arrivals.isError &&
    arrivals.error instanceof ApiError &&
    arrivals.error.statusCode === 404;

  // 역×호선 즐겨찾기용 좌표 — 활성 결과 그룹 우선, 없으면 기존 즐겨찾기(역/노선)
  // 스냅샷에서 복원. 셋 다 없으면 null(딥링크 직진입 등) → 패널이 호선 별을 숨긴다.
  const favStationHit = stn
    ? favorites.stations.find((s) => s.stationId === stn)
    : undefined;
  const favLineHit = stn ? favorites.lines.find((l) => l.stationId === stn) : undefined;
  const selectedCoord = selectedGroup
    ? { lat: selectedGroup.lat, lng: selectedGroup.lng }
    : favStationHit
      ? { lat: favStationHit.lat, lng: favStationHit.lng }
      : favLineHit
        ? { lat: favLineHit.lat, lng: favLineHit.lng }
        : null;

  // 즐겨찾기 탭 진입 등으로 stn 이 선택됐지만 활성 결과(items)에 그 그룹이 없을 때,
  // 즐겨찾기 스냅샷(역 우선, 없으면 역×호선)으로 가상 그룹 1개를 조립해 지도 groups
  // 에만 합류시킨다. 그러면 기존 flyTo/마커/라벨이 그대로 동작해 별도 지도 배선이
  // 필요 없다. 리스트에는 넣지 않는다(검색/주변 결과 오염·중복 마커 방지). 좌표
  // 소스가 없는 순수 stn 딥링크(즐겨찾기도 없음)에는 적용 불가 — 기존 동작 유지.
  // useMemo — 안정 참조라야 도착 30초 폴링 리렌더마다 지도 fit 이 재발화하지 않는다.
  const favoriteMapGroup = useMemo<SubwayStationGroupItemType | null>(() => {
    if (!stn || selectedGroup) return null;
    if (favStationHit) {
      return {
        id: stn,
        name: favStationHit.name,
        lat: favStationHit.lat,
        lng: favStationHit.lng,
        lines: favStationHit.lines.map((lineId) => ({
          stationId: stn,
          lineId,
          lineName: subwayLineName(lineId),
          lat: favStationHit.lat,
          lng: favStationHit.lng,
        })),
      };
    }
    if (favLineHit) {
      return {
        id: stn,
        name: favLineHit.stationName,
        lat: favLineHit.lat,
        lng: favLineHit.lng,
        lines: [
          {
            stationId: stn,
            lineId: favLineHit.lineId,
            lineName: subwayLineName(favLineHit.lineId),
            lat: favLineHit.lat,
            lng: favLineHit.lng,
          },
        ],
      };
    }
    return null;
  }, [stn, selectedGroup, favStationHit, favLineHit]);

  // 지도 전용 그룹 — 활성 결과 + (필요 시) 즐겨찾기 가상 그룹. 리스트는 activeItems 만.
  const mapGroups = useMemo(
    () => (favoriteMapGroup ? [...activeItems, favoriteMapGroup] : activeItems),
    [activeItems, favoriteMapGroup],
  );

  // 호선 별 콜백 — 좌표를 확보할 수 있을 때만 제공(없으면 패널이 별을 숨긴다).
  // 스냅샷 조립(stationId=현재 stn, 좌표 대표)은 여기서 완결한다.
  const lineFavoriteProps =
    stn && selectedCoord
      ? {
          isLineFavorite: (lineId: string) => favorites.isLineFavorite(stn, lineId),
          onToggleLineFavorite: (lineId: string) =>
            favorites.toggleLine({
              stationId: stn,
              lineId,
              stationName: panelStationName,
              lat: selectedCoord.lat,
              lng: selectedCoord.lng,
            }),
        }
      : {};

  // 초기 화면(검색어·주변·선택 역 없음)에 노출할 즐겨찾기 섹션. 0개면 undefined 를
  // 넘겨 리스트 본체가 기존 빈 상태 안내를 그대로 보여준다.
  const favoritesSection = hasFavorites ? (
    <SubwayFavoriteSection
      stations={favorites.stations}
      lines={favorites.lines}
      onSelectStation={handleSelect}
      onSelectLine={handleSelect}
      onToggleStation={favorites.toggleStation}
      onToggleLine={favorites.toggleLine}
    />
  ) : undefined;

  const listProps = {
    q: qInput,
    nearMode,
    geoError,
    total: activeTotal,
    fetchedAt: activeFetchedAt,
    items: activeItems,
    isLoading: activeLoading,
    isError: activeError,
    selectedId: stn,
    selectedMissing,
    onChangeQ: handleChangeQ,
    onSelect: handleSelect,
    onRetry: handleRetry,
    onNearby: handleNearby,
    onClearNear: handleClearNear,
    isStationFavorite: favorites.isStationFavorite,
    onToggleStationFavorite: favorites.toggleStation,
    favoritesContent: favoritesSection,
  };

  // 역 선택 시 목록 대신 뜨는 도착 패널 — 데스크톱 좌패널/모바일 하단 공용.
  const arrivalPanel = stn ? (
    <SubwayArrivalPanel
      stationName={panelStationName}
      lines={panelLines}
      items={arrivalItems}
      fetchedAt={arrivalsForStn?.fetchedAt ?? null}
      isLoading={arrivalLoading}
      isError={arrivals.isError}
      notFound={arrivalNotFound}
      onBack={handleBack}
      onRetry={() => void arrivals.refetch()}
      trackedLineId={line}
      onTrackLine={handleTrackLine}
      {...lineFavoriteProps}
    />
  ) : null;

  return (
    <div className="flex w-full flex-col" style={{ height: `calc(100dvh - ${headerHeight}px)` }}>
      <TransitTabs active="subway" />
      <div className="min-h-0 flex-1">
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            데스크톱 (xl+) — 좌 검색 패널(400px) + 우 지도.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="hidden h-full xl:flex">
          {/* 역 선택 시 좌패널이 도착정보 뷰로 전환 — '← 목록'으로 복귀. */}
          <aside className="flex w-[400px] shrink-0 flex-col border-r">
            {arrivalPanel ?? <SubwayStationList {...listProps} />}
          </aside>
          <section className="relative flex-1">
            <SubwayStationsMap
              groups={mapGroups}
              selectedId={stn}
              onSelect={handleSelect}
              myLocation={effectiveNear}
              onResearchAt={nearMode ? handleResearchAt : undefined}
              onAutoResearchAt={nearMode ? handleAutoResearchAt : undefined}
              suppressFit={autoNear !== null || line !== null}
              loading={nearMode && nearby.isFetching}
              lineDetail={line ? (lineDetail.data ?? null) : null}
              lineColor={lineColor}
              onSelectStop={handleSelectStop}
              onCloseLine={handleCloseLine}
            />
          </section>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            모바일 (xl 미만) — 검색바 고정 / 지도 / 리스트 세로 적층.
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="flex h-full flex-col xl:hidden">
          <div className="border-b">
            <SubwayStationSearchBar
              q={qInput}
              nearMode={nearMode}
              total={activeTotal}
              fetchedAt={activeFetchedAt}
              truncated={truncated}
              onChangeQ={handleChangeQ}
              onNearby={handleNearby}
              onClearNear={handleClearNear}
            />
          </div>
          <div className="relative min-h-[40dvh] flex-1">
            <SubwayStationsMap
              groups={mapGroups}
              selectedId={stn}
              onSelect={handleSelect}
              myLocation={effectiveNear}
              onResearchAt={nearMode ? handleResearchAt : undefined}
              onAutoResearchAt={nearMode ? handleAutoResearchAt : undefined}
              suppressFit={autoNear !== null || line !== null}
              loading={nearMode && nearby.isFetching}
              lineDetail={line ? (lineDetail.data ?? null) : null}
              lineColor={lineColor}
              onSelectStop={handleSelectStop}
              onCloseLine={handleCloseLine}
            />
          </div>
          {/* 역 선택 시 하단 영역이 도착정보 뷰로 전환 — 패널은 내부 스크롤이라
              컨테이너는 flex 로만 감싼다. */}
          {arrivalPanel ? (
            <div className="flex h-[38dvh] flex-col border-t">{arrivalPanel}</div>
          ) : (
            <div className="h-[38dvh] overflow-y-auto border-t p-3">
              <SubwayStationListBody
                q={qInput}
                items={activeItems}
                nearMode={nearMode}
                geoError={geoError}
                isLoading={activeLoading}
                isError={activeError}
                selectedId={stn}
                selectedMissing={selectedMissing}
                onSelect={handleSelect}
                onRetry={handleRetry}
                isStationFavorite={favorites.isStationFavorite}
                onToggleStationFavorite={favorites.toggleStation}
                favoritesContent={favoritesSection}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
