import type { ExpoConfig } from 'expo/config';

// Universal Links / App Links 가 가로챌 호스트. dev/staging 에서 다른 도메인을
// 쓸 땐 EXPO_PUBLIC_WEB_HOST 로 override. associatedDomains 와 intentFilters 가
// 이 호스트의 /s/* (짧은 공유 경로) 를 가로채 앱이 직접 연다 — 미설치 단말은
// 동일 URL 로 웹 SPA(SharedSettlementPage) 가 fallback.
const WEB_HOST = (process.env.EXPO_PUBLIC_WEB_HOST || 'ninelife.kr').trim();

const config: ExpoConfig = {
  name: 'Life Pickr',
  slug: 'life-pickr',
  version: '0.0.1',
  orientation: 'portrait',
  // iOS 앱 아이콘 (1024x1024, 불투명). Android 는 아래 adaptiveIcon 으로 별도 지정.
  icon: './assets/icon.png',
  // scheme — 커스텀 URL scheme(lifepickr://...). app-to-app deep link, 푸시,
  // OAuth 콜백 등에서 사용. Universal Links 와 별개로 보조용.
  scheme: 'lifepickr',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.niney.lifepickr',
    // applinks:<host> 형식. 호스트의 /.well-known/apple-app-site-association
    // 이 응답하면 iOS 가 자동 검증해서 해당 호스트의 매칭 URL 을 앱으로 라우팅.
    // 별도 prefix 지정은 AASA 의 components 에서.
    //
    // 무료(Personal) Apple 팀은 Associated Domains capability 를 지원하지 않아
    // 프로비저닝 프로파일 생성이 실패한다. 로컬 무료 빌드에선 비우고, EAS/유료
    // 팀 빌드에서만 EXPO_PUBLIC_ENABLE_APPLINKS=1 로 Universal Links 를 켠다.
    // (커스텀 스킴 lifepickr:// 와 웹 fallback 은 깃발과 무관하게 항상 동작)
    ...(process.env.EXPO_PUBLIC_ENABLE_APPLINKS === '1'
      ? { associatedDomains: [`applinks:${WEB_HOST}`] }
      : {}),
  },
  android: {
    package: 'com.niney.lifepickr',
    // 적응형 아이콘 — foreground 는 흰 'L' 심볼이 박힌 네이비 풀블리드 이미지.
    // 거의 불투명이라 backgroundColor 는 가장자리 마스킹 보정용으로 동일 네이비.
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#08133d',
    },
    // App Links — autoVerify:true 면 설치 시 /.well-known/assetlinks.json 을
    // 자동 검증. fingerprint 매칭되면 디스앰비규에이터 없이 바로 앱이 열린다.
    // 검증 실패 시엔 사용자에게 "어떤 앱으로 열까요?" 선택지가 뜸 — 좋지 않으니
    // assetlinks.json 의 sha256 가 항상 prod 빌드의 fingerprint 와 일치해야.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: WEB_HOST,
            // 짧은 공유 경로. 트레일링 슬래시까지 줘서 /settlements 등 다른 /s
            // 로 시작하는 경로는 가로채지 않게 한다 (/s/<token> 만 매칭).
            pathPrefix: '/s/',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'single',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'react-native-bottom-tabs',
    // 스플래시 — 인앱 애니메이션 스플래시(AnimatedSplash)가 핀 등장 reveal 을
    // 담당하므로, 네이티브 스플래시에는 로고를 두지 않고 단색 배경만 깐다. 그래야
    // 네이티브 정적 핀과 인앱 애니 핀이 충돌(깜빡임)하지 않는다. 배경색은 인앱
    // 그라데이션 중심색(#3916ae)과 동일 → 단색에서 애니메이션으로 매끄럽게 연결.
    //
    // Android: expo-splash-screen 의 prebuild-config 는 styles.xml 에 항상
    // windowSplashScreenAnimatedIcon=@drawable/splashscreen_logo 를 박지만,
    // image 가 없으면 그 drawable 을 만들지 않아 리소스 링크가 깨진다
    // (`resource drawable/splashscreen_logo not found`). 완전 투명 PNG 를
    // android.image 로 주면 drawable 은 생성되되 로고는 보이지 않아 "단색만"
    // 의도를 유지한 채 빌드가 통과한다.
    [
      'expo-splash-screen',
      {
        backgroundColor: '#3916ae',
        android: {
          image: './assets/splash-transparent.png',
        },
      },
    ],
    // CNG 가 Info.plist 의 NSLocationWhenInUseUsageDescription / Android
    // ACCESS_*_LOCATION 권한을 자동 주입. ios/ 는 gitignored 라 prebuild 가
    // 다시 돌 때마다 키를 박아 줘야 expo-location 이 crash 안 함.
    [
      'expo-location',
      {
        locationWhenInUsePermission: '주변 식당을 보여주기 위해 위치를 사용합니다.',
      },
    ],
    // 영수증 사진 입력 — 카메라(촬영) + 라이브러리(앨범) 둘 다 사용. ios/ 가
    // gitignored 라 prebuild 마다 plist 키가 다시 들어가야 한다.
    [
      'expo-image-picker',
      {
        photosPermission: '영수증 사진을 첨부하기 위해 사진 라이브러리 접근이 필요합니다.',
        cameraPermission: '영수증을 바로 촬영하기 위해 카메라 접근이 필요합니다.',
      },
    ],
    './plugins/with-swift-concurrency-fix',
    './plugins/with-android-minify',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  // EXPO_PUBLIC_API_URL 은 src/lib/api-setup.ts 가 process.env 로 직접 읽음.
  // (Metro 가 빌드 시 인라인 — extra 경유보다 dev client 캐시에 덜 민감)
};

export default config;
