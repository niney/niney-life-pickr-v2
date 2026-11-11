import { AbsoluteFill } from 'remotion';
import type { MealStoryIconType } from '@repo/api-contract';
import { Icon } from '../../../apps/web/src/routes/meal-story/motion/paper/Icon';
import { Grain } from '../../../apps/web/src/routes/meal-story/motion/paper/kit';
import { paperPalette } from '../../../apps/web/src/routes/meal-story/motion/paper/palette';
import { Anchovy, Milk, Mushroom, PaperShaker, PaperSpoon, Paprika, RiceBowl, Tangerine } from '../../../apps/web/src/routes/meal-story/motion/paper/props';
import { FONT } from '../../../apps/web/src/routes/meal-story/motion/theme';

// 소품 점검 — 원고 icon 으로 쓸 수 있는 종이 소품을 한 장에(새 소품을 그리면 여기서 본다). 맨 아래 줄은 얼굴 있는 짝
// (나트륨 = 숟가락·소금통, 식이섬유 = 밥공기·버섯, 칼슘 = 우유곽·멸치, 비타민 C = 파프리카·귤).
// npx remotion still src/index.ts Props out/props.png --scale=0.6
const ICONS: MealStoryIconType[] = [
  'bowl', 'kimchi', 'sauce', 'can', 'ramen', 'shaker', 'spoon', 'lemon', 'magnifier', 'label', 'dip', 'noodle',
  'tomato', 'onion', 'garlic', 'oil', 'leaf', 'cheese', 'pot', 'pan', 'plate', 'timer', 'clock',
  'rice', 'mushroom', 'carrot', 'egg', 'sprout', 'bean', 'apple', 'water', 'sesame', 'soy', 'stirfry', 'bibimbap',
  'milk', 'anchovy', 'kale', 'tofu', 'yogurt', 'scallion', 'sesameseed', 'friedrice',
  'paprika', 'broccoli', 'kiwi', 'tangerine', 'chicken', 'sweetpotato', 'salad',
];
const COLS = 7;
const pal = paperPalette('sodium', false);

export const PropsSheet = () => (
  <AbsoluteFill style={{ backgroundColor: pal.bg }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
      {ICONS.map((icon, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = 90 + col * 150;
        const y = 104 + row * 196;
        return (
          <g key={icon}>
            <g transform={`translate(${x} ${y}) scale(0.5)`}>
              <Icon icon={icon} fallback={icon} pal={pal} f={30} v={0} />
            </g>
            <text x={x} y={y + 90} textAnchor="middle" fontFamily={FONT} fontSize={20} fontWeight={700} fill={pal.ink}>
              {icon}
            </text>
          </g>
        );
      })}
      <g transform="translate(80 1800) scale(0.28)">
        <PaperSpoon pal={pal} f={30} v={0} fill={1.3} mood="worried" seed={9} />
      </g>
      <g transform="translate(206 1800) scale(0.36)">
        <PaperShaker pal={pal} f={30} v={0} />
      </g>
      <g transform="translate(332 1800) scale(0.28)">
        <PaperSpoon pal={pal} f={30} v={0} fill={0} mood="calm" seed={9} ghost />
      </g>
      <g transform="translate(468 1806) scale(0.56)">
        <RiceBowl pal={pal} f={30} v={0} face="happy" />
      </g>
      <g transform="translate(598 1806) scale(0.5)">
        <Mushroom pal={pal} f={30} v={0} face="happy" />
      </g>
      <g transform="translate(716 1800) scale(0.54)">
        <Milk pal={pal} f={30} v={0} face="happy" />
      </g>
      <g transform="translate(826 1806) scale(0.44)">
        <Anchovy pal={pal} f={30} v={0} face="happy" />
      </g>
      <g transform="translate(930 1800) scale(0.5)">
        <Paprika pal={pal} f={30} v={0} face="happy" />
      </g>
      <g transform="translate(1024 1806) scale(0.42)">
        <Tangerine pal={pal} f={30} v={0} face="happy" />
      </g>
    </svg>
    <Grain />
  </AbsoluteFill>
);
