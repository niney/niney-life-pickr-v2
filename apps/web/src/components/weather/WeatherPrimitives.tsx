import { cn } from '~/lib/utils';

// 날씨 페이지 공용 컴포넌트 — 섹션/상태 블록은 대기정보 프리미티브(AirSection·AirStateBlock)를
// 그대로 쓰고(동일 규율), 기상청 고유 문구(stale/폴백 안내)와 세그먼트 토글만 여기. 포맷/훅
// 헬퍼는 weatherFormat.ts.

// stale(업스트림 장애로 서버가 마지막 성공본을 대신 서빙) 안내 띠.
export const WeatherStaleNote = ({ fetchedAtLabel }: { fetchedAtLabel: string }) => (
  <div className="mb-3 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
    기상청 API 응답이 없어 {fetchedAtLabel} 받아둔 정보를 표시하고 있습니다.
  </div>
);

// 최신 발표 슬롯이 아직 올라오지 않아 직전 발표분을 쓰는 중.
export const WeatherFallbackNote = ({ what, baseLabel }: { what: string; baseLabel: string | null }) => (
  <div className="mb-3 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
    {what} 최신 발표분이 아직 제공되지 않아 직전 발표분{baseLabel ? `(${baseLabel})` : ''}을 표시합니다. 몇 분 뒤
    자동으로 갱신됩니다.
  </div>
);

// 세그먼트 토글 — 대기정보 페이지와 같은 모양(섹션 헤더 우측 슬롯용).
export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) => (
  <div className="inline-flex flex-wrap rounded-md border bg-card p-0.5" role="group" aria-label={ariaLabel}>
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={active}
          className={cn(
            'rounded px-2.5 py-1 text-xs font-medium transition-colors',
            active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);
