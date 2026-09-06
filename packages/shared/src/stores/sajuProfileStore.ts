import {
  SAJU_PROFILES_MAX,
  SajuProfile,
  SajuProfileInput,
  type SajuProfileInputType,
  type SajuProfileType,
} from '@repo/api-contract';
import { createInjectableStorage } from './injectableStorage.js';

const storage = createInjectableStorage();
export const setSajuProfileStorage = storage.setStorage;
export const SAJU_PROFILE_STORAGE_KEY = 'lp:saju-profiles:v1:guest';
// 계정 데이터는 이 저장소에 쓰지 않는다. 로그인 시 게스트 출생정보도 자동 업로드하지 않는다.
export const readSajuProfiles = async (): Promise<SajuProfileType[]> => {
  const raw = await storage.storage.getItem(SAJU_PROFILE_STORAGE_KEY);
  if (!raw) return [];
  const parsed = SajuProfile.array().max(SAJU_PROFILES_MAX).safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error('기기에 보관된 프로필을 읽을 수 없어요.');
  return parsed.data;
};
let queue: Promise<unknown> = Promise.resolve();
const write = <T>(action: () => Promise<T>): Promise<T> => {
  const task = queue
    .catch(() => {})
    .then(async () =>
      typeof navigator !== 'undefined' && navigator.locks
        ? await navigator.locks.request(SAJU_PROFILE_STORAGE_KEY, action)
        : await action(),
    );
  queue = task;
  return task;
};
export const saveSajuProfile = (input: SajuProfileInputType, previous?: SajuProfileType) =>
  write(async () => {
    const data = SajuProfileInput.parse(input);
    const items = await readSajuProfiles();
    const existing = previous ? items.find((v) => v.id === previous.id) : null;
    if (previous && (!existing || existing.revision !== previous.revision))
      throw new Error('다른 창에서 변경한 프로필이에요. 새로고침해 주세요.');
    if (!previous && items.length >= SAJU_PROFILES_MAX)
      throw new Error(`프로필은 ${SAJU_PROFILES_MAX}명까지 보관할 수 있어요.`);
    const now = new Date().toISOString();
    const profile: SajuProfileType = {
      ...data,
      id: existing?.id ?? crypto.randomUUID(),
      revision: (existing?.revision ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const updated = existing
      ? items.map((v) => (v.id === existing.id ? profile : v))
      : [...items, profile];
    await storage.storage.setItem(SAJU_PROFILE_STORAGE_KEY, JSON.stringify(updated));
    return profile;
  });
export const removeSajuProfile = (id: string) =>
  write(async () => {
    const items = await readSajuProfiles();
    await storage.storage.setItem(
      SAJU_PROFILE_STORAGE_KEY,
      JSON.stringify(items.filter((v) => v.id !== id)),
    );
  });
