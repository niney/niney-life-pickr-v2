import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { UpdateUsageQuotaSettingInputType, UsageQuotaOverviewType } from '@repo/api-contract';
import { server } from '~/test/msw';
import { AdminQuotasPage } from './AdminQuotasPage';

// 설정 > 사용량 한도 — 설정·사용량 표시, 검증, 저장 호출.

const overview: UsageQuotaOverviewType = {
  date: '2026-09-02',
  items: [
    {
      setting: {
        feature: 'tarot-reading',
        enabled: true,
        guestPerDay: 5,
        ipPerDay: 60,
        ipPerMinute: 6,
        globalPerDay: 300,
        guestCutoffPct: 80,
        updatedAt: null,
      },
      usage: {
        date: '2026-09-02',
        global: 42,
        guestTotal: 30,
        ipTotal: 30,
        userTotal: 12,
        topGuests: [{ key: 'guest-a', count: 5 }],
        topIps: [{ key: '1.2.3.4', count: 9 }],
      },
    },
  ],
};

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminQuotasPage />
    </QueryClientProvider>,
  );
};

describe('AdminQuotasPage', () => {
  it('설정과 사용량을 보여 주고 저장하면 PUT 을 보낸다', async () => {
    let sent: UpdateUsageQuotaSettingInputType | null = null;
    server.use(
      http.get('/api/v1/admin/quotas', () => HttpResponse.json(overview)),
      http.put('/api/v1/admin/quotas/tarot-reading', async ({ request }) => {
        sent = (await request.json()) as UpdateUsageQuotaSettingInputType;
        return HttpResponse.json({ ...overview.items[0]!.setting, ...sent, updatedAt: new Date().toISOString() });
      }),
    );
    renderPage();
    expect(await screen.findByText('타로 해석')).toBeInTheDocument();
    expect(screen.getByText('42 / 300')).toBeInTheDocument();
    expect(screen.getByText('guest-a')).toBeInTheDocument();
    expect(screen.getByText(/게스트 컷 240회부터/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('게스트 기기 일일'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: /저장/ }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!).toMatchObject({ enabled: true, guestPerDay: 9, ipPerDay: 60, ipPerMinute: 6, globalPerDay: 300, guestCutoffPct: 80 });
    expect(await screen.findByText('저장됨')).toBeInTheDocument();
  });

  it('잘못된 값은 저장하지 않고 안내한다', async () => {
    server.use(http.get('/api/v1/admin/quotas', () => HttpResponse.json(overview)));
    renderPage();
    await screen.findByText('타로 해석');
    fireEvent.change(screen.getByLabelText('게스트 컷 %'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: /저장/ }));
    await waitFor(() => expect(document.body.textContent).toContain('게스트 컷 %은(는) 0~100의 정수여야 합니다.'));
  });
});
