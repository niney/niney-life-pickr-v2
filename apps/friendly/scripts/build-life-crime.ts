// 일상지도 범죄 통계(배경 레이어) 빌드 — 경찰청 「범죄 발생 지역별 통계」 CSV + 행안부 주민등록
// 인구 CSV + 시군구 경계 코드표(웹 sigungu-geo.json) → src/modules/life-map/data/life-crime-stats.json.
// DB 적재가 아니라 커밋되는 정적 JSON(60KB 안팎)이라 운영 배포 단계가 없다 — 로컬에서 만들고 커밋.
//
// 실행: pnpm --filter friendly build:life-crime [--crime=<csv>] [--pop=<csv>] [--geo=<json>] [--out=<json>] [--dry-run]
//   --crime  경찰청 지역별 CSV(CP949). 기본: data/open/crime/ 또는 data/open/ 의
//            "…범죄 발생 지역별 통계_YYYYMMDD.csv" 중 날짜가 가장 늦은 것. 연도는 파일명 날짜에서.
//   --pop    행안부 월간 인구 CSV(전체시군구현황, CP949). 기본 data/open/crime/population-<연도>12.csv —
//            없으면 jumin.mois.go.kr 에서 그 연도 12월분을 내려받아 저장한다(로그인·키 불필요).
//   --geo    시군구 경계 GeoJSON(code·name). 기본 apps/web/public/sigungu-geo.json.
//   --dry-run  리포트만.
// 원본 CSV 는 리포에 넣지 않는다(data/open/ 은 .gitignore) — docs/data-sources.md.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLifeCrimeStats, type LifeCrimeBoundary } from '../src/modules/life-map/life-crime-build.js';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const OPEN_DIR = resolve(REPO_ROOT, 'data/open');
const CRIME_DIR = resolve(OPEN_DIR, 'crime');
const DEFAULT_GEO = resolve(REPO_ROOT, 'apps/web/public/sigungu-geo.json');
const DEFAULT_OUT = resolve(REPO_ROOT, 'apps/friendly/src/modules/life-map/data/life-crime-stats.json');
const CRIME_FILE_RE = /범죄 발생 지역별 통계_(\d{4})(\d{2})(\d{2})\.csv$/;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

// BOM 이면 UTF-8, 아니면 CP949 로 풀어 헤더 표식이 보이는지로 판정(공공데이터 CSV 관례).
const decodeCsv = (buf: Uint8Array, marker: string): string => {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder('utf-8').decode(buf);
  const eucKr = new TextDecoder('euc-kr').decode(buf);
  if (eucKr.slice(0, 500).includes(marker)) return eucKr;
  return new TextDecoder('utf-8').decode(buf);
};

// 기본 경찰청 CSV — 두 디렉터리에서 패턴에 맞는 파일 중 날짜 최신.
const findLatestCrimeCsv = (): string | null => {
  const found: { path: string; date: string }[] = [];
  for (const dir of [CRIME_DIR, OPEN_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = CRIME_FILE_RE.exec(f);
      if (m) found.push({ path: resolve(dir, f), date: `${m[1]}${m[2]}${m[3]}` });
    }
  }
  found.sort((a, b) => b.date.localeCompare(a.date));
  return found[0]?.path ?? null;
};

// 행안부 주민등록 인구통계 — 월간현황 "전체시군구현황" CSV 다운로드 폼을 그대로 재현한다
// (statMonth.do 의 #formXlsDown → downloadCsv.do, xlsStats=2). 응답은 CP949.
const downloadPopulationCsv = async (year: number, month: number, out: string): Promise<void> => {
  const mm = String(month).padStart(2, '0');
  const body = new URLSearchParams({
    sltOrgType: '1',
    sltOrgLvl1: 'A',
    sltOrgLvl2: '',
    gender: 'gender',
    genderPer: 'genderPer',
    generation: 'generation',
    sltUndefType: '',
    searchYearStart: String(year),
    searchMonthStart: mm,
    searchYearEnd: String(year),
    searchMonthEnd: mm,
    sltOrderType: '1',
    sltOrderValue: 'ASC',
    category: 'month',
  });
  const res = await fetch('https://jumin.mois.go.kr/downloadCsv.do?searchYearMonth=month&xlsStats=2', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://jumin.mois.go.kr/statMonth.do',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`인구 CSV 다운로드 실패: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const text = decodeCsv(buf, '행정구역');
  if (!text.slice(0, 200).includes('행정구역')) throw new Error('인구 CSV 응답이 예상 형식이 아닙니다(헤더에 행정구역 없음).');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
};

const main = async (): Promise<void> => {
  const crimePath = opt('crime') ? resolve(opt('crime')!) : findLatestCrimeCsv();
  if (!crimePath || !existsSync(crimePath)) {
    console.error('경찰청 지역별 CSV 를 찾지 못했습니다. --crime=<경로> 를 주거나 data/open/crime/ 에 두세요.');
    process.exitCode = 1;
    return;
  }
  const dateMatch = CRIME_FILE_RE.exec(basename(crimePath));
  const year = opt('year') ? Number(opt('year')) : dateMatch ? Number(dateMatch[1]) : NaN;
  if (!Number.isInteger(year)) {
    console.error('통계 연도를 파일명(…_YYYYMMDD.csv)에서 못 읽었습니다. --year=YYYY 를 주세요.');
    process.exitCode = 1;
    return;
  }
  const popPath = resolve(opt('pop') ?? resolve(CRIME_DIR, `population-${year}12.csv`));
  const geoPath = resolve(opt('geo') ?? DEFAULT_GEO);
  const outPath = resolve(opt('out') ?? DEFAULT_OUT);

  console.log(`\n=== 일상지도 범죄 통계 빌드 ${DRY_RUN ? '(--dry-run)' : ''} ===`);
  console.log(`경찰청 CSV: ${crimePath} (통계 연도 ${year})`);
  if (!existsSync(popPath)) {
    console.log(`인구 CSV 없음 → 행안부에서 ${year}-12 전체시군구현황 다운로드: ${popPath}`);
    await downloadPopulationCsv(year, 12, popPath);
  }
  console.log(`인구 CSV: ${popPath}`);
  console.log(`경계: ${geoPath}`);

  const crimeCsv = decodeCsv(readFileSync(crimePath), '범죄대분류');
  const populationCsv = decodeCsv(readFileSync(popPath), '행정구역');
  const popHeader = populationCsv.split(/\r?\n/, 1)[0] ?? '';
  const popBase = /(\d{4})년(\d{2})월/.exec(popHeader);
  const populationBase = popBase ? `${popBase[1]}-${popBase[2]}` : `${year}-12`;
  const geo = JSON.parse(readFileSync(geoPath, 'utf8')) as { features: { properties: { code: string; name: string } }[] };
  const boundaries: LifeCrimeBoundary[] = geo.features.map((f) => ({ code: String(f.properties.code), name: String(f.properties.name) }));

  const { stats, report } = buildLifeCrimeStats({ crimeCsv, populationCsv, boundaries, year, populationBase });

  console.log(`\n[집계] 시군구 ${report.regionCount}곳 · 인구 기준 ${populationBase} · 대분류 행 강력 ${report.majorRows.violent}·절도 ${report.majorRows.theft}·폭력 ${report.majorRows.assault}`);
  console.log(`[제외 열] ${report.skippedColumns.length}개: ${report.skippedColumns.join(', ') || '-'}`);
  if (report.noBoundary.length > 0) console.log(`[경계 없음] ${report.noBoundary.join(', ')}`);
  if (report.noPopulation.length > 0) console.log(`[인구 없음] ${report.noPopulation.join(', ')}`);
  console.log(`[시→구 분배] ${report.multiCode.length}개: ${report.multiCode.map((m) => `${m.label}(${m.codes.length})`).join(', ')}`);
  console.log(`[안 쓰인 경계] ${report.unusedBoundaries.length}개: ${report.unusedBoundaries.map((b) => `${b.code} ${b.name}`).join(', ') || '-'}`);
  console.log(`[분위 경계/10만 명당] 전체 ${stats.breaks.total.join(' · ')} / 강력 ${stats.breaks.violent.join(' · ')} / 절도 ${stats.breaks.theft.join(' · ')} / 폭력 ${stats.breaks.assault.join(' · ')}`);
  const top = [...stats.regions].sort((a, b) => a.rank.total - b.rank.total).slice(0, 5);
  console.log(`[전체 발생률 상위 5] ${top.map((r) => `${r.label} ${r.per100k.total}`).join(' · ')}`);

  if (DRY_RUN) {
    console.log('\n--dry-run — 저장 생략. 종료.');
    return;
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(stats)}\n`);
  console.log(`\n저장: ${outPath} (${(Buffer.byteLength(JSON.stringify(stats)) / 1024).toFixed(1)}KB)`);
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
