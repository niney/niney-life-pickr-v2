import { useMealPhotoUrls } from '@repo/shared';
import { Lightbox } from '~/components/Lightbox';

// 식단 사진 크게 보기 — 맛집 사진과 같은 공용 Lightbox(스와이프·←/→·Esc·바깥 누르면 닫기)를 쓴다.
// 식단 사진은 JWT 가 필요해 주소를 <img src> 에 바로 못 넣으므로, 보고 있는 장과 양옆 장만 원본(1,600px)을 받아
// objectURL 로 넘긴다. 받는 동안은 썸네일 칸이 이미 받아 둔 썸네일을 먼저 보여 준다(원본을 못 받아도 썸네일은 남는다).

// 보고 있는 장에서 이만큼 떨어진 장까지 원본을 미리 받는다 — 넘기자마자 선명하게.
const FULL_WINDOW = 1;

export const MealPhotoLightbox = ({
  tokens,
  index,
  onChangeIndex,
  onClose,
}: {
  tokens: readonly string[];
  index: number;
  onChangeIndex: (next: number) => void;
  onClose: () => void;
}) => {
  const full = useMealPhotoUrls(tokens, {
    variant: 'full',
    enabled: tokens.map((_, i) => Math.abs(i - index) <= FULL_WINDOW),
  });
  // 썸네일은 새로 받지 않는다 — 칸에서 받아 둔 것만 쓴다.
  const thumbs = useMealPhotoUrls(tokens, { variant: 'thumb', enabled: false });
  if (tokens.length === 0) return null;
  const images = tokens.map((_, i) => full[i]?.url ?? thumbs[i]?.url ?? '');
  return <Lightbox images={images} index={index} onChangeIndex={onChangeIndex} onClose={onClose} />;
};
