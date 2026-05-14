import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { configureApi, useAuthStore } from '@repo/shared';

const TOKEN_KEY = 'lp:token';
const GUEST_KEY = 'lp:guest';

// API URL 우선순위 (LAN IP 자동 추종):
//  1. 명시 환경변수 EXPO_PUBLIC_API_URL (`extra.apiUrl`) — 프로덕션/스테이징
//     원격 서버 또는 개발 중 강제 override 용.
//  2. Expo Go / dev build 가 알고 있는 Metro 번들러 호스트 IP — 휴대전화가
//     QR 스캔으로 Metro 에 닿은 그 IP 가 PC 의 현재 LAN IP. friendly 가
//     0.0.0.0 으로 listen 중이라 같은 IP 의 다른 포트에 접근 가능.
//     PC IP 가 바뀌어도 Expo Go 가 자동으로 새 IP 로 연결하므로 .env.local
//     수정 없이 추종.
//  3. localhost — 시뮬레이터/Expo Web 의 마지막 fallback.
const FRIENDLY_PORT = 3000;

const resolveApiUrl = (): string => {
  const explicit = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (explicit && explicit !== 'http://localhost:3000') return explicit;

  // SDK 49+ 는 expoConfig.hostUri, 그 이전/Expo Go 는 expoGoConfig?.debuggerHost.
  // 형식: "192.168.0.10:8081" — 콜론으로 호스트만 분리.
  const debuggerHost =
    (Constants.expoConfig as { hostUri?: string } | null | undefined)?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | null | undefined)?.debuggerHost ??
    '';
  const host = debuggerHost.split(':')[0];
  if (host && host !== 'localhost') return `http://${host}:${FRIENDLY_PORT}`;

  return explicit ?? `http://localhost:${FRIENDLY_PORT}`;
};

const apiUrl = resolveApiUrl();

let cachedToken: string | null = null;

export const bootstrapApi = async (): Promise<void> => {
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  const storedGuest = await AsyncStorage.getItem(GUEST_KEY);
  if (cachedToken) {
    useAuthStore.setState({ token: cachedToken });
  } else if (storedGuest === '1') {
    useAuthStore.setState({ isGuest: true });
  }

  useAuthStore.subscribe((state) => {
    cachedToken = state.token;
    if (state.token) void AsyncStorage.setItem(TOKEN_KEY, state.token);
    else void AsyncStorage.removeItem(TOKEN_KEY);
    if (state.isGuest) void AsyncStorage.setItem(GUEST_KEY, '1');
    else void AsyncStorage.removeItem(GUEST_KEY);
  });

  configureApi({
    baseUrl: apiUrl,
    getToken: () => cachedToken,
    onUnauthorized: () => useAuthStore.getState().clearSession(),
  });
};
