import { useMemo } from 'react';
import {
  useBusPositions,
  useBusRouteDetail,
  useSubwayLineDetail,
  useSubwayLinePositions,
} from '@repo/shared';
import {
  buildBusVehicleDirDataUrl,
  buildBusVehiclePillDataUrl,
  buildSubwayTrainDirDataUrl,
  buildSubwayTrainPillDataUrl,
  busRouteTypeColor,
  roundCoord,
  subwayDestinationLabel,
  subwayLineColor,
} from '@repo/utils';
import type { BridgeRouteLine, BridgeVehicle } from './transitMapBridge';
import type { PinnedVehicle } from '~/hooks/useTransitScreen';

const EMPTY_VEHICLES: BridgeVehicle[] = [];
const EMPTY_LINES: BridgeRouteLine[] = [];

export interface PinnedVehicleModel {
  // 지도에 얹을 핀 차량(0 또는 1) — 라벨 강조 pill. via 없음(직선 tween).
  overlayVehicles: BridgeVehicle[];
  // 핀 차량 노선/호선 형상 — 맥락 밖에서도 어디로 가는지 보이게.
  overlayRouteLines: BridgeRouteLine[];
  // 카메라 follow 대상 브리지 id — 핀이 있으면 항상(현재 미출현이어도 예약).
  followId: string | null;
  // 칩 라벨(노선번호/행선) — 최신 폴링 반영.
  label: string | null;
  // 성공 폴링에 대상이 없음 = 운행 종료/구간 이탈(호출부가 자동 UNPIN).
  ended: boolean;
}

const EMPTY_MODEL: PinnedVehicleModel = {
  overlayVehicles: EMPTY_VEHICLES,
  overlayRouteLines: EMPTY_LINES,
  followId: null,
  label: null,
  ended: false,
};

// 탑승(핀) 차량 상시 추적 — 브라우징 상태/모드와 무관하게 대상 노선/호선의
// 실시간 위치·형상을 별도 구독해, 어디를 보고 있든 그 차량을 지도 오버레이로
// 유지한다. 맥락 판정(활성 모델이 이미 그 노선을 그림)·중복 제거·follow 배선은
// 호출부(transit.tsx)가 담당하고, 여기선 오버레이 페이로드만 조립한다. 맥락 밖
// 표시라 도로 tween 없이 raw 좌표 pill + 노선 라인으로 충분. focused 로 탭 이탈
// 시 위치 폴링은 정지(핀 상태 자체는 reducer 에 남는다).
export const usePinnedVehicle = (
  pinned: PinnedVehicle | null,
  focused: boolean,
): PinnedVehicleModel => {
  const isBus = pinned?.mode === 'bus';
  const isSubway = pinned?.mode === 'subway';
  const busRouteId = isBus ? pinned!.routeKey : null;
  const lineId = isSubway ? pinned!.routeKey : null;

  // 위치는 focused 게이트(쿼터), 형상은 정적 24h 캐시라 게이트 불필요.
  const busPositions = useBusPositions(focused ? busRouteId : null);
  const busDetail = useBusRouteDetail(busRouteId);
  const subwayPositions = useSubwayLinePositions(focused ? lineId : null);
  const subwayDetail = useSubwayLineDetail(lineId);

  const busModel = useMemo<PinnedVehicleModel | null>(() => {
    if (!isBus || !pinned) return null;
    const color = busDetail.data ? busRouteTypeColor(busDetail.data.info.routeType) : '#6b7280';
    const label = busDetail.data?.info.routeName ?? pinned.label;
    const veh = busPositions.data?.items.find((v) => v.vehId === pinned.vehicleId) ?? null;
    const overlayVehicles: BridgeVehicle[] = veh
      ? [
          {
            id: `veh-${veh.vehId}`,
            lat: veh.lat,
            lng: veh.lng,
            icon: buildBusVehiclePillDataUrl({
              label,
              color,
              stopped: veh.stopFlag === '1',
              highlighted: true,
            }),
            dirIcon: buildBusVehicleDirDataUrl(color),
            bearingDeg: null,
          },
        ]
      : EMPTY_VEHICLES;
    const overlayRouteLines: BridgeRouteLine[] =
      busDetail.data && busDetail.data.path.length >= 2
        ? [
            {
              pts: busDetail.data.path.map(
                (p) => [roundCoord(p.lat), roundCoord(p.lng)] as [number, number],
              ),
              color,
            },
          ]
        : EMPTY_LINES;
    const ended = busPositions.isSuccess && !!busPositions.data && veh === null;
    return { overlayVehicles, overlayRouteLines, followId: `veh-${pinned.vehicleId}`, label, ended };
  }, [isBus, pinned, busDetail.data, busPositions.data, busPositions.isSuccess]);

  const subwayModel = useMemo<PinnedVehicleModel | null>(() => {
    if (!isSubway || !pinned) return null;
    const color = subwayLineColor(pinned.routeKey);
    const veh =
      subwayPositions.data?.items.find((t) => t.trainNo === pinned.vehicleId) ?? null;
    const label = veh ? subwayDestinationLabel(veh.destinationName) : pinned.label;
    const overlayVehicles: BridgeVehicle[] =
      veh && veh.lat !== null && veh.lng !== null
        ? [
            {
              id: `train-${veh.trainNo}`,
              lat: veh.lat,
              lng: veh.lng,
              icon: buildSubwayTrainPillDataUrl({
                label,
                color,
                stopped: veh.trainStatus === '1',
                express: veh.expressType !== null,
                highlighted: true,
              }),
              dirIcon: buildSubwayTrainDirDataUrl(color),
              bearingDeg: null,
            },
          ]
        : EMPTY_VEHICLES;
    const overlayRouteLines: BridgeRouteLine[] = subwayDetail.data
      ? subwayDetail.data.sections.map((sec) => {
          const pts = sec.stations.map(
            (s) => [roundCoord(s.lat), roundCoord(s.lng)] as [number, number],
          );
          if (sec.isLoop && pts.length > 1) pts.push([...pts[0]!] as [number, number]);
          return { pts, color };
        })
      : EMPTY_LINES;
    const ended = subwayPositions.isSuccess && !!subwayPositions.data && veh === null;
    return { overlayVehicles, overlayRouteLines, followId: `train-${pinned.vehicleId}`, label, ended };
  }, [isSubway, pinned, subwayDetail.data, subwayPositions.data, subwayPositions.isSuccess]);

  return busModel ?? subwayModel ?? EMPTY_MODEL;
};
