import { describe, expect, it } from 'vitest';
import { JobRegistry, MAX_CONCURRENT_PER_ACTOR } from './job-registry.js';

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
