import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  SajuReadingResult,
  type SajuPairChartType,
  type SajuPairResultType,
} from '@repo/api-contract';
import {
  readSajuProfiles,
  sajuApi,
  saveSajuProfile,
  setSajuProfileStorage,
  storeDeviceSaju,
  useAuthStore,
} from '@repo/shared';
import fixture from '~/test/fixtures/saju-reading.json';
import { SajuProfilesPage } from './SajuProfilesPage';
import { SajuPage } from './SajuPage';
import { SajuPairPage } from './SajuPairPage';
import { SajuHistoryPage } from './SajuHistoryPage';

vi.mock('~/components/saju/SajuVisual', () => ({ SajuVisual: () => null, SajuSymbol: () => null }));
const reading = SajuReadingResult.parse(fixture);
const pairChart: SajuPairChartType = {
  calculationVersion: 1,
  first: reading.chart,
  second: reading.chart,
  connection: 'same',
  title: '닮은 결, 서로 다른 이야기',
  description: '같은 오행의 상징이에요.',
  firstToSecond: '비견',
  secondToFirst: '비견',
  facts: [{ id: 'connection', label: '관계', description: '같은 오행' }],
  notices: [],
};
const pair: SajuPairResultType = {
  chart: pairChart,
  report: { ...reading.report, headline: '늦게 도착한 궁합 이야기' },
  source: 'ai',
  model: 'kimi-k3',
  promptVersion: 1,
  fallbackReason: null,
  remainingToday: 19,
  createdAt: reading.createdAt,
};
const mount = (node: React.ReactNode, url = '/') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[url]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
beforeEach(() => {
  localStorage.clear();
  const data = new Map<string, string>();
  setSajuProfileStorage({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  });
  useAuthStore.setState({ user: null, token: null, isGuest: false });
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  vi.spyOn(sajuApi, 'chart').mockResolvedValue(reading.chart);
});
afterEach(() => vi.restoreAllMocks());

describe('프로필에서 사주와 궁합까지', () => {
  it('별명과 출생정보를 기기에 저장하고 수정·삭제한다', async () => {
    const llm = vi.spyOn(sajuApi, 'reading');
    mount(<SajuProfilesPage />);
    const add = await screen.findByRole('button', { name: '새 프로필 담기' });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    fireEvent.change(screen.getByLabelText('별명'), { target: { value: '우리 별명' } });
    fireEvent.change(screen.getByLabelText('생년월일'), { target: { value: '1990-05-21' } });
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    await screen.findByRole('heading', { name: '우리 별명' });
    expect(await readSajuProfiles()).toHaveLength(1);
    expect(llm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '우리 별명 수정' }));
    fireEvent.change(screen.getByLabelText('별명'), { target: { value: '다듬은 별명' } });
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    await screen.findByRole('heading', { name: '다듬은 별명' });
    fireEvent.click(screen.getByRole('button', { name: '다듬은 별명 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제할게요' }));
    await waitFor(async () => expect(await readSajuProfiles()).toEqual([]));
  });
  it('프로필의 오늘 바로가기는 출생정보를 재입력하지 않고 오늘 풀이를 요청한다', async () => {
    const profile = await saveSajuProfile({ name: '나', birth: reading.birth });
    const request = vi.spyOn(sajuApi, 'reading').mockResolvedValue({ ...reading, kind: 'daily' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['saju', 'profiles', 'guest'], [profile]);
    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[`/saju?profile=${profile.id}&kind=daily`]}>
            <SajuPage />
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]?.[0]).toEqual({ birth: reading.birth, kind: 'daily', note: '' });
  });
  it('보관한 결과의 출생정보로 프로필을 만든다', async () => {
    storeDeviceSaju('guest', reading);
    mount(<SajuHistoryPage />);
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`${reading.report.headline}\\s*나의 사주`) }),
    );
    fireEvent.click(screen.getByRole('button', { name: '출생 프로필로 저장' }));
    fireEvent.change(screen.getByLabelText('별명'), { target: { value: '보관함에서 가져온 나' } });
    fireEvent.click(screen.getByRole('button', { name: '프로필 보관' }));
    await waitFor(async () => expect(await readSajuProfiles()).toHaveLength(1));
    expect((await readSajuProfiles())[0]?.birth).toEqual(reading.birth);
  });
  it('두 프로필로 관계를 요청하고 입력을 바꾸면 이전 AI 응답을 버린다', async () => {
    const first = await saveSajuProfile({ name: '나', birth: reading.birth });
    const second = await saveSajuProfile({
      name: '친구',
      birth: { ...reading.birth, date: '1995-11-07' },
    });
    vi.spyOn(sajuApi, 'pairChart').mockResolvedValue(pairChart);
    let finish!: (value: SajuPairResultType) => void;
    const request = vi.spyOn(sajuApi, 'pairReading').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount(<SajuPairPage />);
    await screen.findAllByRole('option', { name: '나' });
    fireEvent.change(screen.getByLabelText('1번째 사람 선택'), { target: { value: first.id } });
    fireEvent.change(screen.getByLabelText('2번째 사람 선택'), { target: { value: second.id } });
    fireEvent.click(screen.getByRole('button', { name: '친구' }));
    fireEvent.click(screen.getByRole('button', { name: '우리의 오행 지도 펼치기' }));
    await screen.findByRole('heading', { name: pairChart.title });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      first: first.birth,
      second: second.birth,
      relationship: 'friend',
    });
    expect(JSON.stringify(request.mock.calls[0]?.[0])).not.toContain('"name"');
    fireEvent.click(screen.getByRole('button', { name: '두 사람 다시 선택' }));
    expect(request.mock.calls[0]?.[2]?.aborted).toBe(true);
    await act(async () => finish(pair));
    expect(screen.queryByText(pair.report.headline)).not.toBeInTheDocument();
  });
});
