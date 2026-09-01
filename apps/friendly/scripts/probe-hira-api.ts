// 심평원 병원정보서비스(data.go.kr 15001698) 프로브.
//
// 코드에 박힌 추정들을 실응답으로 확정하기 위한 1회성 진단 스크립트:
//   ① 키 등록 확인 — 활용신청 승인 직후엔 게이트웨이 반영까지 수십 분 걸린다(30 이면 대기)
//   ② _type=json 지원 여부(어댑터가 JSON 전제)
//   ③ numOfRows=1000 허용 여부(적재 페이지 크기) + totalCount(전국 기관 수)
//   ④ 응답 필드 인벤토리 — XPos/YPos·sidoCdNm 유무, 좌표 결측률(표본 2,000행)
//   ⑤ ykiho 길이 분포(계약 id max 200 검증) + clCdNm 종별 분포
//
// 실행: pnpm --filter friendly probe:hira
// 덤프: apps/friendly/data/hira-probe/<step>.json (gitignore 됨)
// 총 호출 ~4건 — 개발계정 일 10,000건 한도에 안전.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeLifeHospitalCategory } from '@repo/utils';
import { HiraApiAuthError, HiraApiError, fetchHiraHospPage } from '../src/modules/life-map/hira-hospital.adapter.js';
import { normalizeLifeHospitalRows } from '../src/modules/life-map/life-map-hospital-master.service.js';

// env.ts 전체 검증(DATABASE_URL 등)은 프로브에 불필요 — 키만 직접 읽는다.
const KEY = process.env.DATA_GO_KR_API_KEY ?? '';

const DUMP_DIR = join(process.cwd(), 'data', 'hira-probe');
const dump = async (step: string, data: unknown): Promise<void> => {
  await writeFile(join(DUMP_DIR, `${step}.json`), JSON.stringify(data, null, 2), 'utf-8');
};

const main = async (): Promise<void> => {
  if (!KEY) {
    console.error('DATA_GO_KR_API_KEY가 없습니다 — .env 확인.');
    process.exitCode = 1;
    return;
  }
  await mkdir(DUMP_DIR, { recursive: true });
  console.log('\n=== 심평원 병원정보서비스 프로브 ===');

  // ① + ② 최소 호출 — JSON 파싱까지 어댑터가 하므로 성공 자체가 _type=json 지원 증거.
  console.log('\n[①②] 키 등록·JSON 지원 — numOfRows=3');
  let totalCount = 0;
  try {
    const p = await fetchHiraHospPage({ pageNo: 1, numOfRows: 3 }, { serviceKey: KEY });
    totalCount = p.totalCount;
    console.log(`  OK — totalCount ${p.totalCount.toLocaleString('ko-KR')}, 표본 ${p.items.length}행`);
    await dump('01-small-page', p);
  } catch (e) {
    if (e instanceof HiraApiAuthError) {
      console.error(`  인증 실패(${e.code}): ${e.message}`);
      if (e.code === '30') {
        console.error('  → 활용신청 승인 직후라면 게이트웨이 반영 대기(수십 분). 계정이 .env 키와 같은지도 확인.');
      }
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  // ③ 페이지 크기 1000.
  console.log('\n[③] numOfRows=1000 허용 여부');
  const big = await fetchHiraHospPage({ pageNo: 1, numOfRows: 1000 }, { serviceKey: KEY });
  console.log(`  ${big.items.length}행 수신 → ${big.items.length === 1000 ? '1000 허용' : `상한 ${big.items.length}?`}`);
  const est = Math.ceil(totalCount / Math.max(1, big.items.length));
  console.log(`  전량 적재 예상 ${est}콜 (일 한도 10,000)`);

  // ④⑤ 표본 2페이지(2,000행) 분석.
  console.log('\n[④⑤] 필드 인벤토리·좌표 결측률·ykiho 길이·종별 분포 (표본 2,000행)');
  const page2 = await fetchHiraHospPage({ pageNo: 2, numOfRows: 1000 }, { serviceKey: KEY });
  const sample = [...big.items, ...page2.items];
  const fieldCount = new Map<string, number>();
  for (const it of sample) for (const k of Object.keys(it)) fieldCount.set(k, (fieldCount.get(k) ?? 0) + 1);
  console.log('  필드(출현 행수):');
  for (const [k, n] of [...fieldCount.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${n}`);

  const report = normalizeLifeHospitalRows(sample);
  const coordPct = ((1 - report.coordMissing / Math.max(1, sample.length)) * 100).toFixed(1);
  console.log(`  정규화 채택 ${report.rows.length}행 (badId ${report.droppedBadId} · 중복 ${report.duplicates})`);
  console.log(`  좌표 보유 ${coordPct}% (결측 ${report.coordMissing}행 — 지오코딩 보완 대상)`);
  const idLens = report.rows.map((r) => r.id.length);
  console.log(`  ykiho 길이 min ${Math.min(...idLens)} / max ${Math.max(...idLens)} (계약 상한 200)`);
  console.log('  종별(clCdNm → category) 분포:');
  const byKind = new Map<string, number>();
  for (const r of report.rows) byKind.set(r.kindName, (byKind.get(r.kindName) ?? 0) + 1);
  for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k} → ${normalizeLifeHospitalCategory(k)}: ${n}`);
  }
  await dump('02-sample-rows', report.rows.slice(0, 20));

  console.log('\n체크리스트:');
  console.log('  - [ ] 좌표 결측률이 수 % 이내인가(높으면 로더 지오코딩 비중 커짐)');
  console.log('  - [ ] sidoCdNm/sgguCdNm 이 응답에 있는가(없으면 코드 → 이름 매핑 필요)');
  console.log('  - [ ] ykiho max 가 200 이하인가(계약 LifeMapDetailParams)');
  console.log('  적재: pnpm --filter friendly load:life-hospitals');
};

main().catch((e) => {
  if (e instanceof HiraApiError) console.error(`프로브 실패: ${e.message} (url ${e.requestUrl ?? '-'})`);
  else console.error('프로브 실패:', e);
  process.exitCode = 1;
});
