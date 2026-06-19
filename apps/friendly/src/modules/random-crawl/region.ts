import type {
  RandomCrawlRegionType,
  RegionTreeType,
} from '@repo/api-contract';
// data/regions.json 은 빌드 스크립트(scripts/build-regions.mjs)로 생성한다.
// 정적 import 로 가져와야 tsup(esbuild) 가 번들에 인라인한다 — fs 런타임 읽기로는
// dist 에 JSON 이 복사되지 않아 운영(node dist/server.js)에서 빈 배열이 된다.
import regionsData from './data/regions.json' with { type: 'json' };

// 전국 시/군/구 좌표 + 동(읍면동) 이름 번들. data/regions.json 은 빌드 스크립트
// (scripts/build-regions.mjs)로 생성한다. 시/구는 실좌표로 검색하고, 동은
// 좌표가 없어 검색어에 이름을 결합하므로 동은 이름만 보관한다.
export interface RegionEntry {
  sido: string;
  sigungu: string;
  lat: number;
  lng: number;
  dongs: string[];
}

// 지역 설정(랜덤/고정)을 위에서 아래로 풀어 확정한 한 곳. 검색은 좌표(시군구
// 중심)로 하고, dong 이 있으면 서비스가 검색어에 결합한다.
export interface ResolvedRegion {
  sido: string;
  sigungu: string;
  dong: string | null;
  lat: number;
  lng: number;
  // 표시용 — "서울특별시 강남구 역삼동".
  label: string;
}

// 번들에 인라인된 JSON 을 그대로 쓴다. 비었으면 서비스가 "지역 데이터 없음"으로
// 보고 해당 회차를 스킵한다.
function loadRegions(): RegionEntry[] {
  return regionsData as RegionEntry[];
}

function randomItem<T>(arr: readonly T[]): T | null {
  if (arr.length === 0) return null;
  // 앱 런타임 코드 — Math.random 사용 가능(워크플로 스크립트가 아님).
  return arr[Math.floor(Math.random() * arr.length)] ?? null;
}

export class RegionStore {
  private readonly entries: RegionEntry[];

  constructor(entries?: RegionEntry[]) {
    this.entries = entries ?? loadRegions();
  }

  get size(): number {
    return this.entries.length;
  }

  // 시도→시군구 트리 (동 제외 — UI 셀렉트용, 가볍게).
  tree(): RegionTreeType {
    const bySido = new Map<string, string[]>();
    for (const e of this.entries) {
      const list = bySido.get(e.sido) ?? [];
      list.push(e.sigungu);
      bySido.set(e.sido, list);
    }
    return [...bySido.entries()].map(([sido, sigungus]) => ({ sido, sigungus }));
  }

  dongs(sido: string, sigungu: string): string[] {
    return this.find(sido, sigungu)?.dongs ?? [];
  }

  private find(sido: string, sigungu: string): RegionEntry | null {
    return (
      this.entries.find((e) => e.sido === sido && e.sigungu === sigungu) ?? null
    );
  }

  private sidos(): string[] {
    return [...new Set(this.entries.map((e) => e.sido))];
  }

  // 설정을 위에서 아래로 풀어 확정 지역 1곳을 고른다. 고정값이 데이터에 없으면
  // 그 레벨을 랜덤으로 폴백(부모가 랜덤이라 고정 자식이 무의미해진 경우 포함).
  // 데이터가 비었으면 null.
  resolve(region: RandomCrawlRegionType): ResolvedRegion | null {
    const sidos = this.sidos();
    if (sidos.length === 0) return null;

    const sido =
      !region.sidoRandom && region.sido && sidos.includes(region.sido)
        ? region.sido
        : randomItem(sidos);
    if (!sido) return null;

    const inSido = this.entries.filter((e) => e.sido === sido);
    const entry =
      !region.sigunguRandom &&
      region.sigungu &&
      inSido.some((e) => e.sigungu === region.sigungu)
        ? inSido.find((e) => e.sigungu === region.sigungu)!
        : randomItem(inSido);
    if (!entry) return null;

    let dong: string | null = null;
    if (region.dongEnabled && entry.dongs.length > 0) {
      dong =
        !region.dongRandom &&
        region.dong &&
        entry.dongs.includes(region.dong)
          ? region.dong
          : randomItem(entry.dongs);
    }

    const label = [entry.sido, entry.sigungu, dong].filter(Boolean).join(' ');
    return {
      sido: entry.sido,
      sigungu: entry.sigungu,
      dong,
      lat: entry.lat,
      lng: entry.lng,
      label,
    };
  }
}

// 모듈 singleton — 데이터는 불변이라 공유 안전.
export const regionStore = new RegionStore();
