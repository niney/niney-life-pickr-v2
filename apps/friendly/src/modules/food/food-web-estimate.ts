// 카탈로그에 없는 음식의 100g당 열량을 웹 실측(fatsecret.kr 검색 결과)에서 추정한다 — 순수 파서·집계.
//
// 왜 fatsecret 검색 페이지인가: 검색엔진(Ollama web_search)은 한국어 음식명을 매칭하지 못했고(까르보나라
// 검색에 렌틸콩귀리밥), fatsecret.kr 의 검색 결과 한 페이지에는 일반 항목("까르보나라 1인분 384kcal,
// 100g 191kcal")과 브랜드 제품 실측(1인분 중량 + kcal)이 열 건 안팎 실려 있어 그 자체가 **복수 출처**다.
// 항목별로 100g당을 계산해 중앙값을 쓰고, 중앙값 ±허용 범위 안의 항목이 MIN_AGREEING 개 이상일 때만
// 채택한다(CJ 26kcal 같은 오타는 자연히 밀려난다). 항목이 하나뿐이면 **이름이 질의와 같은 일반 항목이
// 100g 값을 명시**한 경우만 받는다(어리굴젓 88kcal/100g). LLM 은 쓰지 않는다 — 숫자를 지어낼 여지가 없다.

import { normalizeTerm } from '../../lib/text.js';

// 2: 브랜드만 붙은 단독 항목 채택 + 조리법 접미 어간 재질의(항정살구이 → 항정살). 3: 1인분 환산 항목도 단독 채택 대상.
export const FOOD_WEB_ESTIMATE_VERSION = 3;
export const FOOD_WEB_ESTIMATE_SOURCE = 'fatsecret.kr';
// 채택 조건 — 중앙값 ±AGREE_TOLERANCE 안에 드는 항목이 MIN_AGREEING 개 이상.
export const MIN_AGREEING = 2;
export const AGREE_TOLERANCE = 0.25;
// 이름이 이만큼 짧으면(1글자) 검색 결과가 무엇이든 섞인다.
const MIN_QUERY_LEN = 2;
// 100g당 상한 — 이보다 크면 단위 오류(기름·설탕도 900 이하).
const MAX_PER100 = 950;
// 브랜드 괄호를 뺀 항목명에서 질의를 지운 뒤 남는 글자 수 상한 — 이 이하면 "같은 음식"으로 본다.
const NEAR_GENERIC_LEFTOVER = 3;
// 검색 결과가 없을 때 떼어 보는 조리법 접미 — 재료 자체의 100g 값이 근사가 된다(항정살구이 → 항정살).
// 탕·국·튀김은 물·기름으로 조성이 크게 바뀌어 넣지 않는다.
const STEM_SUFFIXES = ['구이', '볶음', '찜', '회', '사시미', '숙회'];

/** 검색 결과가 없을 때 재질의할 어간. 뗄 접미가 없거나 어간이 2자 미만이면 null. */
export const webQueryStem = (name: string): string | null => {
  const t = name.trim();
  for (const suf of STEM_SUFFIXES) {
    if (t.endsWith(suf) && t.length - suf.length >= 2) return t.slice(0, -suf.length).trim();
  }
  return null;
};

export interface WebEstimateSample {
  /** 항목명(브랜드 포함) — 감사용. */
  label: string;
  /** 1인분 중량(g). 100g 명시 항목은 100. */
  grams: number | null;
  /** 그 중량의 kcal. */
  kcal: number;
  /** 환산한 100g당 kcal. */
  per100: number;
  /** 이름이 질의와 같은 일반 항목이고 100g 값이 명시돼 있다. */
  generic: boolean;
  /** 중앙값 일치 여부(집계 뒤 채움). */
  agrees?: boolean;
}

export interface WebEstimate {
  kcalPer100g: number;
  samples: WebEstimateSample[];
  /** 채택 근거 항목 수. 'single' 이면 1. */
  agreeing: number;
  basis: 'multi' | 'single';
}

export const buildFatsecretSearchUrl = (name: string): string =>
  `https://www.fatsecret.kr/%EC%B9%BC%EB%A1%9C%EB%A6%AC-%EC%98%81%EC%96%91%EC%86%8C/search?q=${encodeURIComponent(name.trim())}`;

// HTML → 한 줄 텍스트(태그 제거, 공백 정리). 페이지 구조가 아니라 문장 패턴으로 읽으므로 마크업 변화에 덜 민감하다.
export const htmlToText = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

// 항목 문장: "<이름> <크기>당 - 칼로리: <N>kcal | 지방: … 다른 크기: 1 인분 - 384kcal , 100 g - 191kcal , 더보기"
//   크기: "1개 (230g)", "1인분 (260g)", "1 컵", "100 g", "1 그릇", "1캔 (355ml)"
const ENTRY_RE =
  /([^|]{2,80}?)\s+((?:\d+(?:[.,]\d+)?\s*[^\s(]{1,6})(?:\s*\((\d+(?:[.,]\d+)?)\s*(g|ml)\))?)\s*당\s*-\s*칼로리:\s*(\d{1,5})\s*kcal([^]*?)(?=영양 정보|$)/g;
const OTHER_SIZE_100_RE = /100\s*g\s*-\s*(\d{1,5})\s*kcal/;
// 항목명 앞에 붙는 페이지 잡음("… 영양 정보 - 비슷한", "94중 1에서 10").
const LABEL_NOISE_RE = /^.*(?:비슷한|\d+중\s*\d+에서\s*\d+|검색하기)\s*/;

const toNum = (s: string | undefined): number | null => {
  if (!s) return null;
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
};

/** 검색 결과 텍스트에서 항목을 뽑는다. 이름이 질의 음식을 담지 않는 항목(다른 음식)은 버린다. */
export const parseFatsecretSearch = (text: string, name: string): WebEstimateSample[] => {
  const want = normalizeTerm(name);
  if (want.length < MIN_QUERY_LEN) return [];
  const out: WebEstimateSample[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(ENTRY_RE)) {
    const label = m[1]!.replace(LABEL_NOISE_RE, '').trim();
    const sizeLabel = m[2]!.trim();
    const grams = toNum(m[3]);
    const unit = m[4];
    const kcal = toNum(m[5]);
    const tail = m[6] ?? '';
    if (kcal === null || !label) continue;
    const labelNorm = normalizeTerm(label);
    // 질의 음식이 항목명에 들어 있어야 한다(브랜드·수식어는 허용). "치킨 까르보나라"도 받는다.
    if (!labelNorm.includes(want)) continue;
    const key = `${label}|${sizeLabel}|${kcal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // 일반 항목: 이름이 질의와 같거나, 브랜드 괄호를 뺀 나머지가 3자 이하("자연산 골뱅이탕 (동원)").
    // "콩담백면 동치미국수"·"돼지목살구이주먹밥" 처럼 다른 음식으로 바뀐 항목은 남는 글자가 많아 걸러진다.
    const labelCore = normalizeTerm(label.replace(/\([^)]*\)/g, ' '));
    const generic = labelNorm === want || labelCore.replace(want, '').length <= NEAR_GENERIC_LEFTOVER;

    // 1) "다른 크기"에 100g 값이 명시돼 있으면 그것을 쓴다(일반 항목).
    const per100Explicit = toNum(OTHER_SIZE_100_RE.exec(tail)?.[1]);
    if (per100Explicit !== null) {
      out.push({ label, grams: 100, kcal: per100Explicit, per100: per100Explicit, generic });
      continue;
    }
    // 2) 크기가 100g 자체인 항목.
    if (/^100\s*(g|ml)$/i.test(sizeLabel)) {
      out.push({ label, grams: 100, kcal, per100: kcal, generic });
      continue;
    }
    // 3) 중량(g/ml)이 붙은 1인분/1개 → 환산. 중량 없는 "1 컵"·"1 그릇"은 못 쓴다.
    if (grams !== null && (unit === 'g' || unit === 'ml') && grams >= 30) {
      out.push({ label, grams, kcal, per100: Math.round((kcal * 100) / grams), generic });
    }
  }
  return out;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/** 항목들의 100g당 중앙값과 일치 항목 수. 채택 조건 미달이면 null. */
export const aggregateWebSamples = (samples: WebEstimateSample[]): WebEstimate | null => {
  const valid = samples.filter((s) => s.per100 > 0 && s.per100 <= MAX_PER100);
  if (valid.length === 0) return null;
  if (valid.length < MIN_AGREEING) {
    const only = valid[0]!;
    if (!only.generic) return null;
    return { kcalPer100g: Math.round(only.per100), samples: [{ ...only, agrees: true }], agreeing: 1, basis: 'single' };
  }
  const mid = median(valid.map((s) => s.per100));
  const agrees = (s: WebEstimateSample): boolean => Math.abs(s.per100 - mid) <= mid * AGREE_TOLERANCE;
  const agreeing = valid.filter(agrees);
  if (agreeing.length < MIN_AGREEING) {
    const generic = valid.find((s) => s.generic);
    if (!generic) return null;
    return {
      kcalPer100g: Math.round(generic.per100),
      samples: valid.map((s) => ({ ...s, agrees: s === generic })),
      agreeing: 1,
      basis: 'single',
    };
  }
  // 일치 항목만으로 다시 중앙값 — 극단값이 섞인 짝수 중앙값을 바로잡는다.
  return {
    kcalPer100g: Math.round(median(agreeing.map((s) => s.per100))),
    samples: valid.map((s) => ({ ...s, agrees: agrees(s) })),
    agreeing: agreeing.length,
    basis: 'multi',
  };
};
