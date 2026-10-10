import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import type {
  MenuBoardEvalReportType,
  MenuBoardReadResultType,
  MenuBoardSamplesResponseType,
} from '@repo/api-contract';
import { server } from '~/test/msw';
import { AdminMenuBoardPage } from './AdminMenuBoardPage';

// 메뉴판 읽기 — 사진 고르기·읽기 호출·결과 표, 회귀 평가 리포트 표시.

const SAMPLES_URL = '/api/v1/admin/menu-board/samples';
const READ_URL = '/api/v1/admin/menu-board/read';
const EVAL_URL = '/api/v1/admin/menu-board/eval';

const samples: MenuBoardSamplesResponseType = {
  samples: [
    { key: 'shopB__board-1', shopRef: 'shopB', shopName: '나중가게', file: 'board-1.jpg', hasTruth: false },
    { key: 'shopA__board-2', shopRef: 'shopA', shopName: '정답가게', file: 'board-2.png', hasTruth: true },
  ],
};

const readResult: MenuBoardReadResultType = {
  model: 'kimi-k3',
  items: [
    { name: '김치찌개', price: '9,000', description: '국내산 돼지고기' },
    { name: '공기밥', price: null, description: null },
  ],
  durationMs: 6600,
  promptTokens: 2400,
  completionTokens: 120,
  image: { width: 1500, height: 2000 },
  rawText: '{"items": []}',
};

const renderPage = (path = '/admin/menu-board') => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AdminMenuBoardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// jsdom 에는 object URL 이 없다.
URL.createObjectURL = vi.fn(() => 'blob:menu');
URL.revokeObjectURL = vi.fn();

describe('AdminMenuBoardPage', () => {
  it('올린 사진을 읽어 메뉴 목록을 보여 준다', async () => {
    let uploaded = '';
    server.use(
      http.get(SAMPLES_URL, () => HttpResponse.json(samples)),
      // jsdom 의 File 은 MSW(undici)의 formData() 가 다시 해석하지 못해 본문 원문으로 본다.
      http.post(READ_URL, async ({ request }) => {
        uploaded = `${request.headers.get('content-type')}
${await request.text()}`;
        return HttpResponse.json(readResult);
      }),
    );
    renderPage();
    // 검수 정답이 있는 샘플이 먼저.
    const select = await screen.findByRole('combobox', { name: '샘플 사진' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
    expect(within(select).getAllByRole('option')[1]).toHaveTextContent('[정답] 정답가게 · board-2.png');

    const readButton = screen.getByRole('button', { name: '메뉴 읽기' });
    expect(readButton).toBeDisabled();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['jpeg'], 'menu.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByRole('img', { name: 'menu.jpg' })).toBeInTheDocument();
    fireEvent.click(readButton);

    expect(await screen.findByText('김치찌개')).toBeInTheDocument();
    expect(screen.getByText('국내산 돼지고기')).toBeInTheDocument();
    expect(screen.getByText('9,000')).toBeInTheDocument();
    expect(screen.getByText('항목 2개')).toBeInTheDocument();
    expect(screen.getByText('6.6초')).toBeInTheDocument();
    expect(uploaded).toMatch(/^multipart\/form-data/);
    // jsdom 의 File 이 undici 로 넘어가며 파일 이름·내용은 사라진다(브라우저와 무관) — 필드 이름과 형식만 본다.
    expect(uploaded).toContain('name="file"');
    expect(uploaded).toContain('Content-Type: image/jpeg');
  });

  it('사진 칸에서 배율을 바꾸고 전체 화면으로 크게 본다', async () => {
    server.use(http.get(SAMPLES_URL, () => HttpResponse.json({ samples: [] })));
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['jpeg'], 'big.jpg', { type: 'image/jpeg' })] } });
    const img = await screen.findByRole('img', { name: 'big.jpg' });
    // jsdom 은 사진을 그리지 않아 원본 크기를 직접 준다.
    Object.defineProperty(img, 'naturalWidth', { value: 3000 });
    fireEvent.load(img);

    const zoom = screen.getByRole('radiogroup', { name: '배율' });
    expect(within(zoom).getByRole('radio', { name: '맞춤' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(zoom).getByRole('radio', { name: '200%' }));
    expect(img).toHaveStyle({ width: '6000px' });
    expect(screen.getByText(/끌어서 이동/)).toBeInTheDocument();
    fireEvent.click(within(zoom).getByRole('radio', { name: '맞춤' }));
    expect(img.style.width).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '전체 화면' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('big.jpg')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'big.jpg' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('사진이 아닌 파일·너무 큰 파일은 올리지 않는다', async () => {
    server.use(http.get(SAMPLES_URL, () => HttpResponse.json({ samples: [] })));
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/사진 파일\(JPEG·PNG·WebP\)만/)).toBeInTheDocument();
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/최대 20MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '메뉴 읽기' })).toBeDisabled();
  });

  it('읽기가 실패하면 서버 메시지를 보여 준다', async () => {
    server.use(
      http.get(SAMPLES_URL, () => HttpResponse.json({ samples: [] })),
      http.post(READ_URL, () =>
        HttpResponse.json({ statusCode: 400, error: 'Bad Request', message: '사진을 읽을 수 없습니다' }, { status: 400 }),
      ),
    );
    renderPage();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'm.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(await screen.findByRole('button', { name: '메뉴 읽기' }));
    expect(await screen.findByText(/사진을 읽을 수 없습니다/)).toBeInTheDocument();
  });

  it('정확도 탭 — 리포트가 없으면 실행 방법을 안내한다', async () => {
    server.use(http.get(EVAL_URL, () => HttpResponse.json({ report: null })));
    renderPage('/admin/menu-board?tab=eval');
    expect(await screen.findByText('pnpm --filter friendly eval:menu-boards')).toBeInTheDocument();
  });

  it('정확도 탭 — 합계와 틀린 곳이 있는 사진', async () => {
    const report: MenuBoardEvalReportType = {
      createdAt: '2026-10-10T08:00:00.000Z',
      model: 'kimi-k3',
      totals: {
        boards: 2,
        failed: 0,
        required: 4,
        matched: 3,
        wrong: 0,
        precision: 1,
        recall: 0.75,
        f1: 0.857,
        exactName: 1,
        priceAccuracy: 1,
        coverFalseItems: 0,
        medianMs: 7100,
      },
      boards: [
        {
          key: 'shopA__board-1',
          shop: '금돼지식당',
          note: null,
          required: 2,
          matched: 1,
          missed: ['라면사리'],
          wrong: [],
          misread: [],
          priceMismatch: [],
          durationMs: 8000,
          error: null,
          items: [],
        },
        {
          key: 'shopB__board-1',
          shop: '해정집',
          note: null,
          required: 2,
          matched: 2,
          missed: [],
          wrong: [],
          misread: [],
          priceMismatch: [],
          durationMs: 6000,
          error: null,
          items: [],
        },
      ],
    };
    server.use(http.get(EVAL_URL, () => HttpResponse.json({ report })));
    renderPage('/admin/menu-board?tab=eval');
    expect(await screen.findByText('85.7%')).toBeInTheDocument();
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    expect(screen.getByText('7.1초')).toBeInTheDocument();
    expect(screen.getByText('라면사리')).toBeInTheDocument();
    expect(screen.getByLabelText('틀린 곳 없음')).toBeInTheDocument();
  });
});
