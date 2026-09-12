import { Heart, Loader2, RotateCcw } from 'lucide-react';
import type { SajuCareerSectionType, SajuLoveSectionType, SajuWealthSectionType } from '@repo/api-contract';
import {
  SAJU_WUXING_META,
  dayMasterText,
  sajuCareerThemeOf,
  sajuLoveThemeOf,
  sajuWealthThemeOf,
  type SajuChart,
  type SajuThemeLuckPeriod,
  type SajuThemeYear,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { useTypewriter } from '../tarot/useTypewriter';
import { WUXING_COLOR, WUXING_TEXT_COLOR } from './sajuTheme';

// 테마 탭(8차) — 인연 · 재물 · 직업. 계산값(utils sajuThemes)은 정적 카드로 즉시 그리고, LLM 문장(섹션)은
// 도착 순으로 타자 효과. 풀이 패널·2D 뷰(공유·기록) 공용. 성격 탭에 있던 일간 연애·일 카드는 여기로 옮겼다.

export type SajuThemeStatus = 'idle' | 'pending' | 'partial' | 'ready' | 'failed' | 'gone';

export const TypedText = ({ text, animate, className }: { text: string; animate: boolean; className?: string }) => {
  const shown = useTypewriter(text, animate);
  const done = shown.length >= text.length;
  return (
    <p className={className}>
      {shown}
      {!done && <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-[#d9b65b]">&nbsp;</span>}
    </p>
  );
};

const body = 'text-sm leading-relaxed text-[#e9e2d2]/85';
const label = 'text-[10px] text-[#d9b65b]';
const card = 'rounded-lg border border-white/10 p-2 text-xs';
const goldCard = 'rounded-lg border border-[#d9b65b]/30 p-2 text-xs';

const Pending = ({ text }: { text: string }) => (
  <div className="flex items-center gap-2 text-[11px] text-[#d9b65b]">
    <Loader2 className="size-3 animate-spin" /> {text}
  </div>
);

const Tips = ({ tips }: { tips: readonly string[] }) => (
  <div className={goldCard}>
    <div className={cn(label, 'mb-1')}>이렇게 해 보세요</div>
    <ul className="flex flex-col gap-0.5 text-[#e9e2d2]/80">
      {tips.map((t) => (
        <li key={t}>· {t}</li>
      ))}
    </ul>
  </div>
);

/** 대운 목록 — 테마와 맞는 10년 구간(현재·미래 최대 3). */
const Periods = ({ periods, title }: { periods: readonly SajuThemeLuckPeriod[]; title: string }) => {
  if (periods.length === 0) return null;
  return (
    <div className="flex flex-col gap-1" aria-label={title}>
      <div className={label}>{title}</div>
      <ul className="flex flex-col gap-1">
        {periods.slice(0, 3).map((p) => (
          <li key={p.index} className={cn('rounded-lg border px-2 py-1 text-[11px]', p.current ? 'border-[#d9b65b]/60 bg-[#d9b65b]/10' : 'border-white/10')}>
            <span className="font-serif-kr text-[#f3e9c6]">
              {p.ko} {p.fromAge}~{p.toAge}세
            </span>
            {p.current && <span className="ml-1 rounded-full border border-[#d9b65b]/40 px-1.5 text-[9px] text-[#d9b65b]">지금</span>}
            <span className="ml-1.5 text-[#e9e2d2]/65">{p.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** 세운 목록 — 해마다 테마 관점의 근거. 올해 강조, 점수 높은 해는 금색. */
const Years = ({ years, title, minScore = 2 }: { years: readonly SajuThemeYear[]; title: string; minScore?: number }) => (
  <div className="flex flex-col gap-1" aria-label={title}>
    <div className={label}>{title}</div>
    <ul className="flex flex-col gap-1">
      {years.map((y) => {
        const good = y.score >= minScore;
        return (
          <li key={y.year} className={cn('grid grid-cols-[auto_1fr] items-baseline gap-x-2 rounded-lg border px-2 py-1 text-[11px]', y.isCurrent ? 'border-[#d9b65b]/60 bg-[#d9b65b]/10' : 'border-white/10')}>
            <span className={cn('font-serif-kr', good ? 'text-[#d9b65b]' : 'text-[#f3e9c6]')}>
              {y.year} {y.ko}
            </span>
            <span className="min-w-0 text-[#e9e2d2]/65">{y.reasons.length ? y.reasons.join(' · ') : '특별한 표식 없음'}</span>
          </li>
        );
      })}
    </ul>
  </div>
);

// ── 인연 ────────────────────────────────────────────────────────────────────

export interface SajuThemeBoxProps<S> {
  chart: SajuChart;
  section: S | null;
  status: SajuThemeStatus;
  animate: boolean;
  onRetry?: () => void;
}

export const SajuLoveBox = ({ chart, section, status, animate, onRetry, onPair }: SajuThemeBoxProps<SajuLoveSectionType> & { onPair?: () => void }) => {
  const t = sajuLoveThemeOf(chart);
  const dm = dayMasterText(chart.dayMaster.index);
  const pending = status === 'pending' || section?.status === 'pending';
  const typed = animate && section?.status === 'ready';
  return (
    <div className="flex flex-col gap-3" data-testid="saju-theme-love">
      {pending && <Pending text="AI 가 인연의 흐름을 읽는 중이에요 — 먼저 계산된 사실을 보여 드려요." />}
      <div className="font-serif-kr text-base font-bold text-[#f3e9c6]">{section?.headline ?? '인연의 결'}</div>
      {section?.body && <TypedText text={section.body} animate={typed} className={body} />}
      <div className={goldCard} aria-label="배우자성">
        <div className={cn(label, 'mb-1')}>인연의 기운 — {t.spouseGod.groupKo}</div>
        <p className="leading-relaxed text-[#e9e2d2]/80">{t.spouseNote}</p>
        <p className="mt-1 text-[10px] text-[#e9e2d2]/45">{t.spouseGod.note}</p>
      </div>
      <div className={card} aria-label="배우자 자리">
        <div className={cn(label, 'mb-1')}>
          배우자 자리 — 일지 {t.palace.branchKo}({t.palace.branchHanja}) {t.palace.tenGodKo} · {t.palace.stage}
          {t.palace.isVoid ? ' · 공망' : ''}
        </div>
        <p className="leading-relaxed text-[#e9e2d2]/80">{t.palace.text}</p>
      </div>
      <div className={card}>
        <div className={cn(label, 'mb-1')}>연애 스타일</div>
        <p className="leading-relaxed text-[#e9e2d2]/80">{dm.love}</p>
        {section?.style ? <TypedText text={section.style} animate={typed} className="mt-1 leading-relaxed text-[#e9e2d2]/80" /> : <p className="mt-1 text-[#e9e2d2]/60">{t.style}</p>}
        {t.marks.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-[#e9e2d2]/70">
            {t.marks.map((m) => (
              <li key={m.id}>
                <span className="text-[#d9b65b]">{m.ko}</span> — {m.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      {t.chanceYears.length > 0 ? <Years years={t.chanceYears} title="인연이 가까워지는 해 — 앞으로 8년 중" minScore={3} /> : <p className="text-[11px] text-[#e9e2d2]/55">{t.chanceNote}</p>}
      <Periods periods={t.luckPeriods} title={`${t.spouseGod.groupKo}이 들어오는 대운`} />
      {section?.timing ? <TypedText text={section.timing} animate={typed} className={body} /> : <p className="text-[11px] text-[#e9e2d2]/55">{t.chanceNote}</p>}
      {section?.tips && section.tips.length > 0 && <Tips tips={section.tips} />}
      {onPair && (
        <Button type="button" variant="ghost" size="sm" onClick={onPair} className="h-9 self-start border border-[#b8322a]/50 text-[#f3e9c6] hover:border-[#b8322a]">
          <Heart className="size-3.5 text-[#ffb4a2]" /> 이 사람과 궁합 보기
        </Button>
      )}
      <ThemeErrors status={status} onRetry={onRetry} />
    </div>
  );
};

// ── 재물 ────────────────────────────────────────────────────────────────────

export const SajuWealthBox = ({ chart, section, status, animate, onRetry }: SajuThemeBoxProps<SajuWealthSectionType>) => {
  const t = sajuWealthThemeOf(chart);
  const pending = status === 'pending' || section?.status === 'pending';
  const typed = animate && section?.status === 'ready';
  return (
    <div className="flex flex-col gap-3" data-testid="saju-theme-wealth">
      {pending && <Pending text="AI 가 재물의 흐름을 읽는 중이에요 — 먼저 계산된 사실을 보여 드려요." />}
      <div className="font-serif-kr text-base font-bold text-[#f3e9c6]">{section?.headline ?? t.style.summary}</div>
      {section?.body && <TypedText text={section.body} animate={typed} className={body} />}
      <div className={goldCard} aria-label="재물 스타일">
        <div className="flex items-center gap-2">
          <span className={label}>재물 스타일</span>
          <span className="font-serif-kr text-sm font-bold text-[#f3e9c6]">{t.style.ko}</span>
          <span className="ml-auto rounded-full border px-2 py-px text-[10px]" style={{ borderColor: `${WUXING_COLOR[t.element]}88`, color: WUXING_TEXT_COLOR[t.element] }}>
            재성 {SAJU_WUXING_META[t.element].ko}
          </span>
        </div>
        <p className="mt-1 leading-relaxed text-[#e9e2d2]/80">{t.style.detail}</p>
        <p className="mt-1 text-[11px] text-[#e9e2d2]/60">
          정재 {t.counts.jeongjae} · 편재 {t.counts.pyeonjae} · 식상 {t.counts.output} · 비겁 {t.counts.self} · 인성 {t.counts.resource}
        </p>
      </div>
      <div className={card}>
        <div className={cn(label, 'mb-1')}>재를 감당하는 힘</div>
        <p className="leading-relaxed text-[#e9e2d2]/80">{t.capacity.text}</p>
        {t.notes.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-[#e9e2d2]/70">
            {t.notes.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
        )}
      </div>
      {section?.style && (
        <div className={card}>
          <div className={cn(label, 'mb-1')}>돈을 다루는 방식</div>
          <TypedText text={section.style} animate={typed} className="leading-relaxed text-[#e9e2d2]/80" />
        </div>
      )}
      <Periods periods={t.luckPeriods} title="재성·식상이 들어오는 대운" />
      <Years years={t.years} title="앞으로 5년 — 재물의 기운" />
      {section?.timing && <TypedText text={section.timing} animate={typed} className={body} />}
      {section?.tips && section.tips.length > 0 && <Tips tips={section.tips} />}
      <ThemeErrors status={status} onRetry={onRetry} />
    </div>
  );
};

// ── 직업 ────────────────────────────────────────────────────────────────────

export const SajuCareerBox = ({ chart, section, status, animate, onRetry }: SajuThemeBoxProps<SajuCareerSectionType>) => {
  const t = sajuCareerThemeOf(chart);
  const pending = status === 'pending' || section?.status === 'pending';
  const typed = animate && section?.status === 'ready';
  const jobs = section?.jobs?.length ? section.jobs : t.jobs;
  return (
    <div className="flex flex-col gap-3" data-testid="saju-theme-career">
      {pending && <Pending text="AI 가 일의 흐름을 읽는 중이에요 — 먼저 계산된 사실을 보여 드려요." />}
      <div className="font-serif-kr text-base font-bold text-[#f3e9c6]">{section?.headline ?? t.aptitude.summary}</div>
      {section?.body && <TypedText text={section.body} animate={typed} className={body} />}
      <div className={goldCard} aria-label="적성">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={label}>격국</span>
          <span className="font-serif-kr text-sm font-bold text-[#f3e9c6]">
            {t.pattern.ko} <span className="text-xs font-normal text-[#e9e2d2]/50">{t.pattern.hanja}</span>
          </span>
          <span className={cn(label, 'ml-2')}>적성</span>
          <span className="font-serif-kr text-sm font-bold text-[#f3e9c6]">{t.aptitude.ko}</span>
        </div>
        <p className="mt-1 leading-relaxed text-[#e9e2d2]/80">{t.aptitude.detail}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {t.groups.map((g) => (
            <span key={g.group} className={cn('rounded-full border px-2 py-px text-[10px]', g.group === t.aptitude.group ? 'border-[#d9b65b]/60 text-[#d9b65b]' : 'border-white/15 text-[#e9e2d2]/60')}>
              {g.ko} {g.count}
            </span>
          ))}
        </div>
      </div>
      <div className={card} aria-label="어울리는 일">
        <div className={cn(label, 'mb-1')}>어울리는 일</div>
        <div className="flex flex-wrap gap-1">
          {jobs.map((j) => (
            <span key={j} className="rounded-full border border-[#d9b65b]/40 px-2 py-0.5 text-[11px] text-[#f3e9c6]">
              {j}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-[#e9e2d2]/60">
          업종 색(일간 {SAJU_WUXING_META[chart.dayMaster.element].ko}): {t.industries.join(' · ')}
        </p>
        <p className="mt-1 leading-relaxed text-[#e9e2d2]/80">{t.workStyle}</p>
        {t.stars.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-[#e9e2d2]/70">
            {t.stars.map((s) => (
              <li key={s.id}>
                <span className="text-[#d9b65b]">{s.ko}</span> — {s.hint}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Periods periods={t.luckPeriods} title="관성·식상·인성이 들어오는 대운" />
      <Years years={t.years} title="앞으로 5년 — 일의 기운" />
      {section?.timing && <TypedText text={section.timing} animate={typed} className={body} />}
      {section?.tips && section.tips.length > 0 && <Tips tips={section.tips} />}
      <ThemeErrors status={status} onRetry={onRetry} />
    </div>
  );
};

const ThemeErrors = ({ status, onRetry }: { status: SajuThemeStatus; onRetry?: () => void }) => {
  if (status !== 'failed' && status !== 'gone') return null;
  return (
    <div className="rounded-lg border border-[#ffb4a2]/40 p-2 text-xs text-[#ffb4a2]">
      {status === 'gone' ? 'AI 테마 풀이 연결이 끊겼어요. 계산된 사실만 보여 드리고 있어요.' : '테마 풀이 요청이 실패했어요.'}
      {onRetry && (
        <Button type="button" size="sm" variant="ghost" onClick={onRetry} className="ml-2 h-7 text-[#f3e9c6]">
          <RotateCcw className="size-3" /> 다시 시도
        </Button>
      )}
    </div>
  );
};
