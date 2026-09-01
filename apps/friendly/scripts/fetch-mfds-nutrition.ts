// 식약처 전국통합식품영양성분정보(음식) 표준데이터(data.go.kr 15100070) 배포본을 받아
// `data/open/food/mfds-nutrition.csv` 로 저장한다.
//
// 실행: pnpm --filter friendly fetch:mfds-nutrition [--out=<경로>]
//
// 왜 필요한가: 포털의 "다운로드" 버튼은 정적 파일 링크가 아니라 브라우저 JS(std-download-manager.js)가
// JSON API 두 개(`/download/columList.json` → `/download/standard.json` 페이지)를 호출해 CSV 를
// 조립하는 방식이라 curl 로 바로 못 받는다. 같은 호출을 그대로 재현해 로더(load-food-catalog.ts,
// CSV_FIELD_MAP)가 읽는 한글 헤더 CSV 를 만든다. 서비스키·활용신청이 필요 없다(API 15100070 은
// 데이터셋별 활용신청이 없으면 `30 등록되지 않은 서비스키`). 원본은 리포에 넣지 않는다(data/open/ .gitignore).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PK = '15100070';
const PER_PAGE = 10000;
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const DEFAULT_OUT = resolve(REPO_ROOT, 'data/open/food/mfds-nutrition.csv');

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const OUT = resolve(opt('out') ?? DEFAULT_OUT);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Referer: `https://www.data.go.kr/data/${PK}/standard.do`,
};

interface ColumnHeader {
  totalCount: number | string;
  fileName: string;
  columList: { columNm: string; columCode: string }[];
  tableVO: { colNmList: string[]; svcTableNm: string };
}

const escapeCsv = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const main = async () => {
  const headerRes = await fetch(
    `https://www.data.go.kr/download/columList.json?pk=${PK}&ext=CSV`,
    { headers: HEADERS },
  );
  if (!headerRes.ok) throw new Error(`columList http ${headerRes.status}`);
  const header = (await headerRes.json()) as ColumnHeader;
  const total = Number(header.totalCount);
  if (!Number.isFinite(total) || total <= 0) throw new Error(`totalCount 이상: ${header.totalCount}`);
  const pages = Math.ceil(total / PER_PAGE);
  const headerKr = header.columList.map((c) => c.columNm);
  const headerEn = header.columList.map((c) => c.columCode);
  console.log(`[mfds-nutrition] total=${total} pages=${pages} cols=${headerKr.length}`);

  const lines = [headerKr.map(escapeCsv).join(',')];
  for (let page = 1; page <= pages; page += 1) {
    const qs = new URLSearchParams();
    for (const c of header.tableVO.colNmList) qs.append('colNmList', c);
    qs.set('totalCount', String(total));
    qs.set('svcTableNm', header.tableVO.svcTableNm);
    qs.set('perPage', String(PER_PAGE));
    qs.set('page', String(page));
    const res = await fetch(
      `https://www.data.go.kr/download/standard.json?publicDataPk=${PK}&${qs}`,
      { headers: HEADERS },
    );
    if (!res.ok) throw new Error(`standard.json page ${page} http ${res.status}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    console.log(`[mfds-nutrition] page ${page}/${pages}: ${rows.length} rows`);
    for (const r of rows) lines.push(headerEn.map((k) => escapeCsv(r[k])).join(','));
  }
  if (lines.length - 1 !== total) {
    console.warn(`[mfds-nutrition] 행 수 불일치: 받은 ${lines.length - 1} / 예고 ${total}`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  // BOM 포함 UTF-8 — 로더(decodeLifeCsv)가 BOM 을 보고 UTF-8 로 읽는다.
  writeFileSync(OUT, `\uFEFF${lines.join('\n')}`, 'utf-8');
  console.log(`[mfds-nutrition] wrote ${OUT} (${lines.length - 1} rows)`);
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
