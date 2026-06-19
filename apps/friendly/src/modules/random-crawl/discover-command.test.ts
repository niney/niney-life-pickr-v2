import { describe, expect, it } from 'vitest';
import { isDiscoverCommand } from './random-crawl.service.js';

// 텔레그램 → 발굴 역방향 트리거 커맨드 파서 단위 테스트.
describe('isDiscoverCommand', () => {
  it('발굴 트리거 커맨드를 인식한다', () => {
    expect(isDiscoverCommand('/discover')).toBe(true);
    expect(isDiscoverCommand('/DISCOVER')).toBe(true); // 대소문자 무시
    expect(isDiscoverCommand('/discover@MyFoodBot')).toBe(true); // 그룹 @봇명
    expect(isDiscoverCommand('  /discover  ')).toBe(true); // 앞뒤 공백
    expect(isDiscoverCommand('/discover 강남')).toBe(true); // 인자는 무시(첫 토큰만)
    expect(isDiscoverCommand('/발굴')).toBe(true);
    expect(isDiscoverCommand('발굴')).toBe(true);
  });

  it('그 외 텍스트는 트리거하지 않는다', () => {
    expect(isDiscoverCommand('')).toBe(false);
    expect(isDiscoverCommand('안녕')).toBe(false);
    expect(isDiscoverCommand('/foo')).toBe(false);
    expect(isDiscoverCommand('/start')).toBe(false);
    expect(isDiscoverCommand('discover')).toBe(false); // 슬래시 없는 영문은 제외
    expect(isDiscoverCommand('맛집 발굴해줘')).toBe(false); // 첫 토큰이 '맛집'
  });
});
