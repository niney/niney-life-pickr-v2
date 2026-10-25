import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// 햅틱 — 고르기(칩·스테퍼·달력 날짜), 가벼운 누름(주 버튼·기록 버튼), 완료(저장 성공).
// expo-haptics 는 네이티브 모듈을 requireOptionalNativeModule 로 잡아 두어, 이 모듈 전에 빌드한 앱(JS 만 갱신된
// 개발 빌드)에서도 import 는 안전하고 호출만 실패한다 — 그 실패와 웹은 조용히 넘긴다(햅틱은 없어도 되는 장식).

const run = (fn: () => Promise<void>): void => {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
};

export const hapticSelection = (): void => run(() => Haptics.selectionAsync());

export const hapticLight = (): void => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

export const hapticSuccess = (): void =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
