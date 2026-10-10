import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '~/test/msw';
import type {
  OcrEvaluation,
  SmartlyHealth,
  TranslateInput,
  TranslateResponse,
  TranslationEvaluation,
} from '~/components/admin/smartly/smartlyApi';
import { AdminSmartlyTestPage } from './AdminSmartlyTestPage';

// 메뉴판 AI 테스트 — smartly(Python) 서버 연결 상태, 탭별 호출과 표시.

const health: SmartlyHealth = {
  device: 'cuda',
  deviceName: 'NVIDIA GeForce RTX 4090',
  ocr: { available: true, loaded: false },
  dictionary: { available: true, loaded: true, size: 117208 },
  translationModels: [
    { file: 'en_model.pt', langs: ['en'], available: true, loaded: true },
    { file: 'ja_model.pt', langs: ['ja'], available: true, loaded: false },
    { file: 'zh_model.pt', langs: ['zh-CN', 'zh-TW'], available: false, loaded: false },
  ],
  ocrSamples: true,
  translationSamples: { en: true, ja: true, 'zh-CN': true, 'zh-TW': true },
};

const ocrEvaluation: OcrEvaluation = {
  total: 129104,
  count: 2,
  seed: 1,
  meanCer: 0.1,
  exactRate: 0.5,
  seconds: 0.4,
  items: [
    { id: 7, gt: '황태해장국', text: '황태해장국', confidence: 0.99, cer: 0 },
    { id: 9, gt: '짬뽕탕', text: '짬봉탕', confidence: 0.4, cer: 0.333 },
  ],
};

const renderPage = (path = '/admin/smartly-test') => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AdminSmartlyTestPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const useHealth = () =>
  server.use(http.get('/smartly-api/health', () => HttpResponse.json(health)));

describe('AdminSmartlyTestPage', () => {
  it('서버가 꺼져 있으면 실행 방법을 안내한다', async () => {
    server.use(http.get('/smartly-api/health', () => new HttpResponse(null, { status: 502 })));
    renderPage();
    expect(await screen.findByText('smartly 서버에 연결할 수 없습니다')).toBeInTheDocument();
    expect(screen.getByText(/pnpm dev:smartly/)).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('모델 상태를 보여 주고 인식 탭에서 테스트셋 예시를 정답과 대조한다', async () => {
    useHealth();
    let requested: unknown = null;
    server.use(
      http.post('/smartly-api/evaluate/ocr', async ({ request }) => {
        requested = await request.json();
        return HttpResponse.json(ocrEvaluation);
      }),
    );
    renderPage();
    expect(await screen.findByText('사전 117,208개')).toBeInTheDocument();
    expect(screen.getByText(/장치 cuda · NVIDIA GeForce RTX 4090/)).toBeInTheDocument();
    expect(screen.getByText('번역 zh-CN·zh-TW').parentElement).toHaveTextContent('파일 없음');
    expect(screen.getByText(/빠진 파일이 있습니다/)).toBeInTheDocument();

    expect(await screen.findByText('짬봉탕')).toBeInTheDocument();
    expect(requested).toEqual({ count: 24, seed: 1 });
    expect(screen.getByText('정답 짬뽕탕')).toBeInTheDocument();
    expect(screen.getByText(/평균 CER 10\.0%/)).toBeInTheDocument();
    expect(screen.getByAltText('테스트 이미지 7')).toHaveAttribute(
      'src',
      '/smartly-api/ocr/samples/7/image',
    );
  });

  it('번역 탭은 예시를 누르면 나란히 비교 모드로 번역하고 출처를 표시한다', async () => {
    useHealth();
    let sent: TranslateInput | null = null;
    const response: TranslateResponse = {
      input: '김치찌개',
      dictionaryKo: '김치찌개',
      results: [
        {
          lang: 'en',
          text: 'Kimchi Stew',
          source: 'dictionary',
          dictionary: 'Kimchi Stew',
          candidates: [{ text: '<unk> stew', raw: '<unk> stew', score: -3.2 }],
        },
        {
          lang: 'ja',
          text: 'キムチチゲ',
          source: 'dictionary',
          dictionary: 'キムチチゲ',
          candidates: [{ text: 'キムチ', raw: 'キムチ キムチ', score: -5 }],
        },
      ],
    };
    server.use(
      http.post('/smartly-api/translate', async ({ request }) => {
        sent = (await request.json()) as TranslateInput;
        return HttpResponse.json(response);
      }),
    );
    renderPage('/admin/smartly-test?tab=translate');
    fireEvent.click(await screen.findByRole('button', { name: '김치찌개' }));

    // 최종 결과 + 비교용 사전 줄, 두 군데에 나온다.
    expect(await screen.findAllByText('Kimchi Stew')).toHaveLength(2);
    expect(sent).toEqual({
      text: '김치찌개',
      langs: ['en', 'ja', 'zh-CN', 'zh-TW'],
      mode: 'compare',
      beamSize: 5,
      nBest: 3,
      replaceUnk: false,
    });
    expect(screen.getAllByText('사전').length).toBeGreaterThan(0);
    expect(screen.getByText('<unk> stew')).toBeInTheDocument();
    // 일본어는 화면용으로 공백을 뗀 결과와 원출력을 같이 보여 준다.
    expect(screen.getByText(/원출력 キムチ キムチ/)).toBeInTheDocument();
  });

  it('사전 탭은 검색어로 찾아 언어별 표기를 표로 보여 준다', async () => {
    useHealth();
    server.use(
      http.get('/smartly-api/dictionary/search', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q');
        return HttpResponse.json({
          total: 120,
          items: [{ ko: `${q}정식`, translations: { en: 'Bibimbap Set', 'zh-CN': '拌饭套餐' } }],
        });
      }),
    );
    renderPage('/admin/smartly-test?tab=dictionary');
    fireEvent.change(await screen.findByLabelText('검색어'), { target: { value: '비빔밥' } });
    fireEvent.click(screen.getByRole('button', { name: /찾기/ }));

    const row = (await screen.findByText('비빔밥정식')).closest('tr')!;
    expect(within(row).getByText('Bibimbap Set')).toBeInTheDocument();
    expect(within(row).getAllByText('—')).toHaveLength(2);
    expect(screen.getByText(/120개 중 앞 1개/)).toBeInTheDocument();
  });

  it('정확도 탭은 번역 BLEU 를 사전·모델 몫으로 나누고 문서 수치와 나란히 보여 준다', async () => {
    useHealth();
    const evaluation: TranslationEvaluation = {
      total: 130405,
      lang: 'en',
      count: 3,
      seed: 1,
      meanBleu: 0.7,
      dictionaryRate: 2 / 3,
      dictionaryBleu: 0.9,
      modelBleu: 0.1,
      seconds: 2,
      items: [
        {
          ko: '김치찌개',
          reference: 'Kimchi Stew',
          text: 'Kimchi Stew',
          source: 'dictionary',
          bleu: 1,
        },
        {
          ko: '된장찌개',
          reference: 'Soybean Stew',
          text: 'Soybean Stew',
          source: 'dictionary',
          bleu: 0.8,
        },
        {
          ko: '새우바질파스타',
          reference: 'Shrimp Basil Pasta',
          text: '<unk> pasta',
          source: 'model',
          bleu: 0.1,
        },
      ],
    };
    server.use(http.post('/smartly-api/evaluate/translate', () => HttpResponse.json(evaluation)));
    renderPage('/admin/smartly-test?tab=evaluate');
    const measure = await screen.findAllByRole('button', { name: /측정/ });
    fireEvent.click(measure[1]!);

    expect(await screen.findByText('문서 0.724')).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    // 기본 필터는 '모델이 번역' — 사전에서 온 줄은 숨긴다.
    expect(screen.getByText('<unk> pasta')).toBeInTheDocument();
    expect(screen.queryByText('된장찌개')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '전체' }));
    await waitFor(() => expect(screen.getByText('된장찌개')).toBeInTheDocument());
  });
});
