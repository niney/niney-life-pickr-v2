import { useState } from 'react';
import { getTarotCard, tarotCardBackImagePath, tarotCardImagePath, type TarotImageSize } from '@repo/utils';
import { cn } from '~/lib/utils';

// 카드 이미지(DOM) — 아직 생성되지 않은 카드는 이름을 적은 대체 카드로. 역방향은 180° 회전.
// 비율은 7:12(aspect-[7/12]) 를 부모가 준다.

interface Props {
  cardId: string;
  reversed?: boolean;
  size?: TarotImageSize;
  className?: string;
}

export const TarotCardImage = ({ cardId, reversed = false, size = 512, className }: Props) => {
  const [failed, setFailed] = useState(false);
  const [prev, setPrev] = useState(cardId);
  if (prev !== cardId) {
    setPrev(cardId);
    setFailed(false);
  }
  const card = getTarotCard(cardId);
  const style = reversed ? { transform: 'rotate(180deg)' } : undefined;
  if (failed || !card) {
    return (
      <div
        className={cn(
          'flex aspect-[7/12] flex-col items-center justify-center gap-1 rounded-md border border-[#d9b65b]/60 bg-gradient-to-b from-[#1b2452] to-[#090b1a] px-1 text-center',
          className,
        )}
        style={style}
        role="img"
        aria-label={card ? `${card.nameKo} (${card.nameEn})` : cardId}
      >
        <span className="font-serif-kr text-sm font-bold leading-tight text-[#f3e9c6]">{card?.nameKo ?? cardId}</span>
        <span className="text-[10px] leading-tight text-[#d9b65b]">{card?.nameEn}</span>
      </div>
    );
  }
  return (
    <img
      src={tarotCardImagePath(cardId, size)}
      alt={`${card.nameKo} (${card.nameEn})`}
      className={cn('aspect-[7/12] rounded-md object-cover', className)}
      style={style}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
};

// 뒷면 — Lite 모드 덱·엎어진 카드용.
export const TarotCardBack = ({ className }: { className?: string }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={cn(
          'aspect-[7/12] rounded-md border border-[#d9b65b]/70 bg-[radial-gradient(circle_at_50%_40%,#22306a,#090b1a)]',
          className,
        )}
        aria-hidden
      />
    );
  }
  return (
    <img
      src={tarotCardBackImagePath(512)}
      alt=""
      aria-hidden
      className={cn('aspect-[7/12] rounded-md object-cover', className)}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
};
