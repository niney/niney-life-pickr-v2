import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import sensiblePlugin from '../../plugins/sensible.js';
import jwtPlugin from '../../plugins/jwt.js';
import errorHandlerPlugin from '../../plugins/error-handler.js';
import { LlmTelemetry } from './llm-telemetry.js';
import telemetryRoutes from './telemetry.route.js';

describe('LlmTelemetry collector', () => {
  it('aggregates end events into totals/byPurpose/byModel/windows', () => {
    const t = new LlmTelemetry();
    t.record('chat', { type: 'start', callId: 1, model: 'gpt-oss:20b', queueWaitMs: 30 });
    expect(t.snapshot().active).toHaveLength(1);

    t.record('chat', {
      type: 'end',
      callId: 1,
      model: 'gpt-oss:20b',
      status: 'ok',
      errorName: null,
      promptTokens: 100,
      completionTokens: 40,
      durationMs: 1200,
      retries: 1,
    });
    t.record('image', {
      type: 'end',
      callId: 2,
      model: 'qwen-vl',
      status: 'timeout',
      errorName: 'LLMTimeoutError',
      promptTokens: null,
      completionTokens: null,
      durationMs: 60_000,
      retries: 0,
    });

    const snap = t.snapshot();
    expect(snap.active).toHaveLength(0);
    expect(snap.totals).toMatchObject({
      requests: 2,
      ok: 1,
      errors: 1,
      cancelled: 0,
      promptTokens: 100,
      completionTokens: 40,
      retries: 1,
    });
    expect(snap.byPurpose).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ purpose: 'chat', requests: 1, promptTokens: 100 }),
        expect.objectContaining({ purpose: 'image', requests: 1, errors: 1 }),
      ]),
    );
    expect(snap.byModel).toEqual(
      expect.arrayContaining([expect.objectContaining({ model: 'gpt-oss:20b', requests: 1 })]),
    );
    // 직전 호출이므로 1분 윈도우에 들어 있어야 한다.
    expect(snap.windows.m1.requests).toBe(2);
    expect(snap.windows.m1.maxDurationMs).toBe(60_000);
    // start 의 queueWaitMs 가 end 레코드로 합쳐진다.
    expect(snap.recent.find((c) => c.id === 1)).toMatchObject({ queueWaitMs: 30, status: 'ok' });
  });

  it('notifies subscribers and bumps revision on record', () => {
    const t = new LlmTelemetry();
    let notified = 0;
    const unsub = t.subscribe(() => {
      notified += 1;
    });
    t.record('chat', { type: 'start', callId: 9, model: 'm', queueWaitMs: 0 });
    expect(notified).toBe(1);
    expect(t.revision).toBe(1);
    unsub();
    t.record('chat', {
      type: 'end',
      callId: 9,
      model: 'm',
      status: 'cancelled',
      errorName: 'LLMCancelledError',
      promptTokens: null,
      completionTokens: null,
      durationMs: 5,
      retries: 0,
    });
    expect(notified).toBe(1); // 구독 해지 후엔 안 옴
    expect(t.snapshot().totals.cancelled).toBe(1);
  });

  it('caps the recent ring buffer', () => {
    const t = new LlmTelemetry();
    for (let i = 0; i < 60; i += 1) {
      t.record('chat', {
        type: 'end',
        callId: i,
        model: 'm',
        status: 'ok',
        errorName: null,
        promptTokens: 1,
        completionTokens: 1,
        durationMs: 1,
        retries: 0,
      });
    }
    const snap = t.snapshot();
    expect(snap.recent).toHaveLength(50);
    // 최신이 맨 앞.
    expect(snap.recent[0]!.id).toBe(59);
    expect(snap.totals.requests).toBe(60);
  });
});

describe('telemetry routes — auth guards', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(sensiblePlugin);
    await app.register(errorHandlerPlugin);
    await app.register(jwtPlugin);
    await app.register(telemetryRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /telemetry: 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/ai/telemetry' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /telemetry: 403 with USER role', async () => {
    const token = app.jwt.sign({ userId: 'u', email: 'u@x.com', role: 'USER' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ai/telemetry',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /telemetry: returns a snapshot for ADMIN', async () => {
    const token = app.jwt.sign({ userId: 'a', email: 'a@x.com', role: 'ADMIN' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ai/telemetry',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      totals: expect.objectContaining({ requests: expect.any(Number) }),
      windows: expect.objectContaining({ m1: expect.any(Object) }),
      gates: expect.objectContaining({ account: expect.any(Array) }),
    });
    expect(typeof body.startedAt).toBe('string');
  });

  it('GET /telemetry/stream: 401 with bad query token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/ai/telemetry/stream?token=nope',
    });
    expect(res.statusCode).toBe(401);
  });
});
