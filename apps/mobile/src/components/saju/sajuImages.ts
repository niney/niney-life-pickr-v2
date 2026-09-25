import type { ImageSourcePropType } from 'react-native';
import { sajuBranchImageId, sajuStemImageId, type Branch, type Stem } from '@repo/utils';

// 사주 일간(10)·띠(12) 캐릭터 — 웹 public/saju-c/images 의 512px webp 를 앱에 번들했다(22장, 약 1.3MB).
// 무대·헤더에서 바로 뜨고 오프라인에서도 보인다. 원본이 바뀌면 apps/web/public/saju-c/images/*-512.webp 를 다시 복사.
// Metro 는 정적 require 만 번들하므로 id → require 표를 손으로 둔다(utils SAJU_*_IMAGE_SLUGS 와 같은 순서).

const IMAGES: Record<string, ImageSourcePropType> = {
  'stem-gap': require('../../../assets/saju/stem-gap-512.webp'),
  'stem-eul': require('../../../assets/saju/stem-eul-512.webp'),
  'stem-byeong': require('../../../assets/saju/stem-byeong-512.webp'),
  'stem-jeong': require('../../../assets/saju/stem-jeong-512.webp'),
  'stem-mu': require('../../../assets/saju/stem-mu-512.webp'),
  'stem-gi': require('../../../assets/saju/stem-gi-512.webp'),
  'stem-gyeong': require('../../../assets/saju/stem-gyeong-512.webp'),
  'stem-sin': require('../../../assets/saju/stem-sin-512.webp'),
  'stem-im': require('../../../assets/saju/stem-im-512.webp'),
  'stem-gye': require('../../../assets/saju/stem-gye-512.webp'),
  'branch-rat': require('../../../assets/saju/branch-rat-512.webp'),
  'branch-ox': require('../../../assets/saju/branch-ox-512.webp'),
  'branch-tiger': require('../../../assets/saju/branch-tiger-512.webp'),
  'branch-rabbit': require('../../../assets/saju/branch-rabbit-512.webp'),
  'branch-dragon': require('../../../assets/saju/branch-dragon-512.webp'),
  'branch-snake': require('../../../assets/saju/branch-snake-512.webp'),
  'branch-horse': require('../../../assets/saju/branch-horse-512.webp'),
  'branch-goat': require('../../../assets/saju/branch-goat-512.webp'),
  'branch-monkey': require('../../../assets/saju/branch-monkey-512.webp'),
  'branch-rooster': require('../../../assets/saju/branch-rooster-512.webp'),
  'branch-dog': require('../../../assets/saju/branch-dog-512.webp'),
  'branch-pig': require('../../../assets/saju/branch-pig-512.webp'),
};

export const sajuStemImage = (stem: Stem): ImageSourcePropType | undefined => IMAGES[sajuStemImageId(stem)];
export const sajuBranchImage = (branch: Branch): ImageSourcePropType | undefined => IMAGES[sajuBranchImageId(branch)];
