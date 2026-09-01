// 시간표 소스 판정 프로브 (8차 0단계) — 후보 A(서울시 openapi
// SearchSTNTimeTableByIDService)와 후보 B(TAGO 국토부 SubwayInfoService)의
// 커버리지·키·데이터 품질을 실측해 8차 본 설계의 소스를 정한다.
//
// 실행: pnpm --filter friendly probe:subway-timetable
// 예산 ~10콜(openapi 넉넉, swopen 미사용). 덤프: data/subway-probe/timetable-*.json.
// 키는 path/query 에 실리므로 마스킹본(requestUrl)만 로깅·덤프한다.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { toServiceKeyPart } from '../src/modules/bus/bus-api.adapter.js';

const SEOUL_KEY = process.env.SEOUL_OPEN_API_KEY ?? '';
const TAGO_KEY = process.env.DATA_GO_KR_API_KEY ?? '';
const prisma = new PrismaClient();

const scrub = (s: string): string =>
  [SEOUL_KEY, TAGO_KEY].filter(Boolean).reduce((acc, k) => acc.split(k).join('***'), s);

const DUMP_DIR = join(process.cwd(), 'data', 'subway-probe');
const dump = async (name: string, data: unknown): Promise<void> => {
  await mkdir(DUMP_DIR, { recursive: true });
  await writeFile(join(DUMP_DIR, `timetable-${name}.json`), scrub(JSON.stringify(data, null, 2)), 'utf8');
};

interface CallResult {
  requestUrl: string;
  status: number;
  json: unknown;
  rawHead: string;
}

const callSeoul = async (segments: string[]): Promise<CallResult> => {
  const tail = segments.join('/');
  const fetchUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_KEY}/json/${tail}`;
  const requestUrl = `http://openapi.seoul.go.kr:8088/***/json/${tail}`;
  const res = await fetch(fetchUrl);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 비 JSON(XML 에러 등) */
  }
  return { requestUrl, status: res.status, json, rawHead: scrub(text.slice(0, 500)) };
};

const callTago = async (op: string, params: Record<string, string>): Promise<CallResult> => {
  const sp = new URLSearchParams(params);
  const keyPart = toServiceKeyPart(TAGO_KEY);
  const fetchUrl = `https://apis.data.go.kr/1613000/SubwayInfoService/${op}?serviceKey=${keyPart}&${sp}`;
  const requestUrl = `https://apis.data.go.kr/1613000/SubwayInfoService/${op}?serviceKey=***&${sp}`;
  const res = await fetch(fetchUrl);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 비 JSON(XML 에러 등) */
  }
  return { requestUrl, status: res.status, json, rawHead: scrub(text.slice(0, 500)) };
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// openapi { <service>:{ list_total_count, RESULT:{CODE,MESSAGE}, row:[...] } } | 톱레벨 RESULT.
const readSeoul = (json: unknown, service: string) => {
  const box = isObj(json) && isObj(json[service]) ? json[service] : isObj(json) ? json : {};
  const result = isObj(box['RESULT']) ? box['RESULT'] : isObj(json) && isObj(json['RESULT']) ? json['RESULT'] : null;
  const rowsRaw = box['row'];
  const rows = Array.isArray(rowsRaw) ? rowsRaw.filter(isObj) : isObj(rowsRaw) ? [rowsRaw] : [];
  return {
    code: result ? String(result['CODE'] ?? '') : '',
    message: result ? String(result['MESSAGE'] ?? '') : '',
    total: Number(box['list_total_count'] ?? 0),
    rows,
  };
};

const main = async (): Promise<void> => {
  if (!SEOUL_KEY) console.warn('주의: SEOUL_OPEN_API_KEY 없음 — 후보 A 스킵');
  if (!TAGO_KEY) console.warn('주의: DATA_GO_KR_API_KEY 없음 — 후보 B 스킵');

  // 표본 stationCd(BLDN_ID) — 커버리지 판정용(비서울교통공사 노선 포함).
  const pick = async (lineId: string, name: string): Promise<{ label: string; cd: string | null }> => {
    const r = await prisma.subwayStation.findFirst({ where: { lineId, name }, select: { stationCd: true } });
    return { label: `${name}(${lineId})`, cd: r?.stationCd ?? null };
  };
  const samples = await Promise.all([
    pick('1002', '강남'), // 서울교통공사 2호선
    pick('1009', '신논현'), // 9호선(비서교공)
    pick('1077', '강남'), // 신분당선(네오트랜스)
    pick('1075', '선릉'), // 수인분당(코레일)
    pick('1065', '홍대입구'), // 공항철도
  ]);
  console.log('표본 stationCd:', samples.map((s) => `${s.label}=${s.cd}`).join(', '));

  const findings: Record<string, unknown> = {};

  // ── 후보 A: SearchSTNTimeTableByIDService ────────────────────────────────
  console.log('\n=== 후보 A: 서울시 SearchSTNTimeTableByIDService ===');
  const SVC_A = 'SearchSTNTimeTableByIDService';
  const gangnam = samples[0]!.cd;
  const covA: Record<string, { code: string; rows: number }> = {};
  if (SEOUL_KEY && gangnam) {
    // 포맷 확정: 강남 평일(1)/상행(1) — 브리프 추정 순서.
    console.log(`① 포맷 확정 — 강남(${gangnam}) /1/500/${gangnam}/1/1`);
    const first = await callSeoul([SVC_A, '1', '500', gangnam, '1', '1']);
    const r0 = readSeoul(first.json, SVC_A);
    await dump('A-gangnam-1-1', { requestUrl: first.requestUrl, status: first.status, code: r0.code, total: r0.total, firstRow: r0.rows[0] ?? null, rawHead: first.rawHead });
    console.log(`   code=${r0.code} total=${r0.total} rows=${r0.rows.length}`);
    if (r0.rows[0]) console.log(`   필드: ${Object.keys(r0.rows[0]).join(', ')}`);
    if (r0.rows[0]) console.log(`   샘플행: ${scrub(JSON.stringify(r0.rows[0]))}`);

    // 커버리지: 각 표본 평일/상행 1콜.
    console.log('② 커버리지 — 표본별 평일/상행');
    for (const s of samples) {
      if (!s.cd) { covA[s.label] = { code: 'NO_CD', rows: 0 }; continue; }
      const res = await callSeoul([SVC_A, '1', '500', s.cd, '1', '1']);
      const rr = readSeoul(res.json, SVC_A);
      covA[s.label] = { code: rr.code, rows: rr.rows.length };
      console.log(`   ${s.label} (${s.cd}): code=${rr.code} rows=${rr.rows.length}`);
      await dump(`A-cov-${s.label.replace(/[()]/g, '')}`, { requestUrl: res.requestUrl, code: rr.code, total: rr.total, firstRow: rr.rows[0] ?? null });
    }

    // 평일/토/휴일 구분 — 강남.
    console.log('③ 주중구분(평일1/토2/휴일3) — 강남');
    const dayCodes: Record<string, { code: string; rows: number }> = {};
    for (const day of ['1', '2', '3']) {
      const res = await callSeoul([SVC_A, '1', '500', gangnam, day, '1']);
      const rr = readSeoul(res.json, SVC_A);
      dayCodes[day] = { code: rr.code, rows: rr.rows.length };
      console.log(`   주중구분 ${day}: code=${rr.code} rows=${rr.rows.length}`);
    }
    findings['A'] = { format: `/1/500/{cd}/{주중}/{상하}`, gangnamCode: r0.code, coverage: covA, dayTypes: dayCodes, fields: r0.rows[0] ? Object.keys(r0.rows[0]) : [] };
  } else {
    findings['A'] = { skipped: !SEOUL_KEY ? 'no key' : 'no gangnam cd' };
  }

  // ── 후보 B: TAGO SubwayInfoService ───────────────────────────────────────
  console.log('\n=== 후보 B: TAGO 국토부 SubwayInfoService (serviceKey=DATA_GO_KR_API_KEY) ===');
  if (TAGO_KEY) {
    console.log('① getKwrdFndSubwaySttnList(강남) — 역ID + 인증 상태');
    const b1 = await callTago('getKwrdFndSubwaySttnList', { subwayStationName: '강남', _type: 'json', numOfRows: '20' });
    await dump('B-kwrd-gangnam', { requestUrl: b1.requestUrl, status: b1.status, json: b1.json, rawHead: b1.rawHead });
    // TAGO 응답: { response: { header:{resultCode,resultMsg}, body:{items:{item:[...]}} } } 또는 XML 에러.
    const resp = isObj(b1.json) && isObj(b1.json['response']) ? b1.json['response'] : null;
    const header = resp && isObj(resp['header']) ? resp['header'] : null;
    const resultCode = header ? String(header['resultCode'] ?? '') : '(비JSON)';
    const resultMsg = header ? String(header['resultMsg'] ?? '') : b1.rawHead.slice(0, 120);
    console.log(`   status=${b1.status} resultCode=${resultCode} resultMsg=${scrub(resultMsg)}`);

    let stationId: string | null = null;
    const body = resp && isObj(resp['body']) ? resp['body'] : null;
    const items = body && isObj(body['items']) ? body['items'] : null;
    const itemRaw = items ? items['item'] : null;
    const itemList = Array.isArray(itemRaw) ? itemRaw : isObj(itemRaw) ? [itemRaw] : [];
    if (itemList.length && isObj(itemList[0])) {
      stationId = String(itemList[0]['subwayStationId'] ?? '');
      console.log(`   TAGO 역 ${itemList.length}건, 첫 역ID=${stationId} 명=${itemList[0]['subwayStationName']}`);
    }

    let bSchedule: unknown = null;
    if (stationId && resultCode === '00') {
      console.log('② getSubwaySttnAcctoSchdulList — 평일/상행 시간표 필드');
      const b2 = await callTago('getSubwaySttnAcctoSchdulList', {
        subwayStationId: stationId,
        dailyTypeCode: '01',
        upDownTypeCode: 'U',
        numOfRows: '500',
        _type: 'json',
      });
      await dump('B-schedule', { requestUrl: b2.requestUrl, status: b2.status, json: b2.json, rawHead: b2.rawHead });
      const r2 = isObj(b2.json) && isObj(b2.json['response']) ? b2.json['response'] : null;
      const h2 = r2 && isObj(r2['header']) ? r2['header'] : null;
      const b2body = r2 && isObj(r2['body']) ? r2['body'] : null;
      const b2items = b2body && isObj(b2body['items']) ? b2body['items'] : null;
      const b2raw = b2items ? b2items['item'] : null;
      const b2list = Array.isArray(b2raw) ? b2raw : isObj(b2raw) ? [b2raw] : [];
      console.log(`   code=${h2 ? h2['resultCode'] : '?'} rows=${b2list.length}`);
      if (b2list[0] && isObj(b2list[0])) {
        console.log(`   필드: ${Object.keys(b2list[0]).join(', ')}`);
        console.log(`   샘플행: ${scrub(JSON.stringify(b2list[0]))}`);
      }
      bSchedule = { code: h2 ? h2['resultCode'] : null, rows: b2list.length, fields: b2list[0] && isObj(b2list[0]) ? Object.keys(b2list[0]) : [] };
    }
    findings['B'] = { kwrdResultCode: resultCode, kwrdResultMsg: scrub(resultMsg), stationId, schedule: bSchedule, authed: resultCode === '00' };
  } else {
    findings['B'] = { skipped: 'no DATA_GO_KR_API_KEY' };
  }

  await dump('summary', findings);
  console.log('\n=== 판정 요약 (덤프 timetable-summary.json) ===');
  console.log(JSON.stringify(findings, null, 2));
};

main()
  .catch((e) => console.error(scrub(e instanceof Error ? e.message : String(e))))
  .finally(() => prisma.$disconnect());
