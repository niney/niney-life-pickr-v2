// 지오코딩 캐시(LifeGeocodeCache) 내보내기/가져오기 — 운영 DB 가 따로 있어 dev.db 를 복사할 수
// 없는 환경에서, 로컬에서 끝낸 VWorld 지오코딩 결과(수만 행, JSON 수 MB)만 옮겨 서버는
// `load:life-toilets <csv> --offline` 으로 호출 0건에 적재하게 한다(일 한도 회피).
//
// 파일 형식은 단순 JSON(버전 필드 포함) — 사람이 열어 볼 수 있고 의존성이 없다. 저장소에는 gzip
// 압축본(.gz, 수 MB → 1~2MB)을 추적 경로(src/modules/life-map/data/)에 커밋해 서버가 git pull 만으로
// 받게 한다(결정 2026-08-21). 경로가 .gz 로 끝나거나 gzip 매직 바이트면 자동으로 풀어 읽는다.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { PrismaClient } from '@prisma/client';

export const LIFE_GEOCODE_EXPORT_VERSION = 1;
// 저장소에 커밋하는 압축본의 모듈 기준 상대 경로(스크립트가 기본값으로 쓴다).
export const LIFE_GEOCODE_BUNDLED_RELATIVE = 'src/modules/life-map/data/life-geocode-cache.json.gz';

export interface GeocodeCacheExportEntry {
  type: 'road' | 'parcel';
  address: string;
  status: 'ok' | 'notfound';
  lat: number | null;
  lng: number | null;
  refined: string | null;
  checkedAt: string;
}

export interface GeocodeCacheExport {
  version: typeof LIFE_GEOCODE_EXPORT_VERSION;
  exportedAt: string;
  count: number;
  entries: GeocodeCacheExportEntry[];
}

export const exportGeocodeCache = async (prisma: PrismaClient, now: Date = new Date()): Promise<GeocodeCacheExport> => {
  const rows = await prisma.lifeGeocodeCache.findMany({ orderBy: [{ type: 'asc' }, { address: 'asc' }] });
  const entries: GeocodeCacheExportEntry[] = rows.map((r) => ({
    type: r.type === 'parcel' ? 'parcel' : 'road',
    address: r.address,
    status: r.status === 'ok' ? 'ok' : 'notfound',
    lat: r.lat,
    lng: r.lng,
    refined: r.refined,
    checkedAt: r.checkedAt.toISOString(),
  }));
  return { version: LIFE_GEOCODE_EXPORT_VERSION, exportedAt: now.toISOString(), count: entries.length, entries };
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// 파일 내용 검증 — 버전·항목 형태가 맞아야 한다. 이상한 항목은 건너뛰지 않고 전체를 거절(조용한
// 부분 적재보다 낫다).
export const parseGeocodeCacheExport = (raw: unknown): GeocodeCacheExport => {
  if (!isRecord(raw) || raw.version !== LIFE_GEOCODE_EXPORT_VERSION || !Array.isArray(raw.entries)) {
    throw new Error(`지오코딩 캐시 파일 형식이 아닙니다(version ${LIFE_GEOCODE_EXPORT_VERSION} 필요).`);
  }
  const entries: GeocodeCacheExportEntry[] = raw.entries.map((e, i) => {
    if (!isRecord(e)) throw new Error(`entries[${i}] 가 객체가 아닙니다.`);
    const type = e.type === 'road' || e.type === 'parcel' ? e.type : null;
    const status = e.status === 'ok' || e.status === 'notfound' ? e.status : null;
    if (!type || !status || typeof e.address !== 'string' || e.address.length === 0) {
      throw new Error(`entries[${i}] 의 type/status/address 가 올바르지 않습니다.`);
    }
    const lat = numOrNull(e.lat);
    const lng = numOrNull(e.lng);
    if (status === 'ok' && (lat === null || lng === null)) throw new Error(`entries[${i}] 은 ok 인데 좌표가 없습니다.`);
    const checkedAt = typeof e.checkedAt === 'string' && !Number.isNaN(Date.parse(e.checkedAt)) ? e.checkedAt : new Date(0).toISOString();
    return {
      type,
      address: e.address,
      status,
      lat: status === 'ok' ? lat : null,
      lng: status === 'ok' ? lng : null,
      refined: typeof e.refined === 'string' ? e.refined : null,
      checkedAt,
    };
  });
  return {
    version: LIFE_GEOCODE_EXPORT_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date(0).toISOString(),
    count: entries.length,
    entries,
  };
};

// 파일 쓰기 — .gz 면 gzip(level 9), 아니면 평문 JSON. 디렉터리는 만들어 준다. 반환은 기록 바이트.
export const writeGeocodeCacheFile = (path: string, data: GeocodeCacheExport): number => {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const buf = path.endsWith('.gz') ? gzipSync(json, { level: 9 }) : json;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  return buf.length;
};

// 파일 읽기 — 확장자 또는 gzip 매직 바이트(1f 8b)로 압축을 판별해 풀고 형식 검증까지.
export const readGeocodeCacheFile = (path: string): GeocodeCacheExport => {
  let buf = readFileSync(path);
  if (path.endsWith('.gz') || (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b)) buf = gunzipSync(buf);
  return parseGeocodeCacheExport(JSON.parse(buf.toString('utf8')));
};

export interface GeocodeCacheImportReport {
  inserted: number;
  updated: number;
  skipped: number;
}

const IMPORT_CHUNK = 400;

// 가져오기 — 기본은 없는 키만 추가(서버가 따로 쌓은 결과를 덮지 않는다), --overwrite 면 파일 값으로
// 갱신. 청크 단위로 기존 키를 조회해 createMany(신규) / update(덮어쓰기) 로 나눈다.
export const importGeocodeCache = async (
  prisma: PrismaClient,
  data: GeocodeCacheExport,
  opts: { overwrite?: boolean } = {},
): Promise<GeocodeCacheImportReport> => {
  const report: GeocodeCacheImportReport = { inserted: 0, updated: 0, skipped: 0 };
  // 파일 안 중복 키는 뒤 항목이 이긴다.
  const byKey = new Map<string, GeocodeCacheExportEntry>();
  for (const e of data.entries) byKey.set(`${e.type}|${e.address}`, e);
  const entries = [...byKey.values()];
  for (let i = 0; i < entries.length; i += IMPORT_CHUNK) {
    const chunk = entries.slice(i, i + IMPORT_CHUNK);
    const existing = await prisma.lifeGeocodeCache.findMany({
      where: { OR: chunk.map((e) => ({ type: e.type, address: e.address })) },
      select: { type: true, address: true },
    });
    const existingKeys = new Set(existing.map((r) => `${r.type}|${r.address}`));
    const fresh = chunk.filter((e) => !existingKeys.has(`${e.type}|${e.address}`));
    const dup = chunk.filter((e) => existingKeys.has(`${e.type}|${e.address}`));
    if (fresh.length > 0) {
      await prisma.lifeGeocodeCache.createMany({
        data: fresh.map((e) => ({
          type: e.type,
          address: e.address,
          status: e.status,
          lat: e.lat,
          lng: e.lng,
          refined: e.refined,
          checkedAt: new Date(e.checkedAt),
        })),
      });
      report.inserted += fresh.length;
    }
    if (dup.length > 0) {
      if (opts.overwrite) {
        await prisma.$transaction(
          dup.map((e) =>
            prisma.lifeGeocodeCache.update({
              where: { type_address: { type: e.type, address: e.address } },
              data: { status: e.status, lat: e.lat, lng: e.lng, refined: e.refined, checkedAt: new Date(e.checkedAt) },
            }),
          ),
        );
        report.updated += dup.length;
      } else {
        report.skipped += dup.length;
      }
    }
  }
  return report;
};
