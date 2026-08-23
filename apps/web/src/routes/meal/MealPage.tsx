import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChartNoAxesColumn, Loader2, Settings2, Sparkles, UtensilsCrossed } from 'lucide-react';
import type { MealEntryType, MealSlotType } from '@repo/api-contract';
import { useInfiniteMealEntries, useMealCalendar, useMealEntries, useMealStats } from '@repo/shared';
import {
  FOOD_CUISINE_LABEL,
  FOOD_DISH_TYPE_LABEL,
  FOOD_MAIN_INGREDIENT_LABEL,
  MEAL_SLOT_LABEL,
  MEAL_SLOT_ORDER,
  MEAL_TYPE_LABEL,
  mealDateLabel,
  mealNutritionLabel,
  monthRange,
  summarizeMealNutrition,
  toLocalDateKey,
  toLocalMonthKey,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import { MealPhotoImg } from './MealPhotoImg';
import { MealPreferenceTab } from './MealPreferenceTab';
import { MealRecommendTab } from './MealRecommendTab';

// 내 식단 — 기록/달력/통계. 입력(사진)은 앱에서만 하므로 이 페이지는 조회 전용이고,
// 상단에 그 사실을 안내한다. 차트 라이브러리를 쓰지 않는 리포 관례대로 막대는 div 폭으로 그린다.

type Tab = 'list' | 'calendar' | 'stats' | 'recommend' | 'preference';

const TABS: ReadonlyArray<{ value: Tab; label: string; icon: typeof UtensilsCrossed }> = [
  { value: 'list', label: '기록', icon: UtensilsCrossed },
  { value: 'calendar', label: '달력', icon: CalendarDays },
  { value: 'stats', label: '통계', icon: ChartNoAxesColumn },
  { value: 'recommend', label: '추천', icon: Sparkles },
  { value: 'preference', label: '설정', icon: Settings2 },
];

const timeText = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

export const MealPage = () => {
  const [tab, setTab] = useState<Tab>('list');

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">내 식단</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            기록은 앱에서 사진으로 남기고, 여기서는 모아 보고 분석해요.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'list' ? (
        <MealList />
      ) : tab === 'calendar' ? (
        <MealCalendar />
      ) : tab === 'stats' ? (
        <MealStats />
      ) : tab === 'recommend' ? (
        <MealRecommendTab />
      ) : (
        <MealPreferenceTab />
      )}
    </div>
  );
};

// ── 기록 ────────────────────────────────────────────────────────────────────
const MealList = () => {
  const list = useInfiniteMealEntries({ limit: 30 });
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const today = toLocalDateKey(new Date());

  if (list.isLoading) {
    return <Loading />;
  }
  if (list.error) {
    return <ErrorBox onRetry={() => void list.refetch()} />;
  }
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          아직 기록이 없어요. 앱에서 사진으로 첫 끼니를 남겨 보세요.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((entry, i) => {
        const prev = items[i - 1];
        const showDate = !prev || prev.eatenDate !== entry.eatenDate;
        return (
          <div key={entry.id} className="space-y-2">
            {showDate ? (
              <p className="pt-2 text-xs font-semibold text-muted-foreground">
                {mealDateLabel(entry.eatenDate, today)} · {entry.eatenDate}
              </p>
            ) : null}
            <MealEntryRow entry={entry} />
          </div>
        );
      })}
      {list.hasNextPage ? (
        <div className="pt-2 text-center">
          <Button
            variant="outline"
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const MealEntryRow = ({ entry }: { entry: MealEntryType }) => {
  const mains = entry.items.filter((i) => i.isMain);
  const sides = entry.items.filter((i) => !i.isMain);
  // 카탈로그에 영양이 없는 음식이 흔해서(외식 브랜드 메뉴 등) 값이 하나도 없으면 줄을 그리지 않는다.
  const kcalText = mealNutritionLabel(summarizeMealNutrition(entry.items));
  return (
    <Card>
      <CardContent className="flex gap-3 py-4">
        {entry.photos.length > 0 ? (
          <MealPhotoImg token={entry.photos[0]!.token} className="size-20 shrink-0" />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
              {MEAL_SLOT_LABEL[entry.slot]}
            </span>
            <span>{timeText(entry.eatenAt)}</span>
            {entry.mealType ? <span>{MEAL_TYPE_LABEL[entry.mealType]}</span> : null}
            {entry.placeName ? (
              entry.placeId ? (
                <Link
                  to={`/restaurants-v2/${entry.placeId}`}
                  className="truncate text-primary hover:underline"
                >
                  · {entry.placeName}
                </Link>
              ) : (
                <span className="truncate">· {entry.placeName}</span>
              )
            ) : null}
          </div>
          <p className="truncate text-sm font-medium">{mains.map((i) => i.name).join(', ') || '(음식 없음)'}</p>
          {sides.length > 0 ? (
            <p className="truncate text-xs text-muted-foreground">곁들임 {sides.map((i) => i.name).join(', ')}</p>
          ) : null}
          {kcalText ? <p className="text-xs text-muted-foreground">{kcalText}</p> : null}
          {entry.memo ? <p className="truncate text-xs italic text-muted-foreground">{entry.memo}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
};

// ── 달력 ────────────────────────────────────────────────────────────────────
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const MealCalendar = () => {
  const [month, setMonth] = useState(() => toLocalMonthKey(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
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

  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(toLocalMonthKey(new Date(y!, (m ?? 1) - 1 + delta, 1)));
    setSelected(null);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <Button variant="ghost" size="sm" onClick={() => shift(-1)}>
            ◀
          </Button>
          <CardTitle className="text-base">{month.replace('-', '년 ')}월</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => shift(1)}>
            ▶
          </Button>
        </CardHeader>
        <CardContent>
          {cal.isLoading ? (
            <Loading />
          ) : (
            <>
              <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((date, i) => {
                  const info = date ? byDate.get(date) : undefined;
                  const isSel = date !== null && date === selected;
                  return (
                    <button
                      key={date ?? `pad-${i}`}
                      type="button"
                      disabled={!date}
                      onClick={() => setSelected(isSel ? null : date)}
                      className={cn(
                        'flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-transparent text-sm',
                        date ? 'hover:bg-accent' : 'cursor-default',
                        isSel && 'border-primary bg-accent',
                      )}
                    >
                      {date ? (
                        <>
                          <span className={info ? '' : 'text-muted-foreground'}>{Number(date.slice(-2))}</span>
                          <span className="flex h-1.5 gap-0.5">
                            {(info?.slots ?? [])
                              .slice()
                              .sort((a, b) => MEAL_SLOT_ORDER[a] - MEAL_SLOT_ORDER[b])
                              .slice(0, 3)
                              .map((s: MealSlotType) => (
                                <span key={s} className="size-1.5 rounded-full bg-primary" />
                              ))}
                          </span>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selected} 기록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dayList.isLoading ? (
              <Loading />
            ) : (dayList.data?.items.length ?? 0) === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">이 날은 기록이 없어요.</p>
            ) : (
              dayList.data!.items.map((e) => <MealEntryRow key={e.id} entry={e} />)
            )}
          </CardContent>
        </Card>
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

  if (stats.isLoading) return <Loading />;
  if (stats.error) return <ErrorBox onRetry={() => void stats.refetch()} />;
  const data = stats.data;
  if (!data) return null;

  const maxDay = Math.max(1, ...data.byDate.map((d) => d.count));

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1 sm:w-fit">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRangeKey(r.key)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium sm:flex-none',
              rangeKey === r.key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className={data.nutrition.avgKcalPerDay !== null ? 'grid grid-cols-2 gap-3 sm:grid-cols-4' : 'grid grid-cols-3 gap-3'}>
        <StatTile label="기록" value={`${data.entryCount}끼`} sub={`${data.recordedDays}/${data.totalDays}일`} />
        <StatTile label="연속" value={`${data.streakDays}일`} sub="기록한 날" />
        <StatTile label="겹침" value={`${Math.round(data.repeatRate * 100)}%`} sub="7일 내 재등장" />
        {data.nutrition.avgKcalPerDay !== null ? (
          <StatTile
            label="하루 평균"
            value={`${Math.round(data.nutrition.avgKcalPerDay).toLocaleString('ko-KR')}kcal`}
            sub={`기록한 날 기준 · ${Math.round(data.nutrition.coverage * 100)}% 반영`}
          />
        ) : null}
      </div>
      {data.nutrition.avgKcalPerDay !== null && data.nutrition.coverage < 1 ? (
        <p className="text-xs text-muted-foreground">
          영양 정보가 있는 음식만 더한 값이라 실제보다 적게 나와요(외식 브랜드 메뉴는 공개된 값이 없어요).
        </p>
      ) : null}

      <section className="space-y-2" aria-labelledby="meal-weekly-insights-title">
        <div>
          <h3 id="meal-weekly-insights-title" className="font-semibold">
            주간 인사이트
          </h3>
          <p className="text-xs text-muted-foreground">최근 7일과 직전 7일을 비교한 기록 기반 관찰이에요.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.insights.map((insight) => (
            <div
              key={insight.key}
              className={cn(
                'rounded-lg border px-3 py-2.5',
                insight.tone === 'positive' && 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
                insight.tone === 'attention' && 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
                insight.tone === 'info' && 'bg-muted/50',
              )}
            >
              <p className="text-sm font-medium">{insight.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{insight.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-2">
        <div>
          <h3 className="font-semibold">추천 반응</h3>
          <p className="text-xs text-muted-foreground">선택한 추천이 실제 기록으로 이어졌는지 보여 줘요.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="추천 선택" value={`${data.recommendation.chosenCount}건`} />
          <StatTile label="추천 기록" value={`${data.recommendation.loggedCount}건`} />
          <StatTile label="추천 평가" value={`${data.recommendation.ratedCount}건`} />
          <StatTile
            label="추천 수락률"
            value={`${Math.round(data.recommendation.acceptanceRate * 100)}%`}
            sub="선택 대비 기록"
          />
        </div>
      </div>

      {data.entryCount === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            이 기간에는 기록이 없어요.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <BarCard title="조리 형태" rows={data.byDishType} labels={FOOD_DISH_TYPE_LABEL} />
            <BarCard title="주재료" rows={data.byMainIngredient} labels={FOOD_MAIN_INGREDIENT_LABEL} />
            <BarCard title="요리 계통" rows={data.byCuisine} labels={FOOD_CUISINE_LABEL} />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">자주 먹은 음식</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {data.topFoods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">아직 반복된 음식이 없어요.</p>
                ) : (
                  data.topFoods.map((f) => (
                    <div key={f.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {f.count}회 · 마지막 {f.lastEatenDate.slice(5)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">날짜별 끼니 수</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-16 items-end gap-0.5">
                {data.byDate.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date} · ${d.count}끼`}
                    className={cn('flex-1 rounded-sm', d.count > 0 ? 'bg-primary' : 'bg-muted')}
                    style={{ height: `${Math.max(4, (d.count / maxDay) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{data.byDate[0]?.date.slice(5)}</span>
                <span>{data.byDate[data.byDate.length - 1]?.date.slice(5)}</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

const StatTile = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <Card>
    <CardContent className="py-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </CardContent>
  </Card>
);

const BarCard = ({
  title,
  rows,
  labels,
}: {
  title: string;
  rows: { key: string; label: string; count: number }[];
  labels: Record<string, string>;
}) => {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">표시할 자료가 없어요.</p>
        ) : (
          rows.slice(0, 8).map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-xs">{labels[r.key] ?? r.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">{r.count}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin" /> 불러오는 중…
  </div>
);

const ErrorBox = ({ onRetry }: { onRetry: () => void }) => (
  <Card>
    <CardContent className="space-y-3 py-8 text-center">
      <p className="text-sm text-destructive">불러오지 못했습니다.</p>
      <Button variant="outline" onClick={onRetry}>
        재시도
      </Button>
    </CardContent>
  </Card>
);
