import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { MenuBoardEvalBoardType, MenuBoardEvalReportType } from '@repo/api-contract';
import { useMenuBoardEvalReport } from '@repo/shared';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { cn } from '~/lib/utils';
import { percent, seconds } from './format';

// 정확도 — eval:menu-boards 가 검수 정답 사진(직접 보고 쓴 메뉴·가격)마다 읽기를 돌려 채점한 마지막 리포트.

const RUN_COMMAND = 'pnpm --filter friendly eval:menu-boards';

export const EvalTab = () => {
  const report = useMenuBoardEvalReport();
  if (report.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 리포트 불러오는 중…
      </p>
    );
  }
  if (report.isError) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-destructive">
        <AlertCircle className="size-4" />
        {report.error instanceof Error ? report.error.message : '실패'}
      </p>
    );
  }
  if (!report.data.report) {
    return (
      <Card>
        <CardContent className="space-y-2 py-6 text-sm">
          <p>아직 회귀 평가 리포트가 없습니다. 검수 정답 사진마다 읽기를 돌려 채점합니다(모델 호출 장수만큼).</p>
          <pre className="rounded-md bg-muted/40 p-3 text-xs">{RUN_COMMAND}</pre>
        </CardContent>
      </Card>
    );
  }
  return <Report report={report.data.report} />;
};

const issueCount = (b: MenuBoardEvalBoardType) =>
  b.missed.length + b.wrong.length + b.misread.length + b.priceMismatch.length + (b.error ? 1 : 0);

const Report = ({ report }: { report: MenuBoardEvalReportType }) => {
  const t = report.totals;
  const stats: { label: string; value: string; hint?: string }[] = [
    { label: 'F1', value: percent(t.f1) },
    { label: '정밀도', value: percent(t.precision), hint: '뽑은 항목 중 정답' },
    { label: '재현율', value: percent(t.recall), hint: '정답 메뉴 중 찾은 것' },
    { label: '이름 정확', value: percent(t.exactName), hint: '찾은 메뉴 중 핵심 이름을 그대로 읽은 비율' },
    { label: '가격 일치', value: percent(t.priceAccuracy) },
    { label: '맞힘', value: `${t.matched} / ${t.required}` },
    { label: '지어냄', value: String(t.wrong), hint: '정답에 없는 항목' },
    { label: '표지 오인', value: String(t.coverFalseItems), hint: '메뉴 없는 사진에서 뽑은 항목' },
    { label: '장당 중앙', value: seconds(t.medianMs) },
  ];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">검수 정답 {t.boards}장</CardTitle>
          <CardDescription>
            {report.model} · {new Date(report.createdAt).toLocaleString('ko-KR')}
            {t.failed > 0 && ` · 실패 ${t.failed}장(지표에서 뺌)`} · 다시 재기 <code>{RUN_COMMAND}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
            {stats.map((s) => (
              <div key={s.label} className="rounded-md border p-2" title={s.hint}>
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">사진별</CardTitle>
          <CardDescription>틀린 곳이 있는 사진을 펼치면 놓침·지어냄·이름 다름·가격 다름이 보입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>가게</TableHead>
                <TableHead className="text-right">정답</TableHead>
                <TableHead className="text-right">맞힘</TableHead>
                <TableHead className="text-right">틀린 곳</TableHead>
                <TableHead className="text-right">시간</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.boards.map((b) => (
                <BoardRow key={b.key} board={b} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const BoardRow = ({ board }: { board: MenuBoardEvalBoardType }) => {
  const issues = issueCount(board);
  return (
    <TableRow className={cn(issues > 0 && 'bg-muted/40')}>
      <TableCell>
        <div className="font-medium">{board.shop}</div>
        <div className="text-xs text-muted-foreground">{board.key}</div>
        {issues > 0 && (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer text-muted-foreground">틀린 곳 {issues}</summary>
            <ul className="mt-1 space-y-0.5">
              {board.error && <li className="text-destructive">실패: {board.error}</li>}
              {board.missed.map((n) => (
                <li key={`m-${n}`}>
                  <Badge variant="amber">놓침</Badge> {n}
                </li>
              ))}
              {board.wrong.map((n) => (
                <li key={`w-${n}`}>
                  <Badge variant="red">지어냄</Badge> {n}
                </li>
              ))}
              {board.misread.map((m) => (
                <li key={`r-${m.expected}`}>
                  <Badge variant="violet">이름</Badge> {m.expected} → {m.got}
                </li>
              ))}
              {board.priceMismatch.map((p) => (
                <li key={`p-${p.name}`}>
                  <Badge variant="secondary">가격</Badge> {p.name} {p.expected ?? '–'} → {p.got ?? '–'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{board.required}</TableCell>
      <TableCell className="text-right tabular-nums">{board.matched}</TableCell>
      <TableCell className="text-right">
        {issues === 0 ? (
          <CheckCircle2 className="ml-auto size-4 text-emerald-600 dark:text-emerald-400" aria-label="틀린 곳 없음" />
        ) : (
          <span className="tabular-nums">{issues}</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">{seconds(board.durationMs)}</TableCell>
    </TableRow>
  );
};
