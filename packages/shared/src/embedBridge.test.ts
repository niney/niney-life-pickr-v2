import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildLpEmbedInjection,
  isLpEmbedded,
  parseLpEmbedMessage,
  postLpEmbedMessage,
  readLpEmbedInit,
} from './embedBridge.js';

// 앱 WebView 브리지 — 주입 스크립트 직렬화·메시지 파싱·환경 판정.
// shared 의 vitest 는 node 환경이라 window 를 globalThis 로 흉내 낸다(브리지는 window 전역만 쓴다).

const g = globalThis as { window?: unknown };
beforeAll(() => {
  g.window = globalThis;
});
afterAll(() => {
  delete g.window;
});

afterEach(() => {
  delete window.__LP_EMBED__;
  delete window.ReactNativeWebView;
});

describe('embedBridge', () => {
  it('주입 스크립트는 JSON 직렬화라 따옴표·태그가 코드로 새지 않는다', () => {
    const js = buildLpEmbedInjection({ token: 'a"b</script>', guestKey: 'g', theme: 'dark' });
    expect(js.startsWith('window.__LP_EMBED__ = {')).toBe(true);
    expect(js).toContain('\\"b</script>');
    expect(js.endsWith('; true;')).toBe(true);
    // 실행하면 같은 객체가 나온다.
    new Function(js)();
    expect(readLpEmbedInit()).toEqual({ token: 'a"b</script>', guestKey: 'g', theme: 'dark' });
    expect(isLpEmbedded()).toBe(true);
  });

  it('메시지 파싱 — 계약 밖은 null', () => {
    expect(parseLpEmbedMessage(JSON.stringify({ type: 'share', url: 'https://x/y', title: 't' }))).toEqual({
      type: 'share',
      url: 'https://x/y',
      title: 't',
    });
    expect(parseLpEmbedMessage(JSON.stringify({ type: 'open', url: 'https://x' }))).toEqual({ type: 'open', url: 'https://x' });
    expect(parseLpEmbedMessage(JSON.stringify({ type: 'title', title: '타로' }))).toEqual({ type: 'title', title: '타로' });
    expect(parseLpEmbedMessage(JSON.stringify({ type: 'share' }))).toBeNull();
    expect(parseLpEmbedMessage(JSON.stringify({ type: 'nope', url: 'x' }))).toBeNull();
    expect(parseLpEmbedMessage('not json')).toBeNull();
    expect(parseLpEmbedMessage('"str"')).toBeNull();
  });

  it('saju-profiles — 프로필은 계약 스키마로 검증·정규화하고, 하나라도 틀리면 전체를 버린다', () => {
    const birth = { calendar: 'solar', year: 1990, month: 5, day: 15, hour: 14, minute: 30, gender: 'M' };
    const ok = parseLpEmbedMessage(
      JSON.stringify({
        type: 'saju-profiles',
        profiles: [{ id: 'p1', label: ' 나 ', birth, createdAt: 1700000000000 }],
        primaryId: 'p1',
      }),
    );
    expect(ok).toEqual({
      type: 'saju-profiles',
      primaryId: 'p1',
      profiles: [
        {
          id: 'p1',
          label: '나',
          createdAt: 1700000000000,
          // 계약 기본값(leapMonth·options)이 채워진다.
          birth: { ...birth, leapMonth: false, options: { solarTimeCorrection: true, lateRatHour: false } },
        },
      ],
    });
    // primary 가 목록에 없으면 null.
    const noPrimary = parseLpEmbedMessage(
      JSON.stringify({ type: 'saju-profiles', profiles: [{ id: 'p1', label: '나', birth, createdAt: 1 }], primaryId: 'zzz' }),
    );
    expect(noPrimary && noPrimary.type === 'saju-profiles' ? noPrimary.primaryId : 'x').toBeNull();
    // 빈 목록도 유효(앱 사본을 비운다).
    expect(parseLpEmbedMessage(JSON.stringify({ type: 'saju-profiles', profiles: [], primaryId: null }))).toEqual({
      type: 'saju-profiles',
      profiles: [],
      primaryId: null,
    });
    // 생년월일 범위 밖·라벨 없음·목록 아님 → null.
    expect(
      parseLpEmbedMessage(
        JSON.stringify({ type: 'saju-profiles', profiles: [{ id: 'p1', label: '나', birth: { ...birth, year: 1800 }, createdAt: 1 }], primaryId: null }),
      ),
    ).toBeNull();
    expect(
      parseLpEmbedMessage(JSON.stringify({ type: 'saju-profiles', profiles: [{ id: 'p1', label: '  ', birth, createdAt: 1 }], primaryId: null })),
    ).toBeNull();
    expect(parseLpEmbedMessage(JSON.stringify({ type: 'saju-profiles', profiles: 'nope', primaryId: null }))).toBeNull();
  });

  it('앱 밖에서는 post 가 false, 브리지가 있으면 문자열로 전달', () => {
    expect(isLpEmbedded()).toBe(false);
    expect(postLpEmbedMessage({ type: 'open', url: 'https://x' })).toBe(false);
    const sent: string[] = [];
    window.ReactNativeWebView = { postMessage: (s) => sent.push(s) };
    expect(isLpEmbedded()).toBe(true);
    expect(postLpEmbedMessage({ type: 'share', url: 'https://x', title: '타로' })).toBe(true);
    expect(JSON.parse(sent[0]!)).toEqual({ type: 'share', url: 'https://x', title: '타로' });
  });
});
