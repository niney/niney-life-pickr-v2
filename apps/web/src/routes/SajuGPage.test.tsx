import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateSajuGReadingInput, SajuGReadingResult } from '@repo/api-contract';
import {
  readDeviceSajuG,
  sajuGApi,
  storeDeviceSajuG,
  useAuthStore,
  useSajuGReading,
} from '@repo/shared';
import { SajuGBirthForm } from '~/components/saju-g/SajuGBirthForm';
import fixture from '~/test/fixtures/saju-g-reading.json';
import { SajuGPage } from './SajuGPage';
import { SajuGSharedPage } from './SajuGSharedPage';
import { SajuGHistoryPage } from './SajuGHistoryPage';

vi.mock('~/components/saju-g/SajuGVisual', () => ({
  SajuGVisual: () => null,
  SajuGSymbol: () => null,
}));
const reading = SajuGReadingResult.parse(fixture);
const input = CreateSajuGReadingInput.parse({ birth: { date: '1990-05-21' } });
beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ user: null, token: null, isGuest: false });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

describe('사주 입력과 비동기 결과', () => {
  it('보관 결과가 다른 창에서 삭제되면 상세 캐시도 숨긴다', async () => {
    useAuthStore.setState({
      user: {
        id: 'saju-g-test-member',
        email: 'saju-g-test@example.invalid',
        role: 'USER',
        createdAt: reading.createdAt,
        updatedAt: reading.createdAt,
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } },
    });
    vi.spyOn(sajuGApi, 'listMine').mockResolvedValue({ items: [], nextCursor: null });
    const getMine = vi
      .spyOn(sajuGApi, 'getMine')
      .mockResolvedValue({ ...reading, readingId: 'saved-id' });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/me/saju-g/saved-id']}>
          <Routes>
            <Route path="/me/saju-g/:id" element={<SajuGHistoryPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: reading.report.headline });
    getMine.mockRejectedValue(new Error('삭제된 결과'));
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await screen.findByText('보관한 결과를 불러올 수 없어요. 로그인 상태와 연결을 확인해 주세요.');
    expect(
      screen.queryByRole('heading', { name: reading.report.headline }),
    ).not.toBeInTheDocument();
  });
  it('공유가 다른 창에서 취소되면 이전에 캐시한 지도도 숨긴다', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } },
    });
    const getShared = vi.spyOn(sajuGApi, 'getShared').mockResolvedValue({
      title: '공유 검증 지도',
      description: '공개 상징 설명',
      symbol: '태양',
      element: 'fire',
      elements: reading.chart.elements,
      unknownCharacters: reading.chart.unknownCharacters,
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SajuGSharedPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: '공유 검증 지도' });
    getShared.mockRejectedValue(new Error('공유 취소'));
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await screen.findByText('공유가 취소되었거나 존재하지 않는 지도예요.');
    expect(screen.queryByRole('heading', { name: '공유 검증 지도' })).not.toBeInTheDocument();
  });
  it('음력 2월 30일은 양력 날짜 위젯에 막히지 않고 윤달 선택을 함께 전달한다', () => {
    const submit = vi.fn();
    render(<SajuGBirthForm onSubmit={submit} />);
    fireEvent.click(screen.getByRole('button', { name: '음력' }));
    const date = screen.getByLabelText('생년월일') as HTMLInputElement;
    fireEvent.change(date, { target: { value: '1990-02-30' } });
    fireEvent.click(screen.getByLabelText('음력 윤달에 태어났어요'));
    expect(date.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '나의 사주(G) 펼치기' }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        birth: expect.objectContaining({
          date: '1990-02-30',
          calendar: 'lunar',
          leapMonth: true,
          timeAccuracy: 'unknown',
          time: null,
        }),
      }),
    );
  });
  it('명식을 먼저 공개하고 수정 후 도착한 이전 AI 응답은 버린다', async () => {
    let finish!: (result: typeof reading) => void;
    vi.spyOn(sajuGApi, 'chart').mockResolvedValue(reading.chart);
    const remote = vi.spyOn(sajuGApi, 'reading').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useSajuGReading());
    let work!: Promise<void>;
    act(() => {
      work = result.current.start(input);
    });
    await waitFor(() => expect(result.current.chart).toEqual(reading.chart));
    expect(result.current.pending).toBe(true);
    expect(result.current.result).toBeNull();
    act(() => result.current.reset());
    expect(remote.mock.calls[0]?.[2]?.aborted).toBe(true);
    await act(async () => {
      finish(reading);
      await work;
    });
    expect(result.current.result).toBeNull();
    expect(result.current.chart).toBeNull();
    expect(result.current.pending).toBe(false);
  });
  it('결과는 자동 저장하지 않고 보관 버튼을 눌렀을 때만 기기에 남긴다', async () => {
    vi.spyOn(sajuGApi, 'chart').mockResolvedValue(reading.chart);
    vi.spyOn(sajuGApi, 'reading').mockResolvedValue(reading);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SajuGPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('생년월일'), { target: { value: input.birth.date } });
    fireEvent.click(screen.getByRole('button', { name: '나의 사주(G) 펼치기' }));
    await screen.findByText(reading.report.headline);
    expect(readDeviceSajuG('guest')).toEqual([]);
    expect(screen.getByText('확인된 6글자 기준')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이 기기에 보관' }));
    expect(readDeviceSajuG('guest')).toHaveLength(1);
    expect(readDeviceSajuG('other-account')).toEqual([]);
    storeDeviceSajuG('guest', reading);
    expect(readDeviceSajuG('guest')).toHaveLength(1);
  });
});
