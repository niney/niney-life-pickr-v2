import { useMemo } from 'react';
import { useBusStationArrivals, useSubwayStationArrivals } from '@repo/shared';
import type { AlightTarget, PinnedVehicle } from '~/hooks/useTransitScreen';

export interface AlightEtaModel {
  // 하차 지점 도착정보에서 '내 차량'을 찾았는지. 지하철은 역당 방향별 1~2편만
  // 내려오고 버스도 도착예정 2대까지라, 멀리 있으면 잡히지 않는 게 정상이다.
  matched: boolean;
  // 지하철 카운트다운 원본 — 잔여초 + 발신시각(화면이 보정해 tick).
  arrivalSec: number | null;
  receivedAt: string | null;
  // 버스 도착 메시지 원문('3분후[2번째 전]') — 초 단위 값이 없다.
  message: string | null;
  isLoading: boolean;
  isError: boolean;
  // 조회 자체가 불가 — 버스 가상정류장(arsId '0') 등.
  unavailable: boolean;
}

const EMPTY: AlightEtaModel = {
  matched: false,
  arrivalSec: null,
  receivedAt: null,
  message: null,
  isLoading: false,
  isError: false,
  unavailable: false,
};

// 하차 지점의 실시간 도착정보에서 탑승 차량 한 대를 조인한다. 지하철은
// trainNo(위치 API 와 같은 체계), 버스는 도착예정 엔트리의 vehId 가 조인 키.
// 하차 지점이 지정됐을 때만 조회 — 지정 전에는 쿼터를 쓰지 않는다. focused 는
// 탭 이탈 시 폴링 정지(usePinnedVehicle 과 같은 게이트).
export const useAlightEta = (
  pinned: PinnedVehicle | null,
  alight: AlightTarget | null,
  focused: boolean,
): AlightEtaModel => {
  const active = pinned !== null && alight !== null && alight.mode === pinned.mode && focused;
  // 가상정류장은 도착정보가 없다(훅도 arsId '0' 을 막는다) — 조회 전에 판정.
  const busUnavailable =
    alight !== null && alight.mode === 'bus' && (alight.arsId === '' || alight.arsId === '0');
  const busArsId =
    active && alight!.mode === 'bus' && !busUnavailable ? alight!.arsId : null;
  const subwayStationId = active && alight!.mode === 'subway' ? alight!.stationId : null;

  const busArrivals = useBusStationArrivals(busArsId);
  const subwayArrivals = useSubwayStationArrivals(subwayStationId);

  return useMemo<AlightEtaModel>(() => {
    if (!pinned || !alight || alight.mode !== pinned.mode) return EMPTY;
    if (alight.mode === 'bus') {
      if (busUnavailable) return { ...EMPTY, unavailable: true };
      // 같은 노선 행 우선 — 다른 노선에 같은 vehId 가 있을 수는 없지만, 노선을
      // 먼저 좁히면 순회가 짧고 의미도 분명하다.
      const items = busArrivals.data?.items ?? [];
      const scoped = items.filter((it) => it.busRouteId === pinned.routeKey);
      const entry = (scoped.length > 0 ? scoped : items)
        .flatMap((it) => [it.first, it.second])
        .find((e) => e !== null && e.vehId === pinned.vehicleId);
      return {
        matched: entry != null,
        arrivalSec: null,
        receivedAt: null,
        message: entry?.message ?? null,
        isLoading: busArrivals.isLoading,
        isError: busArrivals.isError,
        unavailable: false,
      };
    }
    const hit =
      subwayArrivals.data?.items.find((it) => it.trainNo === pinned.vehicleId) ?? null;
    return {
      matched: hit !== null,
      arrivalSec: hit?.arrivalSec ?? null,
      receivedAt: hit?.receivedAt ?? null,
      message: hit?.arrivalMsg ?? null,
      isLoading: subwayArrivals.isLoading,
      isError: subwayArrivals.isError,
      unavailable: false,
    };
  }, [
    pinned,
    alight,
    busUnavailable,
    busArrivals.data,
    busArrivals.isLoading,
    busArrivals.isError,
    subwayArrivals.data,
    subwayArrivals.isLoading,
    subwayArrivals.isError,
  ]);
};
