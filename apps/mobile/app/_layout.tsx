import { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QUERY_GC_TIME, QUERY_STALE_TIME, ThemeProvider } from '@repo/shared';
import { bootstrapApi } from '../src/lib/api-setup';
import { AnimatedSplash } from '../src/components/AnimatedSplash';

// 네이티브 스플래시를 수동으로 끌 때까지 유지 — JS 가 떠서 인앱 풀배경
// 스플래시(AnimatedSplash)가 화면을 덮은 뒤에야 hideAsync() 로 넘긴다.
void SplashScreen.preventAutoHideAsync();

// 애니메이션 스플래시 최소 노출 시간(ms). 2단 시퀀스를 다 보여준 뒤 페이드아웃:
// 핀 바운스(~700) → splash.png 크로스페이드(950+550) → 잠깐 hold.
const MIN_SPLASH_MS = 2200;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME,
      gcTime: QUERY_GC_TIME,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

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
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
      <ThemeProvider mode="light">
        <QueryClientProvider client={queryClient}>
          {/* BottomSheetModal portal 호스트 — 정산 입력 화면처럼 ScrollView 안에서
              호출되는 시트가 부모 tree 와 격리되도록 root 에 한 번만 둔다. */}
          <BottomSheetModalProvider>
            {/* 앱은 라이트 테마 고정 — 상태바 아이콘도 항상 어둡게.
                테마를 다크와 분기시키게 되면 style="auto" 로 바꿀 것. */}
            <StatusBar style="dark" />
            {/* headerBackButtonDisplayMode='minimal' — iOS 백 버튼에서 이전
                화면 title 을 라벨로 표시하는 기본 동작을 끄고 chevron(<)만 노출.
                (tabs) 같은 디렉터리명이 백 라벨로 새는 사고 회피 + 최신 Apple HIG. */}
            {ready && (
              <Stack
                screenOptions={{
                  headerShown: false,
                  headerBackButtonDisplayMode: 'minimal',
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)" />
              </Stack>
            )}
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
