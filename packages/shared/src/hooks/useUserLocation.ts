import { useCallback, useEffect, useRef, useState } from 'react';

// 'idle'      — 페이지 진입 직후, 아직 권한 확인 시작 전 (잠깐)
// 'pending'   — getCurrentPosition 요청 중
// 'granted'   — 좌표 받음
// 'denied'    — 사용자가 거부하거나 Permissions API 가 'denied' 반환
// 'timeout'   — 권한은 있으나 측위가 제한 시간 안에 끝나지 않음(재시도하면 보통 됨)
// 'unavailable' — geolocation 비지원, 비-secure context, 측위 불가(code 2) 등
export type UserLocationStatus =
  | 'idle'
  | 'pending'
  | 'granted'
  | 'denied'
  | 'timeout'
  | 'unavailable';

export interface UserLocationState {
  status: UserLocationStatus;
  coords: { lat: number; lng: number } | null;
  // 사용자 인터랙션("내 위치" 버튼) 으로 재요청. 직전 요청이 진행 중이면
  // 내부 ref 로 무효화되고 새 요청만 반영. 거부 상태에서도 일단 호출은 함
  // (브라우저가 prompt 재호출 안 하더라도, settings 에서 풀면 반영됨).
  refetch: () => void;
}

export interface UseUserLocationOptions {
  // 마운트 시 자동 1회 요청 여부. 기본 true — 공개 맛집(주변 자동 검색)처럼
  // 진입과 동시에 위치가 필요한 화면용. false 면 명시적 refetch("내 위치" 버튼)
  // 전까지 'idle' 유지 — 어드민 발견처럼 페이지 진입만으로 권한 prompt 를
  // 띄우고 싶지 않은 화면용. 외부 설정 변경에 반응하는 permission 'change'
  // 구독은 auto 와 무관하게 유지(거부 callout → 설정 해제 시 자동 복구).
  auto?: boolean;
  // getCurrentPosition 제한 시간(ms). 미지정 시 마운트 자동 요청은 5초(진입 직후
  // 화면이 늦게 튀지 않게 일찍 포기), 명시 refetch(버튼)는 10초 — 버스/지하철
  // 페이지의 직접 호출과 같은 값. 실측(2026-08-21, Windows/Chrome WiFi 측위)상 콜드
  // 측위가 5초를 넘기는 일이 드물지 않아 5초면 간헐적으로 TIMEOUT(code 3)이 난다.
  timeoutMs?: number;
}

// 기본 제한 시간 — 자동(마운트) 5초 / 명시(버튼) 10초.
const AUTO_TIMEOUT_MS = 5_000;
const EXPLICIT_TIMEOUT_MS = 10_000;

export type AcquirePositionResult =
  | { status: 'granted'; coords: { lat: number; lng: number } }
  | { status: 'denied' | 'timeout' | 'unavailable' };

export interface AcquirePositionOptions {
  timeout: number;
  // TIMEOUT(code 3) 시 같은 옵션으로 다시 시도하는 총 횟수(1 = 재시도 없음).
  maxTries: number;
  // 시도 사이/직후에 true 면 결과를 버린다(언마운트·새 요청으로 무효화).
  isCancelled?: () => boolean;
}

// 브라우저 측위 캐시 허용 나이 — 5분. 실측(2026-08-21, Windows/Chrome WiFi 측위)에서
// 콜드 fresh 측위는 ≈5초, 직후의 두 번째 fresh 요청은 10초도 넘겼지만 캐시 히트는 0ms
// 였다. 주변 측정소/정류장(수백 m~km 단위) 용도엔 5분 전 위치면 충분하고, 같은 origin
// 다른 화면이 막 받아 둔 위치도 그대로 재사용돼 버튼이 즉시 반응한다.
export const POSITION_MAX_AGE_MS = 5 * 60_000;

// geolocation 코어 — 훅 밖으로 빼 두어 가짜 navigator 로 계약을 테스트한다.
// enableHighAccuracy: false — GPS 안 깨움, IP/WiFi 기반 정도면 동/구 단위 정확도로
// 충분(주변 1.5km 검색 용도). TIMEOUT 만 재시도한다 — 늦은 것이지 불가능한 게 아니라
// 두 번째는 대개 성공한다(첫 시도가 측위 캐시를 데운다). 거부(1)·측위 불가(2)는
// 재시도해도 같으니 즉시 확정.
export const acquirePosition = async (
  opts: AcquirePositionOptions,
): Promise<AcquirePositionResult | null> => {
  const attemptOnce = (): Promise<AcquirePositionResult> =>
    new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            status: 'granted',
            coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          }),
        (err) =>
          // PERMISSION_DENIED=1, POSITION_UNAVAILABLE=2, TIMEOUT=3
          resolve({ status: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable' }),
        { enableHighAccuracy: false, timeout: opts.timeout, maximumAge: POSITION_MAX_AGE_MS },
      );
    });
  let last: AcquirePositionResult = { status: 'timeout' };
  for (let i = 0; i < Math.max(1, opts.maxTries); i++) {
    last = await attemptOnce();
    if (opts.isCancelled?.()) return null;
    if (last.status !== 'timeout') return last;
  }
  return last;
};

// 브라우저 geolocation 한 번 시도. 컴포넌트 마운트 시 자동 1회 + refetch 호출
// 시 추가. 권한 prompt 가 이미 'denied' 상태면 호출 자체를 스킵 (재요청해도
// 어차피 즉시 거부 + 사용자 짜증). 명시 요청(refetch)은 제한 시간 10초 + TIMEOUT
// 1회 재시도, 자동 요청은 5초 단발 — 시간이 초과되면 'timeout' 으로 남겨 화면이
// "다시 시도"를 안내하게 한다('unavailable' 과 구분).
export const useUserLocation = (
  options: UseUserLocationOptions = {},
): UserLocationState => {
  const { auto = true, timeoutMs } = options;
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

  const run = useCallback(
    async (kind: 'auto' | 'explicit') => {
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
      const result = await acquirePosition({
        timeout: timeoutMs ?? (kind === 'auto' ? AUTO_TIMEOUT_MS : EXPLICIT_TIMEOUT_MS),
        maxTries: kind === 'explicit' ? 2 : 1,
        isCancelled: () => myAttempt !== attemptRef.current,
      });
      if (result === null) return;
      setState(
        result.status === 'granted'
          ? { status: 'granted', coords: result.coords }
          : { status: result.status, coords: null },
      );
    },
    [timeoutMs],
  );

  // refetch 는 명시 요청(버튼) — 긴 제한 시간 + 1회 재시도.
  const refetch = useCallback(() => {
    void run('explicit');
  }, [run]);

  useEffect(() => {
    // auto=false 면 마운트 자동 요청을 건너뛴다('idle' 유지) — refetch 로만 시작.
    if (auto) void run('auto');
    return () => {
      // unmount — 진행 중 콜백 무효화.
      attemptRef.current++;
    };
  }, [run, auto]);

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
    const onChange = () => void run('explicit');
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

  return { ...state, refetch };
};
