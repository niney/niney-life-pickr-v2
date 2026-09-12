// 일상지도 생활 업종 상가 적재 — 소상공인시장진흥공단 상가(상권)정보 분기 zip(시도별 CSV 16개, UTF-8 BOM,
// 39열, ~250만 행)을 스트리밍으로 읽어 관심 업종(@repo/utils lifeStoreKindOf, 9종)만 LifeStore 에 전량
// 교체한다. bus-master·life-map-master 와 같은 골격(정규화는 순수 함수 + 사유별 drop 리포트, 쓰기는 별도)
// 이되, 행을 전부 메모리에 올리지 않고 청크 단위로 트랜잭션 안에서 흘려 넣는다(경기 파일 하나가 350MB).
//
// 실측(2026-06 분기, 세종 15,816행): 열 수 불일치 0 · 좌표 결측 0. 상가업소번호는 전국 유일로 보되
// 파일 간 중복은 Set 으로 접는다.

import type { PrismaClient } from '@prisma/client';
import { lifeStoreKindOf, type LifeStoreKind } from '@repo/utils';

// WGS84 한국 범위 — 계약(lat 33~39, lng 124~132)과 동일. 밖이면 좌표 이상 drop.
const LAT_MIN = 33;
const LAT_MAX = 39;
const LNG_MIN = 124;
const LNG_MAX = 132;

// 한 트랜잭션 안의 createMany 청크 — 17열 × 1,000행 = 17,000 바인드(SQLite 상한 32,766 아래).
const CREATE_CHUNK = 1000;
// 120만 행 전량 교체 — 여유 있게.
const REPLACE_TX_TIMEOUT_MS = 60 * 60_000;

export const LIFE_STORE_REQUIRED_COLUMNS = [
  '상가업소번호',
  '상호명',
  '지점명',
  '상권업종대분류코드',
  '상권업종중분류코드',
  '상권업종소분류코드',
  '상권업종소분류명',
  '표준산업분류명',
  '시군구코드',
  '시군구명',
  '법정동명',
  '지번주소',
  '도로명주소',
  '건물명',
  '층정보',
  '경도',
  '위도',
] as const;

export interface LifeStoreRow {
  id: string;
  name: string;
  branch: string | null;
  kind: LifeStoreKind;
  mclsCd: string;
  sclsCd: string;
  sclsName: string;
  ksicName: string | null;
  sggCd: string;
  sggName: string;
  umdName: string | null;
  roadAddr: string | null;
  lotAddr: string | null;
  bldName: string | null;
  floor: string | null;
  lat: number;
  lng: number;
}

export type LifeStoreDropReason = 'width' | 'badId' | 'notInterested' | 'badCoord' | 'duplicate';

export interface LifeStoreNormalizeReport {
  rows: number;
  kept: number;
  dropped: Record<LifeStoreDropReason, number>;
  byKind: Record<LifeStoreKind, number>;
}

export const emptyLifeStoreReport = (): LifeStoreNormalizeReport => ({
  rows: 0,
  kept: 0,
  dropped: { width: 0, badId: 0, notInterested: 0, badCoord: 0, duplicate: 0 },
  byKind: { convenience: 0, mart: 0, pharmacy: 0, laundry: 0, vet: 0, beauty: 0, cafe: 0, food: 0, academy: 0 },
});

const strOrNull = (v: string | undefined): string | null => {
  const s = (v ?? '').trim();
  return s.length > 0 ? s : null;
};
const floatOrNull = (v: string | undefined): number | null => {
  const s = (v ?? '').trim();
  if (s.length === 0) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

// 헤더 → 필수 열 인덱스. 빠진 열이 있으면 던진다(분기 갱신에서 열이 바뀌면 여기서 잡힌다).
export const lifeStoreColumnIndex = (header: string[]): Record<(typeof LIFE_STORE_REQUIRED_COLUMNS)[number], number> => {
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    if (!idx.has(h.trim())) idx.set(h.trim(), i);
  });
  const missing = LIFE_STORE_REQUIRED_COLUMNS.filter((c) => !idx.has(c));
  if (missing.length > 0) throw new Error(`상가정보 CSV 필수 열 누락: ${missing.join(', ')}`);
  return Object.fromEntries(LIFE_STORE_REQUIRED_COLUMNS.map((c) => [c, idx.get(c)!])) as Record<
    (typeof LIFE_STORE_REQUIRED_COLUMNS)[number],
    number
  >;
};

export type LifeStoreColumnIndex = ReturnType<typeof lifeStoreColumnIndex>;

// 한 행 정규화 — 관심 업종만 채택. seen 은 파일 간 중복 접기(호출자가 전체 적재 동안 하나를 유지).
export const normalizeLifeStoreRow = (
  cells: string[],
  col: LifeStoreColumnIndex,
  width: number,
  seen: Set<string>,
  report: LifeStoreNormalizeReport,
): LifeStoreRow | null => {
  report.rows += 1;
  if (cells.length !== width) {
    report.dropped.width += 1;
    return null;
  }
  const at = (name: (typeof LIFE_STORE_REQUIRED_COLUMNS)[number]): string | undefined => cells[col[name]];
  const kind = lifeStoreKindOf(at('상권업종대분류코드'), at('상권업종중분류코드'), at('상권업종소분류코드'));
  if (!kind) {
    report.dropped.notInterested += 1;
    return null;
  }
  const id = (at('상가업소번호') ?? '').trim();
  const name = (at('상호명') ?? '').trim();
  const sggCd = (at('시군구코드') ?? '').trim();
  if (id.length === 0 || name.length === 0 || sggCd.length === 0) {
    report.dropped.badId += 1;
    return null;
  }
  const lat = floatOrNull(at('위도'));
  const lng = floatOrNull(at('경도'));
  if (lat === null || lng === null || lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) {
    report.dropped.badCoord += 1;
    return null;
  }
  if (seen.has(id)) {
    report.dropped.duplicate += 1;
    return null;
  }
  seen.add(id);
  report.kept += 1;
  report.byKind[kind] += 1;
  return {
    id,
    name,
    branch: strOrNull(at('지점명')),
    kind,
    mclsCd: (at('상권업종중분류코드') ?? '').trim(),
    sclsCd: (at('상권업종소분류코드') ?? '').trim(),
    sclsName: (at('상권업종소분류명') ?? '').trim(),
    ksicName: strOrNull(at('표준산업분류명')),
    sggCd,
    sggName: (at('시군구명') ?? '').trim(),
    umdName: strOrNull(at('법정동명')),
    roadAddr: strOrNull(at('도로명주소')),
    lotAddr: strOrNull(at('지번주소')),
    bldName: strOrNull(at('건물명')),
    floor: strOrNull(at('층정보')),
    lat,
    lng,
  };
};

export interface LifeStoreReplaceMeta {
  sourceFile: string;
  // 분기 기준일 'YYYY-MM-DD'.
  baseDate: string | null;
}

// 전량 교체 — rows 를 청크 배열의 비동기 이터러블로 받아(스트리밍) 한 트랜잭션 안에서 delete → createMany
// 반복 → 적재 이력. 중간에 실패하면 롤백돼 이전 적재본이 남는다.
export const replaceLifeStores = async (
  prisma: PrismaClient,
  chunks: AsyncIterable<LifeStoreRow[]>,
  meta: LifeStoreReplaceMeta,
  onProgress?: (inserted: number) => void,
): Promise<number> => {
  let inserted = 0;
  await prisma.$transaction(
    async (tx) => {
      await tx.lifeStore.deleteMany({});
      for await (const chunk of chunks) {
        for (let i = 0; i < chunk.length; i += CREATE_CHUNK) {
          const part = chunk.slice(i, i + CREATE_CHUNK);
          await tx.lifeStore.createMany({ data: part });
          inserted += part.length;
        }
        onProgress?.(inserted);
      }
      await tx.lifeMasterSync.create({
        data: { layer: 'store', count: inserted, geocoded: null, baseDate: meta.baseDate, sourceFile: meta.sourceFile },
      });
    },
    { timeout: REPLACE_TX_TIMEOUT_MS, maxWait: 60_000 },
  );
  return inserted;
};
