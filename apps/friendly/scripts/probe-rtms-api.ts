// 국토교통부 실거래가 API 프로브 — 키 등록(활용신청 반영)·페이지 크기 상한·응답 필드 인벤토리를 실응답으로
// 확인한다. 매매 상세·전월세 각 1콜(종로구 11110, 지난달). 키는 마스킹해 출력.
// 실행: pnpm --filter friendly probe:rtms [--lawd=11110] [--ym=YYYYMM] [--rows=2000]

import { housingCurrentYm, housingYmAdd } from '@repo/utils';
import { RtmsApiAuthError, RtmsApiError, fetchRtmsPage, type RtmsOp } from '../src/modules/housing/rtms.adapter.js';

const args = process.argv.slice(2);
const strOpt = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const LAWD = strOpt('lawd') ?? '11110';
const YM = strOpt('ym') ?? housingYmAdd(housingCurrentYm(), -1);
const ROWS = Number(strOpt('rows') ?? 2000);
const KEY = process.env.DATA_GO_KR_API_KEY ?? '';

const main = async (): Promise<void> => {
  if (!KEY) {
    console.error('DATA_GO_KR_API_KEY가 없습니다 — .env 확인.');
    process.exitCode = 1;
    return;
  }
  console.log(`\n=== RTMS 프로브 — LAWD_CD ${LAWD} · DEAL_YMD ${YM} · numOfRows ${ROWS} ===`);
  for (const op of ['trade', 'rent'] as RtmsOp[]) {
    const t0 = Date.now();
    try {
      const page = await fetchRtmsPage({ op, lawdCd: LAWD, dealYmd: YM, pageNo: 1, numOfRows: ROWS }, { serviceKey: KEY });
      const cap = page.items.length > 0 && page.items.length < ROWS && page.items.length < page.totalCount ? page.items.length : null;
      console.log(
        `\n[${op}] ${page.requestUrl}\n  totalCount ${page.totalCount} · items ${page.items.length} · numOfRows 에코 ${page.numOfRows} · 페이지 상한 ${cap ?? '없음(한 번에 전부)'} (${Date.now() - t0}ms)`,
      );
      const fields = new Map<string, string>();
      for (const it of page.items.slice(0, 50)) {
        for (const [k, v] of Object.entries(it)) if (!fields.has(k) || (fields.get(k) === '' && v)) fields.set(k, v);
      }
      console.log('  필드:');
      for (const [k, v] of [...fields.entries()].sort()) console.log(`    ${k} = ${JSON.stringify(v)}`);
    } catch (e) {
      if (e instanceof RtmsApiAuthError) {
        console.error(`\n[${op}] 인증 실패(${e.code}): ${e.message}\n  ${e.requestUrl}`);
        if (e.code === '30') console.error('  → 해당 데이터셋 활용신청이 없거나 승인 반영 전(수십 분).');
      } else if (e instanceof RtmsApiError) {
        console.error(`\n[${op}] 오류(${e.code ?? '-'}): ${e.message}\n  ${e.requestUrl}\n  ${e.responseText ?? ''}`);
      } else {
        console.error(`\n[${op}]`, e);
      }
      process.exitCode = 1;
    }
  }
};

void main();
