import { Loader2, RefreshCw } from 'lucide-react';
import { useReanalyzeRestaurant } from '@repo/shared';
import { Badge } from '~/components/ui/badge';

// 실패한 요약을 다시 큐잉하는 클릭 배지. 행 클릭(상세 이동·선택)과 충돌하지
// 않도록 내부에서 stopPropagation 까지 처리한다. 컴포넌트가 자기 mutation 을
// 들고 있으므로 같은 페이지의 여러 행이 동시에 재요약을 돌릴 수 있다.
export const ReanalyzeFailedBadge = ({
  placeId,
  count,
}: {
  placeId: string;
  count: number;
}) => {
  const reanalyze = useReanalyzeRestaurant();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        reanalyze.mutate(placeId);
      }}
      disabled={reanalyze.isPending}
      title="클릭하면 실패한 요약을 다시 시도합니다"
      className="rounded-md transition-opacity hover:opacity-80 disabled:opacity-60"
    >
      <Badge variant="destructive" className="inline-flex items-center gap-1">
        {reanalyze.isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <RefreshCw className="size-3" />
        )}
        실패 {count}
      </Badge>
    </button>
  );
};
