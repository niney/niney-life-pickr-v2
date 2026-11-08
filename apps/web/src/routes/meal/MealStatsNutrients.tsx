import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  MEAL_NUTRIENT_MIN_COVERAGE,
  type MealStatsNutrientKeyType,
  type MealStatsNutrientRowType,
  type MealStatsNutrientsResultType,
} from '@repo/api-contract';
import {
  MEAL_NUTRIENT_DATA_SOURCES,
  MEAL_NUTRIENT_REFERENCE_LABEL,
  MEAL_NUTRIENT_STATUS_LABEL,
  MEAL_NUTRIENT_STATUS_ORDER,
  formatNutrientAmount,
  mealNutrientDisplayStatus,
  mealNutrientProfileLabel,
  type MealNutrientDisplayKey,
} from '@repo/utils';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import { useIsDesktopLg } from '~/lib/useMediaQuery';
import { MealNutrientLine, MealNutrientMeter } from './MealNutrientLine';
import { nutrientVsRefText } from './mealNutrientTone';
import { MEAL_PATH } from './mealPaths';

// 통계의 영양소(2026-11-08) — 고른 기간을 영양 탭과 같은 셈(두 끼 이상 기록한 날의 하루 평균, 2020 섭취기준·판정)으로 본다.
// 모양도 영양 탭 '영양소 점검'과 같게(사용자 "영양에서 나왔던 디자인처럼") — 흰 카드에 같은 줄 부품(MealNutrientLine: 이름 +
// 판정 칩 + "양 / 기준 (N%)" + 막대). 통계에만 있는 것:
// - 영양 탭에 없는 탄수화물·당류·지방·포화지방·콜레스테롤 — 판정 없이 열량 중 비율과 적정 범위. 기준 대비 막대와 모양이 다른
//   범위 막대로 두 비율(기준의 % · 열량 중 %)을 한 축에 섞지 않는다.
// - 줄을 누르면 그 영양소의 흐름(날마다·주마다)과 많이 준 음식 — 넓은 화면은 오른쪽 카드(영양 탭의 조언 카드 자리), 좁은
//   화면은 그 줄 아래.
// 위 묶음(열량·탄수화물·단백질·지방·나트륨·콜레스테롤)은 차례 고정, 아래 묶음(식이섬유·비타민·무기질)은 영양 탭처럼 판정
// 순이고 많음·부족·조금 부족만 펼쳐 둔다 — 21줄을 다 펼치면 통계의 다른 구역이 많이 밀린다.

const REF_LABEL: Record<'eer' | 'rni' | 'ai' | 'cdrr', string> = {
  eer: '필요량',
  ...MEAL_NUTRIENT_REFERENCE_LABEL,
};
// 날마다 막대는 이 일수까지(1주·1달), 더 길면(3달) 주마다. 비타민·무기질은 하루하루 들쭉날쭉해 늘 주마다.
const DAILY_MAX_DAYS = 31;
const WEEK = 7;
// 값을 아는 기록의 열량이 이 비율 아래면 '정보 N%'를 붙인다 — 모르는 기록은 더하지 않아 양이 실제보다 적다
// (탄수화물 93.5g 인데 열량의 39% 처럼 양과 비율이 어긋나 보이는 까닭을 밝힌다).
const COVERAGE_NOTE = 0.9;
// 줄 아래 '주로 …에서' 음식 수 — 영양 탭(주로 먹은 음식 3개)과 같게.
const SOURCE_FOODS = 3;
// 아래 묶음에서 처음부터 펼쳐 두는 판정.
const OPEN_STATUSES: ReadonlySet<MealNutrientDisplayKey> = new Set(['low', 'borderline', 'high']);

const pct = (share: number): string => `${Math.round(share * 100)}%`;
// 0~1 비율 → 막대 위치(%) — 소수 첫째까지(0.65 - 0.55 가 10.000000000000009 로 새지 않게).
const pctNum = (share: number): number => Math.round(share * 1000) / 10;
// 흐름 표·설명의 양 — 모르면 줄표.
const amountText = (v: number | null, unit: string): string =>
  v === null ? '—' : `${formatNutrientAmount(v)}${unit}`;
const shortDate = (d: string): string => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
// 받침이 있으면 '을', 없으면 '를' — 비타민 A·C·D 처럼 영문으로 끝나면 읽는 소리(에이·씨·디)가 모음으로 끝나 '를'.
const objectParticle = (word: string): string => {
  const c = word.charCodeAt(word.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 === 0 ? '를' : '을';
  return '를';
};

// 에너지적정비율 문구 — '적정 55~65%', 상한만 있는 성인 포화지방은 '성인 7% 미만'.
const rangeText = (range: MealStatsNutrientRowType['energyRange']): string | null => {
  if (!range || range.max === null) return null;
  const max = Math.round(range.max * 100);
  return range.min !== null ? `적정 ${Math.round(range.min * 100)}~${max}%` : `성인 ${max}% 미만`;
};

// 화면 판정 — 기록이 모자라 판단하지 않은 결과(insufficient)면 칩·색을 붙이지 않는다(전부 '판단 보류'로 덮지 않게).
const displayOf = (r: MealStatsNutrientRowType, judged: boolean): MealNutrientDisplayKey | null =>
  judged && r.status ? mealNutrientDisplayStatus({ status: r.status, recordGap: r.recordGap }) : null;
const rankOf = (d: MealNutrientDisplayKey | null): number => (d ? MEAL_NUTRIENT_STATUS_ORDER[d] : 99);

interface RowView {
  status: MealNutrientDisplayKey | null;
  value: string;
  bar: ReactNode;
  note: string | null;
  meta: string | null;
}

const viewOf = (r: MealStatsNutrientRowType, judged: boolean): RowView => {
  const status = displayOf(r, judged);
  const meta: string[] = [];
  let value: string;
  let bar: ReactNode = null;
  if (r.reference) {
    // 섭취기준이 있는 줄(열량은 필요량) — 영양 탭과 같은 문구·막대. 단백질은 열량 중 비율도 덧붙여 탄수화물·지방과 견준다.
    value = nutrientVsRefText(r.intakePerDay, r.unit, REF_LABEL[r.reference.kind], r.reference.amount, r.percent);
    bar = <MealNutrientMeter percent={r.percent} tone={status ?? undefined} />;
    if (r.energyShare !== null) {
      const range = rangeText(r.energyRange);
      meta.push(`열량의 ${pct(r.energyShare)}${range ? ` (${range})` : ''}`);
    }
  } else {
    // 판정 없는 줄 — 정보가 모자라면(60% 미만) 양만, 비율·막대는 그리지 않는다(모자란 자료로 길이를 그리면 오해한다).
    const weak = r.intakePerDay === null || r.coverage < MEAL_NUTRIENT_MIN_COVERAGE;
    const amount = r.intakePerDay === null ? '-' : `${formatNutrientAmount(r.intakePerDay)}${r.unit}`;
    if (!weak && r.energyShare !== null) {
      const range = rangeText(r.energyRange);
      value = `${amount} · 열량의 ${pct(r.energyShare)}${range ? ` (${range})` : ''}`;
      bar = <RangeBar share={r.energyShare} range={r.energyRange} />;
    } else {
      value = amount;
    }
    if (r.coverage < COVERAGE_NOTE) meta.push(r.coverage > 0 ? `정보 ${pct(r.coverage)}` : '정보 없음');
  }
  const sources = r.topFoods.slice(0, SOURCE_FOODS).map((f) => f.name);
  if (sources.length > 0) meta.push(`주로 ${sources.join('·')}에서`);
  return { status, value, bar, note: r.note, meta: meta.length > 0 ? meta.join(' · ') : null };
};

// 접힌 줄의 판정 수 — '기록 더 필요 5 · 충분 1'.
const statusCounts = (rows: MealStatsNutrientRowType[], judged: boolean): string => {
  const counts = new Map<MealNutrientDisplayKey, number>();
  for (const r of rows) {
    const d = displayOf(r, judged);
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => rankOf(a[0]) - rankOf(b[0]))
    .map(([d, n]) => `${MEAL_NUTRIENT_STATUS_LABEL[d]} ${n}`)
    .join(' · ');
};

export const MealStatsNutrients = ({
  data,
  loading,
  rangeLabel,
}: {
  data: MealStatsNutrientsResultType | undefined;
  loading: boolean;
  /** 통계에서 고른 기간(1주·1달·3달). */
  rangeLabel: string;
}) => {
  const titleId = useId();
  const restId = useId();
  const detailId = useId();
  const wide = useIsDesktopLg();
  const [picked, setPicked] = useState<MealStatsNutrientKeyType | null>(null);
  const [showRest, setShowRest] = useState(false);

  // 기간을 제목에 둔다 — 줄 모양이 영양 탭과 같아지는 만큼 숫자가 다른 까닭(영양 탭은 최근 14일)을 제목에서 바로 보이게.
  const header = (
    <CardHeader>
      <CardTitle id={titleId} className="text-base">
        영양소 <span className="font-normal text-muted-foreground">· {rangeLabel}</span>
      </CardTitle>
      <p className="text-sm text-muted-foreground">
        두 끼 이상 기록한 날의 하루 평균을 한국인 영양소 섭취기준(2020)과 견줘요('안 먹음'으로 표시한 끼니도 한 끼로 세요).
        판정은 영양 탭과 같은 셈이고, 기간만 위에서 고른 대로예요.
      </p>
    </CardHeader>
  );

  if (!data) {
    return (
      <Card role="region" aria-labelledby={titleId}>
        {header}
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {loading ? '불러오는 중…' : '영양소를 불러오지 못했어요.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const judged = data.status === 'ok';
  const core = data.rows.filter((r) => r.group === 'core');
  // 아래 묶음 — 영양 탭처럼 판정 순(같은 판정은 원래 차례 — sort 는 안정 정렬).
  const micro = data.rows
    .filter((r) => r.group === 'micro')
    .sort((a, b) => rankOf(displayOf(a, judged)) - rankOf(displayOf(b, judged)));
  const open = micro.filter((r) => {
    const d = displayOf(r, judged);
    return d !== null && OPEN_STATUSES.has(d);
  });
  const rest = micro.filter((r) => !open.includes(r));
  const counts = statusCounts(rest, judged);
  // 넓은 화면은 오른쪽 카드가 비지 않게 하나를 골라 둔다 — 많음 먼저, 다음 모자란 것, 없으면 열량.
  const defaultKey =
    core.find((r) => displayOf(r, judged) === 'high')?.key ??
    core.find((r) => {
      const d = displayOf(r, judged);
      return d === 'low' || d === 'borderline';
    })?.key ??
    'kcal';
  const selectedKey = picked ?? (wide ? defaultKey : null);
  const selected = data.rows.find((r) => r.key === selectedKey) ?? null;
  const pick = (key: MealStatsNutrientKeyType) =>
    // 좁은 화면은 같은 줄을 다시 누르면 접는다. 넓은 화면은 늘 하나가 열려 있다.
    setPicked(wide ? key : selectedKey === key ? null : key);
  const meals = data.meals.reduce((sum, m) => sum + m, 0);
  const warnings = [
    ...(data.status === 'insufficient' && data.insufficientReason ? [data.insufficientReason] : []),
    ...data.notes,
  ];

  const rowEl = (r: MealStatsNutrientRowType) => {
    const active = selectedKey === r.key;
    return (
      <li key={r.key}>
        <StatsRow
          row={r}
          view={viewOf(r, judged)}
          active={active}
          wide={wide}
          detailId={detailId}
          onPick={() => pick(r.key)}
        />
        {!wide && active ? <InlineDetail id={detailId} row={r} days={data} /> : null}
      </li>
    );
  };

  const list = (
    <Card role="region" aria-labelledby={titleId}>
      {header}
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            {rangeLabel} 중 <b>{data.analyzedDays}일</b> · 끼니 {meals}개
          </span>
          <span className="text-muted-foreground">{mealNutrientProfileLabel(data.profile)}</span>
        </div>
        {warnings.length > 0 ? (
          <div className="meal-note meal-note-block text-xs" data-tone="warn">
            <ul className="space-y-1">
              {warnings.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            {data.profile.basis === 'default' ? (
              <Link to={MEAL_PATH.settings} className="inline-block font-medium underline underline-offset-2">
                설정에서 성별·출생연도 넣기
              </Link>
            ) : null}
          </div>
        ) : null}
        {data.analyzedDays > 0 ? (
          <>
            <ul>{core.map(rowEl)}</ul>
            <div className="meal-nline-group">
              <h4 className="text-sm font-bold">식이섬유·비타민·무기질</h4>
              {open.length > 0 ? <ul className="mt-1">{open.map(rowEl)}</ul> : null}
              {rest.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="meal-nline-more"
                    aria-expanded={showRest}
                    aria-controls={showRest ? restId : undefined}
                    onClick={() => setShowRest((v) => !v)}
                  >
                    <span className="underline underline-offset-2">
                      {showRest
                        ? '접기'
                        : open.length > 0
                          ? `나머지 ${rest.length}가지 더 보기`
                          : `${rest.length}가지 보기`}
                    </span>
                    {!showRest && counts ? (
                      <span className="text-xs font-normal text-muted-foreground">{counts}</span>
                    ) : null}
                  </button>
                  {showRest ? <ul id={restId}>{rest.map(rowEl)}</ul> : null}
                </>
              ) : null}
            </div>
          </>
        ) : null}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            탄수화물·당류·지방·포화지방·콜레스테롤은 음식 표준값으로 어림해 많고 적음을 따지지 않고, 열량 중 비율만 적정
            범위와 나란히 둬요. '정보 N%'는 그 영양소 값을 아는 기록의 열량 비율이에요 — 모르는 기록은 더하지 않아 양이
            실제보다 적을 수 있어요.
          </p>
          <p>
            채우는 법과 영양제 조언(최근 14일 기준)은{' '}
            <Link to={MEAL_PATH.nutrition} className="font-bold underline underline-offset-2">
              영양
            </Link>
            에서 볼 수 있어요.
          </p>
          <p>{MEAL_NUTRIENT_DATA_SOURCES}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (!wide) return list;
  // 넓은 화면 — 영양 탭(점검 카드 | 조언 카드)처럼 두 카드를 나란히, 오른쪽은 고른 영양소의 흐름.
  return (
    <div className="grid grid-cols-2 items-start gap-6">
      {list}
      <div className="sticky top-10">
        {selected && data.analyzedDays > 0 ? (
          <DetailCard id={detailId} row={selected} days={data} />
        ) : null}
      </div>
    </div>
  );
};

const RangeBar = ({ share, range }: { share: number; range: MealStatsNutrientRowType['energyRange'] }) => {
  const min = range?.min ?? 0;
  return (
    <span className="meal-range" aria-hidden>
      {range && range.max !== null ? (
        <span className="meal-range-band" style={{ left: `${pctNum(min)}%`, width: `${pctNum(range.max - min)}%` }} />
      ) : null}
      <span className="meal-range-fill" style={{ width: `${Math.min(100, pctNum(share))}%` }} />
    </span>
  );
};

// 줄 하나 — 영양 탭과 같은 줄 부품을 줄 전체 단추로 감싼다(넓은 화면은 오른쪽 카드에 보일 것을 고르는 단추, 좁은 화면은
// 아래로 펼치는 단추). 누를 수 있다는 표시로 값 뒤에 작은 화살표.
const StatsRow = ({
  row,
  view,
  active,
  wide,
  detailId,
  onPick,
}: {
  row: MealStatsNutrientRowType;
  view: RowView;
  active: boolean;
  wide: boolean;
  detailId: string;
  onPick: () => void;
}) => {
  const Arrow = wide ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      className={cn('meal-nline-btn space-y-1', row.parent && 'pl-6')}
      aria-pressed={wide ? active : undefined}
      aria-expanded={wide ? undefined : active}
      aria-controls={active ? detailId : undefined}
      onClick={onPick}
    >
      <MealNutrientLine
        label={row.label}
        status={view.status}
        value={view.value}
        bar={view.bar}
        sub={row.parent !== null}
        trailing={
          <Arrow
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              !wide && active && 'rotate-180',
            )}
            aria-hidden
          />
        }
      />
      {view.note ? <span className="block text-xs text-muted-foreground">{view.note}</span> : null}
      {view.meta ? <span className="block text-xs text-muted-foreground">{view.meta}</span> : null}
    </button>
  );
};

// ── 흐름 ─────────────────────────────────────────────────────────────────────

interface Bar {
  key: string;
  label: string;
  value: number | null;
  // full = 평균에 든 날(주), partial = 한 끼만 기록한 날(평균에서 뺌), empty = 기록 없음.
  state: 'full' | 'partial' | 'empty';
  // 날마다면 그날 끼니 수, 주마다면 평균에 든 날 수.
  count: number;
  // 날마다 — 그날 기록이 없는 끼니에 붙은 '안 먹음' 수.
  skipped: number;
}

// 흐름에 쓰는 날짜별 값 — 서버가 dates 와 같은 순서로 준다. 평균에 든 날(counted)은 서버 판정 그대로 쓴다('안 먹음'도 한 칸).
type FlowDays = Pick<MealStatsNutrientsResultType, 'dates' | 'meals' | 'skipped' | 'counted'>;

const isWeekly = (row: MealStatsNutrientRowType, dates: string[]): boolean =>
  row.group === 'micro' || dates.length > DAILY_MAX_DAYS;

const dailyBars = (row: MealStatsNutrientRowType, days: FlowDays): Bar[] =>
  days.dates.map((d, i) => {
    const m = days.meals[i] ?? 0;
    return {
      key: d,
      label: shortDate(d),
      value: row.daily[i] ?? null,
      state: m === 0 ? 'empty' : days.counted[i] ? 'full' : 'partial',
      count: m,
      skipped: days.skipped[i] ?? 0,
    };
  });

// 주마다 — 끝(오늘)에서부터 7일씩 묶어 평균에 든 날만 평균(점검과 같은 셈). 맨 앞 묶음은 7일이 안 될 수 있다.
const weeklyBars = (row: MealStatsNutrientRowType, days: FlowDays): Bar[] => {
  const { dates } = days;
  const out: Bar[] = [];
  for (let end = dates.length; end > 0; end -= WEEK) {
    const start = Math.max(0, end - WEEK);
    let sum = 0;
    let n = 0;
    for (let i = start; i < end; i += 1) {
      if (!days.counted[i]) continue;
      sum += row.daily[i] ?? 0;
      n += 1;
    }
    out.unshift({
      key: dates[start]!,
      label: `${shortDate(dates[start]!)}~${shortDate(dates[end - 1]!)}`,
      value: n > 0 ? sum / n : null,
      state: n > 0 ? 'full' : 'empty',
      count: n,
      skipped: 0,
    });
  }
  return out;
};

const describeBar = (b: Bar, unit: string, weekly: boolean): string => {
  if (weekly) {
    return b.value === null
      ? `${b.label} · 두 끼 이상 기록한 날 없음`
      : `${b.label} · 하루 평균 ${amountText(b.value, unit)} (두 끼 이상 기록한 ${b.count}일)`;
  }
  if (b.state === 'empty') return `${b.label} · 기록 없음`;
  const head =
    `${b.label} · ${b.value === null ? '값을 아는 기록 없음' : amountText(b.value, unit)} · ${b.count}끼` +
    (b.skipped > 0 ? ` + 안 먹음 ${b.skipped}` : '');
  return b.state === 'partial' ? `${head} — 한 끼만 기록해 평균에서 뺐어요` : head;
};

const flowSummary = (row: MealStatsNutrientRowType, bars: Bar[], weekly: boolean): string => {
  const counted = bars.filter((b): b is Bar & { value: number } => b.state === 'full' && b.value !== null);
  const unit = weekly ? '주' : '날';
  const n = weekly ? '주' : '일';
  if (counted.length === 0) return weekly ? '두 끼 이상 기록한 날이 있는 주가 없어요.' : '두 끼 이상 기록한 날이 없어요.';
  const ref = row.reference;
  if (ref) {
    const hits =
      ref.kind === 'cdrr'
        ? counted.filter((b) => b.value > ref.amount).length
        : counted.filter((b) => b.value >= ref.amount).length;
    const verb = ref.kind === 'cdrr' ? '넘은' : '채운';
    return `${REF_LABEL[ref.kind]}을 ${verb} ${unit} — ${counted.length}${n} 중 ${hits}${n}`;
  }
  const best = counted.reduce((a, b) => (b.value > a.value ? b : a));
  return `가장 많은 ${unit} ${best.label} · ${amountText(best.value, row.unit)}`;
};

const DetailBody = ({ row, days }: { row: MealStatsNutrientRowType; days: FlowDays }) => {
  const weekly = isWeekly(row, days.dates);
  const bars = weekly ? weeklyBars(row, days) : dailyBars(row, days);
  return (
    <>
      {weekly && bars.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          비타민·무기질은 날마다 들쭉날쭉해 주마다 평균으로 봐요. 1주는 평균이 하나라 흐름은 1달·3달에서 보여요.
        </p>
      ) : (
        <FlowChart row={row} bars={bars} weekly={weekly} />
      )}
      <TopFoods row={row} />
    </>
  );
};

// 넓은 화면 — 영양 탭의 조언 카드 자리에 같은 흰 카드로.
const DetailCard = ({ id, row, days }: { id: string; row: MealStatsNutrientRowType; days: FlowDays }) => (
  <Card id={id} role="region" aria-label={`${row.label} 흐름`}>
    <CardHeader>
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle className="text-base">{row.label}</CardTitle>
        <span className="text-xs text-muted-foreground">
          {isWeekly(row, days.dates) ? '주마다 하루 평균' : '날마다 합계'}
        </span>
      </div>
    </CardHeader>
    <CardContent>
      <DetailBody row={row} days={days} />
    </CardContent>
  </Card>
);

// 좁은 화면 — 누른 줄 바로 아래 얇은 테두리 상자.
const InlineDetail = ({ id, row, days }: { id: string; row: MealStatsNutrientRowType; days: FlowDays }) => (
  <div id={id} role="region" aria-label={`${row.label} 흐름`} className="meal-nline-detail">
    <p className="mb-2 text-xs text-muted-foreground">
      {isWeekly(row, days.dates) ? '주마다 하루 평균' : '날마다 합계'}
    </p>
    <DetailBody row={row} days={days} />
  </div>
);

const FlowChart = ({ row, bars, weekly }: { row: MealStatsNutrientRowType; bars: Bar[]; weekly: boolean }) => {
  const [active, setActive] = useState<number | null>(null);
  const ref = row.reference?.amount ?? null;
  const max = Math.max(ref ?? 0, ...bars.map((b) => b.value ?? 0));
  // 기준선이 맨 위에 붙지 않게 약간 띄운다.
  const top = max > 0 ? max * 1.12 : 1;
  const current = active !== null ? (bars[active] ?? null) : null;
  const hasPartial = bars.some((b) => b.state === 'partial');
  const what = weekly ? '그 주' : '그날';
  return (
    <figure className="meal-flow">
      <div
        className="meal-flow-plot"
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setActive(null);
        }}
      >
        {ref !== null ? (
          <span className="meal-flow-ref" style={{ bottom: `${(ref / top) * 100}%` }} aria-hidden />
        ) : null}
        {bars.map((b, i) => (
          <span
            key={b.key}
            className="meal-flow-bar"
            data-state={b.state}
            data-active={active === i ? 'true' : undefined}
            aria-hidden
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') setActive(i);
            }}
            onClick={() => setActive((a) => (a === i ? null : i))}
          >
            {b.value !== null ? <span style={{ height: `${Math.max(1.5, (b.value / top) * 100)}%` }} /> : null}
          </span>
        ))}
      </div>
      <div className="meal-flow-axis" aria-hidden>
        <span>{bars[0]?.label.split('~')[0]}</span>
        <span>{bars[bars.length - 1]?.label.split('~').pop()}</span>
      </div>
      {/* 기준선 이름은 막대를 가리지 않게 아래 범례로 — 선 모양(점선)·흐린 막대를 글자와 함께 둔다. */}
      {ref !== null || hasPartial ? (
        <p className="meal-flow-legend">
          {ref !== null ? (
            <span className="meal-flow-key" data-kind="ref">
              {REF_LABEL[row.reference!.kind]} {formatNutrientAmount(ref)}
              {row.unit}
            </span>
          ) : null}
          {hasPartial ? (
            <span className="meal-flow-key" data-kind="partial">
              한 끼만 기록한 날(평균에서 뺌)
            </span>
          ) : null}
        </p>
      ) : null}
      <figcaption className="meal-flow-cap">
        {current ? describeBar(current, row.unit, weekly) : flowSummary(row, bars, weekly)}
      </figcaption>
      <p className="meal-flow-hint">
        <span className="pointer-coarse:hidden">막대에 올리거나 누르면</span>
        <span className="hidden pointer-coarse:inline">막대를 누르면</span> {what} 값이 보여요.
      </p>
      <details className="meal-flow-table">
        <summary>표로 보기</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{weekly ? '주' : '날짜'}</th>
              <th scope="col">{weekly ? '하루 평균' : '합계'}</th>
              <th scope="col">{weekly ? '두 끼 이상 기록한 날' : '끼니'}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key} data-state={b.state}>
                <th scope="row">{b.label}</th>
                <td>{amountText(b.value, row.unit)}</td>
                <td>{weekly ? `${b.count}일` : `${b.count}끼`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
};

const TopFoods = ({ row }: { row: MealStatsNutrientRowType }) => (
  <div className="meal-nut-foods">
    <p className="meal-nut-foods-title">
      {row.label}
      {objectParticle(row.label)} 많이 준 음식
    </p>
    {row.topFoods.length === 0 ? (
      <p className="text-sm text-muted-foreground">이 영양소 값을 아는 기록이 없어요.</p>
    ) : (
      <ol>
        {row.topFoods.map((f) => (
          <li key={f.name} className="meal-rank-row">
            <span className="truncate font-bold">{f.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {pct(f.share)} · {f.count}번
            </span>
          </li>
        ))}
      </ol>
    )}
    <p className="meal-nut-foods-fine">이 기간 모든 기록(한 끼만 적은 날 포함)에서 그 영양소 중 차지한 몫이에요.</p>
  </div>
);
