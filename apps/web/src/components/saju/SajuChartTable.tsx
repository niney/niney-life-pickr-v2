import type { SajuChartType, SajuPillarType } from '@repo/api-contract';
import {
  SAJU_PILLAR_LABEL,
  SAJU_STRENGTH_TEXT,
  SAJU_TEN_GOD_META,
  SAJU_WUXING_META,
  branchMeta,
  stemMeta,
  type SajuChart,
  type Wuxing,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { WUXING_COLOR, WUXING_TEXT_COLOR } from './sajuTheme';

// 원국 표(2D) — 무대 아래 패널·공유 페이지·기록·Lite 공용. 왼쪽부터 년·월·일·시(무대 인장 순서와 같다).
// 천간·지지는 오행 색, 일간(나)은 테두리로 강조. 아래에 오행 분포 막대·신살·관계·공망.

type Chart = SajuChart | SajuChartType;
type Pillar = SajuChart['pillars']['day'] | SajuPillarType;

const godKo = (g: keyof typeof SAJU_TEN_GOD_META | null): string => (g ? SAJU_TEN_GOD_META[g].ko : '나');

const Glyph = ({ hanja, ko, element, big, accent }: { hanja: string; ko: string; element: Wuxing; big?: boolean; accent?: boolean }) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center rounded-lg border py-1',
      accent ? 'border-[#d9b65b] bg-[#d9b65b]/10' : 'border-white/10 bg-black/25',
    )}
    style={{ color: WUXING_TEXT_COLOR[element] }}
  >
    <span className={cn('font-serif-kr leading-none', big ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl')}>{hanja}</span>
    <span className="mt-0.5 text-[10px] text-[#e9e2d2]/70">
      {ko}·{SAJU_WUXING_META[element].ko}
    </span>
  </div>
);

export const SajuChartTable = ({ chart, compact = false }: { chart: Chart; compact?: boolean }) => {
  const pillars: Pillar[] = [chart.pillars.year, chart.pillars.month, chart.pillars.day, ...(chart.pillars.hour ? [chart.pillars.hour] : [])];
  const cols = pillars.length;
  return (
    <div className="flex flex-col gap-3" data-testid="saju-chart">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {pillars.map((p) => (
          <div key={p.key} className="text-center text-[11px] text-[#d9b65b]">
            {SAJU_PILLAR_LABEL[p.key]}
          </div>
        ))}
        {pillars.map((p) => (
          <div key={`sg-${p.key}`} className="text-center text-[10px] text-[#e9e2d2]/55">
            {godKo(p.stemTenGod)}
          </div>
        ))}
        {pillars.map((p) => {
          const s = stemMeta(p.stem);
          return <Glyph key={`s-${p.key}`} hanja={s.hanja} ko={s.ko} element={s.element} big accent={p.key === 'day'} />;
        })}
        {pillars.map((p) => {
          const b = branchMeta(p.branch);
          return <Glyph key={`b-${p.key}`} hanja={b.hanja} ko={b.ko} element={b.element} big />;
        })}
        {pillars.map((p) => (
          <div key={`bg-${p.key}`} className="text-center text-[10px] text-[#e9e2d2]/55">
            {godKo(p.branchTenGod)}
          </div>
        ))}
        {!compact &&
          pillars.map((p) => (
            <div key={`h-${p.key}`} className="text-center text-[10px] text-[#e9e2d2]/45">
              {p.hidden.map((h) => stemMeta(h).ko).join('·')}
            </div>
          ))}
        {!compact &&
          pillars.map((p) => (
            <div key={`t-${p.key}`} className="text-center text-[10px] text-[#e9e2d2]/55">
              {p.twelveStage}
              {p.isVoid && <span className="ml-1 text-[#ffb4a2]">공망</span>}
            </div>
          ))}
      </div>
      {!chart.pillars.hour && <p className="text-[11px] text-[#e9e2d2]/45">시간을 몰라 시주 없이 세 기둥으로 봤어요.</p>}

      <div className="flex flex-col gap-1" aria-label="오행 분포">
        {chart.elements.map((e) => (
          <div key={e.element} className="flex items-center gap-2 text-[11px]">
            <span className="w-4 font-serif-kr" style={{ color: WUXING_TEXT_COLOR[e.element] }}>
              {SAJU_WUXING_META[e.element].hanja}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-white/10">
              <div className="h-full rounded" style={{ width: `${Math.max(2, e.percent)}%`, background: WUXING_COLOR[e.element] }} />
            </div>
            <span className="w-9 text-right text-[#e9e2d2]/60">{e.percent}%</span>
          </div>
        ))}
        <div className="mt-1 text-[11px] text-[#e9e2d2]/60">
          {SAJU_STRENGTH_TEXT[chart.strength.level].ko}({chart.strength.score}) · 보완 기운{' '}
          <span style={{ color: WUXING_TEXT_COLOR[chart.favorable.primary] }}>{SAJU_WUXING_META[chart.favorable.primary].ko}</span>
          {chart.favorable.secondary && <span className="text-[#e9e2d2]/45">, 보조 {SAJU_WUXING_META[chart.favorable.secondary].ko}</span>}
        </div>
      </div>

      {!compact && (chart.stars.length > 0 || chart.relations.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {chart.stars.map((s) => (
            <span key={s.id} className={cn('rounded-full border px-2 py-px text-[10px]', s.positive ? 'border-[#d9b65b]/50 text-[#d9b65b]' : 'border-[#ffb4a2]/40 text-[#ffb4a2]')}>
              {s.ko}
            </span>
          ))}
          {chart.relations.map((r, i) => (
            <span key={`${r.type}-${i}`} className="rounded-full border border-white/15 px-2 py-px text-[10px] text-[#e9e2d2]/70">
              {r.label}
            </span>
          ))}
        </div>
      )}
      {!compact && chart.warnings.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[11px] text-[#e9e2d2]/55">
          {chart.warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
