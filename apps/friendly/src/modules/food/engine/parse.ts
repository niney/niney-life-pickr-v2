// 메뉴명 전처리 — 태그·장식·중량·인분·수량·크기·옵션을 떼어 매칭 키와 표식을 분리한다.
//
// 순수 함수. 어휘(세트어·옵션어)는 Lexicon 에서 온다. 결과의 `parts` 는 결합 기호로 나뉜 구성요소
// (세트 분해용)이고, `quantifier` 는 "한판"처럼 세트가 아닐 수도 있는 수량 표식이다 — 판정기가
// 뒤에 오는 부위를 카탈로그에서 찾으면 단일 메뉴(100g당)로 본다.

import { normalizeTerm } from '../../../lib/text.js';
import { DEFAULT_LEXICON, type Lexicon } from './lexicon.js';

export interface ParsedMenuName {
  raw: string;
  /** 매칭 키(표식 제거, 공백 정리). 비어 있으면 판정 불가. */
  cleaned: string;
  /** 메뉴명에 적힌 중량. kg→g, l→ml 환산. */
  weight: { value: number; unit: 'g' | 'ml' } | null;
  /** 여러 음식이 섞인 이름(세트·반반·모듬·A+B). 어떤 등급도 표시하지 않는다. */
  isSet: boolean;
  /** 세트로 본 근거(어휘·기호). 트레이스용. */
  setSignal: string | null;
  /** 1인분 표시를 막는 표식 — 2인 이상, 대/중/소, 2개 이상, 한판. */
  portionAmbiguous: boolean;
  /** 괄호 안에 있던 음식명 후보("부자찌개(된장찌개)" → 된장찌개). 크기·중량·등급은 제외. */
  hints: string[];
  /** 결합 기호(+ & , /)로 나뉜 구성요소. 세트가 아니면 [cleaned]. */
  parts: string[];
  /** "한판"·"반판" 같은 수량 표식이 있었으면 그 말. */
  quantifier: string | null;
}

// 태그 — `[대표]`·`【추천】`·`BEST`·`NEW`·`HOT`·`ICE` 같은 표식은 이름이 아니다.
const TAG_RE = /\[[^\]]{0,6}\]|【[^】]{0,6}】|\b(best|new|hot|hit|ice|iced|only\s*ice|추천|대표|인기|신메뉴|시그니처메뉴)\b/gi;
// 장식용 한자·기호("生生生연어사시미", "★")와 "72시간 숙성"·"3일 숙성" 같은 시간 표기는 이름이 아니다.
const DECOR_RE = /[\p{Script=Han}★☆♥♡◆◇■□●○▶▷✔✨•]+|\d+\s*(시간|일|년)\s*(숙성|저온숙성|건조)?/gu;
// 중량 — 숫자 + 단위. 단위 뒤에 영문이 이어지면(예: "5gb") 중량이 아니다.
const WEIGHT_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g|그램|ml|mL|ML|cc|CC|l|L|리터)(?![a-zA-Z])/;
// 인분·인용 — "2인분", "3~4인", "2-3인분", "4인용", "2인이상", "2인 기준".
const PORTION_RE = /(\d+(?:[.,]\d+)?)\s*(?:[~\-–]\s*(\d+))?\s*인(?:분|용|이상|\s*기준|\b|(?=[^\p{L}]|$))/u;
// 수량 — "2개", "3pcs", "10조각", "6알", "2마리", "2병", "2잔".
const COUNT_RE = /(\d+)\s*(개|pcs|pc|조각|p|알|장|마리|병|잔|캔|쪽|줄|판)(?![\p{L}])/iu;
// 크기 — "(대)", "(중)", "(소)", " 대 ", "L/M/S", "라지", "미디움", "스몰".
const SIZE_PAREN_RE = /[（(]\s*(대|중|소|특대|L|M|S|XL)\s*[)）]/i;
const SIZE_WORD_RE = /(?:^|\s)(대|중|소|특대|라지|미디움|미디엄|스몰|점보)(?=\s|$)/;
// 등급·비율 표식 — "1++", "1+", "100%".
// "1+"·"1++" 등급은 뒤에 글자가 없을 때만 — "족발1+냉삼" 의 1+ 는 결합 기호다.
const GRADE_RE = /\d\+{1,2}(?![\p{L}])|\d+\s*%/gu;
// "(3가지맛선택)"·"(2가지 맛 선택)" — 한 메뉴의 맛 고르기. 세트가 아니라 옵션.
const FLAVOR_CHOICE_RE = /[（(]\s*\d\s*가지\s*맛\s*선택\s*[)）]/g;
// "2가지 선택" 류 — 숫자 + 가지만 세트 표식(가지볶음의 '가지'는 채소).
const N_GAJI_RE = /\d\s*가지/;
// "기본/양념", "냉/온" — 슬래시 양쪽이 옵션어면 맛·온도 선택.
const OPTION_SLASH_RE = /(\p{L}+)\s*\/\s*(\p{L}+)/gu;
// 결합 기호 — 양쪽에 글자가 있어야 결합이다("치킨+콜라", "짜장&짬뽕", "매화수, 청하").
const JOIN_RE = /[\p{L}\p{N}]\s*[+&/,]\s*\p{L}/u;
const JOIN_SPLIT_RE = /\s*[+&/,]\s*/;

const hasSetWord = (s: string, lex: Lexicon): string | null => {
  // 토큰 단위 — 세트어가 토큰의 앞이나 뒤에 붙을 때만("커플세트", "모듬야채꼬치"). 토큰 한가운데
  // 들어 있는 것("쿄코코스테이크"의 코스, "스페셜모듬쌀국수"의 모듬)은 세트 표식이 아니다.
  const tokens = s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const w of lex.setWords) {
    for (const t of tokens) {
      if (t === w || t.startsWith(w) || t.endsWith(w)) return w;
    }
  }
  return null;
};

export const parseMenuName = (raw: string, lex: Lexicon = DEFAULT_LEXICON): ParsedMenuName => {
  let s = raw.normalize('NFC').replace(TAG_RE, ' ').replace(DECOR_RE, ' ').replace(FLAVOR_CHOICE_RE, ' ');

  let weight: ParsedMenuName['weight'] = null;
  const w = WEIGHT_RE.exec(s);
  if (w) {
    const value = Number(w[1]!.replace(',', '.'));
    const unit = w[2]!.toLowerCase();
    if (Number.isFinite(value) && value > 0) {
      if (unit === 'kg') weight = { value: value * 1000, unit: 'g' };
      else if (unit === 'g' || unit === '그램') weight = { value, unit: 'g' };
      else if (unit === 'l' || unit === '리터') weight = { value: value * 1000, unit: 'ml' };
      else weight = { value, unit: 'ml' };
    }
    s = s.replace(WEIGHT_RE, ' ');
  }

  let portionAmbiguous = false;
  const p = PORTION_RE.exec(s);
  if (p) {
    const hi = Number((p[2] ?? p[1])!.replace(',', '.'));
    if (hi >= 2 || /이상|기준/.test(p[0])) portionAmbiguous = true;
    s = s.replace(PORTION_RE, ' ');
  }
  const c = COUNT_RE.exec(s);
  if (c) {
    if (Number(c[1]) >= 2) portionAmbiguous = true;
    s = s.replace(COUNT_RE, ' ');
  }
  if (SIZE_PAREN_RE.test(s)) {
    portionAmbiguous = true;
    s = s.replace(SIZE_PAREN_RE, ' ');
  }
  if (SIZE_WORD_RE.test(s)) {
    portionAmbiguous = true;
    s = s.replace(SIZE_WORD_RE, ' ');
  }

  // 맛·온도 선택 슬래시("기본/양념", "냉/온")는 떼고 진행한다.
  s = s.replace(OPTION_SLASH_RE, (m: string, a: string, b: string) =>
    lex.optionWords.has(normalizeTerm(a)) && lex.optionWords.has(normalizeTerm(b)) ? ' ' : m,
  );
  // "Y,G,R 티나 하이볼" — 쉼표 나열이 한 글자 기호(맛 코드)뿐이면 옵션.
  s = s.replace(/(?:^|\s)((?:[A-Za-z\p{L}]\s*,\s*)+[A-Za-z\p{L}])(?=\s)/gu, (m: string, list: string) =>
    list.split(',').every((x) => x.trim().length === 1) ? ' ' : m,
  );

  // 수량 표식(한판) — 세트가 아닐 수 있어 떼어 두고 판정기에 알린다. 1인분 표시는 막는다.
  let quantifier: string | null = null;
  for (const q of lex.quantifierWords) {
    if (normalizeTerm(s).includes(q)) {
      quantifier = q;
      portionAmbiguous = true;
      s = s.replace(new RegExp(q, 'g'), ' ');
      break;
    }
  }

  const clean = (x: string): string =>
    x
      .replace(/[-–—·.:;!?~*'"`]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  // 구성요소에서 세트어·수량 표식을 뗀다("닭꼬치 세트" → 닭꼬치, "새우장3마리" → 새우장).
  const stripSetWords = (part: string): string =>
    clean(
      part
        .replace(COUNT_RE, ' ')
        .replace(/\d+/g, ' ')
        .split(/\s+/)
        .filter((t) => !lex.setWords.includes(t.toLowerCase()))
        .join(' '),
    );

  // 괄호 안 나열("정식(새우장+양념게장+간장게장+공기밥)", "(게장1+새우장3마리)")은 구성요소다.
  let parenParts: string[] = [];
  const hints: string[] = [];
  s = s.replace(/[（(]([^)）]*)[)）]/g, (_m, inner: string) => {
    const h = inner.replace(GRADE_RE, ' ').trim();
    if (JOIN_RE.test(h) && parenParts.length === 0) {
      parenParts = h.split(JOIN_SPLIT_RE).map(stripSetWords).filter((x) => x.length > 0);
      return ' ';
    }
    // 남은 괄호는 부연("완숙"·"한우++")이라 통째로 떼되, 한글 2자 이상이면 음식명 힌트로 남긴다.
    // 괄호 안 세트어("(소금구이 찍먹 세트)")는 옵션 설명이라 세트 판정에 넣지 않는다.
    if (/^[\p{Script=Hangul}\s]{2,}$/u.test(h) && !hasSetWord(h, lex)) hints.push(h.replace(/\s+/g, ' '));
    return ' ';
  });
  s = s.replace(GRADE_RE, ' ');

  // 세트 판정 — 결합 기호가 세트어보다 먼저다("소고기 샤브 + 닭꼬치 세트"는 나열 세트).
  let setSignal: string | null = null;
  let parts: string[] = [];
  if (N_GAJI_RE.test(s)) setSignal = 'N가지';
  else if (JOIN_RE.test(s)) {
    setSignal = '결합기호';
    parts = s.split(JOIN_SPLIT_RE).map(stripSetWords).filter((x) => x.length > 0);
  } else if (parenParts.length >= 2) {
    setSignal = '결합기호';
    parts = parenParts;
  } else {
    const word = hasSetWord(s, lex);
    if (word) setSignal = word;
  }
  const cleaned = clean(s.replace(/[+&/,]/g, ' '));
  // "미니족"·"점보 부타동" — 양이 다른 같은 음식. 이름은 떼어 찾되 1인분 값은 못 쓴다.
  const cleanedNorm = normalizeTerm(cleaned);
  for (const sz of lex.sizeModifiers) {
    if (cleanedNorm.startsWith(sz) && cleanedNorm.length > sz.length) {
      portionAmbiguous = true;
      break;
    }
  }

  return {
    raw,
    cleaned,
    weight,
    isSet: setSignal !== null,
    setSignal,
    portionAmbiguous,
    hints,
    parts: parts.length >= 2 ? parts : cleaned ? [cleaned] : [],
    quantifier,
  };
};

/** 앞 수식어를 최대 2개까지 떼어낸 정규화 이름. 뗄 것이 없으면 null. */
export const stripLeadingModifiers = (cleanedOrNorm: string, lex: Lexicon = DEFAULT_LEXICON): string | null => {
  let norm = normalizeTerm(cleanedOrNorm);
  let stripped = false;
  for (let i = 0; i < 2; i += 1) {
    // 남는 이름은 보통 2자 이상. 두 글자 이상 수식어(통영·자연산·한우) 뒤에는 1자('굴'·'김'·'양')도 허용한다 —
    // '생면'·'왕만두' 처럼 1자 수식어 + 1자 잔여는 그대로 둔다(그건 다른 음식이다).
    const hit = lex.leadingModifiers.find(
      (m) => norm.startsWith(m) && norm.length - m.length >= (m.length >= 2 ? 1 : 2),
    );
    if (!hit) break;
    norm = norm.slice(hit.length);
    stripped = true;
  }
  return stripped ? norm : null;
};

/** 동의어를 치환한 정규화 변형들(원형 제외). */
export const synonymVariants = (norm: string, lex: Lexicon = DEFAULT_LEXICON): string[] => {
  const out = new Set<string>();
  for (const [a, b] of lex.synonymPairs) {
    if (norm.includes(a)) out.add(norm.split(a).join(b));
    if (norm.includes(b)) out.add(norm.split(b).join(a));
  }
  out.delete(norm);
  return [...out];
};
