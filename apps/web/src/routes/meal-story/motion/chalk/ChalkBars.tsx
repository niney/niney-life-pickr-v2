import type { MealStorySceneType } from '@repo/api-contract';
import { useVideoConfig } from 'remotion';
import { lerp, pop, prog, useClock } from '../anim';
import { clamp, fractionText, textWidth } from '../layout';
import { HAND, TYPE, formatAmount } from '../theme';
import { barsFootnotes, barsTiming } from '../timeline';
import type { ChapterContext } from '../types';
import { CHALK, CHALK_AREA, chalkHeading, chalkNoteLayout, draw, fitHand, handWidth, scribble, writeOn } from './chalkLayout';
import { ChalkBoard, ChalkHeading, ChalkNote, ChalkNumber } from './kit';

type BarsScene = Extract<MealStorySceneType, { type: 'bars' }>;

const { left: X, width: W } = CHALK_AREA;

/**
 * 막대 비교(칠판) — 둘~넷을 크게: 이름과 큰 숫자, 그 아래 굵은 분필 빗금 막대가 차례로 그어진다. 강조한 막대는 노란 분필,
 * 나머지는 분홍. 둘이고 서버가 어림을 줬으면(약 N분의 1 · 약 N배) 그 막대 아래 노란 동그라미 안에 적는다.
 * 값을 모르는 막대는 막대 없이 '값 없음'.
 */
export const ChalkBars = ({ scene, ctx }: { scene: BarsScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const n = scene.bars.length;
  const timing = barsTiming(n);
  const head = chalkHeading(scene.title);
  const max = Math.max(1, ...scene.bars.flatMap((b) => (b.figure.value === null ? [] : [b.figure.value])));
  const note = chalkNoteLayout(scene.note, barsFootnotes(scene));
  const top = head.bottom + 76;
  const rowH = clamp(((note.h ? note.top - 30 : CHALK_AREA.noteBottom) - top) / n, 190, 400);
  const labelSize = clamp(Math.round(rowH * 0.15), TYPE.body, 60);
  const numSize = clamp(Math.round(rowH * 0.27), 64, 110);
  const unitEm = Math.max(0.5, TYPE.foot / numSize);
  const barH = clamp(Math.round(rowH * 0.24), 44, 96);
  const lineH = Math.round(numSize * 1.1);
  const fraction = scene.fraction;
  const stamp = fraction ? pop(f, timing.stampAt, fps, { damping: 9, stiffness: 200 }) : 0;
  return (
    <ChalkBoard>
      <ChalkHeading ctx={ctx} title={scene.title} />
      {scene.bars.map((bar, i) => {
        const s = timing.growStart(i);
        const name = prog(f, s - 14, s - 2);
        const grow = prog(f, s, s + timing.grow);
        const value = bar.figure.value;
        const numW = value === null ? handWidth('값 없음', numSize * 0.6) : handWidth(formatAmount(value, bar.figure.unit), numSize) + textWidth(bar.figure.unit, numSize * unitEm) + 10;
        const size = fitHand(bar.label, labelSize, W - numW - 40, TYPE.foot);
        const color = bar.highlight ? CHALK.yellow : CHALK.pink;
        const fracSize = Math.round(numSize * 0.6);
        return (
          <div key={i} style={{ position: 'absolute', left: X, top: top + i * rowH, width: W, opacity: name > 0 ? 1 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', height: lineH }}>
              <span style={{ fontFamily: HAND, fontWeight: 700, fontSize: size, letterSpacing: '-0.04em', whiteSpace: 'nowrap', ...writeOn(name) }}>{bar.label}</span>
              {value === null ? (
                <span style={{ fontFamily: HAND, fontWeight: 700, fontSize: Math.round(numSize * 0.6), color: CHALK.faint, whiteSpace: 'nowrap' }}>값 없음</span>
              ) : (
                <ChalkNumber value={value} progress={grow} unit={bar.figure.unit} size={numSize} unitEm={unitEm} color={bar.highlight ? CHALK.yellow : CHALK.white} />
              )}
            </div>
            {value === null ? (
              <div style={{ height: barH + 14 }} />
            ) : (
              <svg width={W} height={barH + 14} style={{ display: 'block', marginTop: 10, overflow: 'visible' }}>
                <path d={scribble(0, 2, Math.max(30, (value / max) * (W - 6)), barH, 41 + i, clamp(Math.round(barH * 0.26), 13, 22))} stroke={color} strokeWidth={9} fill="none" strokeLinejoin="round" strokeLinecap="round" {...draw(grow)} />
              </svg>
            )}
            {bar.aside ? (
              <div style={{ marginTop: 6, fontSize: TYPE.sub, lineHeight: '44px', fontWeight: 600, color: CHALK.faint, opacity: grow }}>
                {bar.aside.label} {bar.aside.figure.value !== null ? `${formatAmount(bar.aside.figure.value, bar.aside.figure.unit)}${bar.aside.figure.unit}` : '값 없음'}
              </div>
            ) : null}
            {fraction && i === fraction.bar ? (
              <div
                style={{
                  display: 'inline-block',
                  marginTop: 12,
                  marginLeft: 6,
                  padding: '4px 30px 10px',
                  border: `5px solid ${CHALK.yellow}`,
                  borderRadius: '50% 46% 52% 48% / 54% 50% 50% 46%',
                  color: CHALK.yellow,
                  fontFamily: HAND,
                  fontWeight: 700,
                  fontSize: fracSize,
                  lineHeight: 1.2,
                  letterSpacing: '-0.04em',
                  whiteSpace: 'nowrap',
                  transform: `rotate(-4deg) scale(${lerp(1.8, 1, stamp)})`,
                  transformOrigin: '0 50%',
                  opacity: Math.min(1, stamp * 3),
                }}
              >
                {fractionText(fraction)}
              </div>
            ) : null}
          </div>
        );
      })}
      <ChalkNote layout={note} p={prog(f, timing.noteAt, timing.noteAt + 18)} />
    </ChalkBoard>
  );
};
