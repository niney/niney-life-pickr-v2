import type {
  MenuBoardEvalBoardType,
  MenuBoardEvalTotalsType,
  MenuBoardItemType,
} from '@repo/api-contract';

// 메뉴판 읽기 회귀 평가의 채점 — 검수 정답(golden/menu-boards/<사진 키>.json)과 읽은 항목을 맞춘다.
// 메뉴판 통사진 비교(2026-10-10, 보고서 docs/menu-board-ocr-probe.md)의 Python 채점기를 그대로 옮겼다.
//
// 정답 파일: { shop, note, items: [[이름, 가격] | {name, price, alt}], optional: [이름] }
//  - alt      같은 메뉴의 다른 표기(묶음 'A.B.C' 를 낱개로 뽑아도 정답)
//  - optional 뽑아도 틀린 것으로 치지 않는 이름(세트 선택지·코스 구성 요리·외국어 병기·옵션 안내)

export interface TruthItem {
  name: string;
  price: string | null;
  alt: string[];
}

export interface BoardTruth {
  shop: string;
  note: string | null;
  items: TruthItem[];
  optional: string[];
}

export const MATCH = 0.75; // 이름 유사도 기준

type RawTruthItem = [string, string | null] | { name: string; price?: string | null; alt?: string[] };

export const parseTruth = (data: {
  shop?: string;
  note?: string | null;
  items: RawTruthItem[];
  optional?: string[];
}): BoardTruth => ({
  shop: data.shop ?? '',
  note: data.note ?? null,
  items: data.items.map((raw) =>
    Array.isArray(raw)
      ? { name: raw[0], price: raw[1] ?? null, alt: [] }
      : { name: raw.name, price: raw.price ?? null, alt: raw.alt ?? [] },
  ),
  optional: data.optional ?? [],
});

const PUNCT = /[\s*·•\-_/\\,.'"!?~:;#&+=|<>[\]{}()（）「」『』【】〈〉《》☆★※♥♡◆◇■□▶▷●○◎→]+/gu;
const PAREN = /[(（[【].*?[)）\]】]/gu;
const LEADING_NUM = /^\d{1,2}[.)]\s*/u;

// 메뉴명 비교용 — NFKC, 소문자, 앞 번호·공백·기호 제거.
export const normalizeName = (text: string): string =>
  text.normalize('NFKC').toLowerCase().trim().replace(LEADING_NUM, '').replace(PUNCT, '');

// 괄호 속(용량·인분·설명)을 뺀 이름 — '김치찌개(2인기준)' ↔ '김치찌개'.
export const coreName = (text: string): string => normalizeName(text.normalize('NFKC').replace(PAREN, ''));

// 괄호 속과 '|' 뒤 수식어('(12p)', '| 등심')를 뺀 핵심 이름 — 수식어를 붙여 쓴 건 오독이 아니다.
export const headName = (text: string): string => coreName(text.split('|')[0] ?? '');

const levenshtein = (a: string[], b: string[]): number => {
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  let previous = Array.from({ length: short.length + 1 }, (_, i) => i);
  for (let i = 1; i <= long.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= short.length; j += 1) {
      current.push(
        Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (long[i - 1] === short[j - 1] ? 0 : 1)),
      );
    }
    previous = current;
  }
  return previous[short.length]!;
};

// nameScore 의 이름별 준비물 — 정규화 이름·괄호 뺀 이름·핵심 이름과 그 코드포인트 배열. 짝짓기는 같은 이름을 상대마다
// 견주므로(등록 메뉴 × 읽은 항목) 한 번만 만들어 둔다. 예전엔 쌍마다 정규화 10번(NFKC·정규식)을 다시 해, 메뉴가 많은 가게는
// 짝짓기 한 번에 이벤트 루프를 수백 ms~1초 막았다(크롤 한 번에 2~3번 — 2026-11 검토).
export interface NameKeys {
  norm: string;
  normChars: string[];
  core: string;
  coreChars: string[];
  head: string;
  headChars: string[];
}

export const nameKeys = (text: string): NameKeys => {
  const norm = normalizeName(text);
  const core = coreName(text);
  const head = headName(text);
  return { norm, normChars: Array.from(norm), core, coreChars: Array.from(core), head, headChars: Array.from(head) };
};

// nameScore 와 같은 값 — 단, floor 를 주면 floor 미만으로 끝날 편집거리는 건너뛴다. 결과가 floor 이상이면 nameScore 와 정확히
// 같고, 미만이면 nameScore 도 floor 미만이다(짝짓기는 MATCH 이상만 쓴다). 편집거리 ≥ 길이 차라 유사도의 상한은
// 1 − (긴 길이 − 짧은 길이)/긴 길이 — 유사도와 같은 식이라 부동소수점에서도 상한이 유사도보다 작아지지 않는다. 상한이 지금
// 최고값 이하이거나 floor 미만이면 계산해도 결과가 바뀌지 않는다.
export const nameScoreKeys = (t: NameKeys, n: NameKeys, floor = 0): number => {
  const pairs: [string, string[], string, string[]][] = [
    [t.norm, t.normChars, n.norm, n.normChars],
    [t.core, t.coreChars, n.core, n.coreChars],
    [t.core, t.coreChars, n.norm, n.normChars],
    [t.norm, t.normChars, n.core, n.coreChars],
    [t.head, t.headChars, n.head, n.headChars],
  ];
  let best = 0;
  for (const [a, ca, b, cb] of pairs) {
    if (!a || !b) continue;
    const shortLen = Math.min(ca.length, cb.length);
    const longLen = Math.max(ca.length, cb.length);
    const upper = 1 - (longLen - shortLen) / longLen;
    if (upper > best && upper >= floor) best = Math.max(best, 1 - levenshtein(ca, cb) / longLen);
    const [short, long] = ca.length <= cb.length ? [a, b] : [b, a];
    // 괄호 밖 수식어('통돼지') 정도의 차이는 같은 메뉴로.
    if (shortLen >= 2 && long.includes(short)) best = Math.max(best, shortLen / longLen + 0.15);
    // 한국어 메뉴명은 수식어가 앞에 붙는다 — '바질쌈' ↔ '향긋한 바질쌈'.
    if (shortLen >= 3 && long.endsWith(short)) best = Math.max(best, MATCH);
  }
  return Math.min(best, 1);
};

// 정규화 이름·괄호 뺀 이름·핵심 이름의 편집거리 유사도와 포함 관계 중 가장 높은 값.
export const nameScore = (truth: string, name: string): number => nameScoreKeys(nameKeys(truth), nameKeys(name));

const PRICE = /(\d{1,3}(?:[,.]\d{3})+|\d+(?:[.,]\d)?)\s*(만\s*원|천\s*원|원|won|₩|k)?/iu;

// '10,000' '11.0' '9.5' '25,9' '12000원' '1만5천' 같은 표기를 원 단위 정수로. 1,000 미만은 천 원 단위(메뉴판 관례 —
// '25,9'·'25.9' 는 25,900원).
export const parsePrice = (text: string | null | undefined): number | null => {
  if (!text) return null;
  const s = String(text).normalize('NFKC').replace(/ /g, '');
  const man = /(\d+)만(?:(\d+)천)?/u.exec(s);
  if (man) return Number(man[1]) * 10000 + Number(man[2] ?? 0) * 1000;
  // '4P 22,000' 처럼 수량이 앞에 붙으면 천 단위 쉼표가 있는 숫자를 가격으로 본다.
  const comma = /\d{1,3}(?:,\d{3})+/u.exec(s);
  const digits = comma ? comma[0] : PRICE.exec(s)?.[1];
  if (!digits) return null;
  let value: number;
  if (/^\d{1,3}(?:[,.]\d{3})+$/u.test(digits)) {
    value = Number(digits.replace(/[,.]/g, ''));
  } else {
    value = Number(digits.replace(',', '.'));
    if (value < 1000) value *= 1000;
    value = Math.round(value);
  }
  return value >= 100 && value <= 5_000_000 ? value : null;
};

// 같은 이름(정규화)이 두 번 나오면 처음 것만 — 채점에서 한 메뉴를 두 번 세지 않게.
export const dedupeItems = (items: MenuBoardItemType[]): MenuBoardItemType[] => {
  const seen = new Set<string>();
  const out: MenuBoardItemType[] = [];
  for (const item of items) {
    const key = normalizeName(item.name);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
};

const namesOf = (item: TruthItem): string[] => [item.name, ...item.alt];

// 정답 메뉴 번호 → 항목 번호(유사도 높은 순 1:1). 이름 유사도가 같으면 가격이 맞는 쪽 — '왕새우 후라이 (3p) 29,000'·사이드
// '왕새우 후라이 (1p) 8,000' 처럼 같은 이름이 두 번 나오는 메뉴판. 이름 준비물(정답 메뉴마다 [이름, ...alt])·가격(parsePrice)은
// 호출측이 한 번 만들어 넘긴다 — 등록 메뉴 짝짓기(menu-board.naver-match)는 지어낸 항목을 셀 필요가 없어 이것만 쓴다.
export const pairTruthKeyed = (
  truthKeys: readonly (readonly NameKeys[])[],
  truthPrices: readonly (number | null)[],
  itemKeys: readonly NameKeys[],
  itemPrices: readonly (number | null)[],
): Map<number, number> => {
  const candidates: { score: number; priceHit: boolean; ti: number; ii: number }[] = [];
  for (let ti = 0; ti < truthKeys.length; ti += 1) {
    for (let ii = 0; ii < itemKeys.length; ii += 1) {
      let score = 0;
      for (const k of truthKeys[ti]!) {
        const s = nameScoreKeys(k, itemKeys[ii]!, MATCH);
        if (s > score) score = s;
      }
      if (score >= MATCH) candidates.push({ score, priceHit: truthPrices[ti] === itemPrices[ii], ti, ii });
    }
  }
  candidates.sort(
    (a, b) => b.score - a.score || Number(b.priceHit) - Number(a.priceHit) || a.ti - b.ti || a.ii - b.ii,
  );
  const pairs = new Map<number, number>();
  const usedItems = new Set<number>();
  for (const c of candidates) {
    if (pairs.has(c.ti) || usedItems.has(c.ii)) continue;
    pairs.set(c.ti, c.ii);
    usedItems.add(c.ii);
  }
  return pairs;
};

// 정답 메뉴 번호 → 항목 번호(pairTruthKeyed)와 지어낸 항목 이름.
export const pairTruth = (
  truth: BoardTruth,
  items: MenuBoardItemType[],
): { pairs: Map<number, number>; wrong: string[] } => {
  const truthKeys = truth.items.map((t) => namesOf(t).map(nameKeys));
  const itemKeys = items.map((item) => nameKeys(item.name));
  const pairs = pairTruthKeyed(
    truthKeys,
    truth.items.map((t) => parsePrice(t.price)),
    itemKeys,
    items.map((item) => parsePrice(item.price)),
  );
  const usedItems = new Set(pairs.values());
  // 짝 못 지은 항목 중 선택지·번역(optional)이나 이미 맞힌 묶음의 낱개(alt)는 틀린 것으로 치지 않는다.
  const spare = [...[...pairs.keys()].flatMap((ti) => truthKeys[ti]!), ...truth.optional.map(nameKeys)];
  const wrong = items
    .filter((_, ii) => !usedItems.has(ii) && !spare.some((k) => nameScoreKeys(k, itemKeys[ii]!, MATCH) >= MATCH))
    .map((item) => item.name);
  return { pairs, wrong };
};

export type BoardScore = Omit<MenuBoardEvalBoardType, 'key' | 'durationMs' | 'error' | 'items'> & {
  exact: number;
  priceHits: number;
  priceTotal: number;
};

// 사진 한 장 채점. 항목은 같은 이름을 한 번만 센다.
export const scoreBoard = (truth: BoardTruth, rawItems: MenuBoardItemType[]): BoardScore => {
  const items = dedupeItems(rawItems);
  const { pairs, wrong } = pairTruth(truth, items);
  const misread: BoardScore['misread'] = [];
  const priceMismatch: BoardScore['priceMismatch'] = [];
  let exact = 0;
  let priceHits = 0;
  let priceTotal = 0;
  for (const [ti, ii] of pairs) {
    const t = truth.items[ti]!;
    const item = items[ii]!;
    if (namesOf(t).some((n) => headName(n) === headName(item.name))) exact += 1;
    else misread.push({ expected: t.name, got: item.name });
    const expected = parsePrice(t.price);
    if (expected !== null) {
      priceTotal += 1;
      if (expected === parsePrice(item.price)) priceHits += 1;
      else priceMismatch.push({ name: t.name, expected: t.price, got: item.price });
    }
  }
  return {
    shop: truth.shop,
    note: truth.note,
    required: truth.items.length,
    matched: pairs.size,
    missed: truth.items.filter((_, ti) => !pairs.has(ti)).map((t) => t.name),
    wrong,
    misread,
    priceMismatch,
    exact,
    priceHits,
    priceTotal,
  };
};

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

// 사진별 채점을 합친다. 실패한 사진(error)은 장수에만 세고 지표에서는 뺀다.
export const summarize = (
  boards: { score: BoardScore | null; durationMs: number | null }[],
  truths: BoardTruth[],
): MenuBoardEvalTotalsType => {
  let required = 0;
  let matched = 0;
  let wrong = 0;
  let exact = 0;
  let priceHits = 0;
  let priceTotal = 0;
  let coverFalseItems = 0;
  let failed = 0;
  boards.forEach(({ score }, i) => {
    if (!score) {
      failed += 1;
      return;
    }
    required += score.required;
    matched += score.matched;
    wrong += score.wrong.length;
    exact += score.exact;
    priceHits += score.priceHits;
    priceTotal += score.priceTotal;
    if (truths[i]!.items.length === 0) coverFalseItems += score.wrong.length;
  });
  const precision = ratio(matched, matched + wrong);
  const recall = ratio(matched, required);
  const durations = boards
    .filter((b) => b.score && b.durationMs !== null)
    .map((b) => b.durationMs!)
    .sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const medianMs =
    durations.length === 0
      ? null
      : Math.round(durations.length % 2 ? durations[mid]! : (durations[mid - 1]! + durations[mid]!) / 2);
  return {
    boards: boards.length,
    failed,
    required,
    matched,
    wrong,
    precision,
    recall,
    f1: precision && recall ? (2 * precision * recall) / (precision + recall) : null,
    exactName: ratio(exact, matched),
    priceAccuracy: ratio(priceHits, priceTotal),
    coverFalseItems,
    medianMs,
  };
};
