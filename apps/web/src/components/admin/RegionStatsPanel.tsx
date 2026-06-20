import { useMemo, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, MapPin, Table as TableIcon } from 'lucide-react';
import { useRegionStats } from '@repo/shared';
import { cn } from '~/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';

type View = 'bar' | 'table';

// 막대/표 두 뷰의 토글. 지도(클러스터/choropleth) 뷰는 후속 단계에서 추가한다.
const TABS: Array<{ key: View; label: string; icon: typeof BarChart3 }> = [
  { key: 'bar', label: '막대', icon: BarChart3 },
  { key: 'table', label: '표', icon: TableIcon },
];

const pct = (count: number, total: number): number =>
  total === 0 ? 0 : Math.round((count / total) * 1000) / 10;

export const RegionStatsPanel = () => {
  const stats = useRegionStats();
  const [view, setView] = useState<View>('bar');
  // 막대 뷰 드릴다운 — null 이면 시/도 레벨, 값이 있으면 그 시/도의 시군구 레벨.
  const [drillSido, setDrillSido] = useState<string | null>(null);

  const data = stats.data;
  const total = data?.total ?? 0;

  const current = useMemo(
    () => (drillSido ? data?.sidos.find((s) => s.sido === drillSido) ?? null : null),
    [data, drillSido],
  );

  // 막대 행 — 시/도 레벨이면 드릴 가능, 시군구 레벨이면 평탄.
  const barRows = useMemo(() => {
    if (!data) return [];
    if (current) {
      return current.sigungus.map((sg) => ({
        label: sg.sigungu,
        count: sg.count,
        drillable: false,
      }));
    }
    return data.sidos.map((s) => ({ label: s.sido, count: s.count, drillable: true }));
  }, [data, current]);

  const barMax = useMemo(
    () => Math.max(1, ...barRows.map((r) => r.count)),
    [barRows],
  );

  // 표 행 — 모든 시군구를 가게 수 내림차순으로 평탄화.
  const tableRows = useMemo(() => {
    if (!data) return [];
    return data.sidos
      .flatMap((s) => s.sigungus.map((sg) => ({ sido: s.sido, sigungu: sg.sigungu, count: sg.count })))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="size-5" />
            </div>
            <div>
              <CardTitle>지역 통계</CardTitle>
              <CardDescription>
                등록된 가게의 시/도·시군구별 분포입니다.
                {data && (
                  <>
                    {' '}
                    총 {total.toLocaleString('ko-KR')}곳
                    {data.unclassified > 0 && ` · 미분류 ${data.unclassified}곳`}
                  </>
                )}
              </CardDescription>
            </div>
          </div>

          <div className="inline-flex rounded-lg bg-muted p-0.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = view === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setView(t.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {stats.isLoading && (
          <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
        )}

        {stats.isError && (
          <p className="py-10 text-center text-sm text-destructive">
            지역 통계를 불러오지 못했습니다: {(stats.error as Error).message}
          </p>
        )}

        {data && total === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            집계할 가게가 아직 없습니다.
          </p>
        )}

        {data && total > 0 && view === 'bar' && (
          <div className="space-y-1">
            {current && (
              <button
                type="button"
                onClick={() => setDrillSido(null)}
                className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
                전체 시/도
                <span className="ml-1 text-foreground">· {current.sido}</span>
              </button>
            )}

            {barRows.map((row) => (
              <button
                key={row.label}
                type="button"
                disabled={!row.drillable}
                onClick={() => row.drillable && setDrillSido(row.label)}
                className={cn(
                  'group w-full rounded-md px-2 py-1.5 text-left',
                  row.drillable && 'hover:bg-muted/60',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1 font-medium">
                    {row.label}
                    {row.drillable && (
                      <ChevronRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {row.count.toLocaleString('ko-KR')}곳 · {pct(row.count, total)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round((row.count / barMax) * 100)}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}

        {data && total > 0 && view === 'table' && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>시/도</TableHead>
                <TableHead>시/군/구</TableHead>
                <TableHead className="text-right">가게 수</TableHead>
                <TableHead className="w-[35%]">비율</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((row) => (
                <TableRow key={`${row.sido}-${row.sigungu}`}>
                  <TableCell className="text-muted-foreground">{row.sido}</TableCell>
                  <TableCell className="font-medium">{row.sigungu}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.count.toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct(row.count, total)}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {pct(row.count, total)}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
