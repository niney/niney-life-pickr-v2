// 집값 단지 속성 보강(K-apt) — 공동주택관리정보시스템 자료(관리비 공개 의무단지 xlsx/csv 또는 단지 목록·기본
// 정보 API)를 정규화해 HousingComplex 에 붙인다. 붙이는 값: kaptCode·saleType(분양/임대/혼합 — 임대단지는
// 실거래가 없는 게 정상이라 지도에서 "임대" 로 표시)·heating·elevatorCount, 그리고 households·dongCount·
// approvedDate·roadAddr 는 마스터가 비어 있을 때만.
//
// 골격은 life-map-master.service 와 같다 — 정규화는 순수 함수 + 사유별 리포트, 매칭도 순수 함수, 쓰기는 별도.
// 파일 헤더는 배포본마다 이름이 조금씩 달라("세대수(합계)"·"승강기대수"·"법정동주소" …) 키워드로 열을
// 찾는다(resolveKaptColumns) — --dry-run 이 인식 결과를 찍어 준다.
//
// 매칭(K-apt 엔 PNU 가 없고 법정동코드·주소·단지명뿐):
//   1) 시군구코드(법정동코드 앞 5자리, 없으면 주소의 시도·시군구명으로 마스터에서 역조회) + 읍면동 마지막
//      토큰 + 지번(0 패딩 제거) — 한 필지 여러 단지면 이름으로 고르고 그래도 모호하면 건너뛴다(속성을
//      엉뚱한 단지에 쓰는 것보다 비우는 게 낫다).
//   2) 같은 시군구·읍면동 안 정규화 단지명(name·altNames)이 유일하게 일치.
//   3) 도로명주소 완전 일치(공백·괄호 제거).

import type { PrismaClient } from '@prisma/client';
import { normalizeHousingName } from '@repo/utils';
import { parseHousingAddress } from './housing-complex-master.service.js';
import { housingJibunKey, housingUmdKey } from './housing-derived.service.js';
import type { KaptBasicInfo, KaptDetailInfo, KaptListItem } from './kapt.adapter.js';

const UPDATE_CHUNK = 200;
const SELECT_CHUNK = 500;

export interface KaptRow {
  kaptCode: string;
  name: string;
  jibunAddr: string | null;
  roadAddr: string | null;
  // 법정동코드(10자리, 없으면 null).
  bjdCode: string | null;
  dongCount: number | null;
  households: number | null;
  elevatorCount: number | null;
  heating: string | null;
  // '분양' | '임대' | '혼합' | 원문(모르는 값) | null.
  saleType: string | null;
  category: string | null;
  // 'YYYY-MM-DD'.
  approvedDate: string | null;
}

// ── 열 인식 ─────────────────────────────────────────────────────────────────────
export type KaptColumnKey =
  | 'kaptCode'
  | 'name'
  | 'bjdCode'
  | 'jibunAddr'
  | 'roadAddr'
  | 'dongCount'
  | 'households'
  | 'elevatorCount'
  | 'elevatorYn'
  | 'heating'
  | 'saleType'
  | 'category'
  | 'approvedDate';
export type KaptColumnMap = Record<KaptColumnKey, number | null> & { unrecognized: string[] };

const compact = (s: string): string => s.normalize('NFC').replace(/\s+/g, '').toLowerCase();

// 순서대로 첫 일치 헤더. prefer 가 있으면 후보 중 prefer 에 맞는 것을 먼저.
const COLUMN_RULES: { key: KaptColumnKey; test: RegExp; exclude?: RegExp; prefer?: RegExp }[] = [
  { key: 'kaptCode', test: /단지코드|kaptcode/ },
  { key: 'name', test: /단지명|kaptname/, exclude: /변경|영문|이력/ },
  { key: 'bjdCode', test: /법정동코드|bjdcode/ },
  { key: 'jibunAddr', test: /법정동주소|지번주소|kaptaddr/ },
  { key: 'roadAddr', test: /도로명주소|dorojuso/ },
  { key: 'dongCount', test: /동수|kaptdongcnt/, exclude: /법정동|읍면동|세대|호수/ },
  { key: 'households', test: /세대수|kaptdacnt/, exclude: /분양|임대|관리자|기타|주거전용/, prefer: /합계|총세대수|^세대수$/ },
  { key: 'elevatorCount', test: /승강기(대수|수|개수)|kaptdecnt/ },
  { key: 'elevatorYn', test: /승강기(유무|여부|설치)/ },
  { key: 'heating', test: /난방/ },
  { key: 'saleType', test: /분양형태|분양구분|codesalenm/ },
  { key: 'category', test: /단지분류|단지유형|단지구분|codeaptnm/ },
  { key: 'approvedDate', test: /사용승인|준공|kaptusedate/ },
];

export const resolveKaptColumns = (header: string[]): KaptColumnMap => {
  const keys = header.map(compact);
  const used = new Set<number>();
  const map = Object.fromEntries(COLUMN_RULES.map((r) => [r.key, null])) as unknown as KaptColumnMap;
  for (const rule of COLUMN_RULES) {
    const candidates: number[] = [];
    keys.forEach((k, i) => {
      if (used.has(i) || !rule.test.test(k) || (rule.exclude && rule.exclude.test(k))) return;
      candidates.push(i);
    });
    if (candidates.length === 0) continue;
    const preferred = rule.prefer ? candidates.find((i) => rule.prefer!.test(keys[i]!)) : undefined;
    const pick = preferred ?? candidates[0]!;
    map[rule.key] = pick;
    used.add(pick);
  }
  map.unrecognized = header.filter((_, i) => !used.has(i) && header[i]!.trim().length > 0);
  return map;
};

// K-apt 포털 xlsx 는 승강기 대수 합계 열이 없고 '승강기(승객용)·(화물용)·(승객+화물)·(장애인)·(비상용)·(기타)' 로
// 나뉘어 있다 — 그 열들의 인덱스(합산용). '승강기관리-관리방식' 같은 텍스트 열은 제외.
export const resolveKaptElevatorParts = (header: string[]): number[] =>
  header.map(compact).flatMap((k, i) => (/^승강기\([^)]+\)$/.test(k) ? [i] : []));

// 법정동주소 정리 — 포털 xlsx 는 '서울특별시 종로구 내수동 72 경희궁의아침3단지' 처럼 지번 뒤에 단지명이 붙고,
// 부번이 없으면 '73-' 로 끝난다. 첫 지번 토큰까지만 남기고 끝의 '-' 를 뗀다(지번 토큰이 없으면 원문 그대로).
export const cleanKaptJibunAddr = (addr: string | null): string | null => {
  if (!addr) return null;
  const tokens = addr.split(' ').filter(Boolean);
  const at = tokens.findIndex((t, i) => i >= 2 && /^산?\d+(-\d*)?$/.test(t));
  if (at < 0) return addr;
  const jibun = tokens[at]!.replace(/-$/, '');
  return [...tokens.slice(0, at), jibun].join(' ');
};

// ── 값 정규화 ───────────────────────────────────────────────────────────────────
const strOrNull = (v: string | undefined): string | null => {
  const s = (v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : null;
};
const intOrNull = (v: string | undefined): number | null => {
  const s = (v ?? '').replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.trunc(Number(s));
  return Number.isFinite(n) ? n : null;
};
// 'YYYYMMDD' · 'YYYY-MM-DD' · 'YYYY.MM.DD' · 'YYYY/MM/DD'(시각 꼬리 허용) → 'YYYY-MM-DD'. 'YYYYMM'·'YYYY-MM' 은 1일.
export const normalizeKaptDate = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  const m = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const ym = /^(\d{4})[-./]?(\d{2})$/.exec(s);
  return ym ? `${ym[1]}-${ym[2]}-01` : null;
};
// 분양형태 — '분양'·'임대'·'혼합'(둘 다) 로 접고, 모르는 값은 원문.
export const normalizeKaptSaleType = (v: string | null | undefined): string | null => {
  const s = strOrNull(v ?? undefined);
  if (!s) return null;
  const c = compact(s);
  if (c.includes('혼합')) return '혼합';
  const rent = c.includes('임대');
  const sale = c.includes('분양');
  if (rent && sale) return '혼합';
  if (rent) return '임대';
  if (sale) return '분양';
  return s;
};
// 분할 열 합계 — 전부 비었으면 null(모른다), 하나라도 숫자면 합.
const sumOrNull = (parts: (number | null)[]): number | null => {
  const nums = parts.filter((n): n is number => n !== null);
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0);
};
const bjdCodeOrNull = (v: string | undefined): string | null => {
  const digits = (v ?? '').replace(/\D/g, '');
  return digits.length >= 5 ? digits.slice(0, 10) : null;
};

export interface KaptNormalizeReport {
  rows: KaptRow[];
  columns: KaptColumnMap;
  droppedNoCode: number;
  droppedNoName: number;
  duplicates: number;
  bySaleType: Map<string, number>;
}

// 파일(xlsx/csv) 행 → KaptRow. 단지코드·단지명 열이 없으면 하드 fail(다른 파일을 넣은 것).
export const normalizeKaptRows = (header: string[], rows: string[][]): KaptNormalizeReport => {
  const columns = resolveKaptColumns(header);
  const elevatorParts = columns.elevatorCount === null ? resolveKaptElevatorParts(header) : [];
  if (columns.kaptCode === null || columns.name === null) {
    throw new Error(`K-apt 파일에 단지코드/단지명 열이 없습니다 (헤더: ${header.slice(0, 10).join(', ')}…)`);
  }
  const cell = (row: string[], idx: number | null): string | undefined => (idx === null ? undefined : row[idx]);
  const report: KaptNormalizeReport = { rows: [], columns, droppedNoCode: 0, droppedNoName: 0, duplicates: 0, bySaleType: new Map() };
  const seen = new Set<string>();
  for (const row of rows) {
    const kaptCode = strOrNull(cell(row, columns.kaptCode));
    if (!kaptCode) {
      report.droppedNoCode += 1;
      continue;
    }
    const name = strOrNull(cell(row, columns.name));
    if (!name) {
      report.droppedNoName += 1;
      continue;
    }
    if (seen.has(kaptCode)) {
      report.duplicates += 1;
      continue;
    }
    seen.add(kaptCode);
    const saleType = normalizeKaptSaleType(cell(row, columns.saleType));
    report.rows.push({
      kaptCode,
      name,
      jibunAddr: cleanKaptJibunAddr(strOrNull(cell(row, columns.jibunAddr))),
      roadAddr: strOrNull(cell(row, columns.roadAddr)),
      bjdCode: bjdCodeOrNull(cell(row, columns.bjdCode)),
      dongCount: intOrNull(cell(row, columns.dongCount)),
      households: intOrNull(cell(row, columns.households)),
      // 유무 열만 있으면 대수를 모른다(null). 'N'/'무' 면 0.
      elevatorCount:
        intOrNull(cell(row, columns.elevatorCount)) ??
        sumOrNull(elevatorParts.map((i) => intOrNull(row[i]))) ??
        (/^(n|무|없음|x)$/i.test((cell(row, columns.elevatorYn) ?? '').trim()) ? 0 : null),
      heating: strOrNull(cell(row, columns.heating)),
      saleType,
      category: strOrNull(cell(row, columns.category)),
      approvedDate: normalizeKaptDate(cell(row, columns.approvedDate)),
    });
    report.bySaleType.set(saleType ?? '(없음)', (report.bySaleType.get(saleType ?? '(없음)') ?? 0) + 1);
  }
  return report;
};

// API(목록 + 기본정보 + 상세) → KaptRow. 목록의 시도·시군구·읍면·동리는 기본정보 주소가 없을 때의 폴백.
export const kaptRowFromApi = (list: KaptListItem, basic: KaptBasicInfo | null, detail: KaptDetailInfo | null): KaptRow => {
  const listAddr = [list.as1, list.as2, list.as3, list.as4].filter(Boolean).join(' ');
  return {
    kaptCode: list.kaptCode,
    name: basic?.kaptName ?? list.kaptName,
    jibunAddr: cleanKaptJibunAddr(basic?.kaptAddr ?? (listAddr || null)),
    roadAddr: basic?.doroJuso ?? null,
    bjdCode: bjdCodeOrNull(basic?.bjdCode ?? list.bjdCode ?? undefined),
    dongCount: basic?.kaptDongCnt ?? null,
    households: basic?.kaptdaCnt ?? null,
    elevatorCount: detail?.kaptdEcnt ?? null,
    heating: basic?.codeHeatNm ?? null,
    saleType: normalizeKaptSaleType(basic?.codeSaleNm),
    category: basic?.codeAptNm ?? null,
    approvedDate: normalizeKaptDate(basic?.kaptUsedate),
  };
};

// ── 매칭 ────────────────────────────────────────────────────────────────────────
// 시도명 → 2자 키('서울특별시'·'서울시'·'서울' 이 같은 키). 모르는 값은 공백 제거 원문.
const SIDO_KEYS: [RegExp, string][] = [
  [/^서울/, '서울'],
  [/^부산/, '부산'],
  [/^대구/, '대구'],
  [/^인천/, '인천'],
  [/^광주/, '광주'],
  [/^대전/, '대전'],
  [/^울산/, '울산'],
  [/^세종/, '세종'],
  [/^경기/, '경기'],
  [/^강원/, '강원'],
  [/^충청북|^충북/, '충북'],
  [/^충청남|^충남/, '충남'],
  [/^전라북|^전북/, '전북'],
  [/^전라남|^전남/, '전남'],
  [/^경상북|^경북/, '경북'],
  [/^경상남|^경남/, '경남'],
  [/^제주/, '제주'],
];
export const kaptSidoKey = (sido: string | null | undefined): string => {
  const s = (sido ?? '').trim();
  for (const [re, key] of SIDO_KEYS) if (re.test(s)) return key;
  return compact(s);
};
// 도로명주소 키 — 공백·괄호 내용 제거, 소문자.
export const kaptRoadKey = (road: string | null | undefined): string =>
  (road ?? '')
    .normalize('NFC')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();

export interface KaptMatchComplex {
  id: string;
  sggCd: string;
  umd: string;
  jibun: string | null;
  name: string;
  altNames: string | null;
  sido: string;
  sgg: string;
  roadAddr: string | null;
}

export interface KaptMatchReport {
  rows: number;
  matched: number;
  byJibun: number;
  byName: number;
  byRoad: number;
  // 한 단지에 두 행이 붙어 뒤 행을 버린 수.
  duplicateTargets: number;
  ambiguous: number;
  unmatched: number;
}

const pushIndex = (m: Map<string, string[]>, key: string, id: string): void => {
  const list = m.get(key);
  if (list) {
    if (!list.includes(id)) list.push(id);
  } else m.set(key, [id]);
};

export const matchKaptRows = (
  rows: KaptRow[],
  complexes: KaptMatchComplex[],
): { matches: Map<string, KaptRow>; report: KaptMatchReport } => {
  const jibunIndex = new Map<string, string[]>();
  const nameIndex = new Map<string, string[]>();
  const roadIndex = new Map<string, string[]>();
  // '시도키|시군구(공백 제거)' → 시군구코드들 / 시도키 → 시군구코드들(세종처럼 시군구가 없는 곳).
  const regionIndex = new Map<string, Set<string>>();
  const sidoIndex = new Map<string, Set<string>>();
  const nameOf = new Map<string, Set<string>>();
  for (const c of complexes) {
    const umdKey = housingUmdKey(c.umd);
    if (c.jibun) pushIndex(jibunIndex, `${c.sggCd}|${umdKey}|${housingJibunKey(c.jibun)}`, c.id);
    const norms = new Set<string>();
    for (const n of [c.name, ...(c.altNames ? c.altNames.split('|') : [])]) {
      const norm = normalizeHousingName(n);
      if (!norm) continue;
      norms.add(norm);
      pushIndex(nameIndex, `${c.sggCd}|${umdKey}|${norm}`, c.id);
    }
    nameOf.set(c.id, norms);
    const road = kaptRoadKey(c.roadAddr);
    if (road) pushIndex(roadIndex, road, c.id);
    const sk = kaptSidoKey(c.sido);
    const rk = `${sk}|${compact(c.sgg)}`;
    if (!regionIndex.has(rk)) regionIndex.set(rk, new Set());
    regionIndex.get(rk)!.add(c.sggCd);
    if (!sidoIndex.has(sk)) sidoIndex.set(sk, new Set());
    sidoIndex.get(sk)!.add(c.sggCd);
  }
  const sggCdsFor = (sido: string, sgg: string): string[] => {
    const sk = kaptSidoKey(sido);
    const sc = compact(sgg);
    const exact = regionIndex.get(`${sk}|${sc}`);
    if (exact) return [...exact];
    if (!sc) return [...(sidoIndex.get(sk) ?? [])];
    // '성남시' 만 온 경우 — '성남시분당구'·'성남시수정구'… 전부 후보.
    const out = new Set<string>();
    for (const [key, codes] of regionIndex) {
      if (key.startsWith(`${sk}|${sc}`)) for (const code of codes) out.add(code);
    }
    return [...out];
  };

  const report: KaptMatchReport = { rows: rows.length, matched: 0, byJibun: 0, byName: 0, byRoad: 0, duplicateTargets: 0, ambiguous: 0, unmatched: 0 };
  const matches = new Map<string, KaptRow>();
  const take = (id: string, row: KaptRow, how: 'byJibun' | 'byName' | 'byRoad'): void => {
    if (matches.has(id)) {
      report.duplicateTargets += 1;
      return;
    }
    matches.set(id, row);
    report.matched += 1;
    report[how] += 1;
  };

  for (const row of rows) {
    const parsed = row.jibunAddr ? parseHousingAddress(row.jibunAddr) : null;
    const sggCds = row.bjdCode ? [row.bjdCode.slice(0, 5)] : parsed ? sggCdsFor(parsed.sido, parsed.sgg) : [];
    const umdKey = parsed ? housingUmdKey(parsed.umd) : '';
    const norm = normalizeHousingName(row.name);

    // 1) 지번
    if (parsed?.jibun && umdKey) {
      const jk = housingJibunKey(parsed.jibun);
      const ids = new Set<string>();
      for (const sggCd of sggCds) for (const id of jibunIndex.get(`${sggCd}|${umdKey}|${jk}`) ?? []) ids.add(id);
      if (ids.size === 1) {
        take([...ids][0]!, row, 'byJibun');
        continue;
      }
      if (ids.size > 1) {
        const byName = [...ids].filter((id) => norm && nameOf.get(id)?.has(norm));
        if (byName.length === 1) {
          take(byName[0]!, row, 'byJibun');
          continue;
        }
        report.ambiguous += 1;
        continue;
      }
    }
    // 2) 이름(같은 시군구·읍면동)
    if (norm && umdKey) {
      const ids = new Set<string>();
      for (const sggCd of sggCds) for (const id of nameIndex.get(`${sggCd}|${umdKey}|${norm}`) ?? []) ids.add(id);
      if (ids.size === 1) {
        take([...ids][0]!, row, 'byName');
        continue;
      }
      if (ids.size > 1) {
        report.ambiguous += 1;
        continue;
      }
    }
    // 3) 도로명주소
    const road = kaptRoadKey(row.roadAddr);
    const byRoad = road ? (roadIndex.get(road) ?? []) : [];
    if (byRoad.length === 1) {
      take(byRoad[0]!, row, 'byRoad');
      continue;
    }
    if (byRoad.length > 1) {
      report.ambiguous += 1;
      continue;
    }
    report.unmatched += 1;
  }
  return { matches, report };
};

// ── 적용 ────────────────────────────────────────────────────────────────────────
export interface KaptApplyMeta {
  sourceFile: string | null;
}

// 매칭 결과를 단지에 쓴다 — kaptCode·saleType·heating·elevatorCount 는 값이 있으면 덮어쓰고, households·
// dongCount·approvedDate·roadAddr 는 마스터가 비어 있을 때만. 끝에 HousingSync{kind:'kapt'}.
export const applyKaptMatches = async (
  prisma: PrismaClient,
  matches: Map<string, KaptRow>,
  meta: KaptApplyMeta,
): Promise<{ updated: number }> => {
  const ids = [...matches.keys()];
  let updated = 0;
  for (let i = 0; i < ids.length; i += SELECT_CHUNK) {
    const chunk = ids.slice(i, i + SELECT_CHUNK);
    const current = await prisma.housingComplex.findMany({
      where: { id: { in: chunk } },
      select: { id: true, households: true, dongCount: true, approvedDate: true, roadAddr: true },
    });
    const ops = current.map((c) => {
      const row = matches.get(c.id)!;
      return prisma.housingComplex.update({
        where: { id: c.id },
        data: {
          kaptCode: row.kaptCode,
          ...(row.saleType !== null ? { saleType: row.saleType } : {}),
          ...(row.heating !== null ? { heating: row.heating } : {}),
          ...(row.elevatorCount !== null ? { elevatorCount: row.elevatorCount } : {}),
          ...(c.households === null && row.households !== null ? { households: row.households } : {}),
          ...(c.dongCount === null && row.dongCount !== null ? { dongCount: row.dongCount } : {}),
          ...(c.approvedDate === null && row.approvedDate !== null ? { approvedDate: row.approvedDate } : {}),
          ...(c.roadAddr === null && row.roadAddr !== null ? { roadAddr: row.roadAddr } : {}),
        },
      });
    });
    for (let j = 0; j < ops.length; j += UPDATE_CHUNK) await prisma.$transaction(ops.slice(j, j + UPDATE_CHUNK));
    updated += ops.length;
  }
  await prisma.housingSync.create({ data: { kind: 'kapt', count: updated, sourceFile: meta.sourceFile } });
  return { updated };
};

// 매칭에 필요한 단지 열만 — 아파트 전부(rtms 단지 포함).
export const loadKaptMatchComplexes = (prisma: PrismaClient): Promise<KaptMatchComplex[]> =>
  prisma.housingComplex.findMany({
    where: { kind: 'apt' },
    select: { id: true, sggCd: true, umd: true, jibun: true, name: true, altNames: true, sido: true, sgg: true, roadAddr: true },
  });
