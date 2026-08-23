import * as FileSystem from 'expo-file-system/legacy';
import { Routes } from '@repo/api-contract';
import { getApiConfig, useAuthStore } from '@repo/shared';

export type MealPhotoVariant = 'full' | 'thumb';

const PHOTO_TOKEN_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CACHE_ROOT_NAME = 'meal-photos-v1';
// 서버 응답의 `Cache-Control: private, max-age=3600`과 같은 수명. 만료 뒤
// 네트워크가 끊겼을 때만 같은 principal의 stale 파일을 임시 폴백으로 쓴다.
const CACHE_MAX_AGE_MS = 60 * 60_000;
const ACTIVE_NAMESPACE_FILE = '.principal';

class MealPhotoDownloadError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'MealPhotoDownloadError';
  }
}

// 토큰 원문을 파일명에 남기지 않으면서 세션 간 경로 충돌 가능성을 충분히 낮추는
// 128-bit 지문. 이는 암호 검증 수단이 아니라 앱 샌드박스 내 캐시 namespace 용도다.
// 실제 접근 권한은 매 다운로드의 Bearer JWT를 서버가 검증한다.
const credentialFingerprint = (value: string): string => {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const words = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1];
  return words.map((word) => (word >>> 0).toString(16).padStart(8, '0')).join('');
};

const cacheRoot = (): string => {
  if (!FileSystem.cacheDirectory) {
    throw new MealPhotoDownloadError('이 기기에서는 사진 캐시를 사용할 수 없습니다.');
  }
  return `${FileSystem.cacheDirectory}${CACHE_ROOT_NAME}/`;
};

const cacheNamespace = (authToken: string): string => credentialFingerprint(authToken);

const cacheFile = (
  authToken: string,
  token: string,
  variant: MealPhotoVariant,
): string =>
  `${cacheRoot()}${cacheNamespace(authToken)}/${token}-${variant === 'thumb' ? 'thumb' : 'full'}.jpg`;

let activeNamespace: string | null = null;
let namespaceTail: Promise<void> = Promise.resolve();

// 디스크에는 현재 credential namespace 하나만 둔다. 앱 재시작 뒤 다른 계정이
// 로그인해도 marker 불일치를 보고 이전 계정 사진 캐시 전체를 먼저 지운다.
const prepareNamespace = (authToken: string): Promise<void> => {
  const namespace = cacheNamespace(authToken);
  const root = cacheRoot();
  const task = namespaceTail
    .catch(() => undefined)
    .then(async () => {
      if (useAuthStore.getState().token !== authToken) {
        throw new MealPhotoDownloadError('로그인 정보가 변경되었습니다.');
      }
      if (activeNamespace === namespace) {
        // OS가 저용량 상황에서 cacheDirectory 일부를 정리했어도 현재 세션에서
        // 다음 다운로드가 ENOENT로 끝나지 않게 경로를 다시 보장한다.
        await FileSystem.makeDirectoryAsync(`${root}${namespace}/`, { intermediates: true });
        return;
      }

      await FileSystem.makeDirectoryAsync(root, { intermediates: true });
      let storedNamespace: string | null = null;
      try {
        storedNamespace = await FileSystem.readAsStringAsync(`${root}${ACTIVE_NAMESPACE_FILE}`);
      } catch {
        // 첫 실행 또는 OS가 일부 캐시만 정리한 경우.
      }

      if (storedNamespace !== namespace) {
        await FileSystem.deleteAsync(root, { idempotent: true });
        await FileSystem.makeDirectoryAsync(root, { intermediates: true });
      }
      await FileSystem.makeDirectoryAsync(`${root}${namespace}/`, { intermediates: true });
      await FileSystem.writeAsStringAsync(`${root}${ACTIVE_NAMESPACE_FILE}`, namespace);
      activeNamespace = namespace;
    });
  namespaceTail = task;
  return task;
};

const inflight = new Map<string, Promise<string>>();

const downloadIntoCache = async (
  authToken: string,
  token: string,
  variant: MealPhotoVariant,
): Promise<string> => {
  if (!PHOTO_TOKEN_PATTERN.test(token)) {
    throw new MealPhotoDownloadError('사진 토큰 형식이 올바르지 않습니다.');
  }
  await prepareNamespace(authToken);
  if (useAuthStore.getState().token !== authToken) {
    throw new MealPhotoDownloadError('로그인 정보가 변경되었습니다.');
  }

  const destination = cacheFile(authToken, token, variant);
  const existing = await FileSystem.getInfoAsync(destination);
  const hasCachedFile = existing.exists && !existing.isDirectory && existing.size > 0;
  if (
    hasCachedFile &&
    Date.now() - existing.modificationTime * 1000 <= CACHE_MAX_AGE_MS
  ) {
    return destination;
  }

  const requestConfig = getApiConfig();
  if (!requestConfig.baseUrl) {
    throw new MealPhotoDownloadError('사진 서버가 아직 준비되지 않았습니다.');
  }
  const route =
    variant === 'thumb' ? Routes.Meal.photoThumb(token) : Routes.Meal.photo(token);
  const url = `${requestConfig.baseUrl.replace(/\/$/, '')}${route}`;
  const temporary = `${destination}.part`;

  try {
    await FileSystem.deleteAsync(temporary, { idempotent: true });
    const result = await FileSystem.downloadAsync(url, temporary, {
      headers: { Authorization: `Bearer ${authToken}` },
      sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
    });
    if (result.status !== 200) {
      await FileSystem.deleteAsync(temporary, { idempotent: true });
      if (result.status === 401) await requestConfig.onUnauthorized?.(authToken);
      if ([401, 403, 404].includes(result.status)) {
        await FileSystem.deleteAsync(destination, { idempotent: true });
      }
      throw new MealPhotoDownloadError(
        `사진을 불러오지 못했습니다 (${result.status})`,
        result.status,
      );
    }
    if (useAuthStore.getState().token !== authToken || activeNamespace !== cacheNamespace(authToken)) {
      await FileSystem.deleteAsync(temporary, { idempotent: true });
      throw new MealPhotoDownloadError('로그인 정보가 변경되었습니다.');
    }

    const downloaded = await FileSystem.getInfoAsync(temporary);
    if (!downloaded.exists || downloaded.isDirectory || downloaded.size <= 0) {
      await FileSystem.deleteAsync(temporary, { idempotent: true });
      throw new MealPhotoDownloadError('빈 사진 파일을 받았습니다.');
    }
    await FileSystem.deleteAsync(destination, { idempotent: true });
    await FileSystem.moveAsync({ from: temporary, to: destination });
    return destination;
  } catch (error) {
    await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
    // 일시적인 네트워크/5xx 실패라면 같은 principal의 기존 사본은 계속 보여 준다.
    // 권한·삭제 응답은 위에서 기존 파일까지 제거했으므로 여기로 폴백하지 않는다.
    const mayUseStale =
      !(error instanceof MealPhotoDownloadError) ||
      error.status === null ||
      error.status >= 500;
    if (hasCachedFile && mayUseStale && useAuthStore.getState().token === authToken) {
      return destination;
    }
    throw error;
  }
};

/** JWT 인증을 포함해 원본/썸네일을 계정별 디스크 캐시에 확보한다. */
export const ensureMealPhotoFile = (
  authToken: string,
  token: string,
  variant: MealPhotoVariant = 'thumb',
): Promise<string> => {
  const key = `${cacheNamespace(authToken)}:${token}:${variant}`;
  const running = inflight.get(key);
  if (running) return running;
  const promise = downloadIntoCache(authToken, token, variant).finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
};

/** 서버에서 사진이 삭제된 뒤 해당 principal의 로컬 사본도 함께 지운다. */
export const invalidateMealPhotoFiles = async (
  authToken: string,
  tokens: readonly string[],
): Promise<void> => {
  if (!authToken || tokens.length === 0) return;
  await prepareNamespace(authToken);
  const namespace = cacheNamespace(authToken);
  const keys = tokens
    .filter((token) => PHOTO_TOKEN_PATTERN.test(token))
    .flatMap((token) =>
      (['thumb', 'full'] as const).map((variant) => `${namespace}:${token}:${variant}`),
    );
  // 상세 화면을 닫는 순간 진행 중이던 원본 다운로드가 삭제 뒤 파일을 다시
  // 만들어내지 않도록 먼저 모두 끝낸 다음 최종 삭제한다.
  await Promise.all(keys.map((key) => inflight.get(key)?.catch(() => undefined)));
  await Promise.all(
    tokens
      .filter((token) => PHOTO_TOKEN_PATTERN.test(token))
      .flatMap((token) =>
        (['thumb', 'full'] as const).map((variant) =>
          FileSystem.deleteAsync(cacheFile(authToken, token, variant), { idempotent: true }),
        ),
      ),
  );
};

/** 로그아웃/식단 전체 삭제 흐름에서 호출할 수 있는 캐시 전체 정리 함수. */
export const clearMealPhotoCache = (): Promise<void> => {
  const task = namespaceTail
    .catch(() => undefined)
    .then(async () => {
      // 진행 중 다운로드는 완료 시 active namespace 불일치를 보고 임시 파일을
      // 버린다. 먼저 null로 바꿔 전체 삭제 뒤 사본이 부활하지 않게 한다.
      activeNamespace = null;
      await FileSystem.deleteAsync(cacheRoot(), { idempotent: true });
    });
  namespaceTail = task;
  return task;
};
