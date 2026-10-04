import { useState } from 'react';
import { getTarotCard, tarotCardBackImagePath, tarotCardImagePath, type TarotImageSize } from '@repo/utils';
import { cn } from '~/lib/utils';

// 카드 이미지(DOM) — 아직 생성되지 않은 카드는 이름을 적은 대체 카드로. 역방향은 180° 회전.
// 비율은 7:12(aspect-[7/12]) 를 부모가 준다.

// 작게 그리는 자리(목록의 32px, 해석·공유 화면의 96~128px)에 512 원본을 주면 장당 100kB 넘게 받는다.
// 표시 폭을 sizes 로 알려 주면 브라우저가 화면 밀도에 맞는 변형(112·224·512)을 고른다.
const RESPONSIVE_SIZES = [112, 224, 512] as const satisfies readonly TarotImageSize[];
const cardSrcSet = (cardId: string): string =>
  RESPONSIVE_SIZES.map((w) => `${tarotCardImagePath(cardId, w)} ${w}w`).join(', ');
const backSrcSet = RESPONSIVE_SIZES.map((w) => `${tarotCardBackImagePath(w)} ${w}w`).join(', ');

interface Props {
  cardId: string;
  reversed?: boolean;
  size?: TarotImageSize;
  // 표시 폭(CSS sizes 문법, 예: "32px" · "(min-width: 640px) 128px, 96px"). 주면 srcSet 으로 작은 변형을
  // 고르게 하고, 안 주면 size 한 장만 쓴다(3D 무대가 이미 받은 512 를 재사용하는 자리).
  sizes?: string;
  className?: string;
}

export const TarotCardImage = ({ cardId, reversed = false, size = 512, sizes, className }: Props) => {
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
      srcSet={sizes ? cardSrcSet(cardId) : undefined}
      sizes={sizes}
      alt={`${card.nameKo} (${card.nameEn})`}
      className={cn('aspect-[7/12] rounded-md object-cover', className)}
      style={style}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
};

// 뒷면 — Lite 모드 덱·엎어진 카드용. sizes 는 앞면과 같은 뜻.
export const TarotCardBack = ({ className, sizes }: { className?: string; sizes?: string }) => {
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
      srcSet={sizes ? backSrcSet : undefined}
      sizes={sizes}
      alt=""
      aria-hidden
      className={cn('aspect-[7/12] rounded-md object-cover', className)}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
};
