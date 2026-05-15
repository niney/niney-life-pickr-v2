import { describe, expect, it } from 'vitest';
import {
  distanceMeters,
  isCandidate,
  nameSimilarity,
  normalizeName,
  scoreMatch,
} from './matching.js';

describe('normalizeName', () => {
  it('소문자/공백/구두점 제거', () => {
    expect(normalizeName('Sushi 경')).toBe('sushi경');
    expect(normalizeName('성심당-본점')).toBe('성심당');
    expect(normalizeName('Pho 24')).toBe('pho24');
  });

  it('분점 suffix 끝에서 1회만 제거', () => {
    expect(normalizeName('연남물갈비 등촌역점')).toBe('연남물갈비 등촌역'.replace(' ', ''));
    expect(normalizeName('본점')).toBe(''); // 통째로 suffix 만이면 빈 문자열
    expect(normalizeName('점심점')).toBe('점심'); // 중간 "점" 은 보존, 끝 1회만 제거
  });
});

describe('nameSimilarity', () => {
  it('완전 일치 = 1', () => {
    expect(nameSimilarity('성심당', '성심당')).toBe(1);
  });

  it('정규화 흡수 후 일치 = 1', () => {
    expect(nameSimilarity('성심당 본점', '성심당')).toBe(1);
    expect(nameSimilarity('Sushi경', 'sushi 경')).toBe(1);
  });

  it('한 글자 변형은 낮은 점수', () => {
    const s = nameSimilarity('스시경', '스시방');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(0.5);
  });

  it('완전 다른 이름 ≈ 0', () => {
    expect(nameSimilarity('성심당', '맥도날드')).toBe(0);
  });
});

describe('distanceMeters', () => {
  it('동일 좌표 = 0', () => {
    expect(distanceMeters({ lat: 37.5, lng: 127.0 }, { lat: 37.5, lng: 127.0 })).toBe(0);
  });

  it('서울 시내 약 1km 케이스', () => {
    // 위도 0.009 ≈ 1km
    const d = distanceMeters({ lat: 37.5, lng: 127.0 }, { lat: 37.509, lng: 127.0 });
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1050);
  });
});

describe('scoreMatch + isCandidate', () => {
  it('같은 가게 같은 위치 → 후보 채택', () => {
    const s = scoreMatch(
      { name: '성심당 본점', latitude: 36.327, longitude: 127.427 },
      { name: '성심당', latitude: 36.327, longitude: 127.427 },
    );
    expect(s.nameScore).toBe(1);
    expect(s.distanceM).toBe(0);
    expect(isCandidate(s)).toBe(true);
  });

  it('이름 같지만 멀리 떨어짐 → 거리로 탈락', () => {
    const s = scoreMatch(
      { name: '스시경', latitude: 37.5, longitude: 127.0 },
      { name: '스시경', latitude: 37.6, longitude: 127.1 }, // 10km+
    );
    expect(s.distanceM).not.toBeNull();
    expect(s.distanceM!).toBeGreaterThan(1000);
    expect(isCandidate(s)).toBe(false);
  });

  it('근처지만 이름 무관 → 탈락', () => {
    const s = scoreMatch(
      { name: '성심당', latitude: 36.327, longitude: 127.427 },
      { name: '맥도날드', latitude: 36.327, longitude: 127.427 },
    );
    expect(s.nameScore).toBe(0);
    expect(isCandidate(s)).toBe(false);
  });

  it('좌표 없는 한쪽 → 이름만으로 더 엄격한 컷오프', () => {
    const exact = scoreMatch(
      { name: '성심당', latitude: null, longitude: null },
      { name: '성심당', latitude: 36.327, longitude: 127.427 },
    );
    expect(exact.distanceM).toBeNull();
    expect(exact.score).toBe(1);
    expect(isCandidate(exact)).toBe(true);

    const partial = scoreMatch(
      { name: '스시경', latitude: null, longitude: null },
      { name: '스시방', latitude: 36.327, longitude: 127.427 },
    );
    expect(isCandidate(partial)).toBe(false);
  });
});
