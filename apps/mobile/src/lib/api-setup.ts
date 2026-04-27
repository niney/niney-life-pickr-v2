import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { configureApi, useAuthStore } from '@repo/shared';

const TOKEN_KEY = 'lp:token';
const apiUrl = (Constants.expoConfig?.extra?.apiUrl as string) ?? 'http://localhost:3000';

let cachedToken: string | null = null;

export const bootstrapApi = async (): Promise<void> => {
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (cachedToken) {
    useAuthStore.setState({ token: cachedToken });
  }

  useAuthStore.subscribe((state) => {
    cachedToken = state.token;
    if (state.token) void AsyncStorage.setItem(TOKEN_KEY, state.token);
    else void AsyncStorage.removeItem(TOKEN_KEY);
  });

  configureApi({
    baseUrl: apiUrl,
    getToken: () => cachedToken,
    onUnauthorized: () => useAuthStore.getState().clearSession(),
  });
};
