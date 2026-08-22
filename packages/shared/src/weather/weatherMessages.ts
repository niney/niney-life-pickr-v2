import { ApiError } from '../api/client.js';

// 기상청 프록시 에러 → 사용자 문구. 503 = 서버에 키 없음/일일 한도, 502 = 업스트림 무응답, 429 = 과요청.
// 웹 날씨 페이지와 앱 날씨 화면이 같은 문구를 쓴다.
export const weatherUpstreamMessage = (e: unknown, fallback: string): string => {
  if (e instanceof ApiError) {
    if (e.statusCode === 503) return `서버에 기상청 API 키가 없거나 일일 한도가 찼습니다. (${e.message})`;
    if (e.statusCode === 502) return `기상청 API가 응답하지 않습니다. 잠시 후 다시 시도하세요. (${e.message})`;
    if (e.statusCode === 429) return '요청이 너무 잦습니다. 잠시 후 다시 시도하세요.';
  }
  return fallback;
};
