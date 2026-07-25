import {
  busRouteTypeColor,
  resolveTrainSection,
  subwayDestinationLabel,
  subwayLineColor,
  subwayLineName,
} from '@repo/utils';
import type { PinnedRideDetail } from './usePinnedVehicle';
import type { AlightTarget } from '~/hooks/useTransitScreen';

// 탑승 상세 표시 모델 — 실시간 원본(위치 + 노선/호선 상세)을 화면 문구로 접는
// 순수 계산. 패널(렌더)과 하차 알림(스케줄)이 같은 '앞으로 지날 목록'을 봐야 해서
// 컴포넌트 밖으로 뺐다 — 두 벌로 계산하면 몇 번째 정차인지가 어긋날 수 있다.

// 앞으로 지날 정류장/역 표시 상한 — 버스 노선상세는 왕복 전체(수백 개)가 한
// 배열이라 전부 그리면 시트가 무거워진다. 넘치면 마지막 줄에 잔여 개수만.
const UPCOMING_LIMIT = 20;

// trainSttus 원문 → 상태 문구. 0진입/1도착/2출발/3전역출발.
const TRAIN_STATUS_TEXT: Record<string, string> = {
  '0': '진입 중',
  '1': '정차 중',
  '2': '출발',
  '3': '전역 출발',
};

export interface UpcomingItem {
  key: string;
  // 탭 시 넘길 식별자 — 버스는 stId, 지하철은 stationId.
  id: string;
  name: string;
  tag?: string;
  // 하차 지정 payload. 버스 가상정류장(arsId '0')은 도착정보가 없어 지정 불가.
  target: AlightTarget;
  alightDisabled?: boolean;
}

export interface RideView {
  // 원본이 아직 없으면 null(대기 화면) — 호출부가 행 탭 핸들러를 고르는 기준.
  mode: 'bus' | 'subway' | null;
  badge: string;
  color: string;
  title: string;
  status: string;
  statusSub: string | null;
  tags: string[];
  rows: { label: string; value: string }[];
  upcoming: UpcomingItem[];
  upcomingEmpty: string;
  moreCount: number;
  fetchedAt: string | null;
  stale: boolean;
  // 하차 지점 — 앞으로 지날 목록에서 몇 번째인지(1 = 다음). 목록에 없으면 null
  // (이미 지났거나 다른 분기).
  alightName: string | null;
  alightSteps: number | null;
}

// 상세 → 표시 모델. 모드 분기를 렌더에서 걷어내 JSX 를 한 벌로 유지한다.
export const buildRideView = (
  detail: PinnedRideDetail | null,
  label: string | null,
  alight: AlightTarget | null,
): RideView => {
  if (detail === null) {
    return {
      mode: null,
      badge: label ?? '탑승',
      color: '#6b7280',
      title: '탑승 중',
      status: '차량 위치를 불러오는 중…',
      statusSub: null,
      tags: [],
      rows: [],
      upcoming: [],
      upcomingEmpty: '다음 갱신을 기다리는 중입니다.',
      moreCount: 0,
      fetchedAt: null,
      stale: false,
      alightName: alight?.name ?? null,
      alightSteps: null,
    };
  }
  return detail.mode === 'bus'
    ? buildBusView(detail, label, alight)
    : buildSubwayView(detail, label, alight);
};

// 하차 지점이 '앞으로 지날' 목록의 몇 번째인지(1 = 다음). 못 찾으면 null.
const stepsToAlight = (all: UpcomingItem[], alight: AlightTarget | null): number | null => {
  if (!alight) return null;
  const key = alight.mode === 'bus' ? alight.stId : alight.stationId;
  const i = all.findIndex((u) => u.id === key);
  return i < 0 ? null : i + 1;
};

const buildBusView = (
  detail: Extract<PinnedRideDetail, { mode: 'bus' }>,
  label: string | null,
  alight: AlightTarget | null,
): RideView => {
  const { vehicle, route } = detail;
  const info = route?.info ?? null;
  const stations = route?.stations ?? [];
  const badge = info?.routeName ?? label ?? '버스';
  const color = info ? busRouteTypeColor(info.routeType) : '#6b7280';

  // sectOrd = 현재 구간의 시작 정류소 seq(지도 보간과 같은 규약) — 직전 정류장.
  const ord = vehicle.sectOrd;
  const at = ord === null ? null : (stations.find((s) => s.seq === ord) ?? null);
  const next = ord === null ? null : (stations.find((s) => s.seq === ord + 1) ?? null);
  const stopped = vehicle.stopFlag === '1';

  const status = stopped
    ? at
      ? `${at.name} 정차 중`
      : '정차 중'
    : at && next
      ? `${at.name} → ${next.name}`
      : next
        ? `${next.name} 방면 주행 중`
        : '주행 중';
  const statusSub = stopped
    ? next
      ? `다음 ${next.name}`
      : null
    : at?.direction
      ? `${at.direction} 방면`
      : null;

  const tags: string[] = [];
  if (vehicle.plainNo) tags.push(vehicle.plainNo);

  const rows: { label: string; value: string }[] = [];
  if (info) {
    if (info.stStationName || info.edStationName) {
      rows.push({ label: '구간', value: `${info.stStationName} ↔ ${info.edStationName}` });
    }
    if (info.termMin != null) rows.push({ label: '배차', value: `${info.termMin}분` });
    if (info.firstBusTime && info.lastBusTime) {
      rows.push({ label: '운행', value: `${info.firstBusTime} ~ ${info.lastBusTime}` });
    }
    if (info.corpName) rows.push({ label: '운수사', value: info.corpName });
  }

  // 남은 경유 정류소 — 회차점(transYn)까지가 이번 편도. 이미 지났으면 종점까지.
  let rest = ord === null ? [] : stations.filter((s) => s.seq > ord);
  const turnAt = rest.findIndex((s) => s.isTurnPoint);
  if (turnAt >= 0) rest = rest.slice(0, turnAt + 1);
  const upcomingAll: UpcomingItem[] = rest.map((s) => ({
    key: `${s.seq}:${s.stId}`,
    id: s.stId,
    name: s.name,
    ...(s.isTurnPoint ? { tag: '회차' } : {}),
    target: { mode: 'bus' as const, stId: s.stId, arsId: s.arsId, name: s.name },
    ...(s.arsId === '0' ? { alightDisabled: true } : {}),
  }));
  const upcoming = upcomingAll.slice(0, UPCOMING_LIMIT);

  return {
    mode: 'bus',
    badge,
    color,
    title: info ? `${info.edStationName} 방면` : '탑승 중',
    status,
    statusSub,
    tags,
    rows,
    upcoming,
    upcomingEmpty:
      ord === null
        ? '차량 구간 정보가 없어 남은 정류장을 계산할 수 없습니다.'
        : '남은 정류장 정보가 없습니다.',
    moreCount: Math.max(0, upcomingAll.length - upcoming.length),
    fetchedAt: detail.fetchedAt,
    stale: detail.stale,
    alightName: alight?.name ?? null,
    alightSteps: stepsToAlight(upcomingAll, alight),
  };
};

const buildSubwayView = (
  detail: Extract<PinnedRideDetail, { mode: 'subway' }>,
  label: string | null,
  alight: AlightTarget | null,
): RideView => {
  const { train, line } = detail;
  const lineId = line?.lineId ?? null;
  const color = lineId ? subwayLineColor(lineId) : '#6b7280';
  const dest = subwayDestinationLabel(train.destinationName) || (label ?? '');

  const tags: string[] = [];
  if (train.expressType !== null) tags.push('급행');
  if (train.isLastTrain) tags.push('막차');

  // 지도 보간과 같은 판정(지선 분기·순환 방향) — 순서만 쓰는 경량 section.
  const order = (line?.sections ?? []).map((sec) => ({
    sectionKey: sec.branchKey,
    isLoop: sec.isLoop,
    byName: new Map(sec.stations.map((s, i) => [s.name, i])),
    stationCount: sec.stations.length,
  }));
  const match =
    order.length > 0
      ? resolveTrainSection(order, {
          statnNm: train.statnNm,
          trainStatus: train.trainStatus,
          updnLine: train.updnLine,
          destinationName: train.destinationName,
        })
      : null;
  const section = match ? (line?.sections.find((s) => s.branchKey === match.sectionKey) ?? null) : null;

  // 진행 방향으로 이후 역 — 순환은 한 바퀴(N-1) 상한, 비순환은 종점에서 끊김.
  // '0'(진입)·'3'(전역 출발)은 아직 현재역에 닿지 않은 상태라 현재역부터 넣는다
  // (locateTrain 의 상태 분수와 같은 해석 — 도착/출발만 '지났음').
  const beforeCurrent = train.trainStatus === '0' || train.trainStatus === '3';
  const upcomingAll: UpcomingItem[] = [];
  if (section && match && match.dir !== 0) {
    const n = section.stations.length;
    const max = section.isLoop ? n - 1 : n;
    for (let step = beforeCurrent ? 0 : 1; step <= max; step++) {
      const raw = match.stationIdx + match.dir * step;
      const idx = section.isLoop ? ((raw % n) + n) % n : raw;
      if (idx < 0 || idx >= n) break;
      const st = section.stations[idx]!;
      upcomingAll.push({
        key: `${step}:${st.stationId}`,
        id: st.stationId,
        name: st.name,
        ...(st.isTransfer ? { tag: '환승' } : {}),
        target: { mode: 'subway' as const, stationId: st.stationId, name: st.name },
      });
    }
  }
  const upcoming = upcomingAll.slice(0, UPCOMING_LIMIT);

  const statusText = TRAIN_STATUS_TEXT[train.trainStatus] ?? '운행 중';
  // 상태 문구가 이미 그 역을 말하고 있으면(진입 중 등) '다음 ○○' 중복 제거.
  const firstUpcoming = upcomingAll[0]?.name ?? null;
  const nextName = firstUpcoming === train.statnNm ? null : firstUpcoming;

  const rows: { label: string; value: string }[] = [];
  if (lineId) rows.push({ label: '호선', value: subwayLineName(lineId) });
  if (train.destinationName) rows.push({ label: '행선', value: train.destinationName });
  if (section?.branchName) rows.push({ label: '구간', value: section.branchName });
  rows.push({ label: '열차번호', value: train.trainNo });
  if (upcomingAll.length > 0) {
    rows.push({ label: '남은 역', value: `${upcomingAll.length}개` });
  }

  return {
    mode: 'subway',
    badge: lineId ? subwayLineName(lineId) : '열차',
    color,
    title: dest || '탑승 중',
    status: `${train.statnNm} ${statusText}`,
    statusSub: nextName ? `다음 ${nextName}` : null,
    tags,
    rows,
    upcoming,
    upcomingEmpty:
      match && match.dir === 0
        ? '진행 방향을 판정하지 못해 남은 역을 계산할 수 없습니다.'
        : '노선 순서 정보가 없어 남은 역을 계산할 수 없습니다.',
    moreCount: Math.max(0, upcomingAll.length - upcoming.length),
    fetchedAt: train.receivedAt ?? detail.fetchedAt,
    stale: false,
    alightName: alight?.name ?? null,
    alightSteps: stepsToAlight(upcomingAll, alight),
  };
};
