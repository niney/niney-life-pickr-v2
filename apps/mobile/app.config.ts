import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Life Pickr',
  slug: 'life-pickr',
  version: '0.0.1',
  orientation: 'portrait',
  // icon/splash/adaptiveIcon — assets/ 폴더가 아직 없어 임시로 주석. 추후 실제
  // 이미지 추가 시 복원: icon './assets/icon.png',
  // splash { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#ffffff' },
  // android.adaptiveIcon { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#ffffff' }
  scheme: 'lifepickr',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.niney.lifepickr',
  },
  android: {
    package: 'com.niney.lifepickr',
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
