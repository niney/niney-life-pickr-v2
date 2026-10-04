import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playSajuChime, playSajuStamp, primeSajuSound, setSajuSoundEnabled } from './sajuSound';

// 효과음 컨텍스트의 수명 — 소리가 끝나면 재우고(suspend), 다음 제출·다음 소리에 다시 깨우는지. jsdom 에는 WebAudio 가
// 없어 가짜 컨텍스트를 끼운다(모듈이 컨텍스트를 하나만 만들어 들고 있으므로 인스턴스도 하나).

const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
const node = () => ({ type: '', buffer: null, frequency: param(), gain: param(), connect: (to: unknown) => to, start: vi.fn(), stop: vi.fn() });

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  sampleRate = 48_000;
  destination = {};
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  createOscillator = node;
  createGain = node;
  createBiquadFilter = node;
  createBufferSource = node;
  createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) });
  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sajuSound', () => {
  it('효과음이 꺼져 있으면 컨텍스트를 만들지 않는다', () => {
    primeSajuSound();
    playSajuStamp();
    playSajuChime();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('마지막 소리 뒤 조용해지면 재우고, 다음 제출에 다시 깨운다', () => {
    setSajuSoundEnabled(true); // 켜는 순간 확인용 종소리 — 컨텍스트가 여기서 만들어진다.
    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0]!;

    // 인장 소리가 이어지는 동안(간격 0.55초)은 깨어 있다.
    primeSajuSound();
    for (let i = 0; i < 8; i++) {
      playSajuStamp();
      vi.advanceTimersByTime(550);
    }
    expect(ctx.suspend).not.toHaveBeenCalled();

    // 마지막 소리에서 1.5초 — 재운다.
    vi.advanceTimersByTime(1_000);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe('suspended');

    // 다음 제출 — 깨운다. 소리 없이 끝나면(연출 건너뛰기) 조금 뒤 다시 재운다.
    primeSajuSound();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe('running');
    vi.advanceTimersByTime(11_000);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    expect(ctx.suspend).toHaveBeenCalledTimes(2);

    // 자는 중에 소리가 나도 깨워서 낸다.
    playSajuChime();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });
});
