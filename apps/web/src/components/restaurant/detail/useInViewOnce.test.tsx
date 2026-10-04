import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useInViewOnce } from './useInViewOnce';

// "보일 때부터 조회" 게이트 — 화면에 들어오기 전엔 false, 한 번 들어오면 true 로 굳고 관찰을 끝낸다.
// IntersectionObserver 가 없는 환경(jsdom 기본)에선 처음부터 true(= 예전처럼 즉시 조회).

const Probe = () => {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="probe">
      {inView ? 'in' : 'out'}
    </div>
  );
};

type IoCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useInViewOnce', () => {
  it('IntersectionObserver 가 없으면 처음부터 true', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('in');
  });

  it('화면에 들어오기 전엔 false, 들어오면 true 로 굳고 관찰을 끊는다', () => {
    let notify: IoCallback = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IoCallback) {
          notify = cb;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );

    render(<Probe />);
    const probe = screen.getByTestId('probe');
    expect(probe).toHaveTextContent('out');
    expect(observe).toHaveBeenCalledWith(probe);

    act(() => notify([{ isIntersecting: false }]));
    expect(probe).toHaveTextContent('out');

    act(() => notify([{ isIntersecting: true }]));
    expect(probe).toHaveTextContent('in');
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
