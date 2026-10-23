// 한국관광공사 관광정보 ↔ 여행로그 장소 — 순수 함수 모음(DB·네트워크 없음). 15차, docs/PLAN-tour-log.md.
//
//   · 맞추기 — 여행로그 장소(여행자가 적은 이름 + 방문 좌표)에 관광정보 콘텐츠(공식 명칭 + 대표 좌표)를 붙인다. 이름이 같을수록
//     멀어도 같은 곳으로 본다(해수욕장·오름·공원은 대표 좌표가 수백 m 어긋난다). 틀린 곳의 이용 시간을 보여 주는 것보다 못 맞추는
//     편이 낫다 — 기준은 보수적으로. 구간 값은 2026-10-04 실데이터(카탈로그 44,734건 × 장소 2,649곳)의 맞춤·아까운 후보를
//     눈으로 보고 정했다(sync:tour-kto --review · --misses).
//   · 쉬는 날 읽기 — "매주 월요일" 같은 문구에서 **매주 쉬는 요일**만 뽑는다. 격주·월 n회·계절별처럼 요일만으로 말할 수 없는
//     문구는 버린다(문구는 그대로 보여 주고, 일정에서 피하는 데만 쓰지 않는다).

import { haversineM } from '@repo/utils';
import { normalizeName } from '../../lib/matching.js';

// 적재 이력(life_master_syncs)의 layer — 카탈로그·매칭·소개 정보가 바뀌면 한 행 남겨 코스 프로필 캐시를 새로 만들게 한다.
export const TOUR_KTO_SYNC_LAYER = 'tour-kto';
// 맞출 콘텐츠 유형 — 관광지·문화시설·레포츠·쇼핑·음식점.
export const TOUR_KTO_TYPE_IDS = ['12', '14', '28', '38', '39'] as const;
const KTO_RESTAURANT_TYPE = '39';
// 여행로그의 식사 자리 유형(식당·카페).
const MEAL_KIND = '식당';

// ── 이름 ─────────────────────────────────────────────────────────────────────
const BRACKETED = /[[(（【]([^\])）】]*)[\])）】]/g;
// 이름에 덧붙은 괄호 설명을 뗀다 — "성산일출봉 [유네스코 세계자연유산]" · "한라산 (제주도 국가지질공원)" · "국사암(안성)".
// 여행로그 장소 이름에도 붙는다("무주한풍루(시도유형문화재제19호)").
export const cleanKtoTitle = (title: string): string => {
  const cleaned = title.replace(BRACKETED, ' ').replace(/\s+/g, ' ').trim();
  return cleaned === '' ? title.trim() : cleaned;
};

// 비교용 이름 열쇠 — 가게명 정규화(공백·구두점·끝의 "점") 뒤, 같은 곳을 두 가지로 부르는 낱말을 하나로 모은다.
// 여행자는 "이호테우해수욕장", 공식 명칭은 "이호테우해변" · "통영중앙시장" 과 "통영중앙전통시장".
const SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/해수욕장/g, '해변'],
  [/(재래|전통|상설)시장/g, '시장'],
];
export const ktoNameKey = (name: string): string => SYNONYMS.reduce((key, [re, to]) => key.replace(re, to), normalizeName(name));

// 괄호 안의 다른 이름 — "월정리해변(월정리해수욕장)" · "종달항(두문포항)". 지역 구분("국사암(안성)")은 2자라 빠진다.
// 별칭은 통째로 같을 때만 쓴다(설명 문구의 일부가 다른 장소 이름과 겹치는 일을 막는다).
const ALIAS_MIN_LEN = 3;
const aliasKeys = (name: string): string[] => [...name.matchAll(BRACKETED)].map((m) => ktoNameKey(m[1]!)).filter((key) => key.length >= ALIAS_MIN_LEN);

const bigrams = (s: string): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  return set;
};
const jaccard = (a: string, b: string): number => {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return a === b ? 1 : 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return inter / (A.size + B.size - inter);
};

// 이름 유사도 [0, 1] — 열쇠(또는 괄호 속 별칭)가 같으면 1, 한쪽이 다른 쪽을 통째로 품으면("오설록" ⊂ "오설록티뮤지엄") 길이
// 비율만큼 올려 주고(짧은 쪽 3자 이상, contained), 아니면 글자쌍(bigram) Jaccard.
const CONTAIN_MIN_LEN = 3;
export interface KtoNameMatch {
  score: number;
  // 이름이 겹치는 모양 — same: 같은 이름(별칭 포함) · place: 장소 이름이 공식 명칭 안에 통째로 들어 있다("오징어 난전" ⊂
  // "동명항오징어난전" — 공식 명칭이 지역·설명을 덧붙인 것) · title: 공식 명칭이 장소 이름 안에 들어 있다("해리단길" ⊂
  // "금송덕미 해리단길점" — 그 동네의 다른 가게일 수 있다) · null: 글자쌍이 겹칠 뿐.
  contained: 'same' | 'place' | 'title' | null;
}
export const matchKtoName = (placeName: string, title: string): KtoNameMatch => {
  const a = ktoNameKey(cleanKtoTitle(placeName));
  const b = ktoNameKey(cleanKtoTitle(title));
  if (a === '' || b === '') return { score: 0, contained: null };
  if (a === b) return { score: 1, contained: 'same' };
  const names = new Set([a, ...aliasKeys(placeName)]);
  if ([b, ...aliasKeys(title)].some((key) => names.has(key))) return { score: 1, contained: 'same' };
  const sim = jaccard(a, b);
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= CONTAIN_MIN_LEN && long.includes(short)) return { score: Math.max(sim, 0.6 + 0.3 * (short.length / long.length)), contained: short === a ? 'place' : 'title' };
  return { score: sim, contained: null };
};
export const ktoNameScore = (placeName: string, title: string): number => matchKtoName(placeName, title).score;

// ── 맞추기 ───────────────────────────────────────────────────────────────────
export interface KtoMatchCandidate {
  contentId: string;
  contentTypeId: string;
  title: string;
  lat: number;
  lng: number;
}
export interface KtoMatch {
  contentId: string;
  contentTypeId: string;
  title: string;
  distM: number;
  nameScore: number;
}
const SAME = 0.999;
// 이름 점수 구간별 허용 거리(m). 볼거리 — 같은 이름이면 3km, 거의 같으면 1.5km, 비슷하면 500m. 바로 그 자리(100m · 50m)면 이름이
// 절반쯤만 겹쳐도 같은 곳이다("제주관광공사 지정면세점" · "제주관광공사 중문면세점" 4m, "남산공원 N서울타워" · "남산서울타워" 41m).
const SIGHT_TIERS = [
  { minScore: SAME, maxM: 3000 },
  { minScore: 0.75, maxM: 1500 },
  { minScore: 0.55, maxM: 500 },
  { minScore: 0.45, maxM: 100 },
  { minScore: 0.4, maxM: 50 },
] as const;
// 식당·카페 — 점이고(이름이 같아도 멀면 다른 지점), 한 골목의 가게들이 "제주흑돼지 ○○" 처럼 이름을 나눠 쓴다. 거의 같은
// 이름이 300m 안일 때, 그리고 한쪽 이름이 다른 쪽을 품은 가게가 바로 그 자리(50m)일 때만("동화가든 본점" ·
// "강릉짬뽕순두부 동화가든 본점" 9m).
const MEAL_TIERS = [
  { minScore: 0.75, maxM: 300, contained: false },
  { minScore: 0.6, maxM: 50, contained: true },
] as const;
export const KTO_MATCH_MAX_M = SIGHT_TIERS[0].maxM;
// 유형이 엇갈리는 짝(볼거리 ↔ 음식점 콘텐츠, 식당·카페 ↔ 음식점이 아닌 콘텐츠)은 이 거리 안에서, 이름이 같을 때만. 유형은
// 여행자가 방문마다 적는 값이라 카페가 '체험'·'상업' 으로 올라 있고(마노르블랑·조양방직), 공식 분류로는 관광지인 먹거리 골목도
// 있다. 식당·카페는 공식 명칭이 장소 이름을 품은 경우까지 받는다("오징어 난전" → 관광지 "동명항오징어난전"). 이름이 비슷하기만
// 하면 붙이지 않는다 — "성산일출봉" 에 음식점 "성산일출봉 ○○식당", "금송덕미 해리단길점" 에 관광지 "해리단길".
const CROSS_MAX_M = 300;
const CROSS_MEAL_MIN_SCORE = 0.75;

const maxDistFor = (name: KtoNameMatch, meal: boolean): number | null => {
  if (!meal) return SIGHT_TIERS.find((t) => name.score >= t.minScore)?.maxM ?? null;
  return MEAL_TIERS.find((t) => name.score >= t.minScore && (!t.contained || name.contained !== null))?.maxM ?? null;
};
const crossAllowed = (name: KtoNameMatch, meal: boolean): boolean => name.contained === 'same' || (meal && name.contained === 'place' && name.score >= CROSS_MEAL_MIN_SCORE);

// 가장 잘 맞는 콘텐츠 하나 — 이름 점수가 높은 것, 같으면 가까운 것.
export const pickKtoMatch = (place: { name: string; kind: string; lat: number; lng: number }, candidates: Iterable<KtoMatchCandidate>): KtoMatch | null => {
  const meal = place.kind === MEAL_KIND;
  let best: KtoMatch | null = null;
  for (const c of candidates) {
    const name = matchKtoName(place.name, c.title);
    const cross = meal !== (c.contentTypeId === KTO_RESTAURANT_TYPE);
    if (cross && !crossAllowed(name, meal)) continue;
    const tierM = maxDistFor(name, meal);
    if (tierM === null) continue;
    const maxM = cross ? Math.min(CROSS_MAX_M, tierM) : tierM;
    const distM = Math.round(haversineM({ lat: place.lat, lng: place.lng }, { lat: c.lat, lng: c.lng }));
    if (distM > maxM) continue;
    if (!best || name.score > best.nameScore || (name.score === best.nameScore && (distM < best.distM || (distM === best.distM && c.contentId < best.contentId)))) {
      best = { contentId: c.contentId, contentTypeId: c.contentTypeId, title: c.title, distM, nameScore: name.score };
    }
  }
  return best;
};

// 넓은 곳과 옮긴 곳 — 숲길·국립공원·섬·해안도로는 대표 좌표가 몇 km 씩 어긋나고("사려니숲길" 5.5km), 식당은 여행자의 좌표가
// 수백 m 벗어나 있다("네거리식당" 0.4km). 이름이 같고(3자 이상) 그 이름의 콘텐츠가 전국에 하나뿐이면 더 멀어도 같은 곳으로 본다
// — 볼거리 6km, 식당·카페 1.5km. 같은 이름이 둘 이상이면("장도"·"설악산국립공원") 쓰지 않는다.
const UNIQUE_MIN_LEN = 3;
const UNIQUE_MAX_M = { sight: 6000, meal: 1500 } as const;
export class KtoNameIndex {
  private readonly byKey = new Map<string, KtoMatchCandidate[]>();

  constructor(candidates: Iterable<KtoMatchCandidate>) {
    for (const c of candidates) {
      for (const key of new Set([ktoNameKey(cleanKtoTitle(c.title)), ...aliasKeys(c.title)])) {
        if (key.length < UNIQUE_MIN_LEN) continue;
        const list = this.byKey.get(key);
        if (list) list.push(c);
        else this.byKey.set(key, [c]);
      }
    }
  }

  // 이름이 같은 단 하나의 콘텐츠(유형이 장소와 같은 쪽 — 식당·카페는 음식점, 그 밖은 음식점이 아닌 것).
  unique(place: { name: string; kind: string; lat: number; lng: number }): KtoMatch | null {
    const meal = place.kind === MEAL_KIND;
    const same = this.byKey.get(ktoNameKey(cleanKtoTitle(place.name))) ?? [];
    if (same.length !== 1) return null;
    const c = same[0]!;
    if (meal !== (c.contentTypeId === KTO_RESTAURANT_TYPE)) return null;
    const distM = Math.round(haversineM({ lat: place.lat, lng: place.lng }, { lat: c.lat, lng: c.lng }));
    return distM <= (meal ? UNIQUE_MAX_M.meal : UNIQUE_MAX_M.sight) ? { contentId: c.contentId, contentTypeId: c.contentTypeId, title: c.title, distM, nameScore: 1 } : null;
  }
}

// 좌표 격자 색인 — 카탈로그 수만 건에서 "이 장소 주변" 을 빨리 꺼낸다. 칸 한 변 ≈ 0.03°(위도 3.3km) — 주변 9칸이면
// KTO_MATCH_MAX_M 을 덮는다(경도 0.03° 는 우리나라 위도에서 2.6km 안팎이라 한 칸 더 본다).
const CELL_DEG = 0.03;
const cellOf = (v: number): number => Math.floor(v / CELL_DEG);
export class KtoGrid {
  private readonly cells = new Map<string, KtoMatchCandidate[]>();

  constructor(candidates: Iterable<KtoMatchCandidate>) {
    for (const c of candidates) {
      const key = `${cellOf(c.lat)}:${cellOf(c.lng)}`;
      const list = this.cells.get(key);
      if (list) list.push(c);
      else this.cells.set(key, [c]);
    }
  }

  near(lat: number, lng: number): KtoMatchCandidate[] {
    const out: KtoMatchCandidate[] = [];
    const [cy, cx] = [cellOf(lat), cellOf(lng)];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const list = this.cells.get(`${cy + dy}:${cx + dx}`);
        if (list) out.push(...list);
      }
    }
    return out;
  }
}

// ── 쉬는 날 ──────────────────────────────────────────────────────────────────
const DOW: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const DOW_CHARS = '월화수목금토일';
// 요일만으로 말할 수 없는 문구 — 이 낱말이 든 마디에서는 요일을 뽑지 않는다. "제외" 는 "일요일을 제외한 공휴일" 같은 뒤집힌 문장.
const NOT_WEEKLY = /(첫|둘|셋|넷|다섯)\s*째|[1-5]\s*째|번째|[1-5]\s*주|격주|마지막|매월|매달|월\s*\d+\s*회|동절기|하절기|겨울|여름|성수기|비수기|시즌|평일|우천|기상|상이|다름|다를|별도|문의|부정기|비정기|임시|변동|경우|이면|일\s*때|제외/;
// "월, 화요일" · "토·일요일" · "매주 월,화" 처럼 요일을 줄여 늘어놓은 것(앞이 숫자·한글이면 "1월" 같은 다른 낱말이다).
const DOW_LIST = new RegExp(`(?<![0-9가-힣])((?:[${DOW_CHARS}]\\s*[,·ㆍ/&]\\s*)+)([${DOW_CHARS}])요일`, 'g');
const DOW_SHORT_LIST = new RegExp(`매주\\s*((?:[${DOW_CHARS}]\\s*[,·ㆍ/&]\\s*)+[${DOW_CHARS}])(?![가-힣])`, 'g');
const DOW_RANGE = new RegExp(`(?<![0-9가-힣])([${DOW_CHARS}])(?:요일)?\\s*[~∼-]\\s*([${DOW_CHARS}])요일`, 'g');
const DOW_FULL = new RegExp(`([${DOW_CHARS}])요일`, 'g');
const DOW_SHORT = new RegExp(`매주\\s*([${DOW_CHARS}])(?![가-힣])`, 'g');
const spell = (letters: string): string => [...letters.replace(/[^월화수목금토일]/g, '')].map((d) => `${d}요일`).join('·');

// 쉬는 날 문구에서 **매주 쉬는 요일**(0 일 … 6 토, 오름차순)을 읽는다.
//   [] = 매주 쉬는 요일이 없다고 읽힘(연중무휴 · 명절 당일만 등) · null = 읽지 못함(문구 없음, 또는 요일로 말할 수 없는 문구).
// 틀리게 읽으면 열려 있는 곳을 일정에서 빼게 되므로, 헷갈리는 문구는 읽지 않는다(문구는 그대로 보여 준다). 2026-10-04 에 받은
// 실제 문구 203가지를 보고 정한 규칙:
//   · 괄호 안은 본문의 예외다("월요일이 공휴일이면 다음 날") — 떼고 읽는다. 다만 괄호가 철을 가리면("(비수기)" · "(7~8월은 무휴)")
//     매주 쉬는 것이 아니라서 통째로 읽지 않는다.
//   · ※ 뒤는 덧붙임이라 보지 않는다 — "연중무휴 ※ 매주 월요일 향토박물관 휴관(테마파크 정상 운영)" 이 월요일 휴무로 읽혔다.
//   · "연중무휴" 가 있으면 매주 쉬는 요일은 없다.
//   · 시설마다 따로 적은 문구("[동원] 매주 월요일[서원] 매주 화요일" · "- 서문시장 첫째·셋째 일요일 / - 야시장 매주 월~목요일" ·
//     "식물원 : 매주 월요일 … 버드파크 : 연중무휴")는 어느 쪽이 이 장소인지 알 수 없다 — 시장이 월~목에 쉬는 것으로 읽혔다.
//   · 격주·월 n회·계절·조건("…경우")·"문의" 가 든 마디에서는 요일을 뽑지 않는다.
const FACILITY_LABEL = /[[【][^\]】]*[\]】]|[가-힣]\s*[:：]/;
const LIST_ITEM = /^\s*[-·•▶]\s*\S/;
const SEASONAL_PAREN = /[(（][^)）]*(비수기|성수기|동절기|하절기|동계|하계|겨울|여름|\d\s*월)[^)）]*[)）]/;
const ALWAYS_OPEN = /연중\s*무휴/;
export const parseKtoClosedDays = (closed: string | null | undefined): number[] | null => {
  if (!closed) return null;
  // 덧붙임(※)은 줄 끝까지 버린다.
  const lines = closed
    .split('\n')
    .map((line) => line.split('※')[0]!)
    .filter((line) => line.trim() !== '');
  const main = lines.join('\n');
  if (main === '') return null;
  if (FACILITY_LABEL.test(main) || lines.filter((line) => LIST_ITEM.test(line)).length >= 2 || SEASONAL_PAREN.test(main)) return null;
  if (ALWAYS_OPEN.test(main)) return [];
  let text = main.replace(/[(（][^)）]*[)）]/g, ' ');
  if (text.trim() === '') return null;
  // 줄여 늘어놓은 요일과 범위를 낱낱의 "○요일" 로 편다 — 뒤에서 쉼표로 마디를 나누기 전에.
  text = text.replace(DOW_RANGE, (_, from: string, to: string) => {
    const [a, b] = [DOW_CHARS.indexOf(from), DOW_CHARS.indexOf(to)];
    return a < 0 || b < 0 || a >= b ? spell(from + to) : spell(DOW_CHARS.slice(a, b + 1));
  });
  text = text.replace(DOW_LIST, (_, head: string, last: string) => spell(head + last));
  text = text.replace(DOW_SHORT_LIST, (_, list: string) => `매주 ${spell(list)}`);

  const days = new Set<number>();
  let skipped = false;
  for (const clause of text.split(/[,\n/;]|\.\s/)) {
    if (clause.trim() === '') continue;
    if (NOT_WEEKLY.test(clause)) {
      skipped = true;
      continue;
    }
    for (const m of clause.matchAll(DOW_FULL)) days.add(DOW[m[1]!]!);
    for (const m of clause.matchAll(DOW_SHORT)) days.add(DOW[m[1]!]!);
    if (/주말/.test(clause)) {
      days.add(6);
      days.add(0);
    }
  }
  if (days.size === 0 && skipped) return null;
  return [...days].sort((a, b) => a - b);
};

// ── 표시 ─────────────────────────────────────────────────────────────────────
// 응답에 싣는 한 줄. 원문은 줄바꿈·"- " 글머리표·"[철]" 머리말이 섞여 온다("- 09:00~18:00- 준비시간 14:30~16:10- 마지막 주문
// 17:50" · "[11월~2월]\n- 09:00~18:00\n- 입장 마감 17:30") — 항목 사이를 " / " 로 잇고, 길면 자른다(원문은 350자까지 있다).
export const KTO_TEXT_MAX = 240;
export const shortenKtoText = (text: string | null | undefined, max = KTO_TEXT_MAX): string | null => {
  if (!text) return null;
  // 범위를 "~" 로 적는 문구에서 "- "(붙임표 + 공백)는 글머리표다. "~" 가 없는 문구의 붙임표는 범위일 수 있어 그대로 둔다("10:00 - 22:00").
  const bulleted = text.includes('~');
  const line = text
    .split('\n')
    .flatMap((part) => (bulleted ? part.split(/(?:^|\s*)-\s+/) : [part]))
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' / ')
    .replace(/\] \/ /g, '] ')
    .replace(/\s*※\s*/g, ' ※ ')
    .trim();
  if (line === '') return null;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};
