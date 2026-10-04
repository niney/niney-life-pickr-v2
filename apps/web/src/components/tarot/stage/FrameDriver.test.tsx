import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FrameDriver, STAGE_IDLE_FPS, STAGE_SETTLE_S } from './FrameDriver';

// 무대 프레임 구동 — jsdom 에는 WebGL 이 없어 R3F 훅을 바꿔 끼우고, "언제 다음 프레임을 요청하는가" 만 본다.
// useFrame 콜백을 붙잡아 직접 한 프레임씩 돌린다(R3F 가 프레임마다 최신 콜백을 부르는 것과 같다).

const r3f = vi.hoisted(() => ({
  frame: null as null | ((state: { clock: { elapsedTime: number }; pointer: { x: number; y: number } }) => void),
  invalidate: vi.fn(),
}));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: typeof r3f.frame) => {
    r3f.frame = callback;
  },
  useThree: (selector: (state: { invalidate: () => void }) => unknown) => selector({ invalidate: r3f.invalidate }),
}));

const step = (elapsedTime: number, x = 0, y = 0) => r3f.frame?.({ clock: { elapsedTime }, pointer: { x, y } });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  r3f.invalidate.mockClear();
});

describe('FrameDriver', () => {
  it('연출 단계는 프레임마다 다음 프레임을 잇는다', () => {
    render(<FrameDriver active settleKey="picking" />);
    for (const t of [100, 100.016, 100.033, 130]) step(t);
    expect(r3f.invalidate).toHaveBeenCalledTimes(4);
  });

  it('연출이 없으면 단계·시선이 바뀐 직후와 포인터가 움직인 직후에만 매 프레임', () => {
    const { rerender } = render(<FrameDriver active={false} settleKey="setup" />);
    // 첫 프레임 — 키가 새로 잡혀 가라앉는 시간이 열린다.
    step(10);
    step(10 + STAGE_SETTLE_S - 0.1);
    expect(r3f.invalidate).toHaveBeenCalledTimes(2);
    // 가라앉은 뒤에는 잇지 않는다(느린 박자 타이머만 남는다).
    step(10 + STAGE_SETTLE_S + 0.1);
    step(15);
    expect(r3f.invalidate).toHaveBeenCalledTimes(2);

    // 포인터가 움직이면 다시 매 프레임 — 멈추면 가라앉는다.
    step(20, 0.3, 0);
    step(20.5, 0.3, 0);
    expect(r3f.invalidate).toHaveBeenCalledTimes(4);
    step(20 + STAGE_SETTLE_S + 0.1, 0.3, 0);
    expect(r3f.invalidate).toHaveBeenCalledTimes(4);

    // 단계가 바뀌어도 마찬가지.
    rerender(<FrameDriver active={false} settleKey="reading" />);
    step(30, 0.3, 0);
    expect(r3f.invalidate).toHaveBeenCalledTimes(5);
    step(30 + STAGE_SETTLE_S + 0.1, 0.3, 0);
    expect(r3f.invalidate).toHaveBeenCalledTimes(5);
  });

  it('느린 박자 — 타이머가 STAGE_IDLE_FPS 로 한 프레임씩 요청하고, 무대가 사라지면 멈춘다', () => {
    const { unmount } = render(<FrameDriver active={false} settleKey="reading" />);
    vi.advanceTimersByTime(1_000);
    expect(r3f.invalidate.mock.calls.length).toBeGreaterThanOrEqual(STAGE_IDLE_FPS - 1);
    expect(r3f.invalidate.mock.calls.length).toBeLessThanOrEqual(STAGE_IDLE_FPS + 1);
    unmount();
    r3f.invalidate.mockClear();
    vi.advanceTimersByTime(1_000);
    expect(r3f.invalidate).not.toHaveBeenCalled();
  });
});
