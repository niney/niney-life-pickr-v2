// 서울시 버스 API (ws.bus.go.kr) 프로브.
//
// 코드에 박힌 추정들을 실응답으로 확정하기 위한 1회성 진단 스크립트:
//   ① BUS_API_KEY 가 Encoding/Decoding 어느 형태인지 (3-변형 판별)
//   ② getStationByName 좌표 필드가 WGS84 인지 TM 인지 (값 범위 분석)
//   ③ resultType=json 지원 여부
//   ④~⑥ 도착정보/실시간 위치 오퍼레이션 필드 확인
//   ⑦ 관측 headerCd 표 + 코드 반영 체크리스트
//
// 실행: pnpm --filter friendly probe:bus [-- 검색키워드]   (기본 '강남')
// 덤프: apps/friendly/data/bus-probe/<step>.json (gitignore 됨)
// 총 호출 ~8건 이내 — 개발계정 일 1,000건 한도에 안전.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BusApiAuthError,
  BusApiError,
  callBusApi,
  toServiceKeyPart,
  type BusApiCallResult,
} from '../src/modules/bus/bus-api.adapter.js';

// env.ts 전체 검증(DATABASE_URL 등)은 프로브에 불필요 — 키만 직접 읽는다.
const RAW_KEY = process.env.BUS_API_KEY ?? '';
const KEYWORD = process.argv[2] ?? '강남';

const DUMP_DIR = join(process.cwd(), 'data', 'bus-probe');

const dump = async (step: string, data: unknown): Promise<void> => {
  await mkdir(DUMP_DIR, { recursive: true });
  const file = join(DUMP_DIR, `${step}.json`);
  await writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  console.log(`   덤프 → ${file}`);
};

const toNum = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// 관측된 headerCd 수집 — NO_RESULT_HEADER_CDS('4' 추정) 확정 근거.
const observedHeaders: { step: string; headerCd: string; headerMsg: string }[] = [];
const noteHeader = (step: string, res: BusApiCallResult): void => {
  observedHeaders.push({ step, headerCd: res.headerCd, headerMsg: res.headerMsg });
};

// 각 숫자 필드의 min/max/샘플 + 좌표계 판정표.
interface FieldStat {
  field: string;
  min: number;
  max: number;
  sample: number;
  verdict: string;
}
const analyzeNumericFields = (items: Record<string, unknown>[]): FieldStat[] => {
  const acc = new Map<string, { min: number; max: number; sample: number }>();
  for (const item of items) {
    for (const [k, v] of Object.entries(item)) {
      const n = toNum(v);
      if (n === null) continue;
      const cur = acc.get(k);
      if (!cur) acc.set(k, { min: n, max: n, sample: n });
      else {
        cur.min = Math.min(cur.min, n);
        cur.max = Math.max(cur.max, n);
      }
    }
  }
  const verdictFor = (min: number, max: number): string => {
    if (min >= 124 && max <= 132) return 'WGS84 경도(lng)';
    if (min >= 33 && max <= 39) return 'WGS84 위도(lat)';
    if (min >= 100_000 && max <= 1_000_000) return 'TM(GRS80) 추정';
    return '불명';
  };
  return [...acc.entries()].map(([field, s]) => ({
    field,
    min: s.min,
    max: s.max,
    sample: s.sample,
    verdict: verdictFor(s.min, s.max),
  }));
};

const main = async (): Promise<void> => {
  if (!RAW_KEY) {
    console.log('BUS_API_KEY 가 비어 있습니다.');
    console.log('  1) https://www.data.go.kr 에서 정류소정보조회/버스위치정보조회 활용신청');
    console.log('  2) apps/friendly/.env 에 BUS_API_KEY=<발급키> 추가');
    console.log('  3) pnpm --filter friendly probe:bus 재실행');
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== 서울시 버스 API 프로브 (키워드: ${KEYWORD}) ===\n`);

  // ── ① 키 3-변형 판별 ────────────────────────────────────────────────────
  console.log('① 키 변형 판별 (원본 → decode → encode)');
  const candidates: { label: string; key: string }[] = [{ label: '원본', key: RAW_KEY }];
  try {
    const dec = decodeURIComponent(RAW_KEY);
    if (dec !== RAW_KEY) candidates.push({ label: 'decodeURIComponent(원본)', key: dec });
  } catch {
    console.log('   decodeURIComponent 불가(malformed) — 변형 생략');
  }
  const enc = encodeURIComponent(RAW_KEY);
  if (enc !== RAW_KEY && !candidates.some((v) => v.key === enc)) {
    candidates.push({ label: 'encodeURIComponent(원본)', key: enc });
  }
  // 어댑터는 %XX 포함 키는 raw, 평문 키는 encodeURIComponent 하므로 서로 다른
  // 변형이 같은 최종 URL 로 수렴할 수 있다(예: Encoding 키의 원본과 decode 본).
  // 최종 keyPart 기준 사전 dedupe — 동일 호출 반복으로 쿼터를 낭비하지 않는다.
  const seenKeyParts = new Set<string>();
  const variants = candidates.filter((v) => {
    const part = toServiceKeyPart(v.key);
    if (seenKeyParts.has(part)) {
      console.log(`   ${v.label}: 어댑터 최종 keyPart 가 이전 변형과 동일 — 호출 생략`);
      return false;
    }
    seenKeyParts.add(part);
    return true;
  });

  let workingKey: { label: string; key: string } | null = null;
  let stationResult: BusApiCallResult | null = null;
  for (const v of variants) {
    try {
      const res = await callBusApi(
        'stationinfo/getStationByName',
        { stSrch: KEYWORD },
        { serviceKey: v.key },
      );
      workingKey = v;
      stationResult = res;
      noteHeader('getStationByName', res);
      console.log(`   ${v.label}: 성공 (headerCd=${res.headerCd}, items=${res.items.length})`);
      break;
    } catch (e) {
      // cmmMsgHeader(returnReasonCode)·ServiceResult headerCd=7 양쪽 모두
      // 어댑터가 BusApiAuthError 로 분류한다 — 키 문제만 다음 변형 시도.
      if (e instanceof BusApiAuthError) {
        console.log(
          `   ${v.label}: 인증 실패 reasonCode=${e.returnReasonCode ?? '?'} (${e.returnAuthMsg})`,
        );
        continue;
      }
      // 그 외 에러는 즉시 보고 — 키 문제가 아니므로 변형을 더 돌릴 이유 없음.
      console.error(`   ${v.label}: 비인증 에러 — ${errMsg(e)}`);
      if (e instanceof BusApiError && e.requestUrl) console.error(`   url: ${e.requestUrl}`);
      process.exitCode = 1;
      return;
    }
  }
  if (!workingKey || !stationResult) {
    console.error('   모든 키 변형이 인증 실패 — data.go.kr 활용신청/승인 상태를 확인하세요.');
    console.error('   특히 인증모듈 에러코드(20)=SERVICE ACCESS DENIED 는 해당 서비스');
    console.error('   (15000303 정류소정보조회) 활용신청 미승인이거나 발급 직후 동기화');
    console.error('   지연(수십 분~수 시간)일 수 있습니다.');
    process.exitCode = 1;
    return;
  }

  // ── ② 검색 전체 덤프 + 좌표 필드 분석 (①의 응답 재사용 — 추가 호출 없음) ──
  console.log(`\n② getStationByName('${KEYWORD}') 전체 덤프 + 좌표 분석`);
  await dump('02-station-by-name', {
    requestUrl: stationResult.requestUrl,
    headerCd: stationResult.headerCd,
    headerMsg: stationResult.headerMsg,
    itemCount: stationResult.items.length,
    items: stationResult.items,
    xmlText: stationResult.xmlText,
  });
  const fieldStats = analyzeNumericFields(stationResult.items);
  if (fieldStats.length > 0) console.table(fieldStats);
  else console.log('   숫자 필드 없음 (items 비어있음?)');
  const coordVerdict =
    fieldStats.some((f) => f.verdict.startsWith('WGS84')) ? 'WGS84 포함' : 'WGS84 후보 없음 — TM 의심';

  // ── ③ resultType=json 지원 여부 ─────────────────────────────────────────
  console.log('\n③ resultType=json 시도');
  let jsonVerdict = '판정 실패';
  try {
    const res = await callBusApi(
      'stationinfo/getStationByName',
      { stSrch: KEYWORD },
      { serviceKey: workingKey.key, extraParams: { resultType: 'json' } },
    );
    noteHeader('resultType=json', res);
    jsonVerdict = 'XML 응답 유지 (resultType=json 무시됨)';
    await dump('03-resulttype-json', { requestUrl: res.requestUrl, xmlText: res.xmlText });
  } catch (e) {
    if (e instanceof BusApiError && e.responseText) {
      try {
        const parsed: unknown = JSON.parse(e.responseText);
        jsonVerdict = 'JSON 응답 지원';
        await dump('03-resulttype-json', { json: parsed });
      } catch {
        jsonVerdict = `JSON 아님 + XML 해석 실패 (${errMsg(e)}) — 덤프 원문 확인`;
        await dump('03-resulttype-json', { error: errMsg(e), responseText: e.responseText });
      }
    } else {
      jsonVerdict = `호출 실패: ${errMsg(e)}`;
      process.exitCode = 1;
    }
  }
  console.log(`   verdict: ${jsonVerdict}`);

  // ── ④ 도착정보 getStationByUid ──────────────────────────────────────────
  console.log('\n④ getStationByUid (arsId != 0 첫 정류소)');
  let firstArrival: { busRouteId: string; staOrd: number } | null = null;
  try {
    const target = stationResult.items.find((it) => {
      const arsId = it['arsId'];
      return typeof arsId === 'string' && arsId !== '0' && arsId.length > 0;
    });
    if (!target) {
      console.log('   arsId != 0 정류소 없음 — 단계 생략');
    } else {
      const arsId = String(target['arsId']);
      console.log(`   대상: ${String(target['stNm'])} (arsId=${arsId})`);
      const res = await callBusApi('stationinfo/getStationByUid', { arsId }, {
        serviceKey: workingKey.key,
      });
      noteHeader('getStationByUid', res);
      await dump('04-station-by-uid', {
        requestUrl: res.requestUrl,
        items: res.items,
        xmlText: res.xmlText,
      });
      console.table(
        res.items.slice(0, 8).map((it) => ({
          busRouteId: it['busRouteId'],
          rtNm: it['rtNm'],
          staOrd: it['staOrd'],
          vehId1: it['vehId1'],
          arrmsg1: it['arrmsg1'],
        })),
      );
      const first = res.items.find(
        (it) => toNum(it['staOrd']) !== null && String(it['busRouteId'] ?? '').length > 0,
      );
      if (first) {
        firstArrival = {
          busRouteId: String(first['busRouteId']),
          staOrd: toNum(first['staOrd'])!,
        };
      }
    }
  } catch (e) {
    console.error(`   실패: ${errMsg(e)}`);
    process.exitCode = 1;
  }

  // ── ⑤ 구간 차량 위치 getBusPosByRouteSt ────────────────────────────────
  console.log('\n⑤ getBusPosByRouteSt (④의 busRouteId/staOrd 사용)');
  if (!firstArrival) {
    console.log('   ④에서 busRouteId/staOrd 를 얻지 못해 생략');
  } else {
    try {
      const startOrd = Math.max(1, firstArrival.staOrd - 3);
      const endOrd = firstArrival.staOrd;
      const res = await callBusApi(
        'buspos/getBusPosByRouteSt',
        {
          busRouteId: firstArrival.busRouteId,
          startOrd: String(startOrd),
          endOrd: String(endOrd),
        },
        { serviceKey: workingKey.key },
      );
      noteHeader('getBusPosByRouteSt', res);
      await dump('05-buspos-by-route-st', {
        requestUrl: res.requestUrl,
        items: res.items,
        xmlText: res.xmlText,
      });
      // 해당 구간에 운행 차량이 없으면 빈 결과 — 정상이다.
      console.log(
        `   구간 ${startOrd}~${endOrd} 차량 ${res.items.length}대 (0대여도 정상 — 구간 내 미운행)`,
      );
      const posStats = analyzeNumericFields(res.items);
      if (posStats.length > 0) console.table(posStats);
    } catch (e) {
      console.error(`   실패: ${errMsg(e)}`);
      process.exitCode = 1;
    }
  }

  // ── ⑥ 노선 전체 차량 위치 getBusPosByRtid ───────────────────────────────
  console.log('\n⑥ getBusPosByRtid (같은 busRouteId)');
  if (!firstArrival) {
    console.log('   busRouteId 없음 — 생략');
  } else {
    try {
      const res = await callBusApi(
        'buspos/getBusPosByRtid',
        { busRouteId: firstArrival.busRouteId },
        { serviceKey: workingKey.key },
      );
      noteHeader('getBusPosByRtid', res);
      await dump('06-buspos-by-rtid', {
        requestUrl: res.requestUrl,
        items: res.items,
        xmlText: res.xmlText,
      });
      console.log(`   노선 전체 차량 ${res.items.length}대, 샘플 1건:`);
      console.log(JSON.stringify(res.items[0] ?? null, null, 2));
    } catch (e) {
      console.error(`   실패: ${errMsg(e)}`);
      process.exitCode = 1;
    }
  }

  // ── ⑦ 최종 요약 ─────────────────────────────────────────────────────────
  console.log('\n⑦ 최종 요약');
  // keyPart dedupe 로 변형이 합쳐질 수 있어 '키 형태' 단정이 아니라 어댑터가
  // 실제 택한 처리 경로를 보고한다.
  console.log(`   어댑터 처리 경로 확인: ${workingKey.label} 성공 — ` +
    (/%[0-9a-fA-F]{2}/.test(workingKey.key)
      ? '%XX 포함 → raw 그대로 사용'
      : '평문 → encodeURIComponent 적용'));
  console.log(`   좌표계 verdict: ${coordVerdict} (위 ② 분석표 참조)`);
  console.log(`   resultType=json: ${jsonVerdict}`);
  console.log('   관측된 headerCd:');
  console.table(observedHeaders);
  console.log('   코드 반영 체크리스트:');
  console.log('   - [ ] bus-api.adapter.ts NO_RESULT_HEADER_CDS — 결과없음 코드가 4가 맞는지 위 표로 확정');
  console.log('   - [ ] toLatLng 후보 쌍/순서 — TM 만 내려오면 proj4 (GRS80 TM → WGS84) 변환 도입');
  console.log('   - [ ] __fixtures__/*.xml 을 data/bus-probe 의 실응답 기반으로 교체');
  console.log('   - [ ] .env BUS_API_KEY 주석에 확정된 키 형태(Encoding/Decoding) 기록');
  console.log('');
};

main().catch((e) => {
  console.error(errMsg(e));
  process.exitCode = 1;
});
