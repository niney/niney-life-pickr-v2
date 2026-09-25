import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SajuBirthInputType } from '@repo/api-contract';
import { startSajuProfileMirror } from './sajuProfileMirror.js';
import { useSajuProfileStore } from './sajuProfileStore.js';

// 게스트 사주 프로필 미러 — 앱 WebView 안에서만, 현재 상태 + 변경마다 브리지로 보낸다.
// node 환경이라 window 를 globalThis 로 흉내 낸다(embedBridge.test 와 같은 방식). 스토어의 주입 스토리지는
// 미주입 + localStorage 없음 → NO_OP 이라 동기 복원이 즉시 끝난다.

const g = globalThis as { window?: unknown };
beforeAll(() => {
  g.window = globalThis;
});
afterAll(() => {
  delete g.window;
});
afterEach(() => {
  delete window.ReactNativeWebView;
  useSajuProfileStore.setState({ profiles: [], primaryId: null });
});

const birth: SajuBirthInputType = {
  calendar: 'solar',
  year: 1990,
  month: 5,
  day: 15,
  leapMonth: false,
  hour: 14,
  minute: 30,
  gender: 'M',
  options: { solarTimeCorrection: true, lateRatHour: false },
};

describe('sajuProfileMirror', () => {
  it('앱 밖(브리지 없음)에서는 아무것도 보내지 않고 구독도 하지 않는다', () => {
    const stop = startSajuProfileMirror();
    const sent: string[] = [];
    window.ReactNativeWebView = { postMessage: (s) => sent.push(s) };
    useSajuProfileStore.getState().upsert({ label: '나', birth });
    stop();
    expect(sent).toHaveLength(0);
  });

  it('브리지가 있으면 복원된 현재 상태를 보내고, 프로필·primary 변경마다 다시 보낸다', () => {
    const sent: string[] = [];
    window.ReactNativeWebView = { postMessage: (s) => sent.push(s) };
    const stop = startSajuProfileMirror();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!)).toEqual({ type: 'saju-profiles', profiles: [], primaryId: null });

    const me = useSajuProfileStore.getState().upsert({ label: '나', birth });
    expect(sent).toHaveLength(2);
    const second = JSON.parse(sent[1]!) as { profiles: { id: string; label: string }[]; primaryId: string | null };
    expect(second.profiles.map((p) => p.label)).toEqual(['나']);
    expect(second.primaryId).toBe(me.id);

    const friend = useSajuProfileStore.getState().upsert({ label: '친구', birth: { ...birth, year: 1992 } });
    useSajuProfileStore.getState().setPrimary(friend.id);
    expect(sent).toHaveLength(4);
    expect((JSON.parse(sent[3]!) as { primaryId: string | null }).primaryId).toBe(friend.id);

    stop();
    useSajuProfileStore.getState().remove(friend.id);
    expect(sent).toHaveLength(4);
  });
});
