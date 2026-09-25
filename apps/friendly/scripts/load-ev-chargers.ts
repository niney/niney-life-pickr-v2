// 주차(/parking) — 전기차 충전소 적재. 환경공단 충전기 정보(15076352 getChargerInfo, 전국 ~52만 기, 9,999행 × ~53콜,
// 개발계정 일 1,000건)를 받아 충전소 단위로 접고 EvStation·EvCharger 전량 교체. 이후 상태는 서버 폴러(EV_STATUS_CRON)가 갱신.
//
// 실행: pnpm --filter friendly load:ev-chargers [옵션]
//   --dry-run        수집 + 정규화 리포트만(DB 쓰기 없음 — 업스트림 ~53콜은 나간다).
//   --zcode=11       시도 한 곳만(확인용 — 전량 교체라 다른 시도가 빠진다).
//   --max-pages=N    페이지 상한(확인용).

import { PrismaClient } from '@prisma/client';
import { ParkingApiError } from '../src/modules/parking/parking-api.adapter.js';
import { fetchAllEvChargers, normalizeEvChargerItems, replaceEvChargers } from '../src/modules/parking/ev-master.service.js';

const args = process.argv.slice(2);
const strOpt = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const DRY_RUN = args.includes('--dry-run');
const ZCODE = strOpt('zcode');
const MAX_PAGES = Number(strOpt('max-pages')) || undefined;

const prisma = new PrismaClient();
const n = (v: number): string => v.toLocaleString('ko-KR');

const main = async (): Promise<void> => {
  const key = process.env.DATA_GO_KR_API_KEY ?? '';
  if (!key) throw new Error('DATA_GO_KR_API_KEY 가 없습니다 — .env 확인.');
  console.log(`\n=== 전기차 충전소 적재 ${DRY_RUN ? '(--dry-run)' : ''}${ZCODE ? ` (zcode=${ZCODE})` : ''} ===`);
  const t0 = Date.now();
  const { items, totalCount, pages } = await fetchAllEvChargers({
    serviceKey: key,
    zcode: ZCODE,
    maxPages: MAX_PAGES,
    onPage: (p) => console.log(`  … ${p.pageNo}페이지 · ${n(p.fetched)}/${n(p.totalCount)}기`),
  });
  console.log(`업스트림: ${n(items.length)}기 / totalCount ${n(totalCount)} (${pages}콜, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  const rep = normalizeEvChargerItems(items);
  console.log(
    `정규화: 충전소 ${n(rep.stations.length)}곳 · 충전기 ${n(rep.chargers.length)}기 (삭제 표시 ${n(rep.droppedDeleted)} · 버스 전용 ${n(rep.droppedBusOnly)} · 좌표 없음 ${n(rep.droppedBadCoord)} · 식별자 없음 ${rep.droppedBadId} · 중복 ${rep.duplicates})`,
  );
  const fast = rep.stations.filter((s) => s.hasFast).length;
  const free = rep.stations.filter((s) => s.parkingFree === true).length;
  const avail = rep.stations.filter((s) => s.availableCount > 0).length;
  console.log(`  급속 보유 ${n(fast)}곳 · 주차료 무료 ${n(free)}곳 · 지금 사용 가능 ${n(avail)}곳`);
  if (DRY_RUN) {
    console.log('\n--dry-run — 적재 생략. 종료.');
    return;
  }
  const t1 = Date.now();
  const out = await replaceEvChargers(prisma, rep, {
    detail: { deleted: rep.droppedDeleted, busOnly: rep.droppedBusOnly, badCoord: rep.droppedBadCoord },
    baseDate: new Date().toLocaleDateString('en-CA'),
  });
  console.log(`\nEvStation ${n(out.stations)}곳 · EvCharger ${n(out.chargers)}기 전량 교체 (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
};

main()
  .catch((e) => {
    if (e instanceof ParkingApiError) console.error(`\n환경공단 API 실패(${e.code ?? e.statusCode}): ${e.message}`);
    else console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
