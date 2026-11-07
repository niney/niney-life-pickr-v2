import { normalizeTerm } from '../../lib/text.js';
import { synonymVariants, type Lexicon } from '../food/engine/index.js';

// 영양소 점검의 '곁들임으로는' 후보 — 끼니에 더하거나 간식으로 먹는 흔한 과일·채소·반찬·유제품(2026-11-07).
// 흔한 한 끼(common-meals)만 보면 비타민 C 가 모자란 사람에게 피자·김밥(1인분이 기준의 11~16%)이 나왔다 — 비타민 C·A·
// 엽산·칼륨은 과일·채소에서 오는 영양소라 끼니 음식으로는 잘 안 채워진다. 숫자는 늘 카탈로그 행에서 오고, 이 목록은
// "사람들이 흔히 곁들이는 것"만 정한다(아세로라·구아바 같은 드문 과일이 비타민 C 1등으로 나오지 않게).
//
// 김치·장아찌·젓갈은 뺀다(나트륨) — 나트륨을 줄이자는 조언과 어긋난다. 이름은 카탈로그 표기(띄어쓰기 무관), 그 환경
// 카탈로그에 없거나 영양소가 없는 이름은 건너뛴다. 사람이 읽고 고치는 목록이라 무리별로 한 줄씩 둔다.
// prettier-ignore
export const COMMON_SIDES: Readonly<Record<string, readonly string[]>> = {
  과일: [
    '귤', '오렌지', '키위', '딸기', '사과', '배', '바나나', '포도', '토마토', '방울토마토', '참외', '수박', '감',
    '블루베리', '자몽', '복숭아',
  ],
  채소: ['파프리카', '브로콜리', '당근', '양배추', '오이', '상추'],
  '나물·무침': [
    '시금치나물', '콩나물무침', '숙주나물', '고사리나물', '취나물', '가지나물', '시래기나물', '무생채', '미나리무침',
    '오이무침', '브로콜리무침', '파래무침', '미역무침', '도라지무침',
  ],
  '볶음·조림': ['멸치볶음', '미역줄기볶음', '애호박볶음', '버섯볶음', '두부조림', '연근조림', '우엉조림', '감자조림', '콩자반'],
  '달걀·두부': ['달걀찜', '달걀말이', '두부부침'],
  '유제품·견과': ['우유', '요구르트', '요구르트(호상)', '치즈', '두유', '아몬드', '호두'],
  '감자·고구마': ['고구마', '감자'],
  샐러드: ['과일샐러드', '그린샐러드', '채소샐러드'],
};

// 카탈로그 1인분이 곁들임 한 번 양과 크게 다른 것만 — 우유·두유는 식약처 1인분이 100g 이라 한 컵(200ml)으로, 치즈는
// 67g 이라 한 장(20g)으로 본다. 운영자가 어휘(portion)로 정한 중량이 있으면 그쪽이 먼저다(food-serving).
export const COMMON_SIDE_PORTION_G: Readonly<Record<string, number>> = {
  우유: 200,
  두유: 200,
  치즈: 20,
};

/** 흔한 곁들임의 정규화 이름 — 메뉴 어휘의 표기 변형(계란↔달걀 등)까지. */
export const commonSideNorms = (lex: Lexicon): Set<string> => {
  const out = new Set<string>();
  for (const names of Object.values(COMMON_SIDES)) {
    for (const name of names) {
      const norm = normalizeTerm(name);
      if (!norm) continue;
      out.add(norm);
      for (const variant of synonymVariants(norm, lex)) out.add(variant);
    }
  }
  return out;
};
