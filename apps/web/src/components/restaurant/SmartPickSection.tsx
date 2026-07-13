import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Dices, Star } from 'lucide-react';
import { pickRandom, reviewThumbnailUrl, shuffle } from '@repo/utils';
import {
  useRestaurantSmartPick,
  useRestaurantsPublic,
  type RestaurantFavoritesApi,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { ImgWithFallback } from '~/components/ImgWithFallback';
import { cn } from '~/lib/utils';
import { CATEGORY_CHIPS } from './PublicRestaurantList';
import { SlotMachineReel } from './SlotMachineReel';

// 홈 히어로 — "오늘 뭐 먹지?" 슬롯머신 픽.
//
// 파이프라인: 공개 목록(카테고리 필터, 최대 200)으로 후보 풀을 로드 → 후보
// placeId 전부를 공개 smart-pick 에 넘겨 서버가 분석 점수 가중 랜덤으로 선택 →
// 결과는 이미 로드된 목록 행에서 매칭해 썸네일·평점을 보강(추가 조회 없음).
// 서버가 picked:null(분석된 후보 없음)이면 클라 균등 랜덤으로 폴백하고 뱃지로
// 알린다 — 굴렸는데 아무것도 안 나오는 경험을 만들지 않는다.
//
// 슬롯 상태 전이는 전부 이벤트 핸들러(클릭/뮤테이션 콜백/transitionend)에서
// 일어난다 — useEffect 없음. 릴 리셋은 정지 직후 transition-none 커밋으로 처리.

type Phase = 'idle' | 'spinning' | 'done';

interface ReelState {
  rows: string[];
  position: number;
  animate: boolean;
}

interface PickOutcome {
  placeId: string;
  name: string;
  // 서버 가중 픽이 아니라 클라 균등 랜덤 폴백이었는지 — 결과 카드에 뱃지.
  uniform: boolean;
}

const IDLE_REEL: ReelState = { rows: ['?'], position: 0, animate: false };

// 릴에 태울 중간 행 수 — 스크롤 길이(연출 시간 동안 지나가는 이름 수).
const SPIN_ROWS = 18;

export const SmartPickSection = ({
  favorites,
}: {
  // 홈이 소유한 useRestaurantFavorites — "즐겨찾기에서 뽑기" 모드용(선택).
  favorites?: RestaurantFavoritesApi;
}) => {
  const [category, setCategory] = useState<string | null>(null);
  const [fromFavorites, setFromFavorites] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [reel, setReel] = useState<ReelState>(IDLE_REEL);
  const [outcome, setOutcome] = useState<PickOutcome | null>(null);

  const listQuery = useRestaurantsPublic({ category: category ?? undefined, limit: 200 });
  const pickMutation = useRestaurantSmartPick();

  const items = listQuery.data?.items ?? [];
  // 즐겨찾기 모드는 2개 이상일 때만 의미 — 밑돌면(별 해제 등) 자동으로 전체
  // 풀로 복귀 (렌더 중 파생, 상태 동기화 effect 불필요).
  const favoritesAvailable = (favorites?.items.length ?? 0) >= 2;
  const useFavPool = fromFavorites && favoritesAvailable;
  const pool: Array<{ placeId: string; name: string }> = useFavPool ? favorites!.items : items;
  const busy = pickMutation.isPending || phase === 'spinning';
  const canRoll = pool.length > 0 && !busy;

  const rollFrom = (visibleName: string) => {
    if (!canRoll) return;
    // mutate 는 비동기 — 응답 시점의 풀이 아니라 굴린 시점의 풀로 폴백/릴을
    // 구성해야 하므로 스냅샷을 캡처한다.
    const candidates = pool.map((p) => ({ placeId: p.placeId, name: p.name }));
    setOutcome(null);
    pickMutation.mutate(
      { candidatePlaceIds: candidates.map((c) => c.placeId) },
      {
        onSuccess: (result) => {
          const picked: PickOutcome = result.picked
            ? { placeId: result.picked.placeId, name: result.picked.name, uniform: false }
            : (() => {
                const r = pickRandom(candidates);
                return { placeId: r.placeId, name: r.name, uniform: true };
              })();
          setOutcome(picked);

          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setReel({ rows: [picked.name], position: 0, animate: false });
            setPhase('done');
            return;
          }
          // 스트립: [현재 보이는 행, …후보 이름 셔플, 당첨]. 첫 행이 직전 커밋의
          // 가운데 행과 같아야 transition 시작 프레임이 이어져 보인다.
          const spin = shuffle(candidates.map((c) => c.name)).slice(0, SPIN_ROWS);
          const rows = [visibleName, ...spin, picked.name];
          setReel({ rows, position: rows.length - 1, animate: true });
          setPhase('spinning');
        },
        onError: () => setPhase('idle'),
      },
    );
  };

  const onRoll = () => rollFrom(reel.rows[reel.position] ?? '?');

  const onReelSettled = () => {
    if (phase !== 'spinning' || !outcome) return;
    // 다음 굴림이 항상 position 0 에서 출발하도록 스트립을 당첨 한 칸으로 리셋
    // — animate=false 커밋이라 화면상 이동은 없다.
    setReel({ rows: [outcome.name], position: 0, animate: false });
    setPhase('done');
  };

  const resetResult = () => {
    setOutcome(null);
    setPhase('idle');
    setReel(IDLE_REEL);
  };

  const onChangeCategory = (next: string | null) => {
    if (busy || next === category) return;
    setCategory(next);
    resetResult();
  };

  const onToggleFromFavorites = () => {
    if (busy) return;
    setFromFavorites((v) => !v);
    resetResult();
  };

  // 결과 카드 보강 — 공개 목록 행(평점·AI 점수 보유) 우선, 즐겨찾기 모드에선
  // 스냅샷(썸네일·카테고리만) 폴백. 풀 변경 시 outcome 을 리셋하므로 둘 다
  // 못 찾는 경우는 없지만, 방어적으로 이름만이라도 보여준다.
  const enriched = outcome ? items.find((i) => i.placeId === outcome.placeId) : undefined;
  const enrichedFav =
    outcome && favorites ? favorites.items.find((i) => i.placeId === outcome.placeId) : undefined;
  const resultThumbnail = enriched?.thumbnailUrl ?? enrichedFav?.thumbnailUrl ?? null;
  const resultCategory = enriched?.category ?? enrichedFav?.category ?? null;

  const poolEmpty = !useFavPool && !listQuery.isLoading && items.length === 0;

  return (
    <section className="mb-10">
      <header className="mb-4 flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">오늘 뭐 먹지? 🎰</h1>
        <p className="text-sm text-muted-foreground">
          등록된 맛집 중에서 AI 분석 점수(만족도·긍정 비율)를 가중치로 하나를 골라 드립니다.
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <CategoryChip
          label="전체"
          active={!useFavPool && category === null}
          disabled={busy || useFavPool}
          onClick={() => onChangeCategory(null)}
        />
        {CATEGORY_CHIPS.map((chip) => (
          <CategoryChip
            key={chip}
            label={chip}
            active={!useFavPool && category === chip}
            disabled={busy || useFavPool}
            onClick={() => onChangeCategory(chip)}
          />
        ))}
        {favoritesAvailable && (
          <>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <CategoryChip
              label={`⭐ 즐겨찾기에서 뽑기 (${favorites!.items.length})`}
              active={useFavPool}
              disabled={busy}
              onClick={onToggleFromFavorites}
            />
          </>
        )}
      </div>

      <SlotMachineReel
        rows={reel.rows}
        position={reel.position}
        animate={reel.animate}
        onSettled={onReelSettled}
      />

      <div className="mt-3 flex items-center justify-center">
        <Button size="lg" disabled={!canRoll} onClick={onRoll} className="gap-2">
          <Dices className="size-4" />
          {busy ? '고르는 중…' : phase === 'done' ? '다시 뽑기' : '골라줘!'}
        </Button>
      </div>

      <div aria-live="polite">
        {poolEmpty && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {category
              ? `'${category}' 카테고리엔 아직 맛집이 없어요.`
              : '등록된 맛집이 아직 없어요.'}
          </p>
        )}
        {pickMutation.isError && phase === 'idle' && (
          <p className="mt-3 text-center text-sm text-destructive">
            {pickMutation.error instanceof Error && pickMutation.error.message
              ? pickMutation.error.message
              : '뽑기에 실패했어요. 다시 시도해 주세요.'}
          </p>
        )}
        {phase === 'done' && outcome && (
          <Link
            to={`/restaurants-v2/${outcome.placeId}`}
            className="mt-4 block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Card className="border-primary/40 transition-colors hover:bg-accent/40">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                  {resultThumbnail ? (
                    <ImgWithFallback
                      src={reviewThumbnailUrl(resultThumbnail, 160)}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-lg">🍜</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-base font-semibold">{outcome.name}</span>
                    {resultCategory && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {resultCategory}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                    {enriched?.rating != null && (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                        <Star className="size-3 fill-current" /> {enriched.rating}
                      </span>
                    )}
                    {enriched && enriched.avgSatisfactionScore !== null && (
                      <span>😊 {enriched.avgSatisfactionScore.toFixed(1)}/5</span>
                    )}
                    {outcome.uniform && (
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        분석 점수가 없어 균등 랜덤으로 뽑았어요
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs font-medium text-primary">상세 보기 →</span>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </section>
  );
};

const CategoryChip = ({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick(): void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
    )}
  >
    {label}
  </button>
);
