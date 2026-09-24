import type { PrismaClient } from '@prisma/client';
import type { HousingFloodEventType, HousingFloodType } from '@repo/api-contract';
import { HOUSING_FLOOD_RADIUS_M, haversineM } from '@repo/utils';

// 침수 흔적 조회 — LifeFloodTrace(서울 ≈4.3만 점, load:life-flood)를 메모리 격자 색인으로 올려 단지 좌표 반경
// HOUSING_FLOOD_RADIUS_M 안 점을 센다. 지도 점 모드는 한 번에 단지 수백 개를 세야 해서 요청마다 DB 범위 조회
// (뷰포트가 서울 전체면 4만 행)보다 색인이 싸다. 적재가 바뀌면(LifeMasterSync layer=flood 최신 id) 다시 올린다 —
// 확인은 FLOOD_CHECK_TTL_MS 마다 한 번. 단지 좌표가 바뀌어도(지오코딩 보강) 요청 시점 좌표로 세므로 파생 표가 없다.
//
// 커버리지: 흔적이 있는 시도(법정동코드 앞 2자리)만 '범위 안' — 범위 밖 단지는 0건이 아니라 null(모름)이다.

const FLOOD_CHECK_TTL_MS = 10 * 60_000;
// 격자 한 칸(°) ≈ 위도 222m · 경도 176m(37.5°N) — 반경 100m 는 이웃 3×3 칸이면 충분.
const CELL_DEG = 0.002;

interface FloodPoint {
  lat: number;
  lng: number;
  year: number;
  month: number | null;
  depthM: number | null;
}

interface FloodState {
  syncId: number;
  checkedAt: number;
  grid: Map<string, FloodPoint[]>;
  sidos: Set<string>;
  fromYear: number;
  toYear: number;
}

const cellKey = (i: number, j: number): string => `${i}:${j}`;

export class HousingFloodIndex {
  private state: FloodState | null = null;
  private pending: Promise<FloodState | null> | null = null;
  private lastCheck = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => number = Date.now,
  ) {}

  // 최신 적재 색인(없으면 null). TTL 안이면 확인 쿼리도 생략, 동시 호출은 한 번만 짓는다.
  async ensure(): Promise<FloodState | null> {
    if (this.now() - this.lastCheck < FLOOD_CHECK_TTL_MS) return this.state;
    this.pending ??= this.refresh().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async refresh(): Promise<FloodState | null> {
    const sync = await this.prisma.lifeMasterSync.findFirst({ where: { layer: 'flood' }, orderBy: { loadedAt: 'desc' } });
    this.lastCheck = this.now();
    if (!sync) {
      this.state = null;
      return null;
    }
    if (this.state?.syncId === sync.id) return this.state;
    const rows = await this.prisma.lifeFloodTrace.findMany({
      select: { lat: true, lng: true, eventYear: true, eventMonth: true, depthM: true, sggCd: true },
    });
    const grid = new Map<string, FloodPoint[]>();
    const sidos = new Set<string>();
    let fromYear = Number.POSITIVE_INFINITY;
    let toYear = Number.NEGATIVE_INFINITY;
    for (const r of rows) {
      const key = cellKey(Math.floor(r.lat / CELL_DEG), Math.floor(r.lng / CELL_DEG));
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = []));
      cell.push({ lat: r.lat, lng: r.lng, year: r.eventYear, month: r.eventMonth, depthM: r.depthM });
      if (r.sggCd) sidos.add(r.sggCd.slice(0, 2));
      fromYear = Math.min(fromYear, r.eventYear);
      toYear = Math.max(toYear, r.eventYear);
    }
    this.state = rows.length > 0 ? { syncId: sync.id, checkedAt: this.now(), grid, sidos, fromYear, toYear } : null;
    return this.state;
  }

  // 반경 안 점들. 범위 판정은 호출자가 covers 로.
  static near(state: FloodState, lat: number, lng: number, radiusM = HOUSING_FLOOD_RADIUS_M): FloodPoint[] {
    const i0 = Math.floor(lat / CELL_DEG);
    const j0 = Math.floor(lng / CELL_DEG);
    const k = Math.ceil(radiusM / (CELL_DEG * 111_320 * Math.cos((lat * Math.PI) / 180)));
    const center = { lat, lng };
    const out: FloodPoint[] = [];
    for (let di = -k; di <= k; di += 1) {
      for (let dj = -k; dj <= k; dj += 1) {
        for (const p of state.grid.get(cellKey(i0 + di, j0 + dj)) ?? []) {
          if (haversineM(center, p) <= radiusM) out.push(p);
        }
      }
    }
    return out;
  }

  // 법정동 시군구코드(5자리)의 시도가 침수흔적도 범위 안인지.
  static covers(state: FloodState, sggCd: string | null | undefined): boolean {
    return !!sggCd && state.sidos.has(sggCd.slice(0, 2));
  }

  // 지도 배지용 개수 — 범위 밖·미적재면 null.
  async countFor(lat: number, lng: number, sggCd: string): Promise<number | null> {
    const s = await this.ensure();
    return s && HousingFloodIndex.covers(s, sggCd) ? HousingFloodIndex.near(s, lat, lng).length : null;
  }

  // 단지 상세 — 건수·최대 침수심·사건 연월 묶음(최신 순). 범위 밖·미적재면 null.
  async detailFor(lat: number, lng: number, sggCd: string): Promise<HousingFloodType | null> {
    const s = await this.ensure();
    if (!s || !HousingFloodIndex.covers(s, sggCd)) return null;
    const pts = HousingFloodIndex.near(s, lat, lng);
    const groups = new Map<string, HousingFloodEventType>();
    let maxDepthM: number | null = null;
    for (const p of pts) {
      const key = `${p.year}-${p.month ?? 0}`;
      const g = groups.get(key) ?? { year: p.year, month: p.month, count: 0, maxDepthM: null };
      g.count += 1;
      if (p.depthM !== null) {
        g.maxDepthM = Math.max(g.maxDepthM ?? 0, p.depthM);
        maxDepthM = Math.max(maxDepthM ?? 0, p.depthM);
      }
      groups.set(key, g);
    }
    const events = [...groups.values()].sort((a, b) => b.year - a.year || (b.month ?? 0) - (a.month ?? 0));
    return { radiusM: HOUSING_FLOOD_RADIUS_M, total: pts.length, maxDepthM, events, fromYear: s.fromYear, toYear: s.toYear };
  }
}
