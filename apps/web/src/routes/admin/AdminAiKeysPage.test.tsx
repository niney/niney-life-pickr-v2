import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { LlmProviderConfigType, UpdateLlmProviderInputType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { AdminAiKeysPage } from './AdminAiKeysPage';

// 설정 > AI 키 — 저장 뒤 무엇을 다시 받는지 본다. 모델 카탈로그는 서버가 캐시 없이 외부
// (Ollama Cloud /api/tags)를 부르는 요청이라, 용도별 모델만 바꿨을 때는 다시 받으면 안 되고
// 계정 키를 바꿨을 때만(카탈로그가 달라질 수 있다) 다시 받아야 한다. 예전엔 목록 키
// ['ai','providers'] 접두사 무효화에 카탈로그 키가 함께 걸려 저장할 때마다 재요청됐다.

const PROVIDERS_URL = '/api/v1/admin/ai/providers';
const MODELS_URL = '/api/v1/admin/ai/providers/ollama-cloud/chat/models';

const provider = (over: Partial<LlmProviderConfigType>): LlmProviderConfigType => ({
  provider: 'ollama-cloud',
  purpose: 'chat',
  hasApiKey: true,
  apiKeyMasked: 'sk-…abcd',
  keySource: 'own',
  baseUrl: null,
  defaultModel: 'gpt-oss:20b',
  defaultModelSource: 'own',
  enabled: true,
  maxConcurrent: 4,
  thinking: 'off',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const useHandlers = () => {
  const calls = { providers: 0, models: 0 };
  const puts: Array<{ purpose: string; input: UpdateLlmProviderInputType }> = [];
  // 서버 상태 — PUT 이 반영되고 목록 재조회가 그 값을 돌려준다(저장한 행은 key 가 바뀌어 다시 마운트된다).
  let state: LlmProviderConfigType[] = [
    provider({ purpose: 'chat' }),
    provider({ purpose: 'image', keySource: 'inherited', apiKeyMasked: null, defaultModel: 'old-vision' }),
  ];
  server.use(
    http.get(PROVIDERS_URL, () => {
      calls.providers += 1;
      return HttpResponse.json({ providers: state });
    }),
    http.get(MODELS_URL, () => {
      calls.models += 1;
      return HttpResponse.json({ models: ['gpt-oss:20b', 'old-vision', 'new-vision'] });
    }),
    http.put(`${PROVIDERS_URL}/ollama-cloud/:purpose`, async ({ request, params }) => {
      const input = (await request.json()) as UpdateLlmProviderInputType;
      const purpose = String(params.purpose);
      puts.push({ purpose, input });
      state = state.map((p) =>
        p.purpose === purpose
          ? {
              ...p,
              defaultModel: input.defaultModel === undefined ? p.defaultModel : input.defaultModel,
              updatedAt: `2026-10-02T00:00:0${puts.length}.000Z`,
            }
          : p,
      );
      return HttpResponse.json(state.find((p) => p.purpose === purpose));
    }),
  );
  return { calls, puts };
};

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
        })
      }
    >
      <AdminAiKeysPage />
    </QueryClientProvider>,
  );

describe('AdminAiKeysPage', () => {
  it('용도별 모델만 저장하면 카탈로그는 그대로 두고, 계정 키를 저장하면 다시 받는다', async () => {
    const { calls, puts } = useHandlers();
    renderPage();
    await waitFor(() => expect(calls.models).toBe(1));

    // ① 이미지 용도의 모델만 바꿔 저장.
    const imageForm = (await screen.findByText('이미지')).closest('form')!;
    fireEvent.change(within(imageForm).getByDisplayValue('old-vision'), {
      target: { value: 'new-vision' },
    });
    fireEvent.click(within(imageForm).getByRole('button', { name: /저장/ }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ purpose: 'image', input: { defaultModel: 'new-vision' } });
    // 목록은 다시 받아 저장값이 반영되지만, 카탈로그 요청은 늘지 않는다.
    await waitFor(() => expect(calls.providers).toBe(2));
    expect(await screen.findByDisplayValue('new-vision')).toBeInTheDocument();
    expect(calls.models).toBe(1);

    // ② 계정 키를 바꿔 저장 — 키가 달라지면 카탈로그도 달라질 수 있다.
    const accountForm = screen.getByPlaceholderText('sk-...').closest('form')!;
    fireEvent.change(within(accountForm).getByPlaceholderText('sk-...'), {
      target: { value: 'sk-new-key' },
    });
    fireEvent.click(within(accountForm).getByRole('button', { name: /저장/ }));

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toEqual({ purpose: 'chat', input: { apiKey: 'sk-new-key' } });
    await waitFor(() => expect(calls.models).toBe(2));
    await waitFor(() => expect(calls.providers).toBe(3));
  });
});
