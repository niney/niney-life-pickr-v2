import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { MealSlotType } from '@repo/api-contract';
import { MEAL_SLOT_LABEL, MEAL_SLOTS } from '@repo/utils';

const STORAGE_KEY = 'lp:meal-reminders:v1';
const ANDROID_CHANNEL_ID = 'meal-reminder';
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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
  notificationIds: {},
});

const isSlot = (value: string): value is MealSlotType =>
  (MEAL_SLOTS as readonly string[]).includes(value);

export const isMealReminderTime = (value: string): boolean => TIME_PATTERN.test(value);

export const loadMealReminderSettings = async (): Promise<MealReminderSettings> => {
  const fallback = defaultSettings();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as {
      enabled?: unknown;
      times?: Record<string, unknown>;
      notificationIds?: Record<string, unknown>;
    };

    const times = { ...fallback.times };
    const notificationIds: Partial<Record<MealSlotType, string>> = {};
    for (const slot of MEAL_SLOTS) {
      const time = parsed.times?.[slot];
      if (typeof time === 'string' && isMealReminderTime(time)) times[slot] = time;
      const id = parsed.notificationIds?.[slot];
      if (typeof id === 'string' && id.length > 0) notificationIds[slot] = id;
    }

    return { enabled: parsed.enabled === true, times, notificationIds };
  } catch {
    // 손상된 로컬 값 때문에 설정 화면 전체가 깨지지 않게 기본값으로 복구한다.
    return fallback;
  }
};

const persist = (settings: MealReminderSettings): Promise<void> =>
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

const cancelIds = async (ids: Iterable<string>): Promise<void> => {
  await Promise.all(
    [...ids].map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
  );
};

const ensurePermission = async (): Promise<void> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return;
  if (!current.canAskAgain) throw new MealReminderPermissionError();
  const requested = await Notifications.requestPermissionsAsync();
  if (!requested.granted) throw new MealReminderPermissionError();
};

/**
 * 선택된 끼니의 일일 로컬 알림을 새 세트로 교체한다.
 *
 * 새 예약을 모두 만든 뒤 이전 예약을 지워, 중간 실패 시 기존 알림까지 잃지 않는다.
 * 식단 알림의 식별자만 저장·취소하므로 하차 알림 등 다른 기능의 예약은 건드리지 않는다.
 */
export const syncMealReminders = async (input: {
  enabled: boolean;
  slots: readonly MealSlotType[];
  times: Record<MealSlotType, string>;
}): Promise<MealReminderSettings> => {
  if (Platform.OS === 'web') throw new Error('식사 알림은 iOS·Android 앱에서 설정할 수 있어요.');

  const previous = await loadMealReminderSettings();
  if (!input.enabled) {
    await cancelIds(Object.values(previous.notificationIds).filter((id): id is string => !!id));
    const disabled: MealReminderSettings = {
      enabled: false,
      times: { ...input.times },
      notificationIds: {},
    };
    await persist(disabled);
    return disabled;
  }

  const slots = [...new Set(input.slots)].filter((slot) => isSlot(slot));
  if (slots.length === 0) throw new Error('알림을 받을 끼니를 하나 이상 선택해 주세요.');
  for (const slot of slots) {
    if (!isMealReminderTime(input.times[slot])) {
      throw new Error(`${MEAL_SLOT_LABEL[slot]} 시간을 HH:MM 형식으로 입력해 주세요.`);
    }
  }

  await ensurePermission();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: '식사 알림',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 120, 200],
    });
  }

  const nextIds: Partial<Record<MealSlotType, string>> = {};
  try {
    for (const slot of slots) {
      const [hour$, minute$] = input.times[slot].split(':');
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `${MEAL_SLOT_LABEL[slot]}을 챙길 시간이에요`,
          body: '추천을 확인하거나 먹은 메뉴를 간단히 기록해 보세요.',
          sound: true,
          data: { href: '/meal', kind: 'meal-reminder', slot },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: Number(hour$),
          minute: Number(minute$),
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
        },
      });
      nextIds[slot] = id;
    }
  } catch (error) {
    await cancelIds(Object.values(nextIds).filter((id): id is string => !!id));
    throw error;
  }

  await cancelIds(Object.values(previous.notificationIds).filter((id): id is string => !!id));
  const next: MealReminderSettings = {
    enabled: true,
    times: { ...input.times },
    notificationIds: nextIds,
  };
  await persist(next);
  return next;
};
