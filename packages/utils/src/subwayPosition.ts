// 실시간 열차 역간 보간 — 6차 코어 알고리즘(순수 함수). 지하철 실시간 API 는 GPS
// 가 없고 현재역(statnId)+상태(trainStatus)만 준다. 5차 노선 순서(sections)의 역
// 좌표를 호길이(s)로 이어, 상태로 세그먼트 위 분수를 잡아 역간 위치를 추정한다.
//
// 방향 판정·상태 분수는 프로브 관찰로 보정될 수 있어 상수/옵션으로 집약한다
// (하드코딩 산개 금지). 좌표·호길이 계산은 routePath.ts 전면 재사용.
import type { LatLng } from './geo.js';
import {
  bearingAtRoutePathS,
  sliceRoutePath,
  type RoutePathIndex,
} from './routePath.js';

// 호출측(SubwayStationsMap)이 lineDetail section 마다 조립하는 기하. index 는
// stations 좌표를 seq 순으로 createRoutePathIndex 한 것 — 순환(isLoop)이면 첫
// 좌표를 끝에 덧대 닫아(points 길이 = stationCount+1) 시임을 매끄럽게 한다.
export interface TrainSection {
  sectionKey: string;
  index: RoutePathIndex;
  isLoop: boolean;
  // 역명 → 역 순번(0-based, seq asc). 실시간 응답엔 마스터 statnId 가 없어(계약)
  // 역명(statnNm)으로 조인한다. 역 i 의 호길이 = stationS?.[i] ?? index.cum[i].
  byName: Map<string, number>;
  // 역 개수 N. (isLoop 면 index.points 는 N+1, cum[N] = totalM.)
  stationCount: number;
  // 실형상 anchor — index 가 역 좌표 직선이 아닌 실형상(선로 기하)일 때 역 i 의
  // 호길이(m). 미지정이면 index.points 가 곧 역 좌표라 cum[i] 를 쓴다(기존 동작).
  stationS?: ArrayLike<number>;
}

// 역 i 의 호길이 — 실형상 anchor 우선, 없으면 cum[i](역 좌표 = 형상 점).
const stationSAt = (sec: TrainSection, i: number): number =>
  sec.stationS !== undefined ? sec.stationS[i]! : sec.index.cum[i]!;

// trainStatus → [직전역→현재역] 세그먼트 위 진행 분수. 프로브로 보정 가능하게 export.
// '2'(출발)만 다음 세그먼트(현재역→다음역)의 시작 분수다.
export const TRAIN_STATUS_FRACTION: Readonly<Record<string, number>> = {
  '3': 0.2, // 전역 출발 — 직전 역을 막 떠남
  '0': 0.9, // 진입 — 현재역에 거의 도착
  '1': 1.0, // 도착 — 현재역
  '2': 0.1, // 출발 — 현재역을 막 떠나 다음역으로
};

// via 슬라이스 점프 상한 기본값(m) — 프로브 실측: 급행도 통과역을 statnId 로 보고해
// (물리 위치 추종) 급행/일반 세그 델타가 같다(9호선 급행 Δ1=일반 Δ1). 30초 폴링 사이
// 통상 2~3역이라 여유 있게 4역(~4km). 초과는 데이터 점프/시임 모호로 직선 폴백(null).
export const DEFAULT_MAX_SPAN_M = 4_000;
// 유의미한 최소 이동(m) — 이보다 짧으면 via 없이(제자리) 처리.
const MIN_MOVE_M = 3;

export interface LocateOptions {
  // 행선(destinationName)으로 방향을 못 정할 때 updnLine → 방향(+1: seq 증가 / -1)
  // 매핑. 프로브 확정 전 임시 기본값(주입으로 덮어씀). 미지정 값이면 방향 미정.
  updnToDir?: Readonly<Record<string, 1 | -1>>;
  // trainStatus 분수 오버라이드(기본 TRAIN_STATUS_FRACTION).
  statusFraction?: Readonly<Record<string, number>>;
}

export interface LocateInput {
  statnNm: string;
  trainStatus: string;
  updnLine: string;
  destinationName: string | null;
}

export interface TrainLocation {
  sectionKey: string;
  // 호길이(m) — 소속 section index 기준. pointAtRoutePathS 로 좌표 환산.
  s: number;
  // 진행 방위각(도, 북=0) — 하행(방향 -1)은 접선 +180 보정. 미정이면 null.
  bearing: number | null;
}

// 좌표/호길이 없이 '운행 순서'만 있는 section — 지도 보간이 아니라 '다음 역·남은
// 역' 같은 순서 질의용. TrainSection 이 구조적으로 이 타입을 만족한다.
export interface TrainSectionOrder {
  sectionKey: string;
  isLoop: boolean;
  byName: Map<string, number>;
  stationCount: number;
}

export interface TrainSectionMatch {
  sectionKey: string;
  // 현재역의 section 내 순번(0-based).
  stationIdx: number;
  // 진행 방향 — +1 seq 증가 / -1 감소 / 0 미정(현재역 정지).
  dir: 1 | -1 | 0;
}

// updnLine 기본 방향 매핑(폴백). 프로브 실측(2026-07-06 9호선 비순환): '0'=상행=seq
// 감소(-1, 개화 방면 18/19), '1'=하행=seq 증가(+1, 보훈병원 13/13). 전 노선 동일
// 보장은 없어 주입(opts.updnToDir)으로 덮어쓸 수 있고, 2호선 순환은 updn 이 혼재라
// 행선(destination) 비교가 1차 — 이건 행선 미해석 시 폴백일 뿐이다.
const DEFAULT_UPDN_TO_DIR: Readonly<Record<string, 1 | -1>> = { '0': -1, '1': 1 };

// 행선명(statnTnm) → 순수 역명 정규화. '종착'/'지선' 접미를 모두 떼 section 의 순수
// 역명(byName)과 조인/방향 판정에 쓴다(예: '성수종착'/'성수지선' → '성수'). 실제 역명
// 중 이 접미로 끝나는 것이 없어 안전. null 은 통과. (라벨은 subwayDestinationLabel 별도.)
export function normalizeStationName(name: string | null): string | null {
  if (name == null) return null;
  const stripped = name.replace(/(종착|지선)$/u, '');
  return stripped.length > 0 ? stripped : name;
}

// 알약 라벨 — 행선명을 지도 표기로. 프로브 실측 표기 반영: '종착'은 '행'으로
// ('성수종착'→'성수행'), '지선' 행선은 그대로('성수지선' — 지선 종착 구분 유지),
// 일반 역명은 '행' 접미('신도림'→'신도림행'). 빈/누락은 빈 문자열(색 알약만).
export function subwayDestinationLabel(name: string | null): string {
  if (name == null || name === '') return '';
  if (name.endsWith('지선')) return name;
  if (name.endsWith('종착')) return `${name.slice(0, -2)}행`;
  return `${name}행`;
}

// 세그먼트 양 끝 역의 호길이 — 순환은 시임을 넘을 때 ±totalM 로 방향(dir) 단조가
// 되게 보정한다. 비순환은 범위 밖 인덱스면 null(호출측이 현재역에 정지).
const segmentEndpointsS = (
  sec: TrainSection,
  fromIdx: number,
  toIdx: number,
  dir: 1 | -1,
): { sFrom: number; sTo: number } | null => {
  const { totalM } = sec.index;
  const N = sec.stationCount;
  if (sec.isLoop) {
    const wf = ((fromIdx % N) + N) % N;
    const wt = ((toIdx % N) + N) % N;
    const sFrom = stationSAt(sec, wf);
    let sTo = stationSAt(sec, wt);
    // 전진(+s)인데 to 가 from 이하면 시임을 넘은 것 → +totalM. 후진은 반대.
    if (dir === 1 && sTo < sFrom) sTo += totalM;
    if (dir === -1 && sTo > sFrom) sTo -= totalM;
    return { sFrom, sTo };
  }
  if (fromIdx < 0 || fromIdx > N - 1 || toIdx < 0 || toIdx > N - 1) return null;
  return { sFrom: stationSAt(sec, fromIdx), sTo: stationSAt(sec, toIdx) };
};

// 현재역이 속한 section + 그 안의 순번 + 진행 방향. 좌표를 안 쓰므로 지도 보간
// (locateTrain)과 순서 질의('다음 역'·'남은 역') 양쪽이 같은 판정을 공유한다 —
// 지선 분기 해소·순환 방향 규칙을 두 번 구현하지 않기 위한 분리.
export function resolveTrainSection<S extends TrainSectionOrder>(
  sections: S[],
  item: LocateInput,
  opts: Pick<LocateOptions, 'updnToDir'> = {},
): (TrainSectionMatch & { section: S }) | null {
  const cands = sections.filter((sec) => sec.byName.has(item.statnNm));
  if (cands.length === 0) return null;
  // 행선(statnTnm)은 '성수종착'/'성수지선'처럼 접미가 붙어 와 순수 역명으로 정규화해
  // section.byName 과 조인한다. '지선' 행선은 공용 분기역에서 main·지선이 겹칠 때
  // 지선 section 을 우선(statnTid 기반 seq 매칭의 FE 근사).
  const normDest = normalizeStationName(item.destinationName);
  const preferBranch = item.destinationName != null && item.destinationName.endsWith('지선');
  let sec: S | undefined;
  if (normDest != null) {
    const withDest = cands.filter((c) => c.byName.has(normDest));
    sec = preferBranch ? (withDest.find((c) => c.sectionKey !== 'main') ?? withDest[0]) : withDest[0];
  }
  sec = sec ?? cands.find((c) => c.sectionKey === 'main') ?? cands[0]!;

  const cur = sec.byName.get(item.statnNm)!;
  const N = sec.stationCount;

  // 방향 — 행선 seq 비교(순환은 짧은 호), 미발견 시 updn 보조.
  let dir: 1 | -1 | 0 = 0;
  const destIdx = normDest != null ? sec.byName.get(normDest) : undefined;
  if (destIdx !== undefined && destIdx !== cur) {
    if (sec.isLoop) {
      const fwd = (destIdx - cur + N) % N;
      const bwd = (cur - destIdx + N) % N;
      dir = fwd <= bwd ? 1 : -1;
    } else {
      dir = destIdx > cur ? 1 : -1;
    }
  } else {
    dir = (opts.updnToDir ?? DEFAULT_UPDN_TO_DIR)[item.updnLine] ?? 0;
  }

  return { sectionKey: sec.sectionKey, stationIdx: cur, dir, section: sec };
}

// 열차 위치 추정 — 현재역이 있는 section 선택(행선까지 포함하는 쪽 우선 = 지선
// 분기 해소) → 방향 → 상태 분수 → 호길이 s + 방위각. 현재역이 어느 section 에도
// 없으면 null(호출측이 item.lat/lng 마커로 강등).
export function locateTrain(
  sections: TrainSection[],
  item: LocateInput,
  opts: LocateOptions = {},
): TrainLocation | null {
  const match = resolveTrainSection(sections, item, opts);
  if (!match) return null;
  const sec = match.section;
  const cur = match.stationIdx;
  const dir = match.dir;
  const total = sec.index.totalM;

  // 방향 미정 — 현재역에 정지(방위각 없음).
  if (dir === 0) return { sectionKey: sec.sectionKey, s: stationSAt(sec, cur), bearing: null };

  const frac = opts.statusFraction ?? TRAIN_STATUS_FRACTION;
  const f = frac[item.trainStatus] ?? 1.0;
  // '2'(출발)은 [현재역→다음역], 그 외는 [직전역→현재역]. 방향(dir)으로 인접역 결정.
  const isNextSeg = item.trainStatus === '2';
  const fromIdx = isNextSeg ? cur : cur - dir;
  const toIdx = isNextSeg ? cur + dir : cur;
  const seg = segmentEndpointsS(sec, fromIdx, toIdx, dir);
  // 종점 밖(비순환 클램프) — 현재역에 정지.
  if (!seg) return { sectionKey: sec.sectionKey, s: stationSAt(sec, cur), bearing: null };

  let s = seg.sFrom + f * (seg.sTo - seg.sFrom);
  // 순환만 시임 랩 — 비순환은 클램프(종착역 s=total 이 0 으로 랩되면 시점으로 점프).
  s = sec.isLoop ? ((s % total) + total) % total : Math.min(Math.max(s, 0), total);
  const base = bearingAtRoutePathS(sec.index, s);
  const bearing = base == null ? null : dir === 1 ? base : (base + 180) % 360;
  return { sectionKey: sec.sectionKey, s, bearing };
}

// 폴링 간 이동의 도로 경유 웨이포인트(via) — 이전/현재 호길이로 슬라이스. 하행
// (s 감소)은 reverse 로 진행 순서를 맞춘다. 정지(미세 이동)·점프(상한 초과)·순환
// 시임 교차는 null(호출측/ MapCanvas 가 직선 보간 폴백). 순환은 링에서 짧은 호를 고른다.
export function sliceForMove(
  index: RoutePathIndex,
  sPrev: number,
  sCur: number,
  opts: { isLoop: boolean; maxSpanM?: number },
): LatLng[] | null {
  const total = index.totalM;
  const maxSpan = opts.maxSpanM ?? DEFAULT_MAX_SPAN_M;
  if (!opts.isLoop) {
    const span = Math.abs(sCur - sPrev);
    if (span < MIN_MOVE_M || span > maxSpan) return null;
    return sCur >= sPrev
      ? sliceRoutePath(index, sPrev, sCur)
      : sliceRoutePath(index, sCur, sPrev).reverse();
  }
  // 순환 — 링에서 전진/후진 이동량 중 짧은 쪽이 실제 경로.
  const fwd = (((sCur - sPrev) % total) + total) % total;
  const bwd = (((sPrev - sCur) % total) + total) % total;
  const span = Math.min(fwd, bwd);
  if (span < MIN_MOVE_M || span > maxSpan) return null;
  if (fwd <= bwd) {
    // 전진 — 시임을 넘으면 직선 폴백(인접역 간이라 무해).
    return sCur >= sPrev ? sliceRoutePath(index, sPrev, sCur) : null;
  }
  // 후진 — 시임을 넘으면 직선 폴백.
  return sCur <= sPrev ? sliceRoutePath(index, sCur, sPrev).reverse() : null;
}
