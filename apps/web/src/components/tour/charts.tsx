import { cn } from '~/lib/utils';
import { kindBg } from './tourFormat';

// 여행로그 공개 화면의 작은 차트 — 라이브러리 없이 CSS 막대·SVG. 색은 장소 유형별 고정(tourFormat.KIND_BG).

export const KindDot = ({ kind, className }: { kind: string; className?: string }) => (
  <i className={cn('inline-block size-2 rounded-full align-middle', kindBg(kind), className)} aria-hidden />
);

const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((a / b) * 100)}%` : '');

// 라벨 | 막대 | 값 — 값 문자열은 호출부가 만든다(건수·비율·평균 등).
export const BarList = ({ items, max, className }: { items: Array<{ label: string; n: number; text?: string }>; max?: number; className?: string }) => {
  const mx = max ?? Math.max(...items.map((i) => i.n), 1);
  const total = items.reduce((a, i) => a + i.n, 0);
  return (
    <div className={cn('grid grid-cols-[minmax(0,11em)_1fr_auto] items-center gap-x-2 gap-y-1 text-xs', className)}>
      {items.map((it) => (
        <BarRow key={it.label} label={it.label} n={it.n} max={mx} text={it.text ?? `${it.n.toLocaleString('ko-KR')} · ${pct(it.n, total)}`} />
      ))}
    </div>
  );
};

const BarRow = ({ label, n, max, text }: { label: string; n: number; max: number; text: string }) => (
  <>
    <span className="truncate" title={label}>
      {label}
    </span>
    <span className="h-2 overflow-hidden rounded-full bg-muted">
      <i className="block h-full rounded-full bg-teal-600" style={{ width: `${Math.max(n > 0 ? 2 : 0, (n / max) * 100)}%` }} />
    </span>
    <span className="whitespace-nowrap tabular-nums text-muted-foreground">{text}</span>
  </>
);

// 유형별 24시간 도착 분포 — 6~23시 꺾은선.
const LINE_STROKE: Record<string, string> = { 식당: 'stroke-teal-600', 자연: 'stroke-sky-500', 숙소: 'stroke-violet-500', 상업: 'stroke-amber-500' };
export const HourLines = ({ series }: { series: Array<{ type: string; hours: number[] }> }) => {
  const hs = Array.from({ length: 18 }, (_, i) => i + 6);
  const max = Math.max(1, ...series.flatMap((s) => hs.map((h) => s.hours[h] ?? 0)));
  const W = 360;
  const H = 130;
  const top = 12;
  const bottom = 20;
  const x = (i: number) => (i / (hs.length - 1)) * (W - 20) + 10;
  const y = (v: number) => H - bottom - ((H - top - bottom) * v) / max;
  if (max === 1 && series.every((s) => s.hours.every((n) => n === 0))) return <p className="text-xs text-muted-foreground">시간대 기록이 없습니다.</p>;
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="시간대별 방문 유형" className="w-full">
        {[0.5, 1].map((f) => (
          <line key={f} x1={10} x2={W - 10} y1={y(max * f)} y2={y(max * f)} className="stroke-border" strokeWidth={1} />
        ))}
        {series.map((s) => (
          <polyline key={s.type} fill="none" strokeWidth={2} className={LINE_STROKE[s.type] ?? 'stroke-zinc-400'} points={hs.map((h, i) => `${x(i).toFixed(1)},${y(s.hours[h] ?? 0).toFixed(1)}`).join(' ')}>
            <title>{s.type}</title>
          </polyline>
        ))}
        <line x1={10} x2={W - 10} y1={H - bottom} y2={H - bottom} className="stroke-border" />
        {hs
          .filter((h) => h % 3 === 0)
          .map((h) => (
            <text key={h} x={x(hs.indexOf(h)).toFixed(1)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {h}시
            </text>
          ))}
        <text x={W - 10} y={top - 2} textAnchor="end" className="fill-muted-foreground text-[10px]">
          최대 {max.toLocaleString('ko-KR')}건/시
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {series.map((s) => (
          <span key={s.type}>
            <KindDot kind={s.type} className="mr-1" />
            {s.type}
          </span>
        ))}
      </div>
    </div>
  );
};

// 유형 전이 행렬 — 행 from, 열 to. 값이 없으면 '·'.
export const HeatGrid = ({ types, valueOf }: { types: string[]; valueOf: (from: string, to: string) => number | undefined }) => {
  const max = Math.max(1, ...types.flatMap((f) => types.map((t) => valueOf(f, t) ?? 0)));
  return (
    <div className="grid gap-0.5 text-[11px]" style={{ gridTemplateColumns: `auto repeat(${types.length}, minmax(0, 1fr))` }}>
      <span />
      {types.map((t) => (
        <span key={`h-${t}`} className="truncate text-center text-muted-foreground">
          →{t}
        </span>
      ))}
      {types.map((f) => (
        <FragmentRow key={f} from={f} types={types} valueOf={valueOf} max={max} />
      ))}
    </div>
  );
};
const FragmentRow = ({ from, types, valueOf, max }: { from: string; types: string[]; valueOf: (from: string, to: string) => number | undefined; max: number }) => (
  <>
    <span className="pr-1 text-right text-muted-foreground">{from}</span>
    {types.map((t) => {
      const v = valueOf(from, t);
      return (
        <span key={t} className="rounded px-0.5 py-1 text-center tabular-nums" style={{ backgroundColor: `rgba(13,148,136,${v ? 0.08 + (v / max) * 0.55 : 0.03})` }}>
          {v ? v.toLocaleString('ko-KR') : '·'}
        </span>
      );
    })}
  </>
);

// '교통>식당>자연' → 유형 칩 행.
export const SeqChips = ({ seq, className }: { seq: string; className?: string }) => (
  <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
    {seq.split('>').map((t, i) => (
      <span key={`${t}-${i}`} className="inline-flex items-center gap-1">
        {i > 0 && <span className="text-muted-foreground">›</span>}
        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
          <KindDot kind={t} />
          {t}
        </span>
      </span>
    ))}
  </span>
);

export const StackBar = ({ parts }: { parts: Array<{ label: string; value: number; className: string }> }) => {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (total <= 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex h-3 overflow-hidden rounded-full">
        {parts.map((p) => (
          <i key={p.label} className={cn('block h-full', p.className)} style={{ width: `${(p.value / total) * 100}%` }} title={p.label} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {parts.map((p) => (
          <span key={p.label}>
            <i className={cn('mr-1 inline-block size-2 rounded-sm align-middle', p.className)} />
            {p.label} {pct(p.value, total)}
          </span>
        ))}
      </div>
    </div>
  );
};

export const Stat = ({ value, unit, label }: { value: string; unit?: string; label: string }) => (
  <div className="rounded-md border bg-card px-3 py-2">
    <div className="text-lg font-semibold tabular-nums leading-tight">
      {value}
      {unit && <span className="ml-0.5 text-[11px] font-medium text-muted-foreground">{unit}</span>}
    </div>
    <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
  </div>
);

export const Section = ({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <section className={cn('space-y-2 rounded-lg border bg-card p-4', className)}>
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
    {children}
  </section>
);
