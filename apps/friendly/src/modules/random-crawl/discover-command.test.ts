import { describe, expect, it } from 'vitest';
import { isDiscoverCommand, parseSearchCommand } from './random-crawl.service.js';

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

// 텔레그램 직접 검색 커맨드 파서 — 커맨드 판별 + 검색어 추출.
describe('parseSearchCommand', () => {
  it('검색어를 추출한다', () => {
    expect(parseSearchCommand('/search 강남 파스타')).toBe('강남 파스타');
    expect(parseSearchCommand('/SEARCH 역삼 맛집')).toBe('역삼 맛집'); // 커맨드 대소문자 무시
    expect(parseSearchCommand('/search@MyFoodBot 홍대 술집')).toBe('홍대 술집'); // 그룹 @봇명
    expect(parseSearchCommand('  /검색   본가  ')).toBe('본가'); // 한글 커맨드 + 앞뒤/중간 공백
    expect(parseSearchCommand('검색 스타벅스 역삼')).toBe('스타벅스 역삼'); // 슬래시 없는 한글
  });

  it('검색어가 없으면 빈 문자열(사용법 안내용)', () => {
    expect(parseSearchCommand('/search')).toBe('');
    expect(parseSearchCommand('/검색   ')).toBe('');
    expect(parseSearchCommand('검색')).toBe('');
  });

  it('검색 커맨드가 아니면 null', () => {
    expect(parseSearchCommand('')).toBeNull();
    expect(parseSearchCommand('안녕')).toBeNull();
    expect(parseSearchCommand('/discover')).toBeNull();
    expect(parseSearchCommand('search 강남')).toBeNull(); // 슬래시 없는 영문은 제외
    expect(parseSearchCommand('강남 검색')).toBeNull(); // 첫 토큰이 '강남'
  });
});
