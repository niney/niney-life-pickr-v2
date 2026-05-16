import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AutoDiscoverCandidateType,
  AutoDiscoverJobSnapshotType,
  AutoDiscoverKeywordType,
  AutoDiscoverPhaseType,
} from '@repo/api-contract';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { cn } from '~/lib/utils';

interface Props {
  snapshot: AutoDiscoverJobSnapshotType;
  onCancel: () => void;
  onClose: () => void;
  canCancel: boolean;
}

const PHASE_LABEL: Record<AutoDiscoverPhaseType, string> = {
  queued: '대기 중',
  generating_keywords: 'AI 키워드 생성 중',
  searching: '네이버 검색 중',
  crawling: '크롤·등록 중',
  done: '완료',
};

export const AutoDiscoverJobCard = ({
  snapshot,
  onCancel,
  onClose,
  canCancel,
}: Props) => {
  const running =
    snapshot.state === 'pending' || snapshot.state === 'running';
  const failed = snapshot.state === 'failed';
  const cancelled = snapshot.state === 'cancelled';

  const target = snapshot.input.targetCount;
  const ratio =
    target === 0 ? 0 : Math.min(1, snapshot.newlyRegistered / target);

  // 후보를 그룹 별로 묶기. groupIndex = -1 (already_registered) 는 별도 섹션.
  const { groups, alreadyRegistered } = useMemo(() => {
    const byGroup = new Map<number, AutoDiscoverCandidateType[]>();
    const pre: AutoDiscoverCandidateType[] = [];
    for (const c of snapshot.candidates) {
      if (c.groupIndex < 0) {
        pre.push(c);
        continue;
      }
      const list = byGroup.get(c.groupIndex) ?? [];
      list.push(c);
      byGroup.set(c.groupIndex, list);
    }
    const sortedKeys = [...byGroup.keys()].sort((a, b) => a - b);
    return {
      groups: sortedKeys.map((k) => ({
        index: k,
        items: byGroup.get(k)!,
      })),
      alreadyRegistered: pre,
    };
  }, [snapshot.candidates]);

  const totalCandidates = snapshot.candidates.length;
  const doneCount = snapshot.candidates.filter((c) => c.state === 'done').length;
  const failedCount = snapshot.candidates.filter(
    (c) => c.state === 'failed',
  ).length;
  const skippedCount = snapshot.candidates.filter(
    (c) => c.state === 'skipped',
  ).length;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {running ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : failed ? (
              <XCircle className="size-4 text-destructive" />
            ) : cancelled ? (
              <X className="size-4 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="size-4 text-emerald-600" />
            )}
            <CardTitle className="text-base">
              자동 발견 — {snapshot.input.q}
            </CardTitle>
            <Badge variant="outline" className="font-normal">
              {PHASE_LABEL[snapshot.phase]}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {running && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={!canCancel}
                className="h-7 gap-1 px-2 text-xs"
              >
                <X className="size-3.5" />
                취소
              </Button>
            )}
            {!running && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-7 gap-1 px-2 text-xs"
              >
                닫기
              </Button>
            )}
          </div>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>
            등록 {snapshot.newlyRegistered} / 목표 {target}
          </span>
          <span className="text-muted-foreground">·</span>
          <span>
            성공 {doneCount} · 실패 {failedCount}
            {skippedCount > 0 && ` · 건너뜀 ${skippedCount}`}
            {totalCandidates > 0 && ` · 총 후보 ${totalCandidates}`}
          </span>
          {snapshot.input.categories.length > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span>카테고리: {snapshot.input.categories.join(', ')}</span>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 진행 바 — newlyRegistered/target. */}
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'absolute inset-y-0 left-0 transition-[width]',
              failed
                ? 'bg-destructive'
                : cancelled
                  ? 'bg-muted-foreground/50'
                  : 'bg-primary',
            )}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>

        {/* 키워드 패널 — 최대 8 칸 그리드. */}
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5" />
            검색 키워드 ({snapshot.keywords.length})
          </h4>
          {snapshot.keywords.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              AI 가 키워드를 만들고 있습니다…
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {snapshot.keywords.map((k) => (
                <KeywordTile key={k.keyword} keyword={k} />
              ))}
            </div>
          )}
        </section>

        {/* 사전 제외(이미 등록) 후보. */}
        {alreadyRegistered.length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">
              이미 등록된 후보 ({alreadyRegistered.length})
            </h4>
            <ul className="space-y-1">
              {alreadyRegistered.map((c) => (
                <li
                  key={c.placeId}
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs"
                >
                  <span className="truncate font-medium">{c.name}</span>
                  {c.category && (
                    <Badge variant="outline" className="font-normal">
                      {c.category}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="border-muted-foreground/40 font-normal text-muted-foreground"
                  >
                    이미 등록됨
                  </Badge>
                  <span className="ml-auto truncate text-muted-foreground">
                    {c.sourceKeyword}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 그룹별 후보 리스트. */}
        {groups.length === 0 ? (
          totalCandidates === 0 && snapshot.phase === 'crawling' ? (
            <p className="text-xs text-muted-foreground">크롤 대상 없음.</p>
          ) : null
        ) : (
          <section className="space-y-3">
            {groups.map((g) => {
              const doneInGroup = g.items.filter(
                (i) => i.state === 'done',
              ).length;
              const totalInGroup = g.items.length;
              return (
                <div key={g.index}>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    그룹 {g.index + 1}
                    <span>
                      ({doneInGroup}/{totalInGroup} 완료)
                    </span>
                  </h4>
                  <ul className="space-y-1">
                    {g.items.map((c) => (
                      <CandidateRow key={c.placeId} candidate={c} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        )}
      </CardContent>
    </Card>
  );
};

const KeywordTile = ({ keyword }: { keyword: AutoDiscoverKeywordType }) => {
  const icon =
    keyword.state === 'pending' ? (
      <Search className="size-3 text-muted-foreground/60" />
    ) : keyword.state === 'searching' ? (
      <Loader2 className="size-3 animate-spin text-primary" />
    ) : keyword.state === 'done' ? (
      <CheckCircle2 className="size-3 text-emerald-600" />
    ) : (
      <XCircle className="size-3 text-destructive" />
    );
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs',
        keyword.state === 'done' && 'border-emerald-200/60 bg-emerald-50/40',
        keyword.state === 'failed' && 'border-destructive/40 bg-destructive/5',
      )}
      title={keyword.errorMessage ?? undefined}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{keyword.keyword}</span>
      {keyword.hitCount !== null && keyword.state === 'done' && (
        <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
          {keyword.hitCount}
        </Badge>
      )}
    </div>
  );
};

const CandidateRow = ({ candidate }: { candidate: AutoDiscoverCandidateType }) => {
  const stateBadge =
    candidate.state === 'pending' ? (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        대기
      </Badge>
    ) : candidate.state === 'running' ? (
      <Badge
        variant="outline"
        className="gap-1 border-primary/40 font-normal text-primary"
      >
        <Loader2 className="size-3 animate-spin" />
        등록 중
      </Badge>
    ) : candidate.state === 'done' ? (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-400/40 font-normal text-emerald-700"
      >
        <CheckCircle2 className="size-3" />
        등록 완료
      </Badge>
    ) : candidate.state === 'failed' ? (
      <Badge
        variant="outline"
        className="gap-1 border-destructive/40 font-normal text-destructive"
        title={candidate.errorMessage ?? undefined}
      >
        <XCircle className="size-3" />
        실패
      </Badge>
    ) : (
      <Badge
        variant="outline"
        className="font-normal text-muted-foreground"
        title={candidate.errorMessage ?? candidate.skipReason ?? undefined}
      >
        건너뜀
        {candidate.skipReason === 'target_reached' && ' (목표 도달)'}
        {candidate.skipReason === 'cancelled' && ' (취소)'}
      </Badge>
    );

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
      <span className="truncate font-medium">{candidate.name}</span>
      {candidate.category && (
        <Badge variant="outline" className="font-normal">
          {candidate.category}
        </Badge>
      )}
      {stateBadge}
      <span className="ml-auto truncate text-muted-foreground">
        {candidate.sourceKeyword}
      </span>
      {candidate.state === 'done' && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-6 shrink-0 gap-1 px-1.5 text-xs"
        >
          <Link to={`/admin/restaurants/${candidate.placeId}`}>
            <ExternalLink className="size-3" />
            보기
          </Link>
        </Button>
      )}
    </li>
  );
};
