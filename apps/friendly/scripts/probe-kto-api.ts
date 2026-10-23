// 한국관광공사 국문 관광정보 서비스(TourAPI 4.0, data.go.kr 15101578) 프로브.
//
// 여행로그 장소(2023년 표본)에 지금의 운영 정보(이용 시간·쉬는 날·주차·요금)를 붙이는 동기화(sync:tour-kto)가 기대하는 응답
// 모양을 실응답으로 확인한다:
//   ① 키 등록 확인 — 활용신청 직후에는 게이트웨이 반영까지 수십 분 걸린다(30 이면 대기)
//   ② 카탈로그 크기 — 콘텐츠 유형별 전체 건수와 numOfRows=1000 허용 여부(전량 동기화에 몇 콜이 드는지)
//   ③ 좌표 반경 검색(locationBasedList2) — 필드 인벤토리, 거리(dist) 단위
//   ④ 공통·소개 정보(detailCommon2 · detailIntro2) — 유형별 필드 이름, 이용 시간·쉬는 날 문구의 실제 모양
//
// 여행로그 장소와 얼마나 맞는지는 여기서 보지 않는다 — 반경 검색은 카탈로그에 있는 콘텐츠를 빠뜨린다(2026-10-04: 성산일출봉
// 좌표에서 1km 를 물어도 성산일출봉이 오지 않았다). 카탈로그를 받은 뒤 로컬에서 본다:
//   pnpm --filter friendly sync:tour-kto --skip-intro --review=40 --misses=40   (맞춤·못 맞춘 곳)
//   pnpm --filter friendly sync:tour-kto --status --closed=50                   (쉬는 날 문구 → 읽은 요일)
//
// 실행: pnpm --filter friendly probe:kto
// 덤프: apps/friendly/data/kto-probe/<step>.json (gitignore 됨)
// 총 호출 15건 안팎(개발계정 일 1,000건).
/* eslint-disable no-console */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { coerceStrOrNull } from '../src/lib/narrow.js';
import { KTO_CONTENT_TYPE_LABEL, KtoApiAuthError, KtoApiError, fetchKtoPage, normalizeKtoIntro, type KtoPage } from '../src/modules/tour/kto-tour.adapter.js';
import { TOUR_KTO_TYPE_IDS, parseKtoClosedDays } from '../src/modules/tour/tour-kto-info.js';

// env.ts 전체 검증은 프로브에 불필요 — 키만 직접 읽는다.
const KEY = process.env.DATA_GO_KR_API_KEY ?? '';
const SYNCED_TYPES: readonly string[] = TOUR_KTO_TYPE_IDS;

const DUMP_DIR = join(process.cwd(), 'data', 'kto-probe');
const dump = async (step: string, data: unknown): Promise<void> => {
  await writeFile(join(DUMP_DIR, `${step}.json`), JSON.stringify(data, null, 2), 'utf-8');
};
const str = (v: unknown): string => coerceStrOrNull(v) ?? '';
let calls = 0;
const call = async (...a: Parameters<typeof fetchKtoPage>): Promise<KtoPage> => {
  calls += 1;
  return fetchKtoPage(...a);
};
const fields = (items: Record<string, unknown>[]): string => {
  const count = new Map<string, number>();
  for (const it of items) for (const [k, v] of Object.entries(it)) if (str(v) !== '') count.set(k, (count.get(k) ?? 0) + 1);
  return [...count.entries()].map(([k, n]) => `${k}(${n})`).join(' ');
};

const main = async (): Promise<void> => {
  if (!KEY) {
    console.error('DATA_GO_KR_API_KEY 가 없습니다 — apps/friendly/.env 에 공공데이터포털 인증키를 넣어 주세요.');
    process.exitCode = 1;
    return;
  }
  await mkdir(DUMP_DIR, { recursive: true });
  console.log('\n=== 한국관광공사 국문 관광정보 서비스(TourAPI) 프로브 ===');

  // ① 키 등록.
  console.log('\n[①] 키 등록 — areaBasedList2 numOfRows=1');
  let all: KtoPage;
  try {
    all = await call('areaBasedList2', { numOfRows: 1, pageNo: 1 }, { serviceKey: KEY });
    console.log(`  OK — 전체 ${all.totalCount.toLocaleString('ko-KR')}건`);
    await dump('01-first-row', all);
  } catch (e) {
    if (e instanceof KtoApiAuthError) {
      console.error(`  인증 실패(${e.code}): ${e.message}`);
      if (e.code === '30') console.error('  → 활용신청 직후라면 게이트웨이 반영 대기(수십 분~1시간). 신청한 계정의 키가 .env 의 키와 같은지도 확인.');
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  // ② 유형별 건수·페이지 크기.
  console.log('\n[②] 콘텐츠 유형별 건수(전량 동기화 예상 콜)');
  let syncCalls = 0;
  for (const [id, label] of Object.entries(KTO_CONTENT_TYPE_LABEL)) {
    const p = await call('areaBasedList2', { numOfRows: 1, pageNo: 1, contentTypeId: id }, { serviceKey: KEY });
    const pages = Math.ceil(p.totalCount / 1000);
    if (SYNCED_TYPES.includes(id)) syncCalls += pages;
    console.log(`  ${id} ${label.padEnd(8)} ${p.totalCount.toLocaleString('ko-KR').padStart(8)}건 · 1000행 ${pages}콜${SYNCED_TYPES.includes(id) ? '' : ' (받지 않는 유형)'}`);
  }
  const big = await call('areaBasedList2', { numOfRows: 1000, pageNo: 1, contentTypeId: '12', arrange: 'C' }, { serviceKey: KEY });
  console.log(`  numOfRows=1000 → ${big.items.length}행 수신(${big.items.length === 1000 ? '허용' : '상한이 더 낮다 — 동기화가 그 크기로 맞춰 넘긴다'}) · 받는 유형 전량 ≈ ${syncCalls}콜`);
  console.log(`  목록 필드: ${fields(big.items.slice(0, 200))}`);
  await dump('02-area-list-sample', big.items.slice(0, 5));

  // ③ 좌표 반경 — 성산일출봉 근처.
  console.log('\n[③] 좌표 반경 검색 — 성산일출봉(33.4581, 126.9425) 반경 1km');
  const near = await call('locationBasedList2', { mapX: 126.9425, mapY: 33.4581, radius: 1000, numOfRows: 50, pageNo: 1, arrange: 'E' }, { serviceKey: KEY });
  console.log(`  ${near.totalCount}건 · 필드: ${fields(near.items)}`);
  for (const it of near.items.slice(0, 8)) console.log(`    ${str(it['contenttypeid'])} ${str(it['title'])} · dist ${str(it['dist'])} · ${str(it['addr1'])}`);
  await dump('03-location-list', near.items.slice(0, 10));

  // ④ 공통·소개 정보 — 반경 안의 유형별 첫 콘텐츠.
  console.log('\n[④] 공통·소개 정보(유형별 첫 콘텐츠)');
  const seenType = new Set<string>();
  for (const it of near.items) {
    const typeId = str(it['contenttypeid']);
    const id = str(it['contentid']);
    if (!id || seenType.has(typeId) || !SYNCED_TYPES.includes(typeId)) continue;
    seenType.add(typeId);
    const common = await call('detailCommon2', { contentId: id }, { serviceKey: KEY });
    const intro = await call('detailIntro2', { contentId: id, contentTypeId: typeId }, { serviceKey: KEY });
    const info = normalizeKtoIntro(typeId, intro.items[0] ?? {});
    console.log(`  [${typeId} ${KTO_CONTENT_TYPE_LABEL[typeId] ?? ''}] ${str(it['title'])}`);
    console.log(`    공통 필드: ${fields(common.items)}`);
    console.log(`    소개 필드: ${fields(intro.items)}`);
    console.log(`    정리한 값: ${JSON.stringify(info)} → 매주 쉬는 요일 ${JSON.stringify(parseKtoClosedDays(info.closed))}`);
    await dump(`04-detail-${typeId}`, { common: common.items[0] ?? null, intro: intro.items[0] ?? null });
  }

  console.log(`\n총 호출 ${calls}건(개발계정 일 1,000건).`);
  console.log('체크리스트:');
  console.log('  - [ ] 소개 정보의 필드 이름이 어댑터의 유형별 표(INTRO_FIELDS)와 맞는가 — "정리한 값" 이 비어 있으면 필드 이름이 다른 것');
  console.log('  - [ ] 목록 필드에 contentid · contenttypeid · title · mapx · mapy · modifiedtime 이 있는가(동기화가 읽는 것)');
  console.log('  - [ ] 전량 동기화 콜 수가 하루 한도 안인가');
  console.log('  동기화: pnpm --filter friendly sync:tour-kto   (맞춤 검수: --skip-intro --review=40 --misses=40 · 쉬는 날 문구: --status --closed=50)');
};

main().catch((e) => {
  if (e instanceof KtoApiError) console.error(`프로브 실패: ${e.message} (url ${e.requestUrl ?? '-'})${e.responseText ? `\n  응답 앞부분: ${e.responseText.slice(0, 300)}` : ''}`);
  else console.error('프로브 실패:', e);
  process.exitCode = 1;
});
