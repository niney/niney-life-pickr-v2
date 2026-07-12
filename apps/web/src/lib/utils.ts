import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 크롤링된 외부 URL(블로그 리뷰 링크 등)을 <a href> 에 그대로 바인딩하면
// `javascript:`/`data:` 스킴 유입 시 클릭형 XSS 싱크가 된다. http(s) 스킴만
// 통과시키고 그 외/파싱 실패는 undefined(=href 없음 → 클릭 불가)로 만든다.
export function safeExternalHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url, window.location.origin);
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}
