// 서울시 지하철 공공 API 프로브 (실시간 swopenAPI + 정적 openapi.seoul.go.kr).
//
// PLAN-subway 1차 0단계 — 어댑터/상수를 확정하기 위한 1회성 진단 스크립트.
// 지하철 어댑터(subway-api.adapter.ts)는 아직 없으므로 HTTP 코어를 여기서
// 자족적으로 구현하되, 마스킹/타임아웃/에러 분류 정신은 bus-api.adapter.ts 를
// 이식한다. 확정하려는 미지수(브리프 체크리스트 ①~⑩):
//   ① 키 하나가 swopenAPI·openapi.seoul.go.kr 양쪽에서 유효한지
//   ② 에러 모델 (정상 동봉 errorMessage vs 에러 단독, INFO-200 실형태)
//   ③ realtimePosition statnId ↔ 역사마스터 역ID 동일성 (최대 리스크)
//   ④ 역사마스터 실필드명·총 건수·좌표 범위·특수노선 포함
//   ⑤ 호선명 param 표기 (2호선/9호선/경의중앙선/수인분당선/신분당선/우이신설선/GTX-A)
//   ⑥ 역명 표기 함정 (서울역 vs 서울, 총신대입구(이수))
//   ⑦ 환승역(왕십리) 한 콜에 전 호선이 오는지 + btrainSttus/barvlDt
//   ⑧ recptnDt 변화 주기 (원천 갱신 주기 → 폴링/tween 근거)
//   ⑨ 도착 btrainNo ↔ 위치 trainNo 동일 체계 여부 (7차 연계 게이트)
//   ⑩ 일괄(ALL) 엔드포인트 동작·응답 크기 (escape hatch 확인)
//
// 실행: pnpm --filter friendly probe:subway [--quick]
//   --quick: ⑧ recptnDt 주기(15초 대기 2콜) 스킵.
// 덤프: apps/friendly/data/subway-probe/<step>.json (gitignore 됨)
// 키는 URL path 세그먼트에 실린다 — 로그/덤프의 requestUrl 은 키를 '***' 로
// 마스킹한 것만 사용한다. 총 호출 ~22건 — 서울 열린데이터 일 1,000건에 안전.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// env.ts 전체 검증(DATABASE_URL 등)은 프로브에 불필요 — 키만 직접 읽는다.
// 서울 열린데이터광장은 키가 2종: '지하철 인증키'(swopenAPI 실시간 전용)와
// '일반 인증키'(openapi.seoul.go.kr:8088 정적). 한쪽이 비면 다른 쪽으로 폴백해
// 교차 유효성(체크리스트 ①)을 겸사 확인한다.
const SUBWAY_KEY = process.env.SUBWAY_API_KEY ?? '';
const SEOUL_OPEN_KEY = process.env.SEOUL_OPEN_API_KEY ?? '';
const SWOPEN_KEY = SUBWAY_KEY || SEOUL_OPEN_KEY;
const OPENAPI_KEY = SEOUL_OPEN_KEY || SUBWAY_KEY;
const QUICK = process.argv.includes('--quick');

const SWOPEN_BASE = 'http://swopenAPI.seoul.go.kr/api/subway';
const SEOUL_OPEN_BASE = 'http://openapi.seoul.go.kr:8088';
const FETCH_TIMEOUT_MS = 10_000;

const DUMP_DIR = join(process.cwd(), 'data', 'subway-probe');

// 어떤 문자열이든 로그/덤프 전에 키 평문을 '***' 로 지운다(이중 안전망).
// URL 빌더가 마스킹본을 따로 만들지만, 예외 메시지가 키를 물고 올 여지를 봉인.
const scrub = (s: string): string =>
  [SUBWAY_KEY, SEOUL_OPEN_KEY].filter(Boolean).reduce((acc, k) => acc.split(k).join('***'), s);
const errMsg = (e: unknown): string => scrub(e instanceof Error ? e.message : String(e));

const dump = async (step: string, data: unknown): Promise<void> => {
  await mkdir(DUMP_DIR, { recursive: true });
  const file = join(DUMP_DIR, `${step}.json`);
  await writeFile(file, scrub(JSON.stringify(data, null, 2)), 'utf8');
  console.log(`   덤프 → ${file}`);
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// JSON 응답이어도 숫자가 문자열로 오는 경우가 흔하다(서울 openapi 관례) —
// bus-api.adapter 의 strOrNull/numOrNull 정신 이식.
const strOrNull = (v: unknown): string | null => {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
};
const numOrNull = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};
const uniq = (arr: (string | null)[]): string[] =>
  [...new Set(arr.filter((v): v is string => v !== null && v.length > 0))];

// ── HTTP 코어 ──────────────────────────────────────────────────────────────
// path 세그먼트로 키가 들어가므로 fetchUrl(키 평문)과 requestUrl(마스킹본)을
// 같은 템플릿에서 병렬 생성한다 — URL 에서 키를 사후 치환하지 않는다(누락 위험).
// 세그먼트가 한글(역명/호선명)이면 호출부가 encodeURIComponent 해서 넘긴다.
const buildSwopenUrls = (segments: string[]): { fetchUrl: string; requestUrl: string } => {
  const tail = segments.join('/');
  return {
    fetchUrl: `${SWOPEN_BASE}/${SWOPEN_KEY}/json/${tail}`,
    requestUrl: `${SWOPEN_BASE}/***/json/${tail}`,
  };
};
const buildSeoulOpenUrls = (segments: string[]): { fetchUrl: string; requestUrl: string } => {
  const tail = segments.join('/');
  return {
    fetchUrl: `${SEOUL_OPEN_BASE}/${OPENAPI_KEY}/json/${tail}`,
    requestUrl: `${SEOUL_OPEN_BASE}/***/json/${tail}`,
  };
};

interface JsonCallResult {
  requestUrl: string; // 마스킹본 — 그대로 로깅/덤프해도 안전.
  status: number; // HTTP 상태 (신뢰 금지 — 200+본문에러 케이스 존재).
  rawText: string; // 원문 (파싱 실패해도 보존).
  json: unknown; // 파싱 성공 시 값, 실패 시 null.
  parseError: string | null;
}

// signal 미지정 시 자체 timeout — 업스트림이 매달려도 10초에 끊는다. 같은 시그널이
// 본문 읽기도 중단시키므로 clearTimeout 은 text() 완료 후 (undici bodyTimeout
// ~300초 함정 회피 — bus-api.adapter 주석 참조).
const callJson = async (urls: { fetchUrl: string; requestUrl: string }): Promise<JsonCallResult> => {
  const { fetchUrl, requestUrl } = urls;
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  let rawText: string;
  let status: number;
  try {
    let res: Response;
    try {
      res = await fetch(fetchUrl, { signal: ac.signal });
    } catch (e) {
      // 메시지에 fetchUrl(키 평문) 금지 — 마스킹본만. errMsg 가 한 번 더 scrub.
      // (출력 경로는 전부 errMsg(message만) — cause 가 콘솔에 덤프될 일 없음.)
      throw new Error(`fetch 실패 (${requestUrl}): ${errMsg(e)}`, { cause: e });
    }
    status = res.status;
    try {
      rawText = await res.text();
    } catch (e) {
      throw new Error(`본문 읽기 실패 (${requestUrl}): ${errMsg(e)}`, { cause: e });
    }
  } finally {
    clearTimeout(timeoutId);
  }
  // 에러 본문도 JSON 이므로(200/500 무관) 파싱 실패만 별도 기록하고 계속.
  let json: unknown = null;
  let parseError: string | null = null;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    parseError = errMsg(e);
  }
  return { requestUrl, status, rawText, json, parseError };
};

// ── 응답 모델 파서 ───────────────────────────────────────────────────────────
// swopen 실시간: 정상은 { errorMessage:{status,code,message,total}, <list>:[...] },
// 에러는 톱레벨 { status, code, message } 단독. 둘 다에서 상태를 뽑는다.
const readSwopenStatus = (
  json: unknown,
): { code: string | null; message: string | null; total: number | null } => {
  const box =
    isObject(json) && isObject(json['errorMessage'])
      ? json['errorMessage']
      : isObject(json)
        ? json
        : null;
  if (!box) return { code: null, message: null, total: null };
  return {
    code: strOrNull(box['code']),
    message: strOrNull(box['message']),
    total: numOrNull(box['total']),
  };
};
// 단건이 객체로 떨어지는 함정 봉인 — 배열/객체/부재 모두 배열로 정규화.
const readSwopenList = (json: unknown, key: string): Record<string, unknown>[] => {
  if (!isObject(json)) return [];
  const list = json[key];
  if (Array.isArray(list)) return list.filter(isObject);
  if (isObject(list)) return [list];
  return [];
};

// openapi 정적: 성공은 { SERVICE:{list_total_count, RESULT:{CODE,MESSAGE}, row:[...]} },
// 실패는 톱레벨 { RESULT:{CODE,MESSAGE} }. 둘 다에서 결과를 뽑는다.
const readSeoulResult = (
  json: unknown,
  service: string,
): { code: string | null; message: string | null; total: number | null; rows: Record<string, unknown>[] } => {
  if (!isObject(json)) return { code: null, message: null, total: null, rows: [] };
  const box = isObject(json[service]) ? json[service] : json;
  const result = isObject(box['RESULT']) ? box['RESULT'] : null;
  const rowsRaw = box['row'];
  const rows = Array.isArray(rowsRaw)
    ? rowsRaw.filter(isObject)
    : isObject(rowsRaw)
      ? [rowsRaw]
      : [];
  return {
    code: result ? strOrNull(result['CODE']) : null,
    message: result ? strOrNull(result['MESSAGE']) : null,
    total: numOrNull(box['list_total_count']),
    rows,
  };
};

// ── 좌표/필드 분석 (bus 프로브 analyzeNumericFields 정신 이식) ────────────────
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
      const n = numOrNull(v);
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

// 역사마스터에서 호선명 필드 추정 — 값에 호선 힌트가 가장 많이 걸리는 필드.
const LINE_HINT = /호선|경의|중앙|분당|공항|경춘|신분당|우이|서해|GTX|에버라인|의정부|용인|김포/;
const detectLineField = (rows: Record<string, unknown>[]): { field: string | null; values: string[] } => {
  const fields = rows[0] ? Object.keys(rows[0]) : [];
  let bestField: string | null = null;
  let bestHits = 0;
  for (const f of fields) {
    let hits = 0;
    for (const r of rows) {
      const v = strOrNull(r[f]);
      if (v && LINE_HINT.test(v)) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestField = f;
    }
  }
  const field = bestField;
  const values = field ? uniq(rows.map((r) => strOrNull(r[field]))).sort() : [];
  return { field, values };
};

// 역사마스터의 ID 후보 필드 — 숫자문자열 위주 필드의 자릿수와 실시간 statnId
// 교집합을 보고한다(③ 동일성 판정 근거).
interface IdFieldReport {
  field: string;
  sample: string;
  lengths: string;
  exactMatches: number;
}
const detectIdFields = (
  rows: Record<string, unknown>[],
  realtimeIds: Set<string>,
): IdFieldReport[] => {
  const fields = rows[0] ? Object.keys(rows[0]) : [];
  const report: IdFieldReport[] = [];
  for (const f of fields) {
    const vals = uniq(rows.map((r) => strOrNull(r[f])));
    if (vals.length === 0) continue;
    const numericLike = vals.filter((v) => /^\d+$/.test(v));
    if (numericLike.length < vals.length * 0.5) continue; // 숫자 위주 필드만 ID 후보
    report.push({
      field: f,
      sample: numericLike[0] ?? '',
      lengths: uniq(numericLike.map((v) => String(v.length))).join('/'),
      exactMatches: numericLike.filter((v) => realtimeIds.has(v)).length,
    });
  }
  return report;
};

// ── 캡처 헬퍼 — 스텝 간 재사용 데이터 정규화 ──────────────────────────────────
interface ArrivalCapture {
  code: string | null;
  message: string | null;
  total: number | null;
  count: number;
  statnIds: string[];
  subwayIds: string[];
  btrainSttus: string[];
  btrainNos: string[];
  barvlDts: string[];
  firstRow: Record<string, unknown> | null;
}
const captureArrival = (json: unknown): ArrivalCapture => {
  const status = readSwopenStatus(json);
  const rows = readSwopenList(json, 'realtimeArrivalList');
  return {
    code: status.code,
    message: status.message,
    total: status.total,
    count: rows.length,
    statnIds: uniq(rows.map((r) => strOrNull(r['statnId']))),
    subwayIds: uniq(rows.map((r) => strOrNull(r['subwayId']))),
    btrainSttus: uniq(rows.map((r) => strOrNull(r['btrainSttus']))),
    btrainNos: uniq(rows.map((r) => strOrNull(r['btrainNo']))),
    barvlDts: rows.map((r) => strOrNull(r['barvlDt']) ?? '·').slice(0, 8),
    firstRow: rows[0] ?? null,
  };
};

interface PositionCapture {
  code: string | null;
  message: string | null;
  count: number;
  statnIds: string[];
  subwayIds: string[];
  trainNos: string[];
  recptnDts: string[];
  firstRow: Record<string, unknown> | null;
}
const capturePosition = (json: unknown): PositionCapture => {
  const status = readSwopenStatus(json);
  const rows = readSwopenList(json, 'realtimePositionList');
  return {
    code: status.code,
    message: status.message,
    count: rows.length,
    statnIds: uniq(rows.map((r) => strOrNull(r['statnId']))),
    subwayIds: uniq(rows.map((r) => strOrNull(r['subwayId']))),
    trainNos: uniq(rows.map((r) => strOrNull(r['trainNo']))),
    recptnDts: uniq(rows.map((r) => strOrNull(r['recptnDt']))).slice(0, 6),
    firstRow: rows[0] ?? null,
  };
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// 역사마스터 서비스명 후보 — 정확한 이름이 미지수라 순서대로 시도한다.
// SearchInfoBySubwayNameServiceNew 는 역명(강남)을 추가 path 로 요구.
const MASTER_CANDIDATES: { service: string; extra: string[] }[] = [
  { service: 'subwayStationMaster', extra: [] },
  { service: 'SearchInfoBySubwayNameServiceNew', extra: [encodeURIComponent('강남')] },
  { service: 'SearchSTNBySubwayLineInfo', extra: [] },
  { service: 'SearchInfoBySubwayNameService', extra: [] },
];
const LINE_NAME_SAMPLES = ['2호선', '9호선', '경의중앙선', '수인분당선', '신분당선', '우이신설선', 'GTX-A'];

const main = async (): Promise<void> => {
  if (!SWOPEN_KEY && !OPENAPI_KEY) {
    console.log('SUBWAY_API_KEY / SEOUL_OPEN_API_KEY 가 모두 비어 있습니다.');
    console.log('  1) https://data.seoul.go.kr 에서 지하철 인증키(실시간)와 일반 인증키(정적) 발급');
    console.log('  2) apps/friendly/.env 에 SUBWAY_API_KEY=<지하철 인증키>, SEOUL_OPEN_API_KEY=<일반 인증키> 추가');
    console.log('  3) pnpm --filter friendly probe:subway 재실행');
    process.exitCode = 1;
    return;
  }
  if (!SUBWAY_KEY || !SEOUL_OPEN_KEY) {
    console.log(`주의: ${!SUBWAY_KEY ? 'SUBWAY_API_KEY' : 'SEOUL_OPEN_API_KEY'} 가 비어 있어 다른 키로 폴백 — ① 판정 시 참고.`);
  }

  console.log(`\n=== 서울시 지하철 API 프로브 ${QUICK ? '(--quick: ⑧ 스킵)' : ''} ===\n`);

  // 스텝 간 재사용 캡처 + 최종 verdict 누적.
  let arrivalGangnam: ArrivalCapture | null = null;
  let position2: PositionCapture | null = null;
  let masterService: string | null = null;
  let masterRows: Record<string, unknown>[] = []; // ④ 전량(성공 시)
  const findings: Record<string, string> = {
    '①키-양포털': '미확정',
    '②에러모델': '미확정',
    '③statnId대조': '미확정',
    '④역사마스터': '미확정',
    '⑤호선명표기': '미확정',
    '⑥역명함정': '미확정',
    '⑦환승역': '미확정',
    '⑧recptnDt주기': QUICK ? '스킵(--quick)' : '미확정',
    '⑨btrainNo↔trainNo': '미확정',
    '⑩일괄ALL': '미확정',
  };

  // ── ① 키 유효성 (양 포털) ────────────────────────────────────────────────
  console.log('① 키 유효성 — swopenAPI(도착 강남) + openapi(역사마스터 후보 스윕)');
  try {
    const res = await callJson(buildSwopenUrls(['realtimeStationArrival', '0', '30', encodeURIComponent('강남')]));
    arrivalGangnam = captureArrival(res.json);
    await dump('01a-swopen-arrival-gangnam', {
      requestUrl: res.requestUrl,
      status: res.status,
      parseError: res.parseError,
      capture: arrivalGangnam,
      json: res.json,
    });
    console.log(
      `   swopen: code=${arrivalGangnam.code} msg="${arrivalGangnam.message}" items=${arrivalGangnam.count} subwayIds=[${arrivalGangnam.subwayIds.join(',')}]`,
    );
  } catch (e) {
    console.error(`   swopen 도착 조회 실패: ${errMsg(e)}`);
  }

  // 역사마스터 후보 스윕: 첫 좌표-보유 응답을 채택. 어떤 후보가 인증/좌표를 주는지 전부 기록.
  const candidateReport: { service: string; code: string | null; rows: number; coordFields: string; keys: string }[] = [];
  for (const cand of MASTER_CANDIDATES) {
    try {
      const res = await callJson(buildSeoulOpenUrls([cand.service, '1', '5', ...cand.extra]));
      const parsed = readSeoulResult(res.json, cand.service);
      const coordStats = analyzeNumericFields(parsed.rows).filter((f) => f.verdict.startsWith('WGS84'));
      const hasCoords = coordStats.length >= 2; // 위도+경도 둘 다 있어야 좌표원.
      candidateReport.push({
        service: cand.service,
        code: parsed.code,
        rows: parsed.rows.length,
        coordFields: coordStats.map((f) => f.field).join(',') || '-',
        keys: parsed.rows[0] ? Object.keys(parsed.rows[0]).join(',') : '-',
      });
      await dump(`01b-master-candidate-${cand.service}`, {
        requestUrl: res.requestUrl,
        status: res.status,
        code: parsed.code,
        message: parsed.message,
        total: parsed.total,
        rowCount: parsed.rows.length,
        firstRow: parsed.rows[0] ?? null,
        json: res.json,
      });
      // extra 세그먼트가 필요한 후보(역명 검색형)는 전량 적재(④)가 불가능하므로
      // 마스터로는 채택하지 않는다 — 후보 리포트에만 남긴다.
      if (!masterService && hasCoords && parsed.rows.length > 0 && cand.extra.length === 0) {
        masterService = cand.service;
      }
    } catch (e) {
      candidateReport.push({ service: cand.service, code: `EXC: ${errMsg(e)}`, rows: 0, coordFields: '-', keys: '-' });
    }
  }
  console.table(candidateReport);
  const openapiAuthed = candidateReport.some((c) => c.code !== null && c.code !== 'INFO-100' && !c.code.startsWith('EXC'));
  const swopenValid = arrivalGangnam?.code === 'INFO-000' || arrivalGangnam?.code === 'INFO-200';
  console.log(`   → 채택 역사마스터 서비스: ${masterService ?? '없음(좌표 후보 실패)'}`);
  findings['①키-양포털'] =
    `swopen=${swopenValid ? '유효' : `미확정(code=${arrivalGangnam?.code ?? '?'})`}, ` +
    `openapi=${openapiAuthed ? '유효(인증 통과)' : '미확정(전 후보 INFO-100/예외)'}`;

  // ── ② 에러 모델 ──────────────────────────────────────────────────────────
  console.log('\n② 에러 모델 — 없는 역명(INFO-200) + 잘못된 서비스명');
  let info200Code: string | null = null;
  try {
    const res = await callJson(
      buildSwopenUrls(['realtimeStationArrival', '0', '30', encodeURIComponent('존재하지않는역xyz')]),
    );
    const st = readSwopenStatus(res.json);
    info200Code = st.code;
    await dump('02a-swopen-no-data', { requestUrl: res.requestUrl, status: res.status, json: res.json });
    console.log(`   없는 역명: code=${st.code} msg="${st.message}" (톱레벨단독=${!isObject(res.json) || !('realtimeArrivalList' in (res.json as object))})`);
  } catch (e) {
    console.error(`   없는 역명 조회 실패: ${errMsg(e)}`);
  }
  let badServiceCode: string | null = null;
  try {
    const res = await callJson(buildSeoulOpenUrls(['__NoSuchSubwayService__', '1', '5']));
    const parsed = readSeoulResult(res.json, '__NoSuchSubwayService__');
    badServiceCode = parsed.code;
    await dump('02b-openapi-bad-service', { requestUrl: res.requestUrl, status: res.status, json: res.json });
    console.log(`   잘못된 서비스명: code=${parsed.code} msg="${parsed.message}"`);
  } catch (e) {
    console.error(`   잘못된 서비스명 조회 실패: ${errMsg(e)}`);
  }
  findings['②에러모델'] =
    `없는역명 code=${info200Code ?? '?'} (INFO-200 기대), 잘못된서비스 code=${badServiceCode ?? '?'} (ERROR-310 기대)`;

  // ── ④(prep) 역사마스터 전량 — ③ 대조에 필요하므로 먼저 적재 ─────────────────
  // 브리프상 ④ 항목이나, ③ statnId 대조가 전량 마스터의 ID 필드를 요구해 선행.
  if (masterService) {
    try {
      const res = await callJson(buildSeoulOpenUrls([masterService, '1', '1000']));
      const parsed = readSeoulResult(res.json, masterService);
      masterRows = parsed.rows;
      await dump('04-master-full', {
        requestUrl: res.requestUrl,
        status: res.status,
        code: parsed.code,
        listTotalCount: parsed.total,
        rowCount: parsed.rows.length,
        firstRow: parsed.rows[0] ?? null,
      });
      console.log(`\n(④ prep) 역사마스터 전량: ${masterService} total=${parsed.total} rows=${parsed.rows.length}`);
    } catch (e) {
      console.error(`\n(④ prep) 역사마스터 전량 조회 실패: ${errMsg(e)}`);
    }
  } else {
    console.log('\n(④ prep) 채택된 역사마스터 서비스가 없어 전량 적재 생략 — ③/④ 부분 판정');
  }

  // ── ③ statnId 대조 (최우선) ──────────────────────────────────────────────
  console.log('\n③ statnId 대조 — realtimePosition(2호선) + 도착 statnId ↔ 역사마스터 역ID');
  try {
    const res = await callJson(buildSwopenUrls(['realtimePosition', '0', '100', encodeURIComponent('2호선')]));
    position2 = capturePosition(res.json);
    await dump('03-position-line2', {
      requestUrl: res.requestUrl,
      status: res.status,
      capture: position2,
      firstRow: position2.firstRow,
    });
    console.log(
      `   position(2호선): code=${position2.code} trains=${position2.count} statnId샘플=[${position2.statnIds.slice(0, 5).join(',')}] subwayIds=[${position2.subwayIds.join(',')}]`,
    );
  } catch (e) {
    console.error(`   realtimePosition(2호선) 실패: ${errMsg(e)}`);
  }
  const realtimeIds = new Set<string>([
    ...(position2?.statnIds ?? []),
    ...(arrivalGangnam?.statnIds ?? []),
  ]);
  const realtimeIdLen = uniq([...realtimeIds].map((v) => String(v.length))).join('/') || '?';
  if (masterRows.length > 0 && realtimeIds.size > 0) {
    const idFields = detectIdFields(masterRows, realtimeIds);
    console.table(idFields);
    const exact = idFields.find((f) => f.exactMatches > 0);
    const sameLen = idFields.find((f) => f.lengths.split('/').includes(realtimeIdLen));
    findings['③statnId대조'] = exact
      ? `동일 — 마스터 '${exact.field}' 필드가 실시간 statnId 와 값 일치(${exact.exactMatches}건 교집합, 길이=${realtimeIdLen})`
      : sameLen
        ? `부분일치 — 마스터 '${sameLen.field}' 가 자릿수(${realtimeIdLen})는 같으나 값 교집합 0 → (호선명+역명) 조인 플랜B 검토`
        : `불일치 — 실시간 statnId 길이=${realtimeIdLen} 와 일치하는 마스터 ID 필드 없음 → 플랜B 필수 (subwayIds=${[...new Set([...(position2?.subwayIds ?? []), ...(arrivalGangnam?.subwayIds ?? [])])].join(',')})`;
  } else {
    findings['③statnId대조'] = `미확정 — 실시간ID ${realtimeIds.size}개 / 마스터 ${masterRows.length}행 (한쪽 부재)`;
  }
  console.log(`   → ${findings['③statnId대조']}`);

  // ── ④ 역사마스터 요약 ────────────────────────────────────────────────────
  console.log('\n④ 역사마스터 — 필드/총건수/좌표/특수노선');
  if (masterRows.length > 0) {
    const lineField = detectLineField(masterRows);
    const coordStats = analyzeNumericFields(masterRows).filter((f) => f.verdict.startsWith('WGS84'));
    if (coordStats.length > 0) console.table(coordStats);
    const specials = ['신분당', '서해', 'GTX'].map(
      (s) => `${s}=${lineField.values.some((v) => v.includes(s)) ? '포함' : '없음'}`,
    );
    console.log(`   호선명 필드: ${lineField.field ?? '?'} (유니크 ${lineField.values.length}종)`);
    console.log(`   호선 표기: ${lineField.values.join(' / ')}`);
    console.log(`   특수노선: ${specials.join(', ')}`);
    findings['④역사마스터'] =
      `service=${masterService} rows=${masterRows.length}, 좌표필드=[${coordStats.map((f) => f.field).join(',') || '없음'}], 호선필드=${lineField.field ?? '?'}(${lineField.values.length}종), ${specials.join('/')}`;
  } else {
    findings['④역사마스터'] = '미확정 — 전량 적재 실패/미채택';
  }

  // ── ⑤ 호선명 param 표기 ──────────────────────────────────────────────────
  console.log('\n⑤ 호선명 표기 — realtimePosition 7종');
  const lineResults: { line: string; code: string | null; trains: number }[] = [];
  for (const line of LINE_NAME_SAMPLES) {
    if (line === '2호선' && position2) {
      lineResults.push({ line, code: position2.code, trains: position2.count });
      console.log(`   ${line}: (③ 재사용) code=${position2.code} trains=${position2.count}`);
      continue;
    }
    try {
      const res = await callJson(buildSwopenUrls(['realtimePosition', '0', '100', encodeURIComponent(line)]));
      const cap = capturePosition(res.json);
      lineResults.push({ line, code: cap.code, trains: cap.count });
      console.log(`   ${line}: code=${cap.code} trains=${cap.count} subwayIds=[${cap.subwayIds.join(',')}]`);
    } catch (e) {
      lineResults.push({ line, code: `EXC`, trains: 0 });
      console.error(`   ${line}: 실패 ${errMsg(e)}`);
    }
  }
  await dump('05-line-names', lineResults);
  const okLines = lineResults.filter((r) => r.code === 'INFO-000').map((r) => r.line);
  findings['⑤호선명표기'] = `INFO-000(데이터 수신)=[${okLines.join(',')}] / 그외=[${lineResults.filter((r) => r.code !== 'INFO-000').map((r) => `${r.line}:${r.code}`).join(', ')}]`;

  // ── ⑥ 역명 표기 함정 ─────────────────────────────────────────────────────
  console.log('\n⑥ 역명 함정 — 서울역 vs 서울, 총신대입구(이수)');
  const nameResults: { name: string; code: string | null; count: number }[] = [];
  for (const name of ['서울역', '서울', '총신대입구(이수)']) {
    try {
      const res = await callJson(buildSwopenUrls(['realtimeStationArrival', '0', '30', encodeURIComponent(name)]));
      const cap = captureArrival(res.json);
      nameResults.push({ name, code: cap.code, count: cap.count });
      console.log(`   "${name}": code=${cap.code} items=${cap.count} subwayIds=[${cap.subwayIds.join(',')}]`);
    } catch (e) {
      nameResults.push({ name, code: 'EXC', count: 0 });
      console.error(`   "${name}": 실패 ${errMsg(e)}`);
    }
  }
  await dump('06-name-traps', nameResults);
  findings['⑥역명함정'] = nameResults.map((r) => `"${r.name}"→${r.code}(${r.count})`).join(', ');

  // ── ⑦ 환승역 (왕십리) ────────────────────────────────────────────────────
  console.log('\n⑦ 환승역 — 왕십리 0/30 (한 콜에 전 호선?)');
  let arrivalWangsimni: ArrivalCapture | null = null;
  try {
    const res = await callJson(buildSwopenUrls(['realtimeStationArrival', '0', '30', encodeURIComponent('왕십리')]));
    arrivalWangsimni = captureArrival(res.json);
    await dump('07-transfer-wangsimni', {
      requestUrl: res.requestUrl,
      status: res.status,
      capture: arrivalWangsimni,
      firstRow: arrivalWangsimni.firstRow,
    });
    console.log(
      `   왕십리: total=${arrivalWangsimni.total} items=${arrivalWangsimni.count} subwayIds=[${arrivalWangsimni.subwayIds.join(',')}]`,
    );
    console.log(`   btrainSttus 집합: [${arrivalWangsimni.btrainSttus.join(', ')}]`);
    console.log(`   barvlDt 샘플: [${arrivalWangsimni.barvlDts.join(', ')}]`);
    findings['⑦환승역'] = `subwayIds=[${arrivalWangsimni.subwayIds.join(',')}](${arrivalWangsimni.subwayIds.length}개 호선), btrainSttus=[${arrivalWangsimni.btrainSttus.join(',')}], items=${arrivalWangsimni.count}`;
  } catch (e) {
    console.error(`   왕십리 조회 실패: ${errMsg(e)}`);
    findings['⑦환승역'] = `실패: ${errMsg(e)}`;
  }

  // ── ⑧ recptnDt 변화 주기 ─────────────────────────────────────────────────
  console.log('\n⑧ recptnDt 주기 — realtimePosition(2호선) 15초 간격 2콜');
  if (QUICK) {
    console.log('   --quick 로 스킵');
  } else if (!position2) {
    console.log('   ③에서 position(2호선) 확보 실패 — 스킵');
    findings['⑧recptnDt주기'] = '미확정 — ③ position 부재';
  } else {
    try {
      console.log('   1콜차: ③ 재사용, 15초 대기 후 2콜차...');
      await sleep(15_000);
      const res = await callJson(buildSwopenUrls(['realtimePosition', '0', '100', encodeURIComponent('2호선')]));
      const cap2 = capturePosition(res.json);
      await dump('08-recptndt-second', { requestUrl: res.requestUrl, first: position2.recptnDts, second: cap2.recptnDts });
      const changed = cap2.recptnDts.some((d) => !position2!.recptnDts.includes(d));
      console.log(`   1콜차 recptnDt: [${position2.recptnDts.join(', ')}]`);
      console.log(`   2콜차 recptnDt: [${cap2.recptnDts.join(', ')}]`);
      findings['⑧recptnDt주기'] = changed
        ? '15초 내 recptnDt 변화 관측 → 30s 폴링/28s tween 적정'
        : '15초 내 recptnDt 불변 → 원천 분 단위 갱신 의심, 폴링/tween 재조정 검토';
    } catch (e) {
      console.error(`   2콜차 실패: ${errMsg(e)}`);
      findings['⑧recptnDt주기'] = `실패: ${errMsg(e)}`;
    }
  }

  // ── ⑨ btrainNo ↔ trainNo 동일 체계 ──────────────────────────────────────
  console.log('\n⑨ btrainNo ↔ trainNo — 왕십리 도착(2호선) ∩ position(2호선)');
  if (arrivalWangsimni && position2) {
    // 왕십리 도착 중 2호선(subwayId 1002) 열차번호만 추리려면 원본 행이 필요하나,
    // 캡처는 전 호선 btrainNo 집합만 보관 — 교집합 자체가 '동일 체계' 신호다.
    const bset = new Set(arrivalWangsimni.btrainNos);
    const inter = position2.trainNos.filter((t) => bset.has(t));
    console.log(`   왕십리 btrainNo ${bset.size}개, 2호선 position trainNo ${position2.trainNos.length}개, 교집합 ${inter.length}개`);
    console.log(`   교집합 샘플: [${inter.slice(0, 8).join(', ')}]`);
    findings['⑨btrainNo↔trainNo'] =
      inter.length > 0
        ? `동일 체계 — 교집합 ${inter.length}건 (7차 도착↔열차 연계 가능)`
        : '교집합 0 — 동일 체계 미확인(운행 타이밍 차이일 수 있어 재확인 필요, 7차 연계 게이트 보류)';
  } else {
    findings['⑨btrainNo↔trainNo'] = '미확정 — ⑦ 도착 또는 ③ position 부재';
  }
  console.log(`   → ${findings['⑨btrainNo↔trainNo']}`);

  // ── ⑩ 일괄 ALL ───────────────────────────────────────────────────────────
  console.log('\n⑩ 일괄 ALL — realtimeStationArrival/ALL (실패 시 0/1000/ALL)');
  const tryAll = async (segments: string[], label: string): Promise<boolean> => {
    const res = await callJson(buildSwopenUrls(segments));
    const st = readSwopenStatus(res.json);
    const items = readSwopenList(res.json, 'realtimeArrivalList');
    const usable = st.code === 'INFO-000' && items.length > 0;
    await dump(`10-all-${label}`, {
      requestUrl: res.requestUrl,
      status: res.status,
      code: st.code,
      message: st.message,
      bytes: res.rawText.length,
      itemCount: items.length,
      rawHead: res.rawText.slice(0, 1000),
    });
    console.log(`   ${label}: code=${st.code} bytes=${res.rawText.length} items=${items.length}`);
    return usable;
  };
  try {
    let ok = await tryAll(['realtimeStationArrival', 'ALL'], 'plain');
    if (!ok) ok = await tryAll(['realtimeStationArrival', '0', '1000', 'ALL'], 'ranged');
    findings['⑩일괄ALL'] = ok ? '동작 — 일괄(ALL) escape hatch 사용 가능' : '미동작 — 두 형태 모두 데이터 없음/에러 (덤프 확인)';
  } catch (e) {
    console.error(`   ALL 조회 실패: ${errMsg(e)}`);
    findings['⑩일괄ALL'] = `실패: ${errMsg(e)}`;
  }

  // ── 종합 verdict ─────────────────────────────────────────────────────────
  console.log('\n=== 종합 verdict (①~⑩) ===');
  for (const [k, v] of Object.entries(findings)) {
    console.log(`   ${k}: ${v}`);
  }
  console.log('\n   코드 반영 체크리스트:');
  console.log('   - [ ] subway-api.adapter.ts INFO-200 을 NO_RESULT(빈 배열 정상)로 분류 — ② 확정 코드 반영');
  console.log('   - [ ] statnId ↔ 마스터 조인 전략 확정 (③ 동일=PK조인 / 불일치=호선명+역명 플랜B)');
  console.log('   - [ ] SUBWAY_LINES 상수 표기를 ④ 호선필드/⑤ param 표기와 정렬');
  console.log('   - [ ] realtimeName 오버라이드 필요 역 목록 (⑥ 서울역/서울 등)');
  console.log('   - [ ] 폴링/tween 주기 (⑧ recptnDt 실측 반영)');
  console.log('   - [ ] 7차 도착↔열차 연계 게이트 (⑨ btrainNo↔trainNo)');
  console.log('   - [ ] __fixtures__/*.json 을 data/subway-probe 실덤프 기반으로 작성');
  console.log('');
};

main().catch((e) => {
  console.error(errMsg(e));
  process.exitCode = 1;
});
