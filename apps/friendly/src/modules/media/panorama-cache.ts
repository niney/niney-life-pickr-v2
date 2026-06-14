import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// 네이버 파노라마 썸네일(apis.naver.com/place/panorama/thumbnail/{placeId}/0?…
// &msgpad=…&md=…)은 HMAC+msgpad 로 서명된 시간제한(TTL) URL이다. 발급 직후엔
// 유효하지만 하루쯤 지나면 403 "HMAC 유효 시간 초과(errorCode 025)"로 죽는다.
// 서명은 네이버 비밀키로만 만들 수 있어 우리 쪽 갱신이 불가능하므로, 이런 URL은
// "휘발성"으로 취급해 DB 에 그대로 저장하지 않고 크롤 시점에 받아 사본을 남긴다.
export const isVolatileNaverPhoto = (url: string): boolean =>
  /^https?:\/\/apis\.naver\.com\/place\/panorama\//.test(url);

const PANORAMA_DIR = resolve(process.cwd(), 'data', 'panorama');
const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export const panoramaFilePath = (placeId: string): string =>
  join(PANORAMA_DIR, `${placeId}.jpg`);

export const hasPanoramaCache = async (placeId: string): Promise<boolean> => {
  try {
    await stat(panoramaFilePath(placeId));
    return true;
  } catch {
    return false;
  }
};

export type PanoramaCacheResult =
  | { ok: true; bytes: number }
  | {
      ok: false;
      reason: 'fetch_error' | 'not_ok' | 'not_image' | 'empty' | 'too_large';
      status?: number;
      contentType?: string;
    };

// 크롤 시점(URL이 아직 TTL 안이라 유효할 때) 1회 받아 디스크에 영구 저장한다.
// 헤더/쿠키 없이 단순 GET 으로 받아진다(프로빙으로 확인 — 200 image/jpeg).
// 성공/실패를 사유와 함께 돌려 호출측이 로깅·분기할 수 있게 한다.
export const cachePanoramaThumbnail = async (
  placeId: string,
  url: string,
): Promise<PanoramaCacheResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, reason: 'not_ok', status: res.status };
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/'))
      return { ok: false, reason: 'not_image', contentType: ct };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0) return { ok: false, reason: 'empty' };
    if (buf.byteLength > MAX_BYTES) return { ok: false, reason: 'too_large' };
    await mkdir(PANORAMA_DIR, { recursive: true });
    await writeFile(panoramaFilePath(placeId), buf);
    return { ok: true, bytes: buf.byteLength };
  } catch {
    return { ok: false, reason: 'fetch_error' };
  } finally {
    clearTimeout(timer);
  }
};
