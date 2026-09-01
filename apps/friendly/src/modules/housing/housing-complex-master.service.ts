// 집값 단지 마스터 적재 — 한국부동산원 공동주택 단지 식별정보 기본정보 CSV(data.go.kr 15106861)를
// 정규화해 HousingComplex 에 전량 교체 적재한다(life-map-master.service 와 같은 "정규화는 순수 함수 +
// 사유별 drop 리포트, 쓰기는 별도 함수" 골격).
//
// 실측(2025-09-18 배포본): 307,408행, UTF-8 BOM, 열 10개 — 단지고유번호·필지고유번호(PNU 19자리)·
// 주소(지번)·단지명_공시가격·단지명_건축물대장·단지명_도로명주소·단지종류(1 아파트 45,920 / 2 연립
// 24,033 / 3 다세대 237,454)·동수·세대수·사용승인일. 시군구 252, 중복 id 0. 좌표 열이 없어 지번 주소를
// VWorld 지오코더로 변환한다(로더가 life-map-geocode.service 를 호출, LifeGeocodeCache 공유).
// 단지명 이력 CSV(15106867: 단지고유번호·변경년도·변경전단지명·변경후단지명)는 altNames 로 접는다.

import type { PrismaClient } from '@prisma/client';
import { housingComplexKindOfCode, type HousingComplexKind } from '@repo/utils';
import { csvColumnIndex } from '../../lib/csv.js';

const CREATE_CHUNK = 500;
const REPLACE_TX_TIMEOUT_MS = 15 * 60_000;

export const HOUSING_COMPLEX_REQUIRED_COLUMNS = [
  '단지고유번호',
  '필지고유번호',
  '주소',
  '단지명_공시가격',
  '단지명_건축물대장',
  '단지명_도로명주소',
  '단지종류',
  '동수',
  '세대수',
  '사용승인일',
] as const;
export const HOUSING_NAME_HISTORY_COLUMNS = ['단지고유번호', '변경년도', '변경전단지명', '변경후단지명'] as const;

// CSV 바이트 → 문자열. BOM 이면 UTF-8, 아니면 CP949 를 시도해 헤더에 '단지고유번호' 가 보이면 채택.
export const decodeHousingCsv = (buf: Uint8Array): string => {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf);
  }
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (utf8.slice(0, 2000).includes('단지고유번호')) return utf8;
  const eucKr = new TextDecoder('euc-kr').decode(buf);
  return eucKr.slice(0, 2000).includes('단지고유번호') ? eucKr : utf8;
};

const strOrNull = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : null;
};
const intOrNull = (v: string | undefined): number | null => {
  const s = (v ?? '').trim().replace(/,/g, '');
  if (!/^-?\d+(\.0+)?$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};
// 'YYYY-MM-DD' 정규화 — 'YYYYMMDD'·'YYYY.MM.DD' 허용.
const dateOrNull = (v: string | undefined): string | null => {
  const m = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})/.exec((v ?? '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

const requireColumns = (header: string[], names: readonly string[]): Map<string, number> => {
  const idx = csvColumnIndex(header);
  const missing = names.filter((n) => !idx.has(n));
  if (missing.length > 0) {
    throw new Error(`CSV 헤더에 필요한 열이 없습니다: ${missing.join(', ')} (헤더: ${header.slice(0, 8).join(', ')}…)`);
  }
  return idx;
};

// ── 주소 분해 ─────────────────────────────────────────────────────────────────
// '서울특별시 종로구 청운동 56-45' / '경기도 성남시 분당구 정자동 1' / '세종특별자치시 조치원읍 신흥리 1'
// / '서울특별시 종로구 종로1가 1'. 마지막 토큰이 지번(산 접두 허용)이면 jibun, 첫 토큰이 sido, 그 사이
// 에서 시·군·구로 끝나는 선행 토큰이 sgg(공백 join, 세종처럼 없으면 ''), 나머지가 umd('조치원읍 신흥리').
export interface HousingParsedAddress {
  sido: string;
  sgg: string;
  umd: string;
  jibun: string | null;
}
const JIBUN_RE = /^산?\d+(-\d+)?$/;
const SGG_TOKEN_RE = /(시|군|구)$/;
export const parseHousingAddress = (addr: string): HousingParsedAddress | null => {
  const tokens = addr.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (tokens.length < 2) return null;
  let jibun: string | null = null;
  if (JIBUN_RE.test(tokens[tokens.length - 1]!)) jibun = tokens.pop()!;
  if (tokens.length < 2) return null;
  const sido = tokens[0]!;
  const rest = tokens.slice(1);
  const sggTokens: string[] = [];
  while (rest.length > 1 && SGG_TOKEN_RE.test(rest[0]!)) sggTokens.push(rest.shift()!);
  const umd = rest.join(' ');
  if (!umd) return null;
  return { sido, sgg: sggTokens.join(' '), umd, jibun };
};

// ── 정규화 ────────────────────────────────────────────────────────────────────
export interface HousingComplexRow {
  id: string;
  source: 'reb';
  pnu: string;
  name: string;
  altNames: string | null;
  kind: HousingComplexKind;
  addr: string;
  sido: string;
  sgg: string;
  umd: string;
  jibun: string | null;
  sggCd: string;
  bjdCd: string;
  dongCount: number | null;
  households: number | null;
  approvedDate: string | null;
  // 지오코딩 결과 — 정규화 단계에서는 항상 null.
  lat: number | null;
  lng: number | null;
  geoSource: 'road' | 'parcel' | null;
  baseDate: string;
}

export interface HousingComplexReport {
  rows: HousingComplexRow[];
  byKind: Map<string, number>;
  bySido: Map<string, number>;
  droppedWidth: number;
  droppedBadId: number;
  droppedBadAddr: { id: string; addr: string }[];
  droppedNoName: number;
  // 대상 종류가 아니어서 건너뛴 행(연립·다세대 등).
  skippedKind: number;
  duplicates: number;
}

// 단지명 이력 CSV → id → 이름 목록(변경전·후, 빈 값 제외, 순서 유지).
export const parseHousingNameHistory = (header: string[], rows: string[][]): Map<string, string[]> => {
  const idx = requireColumns(header, HOUSING_NAME_HISTORY_COLUMNS);
  const out = new Map<string, string[]>();
  for (const row of rows) {
    const id = strOrNull(row[idx.get('단지고유번호')!]);
    if (!id) continue;
    const list = out.get(id) ?? [];
    for (const name of [strOrNull(row[idx.get('변경전단지명')!]), strOrNull(row[idx.get('변경후단지명')!])]) {
      if (name && !list.includes(name)) list.push(name);
    }
    out.set(id, list);
  }
  return out;
};

export interface NormalizeHousingComplexOptions {
  kinds?: readonly HousingComplexKind[];
  nameHistory?: Map<string, string[]>;
  // 단지 마스터 기준일 'YYYY-MM-DD'(배포본 날짜).
  baseDate: string;
}

export const normalizeHousingComplexRows = (
  header: string[],
  rows: string[][],
  opts: NormalizeHousingComplexOptions,
): HousingComplexReport => {
  const idx = requireColumns(header, HOUSING_COMPLEX_REQUIRED_COLUMNS);
  const col = (row: string[], name: string): string | undefined => row[idx.get(name)!];
  const kinds = new Set<HousingComplexKind>(opts.kinds ?? ['apt']);
  const report: HousingComplexReport = {
    rows: [],
    byKind: new Map(),
    bySido: new Map(),
    droppedWidth: 0,
    droppedBadId: 0,
    droppedBadAddr: [],
    droppedNoName: 0,
    skippedKind: 0,
    duplicates: 0,
  };
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.length !== header.length) {
      report.droppedWidth += 1;
      continue;
    }
    const kind = housingComplexKindOfCode(col(row, '단지종류'));
    if (!kind || !kinds.has(kind)) {
      report.skippedKind += 1;
      continue;
    }
    const id = strOrNull(col(row, '단지고유번호'));
    const pnu = strOrNull(col(row, '필지고유번호'));
    if (!id || !pnu || !/^\d{19}$/.test(pnu)) {
      report.droppedBadId += 1;
      continue;
    }
    if (seen.has(id)) {
      report.duplicates += 1;
      continue;
    }
    const addr = strOrNull(col(row, '주소'));
    const parsed = addr ? parseHousingAddress(addr) : null;
    if (!addr || !parsed) {
      if (report.droppedBadAddr.length < 50) report.droppedBadAddr.push({ id, addr: addr ?? '' });
      else report.droppedBadAddr.push({ id, addr: '' });
      continue;
    }
    const names = [col(row, '단지명_공시가격'), col(row, '단지명_건축물대장'), col(row, '단지명_도로명주소')]
      .map((n) => strOrNull(n)?.replace(/\|/g, '/') ?? null)
      .filter((n): n is string => n !== null);
    const name = names[0];
    if (!name) {
      report.droppedNoName += 1;
      continue;
    }
    seen.add(id);
    const alt: string[] = [];
    for (const n of [...names.slice(1), ...(opts.nameHistory?.get(id) ?? [])]) {
      const cleaned = n.replace(/\|/g, '/').trim();
      if (cleaned && cleaned !== name && !alt.includes(cleaned)) alt.push(cleaned);
    }
    report.rows.push({
      id,
      source: 'reb',
      pnu,
      name,
      altNames: alt.length > 0 ? alt.join('|') : null,
      kind,
      addr,
      sido: parsed.sido,
      sgg: parsed.sgg,
      umd: parsed.umd,
      jibun: parsed.jibun,
      sggCd: pnu.slice(0, 5),
      bjdCd: pnu.slice(0, 10),
      dongCount: intOrNull(col(row, '동수')),
      households: intOrNull(col(row, '세대수')),
      approvedDate: dateOrNull(col(row, '사용승인일')),
      lat: null,
      lng: null,
      geoSource: null,
      baseDate: opts.baseDate,
    });
    report.byKind.set(kind, (report.byKind.get(kind) ?? 0) + 1);
    report.bySido.set(parsed.sido, (report.bySido.get(parsed.sido) ?? 0) + 1);
  }
  return report;
};

export interface HousingReplaceMeta {
  sourceFile: string | null;
  baseDate: string | null;
}

// 전량 교체 — 한 인터랙티브 트랜잭션 안에서 통계·단지(rtms 포함 — 파생 재구축이 다시 만든다)를 비우고,
// 거래의 단지 연결을 끊고, 청크로 넣고, 적재 이력을 기록한다(중간 상태 노출 없음).
//
// 보강 컬럼 이어받기: 같은 id(단지고유번호)의 기존 행이 있으면 K-apt(kaptCode·saleType·heating·elevatorCount)·
// 건축물대장(parkingCount·floorsMax·structure·buildingFetchedAt)·도로명주소·좌표(새 행이 비었을 때만)를 그대로
// 옮긴다 — 마스터 CSV 를 새로 받아 재적재해도 며칠치 API 쿼터로 채운 보강과 좌표 보완이 사라지지 않게.
// 공시가격 표(HousingComplexPrice)는 id 기준이라 지우지 않는다.
const CARRY_OVER_SELECT = {
  id: true,
  kaptCode: true,
  saleType: true,
  heating: true,
  elevatorCount: true,
  roadAddr: true,
  parkingCount: true,
  floorsMax: true,
  structure: true,
  buildingFetchedAt: true,
  lat: true,
  lng: true,
  geoSource: true,
} as const;

export const replaceHousingComplexes = async (
  prisma: PrismaClient,
  rows: HousingComplexRow[],
  meta: HousingReplaceMeta,
): Promise<{ count: number; geocoded: number; carriedOver: number }> => {
  let carriedOver = 0;
  await prisma.$transaction(
    async (tx) => {
      const prev = new Map(
        (await tx.housingComplex.findMany({ where: { source: 'reb' }, select: CARRY_OVER_SELECT })).map((p) => [p.id, p]),
      );
      const data = rows.map((r) => {
        const p = prev.get(r.id);
        if (!p) return r;
        carriedOver += 1;
        const keepCoords = r.lat === null && p.lat !== null && p.lng !== null;
        return {
          ...r,
          kaptCode: p.kaptCode,
          saleType: p.saleType,
          heating: p.heating,
          elevatorCount: p.elevatorCount,
          roadAddr: p.roadAddr,
          parkingCount: p.parkingCount,
          floorsMax: p.floorsMax,
          structure: p.structure,
          buildingFetchedAt: p.buildingFetchedAt,
          lat: keepCoords ? p.lat : r.lat,
          lng: keepCoords ? p.lng : r.lng,
          geoSource: keepCoords ? p.geoSource : r.geoSource,
        };
      });
      const geocoded = data.filter((r) => r.lat !== null && r.lng !== null).length;
      await tx.housingComplexStat.deleteMany({});
      await tx.housingComplex.deleteMany({});
      await tx.housingTrade.updateMany({ where: { complexId: { not: null } }, data: { complexId: null } });
      for (let i = 0; i < data.length; i += CREATE_CHUNK) {
        await tx.housingComplex.createMany({ data: data.slice(i, i + CREATE_CHUNK) });
      }
      await tx.housingSync.create({
        data: { kind: 'complex', count: data.length, geocoded, baseDate: meta.baseDate, sourceFile: meta.sourceFile },
      });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
  const geocoded = await prisma.housingComplex.count({ where: { source: 'reb', lat: { not: null } } });
  return { count: rows.length, geocoded, carriedOver };
};
