// 타로 렌더 모드·품질 등급 판정.
//
//   3d    WebGL2 + 모션 허용. 기기에 따라 high(데스크톱) / medium(모바일 단말) 등급.
//   lite  WebGL2 없음 · prefers-reduced-motion · ?lite=1. 3D 없이 탭으로 리빌하는 최소 모드
//         (docs/PLAN-tarot.md 결정 13 — 애니메이션 두 벌은 만들지 않는다). jsdom 도 여기.
//
// ?3d=1 은 reduced-motion 을 무시하고 3D 를 강제(디버그·사용자 선택).

export type TarotRenderMode = '3d' | 'lite';
export type TarotQualityTier = 'high' | 'medium';

export interface TarotQuality {
  tier: TarotQualityTier;
  dpr: [number, number];
  sparkles: number;
  stars: number;
  bloom: boolean;
}

export const TAROT_QUALITY: Record<TarotQualityTier, TarotQuality> = {
  high: { tier: 'high', dpr: [1, 2], sparkles: 360, stars: 2400, bloom: true },
  // 모바일 단말 — bloom 은 후처리 패스가 커서 끄고 파티클을 1/3 로.
  medium: { tier: 'medium', dpr: [1, 1.5], sparkles: 120, stars: 1200, bloom: false },
};

export type TarotRenderReason = 'ok' | 'forced-lite' | 'reduced-motion' | 'no-webgl2' | 'no-window';

export interface TarotRenderDecision {
  mode: TarotRenderMode;
  quality: TarotQuality;
  reason: TarotRenderReason;
}

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;

export const hasWebGL2 = (): boolean => {
  if (typeof window === 'undefined' || typeof window.WebGL2RenderingContext !== 'function') return false;
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
};

export const detectTarotRender = (
  search: string = typeof window !== 'undefined' ? window.location.search : '',
): TarotRenderDecision => {
  const params = new URLSearchParams(search);
  const coarse = matches('(pointer: coarse)') || (typeof window !== 'undefined' && window.innerWidth < 768);
  const quality = coarse ? TAROT_QUALITY.medium : TAROT_QUALITY.high;
  if (params.get('lite') === '1') return { mode: 'lite', quality, reason: 'forced-lite' };
  if (typeof window === 'undefined') return { mode: 'lite', quality, reason: 'no-window' };
  if (params.get('3d') !== '1' && matches('(prefers-reduced-motion: reduce)')) {
    return { mode: 'lite', quality, reason: 'reduced-motion' };
  }
  if (!hasWebGL2()) return { mode: 'lite', quality, reason: 'no-webgl2' };
  return { mode: '3d', quality, reason: 'ok' };
};
