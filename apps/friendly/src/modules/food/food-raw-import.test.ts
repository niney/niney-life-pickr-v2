import { describe, expect, it } from 'vitest';
import { normalizeTerm } from '../../lib/text.js';
import { curatedSeeds } from './food-curated-seeds.js';
import { normalizeMfdsRawRows, rawFileRowsToRecords } from './food-raw-import.js';

const HEADER = [`${String.fromCharCode(0xfeff)}식품코드`, '식품명', '식품대분류명', '대표식품명', '에너지(kcal)'];
const rows: string[][] = [
  ['R1', '소고기_한우(1+등급)_갈비(안창살)_생것', '육류', '소고기', '313'],
  ['R2', '소고기_한우(2등급)_갈비(안창살)_생것', '육류', '소고기', '238'],
  ['R3', '소고기_한우(1등급)_갈비(안창살)_생것', '육류', '소고기', '313'],
  ['R4', '돼지고기_목심(목심살)_생것', '육류', '돼지고기', '227'],
  ['R5', '돼지고기_삼겹살(토시살)_생것', '육류', '돼지고기', '141'],
  ['R10', '소고기_한우(1등급)_목심(목심살)_생것', '육류', '소고기', '204'],
  ['R6', '소고기_한우(1+등급)_갈비(토시살)_생것', '육류', '소고기', '269'],
  ['R7', '닭 부산물_닭발_생것', '육류', '닭 부산물', '199'],
  ['R8', '소 부산물_위_생것', '육류', '소 부산물', '61'],
  ['R9', '닭고기_가슴(껍질 제거)_생것', '육류', '닭고기', '106'],
  ['S1', '전복류_전복_육_생것_완도_6월', '어패류 및 기타 수산물', '전복류', '103'],
  ['S2', '전복류_전복_육_생것_대표_6월', '어패류 및 기타 수산물', '전복류', '86'],
  ['S3', '전복류_전복_내장_생것_대표_평균', '어패류 및 기타 수산물', '전복류', '167'],
  ['S4', '넙치(광어)_육_생것_대표_평균', '어패류 및 기타 수산물', '넙치', '110'],
  ['S5', '굴_육_생것_대표_평균', '어패류 및 기타 수산물', '굴', '58'],
  ['D1', '북어_육_말린것_대표_평균', '어패류 및 기타 수산물', '북어', '339'],
  ['D2', '오징어류_오징어_육_조미하여 말린것_대표_평균', '어패류 및 기타 수산물', '오징어류', '269'],
  ['G1', '메밀 국수_생것', '곡류', '메밀', '291'],
  ['G2', '달걀_전란_생것', '난류', '달걀', '146'],
  ['X1', '말고기_살코기_생것', '육류', '말고기', '102'],
  ['X2', '참기름_압착', '유지류', '참기름', '884'],
];

describe('normalizeMfdsRawRows', () => {
  const { seeds, report } = normalizeMfdsRawRows(rawFileRowsToRecords(HEADER, rows));
  const byName = new Map(seeds.map((s) => [s.name, s]));

  it('BOM 헤더를 읽고, 생것이 아닌 행·희귀 육류·기름은 버린다', () => {
    expect(report.fetched).toBe(rows.length);
    expect(report.dropped).toMatchObject({ not_raw: 2, raw_uncooked_staple: 1, sea_not_flesh: 1 });
    expect(byName.has('말살코기')).toBe(false);
    expect(byName.has('메밀 국수')).toBe(false);
  });

  it('육류는 동물 접두 + 부위로 이름 짓고 등급은 중앙값으로 접는다', () => {
    expect(byName.get('소안창살')).toMatchObject({ kcalPer100g: 313, servingG: null, source: 'mfds-raw' });
    // 갈비 그룹은 세부 부위(안창살·토시살) 행까지 합쳐 중앙값 — 238·269·313·313 → 291.
    expect(byName.get('소갈비')?.kcalPer100g).toBe(291);
    expect(byName.get('소안창살')?.aliases).toContain('안창살');
    // 목심 → 식당 관행 별칭.
    expect(byName.get('돼지목심')?.aliases).toEqual(expect.arrayContaining(['목살', '목등심']));
    // 겹치는 '목심' 은 우선순위 동물(소)로.
    expect(byName.get('소목심')?.aliases).toContain('목심');
  });

  it('겹치는 부위 별칭은 우선순위 동물(소)만 가져가고, 두 글자 장기명은 자동 별칭이 없다', () => {
    expect(byName.get('소토시살')?.aliases).toContain('토시살');
    expect(byName.get('돼지토시살')?.aliases ?? []).not.toContain('토시살');
    expect(byName.get('소위')?.aliases ?? []).not.toContain('위');
    // "가슴(껍질 제거)" 의 괄호는 부위가 아니다.
    expect(byName.has('닭껍질 제거')).toBe(false);
    expect(byName.has('닭가슴')).toBe(true);
  });

  it('동물명으로 시작하는 부위는 접두를 겹치지 않는다(닭닭발 ✗)', () => {
    expect(byName.has('닭발')).toBe(true);
    expect(byName.has('닭닭발')).toBe(false);
  });

  it('수산물은 종을 이름으로, 대표 행이 있으면 그 값만, 괄호는 별칭·1자 이름 허용', () => {
    expect(byName.get('전복')).toMatchObject({ kcalPer100g: 86 });
    expect(byName.get('넙치')?.aliases).toEqual(expect.arrayContaining(['광어', '광어회']));
    expect(byName.get('굴')?.aliases).toContain('생굴');
  });

  it('건어물은 말린것 행에서 만들고 조미한 것은 뺀다', () => {
    expect(byName.get('북어')).toMatchObject({ kcalPer100g: 339 });
    expect(byName.get('북어')?.aliases).toEqual(expect.arrayContaining(['먹태', '황태']));
    expect(byName.has('마른오징어')).toBe(false);
    expect(byName.get('달걀')?.kcalPer100g).toBe(146);
  });
});

describe('curatedSeeds', () => {
  it('이름·별칭이 정규화 기준으로 서로 겹치지 않고, 병·잔 용량이 있으면 1인분 kcal 을 계산한다', () => {
    const seeds = curatedSeeds();
    const norms = new Map<string, string>();
    for (const s of seeds) {
      for (const n of [s.name, ...(s.aliases ?? [])]) {
        const k = normalizeTerm(n);
        expect(norms.get(k) ?? s.name, `${n} 이 ${norms.get(k)} 와 ${s.name} 에 같이 있다`).toBe(s.name);
        norms.set(k, s.name);
      }
    }
    const soju = seeds.find((s) => s.name === '소주')!;
    expect(soju).toMatchObject({ servingG: 360, kcalPer100g: 113, source: 'curated' });
    expect(soju.nutrition?.kcal).toBe(407);
    expect(soju.aliases).toContain('참이슬');
  });
});

describe('mergeLexiconRows', () => {
  it('DB 행을 종류별로 기본 어휘에 얹고, size 는 modifier 에도 들어가며, target 없는 alias 는 무시한다', async () => {
    const { mergeLexiconRows } = await import('./engine/lexicon-db.js');
    const src = mergeLexiconRows([
      { kind: 'alias', term: '불족', target: '족발' },
      { kind: 'alias', term: '이름없음', target: null },
      { kind: 'size', term: '왕창', target: null },
      { kind: 'synonym', term: '츄러스', target: '추로스' },
      { kind: 'set', term: '한상', target: null },
      { kind: 'unknown', term: 'x', target: null },
    ]);
    expect(src.extraAliases['족발']).toContain('불족');
    expect(Object.values(src.extraAliases).flat()).not.toContain('이름없음');
    expect(src.sizeModifiers).toContain('왕창');
    expect(src.leadingModifiers).toContain('왕창');
    expect(src.synonymPairs).toContainEqual(['츄러스', '추로스']);
    expect(src.setWords).toContain('한상');
  });
});
