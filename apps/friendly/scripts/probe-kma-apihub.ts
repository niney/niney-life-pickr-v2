// 기상청 API허브(apihub.kma.go.kr) 1회성 프로브 — AWS(방재기상관측) 10분 자료와 지점 정보의
// 실제 응답 형식(typ01 텍스트: '#' 주석 헤더 + 공백 구분 행)을 확인하고 원문을
// data/kma-apihub-probe/*.txt 에 덤프한다(gitignore). 키는 KMA_APIHUB_KEY(.env).
//
//   pnpm --filter friendly probe:kma-apihub
//
// 확인하려는 것: ① stn_inf.php?inf=AWS 지점 목록(지점번호·이름·위경도·고도) ② kma_aws2.php
// 최근 10분 전국 관측(기온 TA·강수 RN-15m/60m·풍향풍속·습도) ③ 한 지점 시간 범위 조회.
// 엔드포인트 경로/파라미터는 API허브 문서 기준 추정이므로, 여기서 200 + 표 형식이 확인돼야
// 어댑터를 쓴다(추정이 틀리면 이 스크립트의 URL 부터 고친다).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = process.env.KMA_APIHUB_KEY || '';
if (!KEY) {
  console.error('KMA_APIHUB_KEY 가 비어 있습니다 — apihub.kma.go.kr 에서 발급한 인증키를 .env 에 넣으세요.');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'data', 'kma-apihub-probe');
mkdirSync(OUT_DIR, { recursive: true });

// 실측(2026-08-21): 존재하는 경로 = url/stn_inf.php(지점정보) · cgi-bin/url/nph-aws2_min(AWS 매분자료)
// · url/awsh.php(AWS 시간자료) · url/kma_sfctm2.php(ASOS 시간자료). url/kma_aws2.php 는 404(없음).
// 각 API 는 API허브에서 따로 활용신청해야 하며 미신청이면 403 "활용신청이 필요한 API 입니다".
const BASE = 'https://apihub.kma.go.kr/api/typ01/url';
const BASE_CGI = 'https://apihub.kma.go.kr/api/typ01/cgi-bin/url';

// KST 현재 시각을 10분 단위로 내림 — YYYYMMDDHHmm.
const kstNow = new Date(Date.now() + 9 * 3600_000);
const pad = (n: number): string => String(n).padStart(2, '0');
const tm = `${kstNow.getUTCFullYear()}${pad(kstNow.getUTCMonth() + 1)}${pad(kstNow.getUTCDate())}${pad(kstNow.getUTCHours())}${pad(Math.floor(kstNow.getUTCMinutes() / 10) * 10)}`;
const tmMinus = (min: number): string => {
  const d = new Date(kstNow.getTime() - min * 60_000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(Math.floor(d.getUTCMinutes() / 10) * 10)}`;
};

const probe = async (name: string, url: string): Promise<void> => {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    const text = await res.text();
    writeFileSync(join(OUT_DIR, `${name}.txt`), text);
    const lines = text.split('\n');
    const dataLines = lines.filter((l) => l.trim() && !l.startsWith('#'));
    console.log(`${res.ok ? '✓' : '✗'} ${name} HTTP ${res.status} ${Date.now() - t0}ms · ${lines.length}줄(데이터 ${dataLines.length}) · ${text.length}B`);
    console.log(lines.slice(0, 12).map((l) => `   ${l.slice(0, 160)}`).join('\n'));
    if (dataLines.length > 12) console.log(`   … 마지막: ${dataLines[dataLines.length - 1]?.slice(0, 160)}`);
  } catch (e) {
    console.log(`✗ ${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
};

console.log(`기준 시각(KST 10분 내림) ${tm}`);
// ① AWS 지점 정보 — 지점번호(STN) · 경도(LON) · 위도(LAT) · 고도(HT) · 지점명(STN_KO) 등.
await probe('stn-inf-aws', `${BASE}/stn_inf.php?inf=AWS&stn=0&tm=${tm}&help=1&authKey=${encodeURIComponent(KEY)}`);
// ② AWS 매분 관측 — 최근 1건, 전국(stn=0). TM STN WD1 WS1 WDS WSS WD10 WS10 TA RE RN-15m RN-60m RN-12H RN-DAY HM PA PS TD.
await probe('aws2-now-all', `${BASE_CGI}/nph-aws2_min?tm2=${tm}&stn=0&disp=1&help=1&authKey=${encodeURIComponent(KEY)}`);
// ③ 한 지점(서울 400번대 — 목록에서 확인) 1시간 범위.
await probe('aws2-range-400', `${BASE_CGI}/nph-aws2_min?tm1=${tmMinus(60)}&tm2=${tm}&stn=400&disp=1&help=0&authKey=${encodeURIComponent(KEY)}`);
// ③-b AWS 시간자료(있으면) — 비교용.
await probe('awsh-400', `${BASE}/awsh.php?tm=${tm.slice(0, 10)}&stn=400&help=1&authKey=${encodeURIComponent(KEY)}`);
// ④ 참고: 종관(ASOS) 시간 자료 — 비교용(있으면).
await probe('sfc-hourly-108', `${BASE}/kma_sfctm2.php?tm=${tm.slice(0, 10)}00&stn=108&help=1&authKey=${encodeURIComponent(KEY)}`);
console.log(`원문 덤프: ${OUT_DIR}`);
