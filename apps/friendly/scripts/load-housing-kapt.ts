// 집값 — K-apt 단지 속성 보강(분양형태·난방·승강기 + 비어 있는 세대수·동수·사용승인일·도로명주소).
// 입력은 둘 중 하나:
//   파일  국토교통부 '공동주택 관리비 공개 의무단지 정보'(data.go.kr 15098979, 주 1회 xlsx/csv, ≈1.9만 단지)
//         또는 K-apt 에서 받은 엑셀 — 열 이름이 배포본마다 달라 키워드로 찾는다(--dry-run 이 인식 결과를 찍는다).
//   API   --source=api — 단지 목록(15057332) 전량 + 매칭된 단지의 기본정보(15058453)·상세 각 1콜.
//         키 DATA_GO_KR_API_KEY, 개발계정 일 5,000건 → --max-calls 로 나눠 며칠에 걸쳐 채운다.
//
// 실행: pnpm --filter friendly load:housing-kapt [xlsx|csv] [옵션]
//   파일 기본       <리포>/data/open/housing/ 의 '*단지_기본정보*.xlsx'(포털 다운로드 이름, 여러 개면 최신) → 없으면 kapt-mandatory.xlsx
//   --sheet=<이름>  xlsx 시트(기본 첫 시트)
//   --dry-run       열 인식·정규화·매칭 리포트만(DB 쓰기 없음 — API 면 목록 호출은 나간다)
//   --source=api    파일 대신 API
//   --max-calls=N   API 호출 상한   --pause=N  호출 간격 ms(기본 120)
//   --force         이미 kaptCode·난방이 채워진 단지도 다시 조회(API)
//   --probe         API 1콜씩(목록 1페이지 → 첫 단지 기본정보·상세)만 찍고 종료 — 활용신청·필드 확인용

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { parseCsv } from '../src/lib/csv.js';
import { parseXlsx } from '../src/lib/xlsx.js';
import { decodeHousingCsv } from '../src/modules/housing/housing-complex-master.service.js';
import {
  applyKaptMatches,
  kaptRowFromApi,
  loadKaptMatchComplexes,
  matchKaptRows,
  normalizeKaptRows,
  resolveKaptColumns,
  type KaptRow,
} from '../src/modules/housing/housing-kapt-master.service.js';
import {
  KaptApiAuthError,
  fetchAllKaptList,
  fetchKaptBasicInfo,
  fetchKaptDetailInfo,
  fetchKaptListPage,
  type KaptListItem,
} from '../src/modules/housing/kapt.adapter.js';
import { isDataGoTransient } from '../src/modules/housing/datago-json.adapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../../data/open/housing');

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const strOpt = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const numOpt = (name: string): number | undefined => {
  const raw = strOpt(name);
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};
// 포털이 주는 파일명은 '20260828_단지_기본정보.xlsx' 처럼 날짜가 앞에 붙는다 — 이름을 바꾸지 않아도 찾도록
// 표준 폴더에서 그 패턴의 최신(사전순 마지막) 파일을 고른다.
const defaultKaptFile = (): string => {
  const dated = existsSync(DATA_DIR) ? readdirSync(DATA_DIR).filter((f) => /단지_기본정보.*\.xlsx$/i.test(f)).sort() : [];
  return resolve(DATA_DIR, dated.at(-1) ?? 'kapt-mandatory.xlsx');
};
const filePath = args.find((a) => !a.startsWith('--')) ?? defaultKaptFile();
const SOURCE = strOpt('source') === 'api' ? 'api' : 'file';
const DRY_RUN = flag('dry-run');
const FORCE = flag('force');
const PROBE = flag('probe');
const MAX_CALLS = numOpt('max-calls') ?? Number.POSITIVE_INFINITY;
const PAUSE_MS = numOpt('pause') ?? 120;
const KEY = process.env.DATA_GO_KR_API_KEY ?? '';

const prisma = new PrismaClient();
const fmt = (n: number): string => n.toLocaleString('ko-KR');
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const readTable = (): { header: string[]; rows: string[][] } => {
  if (!existsSync(filePath)) throw new Error(`파일이 없습니다: ${filePath} — data.go.kr 15098979 에서 받아 data/open/housing/ 에 두세요.`);
  const buf = readFileSync(filePath);
  const table = extname(filePath).toLowerCase() === '.xlsx' ? parseXlsx(buf, strOpt('sheet')) : parseCsv(decodeHousingCsv(buf));
  return skipNoticeRows(table);
};

// K-apt 포털 xlsx 는 1행이 안내문("해당 자료는 … 매주 금요일에 추출한 자료이며 …")이고 실제 헤더는 그 아래다 —
// 단지코드·단지명 열이 보이는 첫 행을 헤더로 삼는다(최대 5행 탐색).
const skipNoticeRows = (table: { header: string[]; rows: string[][] }): { header: string[]; rows: string[][] } => {
  const isHeader = (h: string[]): boolean => {
    const c = resolveKaptColumns(h);
    return c.kaptCode !== null && c.name !== null;
  };
  if (isHeader(table.header)) return table;
  for (let i = 0; i < Math.min(5, table.rows.length); i += 1) {
    if (isHeader(table.rows[i]!)) return { header: table.rows[i]!, rows: table.rows.slice(i + 1) };
  }
  return table;
};

const printMatchReport = (r: ReturnType<typeof matchKaptRows>['report']): void => {
  console.log(
    `\n[매칭] 행 ${fmt(r.rows)} → 단지 ${fmt(r.matched)} (지번 ${fmt(r.byJibun)} · 이름 ${fmt(r.byName)} · 도로명 ${fmt(r.byRoad)}) · 모호 ${fmt(r.ambiguous)} · 중복 ${fmt(r.duplicateTargets)} · 미매칭 ${fmt(r.unmatched)}`,
  );
};

const runFile = async (): Promise<void> => {
  console.log(`\n=== 집값 K-apt 속성 적재(파일) ${DRY_RUN ? '(--dry-run)' : ''} ===\n파일: ${filePath}`);
  const table = readTable();
  const norm = normalizeKaptRows(table.header, table.rows);
  console.log(`행 ${fmt(table.rows.length)} · 열 ${table.header.length}`);
  console.log('[열 인식]');
  for (const [k, v] of Object.entries(norm.columns)) {
    if (k === 'unrecognized') continue;
    console.log(`  ${k}: ${v === null ? '-' : `${v} (${table.header[v as number]})`}`);
  }
  if (norm.columns.unrecognized.length > 0) console.log(`  미인식: ${norm.columns.unrecognized.join(', ')}`);
  console.log(`[정규화] 채택 ${fmt(norm.rows.length)} · 코드 없음 ${fmt(norm.droppedNoCode)} · 이름 없음 ${fmt(norm.droppedNoName)} · 중복 ${fmt(norm.duplicates)}`);
  console.log('[분양형태]');
  for (const [k, n] of [...norm.bySaleType.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${fmt(n)}`);

  const complexes = await loadKaptMatchComplexes(prisma);
  const { matches, report } = matchKaptRows(norm.rows, complexes);
  printMatchReport(report);
  if (DRY_RUN) {
    console.log('\n--dry-run — 적재 생략. 종료.');
    return;
  }
  const { updated } = await applyKaptMatches(prisma, matches, { sourceFile: basename(filePath) });
  console.log(`\nHousingComplex 갱신 ${fmt(updated)}단지 + 적재 이력(HousingSync kapt) 기록`);
};

const runProbe = async (): Promise<void> => {
  console.log('\n=== K-apt API 프로브(3콜) ===');
  const page = await fetchKaptListPage({ pageNo: 1, numOfRows: 3 }, { serviceKey: KEY });
  console.log(`목록: totalCount ${fmt(page.totalCount)} · ${page.requestUrl}`);
  console.log(JSON.stringify(page.items.slice(0, 2), null, 1));
  const first = page.items[0];
  if (!first) return;
  const basic = await fetchKaptBasicInfo(first.kaptCode, { serviceKey: KEY });
  console.log(`기본정보 필드: ${basic ? Object.keys(basic.raw).join(', ') : '(0건)'}`);
  if (basic) console.log(JSON.stringify(kaptRowFromApi(first, basic, null), null, 1));
  const detail = await fetchKaptDetailInfo(first.kaptCode, { serviceKey: KEY });
  console.log(`상세 필드: ${detail ? Object.keys(detail.raw).join(', ') : '(0건)'}`);
};

const runApi = async (): Promise<void> => {
  if (!KEY) throw new Error('DATA_GO_KR_API_KEY가 없습니다 — .env 확인.');
  if (PROBE) return runProbe();
  console.log(`\n=== 집값 K-apt 속성 적재(API) ${DRY_RUN ? '(--dry-run)' : ''}${FORCE ? ' (--force)' : ''} ===`);
  let calls = 0;
  const t0 = Date.now();
  const list = await fetchAllKaptList({
    serviceKey: KEY,
    onPage: (p) => console.log(`  … 목록 ${p.pageNo}페이지 · ${fmt(p.fetched)}/${fmt(p.totalCount)}`),
  });
  calls += list.calls;
  console.log(`단지 목록 ${fmt(list.items.length)}개 (${list.calls}콜)`);

  // 목록만으로 1차 매칭(이름·읍면동) → 매칭된 단지 중 채울 것이 있는 단지만 기본정보·상세를 받는다.
  const complexes = await loadKaptMatchComplexes(prisma);
  const listRows = list.items.map((i) => kaptRowFromApi(i, null, null));
  const pre = matchKaptRows(listRows, complexes);
  printMatchReport(pre.report);
  const filled = new Set(
    (
      await prisma.housingComplex.findMany({
        where: { kind: 'apt', kaptCode: { not: null }, heating: { not: null } },
        select: { id: true },
      })
    ).map((c) => c.id),
  );
  const byCode = new Map<string, KaptListItem>(list.items.map((i) => [i.kaptCode, i]));
  const todo = [...pre.matches.entries()].filter(([id]) => FORCE || !filled.has(id));
  console.log(`기본정보 대상 ${fmt(todo.length)}단지(이미 채워진 ${fmt(pre.matches.size - todo.length)} 건너뜀) · 단지당 2콜`);
  if (DRY_RUN) {
    console.log('\n--dry-run — 기본정보 호출·적재 생략. 종료.');
    return;
  }
  const full = new Map<string, KaptRow>();
  let transient = 0;
  for (const [complexId, row] of todo) {
    if (calls + 2 > MAX_CALLS) {
      console.log(`  호출 상한(${fmt(MAX_CALLS)}) — 여기서 멈춥니다. 다시 실행하면 안 채워진 단지부터 이어갑니다.`);
      break;
    }
    const item = byCode.get(row.kaptCode)!;
    try {
      const basic = await fetchKaptBasicInfo(row.kaptCode, { serviceKey: KEY });
      calls += 1;
      const detail = await fetchKaptDetailInfo(row.kaptCode, { serviceKey: KEY });
      calls += 1;
      full.set(complexId, kaptRowFromApi(item, basic, detail));
    } catch (e) {
      if (e instanceof KaptApiAuthError) throw e;
      if (!isDataGoTransient(e)) throw e;
      transient += 1;
      if (transient >= 10) throw new Error(`일시 장애 연속 — 중단: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
      continue;
    }
    if (full.size % 100 === 0) console.log(`  … ${fmt(full.size)}/${fmt(todo.length)} · 호출 ${fmt(calls)}`);
    if (PAUSE_MS > 0) await sleep(PAUSE_MS);
  }
  const { updated } = await applyKaptMatches(prisma, full, { sourceFile: 'kapt:api' });
  console.log(`\nHousingComplex 갱신 ${fmt(updated)}단지 · 호출 ${fmt(calls)} · 일시 오류 ${transient} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

(SOURCE === 'api' ? runApi() : runFile())
  .catch((e) => {
    if (e instanceof KaptApiAuthError) {
      console.error(`\nK-apt 인증 실패(${e.code}): ${e.message}`);
      if (e.code === '30') console.error('→ data.go.kr 15057332(단지 목록)·15058453(기본 정보) 활용신청 여부와 승인 반영(수십 분)을 확인하세요.');
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
