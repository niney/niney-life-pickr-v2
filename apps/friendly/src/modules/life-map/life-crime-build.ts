// 일상지도 범죄 통계(배경 레이어) — 경찰청 「범죄 발생 지역별 통계」 CSV(범죄대분류·중분류 × 시군구
// 230열 + 외국 17열, 연 1회, data.go.kr 3074462)와 행안부 주민등록 인구 CSV(jumin.mois.go.kr
// 전체시군구현황)를 합쳐 시군구별 인구 10만 명당 발생률·순위·5등급 분위 경계를 만든다.
//
// 두 부분으로 나뉜다.
//   - 이 파일(빌드, 순수 함수): 적재 빌드(scripts/build-life-crime.ts)가 호출해 결과를
//     data/life-crime-stats.json 으로 저장한다(60KB 안팎, 리포에 커밋 — DB·마이그레이션 없음).
//   - life-crime.service.ts(조회): 그 JSON 을 기동 시 한 번 계약으로 검증해 들고 있다가 내려준다.
//     JSON 이 아직 없는 첫 빌드에서도 스크립트가 돌도록 조회 쪽 import 를 여기 두지 않는다.
//
// 시군구 이름 매칭이 전부다. 세 소스의 표기가 다르다 —
//   경찰청  "서울 종로구" / "경기도 수원시" / "세종시"           (시도 축약, 시 단위·구 없음)
//   행안부  "서울특별시 종로구 (1111000000)" / "경기도 수원시 (4111000000)" / "경기도 수원시 장안구 (…)"
//   경계    { code:'11010', name:'종로구' } / { code:'31011', name:'수원시장안구' }   (KOSIS 코드, 구 분할)
// 경찰청 표기를 기준 라벨로 삼고, 시도는 코드 앞 2자리·정식명 → 축약 표로 맞춘 뒤 이름으로 붙인다.
// 시 단위 통계(수원시)는 하위 구 경계 전부에 같은 값이 간다(codes 여러 개). 경계 파일이 옛 이름·옛
// 소속인 곳(인천 남구→미추홀구, 군위군 경북→대구)은 수동 보정표로 잇는다.

import type { LifeCrimeRegionType, LifeCrimeStatsResultType } from '@repo/api-contract';
import {
  LIFE_CRIME_CATEGORIES,
  LIFE_CRIME_CATEGORY_OF_MAJOR,
  LIFE_CRIME_METRICS,
  lifeCrimePer100k,
  lifeCrimeQuantileBreaks,
  type LifeCrimeCategory,
  type LifeCrimeMetric,
} from '@repo/utils';
import { parseCsv } from '../../lib/csv.js';

export type LifeCrimeStatsData = Omit<LifeCrimeStatsResultType, 'fetchedAt'>;

// 시도 정식명(행안부) → 경찰청 축약 표기. 2023 강원·2024 전북 특별자치도 개명 전후 모두 받는다.
const SIDO_SHORT_OF_FULL: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종시',
  경기도: '경기도',
  강원특별자치도: '강원도',
  강원도: '강원도',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라북도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
};
// 경계 코드(KOSIS 행정구역 코드) 앞 2자리 → 경찰청 축약 표기.
const SIDO_SHORT_OF_CODE: Record<string, string> = {
  '11': '서울',
  '21': '부산',
  '22': '대구',
  '23': '인천',
  '24': '광주',
  '25': '대전',
  '26': '울산',
  '29': '세종시',
  '31': '경기도',
  '32': '강원도',
  '33': '충북',
  '34': '충남',
  '35': '전북',
  '36': '전남',
  '37': '경북',
  '38': '경남',
  '39': '제주',
};
// 경찰청 표기 → 경계 코드 수동 보정 — 경계 파일(2026-07 빌드)이 옛 이름(인천 남구, 2018 미추홀구
// 개명)·옛 소속(군위군, 2023-07 경북→대구 편입)인 곳. 이름으로는 못 붙는다.
const BOUNDARY_ALIAS: Record<string, readonly string[]> = {
  '인천 미추홀구': ['23030'],
  '대구 군위군': ['37310'],
};
const SEJONG_LABEL = '세종시';

export interface LifeCrimeBoundary {
  code: string;
  name: string;
}

export interface LifeCrimeBuildInput {
  // 경찰청 지역별 CSV 원문(디코딩 완료). 1행 헤더: 범죄대분류,범죄중분류,<시군구 …>
  crimeCsv: string;
  // 행안부 월간 인구 CSV 원문(디코딩 완료). 1행 헤더: 행정구역,YYYY년MM월_총인구수,…
  populationCsv: string;
  boundaries: readonly LifeCrimeBoundary[];
  year: number;
  populationBase: string;
}

export interface LifeCrimeBuildReport {
  regionCount: number;
  // 집계에서 뺀 열 — 외국(국외 발생)·3종 합 0(편입 전 옛 소속 열 등).
  skippedColumns: string[];
  // 경계 코드 / 인구를 못 찾은 열 — 결과에서 빠진다(지도에 안 칠해진다).
  noBoundary: string[];
  noPopulation: string[];
  // 시 단위 통계가 여러 구 경계로 퍼진 열.
  multiCode: { label: string; codes: string[] }[];
  // 어느 열에도 안 붙은 경계(지도에 색 없이 남는 곳).
  unusedBoundaries: LifeCrimeBoundary[];
  // 대분류별 채택 행 수.
  majorRows: Record<LifeCrimeCategory, number>;
}

// 경찰청 열 라벨 → 시도 축약 + 시군구 이름. "세종시" 는 시도이자 시군구.
const splitLabel = (label: string): { sido: string; name: string } => {
  if (label === SEJONG_LABEL) return { sido: SEJONG_LABEL, name: SEJONG_LABEL };
  const i = label.indexOf(' ');
  return i > 0 ? { sido: label.slice(0, i), name: label.slice(i + 1).trim() } : { sido: label, name: label };
};

const parseIntComma = (v: string | undefined): number | null => {
  const s = (v ?? '').replace(/[,\s"]/g, '');
  if (!/^\d+$/.test(s)) return null;
  return Number.parseInt(s, 10);
};

// 행안부 인구 CSV → 경찰청 라벨 → 총인구. 시군구 행만(코드 3~5자리가 000 이 아니고 뒤 5자리가
// 00000). "수원시 장안구" 처럼 구 단위 행(이름에 공백)은 시 통계와 안 맞으니 건너뛴다. 세종은
// 시도 행(3600000000)과 시군구 행(3611000000, 이름 빈칸) 둘 다 있어 후자를 "세종시" 로 받는다.
export const parsePopulationCsv = (text: string): Map<string, number> => {
  const table = parseCsv(text);
  const out = new Map<string, number>();
  for (const row of table.rows) {
    const m = /^(\S+)\s*(.*?)\s*\((\d{10})\)\s*$/.exec((row[0] ?? '').trim());
    if (!m) continue;
    const [, sidoFull, rest, code] = m as unknown as [string, string, string, string];
    if (code.slice(2, 5) === '000' || code.slice(5) !== '00000') continue;
    const sido = SIDO_SHORT_OF_FULL[sidoFull];
    if (!sido) continue;
    const name = rest.trim();
    if (/\s/.test(name)) continue;
    const label = sido === SEJONG_LABEL ? SEJONG_LABEL : name.length > 0 ? `${sido} ${name}` : null;
    if (!label) continue;
    const pop = parseIntComma(row[1]);
    if (pop === null) continue;
    if (!out.has(label)) out.set(label, pop);
  }
  return out;
};

const emptyCounts = (): Record<LifeCrimeMetric, number> => ({ total: 0, violent: 0, theft: 0, assault: 0 });

export const buildLifeCrimeStats = (
  input: LifeCrimeBuildInput,
): { stats: LifeCrimeStatsData; report: LifeCrimeBuildReport } => {
  const table = parseCsv(input.crimeCsv);
  if (table.header.length < 3 || table.header[0] !== '범죄대분류') {
    throw new Error(`경찰청 지역별 CSV 헤더가 아닙니다: ${table.header.slice(0, 3).join(',')}`);
  }
  const population = parsePopulationCsv(input.populationCsv);

  // 경계를 시도별로 묶는다(이름 충돌 — 중구·남구·동구·서구·북구 — 를 시도 안에서만 본다).
  const boundariesBySido = new Map<string, LifeCrimeBoundary[]>();
  for (const b of input.boundaries) {
    const sido = SIDO_SHORT_OF_CODE[b.code.slice(0, 2)];
    if (!sido) continue;
    const list = boundariesBySido.get(sido) ?? [];
    list.push(b);
    boundariesBySido.set(sido, list);
  }
  const usedCodes = new Set<string>();
  const findCodes = (label: string): string[] => {
    const alias = BOUNDARY_ALIAS[label];
    if (alias) return [...alias];
    const { sido, name } = splitLabel(label);
    const list = boundariesBySido.get(sido) ?? [];
    const exact = list.filter((b) => b.name === name);
    const hits = exact.length > 0 ? exact : list.filter((b) => b.name.startsWith(name));
    return hits.map((b) => b.code).filter((c) => !usedCodes.has(c));
  };

  const majorRows: Record<LifeCrimeCategory, number> = { violent: 0, theft: 0, assault: 0 };
  const rowCategory: (LifeCrimeCategory | null)[] = table.rows.map((row) => {
    const cat = LIFE_CRIME_CATEGORY_OF_MAJOR[(row[0] ?? '').trim()] ?? null;
    if (cat) majorRows[cat] += 1;
    return cat;
  });

  const report: LifeCrimeBuildReport = {
    regionCount: 0,
    skippedColumns: [],
    noBoundary: [],
    noPopulation: [],
    multiCode: [],
    unusedBoundaries: [],
    majorRows,
  };

  const regions: LifeCrimeRegionType[] = [];
  for (let j = 2; j < table.header.length; j++) {
    const label = table.header[j]!.trim();
    if (label.length === 0 || label.startsWith('외국')) {
      report.skippedColumns.push(label);
      continue;
    }
    const counts = emptyCounts();
    table.rows.forEach((row, i) => {
      const cat = rowCategory[i];
      if (!cat) return;
      const n = parseIntComma(row[j]) ?? 0;
      counts[cat] += n;
      counts.total += n;
    });
    if (counts.total === 0) {
      report.skippedColumns.push(label);
      continue;
    }
    const codes = findCodes(label);
    if (codes.length === 0) {
      report.noBoundary.push(label);
      continue;
    }
    const pop = population.get(label);
    if (pop === undefined || pop <= 0) {
      report.noPopulation.push(label);
      continue;
    }
    for (const c of codes) usedCodes.add(c);
    if (codes.length > 1) report.multiCode.push({ label, codes });
    const { sido, name } = splitLabel(label);
    regions.push({
      codes,
      label,
      sido,
      name,
      population: pop,
      counts,
      per100k: {
        total: lifeCrimePer100k(counts.total, pop) ?? 0,
        violent: lifeCrimePer100k(counts.violent, pop) ?? 0,
        theft: lifeCrimePer100k(counts.theft, pop) ?? 0,
        assault: lifeCrimePer100k(counts.assault, pop) ?? 0,
      },
      rank: { total: 1, violent: 1, theft: 1, assault: 1 },
    });
  }

  // 순위(발생률 내림차순, 1 = 전국 최고)와 메트릭별 분위 경계.
  const breaks = { total: [0, 0, 0, 0], violent: [0, 0, 0, 0], theft: [0, 0, 0, 0], assault: [0, 0, 0, 0] };
  for (const metric of LIFE_CRIME_METRICS) {
    const order = [...regions].sort((a, b) => b.per100k[metric] - a.per100k[metric]);
    order.forEach((r, i) => {
      r.rank[metric] = i + 1;
    });
    breaks[metric] = lifeCrimeQuantileBreaks(regions.map((r) => r.per100k[metric]));
  }

  report.regionCount = regions.length;
  report.unusedBoundaries = input.boundaries.filter((b) => !usedCodes.has(b.code));

  return {
    stats: {
      year: input.year,
      populationBase: input.populationBase,
      regionCount: regions.length,
      breaks,
      regions,
    },
    report,
  };
};

// 카테고리 목록을 리포트·스크립트가 같은 순서로 쓰도록 재노출.
export const LIFE_CRIME_BUILD_CATEGORIES = LIFE_CRIME_CATEGORIES;

