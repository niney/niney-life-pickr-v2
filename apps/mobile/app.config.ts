import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Life Pickr',
  slug: 'life-pickr',
  version: '0.0.1',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'lifepickr',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.niney.lifepickr',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.niney.lifepickr',
  },
  web: {
    bundler: 'metro',
    output: 'static',
  },
  plugins: ['expo-router'],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  },
};

export default config;
