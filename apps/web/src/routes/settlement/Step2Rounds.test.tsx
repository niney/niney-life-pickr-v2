import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { useSettlementDraftStore } from '@repo/shared';
import { server } from '~/test/msw';
import { Step2Rounds } from './Step2Rounds';
import { draftRound } from './testFixtures';

// 차수 구성 + 영수증 업로드 단계. 여기서 고정하는 것:
//  - 영수증을 한 번 올린 뒤의 '다른 사진' 이 실제로 파일 선택을 연다(예전엔 파일 입력이
//    "입력 방식 미정" 블록 안에만 있어, 올린 뒤엔 누를 입력이 없었다).
//  - 서버 한도(5MB)를 넘는 사진은 올리기 전에 막는다.
//  - 닫혀 있는 식당 검색 모달은 공개 목록을 부르지 않는다.

const UPLOAD_URL = '/api/v1/settlement-extraction/upload';
const EXTRACT_URL = '/api/v1/settlement-extraction/extract';
const PUBLIC_LIST_URL = '/api/v1/restaurants/public';

const renderStep = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Step2Rounds onBack={() => {}} onNext={() => {}} />
    </QueryClientProvider>,
  );
};

const fileInput = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="file"]')!;

const photo = (bytes: number) =>
  new File([new Uint8Array(bytes)], 'receipt.jpg', { type: 'image/jpeg' });

const theRound = () => useSettlementDraftStore.getState().rounds[0]!;

describe('Step2Rounds', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useSettlementDraftStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("영수증을 올린 차수의 '다른 사진' 이 파일 선택을 열고, 새 사진으로 항목을 교체한다", async () => {
    useSettlementDraftStore.setState({
      participants: [],
      rounds: [
        draftRound({
          clientId: 'r1',
          source: 'RECEIPT',
          receiptImageToken: 'tok-old',
          receiptPreviewUrl: '/api/v1/settlement-extraction/preview/tok-old',
          items: [
            {
              clientId: 'i-old',
              name: '옛 항목',
              unitPrice: null,
              quantity: 1,
              amount: 1000,
              category: 'UNCATEGORIZED',
              matchedMenuName: null,
            },
          ],
        }),
      ],
    });
    server.use(
      http.post(UPLOAD_URL, () =>
        HttpResponse.json({
          imageToken: 'tok-new',
          previewUrl: '/api/v1/settlement-extraction/preview/tok-new',
          byteSize: 1234,
        }),
      ),
      http.post(EXTRACT_URL, () =>
        HttpResponse.json({
          items: [
            {
              name: '새 항목',
              unitPrice: 5000,
              quantity: 2,
              amount: 10_000,
              category: 'SIDE',
              matchedMenuName: null,
            },
          ],
          totalAmount: 10_000,
          itemsSubtotal: 10_000,
          warning: null,
          model: 'test',
        }),
      ),
    );
    const { container } = renderStep();

    // 입력 방식이 정해진 뒤에도 파일 입력은 그대로 있어야 버튼이 열 수 있다.
    const input = fileInput(container);
    expect(input).not.toBeNull();
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: '다른 사진' }));
    expect(click).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { files: [photo(1024)] } });

    await waitFor(() => expect(theRound().receiptImageToken).toBe('tok-new'));
    expect(theRound().items.map((it) => it.name)).toEqual(['새 항목']);
    expect(theRound().totalAmount).toBe(10_000);
  });

  it('5MB 를 넘는 사진은 올리지 않고 바로 안내한다', async () => {
    useSettlementDraftStore.setState({
      participants: [],
      rounds: [draftRound({ clientId: 'r1' })],
    });
    let uploads = 0;
    server.use(
      http.post(UPLOAD_URL, () => {
        uploads += 1;
        return HttpResponse.json({ imageToken: 't', previewUrl: '/p/t', byteSize: 1 });
      }),
    );
    const { container } = renderStep();

    fireEvent.change(fileInput(container), {
      target: { files: [photo(5 * 1024 * 1024 + 1)] },
    });

    expect(await screen.findByText(/사진이 너무 큽니다/)).toBeInTheDocument();
    expect(uploads).toBe(0);
    expect(theRound().source).toBeNull();
  });

  it('분할 영수증 — 올리기 전 단계의 실패(용량 초과·업로드 실패)도 모달 안에서 안내한다', async () => {
    useSettlementDraftStore.setState({
      participants: [],
      rounds: [
        draftRound({ clientId: 'r1' }),
        draftRound({ clientId: 'r2', placeId: '9900000002', placeName: '김밥나라' }),
      ],
    });
    let uploads = 0;
    server.use(
      http.post(UPLOAD_URL, () => {
        uploads += 1;
        return HttpResponse.json(
          { statusCode: 400, error: 'Bad Request', message: '이미지를 읽을 수 없습니다.' },
          { status: 400 },
        );
      }),
    );
    renderStep();

    fireEvent.click(screen.getByRole('button', { name: '분할 영수증 업로드' }));
    const dialog = screen.getByRole('dialog');
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;

    // 한도 초과 — 요청 없이 바로.
    fireEvent.change(input, { target: { files: [photo(5 * 1024 * 1024 + 1)] } });
    expect(await within(dialog).findByText(/사진이 너무 큽니다/)).toBeInTheDocument();
    expect(uploads).toBe(0);

    // 서버가 거절한 업로드 — 예전엔 이 단계에 에러 문구 자리가 없어 아무 표시가 없었다.
    fireEvent.change(input, { target: { files: [photo(1024)] } });
    expect(await within(dialog).findByText('이미지를 읽을 수 없습니다.')).toBeInTheDocument();
    expect(uploads).toBe(1);
  });

  it('닫혀 있는 식당 검색 모달은 공개 목록을 조회하지 않는다', async () => {
    useSettlementDraftStore.setState({
      participants: [],
      rounds: [draftRound({ clientId: 'r1' })],
    });
    let listCalls = 0;
    server.use(
      http.get(PUBLIC_LIST_URL, () => {
        listCalls += 1;
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );
    renderStep();

    expect(screen.getByRole('button', { name: '차수 추가' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(listCalls).toBe(0);
  });

  it('식당 검색 모달 — 검색어를 넣기 전엔 조회도 목록도 없고, 넣으면 그 검색어로만 조회한다', async () => {
    useSettlementDraftStore.setState({
      participants: [],
      rounds: [draftRound({ clientId: 'r1' })],
    });
    const queries: Array<string | null> = [];
    server.use(
      http.get(PUBLIC_LIST_URL, ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        queries.push(q);
        return HttpResponse.json({
          items: [{ placeId: '9900000002', name: '김밥나라', category: '분식', address: '서울' }],
          total: 1,
        });
      }),
    );
    renderStep();

    fireEvent.click(screen.getByRole('button', { name: '변경' }));
    expect(await screen.findByText('검색어를 입력해 주세요.')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(queries).toEqual([]);
    expect(screen.queryByText('김밥나라')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('식당명·주소 검색'), {
      target: { value: '김밥' },
    });

    expect(await screen.findByText('김밥나라')).toBeInTheDocument();
    expect(queries).toEqual(['김밥']);
  });
});
