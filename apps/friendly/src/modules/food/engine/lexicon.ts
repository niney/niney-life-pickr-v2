// 메뉴 판정 엔진의 어휘(Lexicon) — 규칙(코드)과 어휘(데이터)를 분리한다.
//
// 여기 있는 목록은 "이름을 카탈로그 행에 맞추는 말"이지 칼로리 값이 아니다. 엔진(parse·resolve)은 이
// 구조만 알고, 내용은 DEFAULT_LEXICON_SOURCE 에서 온다. 어휘를 DB(어드민 편집)로 옮길 때는 같은 형태의
// LexiconSource 를 만들어 compileLexicon 에 넣으면 된다 — 엔진 코드는 바뀌지 않는다.

import { normalizeTerm } from '../../../lib/text.js';
import { CATEGORY_WORDS } from '../food-nutrition.service.js';

export interface LexiconSource {
  /** 떼어도 같은 음식인 앞말(얼큰·수제·숙성·통영·한우). 재료가 바뀌는 말(삼선·해물·치즈)은 넣지 않는다. */
  leadingModifiers: string[];
  /** 표기 동의어 — 양방향 치환. */
  synonymPairs: [string, string][];
  /** 여러 음식이 섞였다는 표식. 토큰의 앞·뒤에 붙을 때만 본다("쿄코코스테이크"의 '코스'는 아니다). */
  setWords: string[];
  /** 결합 기호(A/B, A,B)의 양쪽이 이 말이면 세트가 아니라 맛·온도 선택이다. */
  optionWords: string[];
  /** 접미 매칭에서 제외하는 범주어 — "동치미국수 → 국수"처럼 뭐든 붙는 말은 대표값이 없다. */
  suffixBlock: string[];
  /** 부위명에 붙여 보는 조리 접미("삼겹살" → "삼겹살구이"). */
  cutSuffixes: string[];
  /** 떼어서 원재료를 찾는 조리 접미("닭똥집 소금구이" → "닭똥집"). 긴 것부터. */
  rawSuffixes: string[];
  /** 수량 표식이지만 세트는 아닌 말("냉삼한판") — 뒤에 오는 부위가 카탈로그에 있으면 단일 메뉴(100g당). */
  quantifierWords: string[];
  /** 카탈로그 행에 덧붙이는 별칭(카탈로그 이름 → 메뉴판 표기). 적재 데이터가 모르는 식당 관행어. */
  extraAliases: Record<string, string[]>;
  /** 양이 달라지는 앞말(미니·점보·대왕) — 떼고 찾되 1인분 표시는 막는다. leadingModifiers 에도 있어야 한다. */
  sizeModifiers: string[];
}

export interface Lexicon {
  leadingModifiers: string[];
  synonymPairs: [string, string][];
  setWords: string[];
  optionWords: ReadonlySet<string>;
  suffixBlock: ReadonlySet<string>;
  cutSuffixes: string[];
  rawSuffixes: string[];
  quantifierWords: string[];
  extraAliases: Record<string, string[]>;
  sizeModifiers: ReadonlySet<string>;
}

export const DEFAULT_LEXICON_SOURCE: LexiconSource = {
  leadingModifiers: [
    '얼큰한', '얼큰', '매콤한', '매콤', '매운', '순한', '담백한', '고소한', '진한', '시원한', '뜨끈한',
    '수제', '명품', '프리미엄', '스페셜', '시그니처', '오리지널', '옛날', '전통', '정통', '원조', '특제',
    '특', '왕', '통', '화덕', '숯불', '직화', '생', '즉석', '국내산', '한우', '한돈', '와규', '1++', '1+',
    '100%', '착한', '든든한', '푸짐한', '정성', '엄마', '할매', '할머니', '집',
    // 고기집·횟집 — 숙성·품종·산지는 부위의 열량을 바꾸지 않는다(100g당 등급으로 간다).
    '숙성', '드라이에이징', '웻에이징', '초벌', '프라임', '이베리코', '흑돼지', '제주흑돼지', '암퇘지',
    '자연산', '양식', '활', '통영', '제주', '완도', '여수', '부산', '서산', '영광', '안동', '춘천', '전주', '수원', '마산',
    '포항', '울릉도', '강릉', '속초', '노량진', '국산', '미국산', '호주산', '스페인산', '캐나다산', '칠레산', '노르웨이산',
    '양념', '소금', '간장',
    // 식감·과장 수식어("육즙 특목살", "꼬들 오목살", "쫀득").
    '육즙', '꼬들', '쫀득', '바싹', '촉촉', '두툼', '두툼한', '큼직한', '대왕', '점보', '미니', '빅', '라지', '하프',
  ],
  synonymPairs: [
    ['계란', '달걀'],
    ['오뎅', '어묵'],
    ['돈까스', '돈가스'],
    ['돈카츠', '돈가스'],
    ['소고기', '쇠고기'],
    ['후라이', '프라이'],
    ['자장', '짜장'],
    ['커리', '카레'],
    ['모밀', '메밀'],
    ['쭈꾸미', '주꾸미'],
    ['셋트', '세트'],
  ],
  setWords: [
    '세트', 'set', '반반', '모듬', '모둠', '콤보', 'combo', '플래터', 'platter', '코스', '플러스',
    '선택', '패키지', '박스', '도시락', '뷔페', '무한리필', '정식',
  ],
  optionWords: [
    '기본', '양념', '소금', '간장', '매운', '순한', '마늘', '오리지널', '핫', '매콤', '갈릭', '순살', '뼈',
    '후라이드', '프라이드', '생', '냉동', '소금구이', '양념구이', '고추장', '된장', '불', '데리야끼', '치즈', '반',
    '스위트', '레귤러', '라지', '미디움', '스몰', '대', '중', '소', '냉', '온', 'hot', 'ice', 'iced',
  ],
  suffixBlock: [
    ...CATEGORY_WORDS,
    '밥', '면', '국수', '덮밥', '죽', '빵', '술', '차', '주', '탕', '국',
    '소스', '토핑', '추가', '사리', '공기', '음료', '주스', '커피', '케이크', '스프', '수프', '고기',
    // 2자 별칭 중 접미로 붙으면 엉뚱한 것('진토닉' → 토닉워터, '슈가제로' → 제로콜라).
    '토닉', '제로', '사와', '물', '양', '간', '피', '골', '위', '주류', '안주',
  ],
  cutSuffixes: ['구이'],
  rawSuffixes: ['소금구이', '양념구이', '숯불구이', '직화구이', '간장구이', '버터구이', '치즈구이', '구이', '사시미', '숙회', '회'],
  quantifierWords: ['한판', '반판'],
  extraAliases: {
    족발: ['불족발', '불족', '미니족', '미니족발', '화덕족발', '앞다리족발', '뒷다리족발'],
    닭날개: ['테바사키', '닭윙'],
    '닭고기 덮밥': ['야키토리동', '오야꼬동', '오야코동'],
    소양: ['양볶음', '특양볶음'],
  },
  sizeModifiers: ['미니', '점보', '대왕', '빅', '라지', '하프'],
};

export const compileLexicon = (src: LexiconSource): Lexicon => ({
  leadingModifiers: src.leadingModifiers
    .map(normalizeTerm)
    .filter((m) => m.length > 0)
    // 긴 것부터 — '통영' 이 '통' 보다 먼저 걸려야 '통영생굴' 이 '생굴' 이 된다.
    .sort((x, y) => y.length - x.length),
  synonymPairs: src.synonymPairs.map(([a, b]) => [normalizeTerm(a), normalizeTerm(b)]),
  setWords: src.setWords.map((w) => w.toLowerCase()),
  optionWords: new Set(src.optionWords.map(normalizeTerm)),
  suffixBlock: new Set(src.suffixBlock.map(normalizeTerm)),
  cutSuffixes: src.cutSuffixes.map(normalizeTerm),
  rawSuffixes: [...src.rawSuffixes.map(normalizeTerm)].sort((x, y) => y.length - x.length),
  quantifierWords: src.quantifierWords.map(normalizeTerm),
  extraAliases: src.extraAliases,
  sizeModifiers: new Set(src.sizeModifiers.map(normalizeTerm)),
});

export const DEFAULT_LEXICON: Lexicon = compileLexicon(DEFAULT_LEXICON_SOURCE);
