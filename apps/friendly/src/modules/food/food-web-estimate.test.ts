import { describe, expect, it } from 'vitest';
import { aggregateWebSamples, htmlToText, parseFatsecretSearch } from './food-web-estimate.js';

// fatsecret.kr 검색 결과 텍스트 발췌(2026-09-02 실측).
const CARBONARA =
  '식품 검색 검색하기 94중 1에서 10 베이컨 까르보나라 파스타 (쉐프엠) 1개 (230g)당 - 칼로리: 485kcal | 지방: 28.00g | 탄수화물: 43.00g | 단백질: 15.00g 영양 정보 - 비슷한 | ' +
  '까르보나라 1 컵당 - 칼로리: 384kcal | 지방: 10.67g | 탄수화물: 51.70g | 단백질: 16.18g 다른 크기: 1 인분 - 384kcal , 100 g - 191kcal , 더보기 영양 정보 - 비슷한 | ' +
  '까르보나라 스파게티 (CJ) 1인분 (300g)당 - 칼로리: 26kcal | 지방: 14.00g 영양 정보 - 비슷한 | ' +
  '까르보나라 파스타 (풀무원) 1인분 (230g)당 - 칼로리: 410kcal | 지방: 24.00g 영양 정보 - 비슷한 | ' +
  '치킨 까르보나라 파스타 (애슐리) 1인분 (330g)당 - 칼로리: 460kcal 영양 정보 - 비슷한 | ' +
  '까르보나라 (라라코스트) 1인분 (510g)당 - 칼로리: 959kcal 영양 정보 - 비슷한 | ' +
  '라자냐 (풀무원) 1인분 (250g)당 - 칼로리: 500kcal 영양 정보 - 비슷한';
const EORIGULJEOT =
  '검색하기 1중 1에서 1 어리굴젓 100 g 당 - 칼로리: 88kcal | 지방: 2.65g | 탄수화물: 8.45g | 단백질: 8.03g 다른 크기: 1 인분 - 53kcal , 1 종지 - 13kcal , 더보기 영양 정보 - 비슷한 1 검색하기';
const HIGHBALL =
  '138중 1에서 10 하이볼 1 잔당 - 칼로리: 104kcal | 지방: 0g 다른 크기: 1 인분 - 104kcal , 100 g - 65kcal , 더보기 영양 정보 - 비슷한 ' +
  '이슬톡톡 (하이트) 1캔 (355ml)당 - 칼로리: 196kcal 영양 정보 - 비슷한 하이츄 (모리나가) 1인분 (57g)당 - 칼로리: 236kcal 영양 정보 - 비슷한';

describe('parseFatsecretSearch', () => {
  it('질의 음식이 든 항목만 뽑고, 앞 잡음을 떼고, 100g 명시·중량 환산을 구분한다', () => {
    const s = parseFatsecretSearch(CARBONARA, '까르보나라');
    expect(s.map((x) => x.label)).toEqual([
      '베이컨 까르보나라 파스타 (쉐프엠)',
      '까르보나라',
      '까르보나라 스파게티 (CJ)',
      '까르보나라 파스타 (풀무원)',
      '치킨 까르보나라 파스타 (애슐리)',
      '까르보나라 (라라코스트)',
    ]);
    const generic = s.find((x) => x.label === '까르보나라')!;
    expect(generic).toMatchObject({ grams: 100, kcal: 191, per100: 191, generic: true });
    expect(s[0]).toMatchObject({ grams: 230, kcal: 485, per100: 211, generic: false });
  });

  it('"100 g 당" 처럼 띄어쓴 크기도 읽고, 다른 음식(하이츄·이슬톡톡)은 거른다', () => {
    expect(parseFatsecretSearch(EORIGULJEOT, '어리굴젓')).toEqual([
      { label: '어리굴젓', grams: 100, kcal: 88, per100: 88, generic: true },
    ]);
    expect(parseFatsecretSearch(HIGHBALL, '하이볼')).toEqual([
      { label: '하이볼', grams: 100, kcal: 65, per100: 65, generic: true },
    ]);
  });

  it('htmlToText 는 태그·엔티티를 정리한다', () => {
    expect(htmlToText('<div>a&#160;b<script>x</script> <b>c</b>&amp;</div>')).toBe('a b c &');
  });
});

describe('aggregateWebSamples', () => {
  it('중앙값 ±25% 안의 항목이 2개 이상이면 그 중앙값, 오타(26kcal)는 밀려난다', () => {
    const agg = aggregateWebSamples(parseFatsecretSearch(CARBONARA, '까르보나라'))!;
    // 유효 6건(211·191·9·178·139·188) 중앙값 183 ±25% → 5건 일치, 그 중앙값 188.
    expect(agg.basis).toBe('multi');
    expect(agg.kcalPer100g).toBe(188);
    expect(agg.agreeing).toBe(5);
    expect(agg.samples.find((s) => s.label.includes('CJ'))!.agrees).toBe(false);
  });

  it('항목이 하나면 이름이 같은 일반 항목의 100g 값만 받는다', () => {
    expect(aggregateWebSamples(parseFatsecretSearch(EORIGULJEOT, '어리굴젓'))).toMatchObject({
      kcalPer100g: 88,
      agreeing: 1,
      basis: 'single',
    });
    expect(
      aggregateWebSamples([{ label: '자연산 골뱅이탕 (동원)', grams: 100, kcal: 30, per100: 30, generic: false }]),
    ).toBeNull();
    expect(aggregateWebSamples([])).toBeNull();
  });

  it('서로 안 맞는 두 항목은 미채택, 단 일반 항목이 있으면 그것만 single 로', () => {
    expect(
      aggregateWebSamples([
        { label: 'a', grams: 200, kcal: 100, per100: 50, generic: false },
        { label: 'b', grams: 200, kcal: 600, per100: 300, generic: false },
      ]),
    ).toBeNull();
    expect(
      aggregateWebSamples([
        { label: '떡볶이', grams: 100, kcal: 140, per100: 140, generic: true },
        { label: 'b', grams: 200, kcal: 600, per100: 300, generic: false },
      ]),
    ).toMatchObject({ kcalPer100g: 140, basis: 'single' });
  });
});
