import { ApiError, useCanonicalCandidates, useMergeCanonical } from '@repo/shared';
import { ChevronRight, Link2, Loader2, XCircle } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

const SOURCE_LABELS: Record<string, string> = {
  naver: 'Naver',
  diningcode: '다이닝코드',
  catchtable: '캐치테이블',
  tabling: '테이블링',
};
const sourceLabel = (s: string): string => SOURCE_LABELS[s] ?? s;

// 한 canonical 의 후보(같은 가게로 보이는 다른 canonical) 목록 + 병합 트리거.
// 어드민이 행 옆 "병합" 버튼을 누르면 행 아래 인라인 패널로 펼쳐진다.
// 단순 인라인 — 진짜 모달은 의도적으로 안 만든다(Dialog 컴포넌트 부재 + 같은
// 화면에서 다른 행과 비교하기 쉽도록).
export const CanonicalMergePanel = ({
  canonicalId,
  onClose,
}: {
  canonicalId: string;
  onClose: () => void;
}) => {
  const candidatesQuery = useCanonicalCandidates(canonicalId);
  const mergeMutation = useMergeCanonical();

  const handleMerge = (otherCanonicalId: string) => {
    // 후보는 source 측(=otherCanonicalId)이 target 으로 흡수됨. 어드민이 현재
    // 보고 있는 행(canonicalId) 이 target — 그 가게가 "정사본" 으로 유지된다.
    mergeMutation.mutate(
      { sourceCanonicalId: otherCanonicalId, targetCanonicalId: canonicalId },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  const error = mergeMutation.error;
  const candidates = candidatesQuery.data?.candidates ?? [];

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground">
          다른 출처의 같은 가게를 이 행에 묶기
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          닫기
        </Button>
      </div>

      {candidatesQuery.isLoading ? (
        <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> 후보 검색 중…
        </div>
      ) : candidatesQuery.isError ? (
        <div className="flex items-center gap-2 px-1 py-2 text-xs text-destructive">
          <XCircle className="size-3" /> 후보를 불러올 수 없습니다.
        </div>
      ) : candidates.length === 0 ? (
        <div className="px-1 py-2 text-xs text-muted-foreground">
          좌표·이름 임계를 통과한 다른 출처 후보가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {candidates.map((c) => {
            const isMerging =
              mergeMutation.isPending &&
              mergeMutation.variables?.sourceCanonicalId === c.canonical.id;
            return (
              <li
                key={c.canonical.id}
                className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.canonical.name}
                    </span>
                    {c.canonical.primaryCategory && (
                      <span className="text-xs text-muted-foreground">
                        {c.canonical.primaryCategory}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {c.canonical.sources.map((s) => (
                      <Badge
                        key={s.restaurantId}
                        variant={
                          s.source === 'naver'
                            ? 'green'
                            : s.source === 'diningcode'
                              ? 'violet'
                              : 'secondary'
                        }
                      >
                        {sourceLabel(s.source)}
                      </Badge>
                    ))}
                    <span>점수 {(c.score * 100).toFixed(0)}%</span>
                    {c.distanceM !== null && <span>· {c.distanceM.toFixed(0)}m</span>}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="teal"
                  size="sm"
                  onClick={() => handleMerge(c.canonical.id)}
                  disabled={isMerging || mergeMutation.isPending}
                >
                  {isMerging ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Link2 />
                  )}
                  병합
                  <ChevronRight />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div className="mt-2 text-xs text-destructive">
          {error instanceof ApiError ? error.message : '병합 실패'}
        </div>
      )}
    </div>
  );
};
