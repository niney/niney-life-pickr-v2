import type { CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { MealStatsNutrientKeyType, MealStoryEquivalentType, MealStoryFigureType } from '@repo/api-contract';
import { cn } from '~/lib/utils';
import { MealNutrientChip } from '../meal/MealNutrientLine';
import { ownStandardText } from './motion/layout';
import { storyStatus, useStoryMyStats } from './mealStoryMine';

// 스토리 장면의 숫자 — 서버가 계산한 값(figure)을 굴러 올라가는 숫자로 그리고, 내 기록 값(figure.my)은 통계 영양소로 채운다.

// 0~9 두 바퀴 — 0 인 자리도 한 바퀴 돌고 멈춘다(mealStory.css .msn-strip).
const DIGITS = [...'01234567890123456789'];

/** 단위대로 자리 — g 은 10 미만이면 소수 한 자리(서버 반올림과 같은 규칙). */
const formatStoryAmount = (value: number, unit: string): string =>
  value.toLocaleString('ko-KR', { maximumFractionDigits: unit === 'g' && value < 10 ? 1 : 0 });

/** 굴러 올라가는 숫자 — 자리마다 0~9 띠를 밀어 올린다(CSS). 읽기 프로그램에는 완성된 값 한 번만 들린다. */
export const RollingNumber = ({
  value,
  unit,
  size,
}: {
  value: number;
  unit: string;
  size: 'xl' | 'lg' | 'md' | 'sm';
}) => {
  const text = formatStoryAmount(value, unit);
  const chars = [...text];
  // 자리 번호(쉼표·점 빼고 왼쪽부터) — 띠가 왼쪽부터 차례로 멈춘다.
  const digitOrder = chars.map((_, i) => chars.slice(0, i).filter((c) => /\d/.test(c)).length);
  return (
    <span className={cn('msn', `msn-${size}`)}>
      <span className="sr-only">
        {text}
        {unit}
      </span>
      <span className="msn-digits" aria-hidden>
        {chars.map((ch, i) =>
          /\d/.test(ch) ? (
            <span key={i} className="msn-col" style={{ '--d': Number(ch), '--i': digitOrder[i] } as CSSProperties}>
              <span className="msn-strip">
                {DIGITS.map((d, k) => (
                  <span key={k}>{d}</span>
                ))}
              </span>
            </span>
          ) : (
            <span key={i} className="msn-sep">
              {ch}
            </span>
          ),
        )}
        {unit ? <span className="msn-unit">{unit}</span> : null}
      </span>
    </span>
  );
};

/** 다른 단위로 본 값 한 줄(나트륨 → 소금) — 값은 서버가 환산했거나(기준 숫자), 서버가 준 식으로 환산한 것(내 기록). */
export const EquivalentText = ({ label, value, unit }: { label: string; value: number; unit: string }) => (
  <>
    {label} 약 {formatStoryAmount(value, unit)}
    {unit}
  </>
);

/** 움직이지 않는 짧은 값(막대 옆 값 등). */
export const AmountText = ({ figure }: { figure: MealStoryFigureType }) =>
  figure.value === null ? (
    <span>값 없음</span>
  ) : (
    <span className="tabular-nums">
      {formatStoryAmount(figure.value, figure.unit)}
      {figure.unit}
    </span>
  );

/** 내 최근 2주 하루 평균 — 로그인했을 때만 통계 영양소에서. 두 끼 이상 적은 날이 없으면 기록을 권한다. */
const MyFigure = ({
  nutrient,
  size,
  equivalent,
  standards,
}: {
  nutrient: MealStatsNutrientKeyType;
  size: 'xl' | 'lg' | 'md' | 'sm';
  equivalent: MealStoryEquivalentType | null;
  /** 같은 장면의 기준 숫자들 — 내 값 옆의 '기준 대비 %' 가 어느 기준인지 가른다. */
  standards: readonly number[];
}) => {
  const { token, stats } = useStoryMyStats();
  const location = useLocation();
  if (!token) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return (
      <p className="mss-my-hint">
        로그인하면 내 식단 기록으로 최근 2주 평균도 보여요. <Link to={`/login?next=${next}`}>로그인</Link>
      </p>
    );
  }
  if (stats.isLoading) return <span className="mss-skeleton" aria-label="내 평균 불러오는 중" />;
  const row = stats.data?.rows.find((r) => r.key === nutrient) ?? null;
  if (!stats.data || stats.data.status !== 'ok' || !row || row.intakePerDay === null) {
    return <p className="mss-my-hint">기록이 더 필요해요 — 두 끼 이상 적은 날이 있어야 하루 평균을 내요.</p>;
  }
  const shown = storyStatus(row);
  const own = row.reference?.amount ?? null;
  return (
    <span className="mss-my">
      <RollingNumber value={row.intakePerDay} unit={row.unit} size={size} />
      {shown ? <MealNutrientChip status={shown.key} label={shown.label} /> : null}
      {/* 기준 숫자가 여럿이거나(남·여) 내 기준이 그 숫자와 다르면 어느 기준인지 밝힌다 — 영상과 같은 규칙. */}
      {row.percent !== null ? (
        <span className="mss-my-pct">
          {ownStandardText(row.percent, own, own !== null ? `${formatStoryAmount(own, row.unit)}${row.unit}` : null, standards)}
        </span>
      ) : null}
      {/* 다른 단위로(소금) — 서버가 준 식(÷ per)으로 내 값을 환산한다. */}
      {equivalent ? (
        <span className="mss-my-pct">
          <EquivalentText label={equivalent.label} value={row.intakePerDay / equivalent.per} unit={equivalent.unit} />
        </span>
      ) : null}
    </span>
  );
};

/**
 * 장면 숫자 하나 — 내 기록이면 통계에서, 값이 없으면 '값 없음'. standards = 같은 장면의 기준 숫자들(큰 숫자 장면이 넘긴다).
 */
export const FigureValue = ({
  figure,
  size,
  standards = [],
}: {
  figure: MealStoryFigureType;
  size: 'xl' | 'lg' | 'md' | 'sm';
  standards?: readonly number[];
}) => {
  if (figure.my) return <MyFigure nutrient={figure.my} size={size} equivalent={figure.equivalent} standards={standards} />;
  if (figure.value === null) return <span className="msn-missing">값 없음</span>;
  return <RollingNumber value={figure.value} unit={figure.unit} size={size} />;
};
