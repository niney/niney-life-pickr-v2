import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MealRecognitionDebugStore } from './meal-recognition-debug.store.js';

describe('MealRecognitionDebugStore', () => {
  const dirs: string[] = [];

  const makeDir = async (): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), 'lifepickr-meal-recognition-debug-'));
    dirs.push(dir);
    return dir;
  };

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('기본 덤프는 원문·식별자를 남기지 않고 HMAC 해시 메타데이터만 저장한다', async () => {
    const dir = await makeDir();
    const token = '11111111-2222-4333-8444-555555555555';
    const store = new MealRecognitionDebugStore({
      dir,
      enabled: true,
      rawEnabled: false,
      hashSecret: 'debug-store-test-secret',
      now: () => new Date('2026-08-23T10:00:00.000Z'),
    });
    await store.write({
      version: 7,
      phase: 'success',
      model: 'vision-test',
      userId: 'private-user-id',
      photoTokens: [token],
      rawText: `사진 ${token}은 김치찌개`,
      dishes: [{ name: '비밀음식', photoToken: token }],
      error: '민감한 오류 원문',
    });

    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain(token);
    const text = await readFile(join(dir, files[0]!), 'utf8');
    expect(text).not.toContain('private-user-id');
    expect(text).not.toContain(token);
    expect(text).not.toContain('비밀음식');
    expect(text).not.toContain('민감한 오류 원문');
    const json = JSON.parse(text) as Record<string, unknown>;
    expect(json).toMatchObject({ version: 7, phase: 'success', model: 'vision-test', rawIncluded: false });
    expect(json.userHash).toMatch(/^[a-f0-9]{64}$/);
    expect(json.photoTokenHashes).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
  });

  it('원문을 명시적으로 켜도 사진 토큰은 해시 표시로 치환한다', async () => {
    const dir = await makeDir();
    const token = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const store = new MealRecognitionDebugStore({
      dir,
      enabled: true,
      rawEnabled: true,
      hashSecret: 'debug-store-test-secret',
    });
    await store.write({
      version: 7,
      phase: 'parse_error',
      model: 'vision-test',
      userId: 'raw-user',
      photoTokens: [token],
      rawText: `token=${token}; 김치찌개`,
      dishes: [{ name: '김치찌개', token }],
    });

    const [file] = await readdir(dir);
    const text = await readFile(join(dir, file!), 'utf8');
    expect(text).not.toContain(token);
    expect(text).toContain('[photo-token:');
    expect(text).toContain('김치찌개');
    expect(JSON.parse(text)).toMatchObject({ rawIncluded: true });
  });

  it('TTL을 넘긴 정규 덤프만 지운다', async () => {
    const dir = await makeDir();
    const store = new MealRecognitionDebugStore({
      dir,
      enabled: true,
      ttlHours: 1,
      hashSecret: 'debug-store-test-secret',
    });
    await store.write({
      version: 7,
      phase: 'success',
      model: null,
      userId: 'ttl-user',
      photoTokens: ['bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'],
    });
    const [file] = await readdir(dir);
    const old = new Date(Date.now() - 2 * 3_600_000);
    await utimes(join(dir, file!), old, old);

    expect(await store.sweepExpired()).toBe(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it('사진 토큰 원문을 담은 구형 덤프는 보존 기간을 기다리지 않고 즉시 지운다', async () => {
    const dir = await makeDir();
    const token = 'dddddddd-eeee-4fff-8000-111111111111';
    const legacyName = `2026-08-23T10-00-00-000Z__success__${token}.json`;
    await writeFile(
      join(dir, legacyName),
      JSON.stringify({ version: 1, phase: 'success', photoTokens: [token], rawText: '구형 원문' }),
      'utf8',
    );
    const store = new MealRecognitionDebugStore({
      dir,
      enabled: true,
      ttlHours: 24,
      hashSecret: 'debug-store-test-secret',
    });

    expect(await store.sweepExpired()).toBe(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it('전체 삭제는 해당 사용자 해시의 덤프만 지운다', async () => {
    const dir = await makeDir();
    const store = new MealRecognitionDebugStore({
      dir,
      enabled: true,
      hashSecret: 'debug-store-test-secret',
    });
    const base = {
      version: 7,
      phase: 'success' as const,
      model: 'vision-test',
      photoTokens: ['cccccccc-dddd-4eee-8fff-000000000000'],
    };
    await store.write({ ...base, userId: 'delete-me' });
    await store.write({ ...base, userId: 'keep-me' });

    expect(await store.purgeForUser('delete-me')).toBe(1);
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const remaining = JSON.parse(await readFile(join(dir, files[0]!), 'utf8')) as { userHash: string };
    expect(remaining.userHash).toBe(store.hashIdentifier('keep-me'));
  });
});
