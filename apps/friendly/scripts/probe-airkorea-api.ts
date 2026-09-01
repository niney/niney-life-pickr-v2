// 에어코리아 대기오염정보 API 1회성 프로브 — 5개 오퍼레이션을 실호출해 응답 형식·
// 건수·값 분포를 요약하고 원문을 data/airkorea-probe/*.json 에 덤프한다(gitignore).
// 키 승인 상태 판별(인증 30/20 vs 정상)과 게이트웨이 타임아웃(05) 빈도 확인용.
//
//   pnpm --filter friendly probe:airkorea
//
// 쿼터: 개발계정 일 500건 중 이 스크립트는 7~8콜(재시도 포함 최대 ~16) 을 쓴다.
// env.ts 전체 검증(DATABASE_URL 등)은 프로브에 불필요 — 키만 직접 읽는다.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AirKoreaApiAuthError,
  AirKoreaApiError,
  getBadStations,
  getDustForecast,
  getSidoRealtime,
  getStationList,
  getStationRealtime,
  getWeeklyForecast,
  type RawAirMeasureRow,
} from '../src/modules/air-quality/airkorea-api.adapter.js';

const KEY = process.env.DATA_GO_KR_API_KEY ?? '';
if (!KEY) {
  console.error('DATA_GO_KR_API_KEY 가 비어 있습니다 — .env 를 확인하세요.');
  process.exit(1);
}
const opts = { serviceKey: KEY };

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'data', 'airkorea-probe');
mkdirSync(OUT_DIR, { recursive: true });
const dump = (name: string, value: unknown): void => {
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(value, null, 1));
};

const todayKst = (offsetDays = 0): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86_400_000));

const count = <T>(xs: T[], key: (x: T) => string | null): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const x of xs) {
    const k = key(x) ?? '(null)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

const step = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
  const t0 = Date.now();
  try {
    const v = await fn();
    console.log(`✓ ${label} (${Date.now() - t0}ms)`);
    return v;
  } catch (e) {
    if (e instanceof AirKoreaApiAuthError) {
      console.error(`✗ ${label}: 인증 실패 — ${e.message}`);
      console.error(
        '  → data.go.kr 에서 15073861(대기오염정보) 활용신청이 승인됐는지, 키가 같은 계정 것인지 확인.',
      );
    } else if (e instanceof AirKoreaApiError) {
      console.error(`✗ ${label}: ${e.message} [code=${e.code ?? '-'}] url=${e.requestUrl ?? '-'}`);
    } else {
      console.error(`✗ ${label}:`, e);
    }
    return null;
  }
};

const main = async (): Promise<void> => {
  console.log(`에어코리아 프로브 — 키 길이 ${KEY.length}, 출력 ${OUT_DIR}\n`);

  // ① 시도별(전국) — 시도 라벨·측정망·Flag 분포.
  const all = await step('getCtprvnRltmMesureDnsty sidoName=전국 ver=1.5', () =>
    getSidoRealtime('전국', opts),
  );
  if (all) {
    const rows: RawAirMeasureRow[] = all.rows;
    dump('sido-all', rows);
    console.log(`  rows=${rows.length} pages=${all.pages}`);
    console.log('  sidoName:', count(rows, (r) => r.sidoName));
    console.log('  mangName:', count(rows, (r) => r.mangName));
    console.log('  pm10Flag:', count(rows, (r) => r.pm10Flag));
    console.log('  khaiGrade:', count(rows, (r) => r.khaiGrade));
    console.log('  dataTime:', count(rows, (r) => r.dataTime));
  }

  // ② 측정소별 DAILY — 최근 24시간 시계열.
  const station = process.argv[2] ?? '강남구';
  const daily = await step(`getMsrstnAcctoRltmMesureDnsty stationName=${station} dataTerm=DAILY`, () =>
    getStationRealtime(station, 'DAILY', opts),
  );
  if (daily) {
    dump('station-daily', daily.rows);
    console.log(
      `  rows=${daily.rows.length} total=${daily.totalCount} range=${daily.rows.at(-1)?.dataTime} ~ ${daily.rows[0]?.dataTime}`,
    );
  }

  // ③ 나쁨 이상 측정소.
  const bad = await step('getUnityAirEnvrnIdexSnstiveAboveMsrstnList', () => getBadStations(opts));
  if (bad) {
    dump('bad-stations', bad);
    console.log(`  rows=${bad.length}`, bad.slice(0, 5).map((b) => b.stationName));
  }

  // ④ 예보 — 오늘(없으면 어제).
  let fdate = todayKst();
  let forecast = await step(`getMinuDustFrcstDspth searchDate=${fdate}`, () =>
    getDustForecast(fdate, opts),
  );
  if (forecast && forecast.length === 0) {
    fdate = todayKst(-1);
    forecast = await step(`getMinuDustFrcstDspth searchDate=${fdate} (전일 폴백)`, () =>
      getDustForecast(fdate, opts),
    );
  }
  if (forecast) {
    dump('forecast', forecast);
    console.log(`  rows=${forecast.length}`, count(forecast, (r) => `${r.informCode}@${r.dataTime}`));
  }

  // ⑤ 주간예보 — 오늘(없으면 어제).
  let wdate = todayKst();
  let weekly = await step(`getMinuDustWeekFrcstDspth searchDate=${wdate}`, () =>
    getWeeklyForecast(wdate, opts),
  );
  if (weekly && weekly.length === 0) {
    wdate = todayKst(-1);
    weekly = await step(`getMinuDustWeekFrcstDspth searchDate=${wdate} (전일 폴백)`, () =>
      getWeeklyForecast(wdate, opts),
    );
  }
  if (weekly) {
    dump('weekly', weekly);
    console.log(`  rows=${weekly.length} presnatnDt=${weekly[0]?.presnatnDt} days=${weekly[0]?.days.map((d) => d.date).join(',')}`);
  }

  // ⑥ 측정소정보 API(15073877) — 별도 활용신청 필요. 좌표 축(dmX=위도?) 값 범위로 판정.
  const stations = await step('MsrstnInfoInqireSvc getMsrstnList (측정소정보 15073877)', () =>
    getStationList(opts),
  );
  if (stations) {
    dump('msrstn-list', stations.rows);
    const rows = stations.rows;
    const nums = (k: 'dmX' | 'dmY') =>
      rows.map((r) => Number(r[k])).filter((v) => Number.isFinite(v));
    const xs = nums('dmX');
    const ys = nums('dmY');
    console.log(`  rows=${rows.length} total=${stations.totalCount}`);
    console.log(`  dmX ${Math.min(...xs)}~${Math.max(...xs)} / dmY ${Math.min(...ys)}~${Math.max(...ys)}`);
    console.log(
      `  → ${xs.every((v) => v >= 33 && v <= 39) ? 'dmX=위도(WGS84)' : 'dmX 축 재확인 필요'}, ` +
        `${ys.every((v) => v >= 124 && v <= 132) ? 'dmY=경도' : 'dmY 축 재확인 필요'}`,
    );
    console.log('  keys:', Object.keys(rows[0] ?? {}).join(','));
    console.log('  mangName:', count(rows, (r) => r.mangName));
  } else {
    console.log(
      '  ※ 측정소정보 API 는 data.go.kr 15073877 활용신청이 따로 필요합니다(개발계정 자동승인,\n' +
        '    같은 계정 키 사용). 승인 후 이 프로브를 다시 돌려 dmX/dmY 축을 확인하세요.',
    );
  }

  console.log('\n완료 — 덤프:', OUT_DIR);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
