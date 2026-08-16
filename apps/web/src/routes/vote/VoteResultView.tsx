import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PartyPopper, Trophy } from 'lucide-react';
import type { SharedVoteSessionType, VoteOptionType } from '@repo/api-contract';
import { reviewThumbnailUrl, shuffle } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { SlotMachineReel } from '~/components/restaurant/SlotMachineReel';
import { cn } from '~/lib/utils';

// 마감된 투표의 결과 화면. 동점 티브레이크(smart-pick/random)로 결정된 경우
// 최초 진입 1회 슬롯머신 연출 — 릴은 동점 후보 이름으로 돌다 서버가 확정한
// winner 에 감속 정지한다(결정은 서버, 클라는 연출만).

interface ReelState {
  rows: string[];
  position: number;
  animate: boolean;
}

const DECIDED_LABEL: Record<string, string> = {
  votes: '투표로 결정',
  'smart-pick': '동점 → AI 픽으로 결정',
  random: '동점 → 랜덤 결정',
};

export const VoteResultView = ({ data }: { data: SharedVoteSessionType }) => {
  const winner = data.options.find((o) => o.id === data.winnerOptionId) ?? null;
  const maxCount = Math.max(...data.options.map((o) => o.count), 0);
  const tied = data.options.filter((o) => o.count === maxCount);

  const needsReveal =
    winner !== null && data.decidedBy !== null && data.decidedBy !== 'votes' && tied.length > 1;

  const [revealed, setRevealed] = useState(!needsReveal);
  const [reel, setReel] = useState<ReelState>(() => ({
    rows: [needsReveal ? tied[0]!.name : '?'],
    position: 0,
    animate: false,
  }));

  // 마운트 직후 1회 스핀 — CSS transition 은 "직전 커밋 → 새 커밋"의 transform
  // 변화로만 발화하므로 시작 프레임(position 0)을 먼저 그린 뒤, 페인트 이후
  // (useEffect)에 목표 위치를 커밋한다. 브라우저 페인트 사이클과의 동기화라
  // useEffect 가 맞는 자리. StrictMode 이중 실행은 같은 목표 재커밋이라 무해.
  useEffect(() => {
    if (!needsReveal || !winner) return;
    const names = tied.map((t) => t.name);
    const spin = [shuffle(names), shuffle(names), shuffle(names)].flat();
    const rows = [tied[0]!.name, ...spin, winner.name];
    setReel({ rows, position: rows.length - 1, animate: true });
    // 최초 진입 1회 연출 — data 는 마감 후 불변이라 의존성 불필요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const standings = [...data.options].sort(
    (a, b) => b.count - a.count || a.orderIndex - b.orderIndex,
  );

  return (
    <>
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Trophy className="size-6 text-amber-500" /> {data.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          투표 마감 · {data.totalVoters}명 참여
          {data.decidedBy && ` · ${DECIDED_LABEL[data.decidedBy]}`}
        </p>
      </header>

      {!revealed && (
        <div className="mb-6" aria-label="동점 추첨 중">
          <p className="mb-2 text-center text-sm font-medium text-muted-foreground">
            동점! 어디로 갈지 뽑는 중…
          </p>
          <SlotMachineReel
            rows={reel.rows}
            position={reel.position}
            animate={reel.animate}
            onSettled={() => setRevealed(true)}
          />
          {/* 탈출구 — 백그라운드 탭 등에서 transition 이 시작되지 못해
              transitionend 가 안 오는 경우를 포함, 연출을 건너뛰고 싶은
              사용자용(타이머 없는 이벤트 기반 안전장치). */}
          <div className="mt-2 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setRevealed(true)}
            >
              결과 바로 보기
            </Button>
          </div>
        </div>
      )}

      {revealed && winner && (
        <Link
          to={`/r/${winner.placeId}`}
          className="mb-6 block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="border-amber-400/60 bg-amber-500/5 transition-colors hover:bg-amber-500/10">
            <CardContent className="flex items-center gap-4 p-4">
              <PartyPopper className="size-6 shrink-0 text-amber-500" />
              <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                {winner.thumbnailUrl ? (
                  <ImgWithFallback
                    src={reviewThumbnailUrl(winner.thumbnailUrl, 160)}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-lg">🍜</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-lg font-bold">{winner.name}</span>
                  {winner.category && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {winner.category}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {winner.count}표{winner.voters.length > 0 && ` · ${winner.voters.join(', ')}`}
                </div>
              </div>
              <span className="shrink-0 text-xs font-medium text-primary">상세 보기 →</span>
            </CardContent>
          </Card>
        </Link>
      )}

      {revealed && (
        <section aria-label="최종 집계">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">최종 집계</h2>
          <ul className="flex flex-col gap-2">
            {standings.map((option) => (
              <StandingRow
                key={option.id}
                option={option}
                totalVoters={data.totalVoters}
                isWinner={option.id === data.winnerOptionId}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

const StandingRow = ({
  option,
  totalVoters,
  isWinner,
}: {
  option: VoteOptionType;
  totalVoters: number;
  isWinner: boolean;
}) => {
  const pct = totalVoters > 0 ? Math.round((option.count / totalVoters) * 100) : 0;
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3',
        isWinner && 'border-amber-400/60',
      )}
    >
      <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
        {option.thumbnailUrl ? (
          <ImgWithFallback
            src={reviewThumbnailUrl(option.thumbnailUrl, 80)}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm">🍜</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{option.name}</span>
          {isWinner && <span className="shrink-0 text-xs text-amber-500">🏆</span>}
        </div>
        <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('transition-all', isWinner ? 'bg-amber-500' : 'bg-primary/60')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
          {option.count}표{option.voters.length > 0 && ` · ${option.voters.join(', ')}`}
        </div>
      </div>
    </li>
  );
};
