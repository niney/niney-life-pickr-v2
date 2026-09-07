import { useState, type ReactNode } from 'react';
import { Loader2, RotateCcw, Share2, X } from 'lucide-react';
import type { SajuBirthInputType, SajuReadingResultType, SajuSectionIdType, SajuSectionsType } from '@repo/api-contract';
import {
  SAJU_TEN_GOD_META,
  SAJU_WUXING_LUCKY,
  SAJU_WUXING_META,
  dayMasterText,
  sajuBirthSummary,
  sajuBranchImageId,
  sajuDayPillarReadingOf,
  sajuFiveGodsOf,
  sajuHealthHintsOf,
  sajuImagePath,
  sajuMonthLucksOf,
  sajuPatternOf,
  sajuSamjaeOf,
  sajuStemImageId,
  sajuYearOutlooksOf,
  SAJU_SAMJAE_STAGE_KO,
  stemMeta,
  zodiacTraitLine,
  type SajuChart,
  type TenGod,
  type Wuxing,
} from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { useTypewriter } from '../tarot/useTypewriter';
import { SajuChartTable } from './SajuChartTable';
import { SajuDailyBox, SajuDatePickBox, SajuFoodBox, SajuMatchBox } from './SajuTools';
import { SajuShareSheet, type SajuShareBase } from './SajuShareSheet';
import { glass } from './SajuForm';
import { SAJU_DISCLAIMER, SAJU_SOURCE_LABEL, WUXING_COLOR, WUXING_TEXT_COLOR } from './sajuTheme';

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

const godKo = (g: TenGod): string => SAJU_TEN_GOD_META[g].ko;

/** 원국 헤더 — 일간 캐릭터 + 띠 동물 + 출생 요약(음력·태양시 보정·계절). 2D 뷰(SajuReadingView)와 같은 구성. */
/** hideBirth: 공유 페이지에서 생년월일이 마스킹된 경우(양력·음력·태양시는 숨기고 계절·나이만). */
export const SajuChartHeader = ({ chart, headline, size = 'sm', hideBirth = false, children }: { chart: SajuChart; headline?: string; size?: 'sm' | 'lg'; hideBirth?: boolean; children?: ReactNode }) => {
  const dm = dayMasterText(chart.dayMaster.index);
  const birth = sajuBirthSummary(chart);
  const img = size === 'lg' ? 'size-20 border-2' : 'size-16';
  const zimg = size === 'lg' ? 'size-12' : 'size-10';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <img src={sajuImagePath(sajuStemImageId(chart.dayMaster.index), 512)} alt="" className={cn(img, 'rounded-full border border-[#d9b65b]/60 object-cover')} />
          <img
            src={sajuImagePath(sajuBranchImageId(chart.zodiac.index), 512)}
            alt={`${chart.zodiac.animal}띠`}
            title={zodiacTraitLine(chart)}
            className={cn(zimg, 'absolute -bottom-1 -right-2 rounded-full border border-[#d9b65b]/60 bg-[#121218] object-cover shadow')}
          />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-[#d9b65b]">일간(나)</div>
          <div className={cn('font-serif-kr font-bold text-[#f3e9c6]', size === 'lg' ? 'text-xl' : 'text-lg')}>
            {dm.title} <span className="text-sm text-[#e9e2d2]/60">{dm.hanja}</span>
          </div>
          <div className="text-xs text-[#e9e2d2]/70">
            {dm.symbol} · {zodiacTraitLine(chart)} · {headline || dm.tagline}
          </div>
          {children}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#e9e2d2]/55">
        {!hideBirth && <span>양력 {birth.solar}</span>}
        {!hideBirth && birth.lunar && <span>음력 {birth.lunar}</span>}
        {!hideBirth && birth.corrected && <span title="일주·시주는 서울 기준 진태양시로 봤어요">태양시 {birth.corrected}</span>}
        <span>{birth.season}</span>
        <span>만 {birth.age}세</span>
      </div>
    </div>
  );
};

/** 일간별 연애·일 스타일 — LLM 섹션과 별개인 정적 카드(성격 탭·2D 뷰 공용). */
export const DayMasterStyleCards = ({ chart }: { chart: SajuChart }) => {
  const dm = dayMasterText(chart.dayMaster.index);
  return (
    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
      <div className="rounded-lg border border-white/10 p-2">
        <div className="mb-1 text-[10px] text-[#d9b65b]">연애 스타일</div>
        <p className="leading-relaxed text-[#e9e2d2]/80">{dm.love}</p>
      </div>
      <div className="rounded-lg border border-white/10 p-2">
        <div className="mb-1 text-[10px] text-[#d9b65b]">일하는 방식</div>
        <p className="leading-relaxed text-[#e9e2d2]/80">{dm.work}</p>
      </div>
    </div>
  );
};

/** 대운 한 칸 — 간지·시작 나이 + 십신·십이운성. */
export const LuckPillarChip = ({ p, current }: { p: SajuChart['luck']['pillars'][number]; current: boolean }) => (
  <li className={cn('min-w-[3.6rem] rounded-lg border px-1 py-1', current ? 'border-[#d9b65b] bg-[#d9b65b]/10 text-[#f3e9c6]' : 'border-white/10 text-[#e9e2d2]/60')}>
    <div className="font-serif-kr text-sm">{p.hanja}</div>
    <div>{Math.floor(p.fromAge)}세</div>
    <div className="mt-0.5 text-[9px] leading-tight text-[#e9e2d2]/50">
      {godKo(p.stemTenGod)}·{godKo(p.branchTenGod)}
      <br />
      {p.twelveStage}
    </div>
  </li>
);

/** 세운 한 줄 + 원국과의 관계 칩. */
export const YearLuckFacts = ({ chart }: { chart: SajuChart }) => {
  const y = chart.yearLuck;
  return (
    <div className="flex flex-col gap-1 text-[11px] text-[#e9e2d2]/65">
      <div>
        천간 {godKo(y.stemTenGod)} · 지지 {godKo(y.branchTenGod)} · 십이운성 {y.twelveStage}
      </div>
      {y.relations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {y.relations.map((r, i) => (
            <span key={`${r.type}-${i}`} className="rounded-full border border-white/15 px-2 py-px text-[10px] text-[#e9e2d2]/70">
              올해 {r.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/** 행운 요소 표 — LLM 이 준 색·방향·숫자·음식 + 정적 표의 키워드·활동·맛·계절. */
export const LuckyTable = ({ lucky }: { lucky: { element: Wuxing; colors: string[]; directions: string[]; numbers: number[]; foods: string[] } }) => {
  const extra = SAJU_WUXING_LUCKY[lucky.element];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-[#d9b65b]/30 p-2 text-xs">
      <dt className="text-[#d9b65b]">기운</dt>
      <dd style={{ color: WUXING_TEXT_COLOR[lucky.element] }}>
        {SAJU_WUXING_META[lucky.element].ko} <span className="text-[#e9e2d2]/50">— {extra.keywords.join(' · ')}</span>
      </dd>
      <dt className="text-[#d9b65b]">색</dt>
      <dd className="text-[#e9e2d2]/80">{lucky.colors.join(' · ')}</dd>
      <dt className="text-[#d9b65b]">방향</dt>
      <dd className="text-[#e9e2d2]/80">{lucky.directions.join(' · ')}</dd>
      <dt className="text-[#d9b65b]">숫자</dt>
      <dd className="text-[#e9e2d2]/80">{lucky.numbers.join(' · ')}</dd>
      <dt className="text-[#d9b65b]">음식</dt>
      <dd className="text-[#e9e2d2]/80">
        {lucky.foods.join(' · ')} <span className="text-[#e9e2d2]/50">({extra.taste})</span>
      </dd>
      <dt className="text-[#d9b65b]">활동</dt>
      <dd className="text-[#e9e2d2]/80">{extra.activities.join(' · ')}</dd>
      <dt className="text-[#d9b65b]">계절</dt>
      <dd className="text-[#e9e2d2]/80">{extra.season}</dd>
    </dl>
  );
};

const ymd = (d: { year: number; month: number; day: number }): number => d.year * 10000 + d.month * 100 + d.day;
const todayYmd = (): number => {
  const t = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
};
const Stars5 = ({ n }: { n: number }) => (
  <span className="text-[#d9b65b]" aria-label={`별 ${n}개`}>
    {'★'.repeat(n)}
    <span className="text-[#e9e2d2]/20">{'★'.repeat(5 - n)}</span>
  </span>
);
const ElChip = ({ label, e }: { label: string; e: Wuxing }) => (
  <span className="rounded-full border px-2 py-px text-[10px]" style={{ borderColor: `${WUXING_COLOR[e]}88`, color: WUXING_TEXT_COLOR[e] }}>
    {label} {SAJU_WUXING_META[e].ko}
  </span>
);

/** 명식 한눈에 — 격국·오신(용신…한신)·삼재. 원국 탭·2D 뷰 공용. 유파별 차이가 있어 "재미로" 톤. */
export const ChartInsightCard = ({ chart }: { chart: SajuChart }) => {
  const pat = sajuPatternOf(chart);
  const gods = sajuFiveGodsOf(chart);
  const sam = sajuSamjaeOf(chart);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#d9b65b]/30 p-2 text-xs" aria-label="명식 한눈에">
      <div>
        <div className="text-[10px] text-[#d9b65b]">격국</div>
        <div className="font-serif-kr text-sm font-bold text-[#f3e9c6]">
          {pat.ko} <span className="text-xs font-normal text-[#e9e2d2]/50">{pat.hanja}</span>
          <span className="ml-1.5 text-xs font-normal text-[#e9e2d2]/80">— {pat.summary}</span>
        </div>
        <p className="mt-0.5 leading-relaxed text-[#e9e2d2]/70">{pat.detail}</p>
      </div>
      <div>
        <div className="mb-1 text-[10px] text-[#d9b65b]">오신 — 나에게 필요한 기운과 조심할 기운</div>
        <div className="flex flex-wrap gap-1">
          <ElChip label="용신" e={gods.yong} />
          <ElChip label="희신" e={gods.hee} />
          <ElChip label="기신" e={gods.gi} />
          <ElChip label="구신" e={gods.gu} />
          <ElChip label="한신" e={gods.han} />
        </div>
        <p className="mt-1 text-[#e9e2d2]/60">{gods.reason}</p>
      </div>
      <div>
        <div className="text-[10px] text-[#d9b65b]">삼재{sam.stage ? ` · ${SAJU_SAMJAE_STAGE_KO[sam.stage]}` : ''}</div>
        <p className="text-[#e9e2d2]/70">
          {sam.stage ? `${chart.zodiac.animal}띠의 삼재는 ${sam.branchesKo}년. ` : `${chart.zodiac.animal}띠 · `}
          {sam.note}
        </p>
      </div>
    </div>
  );
};

/** 오행 건강 힌트 — 부족·과다 오행 기준 생활 습관 제안(진단 아님). */
export const HealthHints = ({ chart }: { chart: SajuChart }) => {
  const hints = sajuHealthHintsOf(chart);
  if (hints.length === 0) return <p className="text-[11px] text-[#e9e2d2]/50">오행이 고르게 있어 특별히 치우친 기운이 없어요.</p>;
  return (
    <div className="flex flex-col gap-1.5" aria-label="오행 건강 힌트">
      <div className="text-[10px] text-[#d9b65b]">몸으로 보면 — 부족·넘치는 기운의 생활 힌트</div>
      <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-[#e9e2d2]/75">
        {hints.map((h) => (
          <li key={`${h.kind}-${h.element}`} className="flex gap-1.5">
            <span className="shrink-0 font-serif-kr" style={{ color: WUXING_TEXT_COLOR[h.element] }}>
              {SAJU_WUXING_META[h.element].hanja}
            </span>
            <span>{h.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-[#e9e2d2]/40">재미로 보는 오행 관념이에요. 몸이 불편하면 병원이 먼저예요.</p>
    </div>
  );
};

/** 향후 5년 세운 표 — 올해 강조, 별점·십신·테마·변동/인연 표식. */
export const YearOutlookTable = ({ chart }: { chart: SajuChart }) => {
  const years = sajuYearOutlooksOf(chart);
  return (
    <div className="flex flex-col gap-1" aria-label="향후 5년">
      <div className="text-[10px] text-[#d9b65b]">앞으로 5년 — 해마다 들어오는 기운</div>
      <ul className="flex flex-col gap-1">
        {years.map((y) => (
          <li key={y.year} className={cn('grid grid-cols-[auto_auto_1fr] items-center gap-x-2 rounded-lg border px-2 py-1 text-[11px]', y.isCurrent ? 'border-[#d9b65b]/60 bg-[#d9b65b]/10' : 'border-white/10')}>
            <span className="font-serif-kr text-[#f3e9c6]">
              {y.year} {y.ko}
            </span>
            <Stars5 n={y.stars} />
            <span className="min-w-0 truncate text-[#e9e2d2]/65">
              {godKo(y.stemTenGod)}·{godKo(y.branchTenGod)} · {y.theme}
              {y.flags.map((f) => (
                <span key={f} className={cn('ml-1 rounded-full border px-1.5 text-[9px]', f === '변동' || f === '공망' ? 'border-[#ffb4a2]/40 text-[#ffb4a2]' : 'border-[#d9b65b]/40 text-[#d9b65b]')}>
                  {f}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** 월운 12개월 — 절기 기준(입춘~다음 입춘). 이번 달 강조, 점수는 별점 색으로. */
export const MonthLuckGrid = ({ chart }: { chart: SajuChart }) => {
  const months = sajuMonthLucksOf(chart);
  if (months.length === 0) return null;
  const today = todayYmd();
  const best = [...months].sort((a, b) => b.score - a.score).slice(0, 3).map((m) => m.index);
  return (
    <div className="flex flex-col gap-1.5" aria-label="월운">
      <div className="text-[10px] text-[#d9b65b]">{chart.yearLuck.year}년 월운 — 절기 기준 12개월(입춘부터)</div>
      <ol className="grid grid-cols-4 gap-1 sm:grid-cols-6">
        {months.map((m) => {
          const current = today >= ymd(m.from) && today <= ymd(m.to);
          const tone = m.stars >= 4 ? 'text-[#d9b65b]' : m.stars <= 2 ? 'text-[#ffb4a2]' : 'text-[#e9e2d2]/70';
          return (
            <li key={m.index} className={cn('rounded-lg border px-1 py-1 text-center', current ? 'border-[#d9b65b] bg-[#d9b65b]/10' : 'border-white/10')} title={`${m.termName} ${m.from.month}/${m.from.day}~${m.to.month}/${m.to.day} · ${godKo(m.stemTenGod)}·${godKo(m.branchTenGod)} · ${m.twelveStage}`}>
              <div className="text-[9px] text-[#e9e2d2]/50">
                {m.from.month}/{m.from.day}~
              </div>
              <div className="font-serif-kr text-sm text-[#f3e9c6]">{m.hanja}</div>
              <div className={cn('text-[10px]', tone)}>{'●'.repeat(m.stars)}</div>
              <div className="text-[9px] text-[#e9e2d2]/50">{godKo(m.stemTenGod)}</div>
            </li>
          );
        })}
      </ol>
      <p className="text-[10px] text-[#e9e2d2]/50">
        좋은 달 {best.map((i) => months[i]).filter(Boolean).map((m) => `${m!.from.month}월(${m!.ko})`).join(' · ')}. 점은 그달의 기운을 내 사주에 대 본 점수(5점 만점).
      </p>
    </div>
  );
};

/** 대운 타임라인 — 0~100세를 강물처럼. 구간 색은 대운 천간 오행, 지금 나이에 표식. 흐름 탭·2D 뷰 공용. */
export const LuckTimeline = ({ chart }: { chart: SajuChart }) => {
  const W = 600;
  const H = 96;
  const left = 8;
  const right = W - 8;
  const x = (age: number) => left + (Math.max(0, Math.min(100, age)) / 100) * (right - left);
  const pillars = chart.luck.pillars.filter((p) => p.fromAge < 100);
  const age = chart.asOf.age;
  // 강물: 위아래로 살짝 굽이치는 띠(두 곡선 사이).
  const wave = (yBase: number, amp: number, phase: number) => {
    let d = `M ${left} ${yBase}`;
    for (let i = 1; i <= 10; i++) {
      const px = left + ((right - left) * i) / 10;
      const cx = px - (right - left) / 20;
      const cy = yBase + Math.sin(i * 1.3 + phase) * amp;
      d += ` Q ${cx} ${cy} ${px} ${yBase + Math.sin(i * 1.9 + phase) * amp * 0.4}`;
    }
    return d;
  };
  const top = 34;
  const bottom = 66;
  return (
    <figure className="flex flex-col gap-1" aria-label="대운 타임라인">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`대운 타임라인, 지금 만 ${age}세`}>
        {/* 구간 */}
        {pillars.map((p) => {
          const x0 = x(p.fromAge);
          const x1 = x(Math.min(100, p.toAge));
          const el = stemMeta(p.stem).element;
          const cur = p.index === chart.luck.currentIndex;
          const w = Math.max(0, x1 - x0);
          return (
            <g key={p.index}>
              <rect x={x0} y={top - 6} width={w} height={bottom - top + 12} rx={6} fill={WUXING_COLOR[el]} opacity={cur ? 0.55 : 0.28} />
              {w >= 24 && (
                <text x={(x0 + x1) / 2} y={top - 12} textAnchor="middle" fontSize={11} fill="#f3e9c6" fontFamily="serif">
                  {p.hanja}
                </text>
              )}
              {w >= 44 && (
                <text x={(x0 + x1) / 2} y={bottom + 20} textAnchor="middle" fontSize={8} fill="rgba(233,226,210,0.6)">
                  {Math.floor(p.fromAge)}세 · {godKo(p.stemTenGod)}
                </text>
              )}
            </g>
          );
        })}
        {/* 강물 하이라이트 */}
        <path d={wave(50, 6, 1)} fill="none" stroke="rgba(217,182,91,0.55)" strokeWidth={1.5} />
        <path d={wave(58, 4, 3)} fill="none" stroke="rgba(233,226,210,0.25)" strokeWidth={1} />
        {/* 지금 */}
        <g>
          <line x1={x(age)} x2={x(age)} y1={top - 8} y2={bottom + 8} stroke="#ffb4a2" strokeWidth={1.5} strokeDasharray="3 2" />
          <circle cx={x(age)} cy={50} r={4} fill="#ffb4a2" />
          <text x={x(age)} y={H - 2} textAnchor="middle" fontSize={9} fill="#ffb4a2">
            지금 {age}세
          </text>
        </g>
      </svg>
      <figcaption className="text-[10px] text-[#e9e2d2]/45">구간 색은 그 대운 천간의 오행, 밝은 구간이 지금 대운. 강물은 나이 순으로 흘러가요.</figcaption>
    </figure>
  );
};

/** 60갑자 일주론 카드 — 별칭 + 배우자 자리 문장. 성격 탭·2D 뷰 공용. */
export const DayPillarCard = ({ chart }: { chart: SajuChart }) => {
  const r = sajuDayPillarReadingOf(chart);
  return (
    <div className="rounded-lg border border-[#d9b65b]/30 p-2 text-xs" aria-label="일주로 보면">
      <div className="text-[10px] text-[#d9b65b]">일주로 보면 — {r.ko} {r.hanja}</div>
      <div className="font-serif-kr text-sm font-bold text-[#f3e9c6]">“{r.title}”</div>
      <p className="mt-1 leading-relaxed text-[#e9e2d2]/75">{r.body}</p>
    </div>
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
            <SajuChartHeader chart={chart} />
            <ChartInsightCard chart={chart} />
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
            <DayPillarCard chart={chart} />
            <DayMasterStyleCards chart={chart} />
            <p className="text-[11px] text-[#e9e2d2]/55">띠로 보면 {zodiacTraitLine(chart)}. 일간이 타고난 성격이라면 띠는 겉으로 드러나는 분위기예요.</p>
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
            <HealthHints chart={chart} />
          </div>
        );
      case 'cycle': {
        const s = sectionOf('cycle');
        const cur = chart.luck.currentIndex >= 0 ? chart.luck.pillars[chart.luck.currentIndex] : null;
        return (
          <SectionShell pending={isPending('cycle')}>
            <LuckTimeline chart={chart} />
            <ol className="flex gap-1 overflow-x-auto pb-1 text-center text-[10px]" aria-label="대운">
              {chart.luck.pillars.map((p, i) => (
                <LuckPillarChip key={p.index} p={p} current={i === chart.luck.currentIndex} />
              ))}
            </ol>
            <p className="text-[11px] text-[#e9e2d2]/50">
              {chart.luck.forward ? '순행' : '역행'} · {chart.luck.startAgeYears}세 {chart.luck.startAgeMonths}개월부터 10년마다 바뀌어요. 칸의 작은 글씨는 그 시기에 들어오는 기운(십신)과 힘의 단계(십이운성).
            </p>
            <YearOutlookTable chart={chart} />
            <TypedText text={s?.body ?? ''} animate={animateFor('cycle')} className="text-sm leading-relaxed text-[#e9e2d2]/85" />
            <div className="rounded-lg border border-[#d9b65b]/30 p-2 text-xs">
              <div className="mb-1 text-[10px] text-[#d9b65b]">
                현재 {cur ? `${cur.ko} 대운 (${Math.floor(cur.fromAge)}~${Math.floor(cur.toAge)}세) · ${godKo(cur.stemTenGod)}·${godKo(cur.branchTenGod)} · ${cur.twelveStage}` : '첫 대운 전'}
              </div>
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
            <YearLuckFacts chart={chart} />
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
            <MonthLuckGrid chart={chart} />
          </SectionShell>
        );
      }
      case 'daily':
        return <SajuDailyBox birth={birth} chart={chart} />;
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
            {lucky && <LuckyTable lucky={lucky} />}
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
        side === 'right' ? 'bottom-4 right-4 top-16 w-[32rem] max-w-[calc(100%-2rem)] xl:w-[34rem]' : cn('inset-x-0 bottom-0 rounded-b-none', collapsed ? 'max-h-14' : 'max-h-[60dvh]'),
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
      {/* 탭 10개 — 가로 스크롤 대신 줄바꿈(xl 폭에선 한 줄). */}
      <nav className="flex flex-wrap gap-1 border-b border-white/10 px-2 py-1.5" aria-label="풀이 탭">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-1 text-xs transition',
              tab === t.id ? 'border-[#d9b65b] bg-[#d9b65b]/15 text-[#f3e9c6]' : t.tool ? 'border-[#b8322a]/50 text-[#e9e2d2]/75 hover:border-[#b8322a]' : 'border-white/15 text-[#e9e2d2]/65 hover:border-white/40',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
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
