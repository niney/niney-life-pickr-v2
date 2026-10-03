import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Loader2,
  NotebookPen,
  RefreshCw,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import {
  MEAL_ALLERGEN_LABEL,
  type MealRecommendationType,
  type MealSlotType,
  type MealTypeType,
} from '@repo/api-contract';
import {
  recommendationHistoryFoods,
  recommendationProgressLabel,
  recommendationWhenLabel,
  startMealDraftFromRecommendation,
  useAirLocation,
  useCreateMealRecommendation,
  useFoodRestaurants,
  useMealRecommendationContext,
  useMealRecommendationFeedback,
  useMealRecommendationEvent,
  useMealRecommendations,
} from '@repo/shared';
import {
  FOOD_CUISINE_LABEL,
  FOOD_DISH_TYPE_LABEL,
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
  guessMealSlot,
  toLocalDateKey,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import { useMealDraftReady } from './useMealDraftReady';

// 다음 끼니 추천 — 끼니·상황을 고르고 받는다. 서버가 같은 날·끼니·프로필이면 캐시를 주므로
// 다시 누르는 것 자체는 싸다("다시 추천"만 LLM 을 새로 부른다).
//
// "먹은 메뉴 기록"은 앱과 같이 추천을 draft 로 옮겨 입력 화면으로 보낸다. 실제 추천↔기록 연결
// (`logged`)은 저장이 성공할 때 서버가 만든다.

export const MealRecommendTab = () => {
  const now = new Date();
  const navigate = useNavigate();
  const draftReady = useMealDraftReady();
  const [slot, setSlot] = useState<MealSlotType>(() => guessMealSlot(new Date()));
  // undefined = 사용자가 아직 고르지 않음(설정의 첫 식사 유형을 기본값으로 사용),
  // null = 사용자가 명시적으로 "상황 무관"을 고른 상태.
  const [mealType, setMealType] = useState<MealTypeType | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState<MealRecommendationType | null>(null);
  // 사용자가 '최근 추천' 목록에서 예전 추천을 골라 보는 중인지 — 새로 받거나 '최신 추천으로'를 누르면 풀린다.
  // 같은 날·끼니 재요청으로 캐시된 예전 추천이 돌아온 경우는 지금 요청한 것이라 지난 추천으로 보지 않는다.
  const [browsing, setBrowsing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const ctx = useMealRecommendationContext();
  const airLocation = useAirLocation();
  const history = useMealRecommendations(5);
  const create = useCreateMealRecommendation();
  const feedback = useMealRecommendationFeedback();
  const recommendationEvent = useMealRecommendationEvent();
  const shownEventIds = useRef(new Set<string>());

  const today = toLocalDateKey(now);
  const shown = current ?? ctx.data?.latest ?? null;
  // 최근 추천(최신순)의 맨 앞 = 가장 최근에 받은 추천.
  const newest = history.data?.items[0] ?? null;
  const viewingPast = browsing && shown !== null && newest !== null && shown.id !== newest.id;
  const configuredSlots = ctx.data?.preference.slots?.length
    ? ctx.data.preference.slots
    : MEAL_SLOTS;
  const configuredMealTypes = ctx.data?.preference.mealTypes?.length
    ? ctx.data.preference.mealTypes
    : MEAL_TYPES;
  const effectiveSlot = configuredSlots.includes(slot) ? slot : configuredSlots[0]!;
  const effectiveMealType =
    mealType === undefined ? (ctx.data?.preference.mealTypes?.[0] ?? null) : mealType;

  useEffect(() => {
    // 노출은 새로 받은(또는 화면 진입 때 보인) 추천만 — 목록에서 예전 추천을 다시 여는 건 새 노출이 아니다.
    if (!shown || viewingPast || shownEventIds.current.has(shown.id)) return;
    shownEventIds.current.add(shown.id);
    recommendationEvent.mutate(
      { id: shown.id, input: { kind: 'shown', platform: 'web' } },
      { onError: () => shownEventIds.current.delete(shown.id) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.id, viewingPast]);

  // 목록에서 고르면 위의 추천 카드가 바뀐다 — 바뀐 걸 보이게 카드로 스크롤한다(목록은 그대로 둔다).
  const openFromHistory = (rec: MealRecommendationType) => {
    setCurrent(rec);
    setBrowsing(rec.id !== newest?.id);
    cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const backToLatest = () => {
    if (!newest) return;
    setCurrent(newest);
    setBrowsing(false);
  };

  const request = (force: boolean) => {
    create.mutate(
      {
        targetDate: toLocalDateKey(now),
        targetSlot: effectiveSlot,
        mealType: effectiveMealType,
        note: note.trim() ? note.trim() : null,
        lat: airLocation.location?.lat ?? null,
        lng: airLocation.location?.lng ?? null,
        force,
      },
      {
        onSuccess: (rec) => {
          setCurrent(rec);
          setBrowsing(false);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">다음 끼니 추천</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">끼니</p>
            <div className="flex flex-wrap gap-2">
              {configuredSlots.map((s) => (
                <Chip
                  key={s}
                  label={MEAL_SLOT_LABEL[s]}
                  selected={effectiveSlot === s}
                  onClick={() => setSlot(s)}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">상황</p>
            <div className="flex flex-wrap gap-2">
              {configuredMealTypes.map((t) => (
                <Chip
                  key={t}
                  label={MEAL_TYPE_LABEL[t]}
                  selected={effectiveMealType === t}
                  onClick={() => setMealType(effectiveMealType === t ? null : t)}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {airLocation.location
              ? `저장된 위치(${airLocation.location.label ?? '내 위치'})의 실시간 날씨를 추천에 반영해요.`
              : '날씨 탭에서 내 위치를 저장하면 실시간 날씨도 추천에 반영해요.'}
          </p>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">한 마디 (선택)</p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 가볍게 / 국물 있는 걸로"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              maxLength={120}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => request(false)} disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1 size-4" />
              )}
              추천받기
            </Button>
            {/* 지난 추천을 보는 중엔 숨긴다 — 그 추천을 다시 만드는 게 아니라 위에서 고른 끼니로 새로 받기 때문. */}
            {shown && !viewingPast ? (
              <Button variant="outline" onClick={() => request(true)} disabled={create.isPending}>
                <RefreshCw className="mr-1 size-4" />
                다시 추천
              </Button>
            ) : null}
          </div>
          {create.error ? (
            <p className="text-sm text-destructive">
              {create.error instanceof Error ? create.error.message : '추천을 받지 못했어요.'}
            </p>
          ) : null}
          {ctx.data && ctx.data.entryCount === 0 ? (
            <p className="text-xs text-muted-foreground">
              아직 기록이 없어요. 몇 끼만 남기면 추천이 훨씬 정확해져요.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div ref={cardRef} className="scroll-mt-20">
        {shown ? (
          <RecommendationCard
            rec={shown}
            pastLabel={viewingPast ? recommendationWhenLabel(shown, today) : null}
            onBackToLatest={backToLatest}
            lat={airLocation.location?.lat ?? null}
            lng={airLocation.location?.lng ?? null}
            onFeedback={(input) =>
              feedback.mutate(
                { id: shown.id, input },
                { onSuccess: (recommendation) => setCurrent(recommendation) },
              )
            }
            allergyFilteringEnabled={(ctx.data?.preference.allergens?.length ?? 0) > 0}
            // draft 복원 전(새로고침 직후)에 옮기면 입력 화면에서 사라지므로 그동안은 막는다.
            onRecord={
              draftReady
                ? (name) => {
                    startMealDraftFromRecommendation(shown, name, effectiveMealType);
                    navigate('/me/meals/new');
                  }
                : null
            }
            onCandidateRating={(name, rank, rating) => {
              const item = shown.items[rank];
              recommendationEvent.mutate(
                {
                  id: shown.id,
                  input: {
                    kind: 'candidate_rated',
                    candidateName: name,
                    candidateFoodId: item?.foodId ?? null,
                    candidateRank: rank,
                    rating,
                    platform: 'web',
                  },
                },
                {
                  onSuccess: () =>
                    setCurrent({
                      ...shown,
                      candidateRatings: [
                        ...(shown.candidateRatings ?? []).filter(
                          (candidate) => candidate.name !== name,
                        ),
                        { name, rating },
                      ],
                    }),
                },
              );
            }}
            onRestaurantOpened={(name, rank) => {
              const item = shown.items[rank];
              recommendationEvent.mutate({
                id: shown.id,
                input: {
                  kind: 'restaurant_opened',
                  candidateName: name,
                  candidateFoodId: item?.foodId ?? null,
                  candidateRank: rank,
                  platform: 'web',
                },
              });
            }}
          />
        ) : null}
      </div>

      {/* 목록은 늘 최신순 그대로 — 보고 있는 추천을 목록에서 빼면 누를 때마다 줄이 빠지고 끼어들어 헷갈렸다
          (2026-10-04). 보고 있는 줄만 강조한다. */}
      {(history.data?.items.length ?? 0) > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">최근 추천</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {history.data!.items.map((r) => {
              const active = r.id === shown?.id;
              const progress = recommendationProgressLabel(r);
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => openFromHistory(r)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                    active ? 'bg-accent' : 'hover:bg-accent',
                  )}
                >
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground">
                      {recommendationWhenLabel(r, today)}
                    </span>
                    {' · '}
                    {recommendationHistoryFoods(r)}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {r.feedback?.rating === 1 ? (
                      <ThumbsUp className="size-3.5 text-primary" />
                    ) : null}
                    {active ? <span className="font-medium text-primary">보는 중</span> : progress}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

const RecommendationCard = ({
  rec,
  pastLabel,
  onBackToLatest,
  lat,
  lng,
  onFeedback,
  onRecord,
  onCandidateRating,
  onRestaurantOpened,
  allergyFilteringEnabled,
}: {
  rec: MealRecommendationType;
  /** 목록에서 고른 예전 추천이면 '오늘 점심 · 12:30' — 최신 추천과 헷갈리지 않게 머리에 밝힌다. */
  pastLabel: string | null;
  onBackToLatest: () => void;
  lat: number | null;
  lng: number | null;
  onFeedback: (input: { rating?: -1 | 1 | null; pickedName?: string | null }) => void;
  onRecord: ((name: string) => void) | null;
  onCandidateRating: (name: string, rank: number, rating: -1 | 1) => void;
  onRestaurantOpened: (name: string, rank: number) => void;
  allergyFilteringEnabled: boolean;
}) => (
  <Card>
    <CardHeader className="space-y-1">
      {pastLabel ? (
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-xs">
          <span>
            <span className="font-medium">지난 추천</span> · {pastLabel}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onBackToLatest}>
            최신 추천으로
          </Button>
        </div>
      ) : null}
      <CardTitle className="text-base">
        {rec.targetDate} {MEAL_SLOT_LABEL[rec.targetSlot]} 추천
      </CardTitle>
      {rec.summary ? <p className="text-sm text-muted-foreground">{rec.summary}</p> : null}
      {/* 추천 하나는 기록 하나로만 이어진다(서버가 두 번째 연결을 거부) — 이어졌으면 기록으로 보낸다. */}
      {rec.feedback?.eatenEntryId ? (
        <p className="text-xs text-muted-foreground">
          이 추천은 식단 기록으로 이어졌어요 ·{' '}
          <Link
            to={`/me/meals/${rec.feedback.eatenEntryId}`}
            className="text-primary hover:underline"
          >
            기록 보기
          </Link>
        </p>
      ) : null}
      {rec.notice ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">{rec.notice}</p>
      ) : null}
      {rec.status === 'fallback' ? (
        <p className="text-xs text-muted-foreground">AI 없이 기록 점수만으로 골랐어요.</p>
      ) : null}
      {allergyFilteringEnabled ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          알레르기 필터는 알려진 정보만 확인합니다. 원재료와 교차접촉 여부를 반드시 다시 확인하세요.
        </p>
      ) : null}
    </CardHeader>
    <CardContent className="space-y-3">
      {rec.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">추천할 음식을 찾지 못했어요.</p>
      ) : (
        rec.items.map((item, rank) => (
          <div key={item.name} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{item.name}</span>
              {item.dishType ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {FOOD_DISH_TYPE_LABEL[item.dishType]}
                </span>
              ) : null}
              {item.cuisine ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {FOOD_CUISINE_LABEL[item.cuisine]}
                </span>
              ) : null}
              {item.lastEatenDate ? (
                <span className="text-xs text-muted-foreground">
                  마지막 {item.lastEatenDate.slice(5)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">안 먹어봄</span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
            {(item.ingredients?.length ?? 0) > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                주재료 {item.ingredients.join(', ')}
              </p>
            ) : null}
            {(item.allergenWarnings?.length ?? 0) > 0 ? (
              <p className="mt-1 text-xs text-destructive">
                알레르기 가능 정보{' '}
                {item.allergenWarnings.map((value) => MEAL_ALLERGEN_LABEL[value]).join(', ')}
              </p>
            ) : item.allergenAssessment === 'unknown' && allergyFilteringEnabled ? (
              <p className="mt-1 text-xs text-destructive">알레르기 원재료 정보 부족</p>
            ) : null}
            {item.nutritionBasis === 'donor_estimate' ? (
              <p className="mt-1 text-xs text-muted-foreground">
                영양은 {item.nutritionFrom ?? '유사 음식'} 기준 추정
              </p>
            ) : item.nutritionBasis === 'missing' ? (
              <p className="mt-1 text-xs text-muted-foreground">영양 근거 없음</p>
            ) : null}
            {(item.tags?.length ?? 0) > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFeedback({ pickedName: item.name })}
                className={cn(rec.feedback?.pickedName === item.name && 'text-primary')}
              >
                이걸로 할래요
              </Button>
              {rec.feedback?.eatenEntryId ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${item.name} 먹은 메뉴로 기록`}
                  disabled={!onRecord}
                  onClick={() => onRecord?.(item.name)}
                >
                  <NotebookPen className="size-3.5" />
                  먹은 메뉴 기록
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${item.name} 좋아요`}
                onClick={() => onCandidateRating(item.name, rank, 1)}
                className={cn(
                  rec.candidateRatings?.find((candidate) => candidate.name === item.name)
                    ?.rating === 1 && 'text-primary',
                )}
              >
                <ThumbsUp className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${item.name} 별로예요`}
                onClick={() => onCandidateRating(item.name, rank, -1)}
                className={cn(
                  rec.candidateRatings?.find((candidate) => candidate.name === item.name)
                    ?.rating === -1 && 'text-destructive',
                )}
              >
                <ThumbsDown className="size-3.5" />
              </Button>
              <FoodRestaurantMatches
                foodId={item.foodId}
                foodName={item.name}
                lat={lat}
                lng={lng}
                onOpened={() => onRestaurantOpened(item.name, rank)}
              />
            </div>
          </div>
        ))
      )}
      <div className="flex items-center gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">이 추천 어땠나요?</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="추천이 좋아요"
          onClick={() => onFeedback({ rating: rec.feedback?.rating === 1 ? null : 1 })}
          className={cn(rec.feedback?.rating === 1 && 'text-primary')}
        >
          <ThumbsUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="추천이 별로예요"
          onClick={() => onFeedback({ rating: rec.feedback?.rating === -1 ? null : -1 })}
          className={cn(rec.feedback?.rating === -1 && 'text-destructive')}
        >
          <ThumbsDown className="size-4" />
        </Button>
      </div>
    </CardContent>
  </Card>
);

const FoodRestaurantMatches = ({
  foodId,
  foodName,
  lat,
  lng,
  onOpened,
}: {
  foodId: string | null;
  foodName: string;
  lat: number | null;
  lng: number | null;
  onOpened: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const matches = useFoodRestaurants(
    foodId ?? '',
    {
      ...(lat !== null && lng !== null ? { lat, lng, radiusM: 5_000 } : {}),
      limit: 5,
    },
    { enabled: open && !!foodId },
  );

  if (!foodId) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/restaurants-v2?q=${encodeURIComponent(foodName)}`} onClick={onOpened}>
          <Search className="mr-1 size-3.5" />
          이름으로 식당 검색
        </Link>
      </Button>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (!open) onOpened();
          setOpen((value) => !value);
        }}
        aria-expanded={open}
      >
        <Search className="mr-1 size-3.5" />
        {open ? '파는 곳 접기' : '파는 곳 보기'}
      </Button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2">
          {matches.isLoading ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> 식당을 찾는 중…
            </p>
          ) : matches.isError ? (
            <button
              type="button"
              onClick={() => void matches.refetch()}
              className="text-xs text-destructive"
            >
              불러오지 못했어요 · 다시 시도
            </button>
          ) : matches.data?.items.length ? (
            <>
              {matches.data.items.map((restaurant) => (
                <Link
                  key={restaurant.placeId}
                  to={`/restaurants-v2/${restaurant.placeId}`}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{restaurant.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        restaurant.distanceM !== null ? formatDistance(restaurant.distanceM) : null,
                        restaurant.category,
                        restaurant.mentionCount > 0
                          ? `리뷰 언급 ${restaurant.mentionCount}`
                          : '메뉴 확인',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-primary">상세</span>
                </Link>
              ))}
              <p className="text-[11px] leading-4 text-muted-foreground">{matches.data.notice}</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {lat !== null && lng !== null
                ? '반경 5km 안에서 연결된 식당을 찾지 못했어요.'
                : '수집된 메뉴·리뷰에서 연결된 식당을 찾지 못했어요.'}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};

const formatDistance = (distanceM: number): string =>
  distanceM < 1_000 ? `${distanceM}m` : `${(distanceM / 1_000).toFixed(1)}km`;

const Chip = ({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={cn(
      'rounded-full border px-3 py-1.5 text-sm transition-colors',
      selected ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
    )}
  >
    {label}
  </button>
);
