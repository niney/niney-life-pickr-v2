import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useAuthStore, useMealPhotoUrl } from '@repo/shared';
import { ensureMealPhotoFile, type MealPhotoVariant } from '~/lib/mealPhotoCache';

interface CachedMealPhotoResult {
  uri: string | null;
  error: string | null;
  isLoading: boolean;
  retry(): void;
}

interface NativeState {
  requestKey: string | null;
  uri: string | null;
  error: string | null;
}

// 앱에서는 인증 fetch → Blob → base64 변환 대신, Authorization header를 건
// FileSystem 다운로드 결과(file://)를 expo-image에 바로 넘긴다. Expo Web은
// FileSystem cacheDirectory가 없으므로 기존 object URL 훅을 그대로 사용한다.
export const useCachedMealPhoto = (
  photoToken: string | null | undefined,
  opts: { variant?: MealPhotoVariant; enabled?: boolean } = {},
): CachedMealPhotoResult => {
  const variant = opts.variant ?? 'thumb';
  const enabled = opts.enabled ?? true;
  const authToken = useAuthStore((state) => state.token);
  const isWeb = Platform.OS === 'web';
  const webPhoto = useMealPhotoUrl(photoToken, {
    variant,
    enabled: isWeb && enabled,
  });
  const [retryNonce, setRetryNonce] = useState(0);
  const [nativeState, setNativeState] = useState<NativeState>({
    requestKey: null,
    uri: null,
    error: null,
  });

  const requestKey = useMemo(
    () =>
      !isWeb && enabled && authToken && photoToken
        ? `${authToken}:${photoToken}:${variant}:${retryNonce}`
        : null,
    [authToken, enabled, isWeb, photoToken, retryNonce, variant],
  );

  useEffect(() => {
    if (!requestKey || !authToken || !photoToken) return undefined;
    let cancelled = false;
    void ensureMealPhotoFile(authToken, photoToken, variant)
      .then((uri) => {
        if (!cancelled) setNativeState({ requestKey, uri, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setNativeState({
          requestKey,
          uri: null,
          error: error instanceof Error ? error.message : '사진을 불러오지 못했습니다.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, photoToken, requestKey, variant]);

  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);

  if (isWeb) {
    return {
      uri: webPhoto.url,
      error: webPhoto.error,
      isLoading: enabled && !!photoToken && !webPhoto.url && !webPhoto.error,
      retry,
    };
  }

  const current = nativeState.requestKey === requestKey ? nativeState : null;
  return {
    uri: current?.uri ?? null,
    error: current?.error ?? null,
    isLoading: !!requestKey && !current?.uri && !current?.error,
    retry,
  };
};
