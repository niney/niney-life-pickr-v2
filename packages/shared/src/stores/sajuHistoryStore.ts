import { SajuReadingResult, type SajuReadingResultType } from '@repo/api-contract';

// 브라우저의 명시적 '기기에 보관'만 영속화. 계정별로 분리하고, 저장 실패를 호출자에게 알린다.
const key = (principal: string) => `lp:saju:v1:${principal}`;
export const readDeviceSaju = (principal: string): SajuReadingResultType[] => {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(key(principal)) ?? '[]');
    if (!Array.isArray(values)) return [];
    return values
      .flatMap((v) => {
        const parsed = SajuReadingResult.safeParse(v);
        return parsed.success ? [parsed.data] : [];
      })
      .slice(0, 20);
  } catch {
    return [];
  }
};
export const storeDeviceSaju = (principal: string, reading: SajuReadingResultType) => {
  const values = readDeviceSaju(principal).filter((v) => v.createdAt !== reading.createdAt);
  localStorage.setItem(key(principal), JSON.stringify([reading, ...values].slice(0, 20)));
};
export const removeDeviceSaju = (principal: string, createdAt: string) => {
  localStorage.setItem(
    key(principal),
    JSON.stringify(readDeviceSaju(principal).filter((v) => v.createdAt !== createdAt)),
  );
};

// 공개 URL에는 취소 자격증명을 넣지 않는다. 링크를 만든 브라우저에서만 읽는다.
export const sajuShareCredential = {
  get: (token: string): string | null => {
    try {
      return localStorage.getItem(`lp:saju-share:${token}`);
    } catch {
      return null;
    }
  },
  set: (token: string, credential: string) => {
    try {
      localStorage.setItem(`lp:saju-share:${token}`, credential);
      return true;
    } catch {
      return false;
    }
  },
  remove: (token: string) => {
    try {
      localStorage.removeItem(`lp:saju-share:${token}`);
    } catch {
      /* 서버에서 이미 취소된 자격증명은 재사용할 수 없다. */
    }
  },
};
