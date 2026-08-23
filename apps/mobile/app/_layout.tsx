import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, themes, useCurrentUser, useTheme } from '@repo/shared';
import { MEAL_SLOTS } from '@repo/utils';
import { bootstrapApi } from '../src/lib/api-setup';
import { mobileQueryClient } from '../src/lib/queryClient';
import { setupQueryFocus } from '../src/lib/queryFocus';
import { AnimatedSplash } from '../src/components/AnimatedSplash';
import { ReviewAskBanner } from '../src/components/ReviewAskBanner';
import { useResolvedThemeMode } from '../src/hooks/useResolvedThemeMode';
import {
  MEAL_REMINDER_RECORD_ACTION,
  MEAL_REMINDER_SNOOZE_ACTION,
  shouldPresentMealReminder,
  snoozeMealReminder,
} from '../src/lib/mealReminders';

// 네이티브 스플래시를 수동으로 끌 때까지 유지 — JS 가 떠서 인앱 풀배경
// 스플래시(AnimatedSplash)가 화면을 덮은 뒤에야 hideAsync() 로 넘긴다.
void SplashScreen.preventAutoHideAsync();

// 애니메이션 스플래시 최소 노출 시간(ms). 2단 시퀀스를 다 보여준 뒤 페이드아웃:
// 핀 바운스(~700) → splash.png 크로스페이드(950+550) → 잠깐 hold.
const MIN_SPLASH_MS = 2200;

// AppState → focusManager 배선 — 백그라운드에서 폴링 쿼리(대중교통 도착 등)
// 가 계속 도는 것을 막는다. 모듈 로드 시 1회.
setupQueryFocus();

// 하차·식사 등 앱의 로컬 알림은 화면이 열려 있을 때도 배너로 보여 준다. 특정
// 기능 화면이 한 번도 마운트되지 않아도 적용되도록 루트에서 한 번 설정한다.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const present = shouldPresentMealReminder(notification.request.content.data);
    return {
      shouldShowBanner: present,
      shouldShowList: present,
      shouldPlaySound: present,
      shouldSetBadge: false,
    };
  },
});

// 식사 알림을 누르면 식단 화면으로 이동한다. 허용한 내부 경로만 처리해 알림 data 가
// 임의 라우트가 되는 것을 막고, cold start 때 남은 마지막 응답도 한 번만 소비한다.
function NotificationNavigation() {
  const router = useRouter();
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse) => {
      const responseId = response.notification.request.identifier;
      const responseKey = `${responseId}:${response.actionIdentifier}`;
      if (handledResponseId.current === responseKey) return;
      const request = response.notification.request;
      const data = request.content.data;

      if (response.actionIdentifier === MEAL_REMINDER_SNOOZE_ACTION) {
        handledResponseId.current = responseKey;
        void snoozeMealReminder(request).finally(() => {
          void Notifications.clearLastNotificationResponseAsync();
        });
        return;
      }

      const hrefValue =
        response.actionIdentifier === MEAL_REMINDER_RECORD_ACTION ? data?.recordHref : data?.href;
      if (typeof hrefValue !== 'string') return;
      const allowed =
        hrefValue === '/meal' ||
        hrefValue === '/meal/new' ||
        MEAL_SLOTS.some(
          (slot) =>
            hrefValue === `/meal?tab=recommend&slot=${slot}` ||
            hrefValue === `/meal/new?slot=${slot}`,
        );
      if (!allowed) return;
      handledResponseId.current = responseKey;
      router.push(hrefValue as never);
      void Notifications.clearLastNotificationResponseAsync();
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) open(response);
    });
    return () => subscription.remove();
  }, [router]);

  return null;
}

// ThemeProvider 안쪽에서 useTheme 로 네이티브 Stack 헤더/scene 배경을 테마화한다.
// (헤더가 있는 화면들은 headerStyle/headerTintColor 를 따로 안 줘서 여기 한 번에
//  cascade 시킨다 — 각 화면은 headerShown/title 만 override.)
function RootNavigator() {
  const theme = useTheme();
  // 토큰만 복원된 cold start 에서도 /me 를 즉시 확인해 draft/알림 principal 을 확정한다.
  useCurrentUser();
  return (
    <>
      <NotificationNavigation />
      <Stack
        screenOptions={{
          headerShown: false,
          // headerBackButtonDisplayMode='minimal' — iOS 백 버튼에서 이전 화면
          // title 라벨을 끄고 chevron(<)만 노출.
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { color: theme.colors.text },
          headerShadowVisible: false,
          // scene 배경 — 화면 전환 시 흰 깜빡임 방지.
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  // 사용자 선택 + OS 스킴을 합친 실제 모드. 'system' 이면 OS 변경에 실시간 반응.
  const mode = useResolvedThemeMode();

  useEffect(() => {
    void bootstrapApi().then(() => setReady(true));
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  // GestureHandlerRootView 가 처음 레이아웃되는 순간 = 인앱 스플래시 오버레이가
  // 이미 화면을 덮은 시점. 여기서 네이티브 스플래시를 내려 흰 깜빡임을 막는다.
  const onLayout = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  // 부트스트랩 완료 + 최소 노출 시간 경과 → 인앱 스플래시 페이드아웃 시작.
  const splashDone = ready && minElapsed;

  return (
    // 루트 배경도 모드 따라감 — Stack 마운트 전/전환 틈의 흰 깜빡임 방지.
    // (GestureHandlerRootView 는 ThemeProvider 밖이라 useTheme 대신 토큰 직접 참조)
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: themes[mode].colors.bg }}
      onLayout={onLayout}
    >
      <ThemeProvider mode={mode}>
        <QueryClientProvider client={mobileQueryClient}>
          {/* BottomSheetModal portal 호스트 — 정산 입력 화면처럼 ScrollView 안에서
              호출되는 시트가 부모 tree 와 격리되도록 root 에 한 번만 둔다. */}
          <BottomSheetModalProvider>
            {/* 상태바 아이콘 색 — 다크 배경엔 밝은 아이콘, 라이트 배경엔 어두운
                아이콘. 'system' 강제-반대 케이스도 정확히 맞추려고 resolved mode
                로 직접 분기(style="auto" 는 OS 만 보므로 강제 모드와 어긋남). */}
            <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
            {ready && <RootNavigator />}
            {/* 진행 중 공개 질문(AskTab) 완료를 전역에서 지켜보다 상단 배너로 알림 —
                탭/화면을 떠나도 결과를 놓치지 않게 root 에 상주(웹 토스터 대응). */}
            {ready && <ReviewAskBanner />}
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </ThemeProvider>
      {/* 풀배경 그라데이션 스플래시 — 네이티브 스플래시를 이어받아 화면 전체를
          덮고, 준비되면 페이드아웃. 사라진 뒤 unmount. */}
      {showSplash && (
        <AnimatedSplash
          visible={!splashDone}
          onHidden={() => setShowSplash(false)}
        />
      )}
    </GestureHandlerRootView>
  );
}
