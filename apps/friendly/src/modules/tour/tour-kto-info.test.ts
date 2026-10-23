import { describe, expect, it } from 'vitest';
import { KtoGrid, KtoNameIndex, cleanKtoTitle, ktoNameScore, matchKtoName, parseKtoClosedDays, pickKtoMatch, shortenKtoText, type KtoMatchCandidate } from './tour-kto-info.js';

// 관광정보 ↔ 여행로그 장소의 순수 규칙 — 이름 정리·맞추기 기준·쉬는 요일 읽기·표시용 줄이기.
// 맞추기 예시는 2026-10-04 실데이터의 맞춤·아까운 후보에서 가져왔다(이름은 실제, 좌표는 거리만 맞춘 가짜).

const at = (contentId: string, contentTypeId: string, title: string, lat: number, lng: number): KtoMatchCandidate => ({ contentId, contentTypeId, title, lat, lng });
// 위도 0.001° ≈ 111m.
const BASE = { lat: 33.458, lng: 126.942 };
const north = (m: number): number => BASE.lat + m / 111_000;

describe('이름', () => {
  it('공식 명칭에 덧붙은 괄호 설명을 뗀다', () => {
    expect(cleanKtoTitle('성산일출봉 [유네스코 세계자연유산]')).toBe('성산일출봉');
    expect(cleanKtoTitle('한라산 (제주도 국가지질공원)')).toBe('한라산');
    expect(cleanKtoTitle('(주)한라산소주')).toBe('한라산소주');
    // 통째로 괄호면 그대로 둔다.
    expect(cleanKtoTitle('[제주올레 1코스]')).toBe('[제주올레 1코스]');
  });

  it('같은 이름은 1, 한쪽이 다른 쪽을 품으면 길이 비율만큼, 아니면 겹치는 글자쌍', () => {
    expect(ktoNameScore('성산일출봉', '성산일출봉 [유네스코 세계자연유산]')).toBe(1);
    expect(ktoNameScore('오설록 티뮤지엄', '오설록 티 뮤지엄')).toBe(1);
    // "오설록" ⊂ "오설록티뮤지엄" — 0.6 + 0.3 × 3/7.
    expect(ktoNameScore('오설록', '오설록 티 뮤지엄')).toBeCloseTo(0.6 + 0.3 * (3 / 7), 5);
    // 두 글자 이름은 품어도 올려 주지 않는다("우도" ⊂ "우도봉").
    expect(ktoNameScore('우도', '우도봉')).toBeLessThan(0.55);
    expect(ktoNameScore('협재해수욕장', '금능해수욕장')).toBeLessThan(0.4);
    expect(ktoNameScore('', '성산일출봉')).toBe(0);
  });

  it('같은 곳을 두 가지로 부르는 낱말은 하나로 — 해수욕장·해변, 재래·전통·상설시장', () => {
    expect(ktoNameScore('이호테우해수욕장', '이호테우해변')).toBe(1);
    expect(ktoNameScore('낙산해변', '낙산해수욕장')).toBe(1);
    expect(ktoNameScore('통영중앙시장', '통영중앙전통시장')).toBe(1);
    expect(ktoNameScore('예산상설시장', '예산시장 (5, 10일)')).toBe(1);
    // "동막해변" ⊂ "강화동막해변" — 0.6 + 0.3 × 4/6.
    expect(ktoNameScore('동막해수욕장', '강화 동막해변')).toBeCloseTo(0.8, 5);
  });

  it('괄호 안의 다른 이름은 통째로 같을 때만 쓴다 — 지역 구분(2자)과 설명 문구의 일부는 쓰지 않는다', () => {
    expect(ktoNameScore('월정리해수욕장', '월정리해변(월정리해수욕장)')).toBe(1);
    expect(ktoNameScore('두문포항', '종달항(두문포항)')).toBe(1);
    expect(ktoNameScore('종달항', '종달항(두문포항)')).toBe(1);
    expect(ktoNameScore('변산마실길 1코스(조개미패총길)', '[변산 마실길 1코스] 조개미 패총길')).toBe(1);
    // 장소 이름의 괄호 설명도 뗀다.
    expect(ktoNameScore('무주한풍루(시도유형문화재제19호)', '무주한풍루')).toBe(1);
    expect(ktoNameScore('안성', '국사암(안성)')).toBe(0);
    expect(ktoNameScore('울릉도', '버섯바위 (울릉도, 독도 국가지질공원)')).toBe(0);
  });

  it('이름이 겹치는 모양 — 같은 이름 · 장소 이름이 공식 명칭 안에 · 공식 명칭이 장소 이름 안에 · 글자쌍만', () => {
    expect(matchKtoName('성산일출봉', '성산일출봉 [유네스코 세계자연유산]')).toEqual({ score: 1, contained: 'same' });
    expect(matchKtoName('오징어 난전', '동명항오징어난전')).toMatchObject({ contained: 'place' });
    expect(matchKtoName('금송덕미 해리단길점', '해리단길')).toMatchObject({ contained: 'title' });
    expect(matchKtoName('제주흑돼지 명가', '제주흑돼지 명인')).toMatchObject({ contained: null });
  });
});

describe('맞추기', () => {
  const sight = { name: '성산일출봉', kind: '자연', ...BASE };

  it('같은 이름이면 3km 까지, 거의 같으면 1.5km, 비슷하면 500m — 그 밖은 맞추지 않는다', () => {
    expect(pickKtoMatch(sight, [at('1', '12', '성산일출봉 [유네스코 세계자연유산]', north(2500), BASE.lng)])).toMatchObject({ contentId: '1', nameScore: 1 });
    expect(pickKtoMatch(sight, [at('1', '12', '성산일출봉', north(3500), BASE.lng)])).toBeNull();
    // "성산일출봉" ⊂ "성산일출봉전망대"(0.6 + 0.3 × 5/8 ≈ 0.79) → 1.5km.
    expect(pickKtoMatch(sight, [at('2', '12', '성산일출봉 전망대', north(1200), BASE.lng)])).toMatchObject({ contentId: '2' });
    expect(pickKtoMatch(sight, [at('2', '12', '성산일출봉 전망대', north(1800), BASE.lng)])).toBeNull();
    // 이름이 다르면 바로 옆이어도 아니다.
    expect(pickKtoMatch(sight, [at('3', '12', '광치기해변', north(50), BASE.lng)])).toBeNull();
  });

  it('이름 점수가 높은 것, 같으면 가까운 것', () => {
    const hit = pickKtoMatch(sight, [at('far', '12', '성산일출봉', north(900), BASE.lng), at('near', '12', '성산일출봉', north(100), BASE.lng), at('other', '12', '성산일출봉 전망대', north(10), BASE.lng)]);
    expect(hit).toMatchObject({ contentId: 'near', nameScore: 1 });
    expect(hit!.distM).toBeGreaterThan(90);
    expect(hit!.distM).toBeLessThan(110);
  });

  it('바로 그 자리면 이름이 절반쯤만 겹쳐도 같은 곳 — 0.45 이상 100m, 0.4 이상 50m(볼거리만)', () => {
    // 글자쌍 0.50.
    const shop = { name: '제주관광공사 지정면세점', kind: '상업', ...BASE };
    expect(ktoNameScore(shop.name, '제주관광공사 중문면세점')).toBeCloseTo(0.5, 5);
    expect(pickKtoMatch(shop, [at('d', '38', '제주관광공사 중문면세점', north(80), BASE.lng)])).toMatchObject({ contentId: 'd' });
    expect(pickKtoMatch(shop, [at('d', '38', '제주관광공사 중문면세점', north(150), BASE.lng)])).toBeNull();
    // 글자쌍 0.44.
    const tower = { name: '남산공원 N서울타워', kind: '테마', ...BASE };
    expect(ktoNameScore(tower.name, '남산서울타워')).toBeCloseTo(4 / 9, 5);
    expect(pickKtoMatch(tower, [at('t', '12', '남산서울타워', north(40), BASE.lng)])).toMatchObject({ contentId: 't' });
    expect(pickKtoMatch(tower, [at('t', '12', '남산서울타워', north(80), BASE.lng)])).toBeNull();
  });

  it('식당·카페 — 거의 같은 이름은 300m, 한쪽 이름이 다른 쪽을 품은 가게는 50m. 글자쌍만 겹치는 이웃 가게는 맞추지 않는다', () => {
    const cafe = { name: '오설록 티뮤지엄', kind: '식당', ...BASE };
    expect(pickKtoMatch(cafe, [at('f', '39', '오설록 티뮤지엄', north(250), BASE.lng)])).toMatchObject({ contentId: 'f', contentTypeId: '39' });
    expect(pickKtoMatch(cafe, [at('f', '39', '오설록 티뮤지엄', north(400), BASE.lng)])).toBeNull();
    // "동화가든" ⊂ "강릉짬뽕순두부동화가든"(0.6 + 0.3 × 4/11 ≈ 0.71) — 바로 그 자리일 때만.
    const garden = { name: '동화가든 본점', kind: '식당', ...BASE };
    expect(pickKtoMatch(garden, [at('g', '39', '강릉짬뽕순두부 동화가든 본점', north(9), BASE.lng)])).toMatchObject({ contentId: 'g' });
    expect(pickKtoMatch(garden, [at('g', '39', '강릉짬뽕순두부 동화가든 본점', north(80), BASE.lng)])).toBeNull();
    // 한 골목의 비슷한 이름("제주흑돼지 명가" · "제주흑돼지 명인" — 겹치는 글자쌍 5/7 ≈ 0.71)은 볼거리 기준이면 맞지만 식당은 아니다.
    const pork = { name: '제주흑돼지 명가', kind: '식당', ...BASE };
    expect(ktoNameScore(pork.name, '제주흑돼지 명인')).toBeCloseTo(5 / 7, 5);
    expect(pickKtoMatch(pork, [at('p', '39', '제주흑돼지 명인', north(30), BASE.lng)])).toBeNull();
    expect(pickKtoMatch({ ...pork, kind: '상업' }, [at('p', '38', '제주흑돼지 명인', north(30), BASE.lng)])).toMatchObject({ contentId: 'p' });
  });

  it('유형이 엇갈리는 짝은 이름이 같고 300m 안일 때만 — 식당·카페는 공식 명칭이 장소 이름을 품은 경우까지', () => {
    // 볼거리 ↔ 음식점 콘텐츠: 카페가 "체험" 으로 올라 있는 곳.
    const garden = { name: '마노르블랑', kind: '체험', ...BASE };
    expect(pickKtoMatch(garden, [at('m', '39', '마노르블랑', north(10), BASE.lng)])).toMatchObject({ contentId: 'm', contentTypeId: '39' });
    expect(pickKtoMatch(garden, [at('m', '39', '마노르블랑', north(400), BASE.lng)])).toBeNull();
    // 이름이 비슷하기만 한 음식점은 볼거리에 붙이지 않는다 — 바로 옆이어도.
    expect(pickKtoMatch(sight, [at('r', '39', '성산일출봉 해녀식당', north(10), BASE.lng)])).toBeNull();
    expect(pickKtoMatch(sight, [at('r', '39', '성산일출봉 해녀식당', north(10), BASE.lng), at('s', '12', '성산일출봉 전망대', north(900), BASE.lng)])).toMatchObject({ contentId: 's' });
    // 식당·카페 ↔ 음식점이 아닌 콘텐츠.
    const cafe = { name: '오설록 티뮤지엄', kind: '식당', ...BASE };
    expect(pickKtoMatch(cafe, [at('m', '14', '오설록 티 뮤지엄', north(200), BASE.lng)])).toMatchObject({ contentId: 'm' });
    expect(pickKtoMatch(cafe, [at('m', '14', '오설록 티 뮤지엄', north(400), BASE.lng)])).toBeNull();
    // 공식 명칭이 장소 이름에 지역을 덧붙인 것은 받고("오징어난전" ⊂ "동명항오징어난전"), 장소 이름이 공식 명칭을 품은 것은
    // 그 동네의 다른 가게다("해리단길" ⊂ "금송덕미해리단길").
    expect(pickKtoMatch({ name: '오징어 난전', kind: '식당', ...BASE }, [at('o', '12', '동명항오징어난전', north(66), BASE.lng)])).toMatchObject({ contentId: 'o' });
    expect(pickKtoMatch({ name: '금송덕미 해리단길점', kind: '식당', ...BASE }, [at('h', '12', '해리단길', north(83), BASE.lng)])).toBeNull();
  });

  it('이름이 전국에 하나뿐인 콘텐츠는 더 멀리까지 — 볼거리 6km, 식당·카페 1.5km', () => {
    const trail = { name: '사려니숲길', kind: '자연', ...BASE };
    const one = new KtoNameIndex([at('t', '28', '사려니숲길', north(5500), BASE.lng), at('x', '12', '장생의숲길', north(2000), BASE.lng)]);
    expect(one.unique(trail)).toMatchObject({ contentId: 't', nameScore: 1 });
    expect(one.unique(trail)!.distM).toBeGreaterThan(5400);
    expect(new KtoNameIndex([at('t', '28', '사려니숲길', north(7000), BASE.lng)]).unique(trail)).toBeNull();
    // 같은 이름이 둘이면 어느 쪽인지 알 수 없다.
    expect(new KtoNameIndex([at('a', '12', '장도', north(4000), BASE.lng), at('b', '12', '장도', north(-5000), BASE.lng)]).unique({ name: '장도', kind: '자연', ...BASE })).toBeNull();
    // 괄호 속 별칭으로도 찾는다. 두 글자 이름은 쓰지 않는다.
    expect(new KtoNameIndex([at('h', '12', '종달항(두문포항)', north(4000), BASE.lng)]).unique({ name: '두문포항', kind: '자연', ...BASE })).toMatchObject({ contentId: 'h' });
    expect(new KtoNameIndex([at('u', '12', '우도', north(4000), BASE.lng)]).unique({ name: '우도', kind: '자연', ...BASE })).toBeNull();
    // 식당·카페는 1.5km, 유형이 엇갈리면 쓰지 않는다.
    const diner = { name: '네거리식당', kind: '식당', ...BASE };
    expect(new KtoNameIndex([at('n', '39', '네거리식당', north(400), BASE.lng)]).unique(diner)).toMatchObject({ contentId: 'n' });
    expect(new KtoNameIndex([at('n', '39', '네거리식당', north(2000), BASE.lng)]).unique(diner)).toBeNull();
    expect(new KtoNameIndex([at('n', '12', '네거리식당', north(400), BASE.lng)]).unique(diner)).toBeNull();
    expect(new KtoNameIndex([at('t', '39', '사려니숲길', north(5500), BASE.lng)]).unique(trail)).toBeNull();
  });

  it('격자 색인 — 주변 칸에서 3km 안의 콘텐츠를 빠뜨리지 않는다', () => {
    const grid = new KtoGrid([
      at('n', '12', '북쪽', north(2900), BASE.lng),
      at('s', '12', '남쪽', north(-2900), BASE.lng),
      // 경도 0.03° ≈ 2.8km(위도 33°) — 동서로 3km 는 한 칸을 건넌다.
      at('e', '12', '동쪽', BASE.lat, BASE.lng + 0.032),
      at('w', '12', '서쪽', BASE.lat, BASE.lng - 0.032),
      at('x', '12', '먼 곳', north(20_000), BASE.lng),
    ]);
    const ids = grid
      .near(BASE.lat, BASE.lng)
      .map((c) => c.contentId)
      .sort();
    expect(ids).toEqual(['e', 'n', 's', 'w']);
  });
});

describe('쉬는 요일 읽기', () => {
  it('매주 쉬는 요일(0 일 … 6 토)', () => {
    expect(parseKtoClosedDays('매주 월요일')).toEqual([1]);
    expect(parseKtoClosedDays('월요일')).toEqual([1]);
    expect(parseKtoClosedDays('매주 월요일, 1월 1일, 설날 및 추석 당일')).toEqual([1]);
    expect(parseKtoClosedDays('매주 일요일\n명절 연휴')).toEqual([0]);
    expect(parseKtoClosedDays('매주 화 휴무')).toEqual([2]);
    expect(parseKtoClosedDays('일요일, 공휴일')).toEqual([0]);
  });

  it('줄여 늘어놓은 요일·범위·주말', () => {
    expect(parseKtoClosedDays('매주 월, 화요일')).toEqual([1, 2]);
    expect(parseKtoClosedDays('토·일요일')).toEqual([0, 6]);
    expect(parseKtoClosedDays('월~수요일')).toEqual([1, 2, 3]);
    expect(parseKtoClosedDays('주말 및 공휴일')).toEqual([0, 6]);
    // "1월" 의 월은 요일이 아니다.
    expect(parseKtoClosedDays('1월, 일요일')).toEqual([0]);
  });

  it('괄호 안과 조건이 붙은 마디는 보지 않는다', () => {
    expect(parseKtoClosedDays('매주 월요일 (월요일이 공휴일인 경우 화요일)')).toEqual([1]);
    expect(parseKtoClosedDays('매주 월요일, 단 월요일이 공휴일이면 화요일 휴관')).toEqual([1]);
  });

  it('매주 쉬는 요일이 없는 문구는 [], 요일로 말할 수 없는 문구뿐이면 null', () => {
    expect(parseKtoClosedDays('연중무휴')).toEqual([]);
    expect(parseKtoClosedDays('설날·추석 당일')).toEqual([]);
    expect(parseKtoClosedDays('연중무휴 (기상 악화 시 통제)')).toEqual([]);
    expect(parseKtoClosedDays('매월 둘째, 넷째 수요일')).toBeNull();
    expect(parseKtoClosedDays('첫째·셋째 주 월요일')).toBeNull();
    expect(parseKtoClosedDays('격주 화요일')).toBeNull();
    expect(parseKtoClosedDays('동절기 매주 월요일')).toBeNull();
    expect(parseKtoClosedDays('방문 전 문의')).toBeNull();
    expect(parseKtoClosedDays('평일 휴무')).toBeNull();
    expect(parseKtoClosedDays(null)).toBeNull();
    expect(parseKtoClosedDays('  ')).toBeNull();
    // 매주 쉬는 요일과 월 단위 휴무가 같이 있으면 매주 쉬는 요일만.
    expect(parseKtoClosedDays('매주 월요일 / 매월 마지막 주 화요일')).toEqual([1]);
  });

  it('실제 문구(2026-10-04 받은 것) — 덧붙임(※)은 따로 보고, 시설마다 따로 적은 문구는 읽지 않는다', () => {
    expect(parseKtoClosedDays('매주 월요일 (단, 월요일이 공휴일인 경우 그 다음날 휴관)\n1월 1일\n설·추석 당일')).toEqual([1]);
    expect(parseKtoClosedDays('매주 화요일\n수요일')).toEqual([2, 3]);
    expect(parseKtoClosedDays('매주 월요일※ 단, 정기휴일이 공휴일 및 대체공휴일과 겹칠 경우에는 개방하며, 그 다음의 첫 번째 비공휴일이 정기휴일임')).toEqual([1]);
    expect(parseKtoClosedDays('매주 월요일 (단, 월요일이 공휴일인 경우 그 다음 평일 휴장)※ 체험시설은 실외 체험시설로 기상 악화 시 안전상 운영 중단될 수 있음')).toEqual([1]);
    expect(parseKtoClosedDays('명절')).toEqual([]);
    expect(parseKtoClosedDays('점포 별로 상이함')).toBeNull();
    expect(parseKtoClosedDays('※ 자세한 사항은 전화문의 요망')).toBeNull();
    expect(parseKtoClosedDays('매월 첫째 주 월요일※ 공휴일인 경우 다음날 휴무')).toBeNull();
    expect(parseKtoClosedDays('3월, 11월 2번째 월요일 (단, 정원 및 옥외전시장 등은 정상 운영)\n1월 1일\n설날·추석')).toBeNull();
    // 시설마다 다른 문구 — 대괄호 시설 이름, 줄마다 "- 시설".
    expect(parseKtoClosedDays('[동원, 열대식물원] 매주 월요일[서원] 매주 화요일')).toBeNull();
    expect(parseKtoClosedDays('[수성못 유원지] 연중무휴 [음악분수] 매주 월요일 ※ 운영 기간 홈페이지 참조')).toBeNull();
    expect(parseKtoClosedDays('- 서문시장 매월 첫째주·셋째주 일요일\n- 대구서문 야시장 매주 월요일~목요일')).toBeNull();
    expect(parseKtoClosedDays('[야외전시원 및 산책로]연중무휴[실내시설]설·추석 당일')).toBeNull();
    expect(parseKtoClosedDays('- 식물원 : 매주 월요일 (단, 월요일이 공휴일인 경우 그 다음 평일)\n1월 1일\n설·추석 당일- 버드파크 : 연중무휴')).toBeNull();
  });

  it('실제 문구에서 틀리게 읽혔던 것 — 덧붙임 속의 요일, 뒤집힌 문장, 철이 붙은 괄호, 줄인 요일', () => {
    // ※ 뒤는 그 장소가 쉰다는 말이 아니다(안의 다른 시설·일부 메뉴).
    expect(parseKtoClosedDays('연중무휴\n※ 매주 수요일은 떡볶이 재료 포장과 호떡만 가능')).toEqual([]);
    expect(parseKtoClosedDays('연중무휴 ※ 매주 월요일 테마파크 내 향토박물관 휴관 (테마파크 정상 운영)')).toEqual([]);
    expect(parseKtoClosedDays('연중무휴※ 나이트 유니버스 매주 월요일(공휴일인 경우 익일) 정기휴무')).toEqual([]);
    expect(parseKtoClosedDays('매주 월요일※ 계절 및 기상 상황에 따라 변경될 수 있으므로 방문 전 홈페이지 참조')).toEqual([1]);
    expect(parseKtoClosedDays('매주 수요일※ 공휴일, 설·추석 연휴 운영')).toEqual([3]);
    // "연중무휴" 가 본문에 있으면 뒤에 무엇이 와도 매주 쉬는 요일은 없다.
    expect(parseKtoClosedDays('연중무휴, 일요일은 오후만 영업')).toEqual([]);
    // "일요일을 제외한 공휴일" 은 일요일에 쉰다는 말이 아니다.
    expect(parseKtoClosedDays('매월 둘째, 넷째 월요일\n일요일을 제외한 관공서의 공휴일 (단, 설·추석 연휴 기간 중 일요일은 휴관)\n기타 관장이 필요하다고 인정하는 날')).toBeNull();
    // 철이 붙은 괄호 — 매주 쉬는 것이 아니다.
    expect(parseKtoClosedDays('매주 화요일, 수요일 (비수기)')).toBeNull();
    expect(parseKtoClosedDays('매주 월요일 (단, 7~8월은 무휴)')).toBeNull();
    // "매주 월,화" — 요일을 줄여 늘어놓고 "요일" 을 안 붙인 것.
    expect(parseKtoClosedDays('매주 월,화 시설물 점검으로 미운영')).toEqual([1, 2]);
    expect(parseKtoClosedDays('매주 월요일~화요일 (단, 법정공휴일과 겹치는 경우 정상 운영) ※ 기상이변으로 입산이 통제될 수 있으므로 전화 문의 후 방문 요망')).toEqual([1, 2]);
    expect(parseKtoClosedDays('매주 수요일, 일요일')).toEqual([0, 3]);
  });
});

describe('표시용 한 줄', () => {
  it('줄바꿈은 " / " 로, 길면 자른다', () => {
    expect(shortenKtoText('09:00~18:00\n※ 입장마감 17:30')).toBe('09:00~18:00 / ※ 입장마감 17:30');
    expect(shortenKtoText('가나다라마바사', 5)).toBe('가나다라…');
    expect(shortenKtoText('\n \n')).toBeNull();
    expect(shortenKtoText(null)).toBeNull();
  });

  it('실제 문구의 글머리표와 머리말 — 항목 사이를 " / " 로 잇는다', () => {
    expect(shortenKtoText('- 09:00~18:00- 준비시간 14:30~16:10- 마지막 주문 17:50')).toBe('09:00~18:00 / 준비시간 14:30~16:10 / 마지막 주문 17:50');
    expect(shortenKtoText('- 12:00~22:00\n- 마지막 주문 21:00')).toBe('12:00~22:00 / 마지막 주문 21:00');
    expect(shortenKtoText('[11월~2월]\n- 09:00~18:00\n- 입장 마감 17:30\n[5월~8월]\n- 09:00~20:00')).toBe('[11월~2월] 09:00~18:00 / 입장 마감 17:30 / [5월~8월] 09:00~20:00');
    expect(shortenKtoText('- 평일 09:00~18:00- 주말 09:00~20:00※ 시설별 이용시간 상이하므로 홈페이지 참조')).toBe('평일 09:00~18:00 / 주말 09:00~20:00 ※ 시설별 이용시간 상이하므로 홈페이지 참조');
    expect(shortenKtoText('※ 점포 별로 상이함')).toBe('※ 점포 별로 상이함');
    // "~" 가 없는 문구의 붙임표는 범위일 수 있다 — 건드리지 않는다. 전화번호의 붙임표도 그대로.
    expect(shortenKtoText('10:00 - 22:00')).toBe('10:00 - 22:00');
    expect(shortenKtoText('09:00~18:00 (문의 064-123-4567)')).toBe('09:00~18:00 (문의 064-123-4567)');
  });
});
