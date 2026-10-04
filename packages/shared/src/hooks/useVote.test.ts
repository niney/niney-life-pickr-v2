import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client.js';
import { sharedVoteRefetchInterval } from './useVote.js';

// 공개 투표 폴링 간격의 계약을 고정한다.
//  - 진행 중: 15초
//  - 마감: 중단
//  - 만료(410)·없는 링크(404) 같은 4xx: 중단 — 한 번도 성공한 적 없는 쿼리는 재조회
//    때 pending 으로 돌아가, 멈추지 않으면 에러 화면이 15초마다 스피너로 깜빡이고
//    그때마다 요청이 나간다(2026-10 감사에서 발견).
//  - 일시 오류(네트워크·5xx·408·429): 계속 폴링해 스스로 회복

const apiError = (statusCode: number) => new ApiError(statusCode, 'Error', 'error');

describe('sharedVoteRefetchInterval', () => {
  it('진행 중인 투표는 15초마다 다시 조회한다', () => {
    expect(sharedVoteRefetchInterval({ data: { closedAt: null }, error: null })).toBe(15_000);
  });

  it('첫 응답을 기다리는 동안(데이터·에러 없음)에도 간격은 유지된다', () => {
    expect(sharedVoteRefetchInterval({ data: undefined, error: null })).toBe(15_000);
  });

  it('마감된 투표는 폴링을 멈춘다', () => {
    expect(
      sharedVoteRefetchInterval({ data: { closedAt: '2026-08-16T03:00:00.000Z' }, error: null }),
    ).toBe(false);
  });

  it.each([404, 410, 400, 403])('다시 물어도 답이 같은 %i 에서는 폴링을 멈춘다', (status) => {
    expect(sharedVoteRefetchInterval({ data: undefined, error: apiError(status) })).toBe(false);
  });

  it('진행 중이던 투표가 만료(410)로 바뀌어도 멈춘다 — 직전 데이터가 남아 있어도', () => {
    expect(sharedVoteRefetchInterval({ data: { closedAt: null }, error: apiError(410) })).toBe(
      false,
    );
  });

  it.each([500, 502, 503, 408, 429])('일시 오류 %i 는 계속 폴링해 회복을 기다린다', (status) => {
    expect(sharedVoteRefetchInterval({ data: undefined, error: apiError(status) })).toBe(15_000);
  });

  it('네트워크 단절처럼 ApiError 가 아닌 실패도 계속 폴링한다', () => {
    expect(
      sharedVoteRefetchInterval({ data: undefined, error: new TypeError('Failed to fetch') }),
    ).toBe(15_000);
  });
});
