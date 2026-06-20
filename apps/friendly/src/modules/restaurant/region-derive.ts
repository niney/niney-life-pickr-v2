// 가게(canonical)의 주소·좌표에서 시/도·시군구를 파생한다. Restaurant 테이블은
// 주소를 단일 문자열로만 저장하므로(시/구 분리 컬럼 없음), 어드민 지역 통계는
// 여기서 파생값을 즉석 계산한다.
//
// 전략: ① 주소 문자열을 regions.json 사전(시도/시군구)과 매칭 → 실패 시
// ② 좌표를 시군구 중심좌표에 최근접 배정. 둘 다 실패하면 null(미분류).
//
// regions.json 은 빌드 스크립트(scripts/build-regions.mjs)로 생성되며 정적
// import 로 가져와야 tsup(esbuild)가 번들에 인라인한다 — random-crawl/region.ts
// 와 동일한 제약. 두 모듈이 같은 JSON 을 import 해도 esbuild 가 dedup 한다.
import regionsData from '../random-crawl/data/regions.json' with { type: 'json' };

interface RawRegion {
  sido: string;
  sigungu: string;
  lat: number;
  lng: number;
  dongs: string[];
}

export interface DerivedRegion {
  sido: string;
  sigungu: string;
  // 해당 시군구의 중심좌표(regions.json) — 지도 뷰 센터링용. 사전에 없으면 null.
  lat: number | null;
  lng: number | null;
}

const ENTRIES = regionsData as RawRegion[];

// 시도 표기를 안정적인 2글자 코어로 정규화. 주소엔 약칭("서울","충북")·구명칭
// ("강원도")·신명칭("강원특별자치도","전북특별자치도")이 섞여 들어오는데, 모두
// 같은 코어로 모아 regions.json 의 정규 시도명과 매칭할 수 있게 한다.
const PROVINCE_COMPRESS: Record<string, string> = {
  충청북: '충북',
  충청남: '충남',
  전라북: '전북',
  전라남: '전남',
  경상북: '경북',
  경상남: '경남',
};

const sidoCore = (raw: string): string => {
  let s = raw.replace(/\s+/g, '');
  s = s
    .replace(/특별자치도$/, '')
    .replace(/특별자치시$/, '')
    .replace(/특별시$/, '')
    .replace(/광역시$/, '');
  if (s.length > 1 && s.endsWith('도')) s = s.slice(0, -1);
  return PROVINCE_COMPRESS[s] ?? s;
};

// 코어 → regions.json 정규 시도명. 주소가 시도를 어떻게 적든 정규명으로 환원.
const sidoByCore = new Map<string, string>();
for (const e of ENTRIES) {
  const core = sidoCore(e.sido);
  if (!sidoByCore.has(core)) sidoByCore.set(core, e.sido);
}

// 주소 앞부분에서 시도를 잡기 위한 prefix 목록. 정규 전체명("충청북도")과
// 코어("충북") 둘 다 등록 — 코어 prefix 가 신명칭("강원특별자치도")까지 흡수.
// 긴 prefix 우선(longest-match)으로 "경상남도"가 "경남"보다 먼저 매칭된다.
const SIDO_PREFIXES: Array<{ prefix: string; sido: string }> = [];
for (const [core, sido] of sidoByCore) {
  SIDO_PREFIXES.push({ prefix: sido, sido });
  SIDO_PREFIXES.push({ prefix: core, sido });
}
SIDO_PREFIXES.sort((a, b) => b.prefix.length - a.prefix.length);

// 시도별 시군구 목록(+중심좌표). 시군구명 긴 것 우선 정렬 — "강서구"를 "서구"
// 보다 먼저 봐서 서울의 강서구/서구 같은 부분문자열 충돌을 피한다.
const sigungusBySido = new Map<string, Array<{ sigungu: string; lat: number; lng: number }>>();
for (const e of ENTRIES) {
  const arr = sigungusBySido.get(e.sido) ?? [];
  arr.push({ sigungu: e.sigungu, lat: e.lat, lng: e.lng });
  sigungusBySido.set(e.sido, arr);
}
for (const arr of sigungusBySido.values()) {
  arr.sort((a, b) => b.sigungu.length - a.sigungu.length);
}

const matchSido = (address: string): string | null => {
  const a = address.trimStart();
  for (const p of SIDO_PREFIXES) {
    if (a.startsWith(p.prefix)) return p.sido;
  }
  return null;
};

// 시도를 확정한 뒤 그 시도의 시군구만 후보로 본다(중복 시군구명 디스앰비규에이션).
// 토큰 완전일치 우선, 없으면 토큰-접두(붙여쓴 주소 "강남구역삼동" 대비). 부분문자열
// 매칭은 강서구/서구 충돌 때문에 쓰지 않는다.
const matchSigungu = (
  address: string,
  sido: string,
): { sigungu: string; lat: number; lng: number } | null => {
  const list = sigungusBySido.get(sido);
  if (!list) return null;
  const tokens = address.split(/\s+/).filter(Boolean);
  for (const c of list) {
    if (tokens.includes(c.sigungu)) return c;
  }
  for (const c of list) {
    if (tokens.some((t) => t.startsWith(c.sigungu))) return c;
  }
  return null;
};

// 좌표 최근접 시군구. 경도는 위도에 따라 실거리가 짧아지므로 cos(lat) 로 보정.
const nearestCentroid = (lat: number, lng: number): RawRegion | null => {
  const cos = Math.cos((lat * Math.PI) / 180);
  let best: RawRegion | null = null;
  let bestD = Infinity;
  for (const e of ENTRIES) {
    const dLat = e.lat - lat;
    const dLng = (e.lng - lng) * cos;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
};

// 주소 파싱(시도+시군구) → 실패 시 좌표 최근접 폴백 → 둘 다 실패 시 null.
export const deriveRegion = (
  address: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): DerivedRegion | null => {
  if (address && address.trim()) {
    const sido = matchSido(address);
    if (sido) {
      const sg = matchSigungu(address, sido);
      if (sg) return { sido, sigungu: sg.sigungu, lat: sg.lat, lng: sg.lng };
    }
  }
  if (typeof lat === 'number' && typeof lng === 'number') {
    const e = nearestCentroid(lat, lng);
    if (e) return { sido: e.sido, sigungu: e.sigungu, lat: e.lat, lng: e.lng };
  }
  return null;
};
