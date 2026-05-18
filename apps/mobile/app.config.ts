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
