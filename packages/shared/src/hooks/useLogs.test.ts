import { describe, expect, it } from 'vitest';
import type { OperationReportType, OperationRunType } from '@repo/api-contract';
import {
  OPERATION_REPORT_STALL_MS,
  OPERATION_RUN_SLOW_AFTER_MS,
  operationRunPollInterval,
  operationRunsPollInterval,
} from './useLogs.js';

// 작업 로그 폴링 주기의 계약을 고정한다:
//  - 진행 중인 게 없으면 false(폴링 중단)
//  - 갓 시작한 run·갱신되고 있는 보고서는 빠르게(목록 5초 / 상세 3초)
//  - 오래 running 인 채로 남은 run·멈춘 보고서는 30초로 늦춘다
// 마감이 누락된 run 이나 응답 없는 분석은 서버 부팅 sweep 전까지 running/pending 으로
// 남는데, 예전엔 화면을 켜 둔 내내 빠른 주기 요청이 끝없이 나갔다.

const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;

const run = (over: Partial<OperationRunType> = {}): OperationRunType => ({
  id: 'r1',
  feature: 'crawl',
  jobId: null,
  subjectId: null,
  parentRunId: null,
  status: 'running',
  trigger: 'manual',
  errorCode: null,
  errorMessage: null,
  meta: null,
  startedAt: ago(MINUTE),
  finishedAt: null,
  logCount: 0,
  ...over,
});

const report = (over: Partial<OperationReportType> = {}): OperationReportType => ({
  id: 'rep1',
  runId: 'r1',
  status: 'running',
  provider: null,
  model: null,
  summary: null,
  rootCause: null,
  details: null,
  suggestions: null,
  severity: null,
  errorCode: null,
  errorMessage: null,
  promptTokens: null,
  completionTokens: null,
  durationMs: null,
  createdAt: ago(MINUTE),
  updatedAt: ago(MINUTE),
  ...over,
});

describe('operationRunsPollInterval (목록)', () => {
  it('응답 전이거나 running 행이 없으면 폴링하지 않는다', () => {
    expect(operationRunsPollInterval(undefined, NOW)).toBe(false);
    expect(operationRunsPollInterval({ items: [] }, NOW)).toBe(false);
    expect(
      operationRunsPollInterval(
        { items: [run({ status: 'done' }), run({ status: 'failed' }), run({ status: 'cancelled' })] },
        NOW,
      ),
    ).toBe(false);
  });

  it('갓 시작한 running 이 하나라도 보이면 5초', () => {
    expect(operationRunsPollInterval({ items: [run()] }, NOW)).toBe(5000);
    // 오래된 running 과 섞여 있어도 새 run 을 따라가야 하므로 빠른 주기.
    expect(
      operationRunsPollInterval(
        { items: [run({ startedAt: ago(OPERATION_RUN_SLOW_AFTER_MS + MINUTE) }), run()] },
        NOW,
      ),
    ).toBe(5000);
  });

  it('보이는 running 이 전부 오래됐으면 30초로 늦춘다', () => {
    expect(
      operationRunsPollInterval(
        { items: [run({ startedAt: ago(OPERATION_RUN_SLOW_AFTER_MS + MINUTE) }), run({ status: 'done' })] },
        NOW,
      ),
    ).toBe(30_000);
    // 경계 — 임계 직전까지는 빠르게.
    expect(
      operationRunsPollInterval({ items: [run({ startedAt: ago(OPERATION_RUN_SLOW_AFTER_MS - 1) })] }, NOW),
    ).toBe(5000);
  });
});

describe('operationRunPollInterval (상세)', () => {
  it('run 도 보고서도 끝났으면 폴링하지 않는다', () => {
    expect(operationRunPollInterval(undefined, NOW)).toBe(false);
    expect(operationRunPollInterval({ run: run({ status: 'done' }), report: null }, NOW)).toBe(false);
    expect(
      operationRunPollInterval({ run: run({ status: 'failed' }), report: report({ status: 'done' }) }, NOW),
    ).toBe(false);
    expect(
      operationRunPollInterval({ run: run({ status: 'failed' }), report: report({ status: 'failed' }) }, NOW),
    ).toBe(false);
  });

  it('진행 중인 run 은 3초, 오래 running 이면 30초', () => {
    expect(operationRunPollInterval({ run: run(), report: null }, NOW)).toBe(3000);
    expect(
      operationRunPollInterval(
        { run: run({ startedAt: ago(OPERATION_RUN_SLOW_AFTER_MS + MINUTE) }), report: null },
        NOW,
      ),
    ).toBe(30_000);
  });

  it("'다시 분석' 직후의 보고서는 3초로 따라가고, 임계 넘게 갱신이 없으면 30초", () => {
    const failed = run({ status: 'failed', startedAt: ago(24 * 60 * MINUTE) });
    expect(operationRunPollInterval({ run: failed, report: report({ status: 'pending' }) }, NOW)).toBe(3000);
    expect(operationRunPollInterval({ run: failed, report: report({ status: 'running' }) }, NOW)).toBe(3000);
    expect(
      operationRunPollInterval(
        { run: failed, report: report({ updatedAt: ago(OPERATION_REPORT_STALL_MS + MINUTE) }) },
        NOW,
      ),
    ).toBe(30_000);
  });

  it('오래된 run 이라도 보고서가 방금 갱신됐으면 빠르게 본다', () => {
    expect(
      operationRunPollInterval(
        { run: run({ startedAt: ago(OPERATION_RUN_SLOW_AFTER_MS + MINUTE) }), report: report() },
        NOW,
      ),
    ).toBe(3000);
  });

  it('시각을 읽을 수 없으면 느린 쪽으로 둔다', () => {
    expect(operationRunPollInterval({ run: run({ startedAt: 'not-a-date' }), report: null }, NOW)).toBe(30_000);
  });
});
