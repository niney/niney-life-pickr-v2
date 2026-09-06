import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import {
  buildLpEmbedInjection,
  parseLpEmbedMessage,
  useAuthStore,
  useGuestKeyStore,
  useTheme,
} from '@repo/shared';
import { webUrl } from '~/lib/api-setup';

// 사주(C) — 웹 `/saju-c?embed=1` 을 WebView 로 임베드한다(docs/PLAN-saju.md 4차 — 타로 WebView 임베드와 같은 패턴).
// 3D 무대(three/R3F)를 RN 으로 다시 만들지 않고, 웹이 앱 안에서 그대로 돈다.
//  - 로드 전에 세션 토큰·게스트 키·화면 모드를 주입(브리지 계약: @repo/shared embedBridge) —
//    앱 회원은 WebView 에서도 회원(자동 저장·한도 면제), 게스트 키는 앱이 보관한 값이라 기기 한도가
//    앱과 일치한다. 토큰은 URL 에 싣지 않는다.
//  - 웹 → 앱 메시지: share(OS 공유 시트) / open(외부 브라우저).
//  - 같은 origin 안의 이동(공유 페이지·내 사주 기록)은 WebView 안에서, 밖은 외부 브라우저로.
//  - Android 뒤로가기는 WebView 히스토리를 먼저 되감는다.

const BG = '#0b0b0f';

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default function SajuScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ tool?: string | string[] }>();
  const tool = first(params.tool);
  const token = useAuthStore((s) => s.token);
  const guestKey = useGuestKeyStore((s) => s.guestKey);

  const webRef = useRef<WebView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [title, setTitle] = useState('사주(C)');
  const canGoBackRef = useRef(false);

  const origin = useMemo(() => webUrl.replace(/\/$/, ''), []);
  const uri = useMemo(() => {
    const q = new URLSearchParams({ embed: '1' });
    if (tool) q.set('tool', tool);
    return `${origin}/saju-c?${q.toString()}`;
  }, [origin, tool]);

  // 주입 스크립트는 첫 마운트 값으로 고정된다(WebView 가 prop 변경을 다시 주입하지 않음). 로그인
  // 상태가 바뀌면 화면을 다시 열어야 반영 — 사주 화면 안에서 로그인은 없으므로 실사용에 문제없다.
  const injected = useMemo(
    () => buildLpEmbedInjection({ token, guestKey, theme: theme.mode }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    const msg = parseLpEmbedMessage(e.nativeEvent.data);
    if (!msg) return;
    if (msg.type === 'share') {
      void Share.share(
        Platform.OS === 'ios' ? { url: msg.url, message: msg.title ?? '' } : { message: msg.url, title: msg.title },
      ).catch(() => {});
    } else if (msg.type === 'open') {
      void Linking.openURL(msg.url).catch(() => {});
    } else if (msg.type === 'title') {
      setTitle(msg.title || '사주(C)');
    }
  }, []);

  // 같은 origin 은 WebView 안에서, 밖(카카오맵 등)은 외부 브라우저로.
  const onShouldStart = useCallback(
    (req: { url: string }) => {
      if (req.url.startsWith(origin) || req.url.startsWith('about:')) return true;
      void Linking.openURL(req.url).catch(() => {});
      return false;
    },
    [origin],
  );

  const onNavChange = useCallback((nav: WebViewNavigation) => {
    canGoBackRef.current = nav.canGoBack;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerStyle: { backgroundColor: BG },
          headerTintColor: '#f3e9c6',
          headerTitleStyle: { color: '#f3e9c6' },
        }}
      />
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>사주를 불러오지 못했어요</Text>
          <Text style={styles.errorBody}>{failed}</Text>
        </View>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri }}
          style={styles.web}
          containerStyle={styles.web}
          injectedJavaScriptBeforeContentLoaded={injected}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStart}
          onNavigationStateChange={onNavChange}
          onLoadEnd={() => setLoading(false)}
          onError={(e) => setFailed(e.nativeEvent.description || '네트워크를 확인해 주세요.')}
          onHttpError={(e) => setFailed(`HTTP ${e.nativeEvent.statusCode}`)}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          overScrollMode="never"
          bounces={false}
          // WebGL 이 살아야 3D 무대가 뜬다(안 되면 웹이 Lite 로 폴백한다).
          androidLayerType="hardware"
        />
      )}
      {loading && !failed ? (
        <View style={[styles.center, styles.overlay]} pointerEvents="none">
          <ActivityIndicator color="#d9b65b" />
          <Text style={styles.loadingText}>천문도를 펼치는 중…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: BG },
  loadingText: { color: '#ece6d6', opacity: 0.7, fontSize: 13 },
  errorTitle: { color: '#f3e9c6', fontSize: 16, fontWeight: '700' },
  errorBody: { color: '#ece6d6', opacity: 0.7, fontSize: 13, textAlign: 'center' },
});
