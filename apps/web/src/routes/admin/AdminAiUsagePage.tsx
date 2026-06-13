import { Activity } from 'lucide-react';
import type { LlmTelemetryCallType } from '@repo/api-contract';
import { useLlmTelemetry } from '@repo/shared';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { cn } from '~/lib/utils';

const fmt = (n: number): string => n.toLocaleString('ko-KR');

const fmtMs = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

const STATUS_BADGE: Record<LlmTelemetryCallType['status'], { label: string; className: string }> = {
  ok: { label: '성공', className: 'bg-emerald-100 text-emerald-800' },
  error: { label: '에러', className: 'bg-red-100 text-red-800' },
  timeout: { label: '타임아웃', className: 'bg-orange-100 text-orange-800' },
  cancelled: { label: '취소', className: 'bg-muted text-muted-foreground' },
};

// LLM 사용량 상세 — 플로팅 패널과 같은 SSE 스냅샷(React Query 캐시 공유)을
// 더 큰 지면에 펼친다. 인메모리 집계라 서버 재시작 시 리셋(startedAt 표기).
export const AdminAiUsagePage = () => {
  const { data, connected, isLoading } = useLlmTelemetry(true);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Activity className="size-5" />
        </div>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            AI 사용량
            <span
              className={cn(
                'inline-flex size-2.5 rounded-full',
                connected ? 'bg-emerald-500' : 'bg-red-500',
              )}
              title={connected ? '실시간 연결됨' : '연결 끊김 — 재연결 중'}
            />
          </h1>
          <p className="text-sm text-muted-foreground">
            friendly 의 모든 LLM 호출을 실시간으로 집계합니다 (인메모리 — 서버 재시작 시 리셋
            {data ? `, 집계 시작 ${new Date(data.startedAt).toLocaleString('ko-KR')}` : ''}).
          </p>
        </div>
      </header>

      {isLoading && !data && (
        <p className="py-16 text-center text-sm text-muted-foreground">불러오는 중…</p>
      )}

      {data && (
        <div className="space-y-6">
          {/* 상단 요약 카드 */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>누적 요청</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{fmt(data.totals.requests)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                성공 {fmt(data.totals.ok)} · 에러 {fmt(data.totals.errors)} · 취소{' '}
                {fmt(data.totals.cancelled)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>누적 토큰 (입력/출력)</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {fmt(data.totals.promptTokens + data.totals.completionTokens)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                입력 {fmt(data.totals.promptTokens)} · 출력 {fmt(data.totals.completionTokens)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>지금 진행 중</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{data.active.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                계정 게이트{' '}
                {data.gates.account
                  .map((g) => `${g.inflight}/${g.limit}${g.queued > 0 ? ` (대기 ${g.queued})` : ''}`)
                  .join(', ') || '–'}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>429 재시도 누적</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{fmt(data.totals.retries)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                0이 아니면 Ollama Cloud 쪽 동시성 한도에 닿은 적이 있다는 뜻
              </CardContent>
            </Card>
          </div>

          {/* 롤링 윈도우 */}
          <Card>
            <CardHeader>
              <CardTitle>최근 사용량</CardTitle>
              <CardDescription>완료된 호출 기준 롤링 윈도우 집계입니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>윈도우</TableHead>
                    <TableHead className="text-right">요청</TableHead>
                    <TableHead className="text-right">에러</TableHead>
                    <TableHead className="text-right">입력 토큰</TableHead>
                    <TableHead className="text-right">출력 토큰</TableHead>
                    <TableHead className="text-right">평균 소요</TableHead>
                    <TableHead className="text-right">최대 소요</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(
                    [
                      ['1분', data.windows.m1],
                      ['5분', data.windows.m5],
                      ['1시간', data.windows.h1],
                    ] as const
                  ).map(([label, w]) => (
                    <TableRow key={label}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(w.requests)}</TableCell>
                      <TableCell
                        className={cn('text-right tabular-nums', w.errors > 0 && 'text-red-600')}
                      >
                        {fmt(w.errors)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(w.promptTokens)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(w.completionTokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {w.avgDurationMs !== null ? fmtMs(w.avgDurationMs) : '–'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {w.maxDurationMs !== null ? fmtMs(w.maxDurationMs) : '–'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 용도/모델 분해 */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>용도별</CardTitle>
                <CardDescription>
                  purpose 게이트 상태와 누적 사용량 — 실효 동시성은 min(purpose 한도, 계정 cap).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.byPurpose.length === 0 && data.gates.purposes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    아직 호출이 없습니다.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>용도</TableHead>
                        <TableHead className="text-right">동시/한도</TableHead>
                        <TableHead className="text-right">요청</TableHead>
                        <TableHead className="text-right">토큰</TableHead>
                        <TableHead className="text-right">에러</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.gates.purposes.map(({ purpose, gate }) => {
                        const agg = data.byPurpose.find((p) => p.purpose === purpose);
                        return (
                          <TableRow key={purpose}>
                            <TableCell className="font-medium">{purpose}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {gate.inflight}/{gate.limit}
                              {gate.queued > 0 && (
                                <span className="text-amber-600"> +{gate.queued}큐</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmt(agg?.requests ?? 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmt((agg?.promptTokens ?? 0) + (agg?.completionTokens ?? 0))}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right tabular-nums',
                                (agg?.errors ?? 0) > 0 && 'text-red-600',
                              )}
                            >
                              {fmt(agg?.errors ?? 0)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* 게이트 미등록(아직 어댑터가 안 뜬) purpose 의 누적치도 노출 */}
                      {data.byPurpose
                        .filter((p) => !data.gates.purposes.some((g) => g.purpose === p.purpose))
                        .map((p) => (
                          <TableRow key={p.purpose}>
                            <TableCell className="font-medium">{p.purpose}</TableCell>
                            <TableCell className="text-right text-muted-foreground">–</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmt(p.requests)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmt(p.promptTokens + p.completionTokens)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(p.errors)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>모델별</CardTitle>
                <CardDescription>모델 단위 누적 사용량입니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.byModel.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    아직 호출이 없습니다.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>모델</TableHead>
                        <TableHead className="text-right">요청</TableHead>
                        <TableHead className="text-right">입력 토큰</TableHead>
                        <TableHead className="text-right">출력 토큰</TableHead>
                        <TableHead className="text-right">에러</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...data.byModel]
                        .sort((a, b) => b.requests - a.requests)
                        .map((m) => (
                          <TableRow key={m.model}>
                            <TableCell className="font-medium">{m.model}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(m.requests)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmt(m.promptTokens)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmt(m.completionTokens)}
                            </TableCell>
                            <TableCell
                              className={cn('text-right tabular-nums', m.errors > 0 && 'text-red-600')}
                            >
                              {fmt(m.errors)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 최근 호출 */}
          <Card>
            <CardHeader>
              <CardTitle>최근 호출</CardTitle>
              <CardDescription>
                마지막 {data.recent.length}건 — 큐 대기와 모델 소요를 분리해 표시합니다 (느린 게
                큐인지 모델인지 구분).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.recent.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  아직 호출이 없습니다.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>시각</TableHead>
                      <TableHead>용도</TableHead>
                      <TableHead>모델</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead className="text-right">큐 대기</TableHead>
                      <TableHead className="text-right">소요</TableHead>
                      <TableHead className="text-right">토큰 (입력/출력)</TableHead>
                      <TableHead className="text-right">재시도</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent.map((c) => {
                      const badge = STATUS_BADGE[c.status];
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                            {new Date(c.at).toLocaleTimeString('ko-KR')}
                          </TableCell>
                          <TableCell>{c.purpose}</TableCell>
                          <TableCell className="max-w-40 truncate" title={c.model}>
                            {c.model}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={badge.className}>
                              {badge.label}
                            </Badge>
                            {c.errorName && c.status !== 'ok' && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {c.errorName}
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right tabular-nums',
                              c.queueWaitMs > 1000 && 'text-amber-600',
                            )}
                          >
                            {fmtMs(c.queueWaitMs)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtMs(c.durationMs)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.promptTokens !== null || c.completionTokens !== null
                              ? `${fmt(c.promptTokens ?? 0)} / ${fmt(c.completionTokens ?? 0)}`
                              : '–'}
                          </TableCell>
                          <TableCell
                            className={cn('text-right tabular-nums', c.retries > 0 && 'text-amber-600')}
                          >
                            {c.retries}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
