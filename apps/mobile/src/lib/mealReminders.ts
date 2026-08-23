import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { MealSlotType } from '@repo/api-contract';
import { MEAL_SLOT_LABEL, MEAL_SLOTS } from '@repo/utils';

const LEGACY_STORAGE_KEY = 'lp:meal-reminders:v1';
const STORAGE_PREFIX = 'lp:meal-reminders:v2:principal:';
const ANDROID_CHANNEL_ID = 'meal-reminder';
const CATEGORY_ID = 'meal-reminder-actions';
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const MEAL_REMINDER_RECORD_ACTION = 'meal-reminder-record';
export const MEAL_REMINDER_SNOOZE_ACTION = 'meal-reminder-snooze-10m';

export const MEAL_REMINDER_DEFAULT_TIMES: Record<MealSlotType, string> = {
  breakfast: '07:30',
  lunch: '11:30',
  dinner: '18:00',
  snack: '15:00',
  late_night: '21:30',
};

export interface MealReminderSettings {
  enabled: boolean;
  times: Record<MealSlotType, string>;
  /** 사용자가 직접 시간을 바꾼 끼니. 나머지는 서버의 개인 시간 프리셋을 따라갈 수 있다. */
  customizedTimes: Partial<Record<MealSlotType, boolean>>;
  /** OS 예약이 유실돼도 어떤 끼니를 복구해야 하는지 알 수 있게 별도로 저장한다. */
  slots: MealSlotType[];
  notificationIds: Partial<Record<MealSlotType, string>>;
}

export class MealReminderPermissionError extends Error {
  constructor() {
    super('알림 권한이 꺼져 있어요. 기기 설정에서 알림을 허용해 주세요.');
    this.name = 'MealReminderPermissionError';
  }
}

const defaultSettings = (): MealReminderSettings => ({
  enabled: false,
  times: { ...MEAL_REMINDER_DEFAULT_TIMES },
  customizedTimes: {},
  slots: [],
  notificationIds: {},
});

const isSlot = (value: string): value is MealSlotType =>
  (MEAL_SLOTS as readonly string[]).includes(value);

const normalizePrincipal = (principalId: string | null): string | null =>
  principalId?.trim() || null;
const storageKey = (principalId: string): string =>
  `${STORAGE_PREFIX}${encodeURIComponent(principalId)}`;

let activePrincipal: string | null = null;
let desiredPrincipal: string | null = null;
let principalEpoch = 0;
let reminderOperationTail: Promise<unknown> = Promise.resolve();
let principalBoundaryInitialized = false;
let recordedDate = '';
let recordedSlots = new Set<MealSlotType>();
const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

export const isMealReminderTime = (value: string): boolean => TIME_PATTERN.test(value);

interface MealReminderPrincipalSnapshot {
  principalId: string;
  epoch: number;
}

class MealReminderStalePrincipalError extends Error {
  constructor() {
    super('로그인 정보가 변경되어 식사 알림 작업을 취소했어요.');
    this.name = 'MealReminderStalePrincipalError';
  }
}

// principal 전환과 OS 예약 변경을 하나의 큐에서 직렬화한다. Expo 권한
// 프롬프트나 예약 API를 await 하는 사이에 계정이 바뀌면 epoch 검사가 남은
// side effect를 중단하고, 이미 만든 예약은 호출부가 즉시 취소한다.
const enqueueReminderOperation = <T>(work: () => Promise<T>): Promise<T> => {
  const result = reminderOperationTail.catch(() => undefined).then(work);
  reminderOperationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const currentPrincipalSnapshot = (): MealReminderPrincipalSnapshot | null =>
  activePrincipal
    ? { principalId: activePrincipal, epoch: principalEpoch }
    : null;

const isCurrentPrincipal = (snapshot: MealReminderPrincipalSnapshot): boolean =>
  activePrincipal === snapshot.principalId &&
  desiredPrincipal === snapshot.principalId &&
  principalEpoch === snapshot.epoch;

const assertCurrentPrincipal = (snapshot: MealReminderPrincipalSnapshot): void => {
  if (!isCurrentPrincipal(snapshot)) throw new MealReminderStalePrincipalError();
};

const parseSettings = (raw: string | null): MealReminderSettings => {
  const fallback = defaultSettings();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as {
      enabled?: unknown;
      times?: Record<string, unknown>;
      customizedTimes?: Record<string, unknown>;
      slots?: unknown;
      notificationIds?: Record<string, unknown>;
    };

    const times = { ...fallback.times };
    const customizedTimes: Partial<Record<MealSlotType, boolean>> = {};
    const notificationIds: Partial<Record<MealSlotType, string>> = {};
    for (const slot of MEAL_SLOTS) {
      const time = parsed.times?.[slot];
      if (typeof time === 'string' && isMealReminderTime(time)) times[slot] = time;
      if (parsed.customizedTimes?.[slot] === true) customizedTimes[slot] = true;
      const id = parsed.notificationIds?.[slot];
      if (typeof id === 'string' && id.length > 0) notificationIds[slot] = id;
    }
    const parsedSlots = Array.isArray(parsed.slots)
      ? parsed.slots.filter((slot): slot is MealSlotType => typeof slot === 'string' && isSlot(slot))
      : [];
    // 구버전 값에는 slots 가 없었으므로 예약 ID의 key로 안전하게 복구한다.
    const slots = [
      ...new Set(parsedSlots.length > 0 ? parsedSlots : Object.keys(notificationIds).filter(isSlot)),
    ];

    return {
      enabled: parsed.enabled === true,
      times,
      customizedTimes,
      slots,
      notificationIds,
    };
  } catch {
    // 손상된 로컬 값 때문에 설정 화면 전체가 깨지지 않게 기본값으로 복구한다.
    return fallback;
  }
};

export const loadMealReminderSettings = async (): Promise<MealReminderSettings> => {
  const snapshot = currentPrincipalSnapshot();
  if (!snapshot) return defaultSettings();
  const settings = parseSettings(await AsyncStorage.getItem(storageKey(snapshot.principalId)));
  return isCurrentPrincipal(snapshot) ? settings : defaultSettings();
};

const loadForPrincipal = async (
  snapshot: MealReminderPrincipalSnapshot,
): Promise<MealReminderSettings> => {
  assertCurrentPrincipal(snapshot);
  const settings = parseSettings(await AsyncStorage.getItem(storageKey(snapshot.principalId)));
  assertCurrentPrincipal(snapshot);
  return settings;
};

const persistForPrincipal = async (
  snapshot: MealReminderPrincipalSnapshot,
  settings: MealReminderSettings,
): Promise<void> => {
  assertCurrentPrincipal(snapshot);
  const key = storageKey(snapshot.principalId);
  await AsyncStorage.setItem(key, JSON.stringify(settings));
  if (isCurrentPrincipal(snapshot)) return;

  // setItem 중에 계정이 바뀌었으면 이 작업이 쓴 값을 지운다. 리마인더
  // mutation은 같은 큐에서 돌므로 더 최신인 작업의 저장값을 지울 수 없다.
  await AsyncStorage.removeItem(key);
  throw new MealReminderStalePrincipalError();
};

const cancelIds = async (ids: Iterable<string>): Promise<void> => {
  await Promise.all(
    [...ids].map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
  );
};

const isMealRequest = (request: Notifications.NotificationRequest): boolean =>
  request.content.data?.kind === 'meal-reminder';

const requestPrincipal = (request: Notifications.NotificationRequest): string | null => {
  const value = request.content.data?.principalId;
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const requestSlot = (request: Notifications.NotificationRequest): MealSlotType | null => {
  const value = request.content.data?.slot;
  return typeof value === 'string' && isSlot(value) ? value : null;
};

const getScheduled = async (): Promise<Notifications.NotificationRequest[]> =>
  Notifications.getAllScheduledNotificationsAsync().catch(() => []);

const ensurePermission = async (mayPrompt = true): Promise<void> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return;
  if (!mayPrompt || !current.canAskAgain) throw new MealReminderPermissionError();
  const requested = await Notifications.requestPermissionsAsync();
  if (!requested.granted) throw new MealReminderPermissionError();
};

export const setupMealReminderNotificationCategory = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: '식사 알림',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 120, 200],
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: MEAL_REMINDER_RECORD_ACTION,
      buttonTitle: '기록하기',
      options: { opensAppToForeground: true },
    },
    {
      identifier: MEAL_REMINDER_SNOOZE_ACTION,
      buttonTitle: '10분 뒤',
      // 앱이 종료된 상태에서도 listener 가 처리되도록 foreground 로 연다.
      options: { opensAppToForeground: true },
    },
  ]);
};

const notificationData = (slot: MealSlotType, principalId: string) => ({
  href: `/meal?tab=recommend&slot=${slot}`,
  recordHref: `/meal/new?slot=${slot}`,
  kind: 'meal-reminder',
  slot,
  principalId,
});

const scheduleDaily = async (
  slot: MealSlotType,
  time: string,
  principalId: string,
): Promise<string> => {
  const [hour$, minute$] = time.split(':');
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `${MEAL_SLOT_LABEL[slot]}을 챙길 시간이에요`,
      body: '추천을 확인하거나 먹은 메뉴를 간단히 기록해 보세요.',
      sound: true,
      categoryIdentifier: CATEGORY_ID,
      data: notificationData(slot, principalId),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: Number(hour$),
      minute: Number(minute$),
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
  });
};

const replaceSchedules = async (
  snapshot: MealReminderPrincipalSnapshot,
  previous: MealReminderSettings,
  input: {
    slots: readonly MealSlotType[];
    times: Record<MealSlotType, string>;
    customizedTimes: Partial<Record<MealSlotType, boolean>>;
  },
  mayPrompt: boolean,
): Promise<MealReminderSettings> => {
  assertCurrentPrincipal(snapshot);
  const slots = [...new Set(input.slots)].filter((slot) => isSlot(slot));
  if (slots.length === 0) throw new Error('알림을 받을 끼니를 하나 이상 선택해 주세요.');
  for (const slot of slots) {
    if (!isMealReminderTime(input.times[slot])) {
      throw new Error(`${MEAL_SLOT_LABEL[slot]} 시간을 HH:MM 형식으로 입력해 주세요.`);
    }
  }

  await ensurePermission(mayPrompt);
  assertCurrentPrincipal(snapshot);
  await setupMealReminderNotificationCategory();
  assertCurrentPrincipal(snapshot);

  const nextIds: Partial<Record<MealSlotType, string>> = {};
  try {
    for (const slot of slots) {
      assertCurrentPrincipal(snapshot);
      nextIds[slot] = await scheduleDaily(slot, input.times[slot], snapshot.principalId);
      assertCurrentPrincipal(snapshot);
    }
    // 새 예약을 모두 만든 뒤 이전 예약을 지워, 중간 실패 시 기존 알림까지 잃지 않는다.
    await cancelIds(Object.values(previous.notificationIds).filter((id): id is string => !!id));
    assertCurrentPrincipal(snapshot);
    const next: MealReminderSettings = {
      enabled: true,
      times: { ...input.times },
      customizedTimes: { ...input.customizedTimes },
      slots,
      notificationIds: nextIds,
    };
    await persistForPrincipal(snapshot, next);
    return next;
  } catch (error) {
    // 일부만 만들었거나 persist 중 principal이 바뀌었으면 새 ID를 모두
    // 취소해 이전 계정 알림이 OS에 추적 불가 상태로 남지 않게 한다.
    await cancelIds(Object.values(nextIds).filter((id): id is string => !!id));
    throw error;
  }
};

/**
 * 저장된 ID와 OS 예약을 대조한다. OS 설정/업데이트로 예약이 사라졌으면 권한을
 * 다시 묻지 않고 복구하고, 다른 계정·구버전의 식사 알림은 취소한다.
 */
const reconcileMealRemindersUnlocked = async (
  snapshot: MealReminderPrincipalSnapshot,
): Promise<MealReminderSettings> => {
  assertCurrentPrincipal(snapshot);
  await setupMealReminderNotificationCategory().catch(() => {});
  assertCurrentPrincipal(snapshot);
  const scheduled = await getScheduled();
  assertCurrentPrincipal(snapshot);
  const stale = scheduled.filter(
    (request) => isMealRequest(request) && requestPrincipal(request) !== snapshot.principalId,
  );
  await cancelIds(stale.map((request) => request.identifier));
  assertCurrentPrincipal(snapshot);

  const settings = await loadForPrincipal(snapshot);
  const desiredIds = new Set(
    Object.values(settings.notificationIds).filter((id): id is string => !!id),
  );
  const currentRequests = scheduled.filter(
    (request) =>
      isMealRequest(request) && requestPrincipal(request) === snapshot.principalId,
  );
  const extras = currentRequests.filter((request) => !desiredIds.has(request.identifier));
  await cancelIds(extras.map((request) => request.identifier));
  assertCurrentPrincipal(snapshot);

  if (!settings.enabled || settings.slots.length === 0) {
    await cancelIds(currentRequests.map((request) => request.identifier));
    assertCurrentPrincipal(snapshot);
    const disabled = { ...settings, enabled: false, slots: [], notificationIds: {} };
    await persistForPrincipal(snapshot, disabled);
    return disabled;
  }

  const byId = new Map(currentRequests.map((request) => [request.identifier, request]));
  const intact = settings.slots.every((slot) => {
    const id = settings.notificationIds[slot];
    const request = id ? byId.get(id) : undefined;
    return !!request && requestSlot(request) === slot;
  });
  if (intact) return settings;

  try {
    return await replaceSchedules(
      snapshot,
      settings,
      {
        slots: settings.slots,
        times: settings.times,
        customizedTimes: settings.customizedTimes,
      },
      false,
    );
  } catch (error) {
    if (!(error instanceof MealReminderPermissionError)) throw error;
    await cancelIds(currentRequests.map((request) => request.identifier));
    assertCurrentPrincipal(snapshot);
    const disabled = { ...settings, enabled: false, notificationIds: {} };
    await persistForPrincipal(snapshot, disabled);
    return disabled;
  }
};

export const reconcileMealReminders = async (): Promise<MealReminderSettings> => {
  if (Platform.OS === 'web') return defaultSettings();
  const snapshot = currentPrincipalSnapshot();
  if (!snapshot) return defaultSettings();
  return enqueueReminderOperation(async () => {
    try {
      return await reconcileMealRemindersUnlocked(snapshot);
    } catch (error) {
      // 계정 전환이 시작된 재조정은 새 principal transition이 다시 수행한다.
      if (error instanceof MealReminderStalePrincipalError) return defaultSettings();
      throw error;
    }
  });
};

/** 로그인 principal 전환. 직전 계정 설정/OS 예약을 폐기하고 새 계정 것만 복원한다. */
export const setMealReminderPrincipal = (principalId: string | null): Promise<void> => {
  const next = normalizePrincipal(principalId);
  if (principalBoundaryInitialized && next === desiredPrincipal) {
    return reminderOperationTail.then(() => undefined);
  }
  const previous = activePrincipal;
  principalBoundaryInitialized = true;
  desiredPrincipal = next;
  principalEpoch += 1;
  const epoch = principalEpoch;
  activePrincipal = null;
  recordedDate = '';
  recordedSlots = new Set();

  const transition = async (): Promise<void> => {
    if (previous) {
      const previousSettings = parseSettings(await AsyncStorage.getItem(storageKey(previous)));
      await cancelIds(
        Object.values(previousSettings.notificationIds).filter((id): id is string => !!id),
      );
    }
    const legacySettings = parseSettings(await AsyncStorage.getItem(LEGACY_STORAGE_KEY));
    await cancelIds(
      Object.values(legacySettings.notificationIds).filter((id): id is string => !!id),
    );
    const scheduled = await getScheduled();
    const previousRequests = scheduled.filter(
      (request) =>
        isMealRequest(request) &&
        (next === null ||
          (previous ? requestPrincipal(request) === previous : requestPrincipal(request) === null)),
    );
    await cancelIds(previousRequests.map((request) => request.identifier));
    if (previous) await AsyncStorage.removeItem(storageKey(previous));
    // 소유자를 증명할 수 없는 구버전 설정은 다른 계정에 연결하지 않는다.
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
    if (desiredPrincipal !== next || principalEpoch !== epoch) return;
    activePrincipal = next;
    if (next) {
      const snapshot = { principalId: next, epoch };
      try {
        await reconcileMealRemindersUnlocked(snapshot);
      } catch (error) {
        // 재조정 중 더 최신 principal 전환이 들어오면 뒤에 줄 선 전환이
        // 필요한 예약을 복구한다. 실제 OS/저장소 오류는 호출자에게 전파한다.
        if (!(error instanceof MealReminderStalePrincipalError)) throw error;
      }
    }
  };
  return enqueueReminderOperation(transition);
};

/** 선택된 끼니의 일일 로컬 알림을 새 세트로 교체한다. */
export const syncMealReminders = async (input: {
  enabled: boolean;
  slots: readonly MealSlotType[];
  times: Record<MealSlotType, string>;
  customizedTimes?: Partial<Record<MealSlotType, boolean>>;
}): Promise<MealReminderSettings> => {
  if (Platform.OS === 'web') throw new Error('식사 알림은 iOS·Android 앱에서 설정할 수 있어요.');
  const snapshot = currentPrincipalSnapshot();
  if (!snapshot) throw new Error('식사 알림을 저장하려면 다시 로그인해 주세요.');

  return enqueueReminderOperation(async () => {
    const previous = await loadForPrincipal(snapshot);
    if (!input.enabled) {
      const scheduled = await getScheduled();
      assertCurrentPrincipal(snapshot);
      const currentIds = scheduled
        .filter(
          (request) =>
            isMealRequest(request) && requestPrincipal(request) === snapshot.principalId,
        )
        .map((request) => request.identifier);
      await cancelIds([
        ...Object.values(previous.notificationIds).filter((id): id is string => !!id),
        ...currentIds,
      ]);
      assertCurrentPrincipal(snapshot);
      const disabled: MealReminderSettings = {
        enabled: false,
        times: { ...input.times },
        customizedTimes: { ...(input.customizedTimes ?? previous.customizedTimes) },
        slots: [],
        notificationIds: {},
      };
      await persistForPrincipal(snapshot, disabled);
      return disabled;
    }

    return replaceSchedules(
      snapshot,
      previous,
      {
        slots: input.slots,
        times: input.times,
        customizedTimes: input.customizedTimes ?? previous.customizedTimes,
      },
      true,
    );
  });
};

export const snoozeMealReminder = async (
  request: Notifications.NotificationRequest,
): Promise<string | null> => {
  if (Platform.OS === 'web') return null;
  const snapshot = currentPrincipalSnapshot();
  if (!snapshot) return null;
  return enqueueReminderOperation(async () => {
    try {
      assertCurrentPrincipal(snapshot);
      const slot = requestSlot(request);
      if (!slot || requestPrincipal(request) !== snapshot.principalId) return null;
      await setupMealReminderNotificationCategory();
      assertCurrentPrincipal(snapshot);
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${MEAL_SLOT_LABEL[slot]} 기록, 다시 알려드려요`,
          body: '추천을 확인하거나 방금 먹은 메뉴를 남겨 보세요.',
          sound: true,
          categoryIdentifier: CATEGORY_ID,
          data: { ...notificationData(slot, snapshot.principalId), snoozed: true },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 10 * 60,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
        },
      });
      if (isCurrentPrincipal(snapshot)) return id;
      await cancelIds([id]);
      return null;
    } catch (error) {
      // 알림 액션은 fire-and-forget으로 처리된다. 계정 전환으로 스누즈가
      // 무효해진 경우는 예상된 취소이므로 unhandled rejection을 남기지 않는다.
      if (error instanceof MealReminderStalePrincipalError) return null;
      throw error;
    }
  });
};

// 앱이 열려 있을 때는 오늘 이미 기록한 끼니의 배너/소리를 생략한다. 백그라운드에서는
// OS가 반복 알림을 직접 전달하므로 서버 푸시나 background task 없이는 같은 보장이 불가능하다.
export const setRecordedMealSlotsForToday = (
  slots: Iterable<MealSlotType>,
  date = new Date(),
): void => {
  recordedDate = localDateKey(date);
  recordedSlots = new Set(slots);
};

export const shouldPresentMealReminder = (
  data: Record<string, unknown> | null | undefined,
): boolean => {
  if (data?.kind !== 'meal-reminder') return true;
  const principalId = typeof data.principalId === 'string' ? data.principalId : null;
  const slot = typeof data.slot === 'string' && isSlot(data.slot) ? data.slot : null;
  if (!activePrincipal || principalId !== activePrincipal || !slot) return false;
  return recordedDate !== localDateKey(new Date()) || !recordedSlots.has(slot);
};
