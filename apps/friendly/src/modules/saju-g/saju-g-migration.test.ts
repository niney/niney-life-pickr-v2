import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useSchemaDatabase } from '../../test-utils/schema-db.js';
import { UsageQuotaService } from '../usage-quota/usage-quota.service.js';

const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const migration = fileURLToPath(
  new URL('../../../prisma/migrations/20260906170000_add_saju_g/migration.sql', import.meta.url),
);
let database: ReturnType<typeof useSchemaDatabase>;
let prisma: PrismaClient;
const execute = (file: string) =>
  execFileSync(process.execPath, [cli, 'db', 'execute', '--file', file, '--url', database.url], {
    stdio: 'pipe',
    timeout: 30_000,
  });
const snapshotC = async () => ({
  profiles: await prisma.sajuProfile.findMany(),
  readings: await prisma.sajuReading.findMany(),
  settings: await prisma.llmProviderConfig.findMany({ orderBy: { purpose: 'asc' } }),
  quota: await prisma.usageQuotaSetting.findMany({ orderBy: { feature: 'asc' } }),
  counters: await prisma.usageQuotaCounter.findMany({ orderBy: { feature: 'asc' } }),
});

beforeEach(async () => {
  database = useSchemaDatabase();
  const setup = join(dirname(database.url.slice(5)), 'before-g.sql');
  writeFileSync(
    setup,
    'PRAGMA foreign_keys=ON; DROP TABLE "saju_g_shares"; DROP TABLE "saju_g_readings"; DROP TABLE "saju_g_profiles";',
  );
  execute(setup);
  prisma = new PrismaClient();
  await prisma.user.create({
    data: { id: 'migration-user', email: 'migration@example.invalid', passwordHash: 'fixture' },
  });
  await prisma.sajuProfile.create({
    data: {
      id: 'same-profile',
      userId: 'migration-user',
      label: '사주(C) 프로필',
      calendar: 'solar',
      birthYear: 1990,
      birthMonth: 5,
      birthDay: 21,
      gender: 'male',
      isPrimary: true,
    },
  });
  await prisma.sajuReading.create({
    data: {
      id: 'same-reading',
      userId: 'migration-user',
      shareToken: 'Ctoken0012',
      kind: 'full',
      inputJson: '{"keep":"input"}',
      chartJson: '{"keep":"chart"}',
      resultJson: '{"keep":"result"}',
      source: 'static',
      dayKey: '2026-09-06',
    },
  });
  for (const [purpose, feature, count] of [
    ['saju', 'saju-reading', 7],
    ['saju-g', 'saju-g-reading', 3],
  ] as const) {
    await prisma.llmProviderConfig.create({
      data: {
        provider: 'ollama-cloud',
        purpose,
        apiKey: purpose + '-fixture-key',
        defaultModel: purpose + '-model',
        enabled: purpose === 'saju-g',
      },
    });
    await prisma.usageQuotaSetting.create({
      data: {
        feature,
        enabled: feature === 'saju-g-reading',
        guestPerDay: 17,
        ipPerDay: 111,
        ipPerMinute: 9,
        globalPerDay: 333,
        guestCutoffPct: 80,
      },
    });
    await prisma.usageQuotaCounter.create({
      data: { feature, scope: 'global', key: '*', date: '2026-09-06', count },
    });
  }
});
afterEach(async () => {
  await prisma?.$disconnect();
  database?.restore();
});

describe('사주(C)와 사주(G) migration 공존', () => {
  it('G 테이블을 생성해도 C 데이터·공유·양쪽 설정과 사용량을 변경하지 않는다', async () => {
    const before = await snapshotC();
    await prisma.$disconnect();
    execute(migration);
    expect(await snapshotC()).toEqual(before);
    const quota = new UsageQuotaService(prisma);
    expect(await quota.count('saju-reading', 'global', '*', '2026-09-06')).toBe(7);
    expect(await quota.count('saju-g-reading', 'global', '*', '2026-09-06')).toBe(3);
    await prisma.sajuGProfile.create({
      data: {
        id: 'same-profile',
        userId: 'migration-user',
        name: 'G 프로필',
        birthJson: '{"date":"1990-05-21"}',
      },
    });
    await prisma.sajuGReading.create({
      data: {
        id: 'same-reading',
        userId: 'migration-user',
        requestKey: 'g-request',
        kind: 'natal',
        snapshotJson: '{"keep":"g-reading"}',
      },
    });
    await prisma.sajuGShare.create({
      data: {
        token: 'Gtoken0012',
        ownerHash: 'owner-hash',
        revokeHash: 'revoke-hash',
        readingId: 'same-reading',
        publicJson: '{"keep":"g-share"}',
      },
    });
    await prisma.sajuGReading.delete({ where: { id: 'same-reading' } });
    expect(await prisma.sajuGShare.count()).toBe(0);
    expect(await prisma.sajuReading.count()).toBe(1);
    await prisma.sajuGProfile.delete({ where: { id: 'same-profile' } });
    expect(await prisma.sajuProfile.count()).toBe(1);
    expect(await snapshotC()).toEqual(before);
    expect(await prisma.$queryRawUnsafe('PRAGMA foreign_key_check')).toEqual([]);
  });
  it('이미 존재하는 G 테이블과 충돌하면 부분 생성 없이 롤백하고 기존 데이터를 보존한다', async () => {
    const ddl = readFileSync(migration, 'utf8');
    const start = ddl.indexOf('CREATE TABLE "saju_g_profiles"');
    const profileSql = ddl.slice(start, ddl.indexOf('\n);', start) + 3);
    await prisma.$executeRawUnsafe(profileSql);
    await prisma.sajuGProfile.create({
      data: { id: 'existing-g', userId: 'migration-user', name: '기존 G', birthJson: '{}' },
    });
    const before = await snapshotC();
    await prisma.$disconnect();
    expect(() => execute(migration)).toThrow();
    expect(await prisma.sajuGProfile.findUnique({ where: { id: 'existing-g' } })).toMatchObject({
      name: '기존 G',
    });
    expect(
      await prisma.$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE name IN ('saju_g_readings','saju_g_shares')",
      ),
    ).toEqual([]);
    expect(await snapshotC()).toEqual(before);
  });
});
