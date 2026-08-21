// 일상지도 — 화장실 지오코딩 캐시(LifeGeocodeCache) 가져오기(export:life-geocode 의 짝).
//
// 실행: pnpm --filter friendly import:life-geocode [json|json.gz 경로] [--overwrite]
//   경로 생략 시 저장소에 커밋된 압축본(src/modules/life-map/data/life-geocode-cache.json.gz).
//   기본: 없는 키만 추가(이 서버가 따로 쌓은 결과는 보존). --overwrite: 파일 값으로 갱신.
// 이어서: pnpm --filter friendly load:life-toilets <csv> --offline (업스트림 호출 없이 적재)

import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  LIFE_GEOCODE_BUNDLED_RELATIVE,
  importGeocodeCache,
  readGeocodeCacheFile,
} from '../src/modules/life-map/life-map-geocode-cache.service.js';

const args = process.argv.slice(2);
const OVERWRITE = args.includes('--overwrite');
const path = resolve(args.find((a) => !a.startsWith('--')) ?? LIFE_GEOCODE_BUNDLED_RELATIVE);
const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const data = readGeocodeCacheFile(path);
  console.log(`파일: ${path} — ${data.count}건(내보낸 시각 ${data.exportedAt})`);
  const report = await importGeocodeCache(prisma, data, { overwrite: OVERWRITE });
  console.log(`가져오기 완료: 추가 ${report.inserted} · 갱신 ${report.updated} · 건너뜀 ${report.skipped}${OVERWRITE ? ' (--overwrite)' : ''}`);
  console.log('다음: pnpm --filter friendly load:life-toilets <csv> --offline');
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
