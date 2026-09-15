import type { TourInsightsParams } from '@repo/shared';
import { cn } from '~/lib/utils';
import { TOUR_ACCOMPANY_OPTIONS, TOUR_AGE_OPTIONS, TOUR_MONTH_OPTIONS, TOUR_NIGHTS_OPTIONS, TOUR_REGION_OPTIONS, shortAccompany } from './tourFormat';

// 인사이트·코스 추천 공통 필터 — 지역·연령·성별·동반·월·박수. 값은 URL 쿼리(인사이트) 또는 폼 상태(코스)가 쥔다.

const Chip = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-full border px-2.5 py-1 text-xs transition-colors',
      active ? 'border-teal-600 bg-teal-600/10 font-semibold text-teal-800 dark:text-teal-300' : 'border-border text-muted-foreground hover:text-foreground',
    )}
  >
    {children}
  </button>
);

const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="mr-1 text-[11px] font-medium text-muted-foreground">{label}</span>
    {children}
  </div>
);

export const TourFilterBar = ({ value, onChange, showRegion = true }: { value: TourInsightsParams; onChange: (next: TourInsightsParams) => void; showRegion?: boolean }) => {
  const set = <K extends keyof TourInsightsParams>(k: K, v: TourInsightsParams[K]) => onChange({ ...value, [k]: value[k] === v ? undefined : v });
  const region = value.region ?? 'jeju';
  const dirty = Boolean(value.ageGrp || value.gender || value.accompany || value.month !== undefined || value.nights !== undefined);
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      {showRegion && (
        <Group label="지역">
          {TOUR_REGION_OPTIONS.map((r) => (
            <Chip key={r.value} active={region === r.value} onClick={() => onChange({ ...value, region: r.value })}>
              {r.label}
            </Chip>
          ))}
        </Group>
      )}
      <Group label="연령">
        {TOUR_AGE_OPTIONS.map((a) => (
          <Chip key={a} active={value.ageGrp === a} onClick={() => set('ageGrp', a)}>
            {a}대
          </Chip>
        ))}
      </Group>
      <Group label="성별">
        {(['여', '남'] as const).map((g) => (
          <Chip key={g} active={value.gender === g} onClick={() => set('gender', g)}>
            {g}
          </Chip>
        ))}
      </Group>
      <Group label="동반">
        {TOUR_ACCOMPANY_OPTIONS.map((a) => (
          <Chip key={a} active={value.accompany === a} onClick={() => set('accompany', a)}>
            {shortAccompany(a)}
          </Chip>
        ))}
      </Group>
      <Group label="월">
        {TOUR_MONTH_OPTIONS.map((m) => (
          <Chip key={m} active={value.month === m} onClick={() => set('month', m)}>
            {m}월
          </Chip>
        ))}
      </Group>
      <Group label="박수">
        {TOUR_NIGHTS_OPTIONS.map((n) => (
          <Chip key={n.value} active={value.nights === n.value} onClick={() => set('nights', n.value)}>
            {n.label}
          </Chip>
        ))}
        {dirty && (
          <button type="button" className="ml-auto text-[11px] text-muted-foreground underline" onClick={() => onChange({ region })}>
            초기화
          </button>
        )}
      </Group>
    </div>
  );
};
