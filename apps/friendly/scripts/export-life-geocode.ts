// 일상지도 — 화장실 지오코딩 캐시(LifeGeocodeCache) 내보내기. 로컬에서 끝낸 VWorld 결과를 저장소에
// gzip 압축본으로 커밋해, 운영 서버가 git pull 뒤 `import:life-geocode` → `load:life-toilets <csv>
// --offline` 으로 호출 0건에 적재하게 한다(운영 DB 가 별도라 dev.db 복사 불가 — 결정 2026-08-21).
//
// 실행: pnpm --filter friendly export:life-geocode [출력 경로]
//   기본 출력: src/modules/life-map/data/life-geocode-cache.json.gz (추적 경로 — 커밋 대상)
//   경로가 .gz 로 끝나면 gzip, 아니면 평문 JSON. 재지오코딩 뒤 다시 실행해 갱신한다.

import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  LIFE_GEOCODE_BUNDLED_RELATIVE,
  exportGeocodeCache,
  writeGeocodeCacheFile,
} from '../src/modules/life-map/life-map-geocode-cache.service.js';

const out = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? LIFE_GEOCODE_BUNDLED_RELATIVE);
const prisma = new PrismaClient();

const main = async (): Promise<void> => {
  const data = await exportGeocodeCache(prisma);
  const bytes = writeGeocodeCacheFile(out, data);
  const ok = data.entries.filter((e) => e.status === 'ok').length;
  console.log(
    `지오코딩 캐시 내보내기: ${data.count}건(좌표 ${ok} · notfound ${data.count - ok}) → ${out} (${(bytes / 1024 / 1024).toFixed(2)}MB${out.endsWith('.gz') ? ', gzip' : ''})`,
  );
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
