import { useState } from 'react';
import { Loader2, RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { MealRecommendationType, MealSlotType, MealTypeType } from '@repo/api-contract';
import {
  useCreateMealRecommendation,
  useMealRecommendationContext,
  useMealRecommendationFeedback,
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

// 다음 끼니 추천 — 끼니·상황을 고르고 받는다. 서버가 같은 날·끼니·프로필이면 캐시를 주므로
// 다시 누르는 것 자체는 싸다("다시 추천"만 LLM 을 새로 부른다).

export const MealRecommendTab = () => {
  const now = new Date();
  const [slot, setSlot] = useState<MealSlotType>(() => guessMealSlot(new Date()));
  const [mealType, setMealType] = useState<MealTypeType | null>(null);
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState<MealRecommendationType | null>(null);

  const ctx = useMealRecommendationContext();
  const history = useMealRecommendations(5);
  const create = useCreateMealRecommendation();
  const feedback = useMealRecommendationFeedback();

  const shown = current ?? ctx.data?.latest ?? null;

  const request = (force: boolean) => {
    create.mutate(
      {
        targetDate: toLocalDateKey(now),
        targetSlot: slot,
        mealType,
        note: note.trim() ? note.trim() : null,
        force,
      },
      { onSuccess: (rec) => setCurrent(rec) },
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
              {MEAL_SLOTS.map((s) => (
                <Chip key={s} label={MEAL_SLOT_LABEL[s]} selected={slot === s} onClick={() => setSlot(s)} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">상황</p>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((t) => (
                <Chip
                  key={t}
                  label={MEAL_TYPE_LABEL[t]}
                  selected={mealType === t}
                  onClick={() => setMealType(mealType === t ? null : t)}
                />
              ))}
            </div>
          </div>
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
              {create.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Sparkles className="mr-1 size-4" />}
              추천받기
            </Button>
            {shown ? (
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
              아직 기록이 없어요. 앱에서 몇 끼만 남기면 추천이 훨씬 정확해져요.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {shown ? <RecommendationCard rec={shown} onFeedback={(input) => feedback.mutate({ id: shown.id, input })} /> : null}

      {(history.data?.items.length ?? 0) > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">지난 추천</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.data!.items
              .filter((r) => r.id !== shown?.id)
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setCurrent(r)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span className="truncate">
                    {r.targetDate} {MEAL_SLOT_LABEL[r.targetSlot]} · {r.items.map((i) => i.name).join(', ')}
                  </span>
                  {r.feedback?.rating === 1 ? <ThumbsUp className="size-3.5 shrink-0 text-primary" /> : null}
                </button>
              ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

const RecommendationCard = ({
  rec,
  onFeedback,
}: {
  rec: MealRecommendationType;
  onFeedback: (input: { rating?: number | null; pickedName?: string | null }) => void;
}) => (
  <Card>
    <CardHeader className="space-y-1">
      <CardTitle className="text-base">
        {rec.targetDate} {MEAL_SLOT_LABEL[rec.targetSlot]} 추천
      </CardTitle>
      {rec.summary ? <p className="text-sm text-muted-foreground">{rec.summary}</p> : null}
      {rec.notice ? <p className="text-xs text-amber-600 dark:text-amber-500">{rec.notice}</p> : null}
      {rec.status === 'fallback' ? (
        <p className="text-xs text-muted-foreground">AI 없이 기록 점수만으로 골랐어요.</p>
      ) : null}
    </CardHeader>
    <CardContent className="space-y-3">
      {rec.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">추천할 음식을 찾지 못했어요.</p>
      ) : (
        rec.items.map((item) => (
          <div key={item.name} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{item.name}</span>
              {item.dishType ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{FOOD_DISH_TYPE_LABEL[item.dishType]}</span>
              ) : null}
              {item.cuisine ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{FOOD_CUISINE_LABEL[item.cuisine]}</span>
              ) : null}
              {item.lastEatenDate ? (
                <span className="text-xs text-muted-foreground">마지막 {item.lastEatenDate.slice(5)}</span>
              ) : (
                <span className="text-xs text-muted-foreground">안 먹어봄</span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
            {item.tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.tags.map((t) => (
                  <span key={t} className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFeedback({ pickedName: item.name })}
                className={cn(rec.feedback?.pickedName === item.name && 'text-primary')}
              >
                이걸로 할래요
              </Button>
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

const Chip = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
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
