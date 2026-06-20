// build-sigungu-geo.mjs — 어드민 지역 통계 choropleth 용 시군구 경계 GeoJSON 생성
//
// 공개 시군구 경계(2018, KOSTAT)를 fetch → mapshaper 로 단순화·필드 정리 →
//   apps/web/public/sigungu-geo.json 으로 write.
//
// 실행: node apps/web/scripts/build-sigungu-geo.mjs
//
// 원본은 ~18MB 라 그대로 번들 못 한다. 4% 단순화 + 좌표 정밀도 축소 + name/code
// 필드만 남겨 ~560KB(gzip ~120KB)로 줄인다. public/ 에 두는 이유: (1) 대용량
// JSON 을 src 로 import 하면 tsc 가 literal 타입 추론으로 폭주하고, (2) choropleth
// 모드 선택 시에만 fetch 로 지연 로드하면 되기 때문(메인 번들 영향 없음).
//
// 폴리곤은 도-도시의 구 단위까지 분리돼 있다(예: "성남시분당구"). 통계 매칭은
// 이름이 아니라 가게 좌표의 point-in-polygon 으로 하므로 명칭 차이를 신경 쓸
// 필요가 없다. code 앞 2자리는 시도 코드(11=서울, 21=부산, …).
//
// 의존성: Node 18+ (전역 fetch) + npx mapshaper (실행 시 자동 설치).

import { execSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SRC_URL =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-geo.json';
const OUT = resolve(__dirname, '../public/sigungu-geo.json');

const main = async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sgg-'));
  const rawPath = join(tmp, 'raw.json');
  const simplePath = join(tmp, 'simple.json');

  console.log('[1/3] 시군구 경계 fetch …', SRC_URL);
  const res = await fetch(SRC_URL, { headers: { 'User-Agent': 'build-sigungu-geo/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} : ${SRC_URL}`);
  writeFileSync(rawPath, Buffer.from(await res.arrayBuffer()));

  console.log('[2/3] mapshaper 단순화 …');
  execSync(
    `npx -y mapshaper "${rawPath}" -filter-fields name,code -simplify 4% keep-shapes -o format=geojson precision=0.001 "${simplePath}"`,
    { stdio: 'inherit' },
  );

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, readFileSync(simplePath));
  rmSync(tmp, { recursive: true, force: true });

  const bytes = readFileSync(OUT).length;
  console.log(`[3/3] write 완료: ${OUT} (${(bytes / 1024).toFixed(0)} KB)`);
};

main().catch((err) => {
  console.error('\n[build-sigungu-geo 실패]');
  console.error(err?.stack ?? err?.message ?? err);
  process.exit(1);
});
