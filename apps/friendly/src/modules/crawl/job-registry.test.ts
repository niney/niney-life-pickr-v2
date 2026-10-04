import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobRegistry, MAX_CONCURRENT_PER_ACTOR } from './job-registry.js';

const done = (r: JobRegistry, id: string): void =>
  r.addEvent(id, {
    seq: 1,
    type: 'done',
    at: new Date().toISOString(),
    result: { ok: true, data: {} as never, fetchedAt: '', durationMs: 0 },
  });

afterEach(() => {
  vi.useRealTimers();
});

// A-V1 — 대기열은 슬롯 집계와 같은 registry 에 있어 모든 CrawlService 인스턴스가 공유한다.
describe('JobRegistry 공유 대기열 + 종료 대기', () => {
  it('takeQueued 는 actor 별 FIFO 이고 취소·종료된 항목은 건너뛴다', () => {
    const r = new JobRegistry();
    const a = r.create({ url: 'u', placeId: 'p1', actorId: 'a1' });
    const b = r.create({ url: 'u', placeId: 'p2', actorId: 'a1' });
    const other = r.create({ url: 'u', placeId: 'p3', actorId: 'a2' });
    const started: string[] = [];
    r.enqueue(a.id, 'a1', () => started.push('a'));
    r.enqueue(other.id, 'a2', () => started.push('other'));
    r.enqueue(b.id, 'a1', () => started.push('b'));

    expect(r.cancel(a.id, 'a1')).toBe('queued-cancelled');
    expect(a.abortSignal.aborted).toBe(true); // 대기 취소도 abort — startCrawl 준비 중 감지용
    expect(r.pendingCount('a1')).toBe(1);

    r.takeQueued('a1')?.();
    expect(started).toEqual(['b']);
    expect(r.takeQueued('a1')).toBeNull();
    expect(r.pendingCount('a2')).toBe(1);
  });

  it('abortAll 은 대기열을 비우고 대기 잡도 abort 한다(종료 중 새 크롤 시작 방지)', () => {
    const r = new JobRegistry();
    const active = r.create({ url: 'u', placeId: 'p1', actorId: 'a1' });
    r.markActive(active.id);
    const queued = r.create({ url: 'u', placeId: 'p2', actorId: 'a1' });
    r.enqueue(queued.id, 'a1', () => undefined);
    r.abortAll();
    expect(active.abortSignal.aborted).toBe(true);
    expect(queued.abortSignal.aborted).toBe(true);
    expect(r.pendingCount()).toBe(0);
  });

  it('waitForTerminal — 없는 잡은 missing, 끝난 잡은 즉시 terminal, 진행 잡은 종료 이벤트까지', async () => {
    const r = new JobRegistry();
    await expect(r.waitForTerminal('nope', 1_000)).resolves.toBe('missing');
    const finished = r.create({ url: 'u', placeId: 'p1', actorId: 'a1' });
    done(r, finished.id);
    await expect(r.waitForTerminal(finished.id, 1_000)).resolves.toBe('terminal');

    const running = r.create({ url: 'u', placeId: 'p2', actorId: 'a1' });
    const waiting = r.waitForTerminal(running.id, 60_000);
    done(r, running.id);
    await expect(waiting).resolves.toBe('terminal');
  });

  it('waitForTerminal — 상한을 넘기면 timeout(호출자가 무한 대기하지 않게)', async () => {
    vi.useFakeTimers();
    const r = new JobRegistry();
    const stuck = r.create({ url: 'u', placeId: 'p1', actorId: 'a1' });
    const waiting = r.waitForTerminal(stuck.id, 30 * 60_000);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    await expect(waiting).resolves.toBe('timeout');
  });
});

describe('JobRegistry concurrency + queue', () => {
  it('hasSlotForActor reflects only active phase, not queued', () => {
    const r = new JobRegistry();
    const actor = 'a1';
    expect(r.hasSlotForActor(actor)).toBe(true);

    // Fill all slots with active jobs.
    const active: string[] = [];
    for (let i = 0; i < MAX_CONCURRENT_PER_ACTOR; i++) {
      const { id } = r.create({ url: `u${i}`, placeId: `p${i}`, actorId: actor });
      r.markActive(id);
      active.push(id);
    }
    expect(r.hasSlotForActor(actor)).toBe(false);

    // Adding more jobs (still queued) does NOT consume a slot — that's the
    // whole point: the queue holds them until a running job finishes.
    r.create({ url: 'u-extra', placeId: 'p-extra', actorId: actor });
    expect(r.countActive(actor)).toBe(MAX_CONCURRENT_PER_ACTOR);
    expect(r.hasSlotForActor(actor)).toBe(false);

    // Finishing one frees a slot.
    r.addEvent(active[0]!, {
      seq: 1,
      type: 'done',
      at: new Date().toISOString(),
      result: { ok: true, data: {} as never, fetchedAt: '', durationMs: 0 },
    });
    expect(r.hasSlotForActor(actor)).toBe(true);
  });

  it('cap is per-actor — other actors are unaffected', () => {
    const r = new JobRegistry();
    for (let i = 0; i < MAX_CONCURRENT_PER_ACTOR; i++) {
      const { id } = r.create({ url: `u${i}`, placeId: `p${i}`, actorId: 'a1' });
      r.markActive(id);
    }
    expect(r.hasSlotForActor('a1')).toBe(false);
    expect(r.hasSlotForActor('a2')).toBe(true);
  });

  it('cancel returns queued-cancelled for a queued job, aborted for an active one', () => {
    const r = new JobRegistry();
    const actor = 'a1';
    const queued = r.create({ url: 'u', placeId: 'p1', actorId: actor });
    expect(r.cancel(queued.id, actor)).toBe('queued-cancelled');

    const active = r.create({ url: 'u', placeId: 'p2', actorId: actor });
    r.markActive(active.id);
    expect(r.cancel(active.id, actor)).toBe('aborted');
    expect(active.abortSignal.aborted).toBe(true);
  });

  it('findInFlightByPlace dedupes against queued jobs too', () => {
    const r = new JobRegistry();
    const actor = 'a1';
    // Saturate so the next create stays queued (in real flow the service
    // would do that — the registry doesn't auto-queue, it just tracks phase).
    const { id: firstId } = r.create({ url: 'u', placeId: 'p1', actorId: actor });
    // First job is still in 'queued' phase since we haven't called markActive.
    expect(r.findInFlightByPlace(actor, 'p1')).toBe(firstId);
  });
});
