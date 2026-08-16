import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Copy, Loader2, Lock, Users, Vote } from 'lucide-react';
import type { SharedVoteSessionType } from '@repo/api-contract';
import {
  ApiError,
  useCloseVote,
  useSharedVote,
  useSubmitBallot,
  useVoteGuestStore,
} from '@repo/shared';
import { reviewThumbnailUrl } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { cn } from '~/lib/utils';
import { VoteResultView } from './VoteResultView';

// 공개 투표 페이지 — 링크만 있으면 비로그인 참여(SharedSettlementPage 골격
// 미러: 단독 main, 410=만료/404=잘못된 주소 분기). 이름 입력 + 복수 찬성 체크
// → 투표/수정(풀 리플레이스), 집계는 15초 폴링 + 변경 응답 즉시 반영. 방장
// (isOwner)에게만 마감 버튼이 보이고, 마감되면 결과 화면으로 전환된다.
export const VotePage = () => {
  const { token = '' } = useParams<{ token: string }>();
  const query = useSharedVote(token || null);

  return (
    <main className="container mx-auto max-w-2xl px-4 py-8">
      {/* isPending — isLoading 은 재시도 백오프 사이(fetch 휴지기)에 false 가 되어
          에러 확정 전 빈 화면이 생긴다. isPending 은 성공/실패 확정까지 true. */}
      {query.isPending ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
        </div>
      ) : query.isError ? (
        <VoteErrorView error={query.error} />
      ) : query.data ? (
        query.data.closedAt ? (
          <>
            {/* 마감 클레임(closedAt) 뒤 winner 확정 전에 서버가 죽으면 결과 없는
                마감 상태로 남는다. close 는 멱등이라 재호출이 곧 복구 — 방장에게만
                확정 버튼을 노출한다(참가자는 집계만 보게 두고 폴링이 갱신). */}
            {!query.data.winnerOptionId && query.data.isOwner && (
              <FinalizePrompt token={token} sessionId={query.data.id} />
            )}
            <VoteResultView data={query.data} />
          </>
        ) : (
          <VotingView token={token} data={query.data} />
        )
      ) : null}
    </main>
  );
};

const VoteErrorView = ({ error }: { error: unknown }) => {
  const status = error instanceof ApiError ? error.statusCode : null;
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
      <p className="text-base font-semibold">
        {status === 410 ? '투표 링크가 만료되었어요' : '잘못된 주소예요'}
      </p>
      <p className="text-sm text-muted-foreground">
        {status === 410
          ? '투표 링크는 생성 후 7일까지만 열 수 있어요.'
          : '링크가 정확한지 다시 확인해 주세요.'}
      </p>
    </div>
  );
};

// 마감 중 크래시 복구 — closedAt 은 있는데 winner 가 없는 세션을 방장이 다시
// 확정한다. useCloseVote 의 onSuccess 가 공유 캐시를 통째로 교체하므로 성공
// 즉시 이 배너는 사라지고 우승 카드가 나타난다.
const FinalizePrompt = ({ token, sessionId }: { token: string; sessionId: string }) => {
  const closeMutation = useCloseVote(token);
  return (
    <div className="mb-6 flex flex-col items-center gap-2 rounded-xl border border-dashed p-4 text-center">
      <p className="text-sm text-muted-foreground">
        마감 처리가 끝나지 않았어요 — 결과를 확정해 주세요.
      </p>
      <Button
        type="button"
        size="sm"
        disabled={closeMutation.isPending}
        onClick={() => closeMutation.mutate(sessionId)}
        className="gap-1.5"
      >
        {closeMutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Lock className="size-3.5" />
        )}
        결과 확정하기
      </Button>
      {closeMutation.isError && (
        <p className="text-xs text-destructive" aria-live="polite">
          확정에 실패했어요. 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
};

const VotingView = ({ token, data }: { token: string; data: SharedVoteSessionType }) => {
  const guestId = useVoteGuestStore((s) => s.guestId);
  const savedName = useVoteGuestStore((s) => s.name);
  const setSavedName = useVoteGuestStore((s) => s.setName);
  const savedBallot = useVoteGuestStore((s) => s.ballots[token]?.optionIds);

  const [name, setName] = useState(savedName);
  // null = 아직 안 만짐 → 저장된 내 찬성 기록(재방문)에서 파생. 렌더 중 계산.
  const [checkedDraft, setCheckedDraft] = useState<string[] | null>(null);
  const checked = checkedDraft ?? savedBallot ?? [];
  const [copied, setCopied] = useState(false);

  const submitMutation = useSubmitBallot(token);
  const closeMutation = useCloseVote(token);

  const hasVoted = savedBallot !== undefined;
  const canSubmit =
    name.trim().length > 0 && !submitMutation.isPending && (checked.length > 0 || hasVoted);

  const toggleOption = (id: string) => {
    setCheckedDraft(checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id]);
  };

  const onSubmit = () => {
    if (!canSubmit) return;
    const label = name.trim();
    setSavedName(label);
    submitMutation.mutate({ voterKey: guestId, voterLabel: label, optionIds: checked });
  };

  const onClose = () => {
    if (closeMutation.isPending) return;
    if (data.totalVoters === 0 && !window.confirm('아직 아무도 투표하지 않았어요. 마감할까요?')) {
      return;
    }
    closeMutation.mutate(data.id);
  };

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // clipboard 미지원 — 주소창에서 직접 복사하도록 조용히 무시.
    }
  };

  return (
    <>
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Vote className="size-6" /> {data.title}
        </h1>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="size-3.5" /> {data.totalVoters}명 참여 · 마음에 드는 곳에 모두
          투표하세요
        </p>
      </header>

      <section className="mb-5">
        <label className="mb-1.5 block text-sm font-medium" htmlFor="voter-name">
          내 이름
        </label>
        <Input
          id="voter-name"
          value={name}
          maxLength={20}
          placeholder="투표에 표시될 이름"
          onChange={(e) => setName(e.target.value)}
        />
      </section>

      <ul className="mb-5 flex flex-col gap-2">
        {data.options.map((option) => {
          const active = checked.includes(option.id);
          const pct =
            data.totalVoters > 0 ? Math.round((option.count / data.totalVoters) * 100) : 0;
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => toggleOption(option.id)}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                  active
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-border hover:border-foreground/30 hover:bg-muted/40',
                )}
              >
                <div
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-md border',
                    active ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {active && <Check className="size-3.5" />}
                </div>
                <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  {option.thumbnailUrl ? (
                    <ImgWithFallback
                      src={reviewThumbnailUrl(option.thumbnailUrl, 96)}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">🍜</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-semibold">{option.name}</span>
                    {option.category && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {option.category}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
                    {option.count}표{option.voters.length > 0 && ` · ${option.voters.join(', ')}`}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mb-3 flex flex-col items-center gap-2">
        <Button size="lg" disabled={!canSubmit} onClick={onSubmit} className="gap-2">
          {submitMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Vote className="size-4" />
          )}
          {hasVoted ? '투표 수정하기' : '투표하기'}
        </Button>
        {submitMutation.isSuccess && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            투표했어요! 마음이 바뀌면 언제든 수정할 수 있어요.
          </p>
        )}
        {submitMutation.isError && (
          <p className="text-sm text-destructive" aria-live="polite">
            {submitMutation.error instanceof ApiError && submitMutation.error.statusCode === 409
              ? '방금 마감된 투표예요 — 잠시 후 결과가 표시됩니다.'
              : '투표에 실패했어요. 다시 시도해 주세요.'}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCopyLink} className="gap-1.5">
          <Copy className="size-3.5" /> {copied ? '복사됨!' : '링크 복사'}
        </Button>
        {data.isOwner && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={closeMutation.isPending}
            onClick={onClose}
            className="gap-1.5"
          >
            {closeMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Lock className="size-3.5" />
            )}
            마감하기
          </Button>
        )}
      </div>
    </>
  );
};
