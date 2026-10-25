import { describe, expect, it } from 'vitest';
import { decodePolyline, encodePolyline } from './polyline.js';

describe('encodePolyline / decodePolyline', () => {
  it('구글 문서 예제와 같은 문자열', () => {
    const pts = [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ];
    expect(encodePolyline(pts)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(pts);
  });

  it('산 코스 좌표는 1e-5 안에서 되돌아온다', () => {
    const pts = [
      { lat: 37.879128, lng: 127.967446 },
      { lat: 37.879191, lng: 127.967531 },
      { lat: 37.864537, lng: 127.983319 },
    ];
    const back = decodePolyline(encodePolyline(pts));
    expect(back).toHaveLength(3);
    back.forEach((p, i) => {
      expect(Math.abs(p.lat - pts[i]!.lat)).toBeLessThanOrEqual(0.000005);
      expect(Math.abs(p.lng - pts[i]!.lng)).toBeLessThanOrEqual(0.000005);
    });
  });

  it('빈 입력·끊긴 문자열', () => {
    expect(encodePolyline([])).toBe('');
    expect(decodePolyline('')).toEqual([]);
    // 마지막 경도가 잘리면 그 점은 버린다.
    expect(decodePolyline('_p~iF~ps|U_ulL')).toEqual([{ lat: 38.5, lng: -120.2 }]);
  });
});
