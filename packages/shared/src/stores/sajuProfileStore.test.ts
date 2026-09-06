import { beforeEach, describe, expect, it } from 'vitest';
import { SajuProfileInput } from '@repo/api-contract';
import {
  readSajuProfiles,
  removeSajuProfile,
  saveSajuProfile,
  setSajuProfileStorage,
} from './sajuProfileStore.js';

const input = SajuProfileInput.parse({ name: '나', birth: { date: '1990-05-21' } });
beforeEach(() => {
  const data = new Map<string, string>();
  setSajuProfileStorage({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  });
});
describe('기기 출생 프로필', () => {
  it('동시 생성이 서로의 데이터를 잃지 않고 복원·수정·삭제한다', async () => {
    const [a, b] = await Promise.all([
      saveSajuProfile(input),
      saveSajuProfile({ ...input, name: '친구' }),
    ]);
    expect(await readSajuProfiles()).toHaveLength(2);
    const changed = await saveSajuProfile({ ...input, name: '수정한 나' }, a);
    expect(changed.revision).toBe(2);
    await expect(saveSajuProfile(input, a)).rejects.toThrow('다른 창');
    await removeSajuProfile(a.id);
    expect((await readSajuProfiles()).map((p) => p.id)).toEqual([b.id]);
  });
  it('저장 공간 오류를 성공으로 처리하지 않는다', async () => {
    setSajuProfileStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('storage full');
      },
      removeItem: () => {},
    });
    await expect(saveSajuProfile(input)).rejects.toThrow('storage full');
    expect(await readSajuProfiles()).toEqual([]);
  });
  it('상한을 초과해도 보관한 프로필을 밀어내지 않는다', async () => {
    for (let i = 0; i < 20; i++) await saveSajuProfile({ ...input, name: `사람 ${i}` });
    await expect(saveSajuProfile(input)).rejects.toThrow('20명');
    expect(await readSajuProfiles()).toHaveLength(20);
  });
});
