import { AbsoluteFill } from 'remotion';
import type { MealStoryIconType } from '@repo/api-contract';
import { Icon } from '../../../apps/web/src/routes/meal-story/motion/paper/Icon';
import { Grain } from '../../../apps/web/src/routes/meal-story/motion/paper/kit';
import { paperPalette } from '../../../apps/web/src/routes/meal-story/motion/paper/palette';
import { Anchovy, Milk, Mushroom, PaperShaker, PaperSpoon, RiceBowl } from '../../../apps/web/src/routes/meal-story/motion/paper/props';
import { FONT } from '../../../apps/web/src/routes/meal-story/motion/theme';

// 소품 점검 — 원고 icon 으로 쓸 수 있는 종이 소품을 한 장에(새 소품을 그리면 여기서 본다). 맨 아래 줄은 얼굴 있는 짝
// (나트륨 = 숟가락·소금통, 식이섬유 = 밥공기·버섯, 칼슘 = 우유곽·멸치).
// npx remotion still src/index.ts Props out/props.png --scale=0.6
const ICONS: MealStoryIconType[] = [
  'bowl', 'kimchi', 'sauce', 'can', 'ramen', 'shaker', 'spoon', 'lemon', 'magnifier', 'label', 'dip', 'noodle',
  'tomato', 'onion', 'garlic', 'oil', 'leaf', 'cheese', 'pot', 'pan', 'plate', 'timer', 'clock',
  'rice', 'mushroom', 'carrot', 'egg', 'sprout', 'bean', 'apple', 'water', 'sesame', 'soy', 'stirfry', 'bibimbap',
  'milk', 'anchovy', 'kale', 'tofu', 'yogurt', 'scallion', 'sesameseed', 'friedrice',
];
const COLS = 6;
const pal = paperPalette('sodium', false);

export const PropsSheet = () => (
  <AbsoluteFill style={{ backgroundColor: pal.bg }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
      {ICONS.map((icon, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = 104 + col * 174;
        const y = 112 + row * 200;
        return (
          <g key={icon}>
            <g transform={`translate(${x} ${y}) scale(0.55)`}>
              <Icon icon={icon} fallback={icon} pal={pal} f={30} v={0} />
            </g>
            <text x={x} y={y + 96} textAnchor="middle" fontFamily={FONT} fontSize={22} fontWeight={700} fill={pal.ink}>
              {icon}
            </text>
          </g>
        );
      })}
      <g transform="translate(110 1800) scale(0.3)">
        <PaperSpoon pal={pal} f={30} v={0} fill={1.3} mood="worried" seed={9} />
      </g>
      <g transform="translate(270 1800) scale(0.38)">
        <PaperShaker pal={pal} f={30} v={0} />
      </g>
      <g transform="translate(430 1800) scale(0.3)">
        <PaperSpoon pal={pal} f={30} v={0} fill={0} mood="calm" seed={9} ghost />
      </g>
      <g transform="translate(590 1806) scale(0.62)">
        <RiceBowl pal={pal} f={30} v={0} face="happy" />
      </g>
      <g transform="translate(740 1806) scale(0.56)">
        <Mushroom pal={pal} f={30} v={0} face="happy" />
      </g>
      <g transform="translate(880 1800) scale(0.6)">
        <Milk pal={pal} f={30} v={0} face="happy" />
      </g>
      <g transform="translate(1000 1806) scale(0.5)">
        <Anchovy pal={pal} f={30} v={0} face="happy" />
      </g>
    </svg>
    <Grain />
  </AbsoluteFill>
);
