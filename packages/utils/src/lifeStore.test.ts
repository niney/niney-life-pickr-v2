import { describe, expect, it } from 'vitest';
import {
  LIFE_STORE_KINDS,
  LIFE_STORE_LAYER_KINDS,
  isLifeStoreLayerKind,
  lifeStoreDisplayName,
  lifeStoreKindOf,
  normalizeLifeStoreName,
  parseLifeStoreKinds,
} from './lifeStore.js';

describe('lifeStore', () => {
  it('상권업종 코드 → kind (편의점은 종합 소매보다, 카페는 음식 대분류보다 먼저)', () => {
    expect(lifeStoreKindOf('G2', 'G204', 'G20405')).toBe('convenience');
    expect(lifeStoreKindOf('G2', 'G204', 'G20404')).toBe('mart');
    expect(lifeStoreKindOf('G2', 'G215', 'G21501')).toBe('pharmacy');
    expect(lifeStoreKindOf('S2', 'S209', 'S20902')).toBe('laundry');
    expect(lifeStoreKindOf('M1', 'M111', 'M11101')).toBe('vet');
    expect(lifeStoreKindOf('S2', 'S207', 'S20701')).toBe('beauty');
    expect(lifeStoreKindOf('S2', 'S207', 'S20703')).toBeNull(); // 네일숍
    expect(lifeStoreKindOf('I2', 'I212', 'I21201')).toBe('cafe');
    expect(lifeStoreKindOf('I2', 'I201', 'I20101')).toBe('food');
    expect(lifeStoreKindOf('I2', 'I211', 'I21104')).toBe('food'); // 요리 주점
    expect(lifeStoreKindOf('P1', 'P105', 'P10501')).toBe('academy');
    expect(lifeStoreKindOf('P1', 'P106', 'P10603')).toBe('academy');
    expect(lifeStoreKindOf('P1', 'P107', 'P10701')).toBeNull(); // 교육 지원
    expect(lifeStoreKindOf('L1', 'L102', 'L10201')).toBeNull(); // 부동산
    expect(lifeStoreKindOf(null, undefined, '')).toBeNull();
  });

  it('레이어 칩 6종은 전체 9종의 부분집합, 카페·음식점·학원은 레이어 밖', () => {
    for (const k of LIFE_STORE_LAYER_KINDS) expect(LIFE_STORE_KINDS).toContain(k);
    expect(isLifeStoreLayerKind('cafe')).toBe(false);
    expect(isLifeStoreLayerKind('food')).toBe(false);
    expect(isLifeStoreLayerKind('academy')).toBe(false);
    expect(isLifeStoreLayerKind('pharmacy')).toBe(true);
  });

  it('kind 파라미터 파싱 — 중복 제거·모르는 값 무시·빈값 전체', () => {
    expect(parseLifeStoreKinds('pharmacy,mart,pharmacy,xxx')).toEqual(['pharmacy', 'mart']);
    expect(parseLifeStoreKinds('')).toEqual([]);
    expect(parseLifeStoreKinds(undefined)).toEqual([]);
  });

  it('표시명 — 지점명이 상호에 없을 때만 붙인다', () => {
    expect(lifeStoreDisplayName('만나', '보람점')).toBe('만나 보람점');
    expect(lifeStoreDisplayName('GS25 세종보람점', '세종보람점')).toBe('GS25 세종보람점');
    expect(lifeStoreDisplayName('만나', '')).toBe('만나');
    expect(lifeStoreDisplayName('만나', null)).toBe('만나');
  });

  it('상호 정규화 — 공백·괄호·법인 표기·지점 접미 제거', () => {
    expect(normalizeLifeStoreName('(주)스타벅스커피 코리아')).toBe('스타벅스커피코리아');
    expect(normalizeLifeStoreName('맘스터치 세종보람점')).toBe('맘스터치');
    expect(normalizeLifeStoreName('본죽 (본점)')).toBe('본죽');
    expect(normalizeLifeStoreName('BBQ 1호점')).toBe('bbq');
    expect(normalizeLifeStoreName('명동교자')).toBe('명동교자');
  });
});
