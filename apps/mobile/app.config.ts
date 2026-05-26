import type { ExpoConfig } from 'expo/config';

// Universal Links / App Links 가 가로챌 호스트. dev/staging 에서 다른 도메인을
// 쓸 땐 EXPO_PUBLIC_WEB_HOST 로 override. associatedDomains 와 intentFilters 가
// 이 호스트의 /share/settlements/* 를 가로채 앱이 직접 연다 — 미설치 단말은
// 동일 URL 로 웹 SPA(SharedSettlementPage) 가 fallback.
const WEB_HOST = (process.env.EXPO_PUBLIC_WEB_HOST || 'nlpp.easypcb.co.kr').trim();

const config: ExpoConfig = {
  name: 'Life Pickr',
  slug: 'life-pickr',
  version: '0.0.1',
  orientation: 'portrait',
  // icon/splash/adaptiveIcon — assets/ 폴더가 아직 없어 임시로 주석. 추후 실제
  // 이미지 추가 시 복원: icon './assets/icon.png',
  // splash { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#ffffff' },
  // android.adaptiveIcon { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#ffffff' }
  //
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
    associatedDomains: [`applinks:${WEB_HOST}`],
  },
  android: {
    package: 'com.niney.lifepickr',
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
            pathPrefix: '/share/settlements',
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
