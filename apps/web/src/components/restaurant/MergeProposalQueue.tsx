import {
  ApiError,
  useAcceptCanonicalProposal,
  useCanonicalProposals,
  useRejectCanonicalProposal,
  useRunCanonicalProposals,
} from '@repo/shared';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CanonicalProposalItemType } from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

const SOURCE_LABELS: Record<string, string> = {
  naver: 'Naver',
  diningcode: '다이닝코드',
  catchtable: '캐치테이블',
};
const sourceLabel = (s: string): string => SOURCE_LABELS[s] ?? s;

// 한 후보 canonical 의 요약 카드(이름 + 카테고리 + 출처 칩). 두 쌍 비교용으로
// 좌·우에 나란히. DC 칩은 어드민 다이닝코드 페이지로 링크 (검토 중 원문 확인 용).
const CanonicalCard = ({
  canonical,
  label,
  highlighted,
}: {
  canonical: CanonicalProposalItemType['canonicalA'];
  label: 'A' | 'B';
  highlighted: boolean;
}) => (
  <div
    className={`flex-1 rounded-md border p-2 text-xs ${
      highlighted ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'bg-background'
    }`}
  >
    <div className="mb-1 flex items-baseline gap-1.5">
      <Badge variant={highlighted ? 'default' : 'outline'} className="text-[10px]">
        {label} {highlighted && '(유지)'}
      </Badge>
      <span className="truncate text-sm font-medium">{canonical.name}</span>
    </div>
    {canonical.primaryCategory && (
      <div className="mb-1 text-muted-foreground">{canonical.primaryCategory}</div>
    )}
    <div className="flex flex-wrap items-center gap-1">
      {canonical.sources.map((s) => {
        if (s.source === 'diningcode') {
          return (
            <Link
              key={s.restaurantId}
              to={`/admin/diningcode/${s.sourceId}`}
              className="inline-flex"
              target="_blank"
              rel="noreferrer"
            >
              <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                {sourceLabel(s.source)}
                <ExternalLink className="ml-1 size-3" />
              </Badge>
            </Link>
          );
        }
        if (s.source === 'naver' && s.placeId) {
          return (
            <Link
              key={s.restaurantId}
              to={`/admin/restaurants/${s.placeId}`}
              className="inline-flex"
              target="_blank"
              rel="noreferrer"
            >
              <Badge variant="default" className="cursor-pointer">
                {sourceLabel(s.source)}
                <ExternalLink className="ml-1 size-3" />
              </Badge>
            </Link>
          );
        }
        return (
          <Badge key={s.restaurantId} variant="secondary">
            {sourceLabel(s.source)}
          </Badge>
        );
      })}
    </div>
  </div>
);

// 한 검토 행 — 두 카드 + 점수 + 액션 버튼. 어드민이 어느 쪽을 유지할지 토글
// 가능 (기본 'A' = 작은 id, 보통 먼저 등록된 쪽).
const ProposalRow = ({ proposal }: { proposal: CanonicalProposalItemType }) => {
  const [keepSide, setKeepSide] = useState<'A' | 'B'>('A');
  const acceptMutation = useAcceptCanonicalProposal();
  const rejectMutation = useRejectCanonicalProposal();

  const accepting =
    acceptMutation.isPending && acceptMutation.variables?.proposalId === proposal.id;
  const rejecting =
    rejectMutation.isPending && rejectMutation.variables === proposal.id;
  const error = acceptMutation.error ?? rejectMutation.error;

  const handleAccept = () => {
    acceptMutation.mutate({ proposalId: proposal.id, input: { keepSide } });
  };

  return (
    <li className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <CanonicalCard
          canonical={proposal.canonicalA}
          label="A"
          highlighted={keepSide === 'A'}
        />
        <CanonicalCard
          canonical={proposal.canonicalB}
          label="B"
          highlighted={keepSide === 'B'}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>점수 {(proposal.score * 100).toFixed(0)}%</span>
          <span>· 이름 {(proposal.nameScore * 100).toFixed(0)}%</span>
          {proposal.distanceM !== null && <span>· {proposal.distanceM.toFixed(0)}m</span>}
          <span>· {new Date(proposal.createdAt).toLocaleString('ko-KR')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setKeepSide(keepSide === 'A' ? 'B' : 'A')}
            title="유지할 쪽 토글"
          >
            유지: {keepSide}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={accepting || rejecting}
            onClick={handleAccept}
          >
            {accepting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            수락
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={accepting || rejecting}
            onClick={() => rejectMutation.mutate(proposal.id)}
            title="같은 가게 아님 — 다시 큐에 안 들어옴"
          >
            {rejecting ? <Loader2 className="animate-spin" /> : <XCircle />}
            거절
          </Button>
        </div>
      </div>
      {error && (
        <div className="text-xs text-destructive">
          {error instanceof ApiError ? error.message : '처리 실패'}
        </div>
      )}
    </li>
  );
};

// 어드민 맛집 페이지 상단 카드. 펼침 토글이라 검토 대기가 0건이면 본문 노출도
// 안 함 — 시각적 무게 감소. open=true 면 행 목록 + 전체 다시 돌리기.
export const MergeProposalQueue = () => {
  const [open, setOpen] = useState(false);
  const query = useCanonicalProposals();
  const runMutation = useRunCanonicalProposals();

  const items = query.data?.items ?? [];
  const count = items.length;

  // 큐가 비고 한 번도 안 펼친 적 없으면 카드 자체를 숨길 수도 있지만, "전체
  // 다시 돌리기" 버튼은 항상 닿을 수 있어야 해서 헤더만이라도 노출.
  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="size-4" />
            검토 대기 자동 매칭
            {count > 0 && <Badge variant="secondary">{count}건</Badge>}
            {count === 0 && (
              <span className="text-xs font-normal text-muted-foreground">없음</span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={runMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                runMutation.mutate();
              }}
              title="모든 가게 쌍을 다시 매칭해 큐를 채움"
            >
              {runMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              전체 다시 돌리기
            </Button>
            <Button type="button" variant="ghost" size="sm" aria-label="펼치기">
              {open ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </div>
        </div>
        {runMutation.data && (
          <div className="mt-1 text-xs text-muted-foreground">
            마지막 실행: 새로 적재 {runMutation.data.created}건
          </div>
        )}
      </CardHeader>
      {open && (
        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> 큐 로딩 중…
            </div>
          ) : items.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              검토 대기 항목이 없습니다. 가게를 등록하거나 "전체 다시 돌리기" 를 눌러
              매칭을 새로 돌릴 수 있습니다.
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((p) => (
                <ProposalRow key={p.id} proposal={p} />
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
};
