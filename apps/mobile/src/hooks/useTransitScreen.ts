import { useReducer } from 'react';
import { roundCoord } from '@repo/utils';

// 대중교통 화면 상태 오케스트레이션 — 웹 BusPage/SubwayPage 의 URL-as-truth
// 계약(setSearchParams 곳곳의 배타 규칙)을 단일 reducer 액션으로 중앙화한 것.
// RN 은 URL 이 없고 탭 스크린이 상시 마운트라 로컬 reducer 로 충분하다.
//
// 이식한 계약(웹과 1:1):
//  - q(검색) XOR near(주변) — 검색어 입력은 near 를, 주변 진입은 q 를 지운다.
//  - 검색/주변 진입 시 이전 선택(stn/stId·line/routeId·to)은 다른 결과셋의
//    것이라 일괄 해제.
//  - near(명시: 버튼/재검색) vs autoNear(지도 패닝 자동 재조회) 이원화 —
//    effectiveNear = autoNear ?? near.
//  - 역/정류장 전환 시 "추적 노선 위 이동이면 line/routeId 유지" — 판정은
//    호출부(노선 상세 ref)가 하고 액션에 boolean 으로 실어 보낸다(reducer 순수).
//  - 시간표/길찾기 뷰 배타 — 서로 열 때 상대를 닫는다. 길찾기는 line 추적과도
//    배타(열 때 해제).

export type TransitMode = 'bus' | 'subway';

interface Coord {
  lat: number;
  lng: number;
}


export interface SubwayScreenState {
  // 라이브 검색어(디바운스 반영값) — 입력 draft 는 헤더 로컬(IME 안전).
  qInput: string;
  // 확정 검색어(Enter/검색 버튼) — 상대 도메인(버스) 크로스 조회 기준.
  submittedQ: string;
  near: Coord | null;
  autoNear: Coord | null;
  geoError: string | null;
  // 선택 역 — 그룹 대표 id(`${lineId}:${name}`).
  stn: string | null;
  // 추적 호선(4자리 lineId).
  line: string | null;
  // 길찾기 도착역(그룹 대표 id).
  to: string | null;
  pathViewOpen: boolean;
  timetableView: { lineId: string; stationId: string } | null;
  // 도착 패널 '지도에서 보기' 대기 — nonce 로 같은 열차 재요청도 재발화.
  pendingFollow: { trainNo: string; nonce: number } | null;
}

export interface BusScreenState {
  // 제출된 검색어(버스는 제출형 — 쿼터 보호).
  q: string;
  near: Coord | null;
  autoNear: Coord | null;
  geoError: string | null;
  stId: string | null;
  routeId: string | null;
}

export interface TransitScreenState {
  mode: TransitMode;
  subway: SubwayScreenState;
  bus: BusScreenState;
}

const INITIAL_SUBWAY: SubwayScreenState = {
  qInput: '',
  submittedQ: '',
  near: null,
  autoNear: null,
  geoError: null,
  stn: null,
  line: null,
  to: null,
  pathViewOpen: false,
  timetableView: null,
  pendingFollow: null,
};

const INITIAL_BUS: BusScreenState = {
  q: '',
  near: null,
  autoNear: null,
  geoError: null,
  stId: null,
  routeId: null,
};

const INITIAL: TransitScreenState = {
  mode: 'subway',
  subway: INITIAL_SUBWAY,
  bus: INITIAL_BUS,
};

export type TransitScreenAction =
  | { type: 'SET_MODE'; mode: TransitMode }
  // ── 지하철 ──────────────────────────────────────────────────────────────
  | { type: 'SUBWAY_CHANGE_Q'; q: string }
  | { type: 'SUBWAY_SUBMIT_Q' }
  // onTrackedLine: 새 역이 추적 호선 경유역(id/역명 일치)인지 — 호출부 판정.
  | { type: 'SUBWAY_SELECT_STATION'; id: string; onTrackedLine: boolean }
  | { type: 'SUBWAY_BACK' }
  | { type: 'SUBWAY_TRACK_LINE'; lineId: string }
  | { type: 'SUBWAY_CLOSE_LINE' }
  | { type: 'SUBWAY_LOCATE_TRAIN'; lineId: string; trainNo: string; nonce: number }
  | { type: 'SUBWAY_SET_NEAR'; coord: Coord }
  | { type: 'SUBWAY_GEO_ERROR'; message: string }
  | { type: 'SUBWAY_RESEARCH_AT'; coord: Coord }
  | { type: 'SUBWAY_AUTO_RESEARCH_AT'; coord: Coord }
  | { type: 'SUBWAY_CLEAR_NEAR' }
  | { type: 'SUBWAY_OPEN_TIMETABLE'; lineId: string; stationId: string }
  | { type: 'SUBWAY_CLOSE_TIMETABLE' }
  | { type: 'SUBWAY_OPEN_PATH' }
  | { type: 'SUBWAY_SELECT_DEST'; id: string }
  | { type: 'SUBWAY_CLEAR_DEST' }
  | { type: 'SUBWAY_CLOSE_PATH' }
  // ── 버스 ────────────────────────────────────────────────────────────────
  | { type: 'BUS_SUBMIT_Q'; q: string }
  // onTrackedRoute: 새 정류장이 추적 노선 경유 정류소인지 — 호출부 판정.
  | { type: 'BUS_SELECT_STATION'; stId: string; onTrackedRoute: boolean }
  | { type: 'BUS_BACK' }
  | { type: 'BUS_TOGGLE_ROUTE'; routeId: string }
  | { type: 'BUS_CLOSE_ROUTE' }
  | { type: 'BUS_SET_NEAR'; coord: Coord }
  | { type: 'BUS_GEO_ERROR'; message: string }
  | { type: 'BUS_RESEARCH_AT'; coord: Coord }
  | { type: 'BUS_AUTO_RESEARCH_AT'; coord: Coord }
  | { type: 'BUS_CLEAR_NEAR' }
  // ── 통합(겸표시/즐겨찾기/크로스 검색) — 상대 모드 전환 + near/검색어 승계 +
  //    선택 세팅. q 는 크로스 검색 딥링크(같은 검색어로 상대 도메인 복원)용. ──
  | { type: 'CROSS_JUMP_TO_BUS'; stId?: string; routeId?: string; near: Coord | null; q?: string }
  | { type: 'CROSS_JUMP_TO_SUBWAY'; stn?: string; near: Coord | null; q?: string };

const round = (c: Coord): Coord => ({ lat: roundCoord(c.lat), lng: roundCoord(c.lng) });

const reducer = (
  state: TransitScreenState,
  action: TransitScreenAction,
): TransitScreenState => {
  switch (action.type) {
    case 'SET_MODE':
      return state.mode === action.mode ? state : { ...state, mode: action.mode };

    // ── 지하철 ──────────────────────────────────────────────────────────────
    case 'SUBWAY_CHANGE_Q':
      // 검색어 입력 → 주변/선택/추적/경로 전부 해제(웹 handleChangeQ). 비우면
      // 확정 검색어도 리셋(크로스 섹션 제거).
      return {
        ...state,
        subway: {
          ...state.subway,
          qInput: action.q,
          submittedQ: action.q.trim() === '' ? '' : state.subway.submittedQ,
          geoError: null,
          near: null,
          autoNear: null,
          stn: null,
          line: null,
          to: null,
          pathViewOpen: false,
          timetableView: null,
        },
      };
    case 'SUBWAY_SUBMIT_Q':
      return {
        ...state,
        subway: { ...state.subway, submittedQ: state.subway.qInput },
      };
    case 'SUBWAY_SELECT_STATION':
      // 새 역 선택 — 시간표/길찾기 뷰 닫고 도착 패널로. 추적 호선은 노선 위
      // 이동이면 유지, 아니면 해제. 이전 도착역(to)은 해제.
      return {
        ...state,
        subway: {
          ...state.subway,
          stn: action.id,
          line: action.onTrackedLine ? state.subway.line : null,
          to: null,
          pathViewOpen: false,
          timetableView: null,
        },
      };
    case 'SUBWAY_BACK':
      return {
        ...state,
        subway: {
          ...state.subway,
          stn: null,
          line: null,
          to: null,
          pathViewOpen: false,
          timetableView: null,
        },
      };
    case 'SUBWAY_TRACK_LINE':
      return {
        ...state,
        subway: {
          ...state.subway,
          line: state.subway.line === action.lineId ? null : action.lineId,
        },
      };
    case 'SUBWAY_CLOSE_LINE':
      return { ...state, subway: { ...state.subway, line: null } };
    case 'SUBWAY_LOCATE_TRAIN':
      return {
        ...state,
        subway: {
          ...state.subway,
          line: action.lineId,
          pendingFollow: { trainNo: action.trainNo, nonce: action.nonce },
        },
      };
    case 'SUBWAY_SET_NEAR':
      // 주변 진입 — q(입력 포함) 배타 해제 + 선택 일괄 해제.
      return {
        ...state,
        subway: {
          ...state.subway,
          near: round(action.coord),
          autoNear: null,
          geoError: null,
          qInput: '',
          stn: null,
          line: null,
          to: null,
          pathViewOpen: false,
          timetableView: null,
        },
      };
    case 'SUBWAY_GEO_ERROR':
      return {
        ...state,
        subway: { ...state.subway, geoError: action.message, autoNear: null },
      };
    case 'SUBWAY_RESEARCH_AT':
      // 명시 재검색 — 기준점 교체 + 선택 해제(새 영역과 무관). autoNear 리셋.
      return {
        ...state,
        subway: {
          ...state.subway,
          near: round(action.coord),
          autoNear: null,
          geoError: null,
          stn: null,
          line: null,
          to: null,
          pathViewOpen: false,
          timetableView: null,
        },
      };
    case 'SUBWAY_AUTO_RESEARCH_AT':
      // 자동 재조회 — 좌표만 교체(선택/추적 유지 — 웹과 동일).
      return {
        ...state,
        subway: { ...state.subway, autoNear: round(action.coord) },
      };
    case 'SUBWAY_CLEAR_NEAR':
      return {
        ...state,
        subway: {
          ...state.subway,
          near: null,
          autoNear: null,
          geoError: null,
          stn: null,
          line: null,
          to: null,
          pathViewOpen: false,
          timetableView: null,
        },
      };
    case 'SUBWAY_OPEN_TIMETABLE':
      return {
        ...state,
        subway: {
          ...state.subway,
          timetableView: { lineId: action.lineId, stationId: action.stationId },
          pathViewOpen: false,
        },
      };
    case 'SUBWAY_CLOSE_TIMETABLE':
      return { ...state, subway: { ...state.subway, timetableView: null } };
    case 'SUBWAY_OPEN_PATH':
      // 길찾기 열기 — 시간표 닫고, line 추적과 배타(폴리라인 충돌 방지).
      return {
        ...state,
        subway: {
          ...state.subway,
          pathViewOpen: true,
          timetableView: null,
          line: null,
        },
      };
    case 'SUBWAY_SELECT_DEST':
      return { ...state, subway: { ...state.subway, to: action.id } };
    case 'SUBWAY_CLEAR_DEST':
      return { ...state, subway: { ...state.subway, to: null } };
    case 'SUBWAY_CLOSE_PATH':
      return {
        ...state,
        subway: { ...state.subway, pathViewOpen: false, to: null },
      };

    // ── 버스 ────────────────────────────────────────────────────────────────
    case 'BUS_SUBMIT_Q':
      // 제출형 검색 — 주변/선택/추적 일괄 해제(웹 BusPage handleSubmit).
      return {
        ...state,
        bus: {
          ...state.bus,
          q: action.q,
          near: null,
          autoNear: null,
          geoError: null,
          stId: null,
          routeId: null,
        },
      };
    case 'BUS_SELECT_STATION':
      // 같은 정류장 재선택이면 routeId 유지(웹: stId 변경 시에만 노선 해제 판정).
      return {
        ...state,
        bus: {
          ...state.bus,
          stId: action.stId,
          routeId:
            state.bus.stId === action.stId || action.onTrackedRoute
              ? state.bus.routeId
              : null,
        },
      };
    case 'BUS_BACK':
      return {
        ...state,
        bus: { ...state.bus, stId: null, routeId: null },
      };
    case 'BUS_TOGGLE_ROUTE':
      return {
        ...state,
        bus: {
          ...state.bus,
          routeId: state.bus.routeId === action.routeId ? null : action.routeId,
        },
      };
    case 'BUS_CLOSE_ROUTE':
      return { ...state, bus: { ...state.bus, routeId: null } };
    case 'BUS_SET_NEAR':
      return {
        ...state,
        bus: {
          ...state.bus,
          near: round(action.coord),
          autoNear: null,
          geoError: null,
          q: '',
          stId: null,
          routeId: null,
        },
      };
    case 'BUS_GEO_ERROR':
      return {
        ...state,
        bus: { ...state.bus, geoError: action.message, autoNear: null },
      };
    case 'BUS_RESEARCH_AT':
      return {
        ...state,
        bus: {
          ...state.bus,
          near: round(action.coord),
          autoNear: null,
          geoError: null,
          stId: null,
          routeId: null,
        },
      };
    case 'BUS_AUTO_RESEARCH_AT':
      return { ...state, bus: { ...state.bus, autoNear: round(action.coord) } };
    case 'BUS_CLEAR_NEAR':
      return {
        ...state,
        bus: {
          ...state.bus,
          near: null,
          autoNear: null,
          geoError: null,
          stId: null,
          routeId: null,
        },
      };

    // ── 통합 — 상대 모드 전환 + near 승계 + 선택 세팅(웹 크로스 navigate) ──
    case 'CROSS_JUMP_TO_BUS':
      return {
        ...state,
        mode: 'bus',
        bus: {
          ...state.bus,
          q: action.q ?? '',
          near: action.near ? round(action.near) : null,
          autoNear: null,
          geoError: null,
          stId: action.stId ?? null,
          routeId: action.routeId ?? null,
        },
      };
    case 'CROSS_JUMP_TO_SUBWAY': {
      const q = action.q ?? '';
      return {
        ...state,
        mode: 'subway',
        subway: {
          ...state.subway,
          qInput: q,
          // q 승계 진입은 제출로 간주(웹의 딥링크 q → submittedQ 복원과 동일)
          // — 지하철 초기 화면에서 버스 크로스 섹션이 바로 선다.
          submittedQ: q.trim().length >= 2 ? q : '',
          near: action.near ? round(action.near) : null,
          autoNear: null,
          geoError: null,
          stn: action.stn ?? null,
          line: null,
          to: null,
          pathViewOpen: false,
          timetableView: null,
        },
      };
    }
  }
};

export const useTransitScreen = () => useReducer(reducer, INITIAL);
