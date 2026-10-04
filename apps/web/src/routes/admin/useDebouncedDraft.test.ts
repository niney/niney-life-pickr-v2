import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedDraft } from './useDebouncedDraft';

// 입력 초안/적용값 분리 훅 — 다이닝코드 검색의 좌표·반경·크기 입력과 자동 발굴의 cron 입력이
// 쓴다. 지키는 계약:
//  ① 'debounce' 는 초안만 즉시 바꾸고, 적용값은 입력이 멈춘 뒤 한 번만 따라간다(중간값은 안 나감)
//  ② 'now' 는 즉시 적용하고 대기 중이던 디바운스를 취소한다
//  ③ flush 는 대기 중인 값을 바로 적용한다(없으면 no-op)
//  ④ 언마운트하면 대기 중 타이머를 정리한다

describe('useDebouncedDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('타이핑은 초안만 바로 바꾸고, 적용값은 입력이 멈춘 뒤 마지막 값으로 한 번만 바뀐다', () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useDebouncedDraft('500', 400, onApply));

    // 반경 "1000" 을 한 글자씩 — 예전엔 1·10·100·1000 네 번 검색이 나갔다.
    act(() => result.current.update('1', 'debounce'));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => result.current.update('10', 'debounce'));
    act(() => result.current.update('100', 'debounce'));
    act(() => result.current.update('1000', 'debounce'));
    expect(result.current.draft).toBe('1000');
    expect(result.current.applied).toBe('500');
    expect(onApply).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(result.current.applied).toBe('500');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.applied).toBe('1000');
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith('1000');
  });

  it("'now' 는 즉시 적용하고, 대기 중이던 디바운스는 취소한다", () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useDebouncedDraft({ lat: '37.5', radius: '500' }, 400, onApply));

    act(() => result.current.update({ lat: '37.5', radius: '800' }, 'debounce'));
    // 지도 드래그 — 입력 중이던 반경까지 담아 바로 적용.
    act(() => result.current.update({ lat: '37.6', radius: '800' }, 'now'));
    expect(result.current.applied).toEqual({ lat: '37.6', radius: '800' });
    expect(onApply).toHaveBeenCalledTimes(1);

    // 취소된 타이머가 뒤늦게 예전 값으로 덮어쓰지 않는다.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.applied).toEqual({ lat: '37.6', radius: '800' });
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('flush 는 대기 중인 값을 바로 적용하고, 대기가 없으면 아무것도 하지 않는다', () => {
    const onApply = vi.fn();
    const { result } = renderHook(() => useDebouncedDraft('a', 300, onApply));

    act(() => result.current.flush());
    expect(onApply).not.toHaveBeenCalled();

    act(() => result.current.update('ab', 'debounce'));
    act(() => result.current.flush());
    expect(result.current.applied).toBe('ab');
    expect(onApply).toHaveBeenCalledTimes(1);

    // 이미 적용했으므로 타이머가 다시 적용하지 않는다.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('언마운트하면 대기 중이던 적용이 실행되지 않는다', () => {
    const onApply = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedDraft('a', 300, onApply));

    act(() => result.current.update('ab', 'debounce'));
    unmount();
    vi.advanceTimersByTime(1000);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('update·flush 는 렌더가 바뀌어도 같은 참조다', () => {
    const { result, rerender } = renderHook(() => useDebouncedDraft('a', 300));
    const { update, flush } = result.current;
    act(() => result.current.update('b', 'now'));
    rerender();
    expect(result.current.update).toBe(update);
    expect(result.current.flush).toBe(flush);
  });
});
