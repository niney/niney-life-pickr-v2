import type { SajuChartType, SajuSectionsType } from '@repo/api-contract';
import { SAJU_WUXING_META, dayMasterText, sajuImagePath, sajuStemImageId } from '@repo/utils';
import { cn } from '~/lib/utils';
import { SajuChartTable } from './SajuChartTable';
import { SAJU_SOURCE_LABEL, WUXING_TEXT_COLOR } from './sajuTheme';

// 2D 풀이 보기 — 공유 페이지·회원 기록 상세 공용(3D 없음). 원국 표 + 일간 + 섹션 4개를 한 페이지에.

export const SajuReadingView = ({ chart, sections, source, birthHidden }: { chart: SajuChartType; sections: SajuSectionsType; source: 'llm' | 'static' | 'mixed'; birthHidden?: boolean }) => {
  const dm = dayMasterText(chart.dayMaster.index);
  const card = 'rounded-2xl border border-[#d9b65b]/15 bg-[#121218]/85 p-4';
  return (
    <div className="flex flex-col gap-4" data-testid="saju-reading-view">
      <section className={card}>
        <div className="flex items-center gap-3">
          <img src={sajuImagePath(sajuStemImageId(chart.dayMaster.index), 512)} alt="" className="size-20 rounded-full border-2 border-[#d9b65b]/60 object-cover" />
          <div className="min-w-0">
            <div className="text-[11px] text-[#d9b65b]">일간(나)</div>
            <div className="font-serif-kr text-xl font-bold text-[#f3e9c6]">
              {dm.title} <span className="text-sm text-[#e9e2d2]/60">{dm.hanja}</span>
            </div>
            <div className="text-xs text-[#e9e2d2]/70">
              {dm.symbol} · {chart.zodiac.animal}띠 · {sections.personality.headline || dm.tagline}
            </div>
            <span className={cn('mt-1 inline-block rounded-full border px-1.5 py-px text-[10px]', source === 'llm' ? 'border-[#d9b65b]/60 text-[#d9b65b]' : 'border-white/20 text-[#e9e2d2]/60')}>
              {SAJU_SOURCE_LABEL[source]}
            </span>
          </div>
        </div>
        {birthHidden && <p className="mt-2 text-[11px] text-[#e9e2d2]/45">생년월일은 공유에서 숨겨졌어요.</p>}
        <div className="mt-4">
          <SajuChartTable chart={chart} />
        </div>
      </section>

      <section className={card}>
        <h2 className="font-serif-kr text-base font-bold text-[#f3e9c6]">성격과 기질</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#e9e2d2]/85">{sections.personality.body}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-[#d9b65b]/30 p-2">
            <div className="mb-1 text-[10px] text-[#d9b65b]">강점</div>
            <ul className="flex flex-col gap-0.5 text-[#e9e2d2]/80">{sections.personality.strengths.map((x) => <li key={x}>· {x}</li>)}</ul>
          </div>
          <div className="rounded-lg border border-[#ffb4a2]/30 p-2">
            <div className="mb-1 text-[10px] text-[#ffb4a2]">주의</div>
            <ul className="flex flex-col gap-0.5 text-[#e9e2d2]/80">{sections.personality.cautions.map((x) => <li key={x}>· {x}</li>)}</ul>
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-serif-kr text-base font-bold text-[#f3e9c6]">
          {chart.yearLuck.year}년 {chart.yearLuck.ko} <span className="text-sm text-[#e9e2d2]/60">{chart.yearLuck.hanja}</span>
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#e9e2d2]/85">{sections.year.body}</p>
        {sections.year.months.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-xs text-[#e9e2d2]/80">
            {sections.year.months.map((m) => (
              <li key={m.month} className="flex gap-2">
                <span className="shrink-0 text-[#d9b65b]">{m.month}월</span>
                <span>{m.note}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-serif-kr text-base font-bold text-[#f3e9c6]">인생의 큰 흐름</h2>
        <ol className="mt-2 flex gap-1 overflow-x-auto pb-1 text-center text-[10px]" aria-label="대운">
          {chart.luck.pillars.map((p, i) => (
            <li key={p.index} className={cn('min-w-[3.2rem] rounded-lg border px-1 py-1', i === chart.luck.currentIndex ? 'border-[#d9b65b] bg-[#d9b65b]/10 text-[#f3e9c6]' : 'border-white/10 text-[#e9e2d2]/55')}>
              <div className="font-serif-kr text-sm">{p.hanja}</div>
              <div>{Math.floor(p.fromAge)}세</div>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm leading-relaxed text-[#e9e2d2]/85">{sections.cycle.body}</p>
        <p className="mt-2 text-xs text-[#e9e2d2]/80">{sections.cycle.current}</p>
        <p className="mt-1 text-xs text-[#e9e2d2]/60">{sections.cycle.next}</p>
      </section>

      <section className={card}>
        <h2 className="font-serif-kr text-base font-bold text-[#f3e9c6]">조언 {sections.advice.keyword && <span className="text-[#d9b65b]">“{sections.advice.keyword}”</span>}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#e9e2d2]/85">{sections.advice.body}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-[#d9b65b]/30 p-2 text-xs">
          <dt className="text-[#d9b65b]">기운</dt>
          <dd style={{ color: WUXING_TEXT_COLOR[sections.advice.lucky.element] }}>{SAJU_WUXING_META[sections.advice.lucky.element].ko}</dd>
          <dt className="text-[#d9b65b]">색</dt>
          <dd className="text-[#e9e2d2]/80">{sections.advice.lucky.colors.join(' · ')}</dd>
          <dt className="text-[#d9b65b]">방향</dt>
          <dd className="text-[#e9e2d2]/80">{sections.advice.lucky.directions.join(' · ')}</dd>
          <dt className="text-[#d9b65b]">음식</dt>
          <dd className="text-[#e9e2d2]/80">{sections.advice.lucky.foods.join(' · ')}</dd>
        </dl>
      </section>
    </div>
  );
};
