import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  configureApi,
  handleUnauthorizedForCurrentSession,
  setAirLocationStorage,
  setBusFavoriteStorage,
  setMealDraftLocalFileAdapter,
  setMealDraftPrincipal,
  setMealDraftStorage,
  setReviewAskStorage,
  setSettlementDraftStorage,
  setSubwayFavoriteStorage,
  useAuthStore,
} from '@repo/shared';
import { useSettlementPrefsStore } from './settlementPrefsStore';
import { useThemeStore } from './themeStore';
import { mobileQueryClient } from './queryClient';
import { setMealReminderPrincipal } from './mealReminders';
import { clearMealPhotoCache } from './mealPhotoCache';
import {
  clearMealDraftPhotoFiles,
  deleteMealDraftPhotoFiles,
  switchMealDraftPhotoPrincipal,
} from './mealDraftPhotos';

// 정산하기 draft persist 어댑터 — 웹은 sessionStorage 가 자동, 앱은 모듈
// 로드 시점에 AsyncStorage 를 주입해야 zustand persist 가 첫 read/write 부터
// AsyncStorage 를 쓴다. zustand 의 createJSONStorage 는 async getItem 도
// 받으므로 AsyncStorage 그대로 호환.
setSettlementDraftStorage(AsyncStorage);
// 공개 질문(AskTab) 의 식당별 마지막 Q&A persist 어댑터 — 같은 이유로 주입.
setReviewAskStorage(AsyncStorage);
// 대중교통 즐겨찾기(게스트 로컬 저장분) persist 어댑터 — 미주입이면 NO_OP
// 스토리지로 떨어져 앱 재시작 시 게스트 즐겨찾기가 소실된다.
setBusFavoriteStorage(AsyncStorage);
setSubwayFavoriteStorage(AsyncStorage);
// 내 위치(날씨·대기 공용, 게스트 로컬 저장분) persist 어댑터 — 같은 이유로 주입. 로그인 사용자는
// 서버 저장분을 쓰고 이 값은 로그인 직후 1회 업로드 후 비운다(useAirLocation).
setAirLocationStorage(AsyncStorage);
// 식단 입력 draft(사진 인식 → 편집 → 저장 사이) persist 어댑터 — 미주입이면 앱이
// 백그라운드에서 종료될 때 입력 중이던 기록이 사라진다.
setMealDraftStorage(AsyncStorage);
setMealDraftLocalFileAdapter({
  deleteFiles: deleteMealDraftPhotoFiles,
  clearAll: clearMealDraftPhotoFiles,
  switchPrincipal: switchMealDraftPhotoPrincipal,
});

const TOKEN_KEY = 'lp:token';
const GUEST_KEY = 'lp:guest';
const PRINCIPAL_KEY = 'lp:principal-id';

// API URL 우선순위 (LAN IP 자동 추종):
//  1. 명시 환경변수 EXPO_PUBLIC_API_URL — 프로덕션/스테이징 원격 서버 또는
//     개발 중 강제 override 용. Metro 가 .env.local 등에서 읽어 JS 번들에
//     인라인하므로 process.env 로 그대로 읽힌다 (Constants.expoConfig.extra
//     경로보다 캐시/타이밍에 덜 민감).
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
  // process.env.EXPO_PUBLIC_API_URL — Metro 가 빌드 시 인라인. 비어있으면 undefined.
  // (Constants.expoConfig?.extra 는 manifest 갱신 타이밍 / 캐시에 영향을 받아
  //  dev client 에서 stale 가능 → process.env 를 1차 소스로 사용.)
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit;

  // Web — 브라우저가 접속한 hostname 을 그대로 friendly host 로 쓴다. Mac 에서
  // `http://localhost:8081` 로 보면 localhost, 폰/태블릿이 LAN IP 로 접속하면
  // 자동으로 같은 LAN IP:3000 으로 잡혀 별도 설정 없이 동작.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:${FRIENDLY_PORT}`;
  }

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

  return `http://localhost:${FRIENDLY_PORT}`;
};

const apiUrl = resolveApiUrl();

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log('[api-setup] apiUrl =', apiUrl);
}

let cachedToken: string | null = null;

const principalFromJwt = (token: string): string | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload || typeof globalThis.atob !== 'function') return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = globalThis.atob(padded);
    const utf8 = decodeURIComponent(
      [...binary].map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    const value = JSON.parse(utf8) as { userId?: unknown };
    return typeof value.userId === 'string' && value.userId.length > 0 ? value.userId : null;
  } catch {
    return null;
  }
};

export const bootstrapApi = async (): Promise<void> => {
  // 화면 모드는 await 로 먼저 당겨온다 — 스플래시가 떠 있는 동안 확정해야
  // Stack 첫 마운트가 올바른 테마로 그려진다(잘못된 테마 플래시 방지).
  await useThemeStore.getState().hydrate();

  // 정산 prefs 도 같이 hydrate — Step1 의 '새 행 기본' 패널 초기값이 무릇.
  void useSettlementPrefsStore.getState().hydrate();

  const [storedToken, storedGuest, storedPrincipal] = await Promise.all([
    AsyncStorage.getItem(TOKEN_KEY),
    AsyncStorage.getItem(GUEST_KEY),
    AsyncStorage.getItem(PRINCIPAL_KEY),
  ]);
  cachedToken = storedToken;
  // principal key만 신뢰하면 token 쓰기와 key 쓰기 사이 앱 종료에서 A key + B token 조합이
  // 생길 수 있다. 서버 JWT payload의 userId를 기준으로 잡고, decode 실패 시에는 draft/알림을
  // 아예 열지 않는다(/me 성공 뒤 다시 설정됨).
  const initialPrincipal = cachedToken ? principalFromJwt(cachedToken) : null;
  if (initialPrincipal && storedPrincipal !== initialPrincipal) {
    await AsyncStorage.setItem(PRINCIPAL_KEY, initialPrincipal);
  } else if (!initialPrincipal && storedPrincipal) {
    await AsyncStorage.removeItem(PRINCIPAL_KEY);
  }
  // 화면을 열기 전에 principal 경계를 먼저 세워, 이전 계정의 메모·사진 URI·알림이
  // 스플래시 뒤에 한 프레임이라도 나타나지 않게 한다.
  await setMealDraftPrincipal(initialPrincipal);
  await setMealReminderPrincipal(initialPrincipal).catch(() => {});
  if (cachedToken) {
    useAuthStore.setState({ token: cachedToken });
  } else if (storedGuest === '1') {
    useAuthStore.setState({ isGuest: true });
  }

  let currentPrincipal = initialPrincipal;
  useAuthStore.subscribe((state) => {
    cachedToken = state.token;
    if (state.token) void AsyncStorage.setItem(TOKEN_KEY, state.token);
    else void AsyncStorage.removeItem(TOKEN_KEY);
    if (state.isGuest) void AsyncStorage.setItem(GUEST_KEY, '1');
    else void AsyncStorage.removeItem(GUEST_KEY);

    const nextPrincipal = state.token ? (state.user?.id ?? currentPrincipal) : null;
    if (nextPrincipal !== currentPrincipal) {
      currentPrincipal = nextPrincipal;
      void clearMealPhotoCache().catch(() => {});
      if (nextPrincipal) void AsyncStorage.setItem(PRINCIPAL_KEY, nextPrincipal);
      else void AsyncStorage.removeItem(PRINCIPAL_KEY);
      void setMealDraftPrincipal(nextPrincipal);
      void setMealReminderPrincipal(nextPrincipal).catch(() => {});
    }
  });

  configureApi({
    baseUrl: apiUrl,
    getToken: () => cachedToken,
    onUnauthorized: (requestToken) => {
      handleUnauthorizedForCurrentSession({
        requestToken,
        getCurrentToken: () => cachedToken,
        onCurrentSessionUnauthorized: () => {
          void mobileQueryClient.cancelQueries();
          mobileQueryClient.clear();
          // setMealDraftPrincipal 은 await 전 메모리를 동기적으로 비운다. 알림도 같은
          // principal 전환 큐에서 취소돼 401 뒤 다른 계정에 남지 않는다.
          void setMealDraftPrincipal(null);
          void setMealReminderPrincipal(null).catch(() => {});
          void clearMealPhotoCache().catch(() => {});
          useAuthStore.getState().clearSession();
        },
      });
    },
  });
};
