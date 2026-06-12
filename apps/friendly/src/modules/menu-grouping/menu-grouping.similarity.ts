// 한국어 메뉴 표기 유사도 + 유사도 기반 청크 패킹.
//
// 역할은 어디까지나 "배치 휴리스틱" — 비슷한 표기를 같은 LLM 청크에 모아
// 1단계(청크 내 그룹핑)에서 병합 기회를 높일 뿐, 묶을지 말지는 전적으로
// LLM 이 판정한다. 여기서 갈라놓아도 대표 머지 라운드가 회복하므로
// 임계값이 그룹핑 recall 을 깎지 않는다 (게이트가 아니다).

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ',
  'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

// 한글 음절(가-힣)을 초/중/종성 자모 문자열로 분해. 그 외 문자는 그대로.
// "공기밥" vs "공깃밥"처럼 받침 하나 차이를 음절 bigram 은 놓치지만
// 자모 bigram 은 잡는다.
export const toJamo = (s: string): string => {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      out += CHO[Math.floor(idx / 588)]! + JUNG[Math.floor((idx % 588) / 28)]! + JONG[idx % 28]!;
    } else {
      out += ch;
    }
  }
  return out;
};

const bigramSet = (s: string): Set<string> => {
  const out = new Set<string>();
  if (s.length === 1) out.add(s);
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
};

const dice = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter += 1;
  return (2 * inter) / (a.size + b.size);
};

// 자모 bigram Dice 계수 (0~1). 단독 사용처는 테스트지만 임계값 튜닝 시
// 직접 측정할 수 있게 export.
export const jamoBigramDice = (a: string, b: string): number => {
  if (a === b) return 1;
  return dice(bigramSet(toJamo(a)), bigramSet(toJamo(b)));
};

// 패킹 임계값 — "같은 음식일 가능성이 있어 같은 청크에서 보여줄 가치가
// 있는가"의 기준일 뿐, 병합 판정과 무관. 김치찌개/묵은지김치찌개 ≈ 0.67,
// 공기밥/공깃밥 = 0.8, 김치찌개/된장찌개 ≈ 0.35.
const PACK_THRESHOLD = 0.45;

// items 를 유사도 블록(임계 이상이면 같은 블록)으로 묶고, 블록을 통째로
// maxChunk 크기 청크에 채워 넣는다. 블록이 maxChunk 를 넘으면 잘린다
// (잘려도 머지 라운드가 커버). 블록·청크 순서는 입력 첫 등장 순서 기준
// — 같은 입력이면 항상 같은 출력 (결정적).
export const packBySimilarity = (
  items: string[],
  maxChunk: number,
  threshold = PACK_THRESHOLD,
): string[][] => {
  const n = items.length;
  if (n === 0) return [];
  if (maxChunk <= 0) return [items.slice()];

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r]!;
    let cur = x;
    while (cur !== r) {
      const next = parent[cur]!;
      parent[cur] = r;
      cur = next;
    }
    return r;
  };

  // O(N²) 쌍 비교 — 식당당 distinct 수백 단위까지는 무시할 비용.
  const grams = items.map((it) => bigramSet(toJamo(it)));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (dice(grams[i]!, grams[j]!) >= threshold) {
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[rj] = ri;
      }
    }
  }

  // 블록 구성 — Map 삽입 순서 = 루트 첫 등장 순서라 결정적.
  const blocks = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const r = find(i);
    const arr = blocks.get(r) ?? [];
    arr.push(i);
    blocks.set(r, arr);
  }

  const chunks: string[][] = [];
  let cur: string[] = [];
  const flush = (): void => {
    if (cur.length > 0) {
      chunks.push(cur);
      cur = [];
    }
  };
  for (const block of blocks.values()) {
    if (block.length >= maxChunk) {
      flush();
      for (let off = 0; off < block.length; off += maxChunk) {
        chunks.push(block.slice(off, off + maxChunk).map((i) => items[i]!));
      }
      continue;
    }
    if (cur.length + block.length > maxChunk) flush();
    for (const i of block) cur.push(items[i]!);
  }
  flush();
  return chunks;
};
