// 식약처 전국통합식품영양성분정보(원재료성식품) 표준데이터(data.go.kr 15100065) → 카탈로그 시드.
//
// 음식 DB(15100070)에는 "삼겹살구이"·"김치찌개" 같은 조리음식만 있고 고기집 메뉴판의 "항정살 150g"·
// "안창살"·"곱창" 같은 **생것 부위**와 횟집의 "연어"·"광어", 그리고 "굴"·"전복" 같은 원재료가 없다.
// 이 표준데이터는 그것들을 100g 기준으로 준다("돼지고기_앞다리(항정살)_생것" 307kcal). 1인분 중량은
// 없으므로 시드는 kcalPer100g 만 채우고(servingG null) 메뉴 판정에서는 항상 '100g당' 등급이 된다.
//
// 이름 규칙(식품명 "_" 구분):
//   육류      "소고기_한우(1+등급)_갈비(안창살)_생것" → 소갈비(외부 부위, 등급 중앙값) + 소안창살(세부 부위)
//             별칭: 세부 부위가 한 동물에만 있으면 그대로("안창살"), 여러 동물에 있으면 식당 관행 우선순위
//             (소 → 돼지 → 닭…)로 하나만 준다. 관행 별칭 표(목심→목살, 갈비살→소갈비 …)는 CUT_ALIASES.
//   부산물    "소 부산물_소장(곱창)_생것" → 소곱창(별칭 곱창).
//   수산물·채소·과일·버섯·곡류·두류·견과·난류·해조류
//             "바지락_육_생것_대표_평균" → 바지락. "_생것_대표_평균" 행이 있으면 그것, 없으면 생것 행 중앙값.
//             괄호 안 별칭("넙치(광어)")은 별칭으로.
//   그 밖(말·토끼·자라·거위 등 희귀 육류, 국물류, 유지·당류·조미료)은 버린다.

import { coerceStrOrNull, numOrNull } from '../../lib/narrow.js';
import { normalizeTerm } from '../../lib/text.js';
import type { FoodSeed, NormalizeReport } from './food-import.service.js';

const MEAT_ANIMALS: Record<string, string> = {
  소고기: '소',
  돼지고기: '돼지',
  닭고기: '닭',
  오리고기: '오리',
  양고기: '양',
  어린양고기: '양',
  '소 부산물': '소',
  '돼지 부산물': '돼지',
  '닭 부산물': '닭',
};
// 부위 별칭이 여러 동물에 겹칠 때 식당 관행 순서.
const ANIMAL_PRIORITY = ['소', '돼지', '닭', '오리', '양'];
// 부위가 아닌 세그먼트(등급·산지·상태) — 이름에서 건너뛴다.
const NOT_PART_RE = /등급|산\)|수입|외국산|국내산|토종|오골계|성계|껍질|살코기|생것|냉동|평균|대표|^\d/u;
// 식당 관행 별칭: 카탈로그 이름 → 추가 별칭. 양방향 아님(별칭 → 이 항목).
const CUT_ALIASES: Record<string, string[]> = {
  돼지목심: ['목살', '돼지목살', '생목살', '목살구이', '목등심', '생목등심', '돼지목등심', '목전지'],
  소목심: ['소목살', '목심', '한우목심'],
  돼지삼겹살: ['삼겹', '생삼겹', '생삼겹살', '삼겹살', '오겹살', '통삼겹', '냉삼', '냉동삼겹살', '냉삼겹', '냉삼겹살'],
  돼지항정살: ['항정'],
  돼지갈매기살: ['갈매기'],
  돼지등갈비: ['등갈비'],
  돼지앞다리: ['앞다리살', '전지'],
  돼지뒷다리: ['뒷다리살', '후지'],
  돼지등심: ['돈등심'],
  돼지안심: ['돈안심'],
  돼지주걱살: ['가브리살', '가브리'],
  소갈비: ['갈비살', '소갈비살', '생갈비', '소생갈비', '갈빗살', '소갈빗살', '통갈비살', '왕갈비', '소왕갈비', '생왕갈비', '꽃갈비살'],
  소등심: ['등심', '소등심구이', '등심구이'],
  소안심: ['안심'],
  소꽃등심살: ['꽃등심', '꽃살', '소꽃살', '와규꽃살', '한우꽃등심'],
  소살치살: ['살치'],
  소차돌박이: ['차돌', '차돌박이구이', '우삼겹'],
  소채끝: ['채끝살', '채끝등심'],
  소부채살: ['부채'],
  소양지: ['양지머리'],
  소사태: [],
  소우둔: ['우둔살'],
  소설도: [],
  소안창살: ['안창'],
  소토시살: ['토시'],
  소제비추리: [],
  소치마살: ['치맛살'],
  소업진살: ['업진'],
  소곱창: ['곱창', '소곱창구이', '곱창구이'],
  돼지곱창: ['돼지곱창구이'],
  소양: ['양', '특양', '양구이', '특양구이', '소양구이'],
  소천엽: ['천엽'],
  소간: ['간', '생간'],
  소염통: ['염통', '염통구이'],
  소혀: ['우설', '소혀구이'],
  소꼬리: ['꼬리', '우꼬리'],
  돼지족발: [],
  돼지대장: ['돼지대창'],
  돼지오소리감투: ['오소리감투'],
  닭발: ['닭발구이', '무뼈닭발', '국물닭발'],
  닭모래주머니: ['닭똥집', '똥집', '똥집구이', '닭근위', '닭똥집구이'],
  닭염통: ['닭염통구이'],
  닭날개: ['닭날개구이', '윙', '봉'],
  닭가슴: ['닭가슴살'],
  닭넓적다리: ['닭다리살', '닭정육'],
  닭아랫다리: ['닭다리', '북채'],
  오리: ['오리생고기', '생오리'],
};
// 수산물 식당 관행 별칭: 종 이름 → 메뉴판 표기. 회 접미는 판정기가 떼어 보지만(RAW_SUFFIXES) 흔한 것은 exact 로 잡는다.
const SEA_ALIASES: Record<string, string[]> = {
  넙치: ['광어', '광어회', '넙치회', '광어사시미', '자연산광어'],
  조피볼락: ['우럭', '우럭회'],
  참돔: ['도미', '참돔회', '도미회'],
  연어: ['연어회', '연어사시미', '생연어', '생연어회'],
  참다랑어: ['참치', '참치회', '마구로', '참치사시미'],
  뱀장어: ['민물장어', '장어', '풍천장어'],
  붕장어: ['바다장어', '아나고'],
  갯장어: ['하모'],
  문어: ['문어숙회', '참문어'],
  낙지: ['산낙지', '낙지회'],
  오징어: ['오징어회', '생오징어'],
  갑오징어: ['갑오징어회'],
  대하: ['왕새우', '생새우', '새우'],
  굴: ['생굴', '석화', '굴회'],
  가리비: ['가리비회'],
  멍게: ['멍게회'],
  소라: ['소라회'],
  방어: ['방어회', '대방어'],
  고등어: ['고등어회'],
  왕게: ['킹크랩'],
  전복: ['전복회', '생전복', '활전복'],
  해삼: ['해삼회'],
  키조개: ['키조개관자', '관자', '패주'],
  병어: ['병어회'],
  민어: ['민어회'],
  농어: ['농어회'],
  숭어: ['숭어회'],
  가자미: ['가자미회'],
  도다리: ['도다리회'],
  임연수어: ['임연수'],
};
// 건어물 — 생것이 아니라 "말린것" 행을 쓴다(먹태·황태는 북어, 마른오징어, 쥐포). 조미한 것은 제외.
const DRIED: Record<string, { name: string; aliases: string[] }> = {
  북어: { name: '북어', aliases: ['황태', '먹태', '북어채', '황태채', '먹태채', '먹태구이', '황태구이', '바싹먹태', '북어포', '황태포'] },
  오징어: { name: '마른오징어', aliases: ['건오징어', '말린오징어', '오징어채', '마른오징어구이'] },
  쥐치: { name: '쥐포', aliases: ['쥐치포', '쥐포구이'] },
};
// 육류·부산물 이름 안의 "가슴(껍질 제거)"처럼 괄호가 부위가 아닌 경우.
const PAREN_NOT_PART_RE = /껍질|제거|포함/u;

interface RawRow {
  foodCd: string | null;
  foodNm: string;
  category: string | null;
  repName: string | null;
  kcal: number | null;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

const splitParen = (seg: string): { outer: string; inner: string | null } => {
  const m = /^([^()]+)\(([^()]+)\)$/.exec(seg.trim());
  if (!m) return { outer: seg.trim(), inner: null };
  return { outer: m[1]!.trim(), inner: m[2]!.trim() };
};

interface Acc {
  name: string;
  kcals: number[];
  aliases: Set<string>;
  category: string | null;
  firstCode: string | null;
  /** 육류 별칭 충돌 해소용. */
  animal: string | null;
  bare: string | null;
  /** 수산물 등: "_대표_평균" 행이 있으면 그 값만 쓴다. */
  representative: number[];
}

// 수산물 부위 — 먹는 부위(육·전체)만 값으로 쓰고 내장·껍질·알·뼈는 버린다.
const SEA_PARTS = new Set(['육', '전체', '살', '근육']);
const SEA_NOT_PARTS = new Set(['내장', '껍질', '알', '뼈', '머리', '간', '난소', '정소', '지느러미', '아가미', '먹물']);

const RAW_CATEGORIES_PLAIN = new Set([
  '어패류 및 기타 수산물',
  '해조류',
  '채소류',
  '과일류',
  '버섯류',
  '곡류',
  '두류',
  '견과 및 종실류',
  '난류',
  '감자 및 전분류',
]);

// 배포 CSV 첫 헤더에 붙는 BOM(U+FEFF). 리터럴 대신 코드포인트로 만든다(에디터·린터가 안 보이는 문자를 싫어한다).
const BOM_RE = new RegExp(`^${String.fromCharCode(0xfeff)}`);

export const rawFileRowsToRecords = (header: string[], rows: string[][]): RawRow[] => {
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    const k = h.replace(BOM_RE, '').trim();
    if (k && !idx.has(k)) idx.set(k, i);
  });
  const col = (r: string[], k: string): string | null => {
    const i = idx.get(k);
    return i === undefined ? null : coerceStrOrNull(r[i]?.trim() ?? null);
  };
  return rows.map((r) => ({
    foodCd: col(r, '식품코드'),
    foodNm: col(r, '식품명') ?? '',
    category: col(r, '식품대분류명'),
    repName: col(r, '대표식품명'),
    kcal: numOrNull(col(r, '에너지(kcal)')),
  }));
};

export const normalizeMfdsRawRows = (rows: RawRow[]): { seeds: FoodSeed[]; report: NormalizeReport } => {
  const report: NormalizeReport = { fetched: rows.length, produced: 0, dropped: {} };
  const drop = (reason: string): void => {
    report.dropped[reason] = (report.dropped[reason] ?? 0) + 1;
  };
  const accs = new Map<string, Acc>();
  const acc = (name: string, row: RawRow, extra: Partial<Acc> = {}): Acc => {
    const key = normalizeTerm(name);
    let a = accs.get(key);
    if (!a) {
      a = {
        name,
        kcals: [],
        aliases: new Set(),
        category: row.category,
        firstCode: row.foodCd,
        animal: null,
        bare: null,
        representative: [],
        ...extra,
      };
      accs.set(key, a);
    }
    return a;
  };

  for (const row of rows) {
    if (!row.foodNm || row.kcal === null) {
      drop('no_name_or_kcal');
      continue;
    }
    const segs = row.foodNm.split('_').map((s) => s.trim()).filter(Boolean);
    // 건어물: "북어_육_말린것_대표_평균" / "오징어류_오징어_육_말린것_대표_평균".
    if (segs.includes('말린것')) {
      const head0 = segs[0]!;
      const species = /류$/u.test(head0) && segs.length > 2 ? segs[1]! : head0;
      const dried = DRIED[species];
      if (dried && segs.some((s) => SEA_PARTS.has(s))) {
        const a = acc(dried.name, row);
        if (segs.includes('대표')) a.representative.push(row.kcal);
        else a.kcals.push(row.kcal);
        for (const al of dried.aliases) a.aliases.add(al);
        continue;
      }
    }
    if (!segs.some((s) => s === '생것' || s.startsWith('생것'))) {
      drop('not_raw');
      continue;
    }
    const head = segs[0]!;
    const animal = MEAT_ANIMALS[head] ?? (row.repName ? MEAT_ANIMALS[row.repName] : undefined);
    if (animal) {
      // 부위 세그먼트: 첫(동물)·마지막(생것) 사이에서 등급·산지가 아닌 것.
      // 괄호 안은 부위(안창살)일 수도 상태(껍질 제거)일 수도 있어 바깥쪽 이름으로만 거른다.
      const parts = segs.slice(1).filter((s) => !NOT_PART_RE.test(splitParen(s).outer) && !s.startsWith('생것'));
      const partSeg = parts[parts.length - 1];
      if (!partSeg) {
        drop('meat_no_part');
        continue;
      }
      const { outer, inner } = splitParen(partSeg);
      // "닭 부산물_닭발" 처럼 부위가 이미 동물명으로 시작하면 접두를 겹치지 않는다(닭닭발 ✗).
      const named = (part: string): string => (part.startsWith(animal) && part.length > animal.length ? part : `${animal}${part}`);
      const outerAcc = acc(named(outer), row, { animal, bare: outer });
      outerAcc.kcals.push(row.kcal);
      if (inner && !PAREN_NOT_PART_RE.test(inner)) {
        const innerAcc = acc(named(inner), row, { animal, bare: inner });
        innerAcc.kcals.push(row.kcal);
      }
      continue;
    }
    if (row.category && RAW_CATEGORIES_PLAIN.has(row.category)) {
      // 수산물은 "전복류_전복_육_생것_완도_6월"처럼 분류(…류)_종_부위 순 — 종을 이름으로, 육/전체 행만.
      const isSea = row.category === '어패류 및 기타 수산물';
      const speciesSeg = isSea && /류$/u.test(head) && segs.length > 2 ? segs[1]! : head;
      if (isSea) {
        const part = segs.find((s) => SEA_PARTS.has(s));
        const badPart = segs.some((s) => SEA_NOT_PARTS.has(s));
        if (badPart && !part) {
          drop('sea_not_flesh');
          continue;
        }
      }
      const { outer, inner } = splitParen(speciesSeg);
      if (!outer || /류$/u.test(outer)) {
        drop('raw_bad_name');
        continue;
      }
      // 생면·생쌀은 조리 후 무게가 2~3배로 늘어 100g당 값이 메뉴와 맞지 않는다.
      if (/국수|면$|묵$/u.test(outer)) {
        drop('raw_uncooked_staple');
        continue;
      }
      const a = acc(outer, row);
      const isRep = segs.includes('대표');
      if (isRep) a.representative.push(row.kcal);
      else a.kcals.push(row.kcal);
      if (inner && !/^d/.test(inner)) a.aliases.add(inner);
      continue;
    }
    drop('other_category');
  }

  // 육류 bare 별칭: 한 동물에만 있으면 그대로, 겹치면 우선순위 동물만.
  const bareOwners = new Map<string, Acc[]>();
  for (const a of accs.values()) {
    if (!a.bare) continue;
    const list = bareOwners.get(normalizeTerm(a.bare)) ?? [];
    list.push(a);
    bareOwners.set(normalizeTerm(a.bare), list);
  }
  for (const list of bareOwners.values()) {
    const winner = [...list].sort(
      (x, y) => ANIMAL_PRIORITY.indexOf(x.animal ?? '') - ANIMAL_PRIORITY.indexOf(y.animal ?? ''),
    )[0]!;
    // 두 글자 장기명("위"·"피"·"목")은 자동 별칭에서 뺀다 — 필요한 것은 CUT_ALIASES 가 명시한다.
    if (winner.bare && winner.bare.length >= 3 && normalizeTerm(winner.bare) !== normalizeTerm(winner.name)) {
      winner.aliases.add(winner.bare);
    }
  }
  for (const [name, extra] of [...Object.entries(CUT_ALIASES), ...Object.entries(SEA_ALIASES)]) {
    const a = accs.get(normalizeTerm(name));
    if (!a) continue;
    for (const al of extra) a.aliases.add(al);
  }

  const seeds: FoodSeed[] = [];
  for (const a of accs.values()) {
    const vals = a.representative.length > 0 ? a.representative : a.kcals;
    if (vals.length === 0) continue;
    seeds.push({
      name: a.name,
      repName: a.name,
      aliases: [...a.aliases].filter((x) => normalizeTerm(x) !== normalizeTerm(a.name)).slice(0, 30),
      dishType: null,
      mainIngredient: null,
      cuisine: null,
      ingredients: null,
      servingG: null,
      nutrition: null,
      kcalPer100g: Math.round(median(vals) * 10) / 10,
      source: 'mfds-raw',
      sourceId: a.firstCode,
      sourceCategory: a.category,
      popularity: 0,
    });
  }
  report.produced = seeds.length;
  return { seeds, report };
};
