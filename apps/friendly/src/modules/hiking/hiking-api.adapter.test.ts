import { describe, expect, it } from 'vitest';
import { VworldAddressError, VworldTransientError, matchPeakInfo, reverseGeocodeVillage, villageOfAddress, type MountainInfoRow } from './hiking-api.adapter.js';

// 5차 전국 봉우리 — 들머리 리·동(브이월드 역지오코딩)·봉우리 ↔ 산정보 맞추기.

describe('villageOfAddress', () => {
  it('지번 주소에서 마지막 리·동·가', () => {
    expect(villageOfAddress('강원특별자치도 인제군 기린면 진동리 산 34')).toBe('진동리');
    expect(villageOfAddress('서울특별시 관악구 신림동 310-10')).toBe('신림동');
    expect(villageOfAddress('서울특별시 종로구 종로1가 1')).toBe('종로1가');
    expect(villageOfAddress('경상남도 거창군 거창읍')).toBeNull();
    expect(villageOfAddress(null)).toBeNull();
  });
});

describe('matchPeakInfo', () => {
  const row = (p: Partial<MountainInfoRow> & { id: string; address: string }): MountainInfoRow => ({ name: '돌산', heightM: null, top100Reason: null, details: null, ...p });
  const byName = new Map([['돌산', [row({ id: '1', address: '강원도 춘천시 동산면' }), row({ id: '2', address: '전라남도 여수시 돌산읍' })]]]);

  const sg = (preferred: string[], others: string[] = []) => ({ preferred, others });
  it('이름(지역 괄호를 뗀 것도)과 시군구가 맞는 것이 하나뿐일 때만', () => {
    expect(matchPeakInfo('돌산(춘천시)', sg(['춘천시']), byName)?.id).toBe('1');
    expect(matchPeakInfo('돌산', sg(['여수시']), byName)?.id).toBe('2');
    expect(matchPeakInfo('돌산', sg(['홍천군']), byName)).toBeNull();
    expect(matchPeakInfo('돌산', sg([]), byName)).toBeNull();
  });

  it('정상이 이웃 시군구에 찍혀도 코스가 걸친 시군구로 맞추고, 둘 다 걸리면 먼저 볼 시군구로 고른다', () => {
    expect(matchPeakInfo('돌산', sg(['홍천군'], ['홍천군', '춘천시']), byName)?.id).toBe('1');
    expect(matchPeakInfo('돌산', sg(['여수시'], ['춘천시', '여수시']), byName)?.id).toBe('2');
    expect(matchPeakInfo('돌산', sg(['홍천군'], ['춘천시', '여수시']), byName)).toBeNull();
  });
});

describe('reverseGeocodeVillage', () => {
  const ok = (text: string) => new Response(JSON.stringify({ response: { status: 'OK', result: [{ text }] } }), { status: 200 });

  it('5xx·네트워크 오류는 다시 묻고, 키·한도 오류(status ERROR)는 바로 멈춘다', async () => {
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls === 1) throw new Error('fetch failed');
      if (calls === 2) return new Response('bad gateway', { status: 502 });
      return ok('강원특별자치도 인제군 기린면 진동리 산 34');
    };
    await expect(reverseGeocodeVillage({ lat: 37.95, lng: 128.4 }, 'k', flaky, 1)).resolves.toBe('진동리');
    expect(calls).toBe(3);

    const quota = async () => new Response(JSON.stringify({ response: { status: 'ERROR', error: { code: 'OVER_REQUEST_LIMIT', text: '한도 초과' } } }), { status: 200 });
    await expect(reverseGeocodeVillage({ lat: 37, lng: 127 }, 'k', quota, 1)).rejects.toBeInstanceOf(VworldAddressError);

    const down = async () => {
      throw new Error('fetch failed');
    };
    await expect(reverseGeocodeVillage({ lat: 37, lng: 127 }, 'k', down, 1)).rejects.toBeInstanceOf(VworldTransientError);
  });

  it('NOT_FOUND(바다·경계 밖)는 null', async () => {
    const none = async () => new Response(JSON.stringify({ response: { status: 'NOT_FOUND' } }), { status: 200 });
    await expect(reverseGeocodeVillage({ lat: 34, lng: 125 }, 'k', none, 1)).resolves.toBeNull();
  });
});
