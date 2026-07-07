import { AppState, Platform } from 'react-native';
import { focusManager } from '@tanstack/react-query';

// React Query focusManager ↔ AppState 배선.
//
// RN 에는 브라우저의 visibilitychange 가 없어서 focusManager.isFocused() 가
// 항상 true 로 남는다 → refetchIntervalInBackground:false 인 폴링 쿼리
// (대중교통 도착 30s / 차량 위치 15s)가 앱이 백그라운드로 가도 계속 돌아
// 서울시 API 쿼터를 태운다. AppState 를 focus 신호로 연결해 백그라운드에서
// 폴링을 멈추고, 복귀 시 refetchOnWindowFocus 도 정상 동작하게 한다.
//
// web(RN-Web) 은 React Query 기본 visibilitychange 리스너가 이미 올바르게
// 동작하므로 건드리지 않는다.
export const setupQueryFocus = (): void => {
  if (Platform.OS === 'web') return;
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => {
      handleFocus(state === 'active');
    });
    return () => sub.remove();
  });
};
