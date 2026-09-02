import type { TarotReadingResultType } from '@repo/api-contract';
import { getTarotCard, getTarotSpread, type TarotFlowState } from '@repo/utils';
import { cn } from '~/lib/utils';
import { TarotCardBack, TarotCardImage } from './TarotCardImage';

// Lite 무대 — WebGL 없음·reduced-motion·jsdom. 3D 대신 2D: 뽑기는 가로 스크롤 부채꼴(78장 뒷면),
// 뽑힌 카드는 CSS 3D 플립(탭으로 한 장씩, 또는 HUD 의 모두 뒤집기). 셔플·자리 잡기 애니메이션은
// 없고 페이지가 즉시 다음 단계로 넘긴다(애니메이션 두 벌을 만들지 않는다 — 결정 13).

interface Props {
  state: TarotFlowState<TarotReadingResultType>;
  onPick: (cardId: string) => void;
  onRevealNext: () => void;
}

export const TarotLite = ({ state, onPick, onRevealNext }: Props) => {
  const picked = new Set(state.picked);
  const spread = getTarotSpread(state.spreadId);
  const showDrawn = state.phase === 'placing' || state.phase === 'revealing' || state.phase === 'reading';

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_25%,#1a2358,#05071a_65%)]">
      {state.phase === 'picking' && (
        <div className="absolute inset-x-0 bottom-0 top-20 overflow-x-auto overflow-y-hidden px-6 pb-8">
          <ul className="flex h-full items-end pl-8" data-testid="tarot-lite-deck" aria-label="카드 덱">
            {state.deckOrder.map((id, i) =>
              picked.has(id) ? null : (
                <li key={id} className="-ml-9 first:ml-0">
                  <button
                    type="button"
                    onClick={() => onPick(id)}
                    aria-label={`${i + 1}번째 카드 뽑기`}
                    className="block w-14 transition-transform hover:-translate-y-4 focus-visible:-translate-y-4 focus-visible:outline-none"
                  >
                    <TarotCardBack className="w-14 shadow-lg" />
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {showDrawn && (
        <div className="absolute inset-x-0 top-20 flex flex-wrap justify-center gap-4 px-4">
          {state.drawn.map((d, i) => {
            const up = i < state.revealed;
            const next = state.phase === 'revealing' && i === state.revealed;
            const card = getTarotCard(d.cardId);
            return (
              <button
                key={d.cardId}
                type="button"
                disabled={!next}
                onClick={onRevealNext}
                aria-label={up ? `${card?.nameKo} 카드` : next ? `${spread?.positions[i]?.label} 카드 뒤집기` : '카드'}
                className={cn('w-24 [perspective:1000px] sm:w-32', next && 'animate-pulse')}
              >
                <div
                  className={cn(
                    'relative aspect-[7/12] transition-transform duration-700 [transform-style:preserve-3d]',
                    up && '[transform:rotateY(180deg)]',
                  )}
                >
                  <TarotCardBack className="absolute inset-0 h-full w-full [backface-visibility:hidden]" />
                  <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                    <TarotCardImage cardId={d.cardId} reversed={d.reversed} className="h-full w-full" />
                  </div>
                </div>
                <div className="mt-1 text-center text-[11px] text-[#d9b65b]">{spread?.positions[i]?.label}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
