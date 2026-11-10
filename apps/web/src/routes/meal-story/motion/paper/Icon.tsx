import type { MealStoryIconType } from '@repo/api-contract';
import { PROP_FOR } from './icons';
import type { PaperPalette } from './palette';
import { Badge } from './props';

/** 원고의 소품 그림 — 이름이 없으면 첫 글자 동그라미. 원점 가운데, 약 240 크기. */
export const Icon = ({ icon, fallback, pal, f, v }: { icon: MealStoryIconType | null; fallback: string; pal: PaperPalette; f: number; v: number }) => {
  const Prop = icon ? PROP_FOR[icon] : null;
  return Prop ? <Prop pal={pal} f={f} v={v} /> : <Badge pal={pal} f={f} v={v} text={fallback} />;
};
