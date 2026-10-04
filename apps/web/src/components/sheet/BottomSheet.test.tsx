import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { BottomSheet, type Snap } from './BottomSheet';

// 바텀시트는 스냅에 따라 fixed(시트가 떠 있음) ↔ scroll(시트가 문서 흐름) 두 모드를 오간다.
// 모드가 바뀌어도 내용(children)은 다시 마운트되면 안 된다 — 예전엔 모드마다 트리 구조가 달라
// full 로 올리거나 내릴 때마다 목록 카드·상세가 통째로 재마운트되고 탭 로컬 상태가 날아갔다.

let mounts = 0;
let unmounts = 0;

const Content = () => {
  const [text, setText] = useState('');
  useEffect(() => {
    mounts += 1;
    return () => {
      unmounts += 1;
    };
  }, []);
  return (
    <input
      aria-label="메모"
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
};

const Harness = ({ snap }: { snap: Snap }) => (
  <BottomSheet snap={snap} topOffset={56}>
    <Content />
  </BottomSheet>
);

describe('BottomSheet', () => {
  beforeEach(() => {
    mounts = 0;
    unmounts = 0;
    vi.useFakeTimers();
    // jsdom 은 scrollTo 를 구현하지 않는다 — scroll 모드 진입 시 body 스크롤 복원 호출을 받아 준다.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('half → full → half 로 모드가 바뀌어도 내용을 다시 마운트하지 않는다', () => {
    const { rerender } = render(<Harness snap="half" />);
    const input = screen.getByLabelText('메모');
    expect(mounts).toBe(1);
    // fixed 모드 — 내용 칸이 자체 스크롤 컨테이너.
    expect(input.parentElement).toHaveClass('overflow-y-auto');

    rerender(<Harness snap="full" />);
    // full 로 올린 뒤 transition(220ms)이 끝나면 scroll 모드로 바뀐다.
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByLabelText('메모')).toBe(input);
    expect(input.parentElement).not.toHaveClass('overflow-y-auto');
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);

    rerender(<Harness snap="half" />);
    expect(screen.getByLabelText('메모')).toBe(input);
    expect(input.parentElement).toHaveClass('overflow-y-auto');
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
  });

  it('scroll 모드에서는 핸들 줄만 sticky 로 남고 시트는 문서 흐름에 놓인다', () => {
    const { container, rerender } = render(<Harness snap="half" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass('fixed');

    rerender(<Harness snap="full" />);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(root).toHaveClass('relative');
    expect(root).not.toHaveClass('fixed');
    const handle = container.querySelector('[data-sheet-handle="true"]') as HTMLElement;
    expect(handle.parentElement).toHaveClass('sticky');
    expect(handle.parentElement?.style.top).toBe('56px');
  });
});
