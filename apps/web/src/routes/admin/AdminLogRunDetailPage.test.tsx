import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import type {
  OperationLogEntryType,
  OperationLogsResultType,
  OperationReportType,
  OperationRunDetailType,
  OperationRunType,
} from '@repo/api-contract';
import { OPERATION_REPORT_STALL_MS } from '@repo/shared';
import { server } from '~/test/msw';
import { AdminLogRunDetailPage } from './AdminLogRunDetailPage';

// 로그 상세 — '다시 분석' 뒤에 무엇을 다시 받는지, 레벨 필터를 바꾸는 동안 목록이 어떻게
// 보이는지, 멈춘 분석을 화면이 제때 알아차리는지를 본다.

const RUN_URL = '/api/v1/admin/logs/runs/r1';
const LOGS_URL = '/api/v1/admin/logs/runs/r1/logs';
const ANALYZE_URL = '/api/v1/admin/logs/runs/r1/analyze';
const AT = '2026-10-01T00:00:00.000Z';

const run = (over: Partial<OperationRunType> = {}): OperationRunType => ({
  id: 'r1',
  feature: 'summary',
  jobId: null,
  subjectId: 'place-A',
  parentRunId: null,
  status: 'failed',
  trigger: 'manual',
  errorCode: 'llm_timeout',
  errorMessage: '요약 실패',
  meta: null,
  startedAt: AT,
  finishedAt: '2026-10-01T00:01:00.000Z',
  logCount: 2,
  ...over,
});

const report = (over: Partial<OperationReportType> = {}): OperationReportType => ({
  id: 'rep1',
  runId: 'r1',
  status: 'done',
  provider: 'ollama-cloud',
  model: 'gpt-oss:120b',
  summary: '타임아웃으로 실패',
  rootCause: null,
  details: null,
  suggestions: null,
  severity: 'low',
  errorCode: null,
  errorMessage: null,
  promptTokens: null,
  completionTokens: null,
  durationMs: null,
  createdAt: AT,
  updatedAt: AT,
  ...over,
});

const entry = (over: Partial<OperationLogEntryType> = {}): OperationLogEntryType => ({
  id: 'l1',
  runId: 'r1',
  feature: 'summary',
  jobId: null,
  subjectId: null,
  stage: 'summarize',
  level: 'info',
  message: '요약 시작',
  meta: null,
  createdAt: '2026-10-01T00:00:01.000Z',
  ...over,
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={['/admin/logs/r1']}>
        <Routes>
          <Route path="/admin/logs/:runId" element={<AdminLogRunDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('AdminLogRunDetailPage', () => {
  it("'다시 분석' 뒤 상세는 한 번만 다시 받고, 스텝 로그는 다시 받지 않는다", async () => {
    const calls = { detail: 0, logs: 0, analyze: 0 };
    server.use(
      http.get(RUN_URL, () => {
        calls.detail += 1;
        const body: OperationRunDetailType = { run: run(), report: report() };
        return HttpResponse.json(body);
      }),
      http.get(LOGS_URL, () => {
        calls.logs += 1;
        const body: OperationLogsResultType = { logs: [entry()], nextCursor: null };
        return HttpResponse.json(body);
      }),
      http.post(ANALYZE_URL, () => {
        calls.analyze += 1;
        return HttpResponse.json({ ok: true, report: report() });
      }),
    );
    renderPage();
    expect(await screen.findByText('요약 시작')).toBeInTheDocument();
    expect(calls).toEqual({ detail: 1, logs: 1, analyze: 0 });

    fireEvent.click(screen.getByRole('button', { name: /다시 분석/ }));
    await waitFor(() => expect(calls.detail).toBe(2));
    // 겹치는 키를 두 번 무효화하던 때는 상세가 취소·재요청돼 3번, 스텝 로그도 2번 나갔다.
    await delay(200);
    expect(calls).toEqual({ detail: 2, logs: 1, analyze: 1 });
  });

  it('레벨 필터를 바꾸는 동안 이전 목록을 흐리게 두고, 도착하면 바꾼다', async () => {
    let releaseErrors: () => void = () => {};
    const errorsHeld = new Promise<void>((resolve) => {
      releaseErrors = resolve;
    });
    server.use(
      http.get(RUN_URL, () => HttpResponse.json({ run: run(), report: report() })),
      http.get(LOGS_URL, async ({ request }) => {
        const level = new URL(request.url).searchParams.get('level');
        if (level === 'error') await errorsHeld;
        const body: OperationLogsResultType = {
          logs: [
            level === 'error'
              ? entry({ id: 'l9', level: 'error', message: '요약 타임아웃' })
              : entry(),
          ],
          nextCursor: null,
        };
        return HttpResponse.json(body);
      }),
    );
    renderPage();
    expect(await screen.findByText('요약 시작')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    await delay(50);
    // 받는 중 — 스피너로 접히지 않고 이전 목록이 흐리게 남는다.
    expect(screen.getByText('요약 시작').closest('ul')).toHaveClass('opacity-70');

    releaseErrors();
    expect(await screen.findByText('요약 타임아웃')).toBeInTheDocument();
    expect(screen.queryByText('요약 시작')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('요약 타임아웃').closest('ul')).not.toHaveClass('opacity-70'),
    );
  });

  it('분석이 멈춘 채 임계 시각을 넘기면 폴링 응답이 그대로여도 버튼을 다시 풀어 준다', async () => {
    // 임계(10분)까지 0.8초 남은 running 보고서 — 응답은 매번 똑같다(멈춘 분석).
    let stuck: OperationReportType | null = null;
    server.use(
      http.get(RUN_URL, () => {
        stuck ??= report({
          status: 'running',
          summary: null,
          updatedAt: new Date(Date.now() - (OPERATION_REPORT_STALL_MS - 800)).toISOString(),
        });
        return HttpResponse.json({ run: run(), report: stuck });
      }),
      http.get(LOGS_URL, () => HttpResponse.json({ logs: [entry()], nextCursor: null })),
    );
    renderPage();
    const button = await screen.findByRole('button', { name: /다시 분석/ });
    expect(button).toBeDisabled();
    expect(screen.getByText(/분석 진행 중/)).toBeInTheDocument();

    // 응답이 같으면 폴링만으로는 화면이 다시 그려지지 않는다 — 임계 시각의 타이머가 깨운다.
    expect(
      await screen.findByText(/이전 분석이 응답하지 않음/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(button).toBeEnabled();
  });
});
