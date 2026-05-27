import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QUERY_GC_TIME, QUERY_STALE_TIME, ThemeProvider } from '@repo/shared';
import { bootstrapApi } from '../src/lib/api-setup';

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

  useEffect(() => {
    void bootstrapApi().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
            <Stack
              screenOptions={{
                headerShown: false,
                headerBackButtonDisplayMode: 'minimal',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(auth)" />
            </Stack>
          </BottomSheetModalProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
