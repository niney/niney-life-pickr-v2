import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SajuGProfile, SajuGReadingResult } from '@repo/api-contract';
import { SAJU_G_LEGACY_STORAGE } from './sajuGStorageMigration.js';
import {
  readSajuGProfiles,
  removeSajuGProfile,
  saveSajuGProfile,
  setSajuGProfileStorage,
  SAJU_G_PROFILE_STORAGE_KEY,
} from './sajuGProfileStore.js';
import {
  readDeviceSajuG,
  removeDeviceSajuG,
  sajuGShareCredential,
  storeDeviceSajuG,
} from './sajuGHistoryStore.js';

const profile = SajuGProfile.parse({
  id: 'old-profile',
  name: '이전 별명',
  birth: { date: '1990-05-21' },
  revision: 1,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
});
const reading = SajuGReadingResult.parse({
  readingId: null,
  receipt: null,
  birth: profile.birth,
  kind: 'natal',
  source: 'basic',
  model: null,
  promptVersion: 3,
  fallbackReason: 'not_configured',
  remainingToday: null,
  createdAt: profile.createdAt,
  chart: {
    calculationVersion: 1,
    solarDate: '1990-05-21',
    lunarDate: '1990.04.27',
    timeLabel: '모름',
    standardTime: null,
    dayBoundary: 'midnight',
    pillars: ['year', 'month', 'day', 'hour'].map((key) => ({
      key,
      label: key,
      ganZhi: null,
      pronunciation: null,
      stemElement: null,
      branchElement: null,
      tenGod: null,
      candidates: [],
      hiddenStems: [],
    })),
    elements: ['wood', 'fire', 'earth', 'metal', 'water'].map((element) => ({ element, count: 0 })),
    unknownCharacters: 8,
    dayMaster: null,
    notices: [],
    facts: [],
    period: {
      kind: 'natal',
      label: '나의 지도',
      key: 'natal',
      ganZhi: null,
      relation: null,
      months: [],
    },
  },
  report: {
    headline: '이전 풀이',
    summary: '보관된 이야기',
    sections: ['a', 'b', 'c'].map((id) => ({
      id,
      title: id,
      text: '내용',
      evidenceIds: ['scope'],
    })),
    practice: '실천',
    reflection: '질문',
  },
});
let values: Map<string, string>;
let failWrite: boolean;
let failCleanup: boolean;
beforeEach(() => {
  values = new Map();
  failWrite = false;
  failCleanup = false;
  const adapter = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failWrite) throw new Error('storage full');
      values.set(key, value);
    },
    removeItem: (key: string) => {
      if (failCleanup) throw new Error('cleanup blocked');
      values.delete(key);
    },
  };
  vi.stubGlobal('localStorage', adapter);
  setSajuGProfileStorage(adapter);
});
afterEach(() => vi.unstubAllGlobals());

describe('사주(G) 기기 저장소 이전', () => {
  it('프로필을 새 키로 옮기고 삭제한 프로필을 이전 키에서 되살리지 않는다', async () => {
    values.set(SAJU_G_LEGACY_STORAGE.profiles, JSON.stringify([profile]));
    expect(await readSajuGProfiles()).toEqual([profile]);
    expect(values.has(SAJU_G_LEGACY_STORAGE.profiles)).toBe(false);
    await removeSajuGProfile(profile.id);
    expect(await readSajuGProfiles()).toEqual([]);
    expect(JSON.parse(values.get(SAJU_G_PROFILE_STORAGE_KEY)!)).toEqual([]);
  });
  it('새 키의 최신 수정과 이전 키의 다른 프로필을 합치고 동시 저장도 보존한다', async () => {
    const changed = { ...profile, revision: 2, name: '새 키에서 수정' };
    values.set(SAJU_G_PROFILE_STORAGE_KEY, JSON.stringify([changed]));
    values.set(
      SAJU_G_LEGACY_STORAGE.profiles,
      JSON.stringify([profile, { ...profile, id: 'another-profile' }]),
    );
    const [items] = await Promise.all([
      readSajuGProfiles(),
      saveSajuGProfile({ name: '동시에 저장', birth: profile.birth }),
    ]);
    expect(items).toContainEqual(changed);
    expect(await readSajuGProfiles()).toHaveLength(3);
    expect(values.has(SAJU_G_LEGACY_STORAGE.profiles)).toBe(false);
  });
  it('새 저장소 쓰기에 실패하면 이전 데이터를 지우지 않고 재시도한다', async () => {
    const raw = JSON.stringify([profile]);
    values.set(SAJU_G_LEGACY_STORAGE.profiles, raw);
    failWrite = true;
    await expect(readSajuGProfiles()).rejects.toThrow('storage full');
    expect(values.get(SAJU_G_LEGACY_STORAGE.profiles)).toBe(raw);
    expect(values.has(SAJU_G_PROFILE_STORAGE_KEY)).toBe(false);
    failWrite = false;
    expect(await readSajuGProfiles()).toEqual([profile]);
  });
  it('이전 키 정리에 실패한 동안 수정·삭제를 중단해 재등장을 막는다', async () => {
    values.set(SAJU_G_LEGACY_STORAGE.profiles, JSON.stringify([profile]));
    failCleanup = true;
    await expect(removeSajuGProfile(profile.id)).rejects.toThrow('cleanup blocked');
    expect(JSON.parse(values.get(SAJU_G_PROFILE_STORAGE_KEY)!)).toEqual([profile]);
    failCleanup = false;
    await removeSajuGProfile(profile.id);
    expect(await readSajuGProfiles()).toEqual([]);
  });
  it('손상된 이전 프로필을 발견해도 양쪽 저장소를 덮어쓰지 않는다', async () => {
    const current = JSON.stringify([profile]);
    values.set(SAJU_G_PROFILE_STORAGE_KEY, current);
    values.set(SAJU_G_LEGACY_STORAGE.profiles, '{broken');
    await expect(readSajuGProfiles()).rejects.toThrow();
    expect(values.get(SAJU_G_PROFILE_STORAGE_KEY)).toBe(current);
    expect(values.get(SAJU_G_LEGACY_STORAGE.profiles)).toBe('{broken');
  });
  it('게스트 보관함과 다른 계정의 보관함을 분리해서 옮긴다', () => {
    values.set(SAJU_G_LEGACY_STORAGE.history('guest'), JSON.stringify([reading]));
    values.set(
      SAJU_G_LEGACY_STORAGE.history('member'),
      JSON.stringify([{ ...reading, createdAt: '2026-09-02T00:00:00Z' }]),
    );
    expect(readDeviceSajuG('guest')).toEqual([reading]);
    expect(values.has(SAJU_G_LEGACY_STORAGE.history('guest'))).toBe(false);
    expect(values.has(SAJU_G_LEGACY_STORAGE.history('member'))).toBe(true);
    removeDeviceSajuG('guest', reading.createdAt);
    expect(readDeviceSajuG('guest')).toEqual([]);
    expect(readDeviceSajuG('member')[0]?.createdAt).toBe('2026-09-02T00:00:00Z');
  });
  it('보관함 이전의 쓰기가 실패해도 기존 결과를 보여주고 삭제는 성공으로 처리하지 않는다', () => {
    const raw = JSON.stringify([reading]);
    values.set(SAJU_G_LEGACY_STORAGE.history('guest'), raw);
    failWrite = true;
    expect(readDeviceSajuG('guest')).toEqual([reading]);
    expect(() => removeDeviceSajuG('guest', reading.createdAt)).toThrow('storage full');
    expect(values.get(SAJU_G_LEGACY_STORAGE.history('guest'))).toBe(raw);
    failWrite = false;
    removeDeviceSajuG('guest', reading.createdAt);
    expect(readDeviceSajuG('guest')).toEqual([]);
  });
  it('양쪽 보관함을 합칠 때 같은 결과는 새 키의 값으로 유지한다', () => {
    values.set(SAJU_G_LEGACY_STORAGE.history('guest'), JSON.stringify([reading]));
    const updated = { ...reading, report: { ...reading.report, headline: '새 키의 풀이' } };
    values.set('lp:saju-g:v1:guest', JSON.stringify([updated]));
    storeDeviceSajuG('guest', { ...reading, createdAt: '2026-09-03T00:00:00Z' });
    expect(readDeviceSajuG('guest')).toHaveLength(2);
    expect(readDeviceSajuG('guest')[1]).toEqual(updated);
  });
  it('기존 공유 취소 자격증명을 옮기고 취소 시 두 키 모두 정리한다', () => {
    values.set(SAJU_G_LEGACY_STORAGE.share('token'), 'revoke-credential');
    expect(sajuGShareCredential.get('token')).toBe('revoke-credential');
    expect(values.get('lp:saju-g-share:token')).toBe('revoke-credential');
    expect(values.has(SAJU_G_LEGACY_STORAGE.share('token'))).toBe(false);
    sajuGShareCredential.remove('token');
    expect(sajuGShareCredential.get('token')).toBeNull();
  });
  it('새 키를 쓸 수 없어도 이전 공유 취소 자격을 반환한다', () => {
    values.set(SAJU_G_LEGACY_STORAGE.share('token'), 'revoke-credential');
    failWrite = true;
    expect(sajuGShareCredential.get('token')).toBe('revoke-credential');
    expect(values.get(SAJU_G_LEGACY_STORAGE.share('token'))).toBe('revoke-credential');
  });
});
