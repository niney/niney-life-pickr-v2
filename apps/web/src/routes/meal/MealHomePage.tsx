import { Link } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import type {
  FrequentMealItemType,
  MealEntryType,
  MealNutrientResultType,
  MealNutritionAnalysisType,
  MealPreferenceType,
  MealRecommendationType,
  MealSlotType,
} from '@repo/api-contract';
import {
  useFrequentMealItems,
  useMealCalendar,
  useMealEntries,
  useMealNutrition,
  useMealRecommendationContext,
  useMealStats,
} from '@repo/shared';
import {
  MEAL_NUTRIENT_STATUS_LABEL,
  MEAL_SLOT_LABEL,
  formatNutrientAmount,
  guessMealSlot,
  mealNutrientDisplayStatus,
  summarizeMealNutrition,
  toLocalDateKey,
  type MealNutrientDisplayKey,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { MealLink } from './MealLink';
import { prepareMealEntry } from './mealDraftStart';
import { MEAL_NUTRIENT_TONE } from './mealNutrientTone';
import { useMealOpen } from './mealPanel';
import { MEAL_PATH } from './mealPaths';
import { MealMissedDaysLink, MealSkipNudge } from './MealSkip';

// 식단 홈(2026-11-08 리뉴얼) — 간단명료한 대시보드. 오늘(끼니 4칸 + 열량), 다음 끼니 추천, 영양정보 라벨(최근 14일
// 하루 평균), 최근 7일, 한 줄 습관, 자주 먹은 음식. 새 API 없이 기존 조회를 함께 부른다.
// 오늘 칸에서는 영양소를 판정하지 않는다 — 하루 중간엔 무엇이든 '부족'으로 보여서, 영양소는 14일 평균 라벨이 맡는다.

const DAY_MS = 86_400_000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const TODAY_SLOTS: MealSlotType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const parts = (key: string): [number, number, number] => {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return [y, m, d];
};
const shiftDate = (key: string, days: number): string => {
  const [y, m, d] = parts(key);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
};
const weekdayOf = (key: string): string => {
  const [y, m, d] = parts(key);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
};
const dayTitle = (key: string): string => {
  const [, m, d] = parts(key);
  return `${m}월 ${d}일 ${weekdayOf(key)}요일`;
};
const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');
// 야식은 간식 칸에 함께 둔다(오늘 칸은 넷).
const entriesOf = (entries: readonly MealEntryType[], slot: MealSlotType): MealEntryType[] =>
  entries.filter((e) => e.slot === slot || (slot === 'snack' && e.slot === 'late_night'));

export const MealHomePage = () => {
  const open = useMealOpen();
  const today = toLocalDateKey(new Date());
  const weekStart = shiftDate(today, -6);
  const slotNow = guessMealSlot(new Date());

  const entries = useMealEntries({ from: today, to: today, limit: 30 });
  const nutrition = useMealNutrition(14);
  const ctx = useMealRecommendationContext();
  const calStart = useMealCalendar(weekStart.slice(0, 7));
  const calEnd = useMealCalendar(today.slice(0, 7), today.slice(0, 7) !== weekStart.slice(0, 7));
  const stats = useMealStats(shiftDate(today, -29), today);
  const frequent = useFrequentMealItems(slotNow);

  const dayEntries = entries.data?.items ?? [];
  const total = summarizeMealNutrition(dayEntries.flatMap((e) => e.items));
  const requirement = nutrition.data?.energy.requirement ?? null;
  const byDate = new Map(
    [...(calStart.data?.days ?? []), ...(calEnd.data?.days ?? [])].map((d) => [d.date, d]),
  );
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(weekStart, i);
    const d = byDate.get(date);
    return { date, kcal: d?.kcal ?? null, count: d?.count ?? 0 };
  });

  const start = (opts: { slot?: MealSlotType; quick?: FrequentMealItemType; date?: string }) => {
    prepareMealEntry(opts);
    open(MEAL_PATH.new);
  };
  // 어제 — 한 끼만 적혀 영양 평균에서 빠지면 빈 끼니를 묻는다(달력 조회에 끼니 칸이 이미 있다).
  const yesterday = shiftDate(today, -1);
  const yesterdayInfo = byDate.get(yesterday);

  return (
    <>
      <header className="mb-6 md:mb-8">
        <h1 className="meal-title">{dayTitle(today)}</h1>
      </header>
      {/* 최근 90일 기록이 없으면(처음 쓰는 사람·오래 쉰 사람) 대시보드 위에 시작 단계를 둔다. */}
      {ctx.data && ctx.data.entryCount === 0 ? (
        <StartGuide preference={ctx.data.preference ?? null} onStart={() => start({})} />
      ) : null}
      <MealSkipNudge
        date={yesterday}
        meals={yesterdayInfo?.count ?? 0}
        recorded={yesterdayInfo?.slots ?? []}
        onRecord={(slot) => start({ slot, date: yesterday })}
      />
      {/* 지난 2주에 한 끼만 적힌 날이 둘 이상이면 영양 탭 '빠진 날 정리'(체크 목록)로 — 한 번에 정리. */}
      <MealMissedDaysLink />
      <div className="meal-dash">
        <Today
          entries={dayEntries}
          kcal={total.kcal}
          requirement={requirement}
          onStart={(slot) => start({ slot })}
        />
        <Recommendation latest={ctx.data?.latest ?? null} />
        <NutritionLabel analysis={nutrition.data ?? null} loading={nutrition.isLoading} />
        <Week
          week={week}
          today={today}
          requirement={requirement}
          streak={stats.data?.streakDays ?? 0}
        />
        <Insight insight={stats.data?.insights?.[0] ?? null} />
        <QuickAdd
          items={frequent.data?.items ?? []}
          slot={slotNow}
          onPick={(quick) => start({ quick, slot: slotNow })}
        />
      </div>
    </>
  );
};

// ── 시작하기 ────────────────────────────────────────────────────────────────
// 첫 기록 · 성별·출생연도(영양소 기준) · 추천. 넣어 둔 단계는 표시만 남긴다.
const StartGuide = ({
  preference,
  onStart,
}: {
  preference: MealPreferenceType | null;
  onStart: () => void;
}) => {
  const profileDone = Boolean(preference?.sex && preference?.birthYear);
  return (
    <section className="meal-start" aria-labelledby="meal-start">
      <h2 id="meal-start" className="meal-sec-title">
        식단 시작하기
      </h2>
      <ol className="meal-start-steps">
        <li>
          <span className="meal-start-no" aria-hidden>
            1
          </span>
          <div className="min-w-0">
            <p className="font-bold">첫 끼니 기록하기</p>
            <p className="text-sm text-muted-foreground">
              사진을 넣으면 음식을 찾아 채워요. 직접 적어도 돼요.
              <span className="hidden md:inline">
                {' '}
                화면 아무 데나 사진을 끌어다 놓아도 시작해요.
              </span>
            </p>
          </div>
          <button type="button" className="meal-btn" onClick={onStart}>
            기록하기
          </button>
        </li>
        <li data-done={profileDone ? 'true' : undefined}>
          <span className="meal-start-no" aria-hidden>
            {profileDone ? <Check className="size-4" /> : 2}
          </span>
          <div className="min-w-0">
            <p className="font-bold">성별·출생연도 넣기</p>
            <p className="text-sm text-muted-foreground">영양소 기준을 내 나이·성별에 맞춰요.</p>
          </div>
          {profileDone ? (
            <span className="meal-ok text-sm font-bold">넣었어요</span>
          ) : (
            <Link to={MEAL_PATH.settings} className="meal-btn-line">
              설정
            </Link>
          )}
        </li>
        <li>
          <span className="meal-start-no" aria-hidden>
            3
          </span>
          <div className="min-w-0">
            <p className="font-bold">다음 끼니 추천받기</p>
            <p className="text-sm text-muted-foreground">
              기록이 적어도 좋아하는 음식·알레르기 설정으로 골라 드려요.
            </p>
          </div>
          <Link to={MEAL_PATH.recommend} className="meal-btn-line">
            추천
          </Link>
        </li>
      </ol>
    </section>
  );
};

// ── 오늘 ──────────────────────────────────────────────────────────────────────
const SlotTile = ({
  slot,
  entries,
  siblings,
  onStart,
}: {
  slot: MealSlotType;
  entries: MealEntryType[];
  siblings: string[];
  onStart: (slot: MealSlotType) => void;
}) => {
  const items = entries.flatMap((e) => e.items);
  const first = entries[0];
  if (!first || items.length === 0) {
    return (
      <button type="button" onClick={() => onStart(slot)} className="meal-slot meal-slot-empty">
        <span className="meal-slot-label">{MEAL_SLOT_LABEL[slot]}</span>
        <span className="meal-slot-add">
          <Plus className="size-4" aria-hidden />
          기록하기
        </span>
      </button>
    );
  }
  const sum = summarizeMealNutrition(items);
  const names = items.map((i) => i.name);
  return (
    <MealLink
      to={MEAL_PATH.entry(first.id)}
      siblings={siblings}
      swap
      entryId={first.id}
      className="meal-slot"
    >
      <span className="meal-slot-label">{MEAL_SLOT_LABEL[slot]}</span>
      <span className="meal-slot-foods">
        {names.slice(0, 3).join(', ')}
        {names.length > 3 ? ` 외 ${names.length - 3}` : ''}
      </span>
      <span className="meal-display meal-slot-kcal">
        {sum.kcal !== null ? `${fmt(sum.kcal)}kcal` : '열량 모름'}
      </span>
    </MealLink>
  );
};

const Today = ({
  entries,
  kcal,
  requirement,
  onStart,
}: {
  entries: MealEntryType[];
  kcal: number | null;
  requirement: number | null;
  onStart: (slot: MealSlotType) => void;
}) => {
  const pct = kcal !== null && requirement ? Math.round((kcal / requirement) * 100) : null;
  const meals = TODAY_SLOTS.filter((s) => entriesOf(entries, s).length > 0).length;
  // 상세 패널의 ↑↓ — 칸 순서(아침 → 간식)대로 각 칸의 첫 기록.
  const siblings = TODAY_SLOTS.flatMap((s) =>
    entriesOf(entries, s)
      .slice(0, 1)
      .map((e) => e.id),
  );
  return (
    <section className="meal-sec meal-area-today" aria-labelledby="meal-today">
      <div className="meal-sec-head">
        <h2 id="meal-today" className="meal-sec-title">
          오늘 먹은 것
        </h2>
        <span className="text-sm font-semibold text-muted-foreground">{meals}끼 기록</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {TODAY_SLOTS.map((slot) => (
          <SlotTile
            key={slot}
            slot={slot}
            entries={entriesOf(entries, slot)}
            siblings={siblings}
            onStart={onStart}
          />
        ))}
      </div>
      <div className="mt-6">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="meal-display meal-kcal-num">{fmt(kcal ?? 0)}</span>
          <span className="text-lg font-bold text-muted-foreground">
            / {requirement ? fmt(requirement) : '—'} kcal
          </span>
          {pct !== null ? (
            <span className="ml-auto font-extrabold tabular-nums">{pct}%</span>
          ) : null}
        </div>
        <div
          className="meal-bar mt-2.5"
          role="progressbar"
          aria-label="하루 필요 열량 대비"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, pct ?? 0)}
        >
          <span style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          하루 필요 열량 대비예요. 영양소는 최근 14일 평균으로 따로 봐요.
        </p>
      </div>
    </section>
  );
};

// ── 다음 끼니 추천 ───────────────────────────────────────────────────────────
const Recommendation = ({ latest }: { latest: MealRecommendationType | null }) => {
  const sides = latest?.sides ?? [];
  return (
    <section className="meal-sec meal-area-reco" aria-labelledby="meal-reco">
      <div className="meal-sec-head">
        <h2 id="meal-reco" className="meal-sec-title">
          {latest ? `${MEAL_SLOT_LABEL[latest.targetSlot]} 추천` : '다음 끼니 추천'}
        </h2>
        <Link
          to={MEAL_PATH.recommend}
          className="text-sm font-bold underline-offset-4 hover:underline"
        >
          추천 보기
        </Link>
      </div>
      {latest && latest.items.length > 0 ? (
        <>
          <ul>
            {latest.items.slice(0, 3).map((item) => (
              <li key={item.name} className="meal-reco-item">
                <p className="meal-reco-name">{item.name}</p>
                <p className="meal-reco-reason">{item.reason}</p>
              </li>
            ))}
          </ul>
          {sides.length > 0 ? (
            <p className="meal-sides">
              <span className="font-extrabold">곁들이면 좋아요</span>{' '}
              {sides.map((s) => `${s.name}(${s.nutrients.join('·')})`).join(', ')}
            </p>
          ) : null}
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground">아직 받은 추천이 없어요.</p>
          <Link to={MEAL_PATH.recommend} className="meal-btn">
            추천받기
          </Link>
        </div>
      )}
    </section>
  );
};

// ── 영양정보 라벨 ────────────────────────────────────────────────────────────
// 많음을 맨 앞(줄일 것), 그다음 부족·조금 부족, 기록 더 필요. 충분·판단 보류는 개수만.
const FLAG_ORDER: Record<MealNutrientDisplayKey, number> = {
  high: 0,
  low: 1,
  borderline: 2,
  recordGap: 3,
  ok: 9,
  unknown: 9,
};
const MAX_FLAGGED = 7;

const amountOf = (n: MealNutrientResultType): string =>
  n.intakePerDay === null ? '—' : `${formatNutrientAmount(n.intakePerDay)}${n.unit}`;

const NutritionLabel = ({
  analysis,
  loading,
}: {
  analysis: MealNutritionAnalysisType | null;
  loading: boolean;
}) => (
  <section className="meal-label meal-area-label xl:sticky xl:top-10" aria-labelledby="meal-label">
    <div className="meal-label-head">
      <h2 id="meal-label" className="meal-label-title">
        영양정보
      </h2>
      <p className="meal-label-total">
        최근 14일 하루 평균
        <br />
        <b>{analysis?.energy.intakePerDay ? fmt(analysis.energy.intakePerDay) : '—'}</b> kcal
      </p>
    </div>
    {!analysis ? (
      <p className="p-4 text-sm text-muted-foreground">
        {loading ? '불러오는 중…' : '영양 정보를 불러오지 못했어요.'}
      </p>
    ) : analysis.status === 'insufficient' ? (
      <p className="p-4 text-sm">{analysis.insufficientReason}</p>
    ) : (
      <LabelRows analysis={analysis} />
    )}
  </section>
);

const LabelRows = ({ analysis }: { analysis: MealNutritionAnalysisType }) => {
  const rows = analysis.nutrients.map((n) => ({ n, d: mealNutrientDisplayStatus(n) }));
  const flagged = rows
    .filter((r) => FLAG_ORDER[r.d] < 9)
    .sort((a, b) => FLAG_ORDER[a.d] - FLAG_ORDER[b.d] || (a.n.percent ?? 0) - (b.n.percent ?? 0))
    .slice(0, MAX_FLAGGED);
  const ok = rows.filter((r) => r.d === 'ok').length;
  const unknown = rows.filter((r) => r.d === 'unknown').length;
  return (
    <>
      <div className="meal-label-colhead">
        <span>기록 {analysis.analyzedDays}일 기준</span>
        <span>1일 기준치에 대한 비율</span>
      </div>
      <div className="meal-label-row">
        <span>
          <span className="meal-label-name">열량</span>
          <span className="meal-label-amt">
            {analysis.energy.intakePerDay !== null
              ? `${fmt(analysis.energy.intakePerDay)}kcal`
              : '—'}
          </span>
        </span>
        <span className="meal-label-pct">{analysis.energy.percent ?? '—'}%</span>
      </div>
      {flagged.map(({ n, d }) => (
        <div key={n.key} className="meal-label-row">
          <span>
            <span className="meal-label-name">{n.label}</span>
            <span className="meal-label-amt">{amountOf(n)}</span>
          </span>
          <span className="whitespace-nowrap">
            <span className="meal-label-pct">{n.percent ?? '—'}%</span>
            <span className={cn('meal-label-flag', MEAL_NUTRIENT_TONE[d])}>
              {MEAL_NUTRIENT_STATUS_LABEL[d]}
            </span>
          </span>
        </div>
      ))}
      <p className="meal-label-foot">
        충분 {ok}개{unknown > 0 ? `, 판단 보류 ${unknown}개` : ''}
      </p>
      <p className="meal-label-fine">
        1일 기준치에 대한 비율(%)은 2020 한국인 영양소 섭취기준으로 계산했어요. 성별·나이에 따라
        달라요.
      </p>
      <div className="px-[0.85rem] pb-4">
        <Link to={MEAL_PATH.nutrition} className="meal-btn-line">
          영양 자세히
        </Link>
      </div>
    </>
  );
};

// ── 최근 7일 ──────────────────────────────────────────────────────────────────
const Week = ({
  week,
  today,
  requirement,
  streak,
}: {
  week: { date: string; kcal: number | null; count: number }[];
  today: string;
  requirement: number | null;
  streak: number;
}) => {
  // 위에 여유를 둬 필요 열량 점선이 틀 위쪽 선처럼 보이지 않게 한다.
  const max = Math.max(requirement ?? 0, ...week.map((d) => d.kcal ?? 0), 1) * 1.18;
  const recorded = week.filter((d) => d.count > 0).length;
  return (
    <section className="meal-sec meal-area-week" aria-labelledby="meal-week">
      <div className="meal-sec-head">
        <h2 id="meal-week" className="meal-sec-title">
          최근 7일
        </h2>
        {requirement ? <span className="text-xs meal-faint">점선은 하루 필요 열량</span> : null}
      </div>
      <div className="meal-week">
        {week.map((d) => (
          <div key={d.date} className="meal-week-col" data-today={d.date === today}>
            <div className="meal-week-track" aria-hidden>
              {requirement ? (
                <span
                  className="meal-week-ref"
                  style={{ bottom: `${(requirement / max) * 100}%` }}
                />
              ) : null}
              <span
                className="meal-week-bar"
                style={{ height: `${((d.kcal ?? 0) / max) * 100}%` }}
              />
            </div>
            <span className="meal-week-day">{weekdayOf(d.date)}</span>
            <span className="meal-week-kcal">{d.kcal ? fmt(d.kcal) : ''}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex gap-10">
        <div className="meal-stat">
          <span className="meal-display meal-stat-num">{recorded}일</span>
          <span className="text-sm text-muted-foreground">7일 중 기록</span>
        </div>
        <div className="meal-stat">
          <span className="meal-display meal-stat-num">{streak}일</span>
          <span className="text-sm text-muted-foreground">연속 기록</span>
        </div>
      </div>
    </section>
  );
};

const Insight = ({ insight }: { insight: { title: string; detail: string } | null }) =>
  insight ? (
    <section className="meal-sec meal-area-insight" aria-labelledby="meal-insight">
      <div className="meal-sec-head">
        <h2 id="meal-insight" className="meal-sec-title">
          최근 30일 식사 습관
        </h2>
        <Link to={MEAL_PATH.stats} className="text-sm font-bold underline-offset-4 hover:underline">
          통계 보기
        </Link>
      </div>
      <p className="meal-insight">{insight.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{insight.detail}</p>
    </section>
  ) : null;

const QuickAdd = ({
  items,
  slot,
  onPick,
}: {
  items: FrequentMealItemType[];
  slot: MealSlotType;
  onPick: (item: FrequentMealItemType) => void;
}) =>
  items.length > 0 ? (
    <section className="meal-sec meal-area-quick" aria-labelledby="meal-quick">
      <div className="meal-sec-head">
        <h2 id="meal-quick" className="meal-sec-title">
          {MEAL_SLOT_LABEL[slot]}에 자주 먹은 음식
        </h2>
        <span className="text-sm text-muted-foreground">누르면 바로 기록</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 10).map((item) => (
          <button key={item.name} type="button" onClick={() => onPick(item)} className="meal-chip">
            <Plus className="size-4" aria-hidden />
            {item.name}
          </button>
        ))}
      </div>
    </section>
  ) : null;
