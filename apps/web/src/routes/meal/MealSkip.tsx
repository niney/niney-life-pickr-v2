import { useId, useState } from 'react';
import { MEAL_SKIPPABLE_SLOTS, type MealSkipSlotType, type MealSlotType } from '@repo/api-contract';
import { useClearMealSkip, useMealCalendar, useMealSkips, useSetMealSkip } from '@repo/shared';
import { MEAL_SLOT_LABEL, dateKeyRange, isCountedMealDay, mealDateTitle, toLocalDateKey } from '@repo/utils';

// 끼니 '안 먹음'(2026-11-08) — 빈 칸이 '안 적음'인지 '안 먹음'인지 가린다. 한 끼만 적힌 날은 영양 평균에서 빠지는데(나머지를 안
// 적었을 공산이 커서), 남은 끼니를 모두 '안 먹음'으로 표시하면 그날 먹은 전부라 평균에 든다(@repo/utils isCountedMealDay — 서버와
// 같은 규칙, 11-09 부터 하나만 표시해서는 안 든다). 그래서 묻는 곳을 '평균에서 빠지는 날'로 좁힌다 — 아침을 늘 거르는 사람에게
// 매일 묻지 않게. 하나를 표시한 뒤에도 남은 끼니를 계속 묻는다.

const SKIP_HINT = '남은 끼니를 모두 기록하거나 ‘안 먹음’으로 표시하면 들어가요.';

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
 * 그날 기록이 없는 아침·점심·저녁 줄 — 비어 있으면 [기록하기] [안 먹음], 표시했으면 '안 먹음' [취소]. 홈 묻기와 영양 탭 정리가
 * 같이 쓴다. onChanged 는 표시·취소가 끝난 뒤 — 그날이 평균에 들어도 바로 고칠 수 있게 자리를 남기는 데 쓴다.
 */
const SkipSlotRows = ({
  date,
  skipped,
  missing,
  onRecord,
  onChanged,
}: {
  date: string;
  skipped: readonly MealSkipSlotType[];
  missing: readonly MealSkipSlotType[];
  onRecord: (slot: MealSkipSlotType) => void;
  onChanged: () => void;
}) => {
  const set = useSetMealSkip();
  const clear = useClearMealSkip();
  const busy = set.isPending || clear.isPending;
  const open = MEAL_SKIPPABLE_SLOTS.filter((s) => skipped.includes(s) || missing.includes(s));
  return (
    <>
      <ul className="meal-skip-slots">
        {open.map((slot) =>
          skipped.includes(slot) ? (
            <li key={slot}>
              <span className="meal-skip-slot">{MEAL_SLOT_LABEL[slot]}</span>
              <span className="text-muted-foreground">안 먹음</span>
              <button
                type="button"
                className="meal-btn-quiet"
                disabled={busy}
                aria-label={`${MEAL_SLOT_LABEL[slot]} 안 먹음 취소`}
                onClick={() => clear.mutate({ date, slot }, { onSuccess: onChanged })}
              >
                취소
              </button>
            </li>
          ) : (
            <li key={slot}>
              <span className="meal-skip-slot">{MEAL_SLOT_LABEL[slot]}</span>
              <button type="button" className="meal-opt meal-opt-sm" onClick={() => onRecord(slot)}>
                기록하기
              </button>
              <button
                type="button"
                className="meal-opt meal-opt-sm"
                disabled={busy}
                onClick={() => set.mutate({ date, slot }, { onSuccess: onChanged })}
              >
                안 먹음
              </button>
            </li>
          ),
        )}
      </ul>
      {set.isError ? <p className="text-sm meal-over">표시하지 못했어요. 다시 눌러 주세요.</p> : null}
      {clear.isError ? <p className="text-sm meal-over">취소하지 못했어요. 다시 눌러 주세요.</p> : null}
    </>
  );
};

/**
 * 홈 — 어제가 한 끼만 적혀 평균에서 빠지면 기록이 없는 아침·점심·저녁마다 [기록하기] [안 먹음], 이미 표시한 끼니는 [취소].
 * 하나를 표시해도 남은 끼니가 있으면 계속 묻고, 다 채워 평균에 들면 그 사실과 취소 단추를 남긴다(이 화면에서 바꾼 경우만 —
 * 실수를 바로 고칠 곳. 다시 열면 평균에 든 날이라 묻지 않는다).
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
  const [touched, setTouched] = useState(false);
  if (meals === 0 || !skips.data) return null;
  const { skipped, missing, counted } = dayState(
    recorded,
    skips.data.skips.filter((s) => s.date === date).map((s) => s.slot),
    meals,
  );
  if (counted && !touched) return null;
  return (
    <section
      className="meal-note meal-note-block meal-skip-nudge"
      data-tone={counted ? 'ok' : 'warn'}
      aria-label="어제 빈 끼니"
    >
      {counted ? (
        <p className="font-bold">어제도 영양 평균에 들어가요.</p>
      ) : (
        <>
          <p className="font-bold">어제는 {labelsOf(recorded)}만 적혀 있어 영양 평균에서 빠져요.</p>
          <p className="text-sm text-muted-foreground">{SKIP_HINT}</p>
        </>
      )}
      <SkipSlotRows
        date={date}
        skipped={skipped}
        missing={missing}
        onRecord={onRecord}
        onChanged={() => setTouched(true)}
      />
    </section>
  );
};

const yesterdayKey = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateKey(d);
};

/**
 * 영양 탭 — 점검 기간 중 한 끼만 적혀 평균에서 빠진 지난날을 모아 그 자리에서 정리한다(기록 목록을 날마다 찾아가지 않게, 2026-11-09).
 * 끼니 칸은 달력 조회로, 표시는 '안 먹음' 조회로 보고 서버와 같은 규칙(isCountedMealDay)으로 가린다. 오늘은 아직 지나지 않은
 * 끼니가 있어 뺀다. 접어 둔 채 날 수만 보이고, 펼치면 최근 날부터. 이 자리에서 고친 날은 평균에 들어도 남긴다(바로 되돌릴 수 있게).
 */
export const MealSkipReview = ({
  from,
  to,
  onRecord,
}: {
  /** 점검 기간 — 서버 응답의 from~to. */
  from: string;
  to: string;
  onRecord: (date: string, slot: MealSkipSlotType) => void;
}) => {
  const today = toLocalDateKey(new Date());
  const last = to < today ? to : yesterdayKey();
  const fromMonth = from.slice(0, 7);
  const lastMonth = last.slice(0, 7);
  const ranged = from <= last;
  // 점검 기간은 최대 28일이라 달력은 두 달까지.
  const calFrom = useMealCalendar(fromMonth, ranged);
  const calLast = useMealCalendar(lastMonth, ranged && lastMonth !== fromMonth);
  const skips = useMealSkips(from, last, ranged);
  const [expanded, setExpanded] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const bodyId = useId();
  const lastDays = lastMonth !== fromMonth ? calLast.data?.days : [];
  if (!ranged || !calFrom.data || !lastDays || !skips.data) return null;

  const byDate = new Map([...calFrom.data.days, ...lastDays].map((d) => [d.date, d]));
  const skipsOn = new Map<string, MealSkipSlotType[]>();
  for (const s of skips.data.skips) skipsOn.set(s.date, [...(skipsOn.get(s.date) ?? []), s.slot]);
  const list = dateKeyRange(from, last)
    .reverse()
    .flatMap((date) => {
      const cal = byDate.get(date);
      if (!cal || cal.count === 0) return [];
      const state = dayState(cal.slots, skipsOn.get(date) ?? [], cal.count);
      return state.counted && !touched.has(date) ? [] : [{ date, recorded: cal.slots, ...state }];
    });
  if (list.length === 0) return null;
  const pending = list.filter((d) => !d.counted).length;

  return (
    <section className="meal-skip-review" aria-label="평균에서 빠진 날">
      <div className="meal-skip-review-head">
        <p className="text-sm">
          {pending > 0 ? (
            <>
              한 끼만 적혀 평균에서 빠진 날 <b>{pending}일</b>
            </>
          ) : (
            '빠진 날을 모두 정리했어요.'
          )}
        </p>
        <button
          type="button"
          className="meal-btn-line"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '접기' : '정리하기'}
        </button>
      </div>
      {expanded ? (
        <div id={bodyId} className="meal-skip-review-body">
          <p className="text-xs text-muted-foreground">{SKIP_HINT} 기억나지 않는 날은 그대로 두세요.</p>
          <ul className="meal-skip-review-days">
            {list.map((d) => (
              <li key={d.date}>
                <p className="text-sm">
                  <b>{mealDateTitle(d.date, today)}</b>{' '}
                  <span className="text-muted-foreground">
                    · {d.counted ? '평균에 들어가요' : `${labelsOf(d.recorded)}만 적힘`}
                  </span>
                </p>
                <SkipSlotRows
                  date={d.date}
                  skipped={d.skipped}
                  missing={d.missing}
                  onRecord={(slot) => onRecord(d.date, slot)}
                  onChanged={() => setTouched((t) => new Set(t).add(d.date))}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

/**
 * 기록 목록의 날짜 묶음 아래 — 그날의 '안 먹음'(취소할 수 있게)과, 지난날이 한 끼만 적혀 평균에서 빠지면 남은 끼니마다 '안 먹음'
 * (하나를 표시해도 남은 끼니가 있으면 계속 묻는다). 오늘은 아직 지나지 않은 끼니가 있어 묻지 않는다.
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
          <p className="text-sm text-muted-foreground">한 끼만 적혀 영양 평균에서 빠져요. {SKIP_HINT}</p>
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
