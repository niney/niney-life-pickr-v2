import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { AlightTarget, PinnedVehicle } from '~/hooks/useTransitScreen';

// 하차 알림 = '예약된 로컬 알림'. 앱이 백그라운드면 폴링이 멈춰(focusManager +
// OS 서스펜드) 임박을 감지할 수 없으므로, 살아 있는 동안 계산한 도착 예정으로
// 알림 시각을 미리 예약해 둔다. 폴링이 돌 때마다 더 정확한 값으로 다시 예약한다.
//
// 도착 예정의 근거는 두 단계:
//  1) 하차 지점 도착정보에 내 차량이 잡히면 그 잔여초(정확).
//  2) 아직 안 잡히면 남은 정차 수 × 평균 소요(추정) — 도착정보는 역당 1~2편만
//     내려와 멀리 있는 차량은 안 잡히는데, 그 구간이야말로 폰을 주머니에 넣는
//     구간이라 추정이라도 걸어 두지 않으면 기능이 성립하지 않는다.
const LEAD_SEC = 90;
// 평균 정차 간격(초) — 추정 예약용. 서울 지하철 역간 ~2분, 시내버스 ~1.5분.
const AVG_SEC_PER_STOP: Record<'bus' | 'subway', number> = { bus: 90, subway: 120 };
// 재예약 임계 — 목표 시각이 이만큼 어긋날 때만 취소·재예약(매 폴링 재예약 방지).
const RESCHEDULE_DRIFT_SEC = 20;
const ANDROID_CHANNEL_ID = 'alight';

// 앱이 떠 있을 때도 배너를 띄운다 — 지도를 보는 중에도 하차 안내는 놓치면 안 된다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface AlightAlertModel {
  // 권한 거부 — 호출부가 안내 문구를 띄우고 토글을 되돌린다.
  denied: boolean;
}

export interface UseAlightAlertParams {
  enabled: boolean;
  pinned: PinnedVehicle | null;
  alight: AlightTarget | null;
  // 하차 지점까지 남은 정차 수(1 = 다음). 모르면 null.
  stepsAway: number | null;
  // 도착정보로 확정된 잔여초(보정 완료). 미매칭이면 null.
  etaSec: number | null;
  // 알림 본문에 쓸 노선/행선 라벨.
  label: string | null;
  onDenied?(): void;
}

// 권한 요청은 토글을 켤 때만 — 앱 시작 시 알림 권한을 묻지 않는다.
const ensurePermission = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
};

export const useAlightAlert = ({
  enabled,
  pinned,
  alight,
  stepsAway,
  etaSec,
  label,
  onDenied,
}: UseAlightAlertParams): AlightAlertModel => {
  // 예약 시각/추정 여부는 렌더에 안 쓰이므로 ref — 매 폴링 setState 로 화면을
  // 흔들지 않는다(지도까지 리렌더된다). 화면에 필요한 건 권한 거부뿐이라 그것만 state.
  const [denied, setDenied] = useState(false);
  const idRef = useRef<string | null>(null);
  const schedRef = useRef<{ atMs: number; estimated: boolean } | null>(null);
  // 이번 하차 대상에 '최종 알림'을 이미 걸었는지 — 안 두면 도착 후 폴링마다
  // 재예약돼 알림이 반복된다(드리프트가 임계를 계속 넘으므로).
  const doneKeyRef = useRef<string | null>(null);

  const cancel = useCallback(async () => {
    const id = idRef.current;
    idRef.current = null;
    schedRef.current = null;
    if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }, []);

  // Android 는 채널이 있어야 heads-up 으로 뜬다. 채널 생성은 멱등.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: '하차 알림',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }, []);

  const targetName = alight?.name ?? null;
  const mode = pinned?.mode ?? null;

  // 대상 키 — 차량이나 하차 지점이 바뀌면 '최종 알림 발송됨' 상태를 리셋한다.
  const targetKey =
    pinned && alight
      ? `${pinned.mode}:${pinned.vehicleId}:${alight.mode === 'bus' ? alight.stId : alight.stationId}`
      : null;

  useEffect(() => {
    if (!enabled || !alight || !pinned || !mode || !targetKey) {
      void cancel();
      return;
    }
    if (doneKeyRef.current !== null && doneKeyRef.current !== targetKey) {
      doneKeyRef.current = null;
    }
    // 이 대상엔 이미 최종 알림이 예약됐다 — 그대로 둔다.
    if (doneKeyRef.current === targetKey) return;
    // 근거 선택 — 실측 잔여초 우선, 없으면 남은 정차 수 추정.
    const estimated = etaSec === null;
    const remain =
      etaSec !== null
        ? etaSec
        : stepsAway !== null
          ? stepsAway * AVG_SEC_PER_STOP[mode]
          : null;
    if (remain === null) {
      void cancel();
      return;
    }
    const fireInSec = Math.max(0, remain - LEAD_SEC);
    const nextAtMs = Date.now() + fireInSec * 1000;
    const prev = schedRef.current;
    // 이미 잡힌 예약과 거의 같은 시각이면 그대로 둔다. 추정 → 실측으로 근거가
    // 올라갈 때는 시각이 비슷해도 다시 잡는다(정확도가 다르다).
    if (
      prev !== null &&
      Math.abs(prev.atMs - nextAtMs) < RESCHEDULE_DRIFT_SEC * 1000 &&
      prev.estimated === estimated
    ) {
      return;
    }

    let aborted = false;
    void (async () => {
      if (!(await ensurePermission())) {
        if (aborted) return;
        setDenied(true);
        onDenied?.();
        return;
      }
      if (aborted) return;
      await cancel();
      if (aborted) return;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `곧 ${targetName} 도착`,
          body: label ? `${label} · 내릴 준비하세요` : '내릴 준비하세요',
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
        },
        // seconds 0 은 즉시 발송으로 취급되지 않아(스케줄러 하한) 최소 1초.
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, fireInSec),
        },
      });
      if (aborted) {
        await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
        return;
      }
      idRef.current = id;
      schedRef.current = { atMs: nextAtMs, estimated };
      setDenied(false);
      // 발송이 코앞이면 이게 마지막 예약 — 이후 폴링은 건드리지 않는다.
      if (fireInSec <= RESCHEDULE_DRIFT_SEC) doneKeyRef.current = targetKey;
    })();

    return () => {
      aborted = true;
    };
  }, [
    enabled,
    pinned,
    alight,
    mode,
    targetKey,
    targetName,
    label,
    stepsAway,
    etaSec,
    cancel,
    onDenied,
  ]);

  // 언마운트(탭 이탈이 아니라 화면 파기) 시 예약 정리 — 남겨 두면 탑승이 끝난
  // 뒤에도 알림이 뜬다.
  useEffect(() => () => void cancel(), [cancel]);

  return { denied };
};
