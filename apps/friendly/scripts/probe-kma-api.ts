// 기상청 단기예보·중기예보 API 1회성 프로브 — 8개 오퍼레이션을 실호출해 응답 형식·건수·
// 항목(category) 분포를 요약하고 원문을 data/kma-probe/*.json 에 덤프한다(gitignore).
// 키 승인 상태(인증 30 vs 정상), 슬롯 제공 지연(NO_DATA), 중기 필드 범위(D+3 유무) 확인용.
//
//   pnpm --filter friendly probe:kma
//   pnpm --filter friendly probe:kma -- --nx 60 --ny 127 --ta 11B10101 --land 11B00000 --sea 12A20000
//
// 쿼터: 개발계정 일 10,000건(서비스별) 중 이 스크립트는 10콜 안팎.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  kmaMidTmFc,
  kmaUltraFcstBase,
  kmaUltraNcstBase,
  kmaVilageBase,
  weatherMidRegionForPlace,
  weatherPlaceById,
} from '@repo/utils';
import {
  KmaApiAuthError,
  KmaApiError,
  getFcstVersion,
  getMidFcst,
  getMidLandFcst,
  getMidSeaFcst,
  getMidTa,
  getUltraSrtFcst,
  getUltraSrtNcst,
  getVilageFcst,
} from '../src/modules/weather/kma-api.adapter.js';

const KEY = process.env.KMA_API_KEY || process.env.BUS_API_KEY || '';
if (!KEY) {
  console.error('KMA_API_KEY(또는 BUS_API_KEY) 가 비어 있습니다 — .env 를 확인하세요.');
  process.exit(1);
}
const opts = { serviceKey: KEY };

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const nx = Number(arg('nx', '60'));
const ny = Number(arg('ny', '127'));
const taId = arg('ta', '11B10101');
const place = weatherPlaceById(taId);
const mid = weatherMidRegionForPlace(place);
const landId = arg('land', mid?.land.regId ?? '11B00000');
const stnId = arg('stn', mid?.stnId ?? '109');
const seaId = arg('sea', '12A20000');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'data', 'kma-probe');
mkdirSync(OUT_DIR, { recursive: true });
const dump = (name: string, value: unknown): void => {
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(value, null, 1));
};

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
    if (e instanceof KmaApiAuthError) {
      console.log(`✗ ${label} — 인증/쿼터(503) ${e.message}`);
    } else if (e instanceof KmaApiError) {
      console.log(`✗ ${label} — 업스트림(${e.statusCode}) code=${e.code ?? '-'} ${e.message}`);
      if (e.responseText) console.log(`   본문: ${e.responseText.slice(0, 300)}`);
    } else {
      console.log(`✗ ${label} — ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  }
};

const now = new Date();
const ncstBase = kmaUltraNcstBase(now);
const ultraBase = kmaUltraFcstBase(now);
const vilageBase = kmaVilageBase(now);
const tmFc = kmaMidTmFc(now);
console.log(
  `격자 (${nx},${ny}) · 실황 ${ncstBase.date} ${ncstBase.time} · 초단기 ${ultraBase.time} · 단기 ${vilageBase.date} ${vilageBase.time} · 중기 tmFc ${tmFc}` +
    ` · 지점 ${place?.name ?? taId}(${taId}) 구역 ${landId} 전망 ${stnId} 해역 ${seaId}`,
);

// ① 초단기실황
const ncst = await step('① getUltraSrtNcst 초단기실황', () =>
  getUltraSrtNcst({ baseDate: ncstBase.date, baseTime: ncstBase.time, nx, ny }, opts),
);
if (ncst) {
  dump('ultra-ncst', ncst);
  console.log(`   noData=${ncst.noData} rows=${ncst.rows.length}`, ncst.rows.map((r) => `${r.category}=${r.obsrValue}`).join(' '));
}

// ② 초단기예보
const ultra = await step('② getUltraSrtFcst 초단기예보', () =>
  getUltraSrtFcst({ baseDate: ultraBase.date, baseTime: ultraBase.time, nx, ny }, opts),
);
if (ultra) {
  dump('ultra-fcst', ultra);
  console.log(`   noData=${ultra.noData} rows=${ultra.rows.length} categories=`, count(ultra.rows, (r) => r.category));
  const times = [...new Set(ultra.rows.map((r) => `${r.fcstDate}${r.fcstTime}`))];
  console.log(`   시각 ${times[0]} ~ ${times[times.length - 1]} (${times.length})`);
}

// ③ 단기예보
const vilage = await step('③ getVilageFcst 단기예보', () =>
  getVilageFcst({ baseDate: vilageBase.date, baseTime: vilageBase.time, nx, ny }, opts),
);
if (vilage) {
  dump('vilage', vilage);
  console.log(`   noData=${vilage.noData} rows=${vilage.rows.length} total=${vilage.totalCount} categories=`, count(vilage.rows, (r) => r.category));
  for (const c of ['PCP', 'SNO', 'PTY', 'SKY']) {
    console.log(`   ${c} 값 분포:`, count(vilage.rows.filter((r) => r.category === c), (r) => r.fcstValue));
  }
  const times = [...new Set(vilage.rows.map((r) => `${r.fcstDate}${r.fcstTime}`))];
  console.log(`   시각 ${times[0]} ~ ${times[times.length - 1]} (${times.length})`);
}

// ④ 예보 버전
for (const [ftype, base] of [
  ['ODAM', ncstBase],
  ['VSRT', ultraBase],
  ['SHRT', vilageBase],
] as const) {
  const rows = await step(`④ getFcstVersion ${ftype}`, () => getFcstVersion(ftype, `${base.date}${base.time}`, opts));
  if (rows) console.log('   ', rows);
}

// ⑤~⑧ 중기
const land = await step('⑤ getMidLandFcst 중기육상', () => getMidLandFcst(landId, tmFc, opts));
if (land) {
  dump('mid-land', land);
  console.log(`   noData=${land.noData} keys=`, Object.keys(land.rows[0]?.fields ?? {}).join(','));
}
const ta = await step('⑥ getMidTa 중기기온', () => getMidTa(place?.taRegId ?? taId, tmFc, opts));
if (ta) {
  dump('mid-ta', ta);
  console.log(`   noData=${ta.noData} keys=`, Object.keys(ta.rows[0]?.fields ?? {}).join(','));
}
const outlook = await step('⑦ getMidFcst 중기전망', () => getMidFcst(stnId, tmFc, opts));
if (outlook) {
  dump('mid-fcst', outlook);
  console.log(`   noData=${outlook.noData}`, String(outlook.rows[0]?.fields['wfSv'] ?? '').slice(0, 160).replace(/\n/g, ' '));
}
const sea = await step('⑧ getMidSeaFcst 중기해상', () => getMidSeaFcst(seaId, tmFc, opts));
if (sea) {
  dump('mid-sea', sea);
  console.log(`   noData=${sea.noData} keys=`, Object.keys(sea.rows[0]?.fields ?? {}).join(','));
}

console.log(`원문 덤프: ${OUT_DIR}`);
