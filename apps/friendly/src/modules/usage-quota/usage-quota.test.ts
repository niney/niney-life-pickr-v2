import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { seedAuthUsers } from '../../test-utils/seed-users.js';
import { useIsolatedDatabase, type IsolatedDatabase } from '../../test-utils/temp-db.js';
import { USAGE_QUOTA_DEFAULTS, UsageQuotaService, kstToday } from './usage-quota.service.js';

// 공용 사용량 한도 — 소비 순서(전역 → IP → 게스트)·되돌리기·회원 면제·컷오프·어드민 라우트.

const F = 'tarot-reading' as const;
const guest = (key: string, ip = '10.0.0.1') => ({ userId: null, guestKey: key, ip });
const member = (userId: string, ip = '10.0.0.9') => ({ userId, guestKey: null, ip });

describe('UsageQuotaService (격리 DB)', () => {
  let app: FastifyInstance;
  let isolated: IsolatedDatabase;
  let svc: UsageQuotaService;

  beforeAll(async () => {
    isolated = await useIsolatedDatabase();
    app = await buildApp({ logger: false });
    await app.ready();
    await seedAuthUsers(app, [
      { id: 'q-admin', role: 'ADMIN' },
      { id: 'q-user', role: 'USER' },
    ]);
    svc = new UsageQuotaService(app.prisma, { settingsTtlMs: 0 });
  });

  beforeEach(async () => {
    await app.prisma.usageQuotaCounter.deleteMany();
    await app.prisma.usageQuotaSetting.deleteMany();
    svc.invalidate();
    app.usageQuota.invalidate();
  });

  afterAll(async () => {
    await app.close();
    isolated.restore();
  });

  it('행이 없으면 코드 기본값으로 동작한다', async () => {
    const s = await svc.getSetting(F);
    expect(s).toEqual({ feature: F, ...USAGE_QUOTA_DEFAULTS[F], updatedAt: null });
    expect(await svc.listSettings()).toHaveLength(1);
  });

  it('게스트: guestPerDay 만큼 허용 후 guest_daily 로 거부, 잔여가 줄어든다', async () => {
    await svc.updateSetting(F, { guestPerDay: 2 });
    expect(await svc.consume(F, guest('g1'))).toEqual({ allowed: true, reason: null, remainingToday: 1 });
    expect(await svc.consume(F, guest('g1'))).toEqual({ allowed: true, reason: null, remainingToday: 0 });
    expect(await svc.consume(F, guest('g1'))).toEqual({ allowed: false, reason: 'guest_daily', remainingToday: 0 });
    // 거부된 호출은 전역·IP 증가분을 되돌린다.
    const today = svc.today();
    expect(await svc.count(F, 'global', '*', today)).toBe(2);
    expect(await svc.count(F, 'ip', '10.0.0.1', today)).toBe(2);
    expect(await svc.count(F, 'guest', 'g1', today)).toBe(2);
    expect(await svc.remainingForGuest(F, guest('g1'))).toBe(0);
    expect(await svc.remainingForGuest(F, guest('g2'))).toBe(2);
  });

  it('IP 일일 한도는 게스트 키가 달라도 IP 로 묶인다', async () => {
    await svc.updateSetting(F, { ipPerDay: 2 });
    expect((await svc.consume(F, guest('a'))).allowed).toBe(true);
    expect((await svc.consume(F, guest('b'))).allowed).toBe(true);
    expect(await svc.consume(F, guest('c'))).toMatchObject({ allowed: false, reason: 'ip_daily' });
    expect(await svc.count(F, 'global', '*', svc.today())).toBe(2);
    // 다른 IP 는 영향 없음.
    expect((await svc.consume(F, guest('c', '10.0.0.2'))).allowed).toBe(true);
  });

  it('게스트 키가 없으면 IP 로 기기 한도를 센다', async () => {
    await svc.updateSetting(F, { guestPerDay: 1 });
    expect((await svc.consume(F, { userId: null, guestKey: null, ip: '10.9.9.9' })).allowed).toBe(true);
    expect(await svc.consume(F, { userId: null, guestKey: null, ip: '10.9.9.9' })).toMatchObject({
      allowed: false,
      reason: 'guest_daily',
    });
  });

  it('회원은 게스트·IP 한도를 건너뛰고 전역만 소비한다', async () => {
    await svc.updateSetting(F, { guestPerDay: 1, ipPerDay: 1 });
    for (let i = 0; i < 3; i++) {
      expect(await svc.consume(F, member('q-user'))).toEqual({ allowed: true, reason: null, remainingToday: null });
    }
    const today = svc.today();
    expect(await svc.count(F, 'user', 'q-user', today)).toBe(3);
    expect(await svc.count(F, 'global', '*', today)).toBe(3);
    expect(await svc.count(F, 'ip', '10.0.0.9', today)).toBe(0);
    expect(await svc.remainingForGuest(F, member('q-user'))).toBeNull();
  });

  it('전역 예산: 게스트는 cutoff 에서 끊기고 회원은 100% 까지 쓴다', async () => {
    await svc.updateSetting(F, { globalPerDay: 4, guestCutoffPct: 50, guestPerDay: 0, ipPerDay: 0 });
    expect((await svc.consume(F, guest('g'))).allowed).toBe(true);
    expect((await svc.consume(F, guest('g'))).allowed).toBe(true);
    expect(await svc.consume(F, guest('g'))).toMatchObject({ allowed: false, reason: 'guest_cutoff' });
    expect((await svc.consume(F, member('q-user'))).allowed).toBe(true);
    expect((await svc.consume(F, member('q-user'))).allowed).toBe(true);
    expect(await svc.consume(F, member('q-user'))).toMatchObject({ allowed: false, reason: 'global_budget' });
    expect(await svc.count(F, 'global', '*', svc.today())).toBe(4);
  });

  it('guestCutoffPct 0 이면 게스트만 차단, globalPerDay 0 이면 무제한', async () => {
    await svc.updateSetting(F, { guestCutoffPct: 0 });
    expect(await svc.consume(F, guest('g'))).toMatchObject({ allowed: false, reason: 'guest_cutoff' });
    expect((await svc.consume(F, member('q-user'))).allowed).toBe(true);
    await svc.updateSetting(F, { guestCutoffPct: 0, globalPerDay: 0 });
    expect((await svc.consume(F, guest('g'))).allowed).toBe(true);
  });

  it('enabled=false 면 전원 disabled', async () => {
    await svc.updateSetting(F, { enabled: false });
    expect(await svc.consume(F, guest('g'))).toMatchObject({ allowed: false, reason: 'disabled' });
    expect(await svc.consume(F, member('q-user'))).toMatchObject({ allowed: false, reason: 'disabled' });
    expect(await svc.remainingForGuest(F, guest('g'))).toBe(0);
  });

  it('usage 는 scope 별 합계와 상위 키를 집계한다', async () => {
    await svc.consume(F, guest('g1', '1.1.1.1'));
    await svc.consume(F, guest('g1', '1.1.1.1'));
    await svc.consume(F, guest('g2', '2.2.2.2'));
    await svc.consume(F, member('q-user'));
    const u = await svc.usage(F, svc.today());
    expect(u).toMatchObject({ global: 4, guestTotal: 3, ipTotal: 3, userTotal: 1 });
    expect(u.topGuests[0]).toEqual({ key: 'g1', count: 2 });
    expect(u.topIps.map((t) => t.key)).toEqual(['1.1.1.1', '2.2.2.2']);
  });

  it('cleanup 은 오래된 날짜의 카운터만 지운다', async () => {
    await app.prisma.usageQuotaCounter.create({
      data: { feature: F, scope: 'global', key: '*', date: '2000-01-01', count: 7 },
    });
    await svc.consume(F, guest('g'));
    expect(await svc.cleanup(30)).toBe(1);
    expect(await app.prisma.usageQuotaCounter.count()).toBe(3);
  });

  it('kstToday 는 서울 날짜', () => {
    expect(kstToday(new Date('2026-09-02T16:30:00Z'))).toBe('2026-09-03');
    expect(kstToday(new Date('2026-09-02T14:30:00Z'))).toBe('2026-09-02');
  });

  it('어드민 라우트: USER 403, ADMIN 은 조회·갱신하고 갱신이 즉시 반영된다', async () => {
    const userToken = app.jwt.sign({ userId: 'q-user', email: 'u@x.com', role: 'USER' });
    const adminToken = app.jwt.sign({ userId: 'q-admin', email: 'a@x.com', role: 'ADMIN' });
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/quotas',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(forbidden.statusCode).toBe(403);

    const put = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/quotas/tarot-reading',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { guestPerDay: 9, guestCutoffPct: 70 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ feature: F, guestPerDay: 9, guestCutoffPct: 70, ipPerDay: 60 });
    expect(put.json().updatedAt).toBeTypeOf('string');

    const get = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/quotas',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(get.statusCode).toBe(200);
    const body = get.json();
    expect(body.date).toBe(app.usageQuota.today());
    expect(body.items[0].setting).toMatchObject({ feature: F, guestPerDay: 9 });
    expect(body.items[0].usage).toMatchObject({ global: 0, topGuests: [] });

    const bad = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/quotas/nope',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { guestPerDay: 1 },
    });
    expect(bad.statusCode).toBe(400);
  });
});
