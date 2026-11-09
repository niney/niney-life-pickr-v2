import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MEAL_SKIPPABLE_SLOTS,
  type MealSkipSlotType,
  type MealSkipType,
  type MealSlotType,
} from '@repo/api-contract';
import {
  useBatchMealSkips,
  useClearMealSkip,
  useMealCalendar,
  useMealSkips,
  useSetMealSkip,
} from '@repo/shared';
import { MEAL_SLOT_LABEL, dateKeyRange, isCountedMealDay, mealDateTitle, toLocalDateKey } from '@repo/utils';
import { MEAL_PATH } from './mealPaths';

// 끼니 '안 먹음'(2026-11-08) — 빈 칸이 '안 적음'인지 '안 먹음'인지 가린다. 한 끼만 적힌 날은 영양 평균에서 빠지는데(나머지를 안
// 적었을 공산이 커서), 남은 끼니를 모두 '안 먹음'으로 표시하면 그날 먹은 전부라 평균에 든다(@repo/utils isCountedMealDay — 서버와
// 같은 규칙, 11-09 부터 하나만 표시해서는 안 든다). 그래서 묻는 곳을 '평균에서 빠지는 날'로 좁힌다 — 아침을 늘 거르는 사람에게
// 매일 묻지 않게. 하나를 표시한 뒤에도 남은 끼니를 계속 묻는다.
// 한 번에 처리(2026-11-09 — 설정 대신): 하루짜리(홈 어제 묻기·기록 목록)는 남은 끼니가 둘 이상이면 [남은 끼니 모두 안 먹음], 여러
// 날은 영양 탭 '빠진 날 정리'의 체크 목록 — 빈 끼니를 모두 체크해 두고 아닌 것만 풀어 한 번에 표시한다(되돌리기는 방금 표시한 칸만).
// 홈은 지난 2주에 그런 날이 둘 이상이면 그 목록으로 가는 한 줄을 띄운다.

const SKIP_HINT = '남은 끼니를 모두 기록하거나 ‘안 먹음’으로 표시하면 들어가요.';
const SKIP_ALL = '남은 끼니 모두 안 먹음';
const MARK_ERROR = '표시하지 못했어요. 다시 눌러 주세요.';

/** 영양 탭 '빠진 날 정리'를 펼친 채 여는 주소(홈의 '한 번에 정리'). */
export const MEAL_SKIP_REVIEW_PATH = `${MEAL_PATH.nutrition}?skips=open`;

const skipsOf = (date: string, slots: readonly MealSkipSlotType[]): MealSkipType[] => slots.map((slot) => ({ date, slot }));
const keyOf = (s: MealSkipType): string => `${s.date}|${s.slot}`;

const labelsOf = (slots: readonly MealSlotType[]): string =>
  [...new Set(slots)].map((s) => MEAL_SLOT_LABEL[s]).join('·');

const daysAgoKey = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalDateKey(d);
};

/** 그날 기록이 없는 끼니에 붙은 '안 먹음'(기록이 이긴다)과, 아직 비어 있는 아침·점심·저녁. */
const dayState = (recorded: readonly MealSlotType[], skips: readonly MealSkipSlotType[], meals: number) => {
  const has = new Set<string>(recorded);
  const skipped = skips.filter((s) => !has.has(s));
  const missing = MEAL_SKIPPABLE_SLOTS.filter((s) => !has.has(s) && !skipped.includes(s));
  return { skipped, missing, counted: isCountedMealDay(meals, skipped.length) };
};

/**
 * 기간(from~last)의 한 끼만 적힌 날과 그날 상태(최근 날부터) — 끼니 칸은 달력 조회로, 표시는 '안 먹음' 조회로. 두 끼 이상 적은 날은
 * 늘 평균에 들어 뺀다. '안 먹음' 조회는 한 끼만 적힌 날이 minDays 이상일 때만 부른다(홈 링크는 둘 이상일 때만 뜬다). 준비 전이면 null.
 */
const useOneMealDays = (from: string, last: string, minDays = 1) => {
  const ranged = from <= last;
  const fromMonth = from.slice(0, 7);
  const lastMonth = last.slice(0, 7);
  // 기간은 최대 28일이라 달력은 두 달까지.
  const calFrom = useMealCalendar(fromMonth, ranged);
  const calLast = useMealCalendar(lastMonth, ranged && lastMonth !== fromMonth);
  const lastDays = lastMonth !== fromMonth ? calLast.data?.days : [];
  const byDate =
    ranged && calFrom.data && lastDays ? new Map([...calFrom.data.days, ...lastDays].map((d) => [d.date, d])) : null;
  const candidates = byDate
    ? dateKeyRange(from, last)
        .reverse()
        .filter((d) => byDate.get(d)?.count === 1)
    : [];
  const enough = candidates.length >= minDays;
  const skips = useMealSkips(from, last, enough);
  if (!byDate) return null;
  if (!enough) return [];
  if (!skips.data) return null;
  const skipsOn = new Map<string, MealSkipSlotType[]>();
  for (const s of skips.data.skips) skipsOn.set(s.date, [...(skipsOn.get(s.date) ?? []), s.slot]);
  return candidates.map((date) => {
    const cal = byDate.get(date)!;
    return { date, recorded: cal.slots, ...dayState(cal.slots, skipsOn.get(date) ?? [], cal.count) };
  });
};

/**
 * 그날 기록이 없는 아침·점심·저녁 줄 — 비어 있으면 [기록하기] [안 먹음], 표시했으면 '안 먹음' [취소], 빈 끼니가 둘 이상이면 아래에
 * [남은 끼니 모두 안 먹음]. 홈 어제 묻기가 쓴다. onChanged 는 표시·취소가 끝난 뒤 — 그날이 평균에 들어도 바로 고칠 수 있게
 * 자리를 남기는 데 쓴다.
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
  const batch = useBatchMealSkips();
  const busy = set.isPending || clear.isPending || batch.isPending;
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
      {missing.length >= 2 ? (
        <div className="mt-1.5">
          <button
            type="button"
            className="meal-opt meal-opt-sm"
            disabled={busy}
            onClick={() => batch.mutate({ set: skipsOf(date, missing) }, { onSuccess: onChanged })}
          >
            {SKIP_ALL}
          </button>
        </div>
      ) : null}
      {set.isError || batch.isError ? <p className="text-sm meal-over">{MARK_ERROR}</p> : null}
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

/**
 * 홈 — 지난 2주(오늘 빼고)에 한 끼만 적혀 평균에서 빠진 날이 둘 이상이면 영양 탭 '빠진 날 정리'(체크 목록, 펼친 채)로 가는 한 줄.
 * 하루뿐이면 위의 어제 묻기·기록 목록으로 충분해 띄우지 않는다.
 */
export const MealMissedDaysLink = () => {
  const days = useOneMealDays(daysAgoKey(13), daysAgoKey(1), 2);
  const pending = days?.filter((d) => !d.counted).length ?? 0;
  if (pending < 2) return null;
  return (
    <p className="meal-note meal-skip-nudge text-sm" data-tone="warn">
      <span>지난 2주에 한 끼만 적혀 영양 평균에서 빠진 날이 {pending}일 있어요.</span>
      <Link to={MEAL_SKIP_REVIEW_PATH} className="meal-note-action">
        한 번에 정리
      </Link>
    </p>
  );
};

/**
 * 영양 탭 — 점검 기간 중 한 끼만 적혀 평균에서 빠진 지난날을 모아 체크 목록으로 한 번에 정리한다(2026-11-09). 빈 끼니를 모두
 * 체크해 두고, 먹은 끼니·기억나지 않는 날은 체크를 풀어 [선택한 K칸을 '안 먹음'으로 표시] 한 번 — 고르는 것이 곧 확인이라 확인창은
 * 없고, 표시한 뒤 [되돌리기](방금 표시한 칸만). 먹은 끼니는 [기록하기]로 그날 그 끼니 기록을 연다. 오늘은 아직 지나지 않은 끼니가
 * 있어 뺀다. 이 자리에서 고친 날은 평균에 들어도 남긴다(표시는 [취소]로 고칠 수 있게). 홈 링크(?skips=open)로 오면 펼친 채 연다.
 */
export const MealSkipReview = ({
  from,
  to,
  onRecord,
  defaultExpanded = false,
}: {
  /** 점검 기간 — 서버 응답의 from~to. */
  from: string;
  to: string;
  onRecord: (date: string, slot: MealSkipSlotType) => void;
  defaultExpanded?: boolean;
}) => {
  const today = toLocalDateKey(new Date());
  const last = to < today ? to : daysAgoKey(1);
  const days = useOneMealDays(from, last);
  const batch = useBatchMealSkips();
  const clear = useClearMealSkip();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  // 체크를 푼 칸 — 처음엔 빈 끼니를 모두 체크해 둔다(새로 생긴 칸도 체크된 채로).
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set());
  // 방금 표시한 칸 — 되돌리기는 이것만 지운다.
  const [lastAdded, setLastAdded] = useState<MealSkipType[] | null>(null);
  const bodyId = useId();
  if (!days) return null;
  const list = days.filter((d) => !d.counted || touched.has(d.date));
  if (list.length === 0) return null;

  const pending = list.filter((d) => !d.counted);
  const all = pending.flatMap((d) => skipsOf(d.date, d.missing));
  const selected = all.filter((s) => !unchecked.has(keyOf(s)));
  const allSelected = selected.length === all.length;
  const busy = batch.isPending || clear.isPending;
  const toggle = (s: MealSkipType) =>
    setUnchecked((u) => {
      const next = new Set(u);
      if (next.has(keyOf(s))) next.delete(keyOf(s));
      else next.add(keyOf(s));
      return next;
    });
  const submit = () =>
    batch.mutate(
      { set: selected },
      {
        onSuccess: (res) => {
          setTouched((t) => new Set([...t, ...selected.map((s) => s.date)]));
          setLastAdded(res.added);
        },
      },
    );
  const undo = () => {
    if (lastAdded) batch.mutate({ clear: lastAdded }, { onSuccess: () => setLastAdded(null) });
  };

  return (
    <section className="meal-skip-review" aria-label="평균에서 빠진 날">
      <div className="meal-skip-review-head">
        <p className="text-sm">
          {pending.length > 0 ? (
            <>
              한 끼만 적혀 평균에서 빠진 날 <b>{pending.length}일</b>
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
          {pending.length > 0 ? (
            <div className="meal-skip-review-tools">
              <p className="text-xs text-muted-foreground">
                먹은 끼니는 체크를 풀고 기록해 주세요. 기억나지 않는 날은 그날 체크를 모두 풀어 두세요.
              </p>
              <button
                type="button"
                className="meal-btn-quiet"
                onClick={() => setUnchecked(allSelected ? new Set(all.map(keyOf)) : new Set())}
              >
                {allSelected ? '모두 해제' : '모두 선택'}
              </button>
            </div>
          ) : null}
          <ul className="meal-skip-review-days">
            {list.map((d) => (
              <li key={d.date}>
                <fieldset className="meal-skip-day">
                  <legend className="text-sm">
                    <b>{mealDateTitle(d.date, today)}</b>{' '}
                    <span className="text-muted-foreground">
                      · {d.counted ? '평균에 들어가요' : `${labelsOf(d.recorded)}만 적힘`}
                    </span>
                  </legend>
                  <ul className="meal-skip-slots">
                    {MEAL_SKIPPABLE_SLOTS.filter((s) => d.skipped.includes(s) || d.missing.includes(s)).map((slot) =>
                      d.skipped.includes(slot) ? (
                        <li key={slot}>
                          <span className="meal-skip-slot">{MEAL_SLOT_LABEL[slot]}</span>
                          <span className="text-muted-foreground">안 먹음</span>
                          <button
                            type="button"
                            className="meal-btn-quiet"
                            disabled={busy}
                            aria-label={`${MEAL_SLOT_LABEL[slot]} 안 먹음 취소`}
                            onClick={() =>
                              clear.mutate(
                                { date: d.date, slot },
                                { onSuccess: () => setTouched((t) => new Set(t).add(d.date)) },
                              )
                            }
                          >
                            취소
                          </button>
                        </li>
                      ) : (
                        <li key={slot}>
                          <label className="meal-skip-check">
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={!unchecked.has(keyOf({ date: d.date, slot }))}
                              onChange={() => toggle({ date: d.date, slot })}
                            />
                            {MEAL_SLOT_LABEL[slot]} 안 먹음
                          </label>
                          <button
                            type="button"
                            className="meal-btn-quiet"
                            aria-label={`${MEAL_SLOT_LABEL[slot]} 기록하기`}
                            onClick={() => onRecord(d.date, slot)}
                          >
                            기록하기
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                </fieldset>
              </li>
            ))}
          </ul>
          {pending.length > 0 ? (
            <div>
              <button type="button" className="meal-btn" disabled={busy || selected.length === 0} onClick={submit}>
                선택한 {selected.length}칸을 ‘안 먹음’으로 표시 ({new Set(selected.map((s) => s.date)).size}일)
              </button>
            </div>
          ) : null}
          {lastAdded && lastAdded.length > 0 ? (
            <p className="meal-note text-sm" data-tone="ok">
              <span>
                {new Set(lastAdded.map((s) => s.date)).size}일의 빈 끼니 {lastAdded.length}칸을 ‘안 먹음’으로 표시했어요.
              </span>
              <button type="button" className="meal-note-action" disabled={busy} onClick={undo}>
                되돌리기
              </button>
            </p>
          ) : null}
          {batch.isError || clear.isError ? <p className="text-sm meal-over">{MARK_ERROR}</p> : null}
        </div>
      ) : null}
    </section>
  );
};

/**
 * 기록 목록의 날짜 묶음 아래 — 그날의 '안 먹음'(취소할 수 있게)과, 지난날이 한 끼만 적혀 평균에서 빠지면 남은 끼니마다 '안 먹음'
 * (하나를 표시해도 남은 끼니가 있으면 계속 묻는다, 둘 이상이면 [남은 끼니 모두 안 먹음]). 오늘은 아직 지나지 않은 끼니가 있어 묻지
 * 않는다.
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
  const batch = useBatchMealSkips();
  const { skipped, missing, counted } = dayState(recorded, skips, meals);
  const ask = past && !counted && missing.length > 0;
  if (skipped.length === 0 && !ask) return null;
  const busy = set.isPending || clear.isPending || batch.isPending;
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
            {missing.length >= 2 ? (
              <button
                type="button"
                className="meal-opt meal-opt-sm"
                disabled={busy}
                onClick={() => batch.mutate({ set: skipsOf(date, missing) })}
              >
                {SKIP_ALL}
              </button>
            ) : null}
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
