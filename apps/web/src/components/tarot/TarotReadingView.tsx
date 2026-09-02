import { Sparkles } from 'lucide-react';
import type { SharedTarotReadingType } from '@repo/api-contract';
import { getTarotSpread, tarotOrientationLabel, TAROT_TOPIC_LABEL } from '@repo/utils';
import { cn } from '~/lib/utils';
import { TarotCardImage } from './TarotCardImage';
import { TAROT_DISCLAIMER, TAROT_SOURCE_LABEL } from './tarotTheme';

// 완성된 리딩의 2D 표시 — 공유 페이지(3D 없음)용. 카드 줄 + 카드별 해석 + 종합·조언·선택 판정·키워드.

interface Props {
  reading: Pick<
    SharedTarotReadingType,
    'spreadId' | 'topic' | 'question' | 'choices' | 'source' | 'cards' | 'summary' | 'advice' | 'keyword' | 'choice'
  >;
  className?: string;
}

export const TarotReadingView = ({ reading, className }: Props) => {
  const spread = getTarotSpread(reading.spreadId);
  const { choices, choice } = reading;
  return (
    <article className={cn('text-[#ece6d6]', className)}>
      <header className="flex flex-wrap items-center gap-2 text-xs text-[#ece6d6]/60">
        <span>{spread?.nameKo}</span>
        <span>·</span>
        <span>{TAROT_TOPIC_LABEL[reading.topic]}</span>
        <span
          className={cn(
            'rounded-full border px-1.5 py-px text-[10px]',
            reading.source === 'llm' ? 'border-[#d9b65b]/60 text-[#d9b65b]' : 'border-white/20 text-[#ece6d6]/60',
          )}
        >
          {TAROT_SOURCE_LABEL[reading.source]}
        </span>
      </header>
      {reading.question && <p className="mt-1 font-serif-kr text-lg text-[#f3e9c6]">“{reading.question}”</p>}
      {choices && (
        <p className="mt-1 text-sm text-[#ece6d6]/70">
          A {choices.a} · B {choices.b}
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-center gap-4">
        {reading.cards.map((c) => (
          <figure key={c.cardId} className="flex w-24 flex-col items-center sm:w-32">
            <TarotCardImage cardId={c.cardId} reversed={c.reversed} className="w-full shadow-lg" />
            <figcaption className="mt-1.5 text-center">
              <div className="text-[11px] text-[#d9b65b]">{c.positionLabel}</div>
              <div className="font-serif-kr text-sm font-bold text-[#f3e9c6]">{c.nameKo}</div>
              <div className="text-[10px] text-[#ece6d6]/55">{tarotOrientationLabel(c.reversed)}</div>
            </figcaption>
          </figure>
        ))}
      </div>

      <ol className="mt-6 flex flex-col gap-4">
        {reading.cards.map((c) => (
          <li key={c.cardId}>
            <div className="text-[11px] text-[#d9b65b]">{c.positionLabel}</div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-serif-kr text-base font-bold text-[#f3e9c6]">{c.nameKo}</span>
              <span className="text-[11px] text-[#ece6d6]/50">{c.nameEn}</span>
              <span
                className={cn(
                  'rounded-full border px-1.5 text-[10px]',
                  c.reversed ? 'border-[#ffb4a2]/50 text-[#ffb4a2]' : 'border-white/20 text-[#ece6d6]/60',
                )}
              >
                {tarotOrientationLabel(c.reversed)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {c.keywords.map((k) => (
                <span key={k} className="rounded bg-white/5 px-1.5 py-px text-[10px] text-[#ece6d6]/70">
                  {k}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-[#ece6d6]/90">{c.text}</p>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-4">
        <div>
          <div className="text-[11px] text-[#d9b65b]">종합</div>
          <p className="mt-1 text-sm leading-relaxed text-[#f3e9c6]">{reading.summary}</p>
        </div>
        <div>
          <div className="text-[11px] text-[#d9b65b]">조언</div>
          <p className="mt-1 text-sm leading-relaxed text-[#ece6d6]/90">{reading.advice}</p>
        </div>
        {choice && choices && (
          <div className="rounded-xl border border-[#d9b65b]/40 bg-[#d9b65b]/10 p-3 text-sm">
            <div className="text-[11px] text-[#d9b65b]">카드의 선택</div>
            <div className="mt-0.5 font-semibold text-[#f3e9c6]">
              {choice.recommended === 'either' ? '어느 쪽이든' : `${choice.recommended} · ${choice.recommended === 'A' ? choices.a : choices.b}`}
              <span className="ml-2 text-[11px] font-normal text-[#ece6d6]/60">
                확신 {choice.confidence === 'high' ? '높음' : choice.confidence === 'mid' ? '보통' : '낮음'}
              </span>
            </div>
            <p className="mt-1 text-[#ece6d6]/90">{choice.reason}</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#d9b65b]" />
          <span className="font-serif-kr text-lg font-bold text-[#f3e9c6]">{reading.keyword}</span>
        </div>
        <p className="text-[11px] text-[#ece6d6]/40">{TAROT_DISCLAIMER}</p>
      </div>
    </article>
  );
};
