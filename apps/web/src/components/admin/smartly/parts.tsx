import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/lib/utils';
import { percent } from './format';
import type { TranslationSource } from './smartlyApi';

const SOURCE_LABEL: Record<TranslationSource, string> = {
  dictionary: '사전',
  model: '모델',
  none: '없음',
};

export const SourceBadge = ({ source }: { source: TranslationSource }) => (
  <Badge
    variant={source === 'dictionary' ? 'green' : source === 'model' ? 'amber' : 'secondary'}
    className="shrink-0 whitespace-nowrap"
  >
    {SOURCE_LABEL[source]}
  </Badge>
);

// 인식 확신도(글자별 확률의 곱) — 낮으면 틀렸을 가능성이 크다.
export const Confidence = ({ value }: { value: number }) => (
  <span
    className={cn(
      'tabular-nums text-xs',
      value >= 0.9
        ? 'text-emerald-600 dark:text-emerald-400'
        : value >= 0.5
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-destructive',
    )}
    title="글자마다 고른 확률의 곱"
  >
    확신 {percent(value, 0)}
  </span>
);

export const ErrorNote = ({ error }: { error: unknown }) => (
  <p className="flex items-center gap-1.5 text-sm text-destructive">
    <AlertCircle className="size-4 shrink-0" />
    {error instanceof Error ? error.message : '실패'}
  </p>
);

export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
}) => (
  <div
    role="radiogroup"
    aria-label={label}
    className="flex flex-wrap gap-1 rounded-md border p-0.5 text-xs"
  >
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        role="radio"
        aria-checked={value === o.id}
        title={o.hint}
        onClick={() => onChange(o.id)}
        className={cn(
          'rounded px-2.5 py-1',
          value === o.id ? 'bg-muted font-semibold' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
  </label>
);

export const Stat = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) => (
  <div className="rounded-md border bg-muted/20 px-3 py-2">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold tabular-nums">{value}</p>
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);
