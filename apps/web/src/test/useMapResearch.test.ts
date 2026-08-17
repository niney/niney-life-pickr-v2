import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMapResearch } from '@repo/shared';

// 지도 재검색 파이프라인(@repo/shared) — 웹 Bus/SubwayStationsMap 인라인 2곳과
// 앱 transit 훅을 단일 정의로 승격하며 처음 붙는 안전망. 지도 컴포넌트 자체는
// 테스트가 없으므로, 세 소비처가 공유하는 타이밍·판정 계약을 여기서 지킨다.
// (shared 는 node 환경이라 훅 렌더가 필요한 이 테스트는 소비처인 web 에 둔다.)

const BASE = { lat: 37.5, lng: 127.0 };
// 위도 +0.01° ≈ 1.1km — 임계(300m) 확실히 밖.
const FAR = { lat: 37.51, lng: 127.0 };
const OPTS = { thresholdM: 300, minZoom: 15 };

describe('useMapResearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('임계 밖 + 줌 충분 — 첫 이탈은 즉시, 간격 내 연속 이동은 마지막 좌표로 트레일링 1회', () => {
    const onAutoResearchAt = vi.fn();
    const { result } = renderHook(() =>
      useMapResearch({ ...OPTS, myLocation: BASE, onAutoResearchAt }),
    );

    act(() => result.current.handleUserViewEnd({ ...FAR, zoom: 16 }));
    expect(onAutoResearchAt).toHaveBeenCalledTimes(1);
    expect(onAutoResearchAt).toHaveBeenLastCalledWith(FAR);

    // 최소 간격(1.2s) 안의 두 이동 — 드롭하지 않고 마지막 좌표로 예약된다.
    const far2 = { lat: 37.52, lng: 127.0 };
    const far3 = { lat: 37.53, lng: 127.0 };
    act(() => {
      vi.advanceTimersByTime(300);
      result.current.handleUserViewEnd({ ...far2, zoom: 16 });
      vi.advanceTimersByTime(300);
      result.current.handleUserViewEnd({ ...far3, zoom: 16 });
    });
    expect(onAutoResearchAt).toHaveBeenCalledTimes(1);

    // 남은 간격이 지나면 마지막 좌표로 정확히 1회 — "패닝을 멈췄는데 조회가
    // 영영 안 나가는" 드롭 방식 회귀를 막는 핵심 계약.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onAutoResearchAt).toHaveBeenCalledTimes(2);
    expect(onAutoResearchAt).toHaveBeenLastCalledWith(far3);
  });

  it('줌이 minZoom 미만이면 자동 대신 수동 버튼으로 강등된다', () => {
    const onAutoResearchAt = vi.fn();
    const { result } = renderHook(() =>
      useMapResearch({ ...OPTS, myLocation: BASE, onAutoResearchAt }),
    );

    act(() => result.current.handleUserViewEnd({ ...FAR, zoom: 12 }));

    expect(onAutoResearchAt).not.toHaveBeenCalled();
    expect(result.current.showResearch).toBe(true);
    expect(result.current.researchCenter).toEqual(FAR);
  });

  it('임계 이내 이동은 자동도 수동도 발동하지 않는다', () => {
    const onAutoResearchAt = vi.fn();
    const { result } = renderHook(() =>
      useMapResearch({ ...OPTS, myLocation: BASE, onAutoResearchAt }),
    );

    // ≈110m — 임계(300m) 안.
    act(() => result.current.handleUserViewEnd({ lat: 37.501, lng: 127.0, zoom: 16 }));

    expect(onAutoResearchAt).not.toHaveBeenCalled();
    expect(result.current.showResearch).toBe(false);
  });

  it('자동 핸들러가 없으면 줌과 무관하게 수동 버튼만 판정한다', () => {
    const { result } = renderHook(() => useMapResearch({ ...OPTS, myLocation: BASE }));

    act(() => result.current.handleUserViewEnd({ ...FAR, zoom: 16 }));

    expect(result.current.showResearch).toBe(true);
  });

  it('기준점(myLocation)이 없으면 전부 비활성 — 주변 모드가 아닐 때', () => {
    const onAutoResearchAt = vi.fn();
    const { result } = renderHook(() =>
      useMapResearch({ ...OPTS, myLocation: null, onAutoResearchAt }),
    );

    act(() => result.current.handleUserViewEnd({ ...FAR, zoom: 16 }));

    expect(onAutoResearchAt).not.toHaveBeenCalled();
    expect(result.current.showResearch).toBe(false);
  });
});
