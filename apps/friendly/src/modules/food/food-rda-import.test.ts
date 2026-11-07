import { describe, expect, it } from 'vitest';
import {
  parseRdaValue,
  pickRdaSheet,
  rdaCompositionFromTable,
  rdaLookup,
  rdaNameKey,
} from './food-rda-import.js';

describe('국가표준식품성분 DB 읽기', () => {
  it('값 표기 — "-" 는 값 없음, Tr·(0) 은 0', () => {
    expect(parseRdaValue('127')).toBe(127);
    expect(parseRdaValue('0.247')).toBe(0.247);
    expect(parseRdaValue('-')).toBeNull();
    expect(parseRdaValue('')).toBeNull();
    expect(parseRdaValue('Tr')).toBe(0);
    expect(parseRdaValue('(0)')).toBe(0);
    expect(parseRdaValue('농진청(21)')).toBeNull();
  });

  it('쉼표 구분 성분표 이름과 밑줄 구분 표준데이터 이름을 같은 키로', () => {
    expect(rdaNameKey('멥쌀, 현미, 생것')).toBe(rdaNameKey('멥쌀_현미_생것'));
    expect(rdaNameKey('메밀 냉면, 말린것')).toBe(rdaNameKey('메밀 냉면_말린것'));
    expect(rdaNameKey('바나나, 생것')).not.toBe(rdaNameKey('바나나, 동결건조'));
  });

  it('가장 높은 판의 DB 시트를 고른다', () => {
    expect(
      pickRdaSheet(['DB 설명', '국가표준식품성분 Database 10.0', '국가표준식품성분 Database 10.4', '국가표준식품성분 Database 10.10', '부록1)식품코드 연계표']),
    ).toBe('국가표준식품성분 Database 10.10');
    expect(pickRdaSheet(['DB 설명'])).toBeNull();
  });

  it('조판 행 → 성분명 행 → 단위 행 → 식품 행 모양을 읽는다', () => {
    const composition = rdaCompositionFromTable({
      header: ['10084', '', '9553', '', '', '', ''],
      rows: [
        ['DB10.4\r\n색인', '식품군', '식품명', '마그네슘', '아연', '엽산_\r\n엽산당량', '칼슘'],
        ['', '', '', 'mg', 'mg', 'μg', 'mg'],
        ['1', '곡류 및 그 제품', '귀리, 겉귀리, 도정, 생것', '127', '2.13', '24', '52'],
        ['2', '', '바나나, 생것', '27', 'Tr', '-', '6'],
        ['3', '', '바나나, 생것', '99', '9', '9', '9'],
      ],
    });
    expect(composition.get(rdaNameKey('귀리_겉귀리_도정_생것'))).toEqual({ magnesiumMg: 127, zincMg: 2.13, folateUg: 24 });
    // 같은 이름이 또 나오면 먼저 나온 행, 미분석('-')은 뺀다.
    expect(composition.get(rdaNameKey('바나나_생것'))).toEqual({ magnesiumMg: 27, zincMg: 0 });
    const lookup = rdaLookup(composition);
    expect(lookup('바나나_생것')).toEqual({ magnesiumMg: 27, zincMg: 0 });
    expect(lookup('사과_생것')).toBeUndefined();
  });
});
