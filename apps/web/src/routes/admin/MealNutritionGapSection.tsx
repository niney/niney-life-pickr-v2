import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useEstimateMealNutritionGaps, useMealNutritionGaps } from '@repo/shared';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';

// 어드민 > 음식 카탈로그 "열량 빈 식단 이름" — 식단 항목 중 열량이 비었거나(카탈로그에도, 규칙·LLM·웹 추정에도 없음)
// 카탈로그 밖 이름을 추정으로 채운 것을 이름별로 모은다. 자주 기록되는데 비었거나 추정이 틀린 이름은 아래
// "메뉴 칼로리 판정 어휘"의 별칭(→ 카탈로그 음식명)·1인분 기준 중량으로 바로잡고 "다시 찾기"를 누른다.
// 사용자는 드러내지 않고 기록 수·사용자 수만 보인다.

export const MealNutritionGapSection = () => {
  const gaps = useMealNutritionGaps();
  const estimate = useEstimateMealNutritionGaps();
  const [message, setMessage] = useState<string | null>(null);
  const data = gaps.data;
  const missingNames = (data?.items ?? []).filter((it) => it.state === 'missing').map((it) => it.name);

  const run = (names: string[]): void => {
    setMessage(null);
    estimate.mutate(names, {
      onSuccess: (res) =>
        setMessage(
          `바로 채운 항목 ${res.filled}건` +
            (res.scheduled > 0 ? ` · ${res.scheduled}개 이름은 AI·웹에 묻는 중(끝나면 다시 불러오세요)` : ''),
        ),
      onError: (e) => setMessage(e instanceof Error ? e.message : '다시 찾지 못했습니다'),
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">열량 빈 식단 이름</CardTitle>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void gaps.refetch()} disabled={gaps.isFetching}>
              <RefreshCw className="size-4" />
              새로 불러오기
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => run(missingNames.slice(0, 50))}
              disabled={missingNames.length === 0 || estimate.isPending}
            >
              빈 이름 다시 찾기
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          식단에 적힌 이름이 카탈로그에 없으면 규칙 → AI 매칭 → 웹 실측 순으로 "○○ 기준 추정"을 붙인다. 그래도 빈 이름과
          추정이 틀린 이름은 아래 메뉴 칼로리 판정 어휘의 별칭·1인분 기준 중량으로 고친 뒤(10분 안에 반영) 다시 찾는다.
          {data ? ` 빈 이름 ${data.missingNames}개 · 추정 ${data.estimatedNames}개.` : ''}
        </p>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent>
        {gaps.isLoading ? (
          <p className="text-xs text-muted-foreground">불러오는 중…</p>
        ) : gaps.isError ? (
          <p className="text-xs text-destructive">목록을 불러오지 못했습니다.</p>
        ) : !data || data.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">열량이 빈 식단 이름이 없습니다.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">기록</TableHead>
                <TableHead className="text-right">사용자</TableHead>
                <TableHead>최근</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((it) => (
                <TableRow key={it.name}>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="max-w-xs">
                    {it.state === 'missing' ? (
                      <Badge variant="amber">비어 있음</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{it.nutritionFrom ?? '유사 음식'} 기준 추정</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{it.itemCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.userCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{it.lastEatenDate ?? '—'}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={estimate.isPending}
                      onClick={() => run([it.name])}
                      aria-label={`${it.name} 다시 찾기`}
                    >
                      다시 찾기
                    </Button>
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
