import { useCallback, useEffect, useRef, useState } from 'react';
import { acquirePosition, useRestaurantsPublic } from '@repo/shared';
import { haversineM } from '@repo/utils';
import type { PhotoLocation } from './mealPhotoFile';

// 근처 식당 후보(웹) — 사진을 찍은 곳(EXIF)이나 지금 위치로 가까운 등록 식당 몇 곳을 내놓는다. 고르는 것은 사용자다
// (한 건물에 식당이 여럿이고 위치는 틀릴 수 있어 자동으로 정하지 않는다).
//
//   - 사진 위치가 있으면 그것이 먼저다 — 지난 끼니를 나중에 적어도 먹은 곳은 사진이 안다.
//   - 지금 위치는 [근처 식당]을 눌렀을 때 묻는다. 이미 허용해 둔 브라우저면 새 기록을 열 때 묻지 않고 바로 본다
//     (권한 창이 뜨지 않는 경우만 — 화면을 열었다고 권한 창을 띄우지 않는다).
//   - 가게를 가릴 만큼 정확해야 한다. 데스크톱의 WiFi·IP 측위는 수백 m 씩 틀려 후보를 내지 않고 그렇다고 알린다.
//   - 좌표는 조회(공개 맛집 목록의 지도 범위)에만 쓰고 저장하지 않는다. 기록에는 고른 식당만 남는다.

// 사진 위치·정확한 측위의 탐색 반경. 한 블록 안쪽.
const BASE_RADIUS_M = 150;
// 오차가 크면 그만큼 넓혀 보되 이 이상은 넓히지 않는다.
const MAX_RADIUS_M = 500;
// 오차 반경이 이보다 크면 어느 가게인지 가릴 수 없다(후보를 내지 않는다).
const COARSE_ACCURACY_M = 400;
const MAX_PLACES = 5;
// 조회 범위는 반경을 조금 넉넉히 감싼다(목록은 사각 범위로 받고 거리는 여기서 다시 잰다).
const BBOX_MARGIN = 1.2;
const M_PER_LAT_DEG = 111_320;

export type MealNearbyStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable' | 'coarse';

export interface MealNearbyPlace {
  placeId: string;
  name: string;
  category: string | null;
  distanceM: number;
}

export interface MealNearbyPlaces {
  status: MealNearbyStatus;
  /** 후보를 뽑은 기준 — 사진 찍은 곳인지 지금 위치인지. 아직 없으면 null. */
  source: 'photo' | 'device' | null;
  places: MealNearbyPlace[];
  /** 식당 목록을 받는 중. */
  loading: boolean;
  /** 측위 오차(m) — 'coarse' 일 때 안내에 쓴다. */
  accuracyM: number | null;
  /** 지금 위치로 찾는다(버튼). */
  locate: () => void;
}

interface DeviceOrigin {
  lat: number;
  lng: number;
  accuracyM: number;
}

const bboxAround = (lat: number, lng: number, radiusM: number): string => {
  const dLat = (radiusM * BBOX_MARGIN) / M_PER_LAT_DEG;
  const dLng = (radiusM * BBOX_MARGIN) / (M_PER_LAT_DEG * Math.cos((lat * Math.PI) / 180));
  // 소수 5자리(약 1m) — 조회 키가 측위 잡음마다 달라지지 않게 자른다.
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((v) => v.toFixed(5)).join(',');
};

export const useMealNearbyPlaces = (opts: {
  photoLocation: PhotoLocation | null;
  /** 열자마자 지금 위치로 찾아볼 만한 기록인지(지금 먹은 새 기록) — 이미 허용된 브라우저에서만 실제로 묻는다. */
  auto: boolean;
}): MealNearbyPlaces => {
  const [device, setDevice] = useState<DeviceOrigin | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<MealNearbyStatus>('idle');
  // 진행 중인 측위 — 새 요청·언마운트가 앞선 응답을 버린다.
  const attempt = useRef(0);

  // ref 와 setState 만 써서 바뀌지 않는다.
  const run = useCallback(async (silent: boolean) => {
    const mine = ++attempt.current;
    // 위치를 쓸 수 없는 환경(미지원 브라우저, https 가 아닌 주소)은 권한 문제가 아니다 — 묻지 않고 그렇다고 알린다.
    if (
      typeof navigator === 'undefined' ||
      !navigator.geolocation ||
      (typeof window !== 'undefined' && window.isSecureContext === false)
    ) {
      setDevice(null);
      setDeviceStatus(silent ? 'idle' : 'unavailable');
      return;
    }
    setDeviceStatus('locating');
    const result = await acquirePosition({
      timeout: 10_000,
      maxTries: silent ? 1 : 2,
      highAccuracy: true,
      maxAgeMs: 60_000,
      isCancelled: () => mine !== attempt.current,
    });
    if (result === null || mine !== attempt.current) return;
    if (result.status === 'granted') {
      const accuracyM = result.accuracyM ?? 0;
      setDevice({ ...result.coords, accuracyM });
      setDeviceStatus(accuracyM > COARSE_ACCURACY_M ? 'coarse' : 'ready');
      return;
    }
    setDevice(null);
    // 묻지 않고 해 본 것이 안 됐으면 조용히 원래대로 둔다 — 누른 적 없는 실패를 알리지 않는다.
    setDeviceStatus(silent ? 'idle' : result.status === 'denied' ? 'denied' : 'unavailable');
  }, []);

  // 이미 위치를 허용해 둔 브라우저면 새 기록을 열 때 바로 찾아본다(처음 열 때의 값으로 한 번). 권한 상태는
  // 브라우저(외부)라 effect 로 묻는다.
  const [autoOnOpen] = useState(opts.auto);
  useEffect(() => {
    if (!autoOnOpen || typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
    if (!navigator.permissions?.query) return undefined;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((permission) => {
        if (!cancelled && permission.state === 'granted') void run(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [autoOnOpen, run]);
  // 화면을 닫으면 진행 중인 측위 응답을 버린다.
  useEffect(
    () => () => {
      attempt.current += 1;
    },
    [],
  );

  const photo = opts.photoLocation;
  const usable = photo !== null || (device !== null && deviceStatus === 'ready');
  const origin = photo ?? (deviceStatus === 'ready' ? device : null);
  const radiusM = photo
    ? BASE_RADIUS_M
    : Math.min(MAX_RADIUS_M, Math.max(BASE_RADIUS_M, (device?.accuracyM ?? 0) + 100));
  const list = useRestaurantsPublic(
    origin ? { bbox: bboxAround(origin.lat, origin.lng, radiusM), limit: 60 } : {},
    { enabled: usable && origin !== null },
  );

  const places: MealNearbyPlace[] =
    origin && list.data
      ? list.data.items
          .flatMap((item) =>
            item.latitude === null || item.longitude === null
              ? []
              : [
                  {
                    placeId: item.placeId,
                    name: item.name,
                    category: item.category,
                    // 표기(formatDistanceM)는 정수 m 를 받는다.
                    distanceM: Math.round(haversineM(origin, { lat: item.latitude, lng: item.longitude })),
                  },
                ],
          )
          .filter((place) => place.distanceM <= radiusM)
          .sort((a, b) => a.distanceM - b.distanceM)
          .slice(0, MAX_PLACES)
      : [];

  return {
    status: photo ? 'ready' : deviceStatus,
    source: photo ? 'photo' : device && deviceStatus === 'ready' ? 'device' : null,
    places,
    loading: origin !== null && list.isFetching && !list.data,
    accuracyM: photo || !device ? null : Math.round(device.accuracyM),
    locate: () => {
      void run(false);
    },
  };
};
