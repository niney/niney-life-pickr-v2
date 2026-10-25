// Encoded polyline(구글 알고리즘) — 서버가 코스 선을 문자열로 줄여 저장·전송하고 웹이 되돌린다(등산 코스).
// 정밀도 1e5 ≈ 1m. 위도·경도 순서로 이전 점과의 차이를 부호 비트 + 5비트 묶음으로 쓴다.
import type { LatLng } from './geo.js';

const encodeValue = (v: number): string => {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let out = '';
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return out + String.fromCharCode(n + 63);
};

export function encodePolyline(points: readonly LatLng[], precision = 5): string {
  const f = 10 ** precision;
  let prevLat = 0;
  let prevLng = 0;
  let out = '';
  for (const p of points) {
    const lat = Math.round(p.lat * f);
    const lng = Math.round(p.lng * f);
    out += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

// 깨진 문자열(중간에 끊김)이면 읽은 데까지만 돌려준다.
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const f = 10 ** precision;
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let shift = 0;
    let result = 0;
    for (;;) {
      if (i >= encoded.length) return null;
      const b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
      if (b < 0x20) break;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    out.push({ lat: lat / f, lng: lng / f });
  }
  return out;
}
