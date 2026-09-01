// 집값 — 공동주택 공시가격(국토교통부 주택 공시가격 정보 파일, data.go.kr 3073746) 적재.
// 호별 1,558만 행 CSV(zip 안 3.4GB)를 스트리밍으로 읽어 아파트 단지 × 면적 구간으로 접고(PNU 매칭)
// HousingComplexPrice 에 전량 교체한다. 도로명주소도 단지에 채운다(roadAddr 가 빈 단지만).
//
// 실행: pnpm --filter friendly load:housing-prices [zip|csv] [옵션]
//   경로              기본 <리포>/data/open/housing/gongsi-2025.zip (zip 은 풀지 않고 바로 읽는다)
//   --dry-run         집계·매칭 리포트만(DB 쓰기 없음)
//   --limit-rows=N    앞 N행만(확인용 — 결과는 부분 집계)
// 연 1회 갱신(매년 4월 말 공시 → 포털 파일은 그 뒤). 파일을 새로 받으면 다시 실행하면 된다.

import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  aggregateGongsi,
  iterateLines,
  openGongsiStream,
  replaceHousingComplexPrices,
} from '../src/modules/housing/housing-price-master.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../../data/open/housing');

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const numOpt = (name: string): number | undefined => {
  const raw = args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
const DRY_RUN = flag('dry-run');
const LIMIT_ROWS = numOpt('limit-rows');
const path = args.find((a) => !a.startsWith('--')) ?? resolve(DATA_DIR, 'gongsi-2025.zip');

const prisma = new PrismaClient();
const fmt = (n: number): string => n.toLocaleString('ko-KR');

const main = async (): Promise<void> => {
  console.log(`\n=== 집값 공시가격 적재 ${DRY_RUN ? '(--dry-run)' : ''}${LIMIT_ROWS !== undefined ? ` (--limit-rows=${LIMIT_ROWS})` : ''} ===`);
  const complexes = await prisma.housingComplex.findMany({
    where: { kind: 'apt' },
    select: { id: true, pnu: true, bjdCd: true, name: true, altNames: true },
  });
  if (complexes.length === 0) {
    console.error('단지 마스터가 비어 있습니다 — load:housing-complexes 먼저.');
    process.exitCode = 1;
    return;
  }
  const { stream, description } = await openGongsiStream(path);
  console.log(`파일: ${description} · 단지 ${fmt(complexes.length)}(PNU 보유 ${fmt(complexes.filter((c) => c.pnu).length)})`);

  const t0 = Date.now();
  const { aggregates, report } = await aggregateGongsi(iterateLines(stream), {
    complexes,
    limitRows: LIMIT_ROWS,
    onProgress: (p) => console.log(`  … ${fmt(p.rows)}행 · 매칭 ${fmt(p.matched)} (${((Date.now() - t0) / 60_000).toFixed(1)}m)`),
  });
  console.log(
    `\n읽음 ${fmt(report.rows)}행 → 아파트 단지에 붙은 호 ${fmt(report.matchedRows)}(PNU ${fmt(report.matchedByPnuRows)} · 법정동+단지명 ${fmt(report.matchedByNameRows)}) · 값 이상 ${fmt(report.badRows)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
  console.log(
    `단지: ${fmt(report.complexes)}개 집계(PNU ${fmt(report.complexesByPnu)} · 이름만 ${fmt(report.complexesByNameOnly)}) · PNU 있는데 미매칭 ${fmt(report.complexesUnmatched)} · 도로명주소 확보 ${fmt(report.roadAddrs)} · 기준연도 ${report.year ?? '-'}`,
  );
  console.log(`구간별 호수: 60㎡↓ ${fmt(report.byBand.b1)} · 60~85 ${fmt(report.byBand.b2)} · 85~135 ${fmt(report.byBand.b3)} · 135↑ ${fmt(report.byBand.b4)}`);
  if (report.rows > 0) {
    const pnuRate = ((report.complexes / Math.max(1, complexes.filter((c) => c.pnu).length)) * 100).toFixed(1);
    console.log(`PNU 매칭률(단지 기준): ${pnuRate}% — 낮으면 특수지코드→PNU 자리 매핑을 의심(housing-price-master.service 주석).`);
  }
  if (DRY_RUN) {
    console.log('\n--dry-run — DB 쓰기 생략. 종료.');
    return;
  }
  if (report.year === null) {
    console.error('기준연도를 읽지 못해 적재하지 않습니다.');
    process.exitCode = 1;
    return;
  }
  const t1 = Date.now();
  const w = await replaceHousingComplexPrices(prisma, aggregates, { sourceFile: basename(path), year: report.year });
  console.log(
    `\nHousingComplexPrice 전량 교체: 단지 ${fmt(w.complexes)} · 행 ${fmt(w.rows)} · 도로명주소 채움 ${fmt(w.roadAddrUpdated)} + 적재 이력(HousingSync prices) (${((Date.now() - t1) / 1000).toFixed(1)}s)`,
  );
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
