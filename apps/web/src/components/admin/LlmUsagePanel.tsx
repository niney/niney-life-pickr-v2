import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ChevronDown, ChevronUp, ExternalLink, Move } from 'lucide-react';
import type { LlmTelemetrySnapshotType } from '@repo/api-contract';
import { useLlmTelemetry } from '@repo/shared';
import { cn } from '~/lib/utils';

// 어드민 전 페이지에 상시 떠 있는 LLM 사용량 플로팅 패널.
// 접힘/코너 위치는 localStorage 로 영속 — 페이지 이동/새로고침에도 유지.
const COLLAPSED_KEY = 'lp:llmUsagePanel:collapsed';
const CORNER_KEY = 'lp:llmUsagePanel:corner';

type Corner = 'br' | 'bl' | 'tl' | 'tr';
const CORNER_ORDER: Corner[] = ['br', 'bl', 'tl', 'tr'];
const CORNER_CLASS: Record<Corner, string> = {
  br: 'bottom-4 right-4',
  bl: 'bottom-4 left-4',
  tl: 'top-16 left-4',
  tr: 'top-16 right-4',
};

const readStored = <T extends string>(key: string, fallback: T): T => {
  try {
    return (window.localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
};

const store = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

// 12_345 → "12.3k" — 토큰 누적치가 빠르게 커지므로 컴팩트 표기.
const fmt = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

const sumGates = (snap: LlmTelemetrySnapshotType | null) => {
  const gates = snap?.gates.account ?? [];
  return {
    inflight: gates.reduce((a, g) => a + g.inflight, 0),
    limit: gates.reduce((a, g) => a + g.limit, 0),
    queued: gates.reduce((a, g) => a + g.queued, 0),
  };
};

export const LlmUsagePanel = () => {
  const [collapsed, setCollapsed] = useState<boolean>(() => readStored(COLLAPSED_KEY, '1') === '1');
  const [corner, setCorner] = useState<Corner>(() => readStored<Corner>(CORNER_KEY, 'br'));
  const { data, connected } = useLlmTelemetry(true);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      store(COLLAPSED_KEY, prev ? '0' : '1');
      return !prev;
    });
  };

  const cycleCorner = () => {
    setCorner((prev) => {
      const next = CORNER_ORDER[(CORNER_ORDER.indexOf(prev) + 1) % CORNER_ORDER.length]!;
      store(CORNER_KEY, next);
      return next;
    });
  };

  const acct = sumGates(data);
  const busy = acct.inflight > 0 || acct.queued > 0;
  const m1 = data?.windows.m1;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        className={cn(
          'fixed z-50 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur transition-colors hover:bg-accent',
          CORNER_CLASS[corner],
        )}
        title="AI 사용량 패널 펼치기"
      >
        <span className="relative flex size-2">
          {busy && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={cn(
              'relative inline-flex size-2 rounded-full',
              connected ? (busy ? 'bg-emerald-500' : 'bg-muted-foreground/40') : 'bg-red-500',
            )}
          />
        </span>
        <Activity className="size-3.5" />
        <span className="tabular-nums">
          {acct.inflight}/{acct.limit || '–'}
          {acct.queued > 0 && <span className="text-amber-600"> +{acct.queued}큐</span>}
        </span>
        {m1 && m1.requests > 0 && (
          <span className="text-muted-foreground tabular-nums">
            {fmt(m1.promptTokens + m1.completionTokens)}tok/1m
          </span>
        )}
        <ChevronUp className="size-3.5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div
      className={cn(
        'fixed z-50 w-80 rounded-lg border bg-background/95 text-xs shadow-xl backdrop-blur',
        CORNER_CLASS[corner],
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span
          className={cn(
            'inline-flex size-2 rounded-full',
            connected ? (busy ? 'bg-emerald-500' : 'bg-muted-foreground/40') : 'bg-red-500',
          )}
          title={connected ? '실시간 연결됨' : '연결 끊김 — 재연결 중'}
        />
        <Activity className="size-4" />
        <span className="font-semibold">AI 사용량</span>
        <span className="ml-auto flex items-center gap-1">
          <Link
            to="/admin/ai-usage"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="상세 페이지"
          >
            <ExternalLink className="size-3.5" />
          </Link>
          <button
            type="button"
            onClick={cycleCorner}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="코너 이동"
          >
            <Move className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="접기"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </span>
      </div>

      {!data ? (
        <p className="px-3 py-4 text-center text-muted-foreground">불러오는 중…</p>
      ) : (
        <div className="space-y-2.5 px-3 py-2.5">
          {/* 계정 게이트 — 동시성 사용률이 패널의 핵심 게이지 */}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-medium">동시 요청 (계정)</span>
              <span className="tabular-nums text-muted-foreground">
                {acct.inflight}/{acct.limit || '–'}
                {acct.queued > 0 && <span className="text-amber-600"> · 대기 {acct.queued}</span>}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  acct.queued > 0 ? 'bg-amber-500' : 'bg-emerald-500',
                )}
                style={{
                  width: `${acct.limit > 0 ? Math.min(100, (acct.inflight / acct.limit) * 100) : 0}%`,
                }}
              />
            </div>
            {data.gates.account.some((g) => g.oldestWaitMs !== null) && (
              <p className="mt-1 text-amber-600">
                최장 대기{' '}
                {fmtMs(Math.max(...data.gates.account.map((g) => g.oldestWaitMs ?? 0)))}
              </p>
            )}
          </div>

          {/* purpose 별 진행/대기 */}
          {data.gates.purposes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.gates.purposes.map(({ purpose, gate }) => (
                <span
                  key={purpose}
                  className={cn(
                    'rounded-full border px-2 py-0.5 tabular-nums',
                    gate.inflight > 0 ? 'border-emerald-300 text-emerald-700' : 'text-muted-foreground',
                  )}
                >
                  {purpose} {gate.inflight}/{gate.limit}
                  {gate.queued > 0 && ` (+${gate.queued})`}
                </span>
              ))}
            </div>
          )}

          {/* 진행 중 호출 */}
          {data.active.length > 0 && (
            <ul className="space-y-0.5">
              {data.active.slice(0, 4).map((a) => (
                <li key={a.id} className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="inline-flex size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  <span className="truncate">
                    {a.purpose} · {a.model}
                  </span>
                  <span className="ml-auto tabular-nums">{fmtMs(a.runningMs)}</span>
                </li>
              ))}
              {data.active.length > 4 && (
                <li className="text-muted-foreground">… 외 {data.active.length - 4}건</li>
              )}
            </ul>
          )}

          {/* 윈도우 집계 */}
          <div className="grid grid-cols-3 gap-1.5 text-center">
            {(
              [
                ['1분', data.windows.m1],
                ['5분', data.windows.m5],
                ['1시간', data.windows.h1],
              ] as const
            ).map(([label, w]) => (
              <div key={label} className="rounded-md border px-1.5 py-1">
                <div className="text-[10px] text-muted-foreground">{label}</div>
                <div className="font-medium tabular-nums">{w.requests}건</div>
                <div className="tabular-nums text-muted-foreground">
                  {fmt(w.promptTokens + w.completionTokens)}tok
                </div>
              </div>
            ))}
          </div>

          {/* 누적 (부팅 이후) */}
          <div className="flex items-baseline justify-between text-muted-foreground">
            <span>
              누적 {data.totals.requests}건 ·{' '}
              <span className="tabular-nums">
                입력 {fmt(data.totals.promptTokens)} / 출력 {fmt(data.totals.completionTokens)}
              </span>
            </span>
            {data.totals.errors > 0 && (
              <span className="text-red-600">에러 {data.totals.errors}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
