import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

// 모바일 전용 위치 훅. 웹 (`@repo/shared` 의 useUserLocation) 과 동일한
// status 모델을 따르되 expo-location 을 쓴다. 한국어 usage description 은
// app.config.ts 의 expo-location plugin 에서 주입.
//
// 차이점:
// - 자동 mount fetch 안 함. 페이지에서 명시 호출 (지난 시도에서 placeholder ↔
//   WebView 컴포넌트 swap 이 reanimated worklet 충돌을 일으켰음 — 권한 결정
//   *전에* WebView mount 안 하기 위해 페이지가 직접 흐름 통제).
// - refetch 가 결과를 Promise 로 반환 — 호출자가 await 해서 분기 가능.
//   사용자가 설정에서 권한 풀고 돌아온 경우, 클릭 시 silent refetch → 결과
//   직접 검사 → granted 면 그대로, 아니면 Alert.
// - low accuracy + 짧은 timeout: 주변 검색 용도라 동/구 단위면 충분.
export type UserLocationStatus =
  | 'idle'
  | 'pending'
  | 'granted'
  | 'denied'
  | 'unavailable';

export interface UserLocationResult {
  status: UserLocationStatus;
  coords: { lat: number; lng: number } | null;
}

export interface UserLocationState extends UserLocationResult {
  refetch: () => Promise<UserLocationResult>;
}

const FETCH_TIMEOUT_MS = 5000;

export const useUserLocationNative = (): UserLocationState => {
  const [state, setState] = useState<UserLocationResult>({
    status: 'idle',
    coords: null,
  });

  // 진행 중 시도 식별자. unmount / 새 시도 시 ++ 해서 직전 콜백 무효화.
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const run = useCallback(async (): Promise<UserLocationResult> => {
    const myAttempt = ++attemptRef.current;
    setState((prev) => ({ status: 'pending', coords: prev.coords }));

    // setState 는 superseded/unmount 시 스킵하되, 호출자에게는 결정값을 그대로
    // 반환. 동일 객체를 사용해 일관성 유지.
    const finalize = (next: UserLocationResult): UserLocationResult => {
      if (myAttempt === attemptRef.current && mountedRef.current) {
        setState(next);
      }
      return next;
    };

    try {
      // 이미 granted 면 prompt 안 띄우고 바로 좌표. 사용자가 설정에서 권한
      // 토글한 직후라면 여기서 시스템 상태를 다시 읽어 stale denied 탈출.
      const existing = await Location.getForegroundPermissionsAsync();

      let granted = existing.granted;
      if (!granted) {
        // 한 번 거부한 사용자에겐 canAskAgain=false — prompt 가 안 떠 즉시
        // denied 반환. 사용자는 시스템 설정에서 직접 풀어야 한다 (호출자가
        // Linking.openSettings 로 안내).
        if (existing.canAskAgain === false) {
          return finalize({ status: 'denied', coords: null });
        }
        const req = await Location.requestForegroundPermissionsAsync();
        granted = req.granted;
        if (!granted) {
          return finalize({ status: 'denied', coords: null });
        }
      }

      // 좌표 받기. expo-location 자체 timeout 옵션이 없어서 race 로 보장.
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        }),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), FETCH_TIMEOUT_MS),
        ),
      ]);

      if (!pos) {
        return finalize({ status: 'unavailable', coords: null });
      }
      return finalize({
        status: 'granted',
        coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      });
    } catch {
      return finalize({ status: 'unavailable', coords: null });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current++;
    };
  }, []);

  return { ...state, refetch: run };
};
