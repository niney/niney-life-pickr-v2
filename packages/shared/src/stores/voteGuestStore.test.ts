import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import { SubmitBallotInput } from '@repo/api-contract';
import { setVoteGuestStorage, useVoteGuestStore } from './voteGuestStore.js';

// 투표 참가자(게스트)의 로컬 상태. 서버에는 "내 찬성 목록" 조회 API 가 없어서
// 재방문 시 체크 상태 복원이 전적으로 이 store 에 달려 있고, voterKey 는 서버가
// (후보, 투표자) 유니크를 거는 유일한 식별자다 — 화면보다 계약에 가까운 코드라
// shared 의 첫 테스트 대상으로 골랐다.

// 앱이 AsyncStorage 를 주입하는 자리를 테스트에서 대신하는 인메모리 어댑터.
const memoryStorage = (): StateStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (name) => data.get(name) ?? null,
    setItem: (name, value) => {
      data.set(name, value);
    },
    removeItem: (name) => {
      data.delete(name);
    },
  };
};

describe('voteGuestStore', () => {
  beforeEach(() => {
    // store 는 모듈 싱글턴이라 테스트마다 비운다(guestId 는 최초 생성분 유지).
    useVoteGuestStore.setState({ name: '', ballots: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('guestId 는 서버의 voterKey 계약을 그대로 통과한다', () => {
    const { guestId } = useVoteGuestStore.getState();
    // 계약(min 8/max 64)을 여기서 직접 확인해 두면, 폴백 경로(randomUUID 미지원
    // 구형 브라우저)로 만든 id 가 400 을 맞는 일을 막을 수 있다.
    const parsed = SubmitBallotInput.safeParse({
      voterKey: guestId,
      voterLabel: '민수',
      optionIds: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('recordBallot — 토큰별로 남고, 재투표는 이전 찬성을 덮어쓴다', () => {
    const { recordBallot } = useVoteGuestStore.getState();

    recordBallot('tokA', ['o1', 'o2']);
    recordBallot('tokB', ['o9']);
    expect(useVoteGuestStore.getState().ballots.tokA?.optionIds).toEqual(['o1', 'o2']);
    expect(useVoteGuestStore.getState().ballots.tokB?.optionIds).toEqual(['o9']);

    // 서버가 풀 리플레이스라 로컬 기록도 합집합이 아니라 교체여야 한다.
    recordBallot('tokA', ['o3']);
    expect(useVoteGuestStore.getState().ballots.tokA?.optionIds).toEqual(['o3']);
  });

  it('투표 철회(빈 배열)도 기록을 남긴다 — 화면의 "수정" 상태가 유지되어야 하므로', () => {
    const { recordBallot } = useVoteGuestStore.getState();

    recordBallot('tokA', ['o1']);
    recordBallot('tokA', []);

    // 키까지 지우면 VotePage 의 hasVoted 가 false 로 돌아가 버튼이 "투표하기" 로
    // 되돌아가고, 철회한 사람이 다시 최소 1개를 골라야만 제출할 수 있게 된다.
    expect(useVoteGuestStore.getState().ballots.tokA).toBeDefined();
    expect(useVoteGuestStore.getState().ballots.tokA?.optionIds).toEqual([]);
  });

  it('기록은 최근 20개까지 — 21번째가 들어오면 가장 오래된 것이 밀린다', () => {
    // votedAt 이 Date.now() 라 실제 시간으로는 같은 ms 에 몰려 정렬이 흔들린다.
    vi.useFakeTimers();
    const { recordBallot } = useVoteGuestStore.getState();

    for (let i = 0; i < 21; i += 1) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i));
      recordBallot(`tok${i}`, ['o1']);
    }

    const { ballots } = useVoteGuestStore.getState();
    expect(Object.keys(ballots)).toHaveLength(20);
    expect(ballots.tok0).toBeUndefined();
    expect(ballots.tok20).toBeDefined();
  });

  it('setVoteGuestStorage 로 주입한 스토리지에 실제로 저장된다', () => {
    const mem = memoryStorage();
    setVoteGuestStorage(mem);

    useVoteGuestStore.getState().setName('민수');

    expect(mem.data.get('vote-guest-v1')).toContain('민수');
  });

  it('앱 시나리오 — 비동기(AsyncStorage형) 스토리지의 저장분이 주입 시 복원된다', async () => {
    // 앱 재시작을 흉내낸다: AsyncStorage 처럼 getItem 이 Promise 를 돌려주는
    // 스토리지에 이전 세션의 persist JSON 이 이미 들어 있고, entry 가 주입을
    // 호출하는 시점은 스토어 모듈 평가(=1차 rehydrate, 빈 스토리지) 이후다.
    // 주입이 재-rehydrate 를 걸어 저장분을 실제로 되살리는지가 핵심 —
    // 실기기 확인 전에 코드 레벨에서 좁힐 수 있는 마지막 갭.
    const persisted = JSON.stringify({
      state: {
        guestId: 'app-guest-restored-uuid',
        name: '복원이름',
        ballots: { tokApp: { optionIds: ['o7'], votedAt: 1_755_300_000_000 } },
      },
      version: 1,
    });
    const data = new Map<string, string>([['vote-guest-v1', persisted]]);
    const asyncStorage = {
      getItem: async (name: string) => data.get(name) ?? null,
      setItem: async (name: string, value: string) => {
        data.set(name, value);
      },
      removeItem: async (name: string) => {
        data.delete(name);
      },
    };

    setVoteGuestStorage(asyncStorage);

    // AsyncStorage 는 비동기라 복원까지 한 틱 걸린다 — 전이를 기다린다.
    await vi.waitFor(() => {
      expect(useVoteGuestStore.getState().name).toBe('복원이름');
    });
    expect(useVoteGuestStore.getState().guestId).toBe('app-guest-restored-uuid');
    expect(useVoteGuestStore.getState().ballots.tokApp?.optionIds).toEqual(['o7']);

    // 복원 이후의 쓰기도 같은 비동기 스토리지로 흘러간다.
    useVoteGuestStore.getState().setName('이후이름');
    await vi.waitFor(() => {
      expect(data.get('vote-guest-v1')).toContain('이후이름');
    });
  });
});
