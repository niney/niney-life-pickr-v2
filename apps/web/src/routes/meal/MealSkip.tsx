import { useState } from 'react';
import { MEAL_SKIPPABLE_SLOTS, type MealSkipSlotType, type MealSlotType } from '@repo/api-contract';
import { useClearMealSkip, useMealSkips, useSetMealSkip } from '@repo/shared';
import { MEAL_SLOT_LABEL, isCountedMealDay } from '@repo/utils';

// 끼니 '안 먹음'(2026-11-08) — 빈 칸이 '안 적음'인지 '안 먹음'인지 가린다. 한 끼만 적힌 날은 영양 평균에서 빠지는데(나머지를 안
// 적었을 공산이 커서), 나머지 끼니를 '안 먹음'으로 표시하면 그날 먹은 전부라 평균에 든다(@repo/utils isCountedMealDay — 서버와
// 같은 규칙). 그래서 묻는 곳을 '평균에서 빠지는 날'로 좁힌다 — 아침을 늘 거르는 사람에게 매일 묻지 않게.

const labelsOf = (slots: readonly MealSlotType[]): string =>
  [...new Set(slots)].map((s) => MEAL_SLOT_LABEL[s]).join('·');

/** 그날 기록이 없는 끼니에 붙은 '안 먹음'(기록이 이긴다)과, 아직 비어 있는 아침·점심·저녁. */
const dayState = (recorded: readonly MealSlotType[], skips: readonly MealSkipSlotType[], meals: number) => {
  const has = new Set<string>(recorded);
  const skipped = skips.filter((s) => !has.has(s));
  const missing = MEAL_SKIPPABLE_SLOTS.filter((s) => !has.has(s) && !skipped.includes(s));
  return { skipped, missing, counted: isCountedMealDay(meals, skipped.length) };
};

/**
 * 홈 — 어제가 한 끼만 적혀 평균에서 빠지면 빈 끼니마다 [기록하기] [안 먹음]. 안 먹음을 누르면 그 자리에 되돌리기를 남긴다
 * (표시 뒤 그날이 평균에 들면 묻기는 사라지니, 실수를 바로 고칠 곳이 필요하다).
 */
export const MealSkipNudge = ({
  date,
  meals,
  recorded,
  onRecord,
}: {
  /** 어제 'YYYY-MM-DD'. */
  date: string;
  /** 그날 기록한 끼니 수. */
  meals: number;
  /** 그날 기록한 끼니 칸. */
  recorded: readonly MealSlotType[];
  onRecord: (slot: MealSkipSlotType) => void;
}) => {
  const skips = useMealSkips(date, date, meals > 0);
  const set = useSetMealSkip();
  const clear = useClearMealSkip();
  const [marked, setMarked] = useState<MealSkipSlotType | null>(null);
  if (meals === 0 || !skips.data) return null;
  const { missing, counted } = dayState(
    recorded,
    skips.data.skips.filter((s) => s.date === date).map((s) => s.slot),
    meals,
  );

  if (marked) {
    return (
      <section className="meal-note meal-skip-nudge" data-tone="ok" aria-label="어제 빈 끼니">
        <span>
          어제 {MEAL_SLOT_LABEL[marked]}을 안 먹음으로 표시했어요.
          {counted ? ' 어제도 영양 평균에 들어가요.' : ''}
        </span>
        <button
          type="button"
          className="meal-note-action"
          disabled={clear.isPending}
          onClick={() => clear.mutate({ date, slot: marked }, { onSuccess: () => setMarked(null) })}
        >
          되돌리기
        </button>
      </section>
    );
  }
  if (counted || missing.length === 0) return null;
  return (
    <section className="meal-note meal-note-block meal-skip-nudge" data-tone="warn" aria-label="어제 빈 끼니">
      <p className="font-bold">어제는 {labelsOf(recorded)}만 적혀 있어 영양 평균에서 빠져요.</p>
      <p className="text-sm text-muted-foreground">빈 끼니를 기록하거나, 안 먹었으면 ‘안 먹음’으로 표시해 주세요.</p>
      <ul className="meal-skip-slots">
        {missing.map((slot) => (
          <li key={slot}>
            <span className="meal-skip-slot">{MEAL_SLOT_LABEL[slot]}</span>
            <button type="button" className="meal-opt meal-opt-sm" onClick={() => onRecord(slot)}>
              기록하기
            </button>
            <button
              type="button"
              className="meal-opt meal-opt-sm"
              disabled={set.isPending}
              onClick={() => set.mutate({ date, slot }, { onSuccess: () => setMarked(slot) })}
            >
              안 먹음
            </button>
          </li>
        ))}
      </ul>
      {set.isError ? <p className="text-sm meal-over">표시하지 못했어요. 다시 눌러 주세요.</p> : null}
    </section>
  );
};

/**
 * 기록 목록의 날짜 묶음 아래 — 그날의 '안 먹음'(취소할 수 있게)과, 지난날이 한 끼만 적혀 평균에서 빠지면 빈 끼니마다 '안 먹음'.
 * 오늘은 아직 지나지 않은 끼니가 있어 묻지 않는다.
 */
export const MealDaySkips = ({
  date,
  past,
  meals,
  recorded,
  skips,
}: {
  date: string;
  /** 오늘보다 앞선 날인지 — 묻기는 지난날만. */
  past: boolean;
  meals: number;
  recorded: readonly MealSlotType[];
  /** 그날의 '안 먹음' 끼니. */
  skips: readonly MealSkipSlotType[];
}) => {
  const set = useSetMealSkip();
  const clear = useClearMealSkip();
  const { skipped, missing, counted } = dayState(recorded, skips, meals);
  const ask = past && !counted && missing.length > 0;
  if (skipped.length === 0 && !ask) return null;
  const busy = set.isPending || clear.isPending;
  return (
    <div className="meal-day-skips">
      {skipped.map((slot) => (
        <p key={slot} className="meal-day-skip">
          <span className="font-bold">{MEAL_SLOT_LABEL[slot]}</span>
          <span className="text-muted-foreground">안 먹음</span>
          <button
            type="button"
            className="meal-btn-quiet"
            disabled={busy}
            aria-label={`${MEAL_SLOT_LABEL[slot]} 안 먹음 취소`}
            onClick={() => clear.mutate({ date, slot })}
          >
            취소
          </button>
        </p>
      ))}
      {ask ? (
        <div className="meal-day-skip-ask">
          <p className="text-sm text-muted-foreground">
            한 끼만 적혀 영양 평균에서 빠져요. 안 먹은 끼니가 있으면 표시해 주세요.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((slot) => (
              <button
                key={slot}
                type="button"
                className="meal-opt meal-opt-sm"
                disabled={busy}
                onClick={() => set.mutate({ date, slot })}
              >
                {MEAL_SLOT_LABEL[slot]} 안 먹음
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
