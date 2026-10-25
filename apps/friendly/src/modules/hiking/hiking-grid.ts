// 등산 적재용 격자 색인 — 전국 봉우리 합치기(100대 명산 코스 선 근처인가)·코스 겹침·지나는 봉우리 찾기. 순수.
// 평면 근사(위도 36° 의 경도 축척 고정)라 국내 범위에서 x 쪽이 몇 % 틀린다 — 반경 판정은 셀 단위 근사로 충분한 곳에만 쓴다.

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG = 111_320 * Math.cos((36 * Math.PI) / 180);
const toXY = (lat: number, lng: number): [number, number] => [lng * M_PER_DEG_LNG, lat * M_PER_DEG_LAT];

// 점 색인 — near 는 반경 안 셀의 값 전부(정확한 거리는 호출자가 다시 잰다).
export class PointGrid<T> {
  private readonly cells = new Map<string, { lat: number; lng: number; value: T }[]>();
  constructor(private readonly cellM: number) {}

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  add(lat: number, lng: number, value: T): void {
    const [x, y] = toXY(lat, lng);
    const k = this.key(Math.floor(x / this.cellM), Math.floor(y / this.cellM));
    const list = this.cells.get(k);
    if (list) list.push({ lat, lng, value });
    else this.cells.set(k, [{ lat, lng, value }]);
  }

  near(lat: number, lng: number, radiusM: number): { lat: number; lng: number; value: T }[] {
    const [x, y] = toXY(lat, lng);
    const cx = Math.floor(x / this.cellM);
    const cy = Math.floor(y / this.cellM);
    const n = Math.ceil(radiusM / this.cellM);
    const out: { lat: number; lng: number; value: T }[] = [];
    for (let dx = -n; dx <= n; dx++) for (let dy = -n; dy <= n; dy++) out.push(...(this.cells.get(this.key(cx + dx, cy + dy)) ?? []));
    return out;
  }
}

// 선 색인 — 선을 stepM 간격으로 찍어 셀에 값(산 id 등)을 넣는다. has 는 반경 안 셀에 그 값이 있는지(셀 근사).
export class LineGrid<T> {
  private readonly cells = new Map<string, Set<T>>();
  constructor(
    private readonly cellM: number,
    private readonly stepM = 5,
  ) {}

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  addLine(points: readonly { lat: number; lng: number }[], value: T): void {
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = toXY(points[i]!.lat, points[i]!.lng);
      const b = points[i + 1];
      const [bx, by] = b ? toXY(b.lat, b.lng) : [ax, ay];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / this.stepM));
      for (let s = 0; s < steps; s++) {
        const x = ax + ((bx - ax) * s) / steps;
        const y = ay + ((by - ay) * s) / steps;
        const k = this.key(Math.floor(x / this.cellM), Math.floor(y / this.cellM));
        const set = this.cells.get(k);
        if (set) set.add(value);
        else this.cells.set(k, new Set([value]));
      }
    }
  }

  valuesNear(lat: number, lng: number, radiusM: number): Set<T> {
    const [x, y] = toXY(lat, lng);
    const cx = Math.floor(x / this.cellM);
    const cy = Math.floor(y / this.cellM);
    const n = Math.max(1, Math.ceil(radiusM / this.cellM));
    const out = new Set<T>();
    for (let dx = -n; dx <= n; dx++) for (let dy = -n; dy <= n; dy++) for (const v of this.cells.get(this.key(cx + dx, cy + dy)) ?? []) out.add(v);
    return out;
  }

  has(lat: number, lng: number, radiusM: number, value: T): boolean {
    const [x, y] = toXY(lat, lng);
    const cx = Math.floor(x / this.cellM);
    const cy = Math.floor(y / this.cellM);
    const n = Math.max(1, Math.ceil(radiusM / this.cellM));
    for (let dx = -n; dx <= n; dx++) for (let dy = -n; dy <= n; dy++) if (this.cells.get(this.key(cx + dx, cy + dy))?.has(value)) return true;
    return false;
  }
}

// 선 점들 중 grid 의 value 선과 radiusM 안에 있는 비율 — 코스 겹침(같은 길을 다시 그린 코스) 판정. 점은 stepM 마다 하나만 센다.
export const overlapShare = <T>(
  pieces: readonly (readonly { lat: number; lng: number }[])[],
  grid: LineGrid<T>,
  value: T,
  radiusM: number,
  sampleEvery = 3,
): number => {
  let total = 0;
  let hit = 0;
  for (const piece of pieces) {
    for (let i = 0; i < piece.length; i += sampleEvery) {
      total += 1;
      if (grid.has(piece[i]!.lat, piece[i]!.lng, radiusM, value)) hit += 1;
    }
  }
  return total === 0 ? 0 : hit / total;
};
