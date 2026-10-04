import { LRUCache } from 'lru-cache';

// 외부 공공 API 프록시(버스·지하철·대기·날씨·바다) 공용 방어 — 일일 쿼터 버킷, 실패 쿨다운, 요청 시간 예산.
// 단일 인스턴스 전제(CLAUDE.md, Redis 금지)라 전부 프로세스 메모리로 센다. 재시작하면 0 부터 — 업스트림
// 실한도보다 여유를 둔 값이라 하루 한두 번의 재시작은 흡수된다.

// Asia/Seoul 기준 YYYY-MM-DD — 쿼터 리셋 경계. en-CA 로캘이 ISO 형식을 낸다.
const SEOUL_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const seoulDateKey = (d: Date): string => SEOUL_DATE_FMT.format(d);

// ── 요청 시간 예산 ──────────────────────────────────────────────────────────
// 요청 1건(어댑터 재시도 포함)의 상한. 운영에서는 업스트림이 매달리면 20초(재시도까지 40.7초) 타임아웃을
// 그대로 기다렸다(PLAN-perf-2 운영 증거: /air/stations/nearby p95 20.0초, /weather/aws p95 40.7초). 끊긴
// 요청은 서비스가 last-known(stale)·쿨다운으로 받는다.
export const UPSTREAM_REQUEST_BUDGET_MS = 8_000;
// 재시도를 걸 최소 남은 시간 — 이보다 적게 남았으면 재시도해도 끝까지 받기 어렵다.
export const UPSTREAM_MIN_RETRY_WINDOW_MS = 2_000;

// ── 일일 쿼터 버킷 ──────────────────────────────────────────────────────────
// 업스트림 서비스·오퍼레이션별로 나눈 카운터 — 한 기능의 남용(검색어·노선 id 순회 등)이 다른 기능(실시간
// 도착)의 몫을 먹지 못하게 한다. consume 은 초과 시 소비 없이 throw(호출측이 stale 폴백), record 는 이미
// 나간 호출(어댑터 재시도)을 한도와 무관하게 사후 가산한다.
export class DailyQuota<B extends string> {
  private dateKey = '';
  private readonly counts = new Map<B, number>();

  constructor(
    private readonly limits: Readonly<Record<B, number>>,
    private readonly exceeded: (bucket: B) => Error,
  ) {}

  private roll(now: Date): void {
    const key = seoulDateKey(now);
    if (key !== this.dateKey) {
      this.dateKey = key;
      this.counts.clear();
    }
  }

  // calls 만큼 한 번에 확보 — 중간에 소진돼 일부만 호출하고 실패하는 일을 막는다.
  consume(bucket: B, now: Date, calls = 1): void {
    this.roll(now);
    const used = this.counts.get(bucket) ?? 0;
    if (used + calls > this.limits[bucket]) throw this.exceeded(bucket);
    this.counts.set(bucket, used + calls);
  }

  record(bucket: B, now: Date, calls = 1): void {
    this.roll(now);
    this.counts.set(bucket, (this.counts.get(bucket) ?? 0) + calls);
  }

  used(bucket: B, now: Date): number {
    this.roll(now);
    return this.counts.get(bucket) ?? 0;
  }

  limit(bucket: B): number {
    return this.limits[bucket];
  }
}

// ── 실패 쿨다운 ─────────────────────────────────────────────────────────────
// 업스트림이 실패한 키는 retryAt 까지 업스트림·쿼터 없이 last-known(stale) 또는 503 으로 답한다. 쿨다운이
// 없을 땐 장애 동안 폴링이 매번 재호출해 하루 쿼터를 태우고, 복구 뒤에도 자정까지 503 이 됐다(E-V2).
// 키 백오프 30초→1→2→4→5분(상한), 성공하면 리셋. 인증 오류·일일한도 초과(게이트웨이 20~33 등)는 어떤 키로
// 불러도 같은 답이라 그 업스트림 서비스 전체를 5분→10→20→40→60분(상한) 막는다.
export const COOLDOWN_BASE_MS = 30_000;
export const COOLDOWN_MAX_MS = 5 * 60_000;
export const SERVICE_BLOCK_BASE_MS = 5 * 60_000;
export const SERVICE_BLOCK_MAX_MS = 60 * 60_000;
// 키 쿨다운 기록 상한 — 실패하는 키를 바꿔 가며 불러도 메모리가 늘지 않게(넘치면 오래된 기록부터 잊는다).
const COOLDOWN_MAX_KEYS = 5_000;

interface Backoff {
  failures: number;
  retryAt: number;
}

const backoffMs = (failures: number, baseMs: number, maxMs: number): number =>
  Math.min(maxMs, baseMs * 2 ** Math.min(failures - 1, 20));

export class UpstreamCooldown {
  private readonly keys = new LRUCache<string, Backoff>({ max: COOLDOWN_MAX_KEYS });
  private readonly services = new Map<string, Backoff>();

  // 막혀 있으면 풀리는 시각(ms), 아니면 null — 서비스 차단과 키 쿨다운 중 늦은 쪽.
  blockedUntil(service: string, key: string, nowMs: number): number | null {
    const s = this.services.get(service);
    const k = this.keys.get(`${service}|${key}`);
    const until = Math.max(
      s && s.retryAt > nowMs ? s.retryAt : 0,
      k && k.retryAt > nowMs ? k.retryAt : 0,
    );
    return until > 0 ? until : null;
  }

  success(service: string, key: string): void {
    this.keys.delete(`${service}|${key}`);
    this.services.delete(service);
  }

  // 실패 기록 — 다음 시도 가능 시각(ms)을 돌려준다.
  failure(service: string, key: string, nowMs: number, serviceWide: boolean): number {
    if (serviceWide) {
      const failures = (this.services.get(service)?.failures ?? 0) + 1;
      const retryAt = nowMs + backoffMs(failures, SERVICE_BLOCK_BASE_MS, SERVICE_BLOCK_MAX_MS);
      this.services.set(service, { failures, retryAt });
      return retryAt;
    }
    const id = `${service}|${key}`;
    const failures = (this.keys.get(id)?.failures ?? 0) + 1;
    const retryAt = nowMs + backoffMs(failures, COOLDOWN_BASE_MS, COOLDOWN_MAX_MS);
    this.keys.set(id, { failures, retryAt });
    return retryAt;
  }
}

// 쿨다운 안내 문구용 — 남은 초(최소 1).
export const retryAfterSec = (retryAt: number, nowMs: number): number =>
  Math.max(1, Math.ceil((retryAt - nowMs) / 1000));

// ── 클라이언트별 일일 예산 ─────────────────────────────────────────────────
// IP 1개가 역명·키를 순회하며 공유 일일 쿼터를 혼자 태우는 것을 막는다(E-7). 캐시 히트는 세지 않고
// 업스트림을 실제로 부르는 미스만 센다. CORS * 와 IP 분산에는 약한 보조 수단 — 본 방어는 버킷·쿨다운.
const CLIENT_BUDGET_MAX_CLIENTS = 10_000;

export class PerClientDailyBudget {
  private readonly used = new LRUCache<string, { dateKey: string; count: number }>({
    max: CLIENT_BUDGET_MAX_CLIENTS,
  });

  constructor(private readonly limit: number) {}

  // 1 소비 — 예산이 남았으면 true(소비), 바닥났으면 false(소비 없음).
  take(client: string, now: Date): boolean {
    const dateKey = seoulDateKey(now);
    const cur = this.used.get(client);
    const count = cur && cur.dateKey === dateKey ? cur.count : 0;
    if (count >= this.limit) return false;
    this.used.set(client, { dateKey, count: count + 1 });
    return true;
  }
}
