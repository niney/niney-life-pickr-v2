import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import Constants from 'expo-constants';
import { configureApi, useAuthStore } from '@repo/shared';

const TOKEN_KEY = 'lp:token';
const GUEST_KEY = 'lp:guest';

// API URL 우선순위 (LAN IP 자동 추종):
//  1. 명시 환경변수 EXPO_PUBLIC_API_URL (`extra.apiUrl`) — 프로덕션/스테이징
//     원격 서버 또는 개발 중 강제 override 용.
//  2. Metro dev 서버 호스트 — friendly 가 0.0.0.0 으로 listen 중이라 같은 IP
//     의 다른 포트(3000) 에 접근 가능.
//     - managed (Expo Go) : Constants.expoConfig.hostUri
//     - bare / dev client (prebuild 후) : getDevServer().url 의 호스트
//       (시뮬레이터는 localhost, 디바이스는 Mac LAN IP 반환)
//     ※ 디바이스 빌드 시 LAN IP 를 baked URL 에 박으려면:
//       REACT_NATIVE_PACKAGER_HOSTNAME=<Mac LAN IP> npx expo run:ios --device
//       (안 박으면 디바이스가 자기 localhost 로 Metro 찾다 실패 → 캐시 번들 사용)
//  3. localhost — 시뮬레이터/Expo Web 의 마지막 fallback.
const FRIENDLY_PORT = 3000;

const extractHostFromDevServer = (): string | null => {
  // RN 새 아키텍처에서 dev 서버 URL 얻는 정공법.
  // - getDevServer() 가 { url: 'http://192.168.0.47:8081/' } 반환 (디바이스)
  //   시뮬레이터에선 'http://localhost:8081/' 반환.
  // - 폴백: SourceCode.getConstants().scriptURL — 같은 URL 의 .bundle 경로.
  // deep import 경고가 뜨지만 SDK 54 / RN 0.81 기준 공식 대안 없음.
  let url: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const getDevServer = require('react-native/Libraries/Core/Devtools/getDevServer').default;
    url = getDevServer()?.url;
  } catch {
    // fallthrough
  }
  if (!url) {
    const sc = (NativeModules as { SourceCode?: { getConstants?: () => { scriptURL?: string } } })
      .SourceCode;
    url = sc?.getConstants?.().scriptURL;
  }
  if (!url) return null;
  // URL 파서 대신 정규식 — RN 의 URL polyfill 안정성 이슈 회피.
  const m = url.match(/^https?:\/\/([^/:]+)/);
  return m?.[1] ?? null;
};

const resolveApiUrl = (): string => {
  const explicit = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (explicit && explicit !== 'http://localhost:3000') return explicit;

  // managed 경로 (Expo Go / @expo/cli dev server)
  const expoHost =
    ((Constants.expoConfig as { hostUri?: string } | null | undefined)?.hostUri ??
      (Constants.expoGoConfig as { debuggerHost?: string } | null | undefined)
        ?.debuggerHost ??
      '').split(':')[0];
  if (expoHost && expoHost !== 'localhost') return `http://${expoHost}:${FRIENDLY_PORT}`;

  // bare / dev client 경로 — Metro dev 서버 URL 에서 호스트 추출
  const devHost = extractHostFromDevServer();
  if (devHost && devHost !== 'localhost' && devHost !== '127.0.0.1') {
    return `http://${devHost}:${FRIENDLY_PORT}`;
  }

  return explicit ?? `http://localhost:${FRIENDLY_PORT}`;
};

const apiUrl = resolveApiUrl();

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log('[api-setup] apiUrl =', apiUrl);
}

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
