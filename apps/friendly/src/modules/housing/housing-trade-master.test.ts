import { describe, expect, it } from 'vitest';
import { housingTradeId, normalizeHousingTradeItems, rtmsDateOrNull } from './housing-trade-master.service.js';

// 실거래 정규화 — 프로브 실응답 꼴의 item 으로 ① 매매 상세 필드·날짜 변환 ② 전월세의 전세/월세 분기와
// 소문자 태그 ③ 해제 거래 ④ drop 사유 ⑤ 완전 중복 '#n' 접미·id 안정성을 확인한다.

const TRADE_ITEM: Record<string, string> = {
  aptDong: '',
  aptNm: '동대문맨션',
  aptSeq: '11110-31',
  bonbun: '0578',
  bubun: '0005',
  buildYear: '1973',
  buyerGbn: '개인',
  cdealDay: '',
  cdealType: '',
  dealAmount: '58,960',
  dealDay: '21',
  dealMonth: '7',
  dealYear: '2025',
  dealingGbn: '중개거래',
  estateAgentSggNm: '서울 종로구',
  excluUseAr: '122.71',
  floor: '7',
  jibun: '578-5',
  landCd: '1',
  landLeaseholdGbn: 'N',
  rgstDate: '25.10.24',
  roadNm: '창신길',
  sggCd: '11110',
  slerGbn: '개인',
  umdCd: '17400',
  umdNm: '창신동',
};
const RENT_ITEM: Record<string, string> = {
  aptNm: '창신쌍용1',
  aptSeq: '11110-37',
  buildYear: '1992',
  contractTerm: '',
  contractType: '',
  dealDay: '31',
  dealMonth: '7',
  dealYear: '2025',
  deposit: '35,000',
  excluUseAr: '54.7',
  floor: '5',
  jibun: '702',
  monthlyRent: '0',
  preDeposit: '',
  preMonthlyRent: '',
  roadnm: '동망산길 19',
  sggCd: '11110',
  umdNm: '창신동',
  useRRRight: '',
};
const CTX = { sggCd: '11110', dealYm: '202507' };

describe('normalizeHousingTradeItems', () => {
  it('매매 상세 — 금액(만원)·면적·계약일·등기일자(YY.MM.DD)·거래유형·토지임대부', () => {
    const r = normalizeHousingTradeItems('trade', [TRADE_ITEM], CTX);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      dealType: 'trade',
      sggCd: '11110',
      dealYm: '202507',
      dealDate: '2025-07-21',
      umdNm: '창신동',
      jibun: '578-5',
      aptNm: '동대문맨션',
      aptSeq: '11110-31',
      roadNm: '창신길',
      area: 122.71,
      floor: 7,
      buildYear: 1973,
      price: 58960,
      rent: 0,
      dealingGbn: '중개거래',
      canceled: false,
      canceledDate: null,
      rgstDate: '2025-10-24',
      aptDong: null,
      buyerGbn: '개인',
      slerGbn: '개인',
      landLease: false,
      complexId: null,
    });
    expect(r.rows[0]!.id).toMatch(/^[0-9a-f]{24}$/);
    expect(r.byType.get('trade')).toBe(1);
  });

  it('전월세 — 월세 0 이면 jeonse, 있으면 monthly(보증금=price), 소문자 roadnm 도 읽는다', () => {
    const r = normalizeHousingTradeItems('rent', [RENT_ITEM, { ...RENT_ITEM, aptNm: '경희궁자이(1단지)', deposit: '14,580', monthlyRent: '60', contractType: '갱신', useRRRight: '사용', preDeposit: '13,000', preMonthlyRent: '50', contractTerm: '25.09~27.09' }], CTX);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ dealType: 'jeonse', price: 35000, rent: 0, roadNm: '동망산길 19', area: 54.7, contractType: null, preDeposit: null });
    expect(r.rows[1]).toMatchObject({
      dealType: 'monthly',
      price: 14580,
      rent: 60,
      contractType: '갱신',
      useRRRight: '사용',
      contractTerm: '25.09~27.09',
      preDeposit: 13000,
      preRent: 50,
    });
    expect(r.byType.get('jeonse')).toBe(1);
    expect(r.byType.get('monthly')).toBe(1);
  });

  it('해제 거래 — cdealType O, 해제일 변환', () => {
    const r = normalizeHousingTradeItems('trade', [{ ...TRADE_ITEM, cdealType: 'O', cdealDay: '25.8.1' }], CTX);
    expect(r.rows[0]).toMatchObject({ canceled: true, canceledDate: '2025-08-01' });
    expect(r.canceled).toBe(1);
  });

  it('drop — 금액·면적·계약일·단지명 누락은 사유별로 센다', () => {
    const r = normalizeHousingTradeItems(
      'trade',
      [
        { ...TRADE_ITEM, dealAmount: '' },
        { ...TRADE_ITEM, excluUseAr: 'abc' },
        { ...TRADE_ITEM, dealDay: '' },
        { ...TRADE_ITEM, aptNm: ' ' },
      ],
      CTX,
    );
    expect(r.rows).toHaveLength(0);
    expect(r.droppedBadPrice).toBe(1);
    expect(r.droppedBadArea).toBe(1);
    expect(r.droppedBadDate).toBe(1);
    expect(r.droppedBadName).toBe(1);
  });

  it('완전 중복은 두 번째부터 #n 접미, 같은 입력은 같은 id', () => {
    const r = normalizeHousingTradeItems('trade', [TRADE_ITEM, TRADE_ITEM, { ...TRADE_ITEM, floor: '8' }], CTX);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[1]!.id).toBe(`${r.rows[0]!.id}#2`);
    expect(r.rows[2]!.id).not.toBe(r.rows[0]!.id);
    expect(r.duplicateSuffixed).toBe(1);
    const again = normalizeHousingTradeItems('trade', [TRADE_ITEM], CTX);
    expect(again.rows[0]!.id).toBe(r.rows[0]!.id);
    expect(housingTradeId(r.rows[0]!)).toBe(r.rows[0]!.id);
  });

  it('rtmsDateOrNull — YY.MM.DD / YYYY-MM-DD / YYYYMMDD / 이상값', () => {
    expect(rtmsDateOrNull('25.10.24')).toBe('2025-10-24');
    expect(rtmsDateOrNull('2025-10-24')).toBe('2025-10-24');
    expect(rtmsDateOrNull('20251024')).toBe('2025-10-24');
    expect(rtmsDateOrNull('-')).toBeNull();
    expect(rtmsDateOrNull(null)).toBeNull();
  });
});
