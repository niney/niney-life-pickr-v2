import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ChevronLeft, ChevronRight, Loader2, SlidersHorizontal } from 'lucide-react';
import type {
  MealEntrySourceType,
  MealEntryType,
  MealSkipSlotType,
  MealSlotType,
  MealTypeType,
} from '@repo/api-contract';
import {
  useInfiniteMealEntries,
  useMealCalendar,
  useMealEntries,
  useMealSkips,
  useMealStats,
  useMealStatsNutrients,
  useMealStatsNutrition,
} from '@repo/shared';
import {
  FOOD_CUISINE_LABEL,
  FOOD_DISH_TYPE_LABEL,
  FOOD_MAIN_INGREDIENT_LABEL,
  MEAL_SLOT_LABEL,
  MEAL_SLOTS,
  MEAL_SLOT_ORDER,
  MEAL_TYPE_LABEL,
  MEAL_TYPES,
  mealDateLabel,
  mealNutritionLabel,
  monthRange,
  summarizeMealNutrition,
  toLocalDateKey,
  toLocalMonthKey,
} from '@repo/utils';
import { useIsDesktopLg } from '~/lib/useMediaQuery';
import { cn } from '~/lib/utils';
import { MEAL_MAIN_CLASS, MEAL_SIDE_CLASS, MEAL_SPLIT_CLASS } from './mealLayout';
import { MEAL_BAR_METRICS, type MealBarMetric } from './mealBarMetrics';
import { MealBarSummary } from './MealBarSummary';
import { MealGroupBars } from './MealGroupBars';
import { MealLink } from './MealLink';
import { flaggedNutrients } from './mealNutrientTone';
import { MEAL_PATH } from './mealPaths';
import { MealPageHeader } from './MealPageHeader';
import { MealPhotoImg } from './MealPhotoImg';
import { MealDaySkips } from './MealSkip';
import { MealStatsNutrients } from './MealStatsNutrients';

// 내 식단의 기록·달력·통계 화면(식단 셸 /meal/records·calendar·stats). 차트 라이브러리를 쓰지 않는 리포 관례대로
// 막대는 div 폭으로 그린다.
//
// 2026-11-08 리뉴얼: 카드 틀 대신 영양정보 표처럼 굵은 줄로 나눈다. 기록은 날짜마다 먹줄 아래 끼니 줄(왼쪽 끼니·시각,
// 가운데 음식, 오른쪽 열량), 달력은 칸마다 끼니 점·열량·사진 표시, 통계는 큰 숫자 줄. 데스크톱(lg)은 왼쪽 본문 +
// 오른쪽 맥락(기록: 찾기·최근 7일 / 달력: 고른 날). 기록 줄을 누르면 데스크톱은 상세 패널, 좁은 화면은 상세 화면.

const timeText = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');

export const MealRecordsPage = () => (
  <>
    <MealPageHeader title="기록" group="records" />
    <MealList />
  </>
);

export const MealCalendarPage = () => (
  <>
    <MealPageHeader title="달력" group="records" />
    <MealCalendar />
  </>
);

export const MealStatsPage = () => (
  <>
    <MealPageHeader title="통계" group="analysis" />
    <MealStats />
  </>
);

// ── 기록 ────────────────────────────────────────────────────────────────────
const SEARCH_DEBOUNCE_MS = 250;
// '안 먹음' 표시를 함께 받는 기간 상한(서버 MEAL_STATS_MAX_DAYS 400 안쪽) — 더 오래된 묶음엔 표시를 그리지 않는다.
const SKIP_RANGE_DAYS = 365;
const daysBefore = (key: string, n: number): string => {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return toLocalDateKey(new Date(y, m - 1, d - n));
};

const SOURCE_FILTERS = [
  ['photo', '사진'],
  ['manual', '수동'],
  ['recommendation', '추천'],
] as const;

const MealList = () => {
  // 입력칸에 보이는 검색어(q)와 조회에 쓰는 검색어(appliedQ)를 나눈다 — 키 입력마다 요청하지 않게 타이핑이
  // 잠잠해진 뒤에 반영하고, 비우는 것만 바로 반영한다(공용 useDebounced 는 즉시 반영할 길이 없어 '필터 초기화'가
  // 검색어만 한 박자 늦게 풀린다).
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [slot, setSlot] = useState<MealSlotType | null>(null);
  const [mealType, setMealType] = useState<MealTypeType | null>(null);
  const [source, setSource] = useState<MealEntrySourceType | null>(null);
  // 좁은 화면은 검색칸만 두고 날짜·끼니·방식 조건은 접어 둔다(펼치면 목록 위를 250px 넘게 차지했다). 데스크톱은 늘 펼친다.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  // 타이머는 외부 시스템이라 effect — 다음 키 입력이 오면 앞선 예약을 취소한다.
  useEffect(() => {
    const next = q.trim();
    if (!next) return undefined;
    const timer = setTimeout(() => setAppliedQ(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);
  const changeQ = (value: string) => {
    setQ(value);
    if (!value.trim()) setAppliedQ('');
  };
  const filters = useMemo(
    () => ({
      limit: 30,
      ...(appliedQ ? { q: appliedQ } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(slot ? { slot } : {}),
      ...(mealType ? { mealType } : {}),
      ...(source ? { source } : {}),
    }),
    [appliedQ, from, mealType, slot, source, to],
  );
  // 조건이 바뀌는 동안 이전 목록을 흐리게 둔다 — 화면을 로딩으로 통째 바꾸면 검색 입력칸까지 사라져 한 글자마다
  // 포커스를 잃었다.
  const list = useInfiniteMealEntries(filters, true, { keepPrevious: true });
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  // 상세 패널의 ↑↓ 순서 — 보이는 목록 그대로.
  const ids = useMemo(() => items.map((entry) => entry.id), [items]);
  const today = toLocalDateKey(new Date());
  const filtered = Boolean(q.trim() || from || to || slot || mealType || source);
  const conditions = [from || to, slot, mealType, source].filter(Boolean).length;
  const isDesktop = useIsDesktopLg();
  const groups = useMemo(() => {
    const out: { date: string; entries: MealEntryType[] }[] = [];
    for (const entry of items) {
      const last = out[out.length - 1];
      if (last && last.date === entry.eatenDate) last.entries.push(entry);
      else out.push({ date: entry.eatenDate, entries: [entry] });
    }
    return out;
  }, [items]);
  // 보이는 날짜 묶음의 '안 먹음' 표시 — 조건 없이 볼 때만(끼니·방식으로 거른 목록에선 빈 끼니를 따질 수 없다).
  const newest = groups[0]?.date ?? '';
  const oldest = groups[groups.length - 1]?.date ?? '';
  const skipFrom = newest && oldest < daysBefore(newest, SKIP_RANGE_DAYS) ? daysBefore(newest, SKIP_RANGE_DAYS) : oldest;
  const skipsQuery = useMealSkips(skipFrom, newest, !filtered && groups.length > 0);
  const skipsByDate = useMemo(() => {
    const out = new Map<string, MealSkipSlotType[]>();
    for (const s of skipsQuery.data?.skips ?? []) out.set(s.date, [...(out.get(s.date) ?? []), s.slot]);
    return out;
  }, [skipsQuery.data]);

  const status = list.isLoading ? (
    <Loading />
  ) : list.error ? (
    <ErrorBox onRetry={() => void list.refetch()} />
  ) : null;
  // 조건을 걸기 전(첫 화면)에는 예전처럼 로딩·오류만 보인다. 조건을 하나라도 건 뒤에는 아래 목록 자리에서만 보여
  // 검색·필터가 조건을 바꾸는 내내 그대로 있게 한다.
  if (status && !filtered) return status;

  return (
    <div className={MEAL_SPLIT_CLASS}>
      {/* 데스크톱은 찾기와 최근 7일을 오른쪽에 붙여 둔다 — 목록이 첫 화면부터 시작하게. */}
      <div className={MEAL_SIDE_CLASS}>
        <section
          className="meal-filter"
          aria-label="기록 찾기"
          data-open={moreOpen ? 'true' : undefined}
        >
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(event) => changeQ(event.target.value)}
              placeholder="음식·장소·메모 검색"
              maxLength={80}
              className="meal-input min-w-0 flex-1"
            />
            <button
              type="button"
              className="meal-btn-line meal-filter-toggle lg:hidden"
              aria-expanded={moreOpen}
              aria-controls={moreId}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-4" aria-hidden />
              조건{conditions > 0 ? ` ${conditions}` : ''}
            </button>
          </div>
          <div id={moreId} className="meal-filter-more">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                aria-label="시작 날짜"
                className="meal-input meal-input-sm min-w-0 flex-1"
              />
              <span aria-hidden>~</span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                aria-label="끝 날짜"
                className="meal-input meal-input-sm min-w-0 flex-1"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MEAL_SLOTS.map((value) => (
                <FilterChip
                  key={value}
                  label={MEAL_SLOT_LABEL[value]}
                  selected={slot === value}
                  onClick={() => setSlot(slot === value ? null : value)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MEAL_TYPES.map((value) => (
                <FilterChip
                  key={value}
                  label={MEAL_TYPE_LABEL[value]}
                  selected={mealType === value}
                  onClick={() => setMealType(mealType === value ? null : value)}
                />
              ))}
              {SOURCE_FILTERS.map(([value, label]) => (
                <FilterChip
                  key={value}
                  label={label}
                  selected={source === value}
                  onClick={() => setSource(source === value ? null : value)}
                />
              ))}
            </div>
            {filtered ? (
              <button
                type="button"
                className="meal-btn-quiet self-start"
                onClick={() => {
                  changeQ('');
                  setFrom('');
                  setTo('');
                  setSlot(null);
                  setMealType(null);
                  setSource(null);
                }}
              >
                필터 초기화
              </button>
            ) : null}
          </div>
        </section>
        {isDesktop ? <MealWeekSummary /> : null}
      </div>

      <div className={cn(MEAL_MAIN_CLASS, 'space-y-8', list.isPlaceholderData && 'opacity-60')}>
        {status ?? (
          <>
            {items.length === 0 ? (
              <div className="meal-empty">
                {filtered ? (
                  <p>조건에 맞는 기록이 없어요. 필터를 바꿔 보세요.</p>
                ) : (
                  <>
                    <p>아직 기록이 없어요. 첫 끼니를 남겨 보세요.</p>
                    <MealLink to={MEAL_PATH.new} className="meal-btn">
                      첫 끼니 기록하기
                    </MealLink>
                  </>
                )}
              </div>
            ) : null}
            {groups.map((group) => (
              <DayGroup
                key={group.date}
                date={group.date}
                today={today}
                entries={group.entries}
                siblings={ids}
                skips={!filtered && skipsQuery.data ? (skipsByDate.get(group.date) ?? []) : null}
              />
            ))}
            {/* 이전 조건의 목록을 보여 주는 동안엔 '더 보기'를 숨긴다 — 그 다음 쪽은 이전 조건의 것이다. */}
            {list.hasNextPage && !list.isPlaceholderData ? (
              <div className="text-center">
                <button
                  type="button"
                  className="meal-btn-line"
                  onClick={() => void list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                >
                  {list.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

// 날짜 한 묶음 — 먹줄 아래 끼니 줄. 머리 오른쪽에 그날 끼니 수와 열량 합(값이 있는 음식만).
const DayGroup = ({
  date,
  today,
  entries,
  siblings,
  skips,
}: {
  date: string;
  today: string;
  entries: MealEntryType[];
  siblings: string[];
  /** 그날의 '안 먹음' 끼니 — null 이면(조건으로 거른 목록·불러오기 전) 표시·묻기를 그리지 않는다. */
  skips: MealSkipSlotType[] | null;
}) => {
  const sum = summarizeMealNutrition(entries.flatMap((entry) => entry.items));
  return (
    <section className="meal-day" aria-label={`${mealDateLabel(date, today)} 기록`}>
      <div className="meal-day-head">
        <h2 className="meal-day-title">{mealDateLabel(date, today)}</h2>
        <span className="meal-day-date">{date}</span>
        <span className="meal-day-sum">
          {entries.length}끼{sum.kcal !== null ? ` · 약 ${fmt(sum.kcal)}kcal` : ''}
        </span>
      </div>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <MealEntryRow entry={entry} siblings={siblings} />
          </li>
        ))}
      </ul>
      {skips ? (
        <MealDaySkips
          date={date}
          past={date < today}
          meals={entries.length}
          recorded={entries.map((entry) => entry.slot)}
          skips={skips}
        />
      ) : null}
    </section>
  );
};

// 최근 7일 요약(데스크톱 기록 오른쪽) — 목록 옆에서 요즘 얼마나 적고 먹었는지. 자세한 건 통계.
const MealWeekSummary = () => {
  const { from, to } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return { from: toLocalDateKey(start), to: toLocalDateKey(end) };
  }, []);
  const stats = useMealStats(from, to);
  const data = stats.data;
  if (!data) return null;
  return (
    <section className="meal-sec" aria-labelledby="meal-week-summary">
      <div className="meal-sec-head">
        <h2 id="meal-week-summary" className="meal-sec-title">
          최근 7일
        </h2>
        <Link to={MEAL_PATH.stats} className="text-sm font-bold underline-offset-4 hover:underline">
          통계 보기
        </Link>
      </div>
      <div className="meal-figures meal-figures-3">
        <Figure label="기록" value={`${data.entryCount}끼`} sub={`${data.recordedDays}/7일`} />
        <Figure
          label="하루 평균"
          value={data.nutrition.avgKcalPerDay !== null ? fmt(data.nutrition.avgKcalPerDay) : '-'}
          sub="kcal"
        />
        <Figure label="연속" value={`${data.streakDays}일`} sub="기록한 날" />
      </div>
    </section>
  );
};

const FilterChip = ({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button type="button" aria-pressed={selected} onClick={onClick} className="meal-opt meal-opt-sm">
    {label}
  </button>
);

// 한 끼 줄 — 누르면 상세(수정·삭제). 줄 전체가 링크라 식당 링크는 상세에서 연다(링크 중첩 금지).
// 넓으면 한 줄(끼니·시각 | 음식·장소 | 사진 | 열량), 좁으면 두 줄(끼니·시각 + 열량 / 음식 + 사진).
const MealEntryRow = ({ entry, siblings }: { entry: MealEntryType; siblings?: string[] }) => {
  const mains = entry.items.filter((i) => i.isMain);
  const sides = entry.items.filter((i) => !i.isMain);
  // 카탈로그에 영양이 없는 음식이 흔해서(외식 브랜드 메뉴 등) 값이 하나도 없으면 줄을 그리지 않는다.
  const kcalText = mealNutritionLabel(summarizeMealNutrition(entry.items));
  return (
    <MealLink
      to={MEAL_PATH.entry(entry.id)}
      siblings={siblings}
      swap
      entryId={entry.id}
      title={entry.memo ?? undefined}
      className="meal-entry"
    >
      <span className="meal-entry-when">
        <span className="meal-entry-slot">{MEAL_SLOT_LABEL[entry.slot]}</span>
        <span>{timeText(entry.eatenAt)}</span>
        {entry.mealType ? <span>{MEAL_TYPE_LABEL[entry.mealType]}</span> : null}
      </span>
      <span className="meal-entry-foods">
        <span className="meal-entry-mains">
          {mains.map((i) => i.name).join(', ') || '(음식 없음)'}
        </span>
        {sides.length > 0 ? (
          <span className="meal-entry-sub">곁들임 {sides.map((i) => i.name).join(', ')}</span>
        ) : null}
        {entry.placeName ? <span className="meal-entry-sub">{entry.placeName}</span> : null}
      </span>
      {entry.photos.length > 0 ? (
        <MealPhotoImg token={entry.photos[0]!.token} className="meal-entry-photo" />
      ) : null}
      {kcalText ? <span className="meal-entry-kcal">{kcalText}</span> : null}
    </MealLink>
  );
};

// ── 달력 ────────────────────────────────────────────────────────────────────
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const MealCalendar = () => {
  const isDesktop = useIsDesktopLg();
  const today = toLocalDateKey(new Date());
  const [month, setMonth] = useState(() => toLocalMonthKey(new Date()));
  const [picked, setPicked] = useState<string | null>(null);
  // 데스크톱은 오른쪽이 비지 않게, 고른 날이 없으면 오늘(이번 달을 볼 때) — 좁은 화면은 예전처럼 고를 때만.
  const selected = picked ?? (isDesktop && today.startsWith(month) ? today : null);
  const cal = useMealCalendar(month);
  const dayList = useMealEntries(
    selected ? { from: selected, to: selected, limit: 20 } : {},
    selected !== null,
  );

  const cells = useMemo(() => {
    if (!monthRange(month)) return [];
    const [y, m] = month.split('-').map(Number);
    const lead = new Date(y!, (m ?? 1) - 1, 1).getDay();
    const lastDay = new Date(y!, m ?? 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= lastDay; d += 1) out.push(`${month}-${`${d}`.padStart(2, '0')}`);
    return out;
  }, [month]);

  const byDate = useMemo(() => new Map((cal.data?.days ?? []).map((d) => [d.date, d])), [cal.data]);
  const [year, monthNo] = month.split('-').map(Number);

  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(toLocalMonthKey(new Date(y!, (m ?? 1) - 1 + delta, 1)));
    setPicked(null);
  };

  return (
    <div className={MEAL_SPLIT_CLASS}>
      <div className={MEAL_MAIN_CLASS}>
        <section className="meal-cal" aria-labelledby="meal-cal-title">
          <div className="meal-cal-head">
            <button
              type="button"
              className="meal-icon-btn"
              onClick={() => shift(-1)}
              aria-label="이전 달"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <h2 id="meal-cal-title" className="meal-cal-title">
              {year}년 {monthNo}월
            </h2>
            <button
              type="button"
              className="meal-icon-btn"
              onClick={() => shift(1)}
              aria-label="다음 달"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <span className="meal-cal-legend">숫자는 그날 열량(kcal)</span>
          </div>
          {cal.isLoading ? (
            <Loading />
          ) : (
            <>
              <div className="meal-cal-week" aria-hidden>
                {WEEKDAYS.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="meal-cal-grid">
                {cells.map((date, i) => {
                  if (!date) return <span key={`pad-${i}`} className="meal-cal-pad" aria-hidden />;
                  const info = byDate.get(date);
                  const isSel = date === selected;
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setPicked(isSel ? null : date)}
                      aria-pressed={isSel}
                      // 화면 읽기 프로그램에는 날짜만이 아니라 그날 기록 요약까지 — 칸에 보이는 점·숫자를 말로.
                      aria-label={[
                        `${Number(date.slice(5, 7))}월 ${Number(date.slice(-2))}일`,
                        date === today ? '오늘' : null,
                        info ? `${info.count}끼` : '기록 없음',
                        info?.kcal != null ? `약 ${fmt(info.kcal)}kcal` : null,
                        info?.hasPhoto ? '사진 있음' : null,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                      data-today={date === today ? 'true' : undefined}
                      data-recorded={info ? 'true' : undefined}
                      className="meal-cal-day"
                    >
                      <span className="meal-cal-num">{Number(date.slice(-2))}</span>
                      <span className="meal-cal-dots" aria-hidden>
                        {(info?.slots ?? [])
                          .slice()
                          .sort((a, b) => MEAL_SLOT_ORDER[a] - MEAL_SLOT_ORDER[b])
                          .slice(0, 4)
                          .map((s: MealSlotType) => (
                            <span key={s} />
                          ))}
                      </span>
                      {info?.kcal != null ? (
                        <span className="meal-cal-kcal">{fmt(info.kcal)}</span>
                      ) : null}
                      {info?.hasPhoto ? <Camera className="meal-cal-photo" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {selected ? (
        <div className={MEAL_SIDE_CLASS}>
          <section className="meal-sec" aria-labelledby="meal-cal-day">
            <div className="meal-sec-head">
              <h2 id="meal-cal-day" className="meal-sec-title">
                {mealDateLabel(selected, today)} 기록
              </h2>
              <span className="text-sm text-muted-foreground">{selected}</span>
            </div>
            {/* 날짜를 바꾸면 새 날짜 응답이 올 때까지 이전 날짜 기록이 남아 있다(keepPreviousData) — 흐리게 해 구분한다. */}
            <div className={cn(dayList.isPlaceholderData && 'opacity-60')}>
              {dayList.isLoading ? (
                <Loading />
              ) : (dayList.data?.items.length ?? 0) === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">이 날은 기록이 없어요.</p>
              ) : (
                <ul>
                  {dayList.data!.items.map((e, _i, all) => (
                    <li key={e.id}>
                      <MealEntryRow entry={e} siblings={all.map((x) => x.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      ) : isDesktop ? (
        <div className={MEAL_SIDE_CLASS}>
          <p className="meal-empty">날짜를 고르면 그날 기록이 여기에 보여요.</p>
        </div>
      ) : null}
    </div>
  );
};

// ── 통계 ────────────────────────────────────────────────────────────────────
const RANGES = [
  { key: '7', label: '1주', days: 7 },
  { key: '30', label: '1달', days: 30 },
  { key: '90', label: '3달', days: 90 },
] as const;

const INSIGHT_TONE: Record<string, string> = {
  positive: 'ok',
  attention: 'warn',
  info: 'info',
};

const MealStats = () => {
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]['key']>('30');
  const days = RANGES.find((r) => r.key === rangeKey)?.days ?? 30;
  const { from, to } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    return { from: toLocalDateKey(start), to: toLocalDateKey(end) };
  }, [days]);
  const stats = useMealStats(from, to);
  // 분포 막대 기준(끼니 수·열량·나트륨)과 막대 카드 — 묶음별 영양 몫은 통계를 열 때 함께 받아 두어 올리자마자 뜬다.
  const [metric, setMetric] = useState<MealBarMetric>('count');
  const groups = useMealStatsNutrition(from, to);
  // 영양소별 하루 평균 — 영양 탭 점검과 같은 셈(두 끼 이상 기록한 날, 같은 섭취기준·판정)을 이 기간에. 영양정보 표·막대 위
  // 한 줄·묶음 카드의 많음·부족 표시가 같이 써서, 통계 화면 안에서는 모두 고른 기간 한 가지로 말한다.
  const nutrients = useMealStatsNutrients(from, to);
  // 직전 같은 길이 기간(1주면 그 앞 7일) — 영양소 줄마다 하루 평균이 얼마나 달라졌는지 견준다(2026-11-09). 같은 조회를 앞 기간으로.
  const prev = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() - days);
    const start = new Date();
    start.setDate(start.getDate() - (2 * days - 1));
    return { from: toLocalDateKey(start), to: toLocalDateKey(end) };
  }, [days]);
  const previous = useMealStatsNutrients(prev.from, prev.to);
  const flags = useMemo(
    () => flaggedNutrients(nutrients.data?.status, nutrients.data?.rows),
    [nutrients.data],
  );
  const rangeLabel = RANGES.find((r) => r.key === rangeKey)?.label ?? '';

  if (stats.isLoading) return <Loading />;
  if (stats.error) return <ErrorBox onRetry={() => void stats.refetch()} />;
  const data = stats.data;
  if (!data) return null;

  return (
    <div className="space-y-9">
      <div className="meal-seg" role="group" aria-label="통계 기간">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={rangeKey === r.key}
            onClick={() => setRangeKey(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="meal-figures meal-figures-4">
          <Figure
            label="기록"
            value={`${data.entryCount}끼`}
            sub={`${data.recordedDays}/${data.totalDays}일`}
          />
          <Figure label="연속" value={`${data.streakDays}일`} sub="기록한 날" />
          <Figure
            label="겹침"
            value={`${Math.round(data.repeatRate * 100)}%`}
            sub="7일 내 재등장"
          />
          {data.nutrition.avgKcalPerDay !== null ? (
            <Figure
              label="하루 평균"
              value={`${fmt(data.nutrition.avgKcalPerDay)}kcal`}
              sub={`주식 ${Math.round(data.nutrition.mainItemCoverage * 100)}% · 직접 ${Math.round(data.nutrition.directCoverage * 100)}%`}
            />
          ) : null}
        </div>
        {!data.nutrition.averageReliable && data.entryCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            주식 영양 근거가 {Math.round(data.nutrition.mainItemCoverage * 100)}%뿐이라 하루 평균은
            숨겼어요.
          </p>
        ) : null}
        {data.nutrition.avgKcalPerDay !== null && data.nutrition.coverage < 1 ? (
          <p className="text-xs text-muted-foreground">
            직접값 {data.nutrition.itemsDirect}개, 추정값(유사 음식·통상 1인분){' '}
            {data.nutrition.itemsEstimated}개만 반영한 값이라 실제와 다를 수 있어요.
          </p>
        ) : null}
      </div>

      {data.entryCount === 0 ? (
        <p className="meal-empty">이 기간에는 기록이 없어요.</p>
      ) : (
        <>
          <MealStatsNutrients
            data={nutrients.data}
            loading={nutrients.isLoading}
            rangeLabel={rangeLabel}
            // 기간을 바꾸는 동안 남아 있는 앞 기간 값끼리 견주지 않게 — 둘 다 새로 받은 뒤에만.
            previous={nutrients.isPlaceholderData || previous.isPlaceholderData ? undefined : previous.data}
          />
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <MealBarSummary
                metric={metric}
                data={nutrients.data}
                loading={nutrients.isLoading}
                rangeLabel={rangeLabel}
              />
              <div className="meal-seg meal-seg-sm" role="group" aria-label="막대 기준">
                {MEAL_BAR_METRICS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={metric === m.key}
                    onClick={() => setMetric(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-x-8 gap-y-9 md:grid-cols-2">
              <MealGroupBars
                title="조리 형태"
                counts={data.byDishType}
                labels={FOOD_DISH_TYPE_LABEL}
                groups={groups.data?.byDishType}
                groupsLoading={groups.isLoading}
                metric={metric}
                side="right"
                flags={flags}
                average={groups.data?.composition ?? null}
              />
              <MealGroupBars
                title="주재료"
                counts={data.byMainIngredient}
                labels={FOOD_MAIN_INGREDIENT_LABEL}
                groups={groups.data?.byMainIngredient}
                groupsLoading={groups.isLoading}
                metric={metric}
                side="left"
                flags={flags}
                average={groups.data?.composition ?? null}
              />
              <MealGroupBars
                title="요리 계통"
                counts={data.byCuisine}
                labels={FOOD_CUISINE_LABEL}
                groups={groups.data?.byCuisine}
                groupsLoading={groups.isLoading}
                metric={metric}
                side="right"
                flags={flags}
                average={groups.data?.composition ?? null}
              />
              <section className="meal-sec" aria-labelledby="meal-top-foods">
                <div className="meal-sec-head">
                  <h2 id="meal-top-foods" className="meal-sec-title">
                    자주 먹은 음식
                  </h2>
                </div>
                {data.topFoods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">아직 반복된 음식이 없어요.</p>
                ) : (
                  <ul>
                    {data.topFoods.map((f) => (
                      <li key={f.name} className="meal-rank-row">
                        <span className="truncate font-bold">{f.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {f.count}회 · 마지막 {f.lastEatenDate.slice(5)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

        </>
      )}

      {/* 기록 기반 관찰은 영양소·분포 다음 — 숫자를 먼저 보고 말로 정리한다(2026-11-08). 추천 반응은 추천 탭으로 옮겼다. */}
      <section className="meal-sec" aria-labelledby="meal-weekly-insights-title">
        <div className="meal-sec-head">
          <h2 id="meal-weekly-insights-title" className="meal-sec-title">
            주간 인사이트
          </h2>
        </div>
        <p className="-mt-2 mb-3 text-xs text-muted-foreground">
          최근 7일과 직전 7일을 비교한 기록 기반 관찰이에요.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.insights.map((insight) => (
            <div
              key={insight.key}
              className="meal-note meal-note-block"
              data-tone={INSIGHT_TONE[insight.tone] ?? 'info'}
            >
              <p className="font-bold">{insight.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{insight.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

// 큰 숫자 한 칸 — 라벨 · 숫자 · 덧말.
const Figure = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="meal-figure">
    <p className="meal-figure-label">{label}</p>
    <p className="meal-display meal-figure-value">{value}</p>
    {sub ? <p className="meal-figure-sub">{sub}</p> : null}
  </div>
);

const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin" /> 불러오는 중…
  </div>
);

const ErrorBox = ({ onRetry }: { onRetry: () => void }) => (
  <div className="meal-empty">
    <p className="text-destructive">불러오지 못했습니다.</p>
    <button type="button" className="meal-btn-line" onClick={onRetry}>
      재시도
    </button>
  </div>
);
