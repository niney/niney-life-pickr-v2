import { SajuGReadingResult, type SajuGReadingResultType } from '@repo/api-contract';
import { SAJU_G_LEGACY_STORAGE } from './sajuGStorageMigration.js';

// 브라우저의 명시적 '기기에 보관'만 영속화. 계정별로 분리하고, 저장 실패를 호출자에게 알린다.
const key = (principal: string) => `lp:saju-g:v1:${principal}`;
const parseReadings = (raw: string | null) =>
  SajuGReadingResult.array().parse(JSON.parse(raw ?? '[]'));
const mergedReadings = (principal: string) => {
  const current = parseReadings(localStorage.getItem(key(principal)));
  const legacy = parseReadings(localStorage.getItem(SAJU_G_LEGACY_STORAGE.history(principal)));
  const values = new Map(legacy.map((r) => [r.createdAt, r]));
  for (const reading of current) values.set(reading.createdAt, reading);
  return [...values.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
const loadReadings = (principal: string) => {
  const legacyKey = SAJU_G_LEGACY_STORAGE.history(principal);
  const items = mergedReadings(principal);
  if (localStorage.getItem(legacyKey) !== null) {
    // 이전할 때는 20개 초과분도 지우지 않는다. 다음 명시적 보관부터 기존 최근 20개 정책을 적용한다.
    const raw = JSON.stringify(items);
    localStorage.setItem(key(principal), raw);
    if (localStorage.getItem(key(principal)) !== raw)
      throw new Error('기기 보관함을 옮기지 못했어요.');
    localStorage.removeItem(legacyKey);
    if (localStorage.getItem(legacyKey) !== null)
      throw new Error('이전 보관함 정리가 완료되지 않았어요.');
  }
  return items;
};
export const readDeviceSajuG = (principal: string): SajuGReadingResultType[] => {
  try {
    return loadReadings(principal).slice(0, 20);
  } catch {
    // 쓰기가 막혀도 기존 결과는 볼 수 있다. 수정·삭제는 이전 완료 후에만 허용한다.
    try {
      return mergedReadings(principal).slice(0, 20);
    } catch {
      return [];
    }
  }
};
export const storeDeviceSajuG = (principal: string, reading: SajuGReadingResultType) => {
  const values = loadReadings(principal).filter((v) => v.createdAt !== reading.createdAt);
  localStorage.setItem(key(principal), JSON.stringify([reading, ...values].slice(0, 20)));
};
export const removeDeviceSajuG = (principal: string, createdAt: string) => {
  localStorage.setItem(
    key(principal),
    JSON.stringify(loadReadings(principal).filter((v) => v.createdAt !== createdAt)),
  );
};

// 공개 URL에는 취소 자격증명을 넣지 않는다. 링크를 만든 브라우저에서만 읽는다.
export const sajuGShareCredential = {
  get: (token: string): string | null => {
    try {
      const currentKey = `lp:saju-g-share:${token}`;
      const legacyKey = SAJU_G_LEGACY_STORAGE.share(token);
      const current = localStorage.getItem(currentKey);
      const legacy = localStorage.getItem(legacyKey);
      const value = current ?? legacy;
      if (value !== null && legacy !== null) {
        try {
          localStorage.setItem(currentKey, value);
          if (localStorage.getItem(currentKey) === value) localStorage.removeItem(legacyKey);
        } catch {
          /* 저장 공간이 막혀도 기존 취소 자격은 사용할 수 있다. */
        }
      }
      return value;
    } catch {
      return null;
    }
  },
  set: (token: string, credential: string) => {
    try {
      localStorage.setItem(`lp:saju-g-share:${token}`, credential);
      localStorage.removeItem(SAJU_G_LEGACY_STORAGE.share(token));
      return true;
    } catch {
      return false;
    }
  },
  remove: (token: string) => {
    try {
      localStorage.removeItem(`lp:saju-g-share:${token}`);
      localStorage.removeItem(SAJU_G_LEGACY_STORAGE.share(token));
    } catch {
      /* 서버에서 이미 취소된 자격증명은 재사용할 수 없다. */
    }
  },
};
