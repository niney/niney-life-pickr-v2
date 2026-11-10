import { AbsoluteFill } from 'remotion';
import type { MealStoryIconType } from '@repo/api-contract';
import { Icon } from '../../../apps/web/src/routes/meal-story/motion/paper/Icon';
import { Grain } from '../../../apps/web/src/routes/meal-story/motion/paper/kit';
import { paperPalette } from '../../../apps/web/src/routes/meal-story/motion/paper/palette';
import { PaperShaker, PaperSpoon } from '../../../apps/web/src/routes/meal-story/motion/paper/props';
import { FONT } from '../../../apps/web/src/routes/meal-story/motion/theme';

// 소품 점검 — 원고 icon 으로 쓸 수 있는 종이 소품을 한 장에(새 소품을 그리면 여기서 본다).
// npx remotion still src/index.ts Props out/props.png --scale=0.6
const ICONS: MealStoryIconType[] = [
  'bowl', 'kimchi', 'sauce', 'can', 'ramen', 'shaker', 'spoon', 'lemon', 'magnifier', 'label', 'dip', 'noodle',
  'tomato', 'onion', 'garlic', 'oil', 'leaf', 'cheese', 'pot', 'pan', 'plate', 'timer', 'clock',
];
const pal = paperPalette('sodium', false);

export const PropsSheet = () => (
  <AbsoluteFill style={{ backgroundColor: pal.bg }}>
    <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
      {ICONS.map((icon, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 140 + col * 266;
        const y = 150 + row * 270;
        return (
          <g key={icon}>
            <g transform={`translate(${x} ${y}) scale(0.78)`}>
              <Icon icon={icon} fallback={icon} pal={pal} f={30} v={0} />
            </g>
            <text x={x} y={y + 125} textAnchor="middle" fontFamily={FONT} fontSize={26} fontWeight={700} fill={pal.ink}>
              {icon}
            </text>
          </g>
        );
      })}
      <g transform="translate(400 1780) scale(0.42)">
        <PaperSpoon pal={pal} f={30} v={0} fill={1.3} mood="worried" seed={9} />
      </g>
      <g transform="translate(640 1760) scale(0.5)">
        <PaperShaker pal={pal} f={30} v={0} />
      </g>
      <g transform="translate(860 1780) scale(0.42)">
        <PaperSpoon pal={pal} f={30} v={0} fill={0} mood="calm" seed={9} ghost />
      </g>
    </svg>
    <Grain />
  </AbsoluteFill>
);
