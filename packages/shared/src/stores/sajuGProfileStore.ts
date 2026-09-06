import {
  SAJU_G_PROFILES_MAX,
  SajuGProfile,
  SajuGProfileInput,
  type SajuGProfileInputType,
  type SajuGProfileType,
} from '@repo/api-contract';
import { createInjectableStorage } from './injectableStorage.js';
import { SAJU_G_LEGACY_STORAGE } from './sajuGStorageMigration.js';

const storage = createInjectableStorage();
export const setSajuGProfileStorage = storage.setStorage;
export const SAJU_G_PROFILE_STORAGE_KEY = 'lp:saju-g-profiles:v1:guest';
// 계정 데이터는 이 저장소에 쓰지 않는다. 로그인 시 게스트 출생정보도 자동 업로드하지 않는다.
const parseProfiles = (raw: string | null): SajuGProfileType[] => {
  if (raw === null) return [];
  const parsed = SajuGProfile.array().max(SAJU_G_PROFILES_MAX).safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error('기기에 보관된 프로필을 읽을 수 없어요.');
  return parsed.data;
};
const readProfiles = async (): Promise<SajuGProfileType[]> => {
  if ((await storage.storage.getItem(SAJU_G_LEGACY_STORAGE.profiles)) === null)
    return parseProfiles(await storage.storage.getItem(SAJU_G_PROFILE_STORAGE_KEY));
  const migrate = async () => {
    const current = parseProfiles(await storage.storage.getItem(SAJU_G_PROFILE_STORAGE_KEY));
    const legacy = await storage.storage.getItem(SAJU_G_LEGACY_STORAGE.profiles);
    if (legacy === null) return current;
    const merged = new Map(current.map((p) => [p.id, p]));
    for (const profile of parseProfiles(legacy)) {
      const existing = merged.get(profile.id);
      if (!existing || existing.revision < profile.revision) merged.set(profile.id, profile);
    }
    if (merged.size > SAJU_G_PROFILES_MAX)
      throw new Error(
        '이전 프로필과 새 프로필이 20명을 넘어 자동으로 합치지 못했어요. 기존 데이터는 모두 남아 있어요.',
      );
    const items = [...merged.values()];
    const raw = JSON.stringify(items);
    await storage.storage.setItem(SAJU_G_PROFILE_STORAGE_KEY, raw);
    if ((await storage.storage.getItem(SAJU_G_PROFILE_STORAGE_KEY)) !== raw)
      throw new Error('프로필을 새 저장소로 옮기지 못했어요. 이전 데이터는 보존했어요.');
    await storage.storage.removeItem(SAJU_G_LEGACY_STORAGE.profiles);
    if ((await storage.storage.getItem(SAJU_G_LEGACY_STORAGE.profiles)) !== null)
      throw new Error('이전 프로필 저장소 정리가 완료되지 않았어요. 다시 시도해 주세요.');
    return items;
  };
  // 전환 중 열린 이전 버전 탭의 쓰기도 기다린다.
  return typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(SAJU_G_LEGACY_STORAGE.profiles, migrate)
    : migrate();
};
let queue: Promise<unknown> = Promise.resolve();
const write = <T>(action: () => Promise<T>): Promise<T> => {
  const task = queue
    .catch(() => {})
    .then(async () =>
      typeof navigator !== 'undefined' && navigator.locks
        ? await navigator.locks.request(SAJU_G_PROFILE_STORAGE_KEY, action)
        : await action(),
    );
  queue = task;
  return task;
};
export const readSajuGProfiles = () => write(readProfiles);
export const saveSajuGProfile = (input: SajuGProfileInputType, previous?: SajuGProfileType) =>
  write(async () => {
    const data = SajuGProfileInput.parse(input);
    const items = await readProfiles();
    const existing = previous ? items.find((v) => v.id === previous.id) : null;
    if (previous && (!existing || existing.revision !== previous.revision))
      throw new Error('다른 창에서 변경한 프로필이에요. 새로고침해 주세요.');
    if (!previous && items.length >= SAJU_G_PROFILES_MAX)
      throw new Error(`프로필은 ${SAJU_G_PROFILES_MAX}명까지 보관할 수 있어요.`);
    const now = new Date().toISOString();
    const profile: SajuGProfileType = {
      ...data,
      id: existing?.id ?? crypto.randomUUID(),
      revision: (existing?.revision ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const updated = existing
      ? items.map((v) => (v.id === existing.id ? profile : v))
      : [...items, profile];
    await storage.storage.setItem(SAJU_G_PROFILE_STORAGE_KEY, JSON.stringify(updated));
    return profile;
  });
export const removeSajuGProfile = (id: string) =>
  write(async () => {
    const items = await readProfiles();
    await storage.storage.setItem(
      SAJU_G_PROFILE_STORAGE_KEY,
      JSON.stringify(items.filter((v) => v.id !== id)),
    );
  });
