import * as FileSystem from 'expo-file-system/legacy';
import type { MealDraftPendingPhoto } from '@repo/shared';

const ROOT_NAME = 'meal-draft-photos-v1';
const PRINCIPAL_FILE = '.principal';

export interface MealDraftPhotoAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

const nextPendingId = (): string =>
  `pending-${Date.now().toString(36)}-${Math.floor(Math.random() * 0x1_0000_0000)
    .toString(36)
    .padStart(7, '0')}`;

// principal 원문을 앱 샌드박스 파일에 남기지 않기 위한 namespace 지문이다.
// 접근 제어 수단은 아니며, 계정 전환 때 이전 디렉터리인지 판별하는 용도다.
const principalFingerprint = (value: string): string => {
  let first = 2166136261;
  let second = 2246822507;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489909);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
};

const rootDirectory = (): string | null =>
  FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${ROOT_NAME}/` : null;

const filesDirectory = (): string | null => {
  const root = rootDirectory();
  return root ? `${root}files/` : null;
};

let activePrincipal: string | null = null;
let fileTail: Promise<void> = Promise.resolve();

const enqueueFileWork = <T>(work: () => Promise<T>): Promise<T> => {
  const result = fileTail.catch(() => undefined).then(work);
  fileTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const extensionFor = (asset: MealDraftPhotoAsset): string => {
  const mime = asset.mimeType?.toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(asset.fileName ?? '')?.[1]?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  return 'jpg';
};

const mimeTypeFor = (asset: MealDraftPhotoAsset): string => {
  if (asset.mimeType?.startsWith('image/')) return asset.mimeType;
  const extension = extensionFor(asset);
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic' || extension === 'heif') return `image/${extension}`;
  return 'image/jpeg';
};

const uploadNameFor = (asset: MealDraftPhotoAsset, clientId: string): string => {
  const extension = extensionFor(asset);
  const base = (asset.fileName ?? `meal-${clientId}.${extension}`)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(-100);
  return base.includes('.') ? base : `${base}.${extension}`;
};

/**
 * picker/camera URI를 앱 소유 documentDirectory로 먼저 복사한다.
 * cacheDirectory가 아니라 문서 영역이라 앱 재시작 뒤 업로드 재시도가 가능하다.
 */
export const stageMealDraftPhoto = (
  asset: MealDraftPhotoAsset,
): Promise<MealDraftPendingPhoto> =>
  enqueueFileWork(async () => {
    const directory = filesDirectory();
    if (!directory || !activePrincipal) {
      throw new Error('식단 사진 보관소가 아직 준비되지 않았습니다.');
    }
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const clientId = nextPendingId();
    const extension = extensionFor(asset);
    const destination = `${directory}${clientId}.${extension}`;
    const temporary = `${destination}.part`;
    try {
      await FileSystem.deleteAsync(temporary, { idempotent: true });
      await FileSystem.copyAsync({ from: asset.uri, to: temporary });
      const copied = await FileSystem.getInfoAsync(temporary);
      if (!copied.exists || copied.isDirectory || copied.size <= 0) {
        throw new Error('선택한 사진 파일이 비어 있습니다.');
      }
      await FileSystem.deleteAsync(destination, { idempotent: true });
      await FileSystem.moveAsync({ from: temporary, to: destination });
      return {
        clientId,
        localUri: destination,
        name: uploadNameFor(asset, clientId),
        mimeType: mimeTypeFor(asset),
        managedLocalFile: true,
        status: 'pending',
        lastError: null,
      };
    } catch (error) {
      await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
      await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
      throw error;
    }
  });

/** 앱 소유 경로 복사 실패 시 현재 세션 안에서라도 재시도할 수 있는 제한적 폴백. */
export const createUnmanagedPendingMealDraftPhoto = (
  asset: MealDraftPhotoAsset,
  reason: string,
): MealDraftPendingPhoto => {
  const clientId = nextPendingId();
  return {
    clientId,
    localUri: asset.uri,
    name: uploadNameFor(asset, clientId),
    mimeType: mimeTypeFor(asset),
    managedLocalFile: false,
    status: 'pending',
    lastError: reason,
  };
};

export const isMealDraftPhotoAvailable = async (uri: string): Promise<boolean> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory && info.size > 0;
  } catch {
    return false;
  }
};

/** shared store가 개별 pending/업로드 사진을 버릴 때 호출하는 strict 삭제 함수. */
export const deleteMealDraftPhotoFiles = (uris: readonly string[]): Promise<void> =>
  enqueueFileWork(async () => {
    const directory = filesDirectory();
    if (!directory) return;
    const isManagedDirectChild = (uri: string): boolean => {
      if (!uri.startsWith(directory)) return false;
      const fileName = uri.slice(directory.length);
      return (
        !fileName.includes('/') &&
        /^pending-[a-z0-9]+-[a-z0-9]+\.(?:jpe?g|png|webp|heic|heif)$/i.test(fileName)
      );
    };
    await Promise.all(
      [...new Set(uris)]
        .filter(isManagedDirectChild)
        .map((uri) => FileSystem.deleteAsync(uri, { idempotent: true })),
    );
  });

/** 취소/저장 성공/새 draft 시작 시 현재 principal의 draft 파일을 전부 정리한다. */
export const clearMealDraftPhotoFiles = (): Promise<void> =>
  enqueueFileWork(async () => {
    const directory = filesDirectory();
    if (!directory) return;
    await FileSystem.deleteAsync(directory, { idempotent: true });
    if (activePrincipal) {
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    }
  });

/**
 * 앱 부팅/로그인 전환의 principal 경계.
 * 같은 principal이면 재시작 전 pending 파일을 보존하고, 다르면 root 전체를 지운다.
 */
export const switchMealDraftPhotoPrincipal = (
  principalId: string | null,
): Promise<void> =>
  enqueueFileWork(async () => {
    const root = rootDirectory();
    if (!root) {
      activePrincipal = null;
      return;
    }
    if (!principalId) {
      activePrincipal = null;
      await FileSystem.deleteAsync(root, { idempotent: true });
      return;
    }

    const next = principalFingerprint(principalId);
    await FileSystem.makeDirectoryAsync(root, { intermediates: true });
    let stored: string | null = null;
    try {
      stored = (await FileSystem.readAsStringAsync(`${root}${PRINCIPAL_FILE}`)).trim();
    } catch {
      // 첫 실행 또는 OS/사용자가 파일 일부를 정리한 경우.
    }
    if (stored !== next) {
      await FileSystem.deleteAsync(root, { idempotent: true });
      await FileSystem.makeDirectoryAsync(root, { intermediates: true });
    }
    await FileSystem.makeDirectoryAsync(`${root}files/`, { intermediates: true });
    await FileSystem.writeAsStringAsync(`${root}${PRINCIPAL_FILE}`, next);
    activePrincipal = next;
  });
