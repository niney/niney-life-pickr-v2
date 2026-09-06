// 사주 이미지 id·경로 — 일간 10장(stem-*) + 띠 12장(branch-*). 원본은 제미나이 생성(docs/saju-image-prompts.md),
// 빌드는 apps/friendly/scripts/build-saju-images.ts 가 1:1 webp 512/1024 로 apps/web/public/saju/images/ 에 만든다.

import { branchMeta, stemMeta, type Branch, type Stem } from './saju.js';

export const SAJU_STEM_IMAGE_SLUGS = ['gap', 'eul', 'byeong', 'jeong', 'mu', 'gi', 'gyeong', 'sin', 'im', 'gye'] as const;
export const SAJU_BRANCH_IMAGE_SLUGS = ['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig'] as const;

export const SAJU_IMAGE_SIZES = [512, 1024] as const;
export type SajuImageSize = (typeof SAJU_IMAGE_SIZES)[number];
export const SAJU_IMAGE_BASE_PATH = '/saju/images';

export const sajuStemImageId = (stem: Stem): string => `stem-${SAJU_STEM_IMAGE_SLUGS[stem]}`;
export const sajuBranchImageId = (branch: Branch): string => `branch-${SAJU_BRANCH_IMAGE_SLUGS[branch]}`;
export const SAJU_IMAGE_IDS: readonly string[] = [
  ...SAJU_STEM_IMAGE_SLUGS.map((s) => `stem-${s}`),
  ...SAJU_BRANCH_IMAGE_SLUGS.map((s) => `branch-${s}`),
];

export const sajuImagePath = (id: string, size: SajuImageSize = 512): string => `${SAJU_IMAGE_BASE_PATH}/${id}-${size}.webp`;

export interface SajuImageMeta {
  id: string;
  kind: 'stem' | 'branch';
  index: number;
  /** placeholder 에 쓸 한 글자(한자)·한글 이름. */
  hanja: string;
  ko: string;
  colorHex: string;
}

const ELEMENT_COLOR: Record<string, string> = { wood: '#3f9b7a', fire: '#d9482b', earth: '#c9973a', metal: '#dcdcd2', water: '#2f4d7a' };

export const sajuImageMeta = (id: string): SajuImageMeta | null => {
  const si = SAJU_STEM_IMAGE_SLUGS.findIndex((s) => `stem-${s}` === id);
  if (si >= 0) {
    const m = stemMeta(si);
    return { id, kind: 'stem', index: si, hanja: m.hanja, ko: `${m.ko}${m.element === 'wood' ? '목' : m.element === 'fire' ? '화' : m.element === 'earth' ? '토' : m.element === 'metal' ? '금' : '수'}`, colorHex: ELEMENT_COLOR[m.element] as string };
  }
  const bi = SAJU_BRANCH_IMAGE_SLUGS.findIndex((s) => `branch-${s}` === id);
  if (bi >= 0) {
    const m = branchMeta(bi);
    return { id, kind: 'branch', index: bi, hanja: m.hanja, ko: `${m.animal}띠`, colorHex: ELEMENT_COLOR[m.element] as string };
  }
  return null;
};
