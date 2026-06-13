import type {
  LlmTelemetryCallType,
  LlmTelemetrySnapshotType,
} from '@repo/api-contract';
import type { AdapterCallEvent } from './adapters/ollama-cloud.adapter.js';
import { accountGateRegistry, type GateSnapshot } from './concurrency-gate.js';

// LLM 사용량 텔레메트리 — 표시 전용 인메모리 집계.
//
// friendly 의 모든 LLM 호출이 AdapterCache → OllamaCloudAdapter 한 경로로
// 수렴하므로, AdapterCache 가 purpose 라벨을 붙여 record() 로 흘려보내면
// 누락 없이 전 지점이 잡힌다. 강제(예산 차단) 없음 — 어드민 플로팅 패널과
// SSE 스트림이 읽는 관찰 전용 싱글턴이다.
//
// 메모리 바운드: recent 링버퍼 50건, 분 버킷 60개, byModel 30종 — 전부
// 고정 상한이라 장기 가동에도 누수가 없다. 재시작 시 리셋 (startedAt 노출).

const RECENT_MAX = 50;
const BUCKET_MINUTES = 60;
const BY_MODEL_MAX = 30;

interface Agg {
  requests: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
}

interface MinuteBucket extends Agg {
  durTotal: number;
  durCount: number;
  durMax: number;
}

interface ActiveCall {
  id: number;
  purpose: string;
  model: string;
  startedAt: number;
}

const emptyAgg = (): Agg => ({ requests: 0, errors: 0, promptTokens: 0, completionTokens: 0 });

export class LlmTelemetry {
  private readonly startedAt = new Date().toISOString();
  private revisionNo = 0;
  private readonly listeners = new Set<() => void>();

  private readonly active = new Map<number, ActiveCall>();
  private readonly recent: LlmTelemetryCallType[] = [];
  private readonly totals = {
    ...emptyAgg(),
    ok: 0,
    cancelled: 0,
    retries: 0,
  };
  private readonly byPurpose = new Map<string, Agg>();
  private readonly byModel = new Map<string, Agg>();
  private readonly buckets = new Map<number, MinuteBucket>();
  // purpose 게이트는 어댑터가 소유하고 캐시 회전으로 교체될 수 있어,
  // 라벨별 "최신 어댑터의 스냅샷 함수"를 들고 있다 (덮어쓰기).
  private readonly purposeGates = new Map<string, () => GateSnapshot>();
  // start 이벤트의 큐 대기 시간을 end 레코드에 합치기 위한 임시 저장.
  private readonly pendingQueueWait = new Map<number, number>();

  get revision(): number {
    return this.revisionNo;
  }

  registerPurposeGate(purpose: string, snap: () => GateSnapshot): void {
    this.purposeGates.set(purpose, snap);
  }

  record(purpose: string, event: AdapterCallEvent): void {
    if (event.type === 'start') {
      this.active.set(event.callId, {
        id: event.callId,
        purpose,
        model: event.model,
        startedAt: Date.now(),
      });
      // queueWaitMs 는 end 레코드에 합쳐 보여준다 — start 시점엔 active 만.
      this.pendingQueueWait.set(event.callId, event.queueWaitMs);
    } else {
      this.active.delete(event.callId);
      const queueWaitMs = this.pendingQueueWait.get(event.callId) ?? 0;
      this.pendingQueueWait.delete(event.callId);

      const call: LlmTelemetryCallType = {
        id: event.callId,
        purpose,
        model: event.model,
        status: event.status,
        errorName: event.errorName,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        queueWaitMs,
        durationMs: event.durationMs,
        retries: event.retries,
        at: new Date().toISOString(),
      };
      this.recent.unshift(call);
      if (this.recent.length > RECENT_MAX) this.recent.pop();

      const isError = event.status === 'error' || event.status === 'timeout';
      this.totals.requests += 1;
      if (event.status === 'ok') this.totals.ok += 1;
      if (event.status === 'cancelled') this.totals.cancelled += 1;
      if (isError) this.totals.errors += 1;
      this.totals.promptTokens += event.promptTokens ?? 0;
      this.totals.completionTokens += event.completionTokens ?? 0;
      this.totals.retries += event.retries;

      this.bump(this.byPurpose, purpose, event, isError);
      this.bumpModel(event, isError);
      this.bumpBucket(event, isError);
    }
    this.revisionNo += 1;
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        // 리스너 오류가 수집을 막으면 안 된다
      }
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  snapshot(): LlmTelemetrySnapshotType {
    const now = Date.now();
    return {
      startedAt: this.startedAt,
      totals: { ...this.totals },
      byPurpose: [...this.byPurpose.entries()].map(([purpose, a]) => ({ purpose, ...a })),
      byModel: [...this.byModel.entries()].map(([model, a]) => ({ model, ...a })),
      windows: {
        m1: this.window(1),
        m5: this.window(5),
        h1: this.window(60),
      },
      active: [...this.active.values()].map((a) => ({
        id: a.id,
        purpose: a.purpose,
        model: a.model,
        runningMs: now - a.startedAt,
      })),
      recent: [...this.recent],
      gates: {
        account: accountGateRegistry.snapshots(),
        purposes: [...this.purposeGates.entries()].map(([purpose, snap]) => ({
          purpose,
          gate: snap(),
        })),
      },
    };
  }

  // 스트림이 idle 일 때 푸시를 멈춰도 되는지 판단하는 용도 — 진행 중이거나
  // 큐에 대기가 있으면 게이트 상태가 이벤트 없이도 계속 변한다.
  hasActivity(): boolean {
    if (this.active.size > 0) return true;
    if (accountGateRegistry.snapshots().some((g) => g.inflight > 0 || g.queued > 0)) return true;
    for (const snap of this.purposeGates.values()) {
      const g = snap();
      if (g.inflight > 0 || g.queued > 0) return true;
    }
    return false;
  }

  private bump(map: Map<string, Agg>, key: string, e: AdapterCallEvent & { type: 'end' }, isError: boolean): void {
    let agg = map.get(key);
    if (!agg) {
      agg = emptyAgg();
      map.set(key, agg);
    }
    agg.requests += 1;
    if (isError) agg.errors += 1;
    agg.promptTokens += e.promptTokens ?? 0;
    agg.completionTokens += e.completionTokens ?? 0;
  }

  private bumpModel(e: AdapterCallEvent & { type: 'end' }, isError: boolean): void {
    if (!this.byModel.has(e.model) && this.byModel.size >= BY_MODEL_MAX) {
      // 모델명이 자유 입력이라 무한히 늘 수 있다 — 가장 오래된 것부터 정리.
      const oldest = this.byModel.keys().next().value;
      if (oldest !== undefined) this.byModel.delete(oldest);
    }
    this.bump(this.byModel, e.model, e, isError);
  }

  private bumpBucket(e: AdapterCallEvent & { type: 'end' }, isError: boolean): void {
    const minute = Math.floor(Date.now() / 60_000);
    let bucket = this.buckets.get(minute);
    if (!bucket) {
      bucket = { ...emptyAgg(), durTotal: 0, durCount: 0, durMax: 0 };
      this.buckets.set(minute, bucket);
      // 오래된 버킷 정리 — 60분 밖은 어떤 윈도우에도 안 들어간다.
      for (const key of this.buckets.keys()) {
        if (key < minute - BUCKET_MINUTES) this.buckets.delete(key);
      }
    }
    bucket.requests += 1;
    if (isError) bucket.errors += 1;
    bucket.promptTokens += e.promptTokens ?? 0;
    bucket.completionTokens += e.completionTokens ?? 0;
    bucket.durTotal += e.durationMs;
    bucket.durCount += 1;
    if (e.durationMs > bucket.durMax) bucket.durMax = e.durationMs;
  }

  private window(minutes: number): LlmTelemetrySnapshotType['windows']['m1'] {
    const nowMinute = Math.floor(Date.now() / 60_000);
    const agg = { ...emptyAgg(), durTotal: 0, durCount: 0, durMax: 0 };
    for (const [minute, b] of this.buckets) {
      if (minute <= nowMinute && minute > nowMinute - minutes) {
        agg.requests += b.requests;
        agg.errors += b.errors;
        agg.promptTokens += b.promptTokens;
        agg.completionTokens += b.completionTokens;
        agg.durTotal += b.durTotal;
        agg.durCount += b.durCount;
        if (b.durMax > agg.durMax) agg.durMax = b.durMax;
      }
    }
    return {
      requests: agg.requests,
      errors: agg.errors,
      promptTokens: agg.promptTokens,
      completionTokens: agg.completionTokens,
      avgDurationMs: agg.durCount > 0 ? Math.round(agg.durTotal / agg.durCount) : null,
      maxDurationMs: agg.durCount > 0 ? agg.durMax : null,
    };
  }
}

// 모듈 싱글턴 — AdapterCache(수집)와 telemetry 라우트(조회)가 공유.
export const llmTelemetry = new LlmTelemetry();
