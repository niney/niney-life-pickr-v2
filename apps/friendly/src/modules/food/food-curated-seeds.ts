// 코드 내장 큐레이션 시드 — 공공 데이터가 비워 두는 메뉴판 단골(주류·음료·공기밥).
//
// 식약처 음식 DB(15100070)는 조리음식만, 원재료 DB(15100065)는 생재료만 있어 "소주"·"맥주"·"콜라"가
// 어디에도 없다. 가공식품 DB(15100066)는 포털 배포본이 5만 행 상한이라 주류가 1행뿐. 그래서 메뉴판에
// 흔한 것만 제조사 표기(100ml당) 기준 근사값으로 둔다. 값은 대표 제품(참이슬 후레쉬 360ml 408kcal 등)
// 이고 브랜드는 별칭으로 붙인다 — 메뉴명 "참이슬"·"500cc카스"(중량 제거 뒤 "카스")가 exact/alias 로 걸린다.
//
// servingG 는 병·잔 기준 용량(ml)이다. 판정 규칙상 servingG > 100 이어야 '1인분' 등급이 되므로
// 캔·잔 단위가 있는 것만 채우고, 나머지는 100ml당으로만 보인다.

import type { FoodSeed } from './food-import.service.js';

interface Curated {
  name: string;
  aliases: string[];
  per100: number;
  /** 병·잔 용량(ml). 없으면 100ml당만. */
  serving?: number;
  category: string;
}

const CURATED: Curated[] = [
  // ── 주류(100ml당) ──
  { name: '소주', per100: 113, serving: 360, category: '주류', aliases: ['참이슬', '참이슬후레쉬', '참이슬오리지널', '처음처럼', '진로', '진로이즈백', '새로', '좋은데이', '대선', '한라산', '잎새주', '참소주', '시원', '맛있는참', '소주1병', '희석식소주', '참이슬후레쉬처음처럼'] },
  { name: '증류식소주', per100: 170, serving: 375, category: '주류', aliases: ['일품진로', '화요', '안동소주', '문배주', '토끼소주', '증류소주', '프리미엄소주'] },
  { name: '맥주', per100: 40, serving: 500, category: '주류', aliases: ['카스', '카스후레쉬', '테라', '켈리', '클라우드', '하이트', '오비', '오비라거', '생맥주', '병맥주', '생맥', '카스생맥주', '테라생맥주', '카스500', '테라500', '국산맥주', '라거', '맥주500cc', '드래프트'] },
  { name: '수입맥주', per100: 43, serving: 500, category: '주류', aliases: ['하이네켄', '아사히', '삿포로', '기린', '칭따오', '버드와이저', '코로나', '스텔라', '기네스', '호가든', '1664블랑', '블랑', '수제맥주', '크래프트맥주', '에일', 'IPA'] },
  { name: '막걸리', per100: 46, serving: 750, category: '주류', aliases: ['생막걸리', '장수막걸리', '지평막걸리', '느린마을', '느린마을막걸리', '탁주', '동동주', '탁배기'] },
  { name: '청하', per100: 113, serving: 300, category: '주류', aliases: ['청하1병'] },
  { name: '매화수', per100: 95, serving: 375, category: '주류', aliases: [] },
  { name: '백세주', per100: 80, serving: 375, category: '주류', aliases: [] },
  { name: '산사춘', per100: 85, serving: 375, category: '주류', aliases: [] },
  { name: '복분자주', per100: 96, serving: 375, category: '주류', aliases: ['복분자와인', '보해복분자'] },
  { name: '매실주', per100: 100, serving: 375, category: '주류', aliases: ['설중매', '매취순', '매실와인'] },
  { name: '사케', per100: 105, serving: 300, category: '주류', aliases: ['정종', '니혼슈', '준마이', '준마이슈', '다이긴조', '준마이다이긴조', '긴조', '일본청주', '청주', '사케1병', '토쿠리', '도쿠리'] },
  { name: '와인', per100: 85, serving: 150, category: '주류', aliases: ['하우스와인', '글라스와인', '레드와인', '화이트와인', '와인한잔', '잔와인', '샹그리아', '스파클링와인', '로제와인'] },
  { name: '하이볼', per100: 55, serving: 300, category: '주류', aliases: ['하이볼한잔', '얼그레이하이볼', '레몬하이볼', '유자하이볼', '산토리하이볼', '짐빔하이볼', '위스키하이볼'] },
  { name: '레몬사와', per100: 50, serving: 300, category: '주류', aliases: ['사와', '츄하이', '추하이', '유자사와', '자몽사와', '라임사와', '호로요이'] },
  { name: '유자주', per100: 90, serving: 300, category: '주류', aliases: ['유즈슈', '유자슈', '라쿠엔유즈슈', '유자술'] },
  { name: '위스키', per100: 250, serving: 45, category: '주류', aliases: ['위스키한잔', '싱글몰트', '버번', '스카치'] },
  // ── 음료(100ml당) ──
  { name: '콜라', per100: 42, serving: 250, category: '음료', aliases: ['코카콜라', '코크', '펩시', '펩시콜라', '콜라1캔', '콜라캔'] },
  { name: '제로콜라', per100: 0, serving: 250, category: '음료', aliases: ['코카콜라제로', '코크제로', '펩시제로', '제로', '콜라제로', '다이어트콜라'] },
  { name: '사이다', per100: 44, serving: 250, category: '음료', aliases: ['칠성사이다', '스프라이트', '사이다1캔', '사이다캔'] },
  { name: '제로사이다', per100: 0, serving: 250, category: '음료', aliases: ['칠성사이다제로', '스프라이트제로', '사이다제로'] },
  { name: '환타', per100: 45, serving: 250, category: '음료', aliases: ['오렌지환타', '환타오렌지', '환타파인', '오렌지음료'] },
  { name: '탄산수', per100: 0, serving: 500, category: '음료', aliases: ['스파클링워터', '페리에', '트레비', '씨그램', '탄산수1병'] },
  { name: '토닉워터', per100: 34, serving: 300, category: '음료', aliases: ['토닉', '진저에일'] },
  { name: '생수', per100: 0, serving: 500, category: '음료', aliases: ['물', '미네랄워터', '에비앙', '삼다수', '생수1병', '물1병'] },
  { name: '오렌지주스', per100: 45, serving: 250, category: '음료', aliases: ['오렌지쥬스', '오렌지100'] },
  { name: '포도주스', per100: 55, serving: 250, category: '음료', aliases: ['포도쥬스'] },
  { name: '사과주스', per100: 46, serving: 250, category: '음료', aliases: ['사과쥬스'] },
  { name: '에이드', per100: 40, serving: 400, category: '음료', aliases: ['레몬에이드', '자몽에이드', '청포도에이드', '유자에이드', '오렌지에이드', '라임에이드', '블루레몬에이드'] },
  { name: '아메리카노', per100: 2, serving: 350, category: '음료', aliases: ['아이스아메리카노', '핫아메리카노', '아아', '뜨아', '블랙커피'] },
  { name: '카페라떼', per100: 45, serving: 350, category: '음료', aliases: ['라떼', '아이스라떼', '카페라테', '라테', '아이스카페라떼'] },
  // ── 밥·기본(100g당) ──
  { name: '공기밥', per100: 166, serving: 210, category: '밥', aliases: ['공깃밥', '밥', '밥추가', '공기밥추가', '공깃밥추가', '흰밥', '흰쌀밥', '백미밥', '쌀밥한공기', '밥한공기', '즉석밥', '햇반'] },
];

export const curatedSeeds = (): FoodSeed[] =>
  CURATED.map((c) => ({
    name: c.name,
    repName: c.name,
    aliases: c.aliases,
    dishType: null,
    mainIngredient: null,
    cuisine: null,
    ingredients: null,
    servingG: c.serving ?? null,
    nutrition: c.serving
      ? {
          kcal: Math.round((c.per100 * c.serving) / 100),
          carbG: null,
          proteinG: null,
          fatG: null,
          sodiumMg: null,
          sugarG: null,
        }
      : null,
    kcalPer100g: c.per100,
    source: 'curated',
    sourceId: `curated:${c.name}`,
    sourceCategory: c.category,
    popularity: 0,
  }));
