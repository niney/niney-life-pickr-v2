import { Platform, TurboModuleRegistry, UIManager } from 'react-native';
import type * as DateTimePickerModule from '@react-native-community/datetimepicker';

// 네이티브 날짜·시간 피커(@react-native-community/datetimepicker) 지연 로드.
// 이 의존성 전에 빌드한 앱(JS 만 갱신된 개발 빌드)에는 네이티브 쪽이 없다 — 최상위 import 는 Android 에서
// TurboModuleRegistry.getEnforcing 으로 모듈 로드 자체가 터지고, iOS 에선 '구현 안 된 컴포넌트' 상자가 그려진다.
// 그래서 네이티브가 있는지 먼저 보고 그때만 require 한다. 없으면(웹 포함) null — 화면은 숫자 직접 입력으로 남는다.

let cached: typeof DateTimePickerModule | null | undefined;

export const loadDateTimePicker = (): typeof DateTimePickerModule | null => {
  if (cached !== undefined) return cached;
  const available =
    Platform.OS === 'ios'
      ? UIManager.hasViewManagerConfig('RNDateTimePicker')
      : Platform.OS === 'android'
        ? TurboModuleRegistry.get('RNCDatePicker') !== null && TurboModuleRegistry.get('RNCTimePicker') !== null
        : false;
  cached = available ? (require('@react-native-community/datetimepicker') as typeof DateTimePickerModule) : null;
  return cached;
};
