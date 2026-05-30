import { useCallback, useEffect, useRef, useState } from 'react';

// 'idle'      — 페이지 진입 직후, 아직 권한 확인 시작 전 (잠깐)
// 'pending'   — getCurrentPosition 요청 중
// 'granted'   — 좌표 받음
// 'denied'    — 사용자가 거부하거나 Permissions API 가 'denied' 반환
// 'unavailable' — geolocation 비지원, 비-secure context, timeout 등
export type UserLocationStatus =
  | 'idle'
  | 'pending'
  | 'granted'
  | 'denied'
  | 'unavailable';

export interface UserLocationState {
  status: UserLocationStatus;
  coords: { lat: number; lng: number } | null;
  // 사용자 인터랙션("내 위치" 버튼) 으로 재요청. 직전 요청이 진행 중이면
  // 내부 ref 로 무효화되고 새 요청만 반영. 거부 상태에서도 일단 호출은 함
  // (브라우저가 prompt 재호출 안 하더라도, settings 에서 풀면 반영됨).
  refetch: () => void;
}

// 브라우저 geolocation 한 번 시도. 컴포넌트 마운트 시 자동 1회 + refetch 호출
// 시 추가. 권한 prompt 가 이미 'denied' 상태면 호출 자체를 스킵 (재요청해도
// 어차피 즉시 거부 + 사용자 짜증).
//
// enableHighAccuracy: false — GPS 안 깨움, IP/WiFi 기반 정도면 동/구 단위
// 정확도로 충분 (주변 1.5km 검색 용도). 모바일 배터리/대기시간 절약.
// timeout: 5s — 응답이 늦으면 UX 마비되니 일찍 포기하고 폴백.
export const useUserLocation = (): UserLocationState => {
  const [state, setState] = useState<{
    status: UserLocationStatus;
    coords: { lat: number; lng: number } | null;
  }>({
    status: 'idle',
    coords: null,
  });

  // 진행 중인 시도 식별자. refetch 가 호출되면 ++ 해서 직전 요청 콜백을
  // 무효화. 컴포넌트 unmount 시에도 ++ → 모든 in-flight 콜백 무시.
  const attemptRef = useRef(0);

  const run = useCallback(async () => {
    const myAttempt = ++attemptRef.current;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'unavailable', coords: null });
      return;
    }

    // 비-secure context(localhost 아닌 평문 HTTP — 예: http://192.168.x.x)에서는
    // 브라우저가 geolocation 을 아예 차단한다. 권한 prompt 조차 안 뜨고
    // getCurrentPosition 은 즉시 code 1 로 실패 → 'denied' 로 오분류될 수 있다.
    // 권한과 무관한 환경 제약이므로 'unavailable' 로 단정 (사이트 설정으로 못 풂).
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setState({ status: 'unavailable', coords: null });
      return;
    }

    if (navigator.permissions?.query) {
      try {
        const result = await navigator.permissions.query({
          name: 'geolocation' as PermissionName,
        });
        if (myAttempt !== attemptRef.current) return;
        if (result.state === 'denied') {
          setState({ status: 'denied', coords: null });
          return;
        }
      } catch {
        // 일부 환경에서 query 가 throw — 무시하고 진행.
      }
    }

    setState((prev) => ({ status: 'pending', coords: prev.coords }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (myAttempt !== attemptRef.current) return;
        setState({
          status: 'granted',
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
      },
      (err) => {
        if (myAttempt !== attemptRef.current) return;
        // PERMISSION_DENIED=1, POSITION_UNAVAILABLE=2, TIMEOUT=3
        setState({
          status: err.code === 1 ? 'denied' : 'unavailable',
          coords: null,
        });
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 60_000,
      },
    );
  }, []);

  useEffect(() => {
    run();
    return () => {
      // unmount — 진행 중 콜백 무효화.
      attemptRef.current++;
    };
  }, [run]);

  // 권한 상태가 외부(브라우저 사이트 설정)에서 바뀌면 자동 반영. 한 번 'denied'
  // 가 되면 사이트가 다시 prompt 를 띄울 방법은 없고(브라우저 보안 정책), 사용자
  // 가 설정에서 직접 풀어야 한다. 그 변화를 Permissions API 의 'change' 이벤트로
  // 감지해서, 새로고침 없이 버튼이 살아나고 granted 면 좌표까지 자동 취득.
  // Permissions API 미지원 환경은 스킵 (수동 refetch 만 가능).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return;
    }
    let permStatus: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => run();
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled) return;
        permStatus = status;
        permStatus.addEventListener('change', onChange);
      })
      .catch(() => {
        // 일부 환경에서 query 가 throw — 무시.
      });
    return () => {
      cancelled = true;
      permStatus?.removeEventListener('change', onChange);
    };
  }, [run]);

  return { ...state, refetch: run };
};
