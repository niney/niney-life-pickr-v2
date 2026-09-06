import { useState, type ReactNode } from 'react';
import { Loader2, RotateCcw, Share2, X } from 'lucide-react';
import type { SajuBirthInputType, SajuReadingResultType, SajuSectionIdType, SajuSectionsType } from '@repo/api-contract';
import { SAJU_WUXING_META, dayMasterText, sajuImagePath, sajuStemImageId, type SajuChart } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { useTypewriter } from '../tarot/useTypewriter';
import { SajuChartTable } from './SajuChartTable';
import { SajuDailyBox, SajuDatePickBox, SajuFoodBox, SajuMatchBox } from './SajuTools';
import { SajuShareSheet, type SajuShareBase } from './SajuShareSheet';
import { glass } from './SajuForm';
import { SAJU_DISCLAIMER, SAJU_SOURCE_LABEL, WUXING_TEXT_COLOR } from './sajuTheme';

// 풀이 패널 — 탭: 원국 / 성격 / 오행 / 흐름 / 올해 / 조언. 섹션은 도착 순으로 채워지고(pending 이면 정적 본문 +
// "AI 가 읽는 중"), LLM 문장은 타자 효과. 데스크톱은 오른쪽, 세로 폰은 바닥 시트(접기).

export type SajuPanelTab = 'chart' | 'personality' | 'elements' | 'cycle' | 'year' | 'advice' | 'daily' | 'food' | 'date' | 'match';
const TABS: Array<{ id: SajuPanelTab; label: string; tool?: boolean }> = [
  { id: 'chart', label: '원국' },
  { id: 'personality', label: '성격' },
  { id: 'elements', label: '오행' },
  { id: 'cycle', label: '흐름' },
  { id: 'year', label: '올해' },
  { id: 'advice', label: '조언' },
  { id: 'daily', label: '오늘', tool: true },
  { id: 'food', label: '음식', tool: true },
  { id: 'date', label: '택일', tool: true },
  { id: 'match', label: '궁합', tool: true },
];

export interface SajuReadingPanelProps {
  chart: SajuChart;
  /** 도구(오늘·음식·택일·궁합)가 쓰는 계약형 입력. */
  birth: SajuBirthInputType;
  result: SajuReadingResultType | null;
  /** pending: 요청 중 / partial: 섹션 도착 중 / ready / failed / gone(job 소멸) */
  status: 'pending' | 'partial' | 'ready' | 'failed' | 'gone';
  animate: boolean;
  side: 'right' | 'bottom';
  tab: SajuPanelTab;
  onTab: (tab: SajuPanelTab) => void;
  onRetry: () => void;
  onEdit: () => void;
  onClose?: () => void;
}

const TypedText = ({ text, animate, className }: { text: string; animate: boolean; className?: string }) => {
  const shown = useTypewriter(text, animate);
  const done = shown.length >= text.length;
  return (
    <p className={className}>
      {shown}
      {!done && <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-[#d9b65b]">&nbsp;</span>}
    </p>
  );
};

const SectionShell = ({ pending, children }: { pending: boolean; children: ReactNode }) => (
  <div className="flex flex-col gap-3">
    {pending && (
      <div className="flex items-center gap-2 text-[11px] text-[#d9b65b]">
        <Loader2 className="size-3 animate-spin" /> AI 가 사주를 읽는 중이에요 — 먼저 기본 풀이를 보여 드려요.
      </div>
    )}
    {children}
  </div>
);

export const SajuReadingPanel = ({ chart, birth, result, status, animate, side, tab, onTab, onRetry, onEdit, onClose }: SajuReadingPanelProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const sections = result?.sections ?? null;
  // 공유 근거 — 회원은 저장된 readingId, 게스트는 입력(서버가 캐시된 풀이로 행을 만든다). 결과가 아직이면 없음.
  const shareBase: SajuShareBase | null = !result ? null : result.readingId ? { readingId: result.readingId } : { birth };
  const dm = dayMasterText(chart.dayMaster.index);
  const sectionOf = <K extends SajuSectionIdType>(id: K): SajuSectionsType[K] | null => sections?.[id] ?? null;
  const isPending = (id: SajuSectionIdType): boolean => status === 'pending' || sectionOf(id)?.status === 'pending';
  const animateFor = (id: SajuSectionIdType): boolean => animate && sectionOf(id)?.status === 'ready';

  const body = (): ReactNode => {
    switch (tab) {
      case 'chart':
        return (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <img src={sajuImagePath(sajuStemImageId(chart.dayMaster.index), 512)} alt="" className="size-16 rounded-full border border-[#d9b65b]/60 object-cover" />
              <div>
                <div className="text-[11px] text-[#d9b65b]">일간(나)</div>
                <div className="font-serif-kr text-lg font-bold text-[#f3e9c6]">
                  {dm.title} <span className="text-sm text-[#e9e2d2]/60">{dm.hanja}</span>
                </div>
                <div className="text-xs text-[#e9e2d2]/70">{dm.symbol} · {chart.zodiac.animal}띠 · {dm.tagline}</div>
              </div>
            </div>
            <SajuChartTable chart={chart} />
          </div>
        );
      case 'personality': {
        const s = sectionOf('personality');
        return (
          <SectionShell pending={isPending('personality')}>
            <div className="font-serif-kr text-base font-bold text-[#f3e9c6]">{s?.headline ?? dm.tagline}</div>
            <TypedText text={s?.body ?? dm.personality} animate={animateFor('personality')} className="text-sm leading-relaxed text-[#e9e2d2]/85" />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-[#d9b65b]/30 p-2">
                <div className="mb-1 text-[10px] text-[#d9b65b]">강점</div>
                <ul className="flex flex-col gap-0.5 text-[#e9e2d2]/80">{(s?.strengths ?? dm.strengths).map((x) => <li key={x}>· {x}</li>)}</ul>
              </div>
              <div className="rounded-lg border border-[#ffb4a2]/30 p-2">
                <div className="mb-1 text-[10px] text-[#ffb4a2]">주의</div>
                <ul className="flex flex-col gap-0.5 text-[#e9e2d2]/80">{(s?.cautions ?? dm.cautions).map((x) => <li key={x}>· {x}</li>)}</ul>
              </div>
            </div>
          </SectionShell>
        );
      }
      case 'elements':
        return (
          <div className="flex flex-col gap-3">
            <SajuChartTable chart={chart} compact />
            <p className="text-xs leading-relaxed text-[#e9e2d2]/70">
              보완하면 좋은 기운은{' '}
              <span style={{ color: WUXING_TEXT_COLOR[chart.favorable.primary] }}>{SAJU_WUXING_META[chart.favorable.primary].ko}</span>
              이에요. 무대의 구슬 크기가 각 기운의 비율, 금선이 상생(서로 돕는 흐름), 붉은 점선이 상극이에요.
            </p>
          </div>
        );
      case 'cycle': {
        const s = sectionOf('cycle');
        const cur = chart.luck.currentIndex >= 0 ? chart.luck.pillars[chart.luck.currentIndex] : null;
        return (
          <SectionShell pending={isPending('cycle')}>
            <ol className="flex gap-1 overflow-x-auto pb-1 text-center text-[10px]" aria-label="대운">
              {chart.luck.pillars.map((p, i) => (
                <li key={p.index} className={cn('min-w-[3.2rem] rounded-lg border px-1 py-1', i === chart.luck.currentIndex ? 'border-[#d9b65b] bg-[#d9b65b]/10 text-[#f3e9c6]' : 'border-white/10 text-[#e9e2d2]/55')}>
                  <div className="font-serif-kr text-sm">{p.hanja}</div>
                  <div>{Math.floor(p.fromAge)}세</div>
                </li>
              ))}
            </ol>
            <TypedText text={s?.body ?? ''} animate={animateFor('cycle')} className="text-sm leading-relaxed text-[#e9e2d2]/85" />
            <div className="rounded-lg border border-[#d9b65b]/30 p-2 text-xs">
              <div className="mb-1 text-[10px] text-[#d9b65b]">현재 {cur ? `${cur.ko} 대운` : '첫 대운 전'}</div>
              <p className="text-[#e9e2d2]/80">{s?.current ?? ''}</p>
            </div>
            <div className="rounded-lg border border-white/10 p-2 text-xs">
              <div className="mb-1 text-[10px] text-[#e9e2d2]/55">다음</div>
              <p className="text-[#e9e2d2]/80">{s?.next ?? ''}</p>
            </div>
          </SectionShell>
        );
      }
      case 'year': {
        const s = sectionOf('year');
        return (
          <SectionShell pending={isPending('year')}>
            <div className="font-serif-kr text-base font-bold text-[#f3e9c6]">
              {chart.yearLuck.year}년 {chart.yearLuck.ko}
              <span className="ml-1 text-sm text-[#e9e2d2]/60">{chart.yearLuck.hanja}</span>
            </div>
            <TypedText text={s?.body ?? ''} animate={animateFor('year')} className="text-sm leading-relaxed text-[#e9e2d2]/85" />
            {s && s.months.length > 0 && (
              <ul className="flex flex-col gap-1 text-xs text-[#e9e2d2]/80">
                {s.months.map((m) => (
                  <li key={m.month} className="flex gap-2">
                    <span className="shrink-0 text-[#d9b65b]">{m.month}월</span>
                    <span>{m.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionShell>
        );
      }
      case 'daily':
        return <SajuDailyBox birth={birth} />;
      case 'food':
        return <SajuFoodBox birth={birth} />;
      case 'date':
        return <SajuDatePickBox birth={birth} />;
      case 'match':
        return <SajuMatchBox birth={birth} />;
      case 'advice': {
        const s = sectionOf('advice');
        const lucky = s?.lucky;
        return (
          <SectionShell pending={isPending('advice')}>
            {s?.keyword && <div className="font-serif-kr text-base font-bold text-[#f3e9c6]">“{s.keyword}”</div>}
            <TypedText text={s?.body ?? ''} animate={animateFor('advice')} className="text-sm leading-relaxed text-[#e9e2d2]/85" />
            {lucky && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-[#d9b65b]/30 p-2 text-xs">
                <dt className="text-[#d9b65b]">기운</dt>
                <dd style={{ color: WUXING_TEXT_COLOR[lucky.element] }}>{SAJU_WUXING_META[lucky.element].ko}</dd>
                <dt className="text-[#d9b65b]">색</dt>
                <dd className="text-[#e9e2d2]/80">{lucky.colors.join(' · ')}</dd>
                <dt className="text-[#d9b65b]">방향</dt>
                <dd className="text-[#e9e2d2]/80">{lucky.directions.join(' · ')}</dd>
                <dt className="text-[#d9b65b]">숫자</dt>
                <dd className="text-[#e9e2d2]/80">{lucky.numbers.join(' · ')}</dd>
                <dt className="text-[#d9b65b]">음식</dt>
                <dd className="text-[#e9e2d2]/80">{lucky.foods.join(' · ')}</dd>
              </dl>
            )}
          </SectionShell>
        );
      }
    }
  };

  return (
    <section
      aria-label="풀이"
      className={cn(
        glass,
        'pointer-events-auto absolute flex flex-col overflow-hidden',
        side === 'right' ? 'bottom-4 right-4 top-16 w-[27rem] max-w-[calc(100%-2rem)]' : cn('inset-x-0 bottom-0 rounded-b-none', collapsed ? 'max-h-14' : 'max-h-[60dvh]'),
      )}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-[#e9e2d2]/60">
            <span className="font-serif-kr text-[#f3e9c6]">
              {[chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.hour].map((p) => (p ? p.hanja : '--')).join(' ')}
            </span>
            {result && (
              <span className={cn('rounded-full border px-1.5 py-px text-[10px]', result.source === 'llm' ? 'border-[#d9b65b]/60 text-[#d9b65b]' : 'border-white/20 text-[#e9e2d2]/60')}>
                {SAJU_SOURCE_LABEL[result.source]}
              </span>
            )}
          </div>
        </div>
        {side === 'bottom' && (
          <button type="button" className="rounded px-2 py-1 text-xs text-[#e9e2d2]/60 hover:text-[#e9e2d2]" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? '펼치기' : '접기'}
          </button>
        )}
        {onClose && (
          <button type="button" aria-label="닫기" onClick={onClose} className="rounded p-1 text-[#e9e2d2]/60 hover:text-[#e9e2d2]">
            <X className="size-4" />
          </button>
        )}
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-white/10 px-2 py-1.5" aria-label="풀이 탭">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs transition',
              tab === t.id ? 'border-[#d9b65b] bg-[#d9b65b]/15 text-[#f3e9c6]' : t.tool ? 'border-[#b8322a]/50 text-[#e9e2d2]/75 hover:border-[#b8322a]' : 'border-white/15 text-[#e9e2d2]/65 hover:border-white/40',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {body()}
        {status === 'gone' && (
          <div className="mt-3 rounded-lg border border-[#ffb4a2]/40 p-2 text-xs text-[#ffb4a2]">
            AI 풀이 연결이 끊겼어요. 기본 풀이를 보여 드리고 있어요.
            <Button type="button" size="sm" variant="ghost" onClick={onRetry} className="ml-2 h-7 text-[#f3e9c6]">
              <RotateCcw className="size-3" /> 다시 시도
            </Button>
          </div>
        )}
        {status === 'failed' && (
          <div className="mt-3 rounded-lg border border-[#ffb4a2]/40 p-2 text-xs text-[#ffb4a2]">
            풀이 요청이 실패했어요.
            <Button type="button" size="sm" variant="ghost" onClick={onRetry} className="ml-2 h-7 text-[#f3e9c6]">
              <RotateCcw className="size-3" /> 다시 시도
            </Button>
          </div>
        )}
      </div>
      <footer className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onEdit} className="h-8 text-[#e9e2d2]/80">
          다시 입력
        </Button>
        {shareBase && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShareOpen(true)} className="h-8 text-[#d9b65b]">
            <Share2 className="size-3.5" /> 공유
          </Button>
        )}
        <span className="ml-auto text-[10px] text-[#e9e2d2]/40">{SAJU_DISCLAIMER}</span>
      </footer>
      {shareBase && <SajuShareSheet open={shareOpen} onClose={() => setShareOpen(false)} base={shareBase} />}
    </section>
  );
};
