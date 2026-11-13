import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import type { MealStoryIconType } from '@repo/api-contract';
import { Icon } from '../../../apps/web/src/routes/meal-story/motion/paper/Icon';
import { Grain } from '../../../apps/web/src/routes/meal-story/motion/paper/kit';
import { paperPalette } from '../../../apps/web/src/routes/meal-story/motion/paper/palette';
import {
  Anchovy,
  Konjac,
  Milk,
  Mushroom,
  PaperShaker,
  PaperSpoon,
  Paprika,
  RiceBowl,
  Somen,
  Tangerine,
  type PropProps,
} from '../../../apps/web/src/routes/meal-story/motion/paper/props';
import { FONT } from '../../../apps/web/src/routes/meal-story/motion/theme';

// 소품 점검 — 원고 icon 으로 쓸 수 있는 종이 소품을 한 장에(새 소품을 그리면 여기서 본다). 아래 두 줄은 얼굴 있는 짝
// (나트륨 = 숟가락·소금통, 식이섬유 = 밥공기·버섯, 칼슘 = 우유곽·멸치, 비타민 C = 파프리카·귤, 열량 = 소면·곤약면).
// npx remotion still src/index.ts Props out/props.png --scale=0.6
const ICONS: MealStoryIconType[] = [
  'bowl', 'kimchi', 'sauce', 'can', 'ramen', 'shaker', 'spoon', 'lemon', 'magnifier', 'label', 'dip', 'noodle',
  'tomato', 'onion', 'garlic', 'oil', 'leaf', 'cheese', 'pot', 'pan', 'plate', 'timer', 'clock',
  'rice', 'mushroom', 'carrot', 'egg', 'sprout', 'bean', 'apple', 'water', 'sesame', 'soy', 'stirfry', 'bibimbap',
  'milk', 'anchovy', 'kale', 'tofu', 'yogurt', 'scallion', 'sesameseed', 'friedrice',
  'paprika', 'broccoli', 'kiwi', 'tangerine', 'chicken', 'sweetpotato', 'salad',
  'somen', 'soba', 'udon', 'ricenoodle', 'glassnoodle', 'spaghetti', 'konjac', 'tofunoodle', 'squash', 'cucumber', 'gochujang', 'bibimnoodle',
  'udonbowl', 'naengmyeon', 'jjamppong', 'jajangmyeon', 'kalguksu', 'pho', 'gukbap', 'deopbap', 'jajangbap', 'gimbap', 'hoedeopbap',
  'haejangguk', 'chueotang', 'budaejjigae', 'kimchijjigae', 'sundaeguk', 'sundubu',
];
const COLS = 9;
const pal = paperPalette('sodium', false);
const base: PropProps = { pal, f: 30, v: 0 };

// 얼굴 있는 짝 — 그림과 크기. 숟가락은 걱정하는 얼굴·빈 윤곽도 함께 본다.
const PALS: { scale: number; draw: ReactNode }[] = [
  { scale: 0.28, draw: <PaperSpoon {...base} fill={1.3} mood="worried" seed={9} /> },
  { scale: 0.36, draw: <PaperShaker {...base} /> },
  { scale: 0.28, draw: <PaperSpoon {...base} fill={0} mood="calm" seed={9} ghost /> },
  { scale: 0.56, draw: <RiceBowl {...base} face="happy" /> },
  { scale: 0.5, draw: <Mushroom {...base} face="happy" /> },
  { scale: 0.54, draw: <Milk {...base} face="happy" /> },
  { scale: 0.44, draw: <Anchovy {...base} face="happy" /> },
  { scale: 0.5, draw: <Paprika {...base} face="happy" /> },
  { scale: 0.42, draw: <Tangerine {...base} face="happy" /> },
  { scale: 0.5, draw: <Somen {...base} face="happy" /> },
  { scale: 0.5, draw: <Konjac {...base} face="happy" /> },
];
const PAL_COLS = 6;

export const PropsSheet = () => (
  <AbsoluteFill style={{ backgroundColor: pal.bg }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
      {ICONS.map((icon, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = 68 + col * 118;
        const y = 80 + row * 170;
        return (
          <g key={icon}>
            <g transform={`translate(${x} ${y}) scale(0.41)`}>
              <Icon icon={icon} fallback={icon} pal={pal} f={30} v={0} />
            </g>
            <text x={x} y={y + 76} textAnchor="middle" fontFamily={FONT} fontSize={17} fontWeight={700} fill={pal.ink}>
              {icon}
            </text>
          </g>
        );
      })}
      {PALS.map((p, i) => (
        <g key={i} transform={`translate(${110 + (i % PAL_COLS) * 172} ${1650 + Math.floor(i / PAL_COLS) * 150}) scale(${p.scale})`}>
          {p.draw}
        </g>
      ))}
    </svg>
    <Grain />
  </AbsoluteFill>
);
