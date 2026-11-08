import { useEffect, useId, useRef, useState } from 'react';
import type { MealGroupNutritionType, MealMacroCompositionType } from '@repo/api-contract';
import { MEAL_NUTRIENT_STATUS_LABEL, type MealNutrientDisplayKey } from '@repo/utils';
import type { MealBarMetric } from './mealBarMetrics';
import { MEAL_NUTRIENT_TONE } from './mealNutrientTone';

// 통계 분포 막대 + 묶음 영양 카드(2026-11-08) — 막대 기준을 끼니 수 / 열량 / 나트륨 중에서 고르고, 막대에 올리거나(마우스·키보드
// 포커스) 누르면 그 묶음이 이 기간 내 섭취 중 채운 몫을 영양정보 라벨처럼 보여 준다(튀김: 열량 14% · 지방 37% …).
// 넓은 화면은 옆 칸 위에 겹쳐 띄워(다음 막대를 가리지 않게) 막대를 따라 훑을 수 있고, 휴대폰은 누르면 그 줄 아래로 펼친다.
// 올려 둔 카드는 카드 위로 옮겨 가도 남고(옆으로 건너는 틈은 카드의 투명한 여백이 메운다), Esc 로 닫는다. 누르면 고정된다.

const MACRO_ROWS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'kcal', label: '열량' },
  { key: 'carb', label: '탄수화물' },
  { key: 'protein', label: '단백질' },
  { key: 'fat', label: '지방' },
  { key: 'sodium', label: '나트륨' },
];
// 열량 몫보다 이만큼 크면 '이 묶음이 치우친 영양소'로 굵게(서버의 많이 채운 비타민·무기질과 같은 문턱).
const OVER_KCAL = 1.2;
const OVER_MIN_SHARE = 0.1;
// 모자란 영양소를 이 묶음이 이만큼은 채워야 점검과 잇는 문장을 쓴다.
const LINK_MIN_SHARE = 0.2;
const MAX_LINKS = 2;
const MAX_BARS = 8;

const fmt = (n: number): string => Math.round(n).toLocaleString('ko-KR');
const pct = (share: number): string => `${Math.round(share * 100)}%`;

interface BarRow {
  key: string;
  label: string;
  value: number;
  text: string;
}

const isKeyboardFocus = (el: Element): boolean => {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
};

export const MealGroupBars = ({
  title,
  counts,
  labels,
  groups,
  groupsLoading,
  metric,
  side,
  flags,
  average,
  onOpen,
}: {
  title: string;
  /** 끼니 수 기준 막대(통계 API — 주식만). */
  counts: ReadonlyArray<{ key: string; label: string; count: number }>;
  labels: Record<string, string>;
  /** 묶음별 영양 몫(통계 영양 API) — 오기 전이면 undefined. */
  groups: ReadonlyArray<MealGroupNutritionType> | undefined;
  groupsLoading: boolean;
  metric: MealBarMetric;
  /** 넓은 화면에서 카드를 띄울 쪽(이 칸의 옆 칸). */
  side: 'left' | 'right';
  flags: ReadonlyMap<string, MealNutrientDisplayKey>;
  /** 이 기간 내 열량 구성(내 평균) — 카드가 묶음 구성과 견준다. */
  average: MealMacroCompositionType | null;
  /** 카드를 처음 열 때 — 판정 표시(영양소 점검)를 그때 부른다. */
  onOpen: () => void;
}) => {
  const idPrefix = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const open = pinned ?? hover;

  // 고정한 카드는 바깥을 누르면, 떠 있는 카드는 Esc 로 닫는다 — 문서 이벤트는 외부 시스템이라 effect.
  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPinned(null);
      setHover(null);
    };
    const onDown = (event: PointerEvent) => {
      if (!sectionRef.current?.contains(event.target as Node)) setPinned(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const byKey = new Map((groups ?? []).map((g) => [g.key, g]));
  const rows: BarRow[] =
    metric === 'count'
      ? counts.map((r) => ({
          key: r.key,
          label: labels[r.key] ?? r.label,
          value: r.count,
          text: `${r.count}`,
        }))
      : (groups ?? [])
          .map((g) => {
            const share = g.nutrients.find((n) => n.key === metric)?.share ?? 0;
            return { key: g.key, label: g.label, value: share, text: pct(share) };
          })
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((r) => r.value), metric === 'count' ? 1 : 0.001);
  const waiting = metric !== 'count' && groups === undefined;

  return (
    <section ref={sectionRef} className="meal-sec" aria-label={title}>
      <div className="meal-sec-head">
        <h2 className="meal-sec-title">{title}</h2>
      </div>
      {waiting ? (
        <p className="text-sm text-muted-foreground">
          {groupsLoading ? '불러오는 중…' : '영양 몫을 불러오지 못했어요.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">표시할 자료가 없어요.</p>
      ) : (
        <ul className="space-y-1">
          {rows.slice(0, MAX_BARS).map((r) => {
            const isOpen = open === r.key;
            const cardId = `${idPrefix}-${r.key}`;
            return (
              <li
                key={r.key}
                className="meal-bar-item"
                onPointerEnter={(event) => {
                  if (event.pointerType !== 'mouse') return;
                  setHover(r.key);
                  onOpen();
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === 'mouse') setHover((h) => (h === r.key ? null : h));
                }}
              >
                <button
                  type="button"
                  className="meal-bar-row meal-bar-btn"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? cardId : undefined}
                  onClick={() => {
                    setPinned((p) => (p === r.key ? null : r.key));
                    onOpen();
                  }}
                  // 키보드로 옮겨 왔을 때만 미리 보인다 — 누르거나 손가락으로 건드린 포커스는 고정(onClick)이 맡는다.
                  onFocus={(event) => {
                    if (!isKeyboardFocus(event.currentTarget)) return;
                    setHover(r.key);
                    onOpen();
                  }}
                  onBlur={() => setHover((h) => (h === r.key ? null : h))}
                >
                  <span className="truncate">{r.label}</span>
                  <span className="meal-meter" aria-hidden>
                    <span style={{ width: `${(r.value / max) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{r.text}</span>
                </button>
                {isOpen ? (
                  <div className="meal-group-pop" data-side={side}>
                    <GroupCard
                      id={cardId}
                      group={byKey.get(r.key)}
                      loading={groupsLoading}
                      flags={flags}
                      average={average}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

const GroupCard = ({
  id,
  group,
  loading,
  flags,
  average,
}: {
  id: string;
  group: MealGroupNutritionType | undefined;
  loading: boolean;
  flags: ReadonlyMap<string, MealNutrientDisplayKey>;
  average: MealMacroCompositionType | null;
}) => {
  if (!group) {
    return (
      <div id={id} className="meal-group-card">
        <p className="p-3 text-sm text-muted-foreground">
          {loading ? '영양 몫을 불러오는 중…' : '이 묶음의 영양 정보가 없어요.'}
        </p>
      </div>
    );
  }
  const kcal = group.nutrients.find((n) => n.key === 'kcal');
  // 영양소 점검(최근 14일)과 잇기 — 줄 옆에 '많음'을 붙이면 '이 묶음의 나트륨이 많다'로 읽혀(튀김 6% 옆 '많음'), 이 묶음이
  // 크게 채운 경우만 문장으로 밝힌다. 많은 영양소는 열량 몫보다 크게 채웠을 때, 모자란 영양소는 20% 이상 채웠을 때.
  const links = [...group.nutrients, ...group.highlights]
    .filter((n) => n.key !== 'kcal')
    .flatMap((n) => {
      const d = flags.get(n.key);
      if (!d) return [];
      const over =
        kcal !== undefined && n.share >= OVER_MIN_SHARE && n.share >= kcal.share * OVER_KCAL;
      if (d === 'high' ? !over : n.share < LINK_MIN_SHARE) return [];
      return [{ key: n.key, label: n.label, share: n.share, d }];
    })
    // 줄일 것(많음)이 먼저 — 모자란 것을 채운 묶음보다 행동으로 바로 이어진다. 같은 쪽이면 몫이 큰 순.
    .sort((a, b) => Number(b.d === 'high') - Number(a.d === 'high') || b.share - a.share)
    .slice(0, MAX_LINKS);
  return (
    <div id={id} role="region" aria-label={`${group.label} 영양`} className="meal-group-card">
      <div className="meal-group-head">
        <p className="meal-group-title">{group.label}</p>
        <p className="meal-group-count">
          주식 {group.mainCount}번{group.sideCount > 0 ? ` · 반찬 ${group.sideCount}번` : ''}
        </p>
      </div>
      <p className="meal-group-kcal">
        {kcal ? (
          <>
            열량 <b>{fmt(kcal.amount)}kcal</b>
            {group.kcalPerItem !== null ? ` · 한 번 평균 ${fmt(group.kcalPerItem)}kcal` : ''}
          </>
        ) : (
          '열량을 아는 기록이 없어요.'
        )}
      </p>
      <Composition group={group.composition ?? null} average={average} />
      <p className="meal-group-colhead">이 기간 내가 먹은 것 중 이 묶음 몫</p>
      <ul>
        {MACRO_ROWS.map(({ key, label }) => {
          const n = group.nutrients.find((x) => x.key === key);
          const over =
            n !== undefined &&
            kcal !== undefined &&
            key !== 'kcal' &&
            n.share >= OVER_MIN_SHARE &&
            n.share >= kcal.share * OVER_KCAL;
          return (
            <li key={key} className="meal-group-row" data-over={over ? 'true' : undefined}>
              <span className="meal-group-name">{label}</span>
              {n ? (
                <span className="meal-meter" aria-hidden>
                  <span style={{ width: `${Math.min(100, n.share * 100)}%` }} />
                </span>
              ) : (
                <span aria-hidden />
              )}
              <span className="meal-group-pct">{n ? pct(n.share) : '모름'}</span>
            </li>
          );
        })}
      </ul>
      {group.highlights.length > 0 ? (
        <p className="meal-group-note">
          <b>많이 채운 비타민·무기질</b>{' '}
          {group.highlights.map((h, i) => (
            <span key={h.key}>
              {i > 0 ? ' · ' : ''}
              {h.label} {pct(h.share)}
            </span>
          ))}
        </p>
      ) : null}
      {group.foods.length > 0 ? (
        <p className="meal-group-note">
          {group.foods.map((f) => `${f.name} ${f.count}`).join(' · ')}
        </p>
      ) : null}
      {links.map((l) => (
        <p key={l.key} className="meal-group-note">
          <b className={MEAL_NUTRIENT_TONE[l.d]}>
            {l.label} {MEAL_NUTRIENT_STATUS_LABEL[l.d]}
          </b>
          (최근 14일) — 이 묶음이 {pct(l.share)}를 채웠어요.
        </p>
      ))}
      <p className="meal-group-fine">
        기록 {group.mainCount + group.sideCount}개 중 열량 {group.knownCount}개 · 탄수화물·지방{' '}
        {group.macroKnownCount}개 반영 · 표준 영양값으로 어림
      </p>
    </div>
  );
};

// 열량 구성 — 이 묶음의 열량이 탄수화물·단백질·지방에서 얼마나 왔나(1g = 4·4·9kcal)를 내 평균과 위아래로 견준다.
// 세 조각이 한 막대에 붙어 있어 색으로 가른다 — 파랑·자홍·보라(충분·부족·많음의 초록·갈색·빨강과 겹치지 않게, 이 순서로
// 색각 이상·일반 시각 검사를 통과했다 — 파랑과 보라를 붙이면 구분이 안 된다). 색만으로 읽지 않게 범례와 '탄·단·지' 숫자를 함께 둔다.
const MACRO_PARTS = [
  { key: 'carb', label: '탄수화물', short: '탄' },
  { key: 'protein', label: '단백질', short: '단' },
  { key: 'fat', label: '지방', short: '지' },
] as const;

const Composition = ({
  group,
  average,
}: {
  group: MealMacroCompositionType | null;
  average: MealMacroCompositionType | null;
}) => (
  <div className="meal-comp">
    <div className="meal-comp-head">
      <span className="meal-comp-title">열량 구성{group ? ` · 기록 ${group.count}개` : ''}</span>
      <span className="meal-comp-keys" aria-hidden>
        {MACRO_PARTS.map((p) => (
          <span key={p.key} className="meal-comp-key" data-part={p.key}>
            {p.label}
          </span>
        ))}
      </span>
    </div>
    {group ? (
      <>
        <CompositionRow label="이 묶음" c={group} />
        {average ? <CompositionRow label="내 평균" c={average} /> : null}
      </>
    ) : (
      <p className="meal-comp-empty">탄수화물·지방을 아는 기록이 없어 열량 구성을 못 냈어요.</p>
    )}
  </div>
);

const CompositionRow = ({ label, c }: { label: string; c: MealMacroCompositionType }) => (
  <div className="meal-comp-row">
    <span className="meal-comp-label">{label}</span>
    <span className="meal-comp-bar" aria-hidden>
      {MACRO_PARTS.map((p) =>
        c[p.key] > 0 ? <span key={p.key} data-part={p.key} style={{ flexGrow: c[p.key] }} /> : null,
      )}
    </span>
    <span className="meal-comp-nums">
      {MACRO_PARTS.map((p) => `${p.short} ${pct(c[p.key])}`).join(' · ')}
    </span>
  </div>
);
