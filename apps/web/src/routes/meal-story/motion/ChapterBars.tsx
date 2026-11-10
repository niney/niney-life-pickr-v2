import type { MealStorySceneType } from '@repo/api-contract';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { lerp, pop, prog, rand, useClock } from './anim';
import { BARS, barsLayout, barsPaperWidth, fitSize, wrapText } from './layout';
import { RollingNumber } from './RollingNumber';
import { Card, Note, Paper, Sheet, Tape } from './paper/kit';
import { boil, tornRect } from './paper/torn';
import { PaperHeading, PaperStage } from './Stage';
import { FONT, TYPE, formatAmount } from './theme';
import { barsFootnotes, barsTiming } from './timeline';
import type { ChapterContext } from './types';

type BarsScene = Extract<MealStorySceneType, { type: 'bars' }>;

const { TRACK_X, TRACK_W, TOP, NOTE_SIZE } = BARS;

/**
 * 막대 비교 — 벽에 붙인 색종이 띠가 차례로 왼쪽에서 자라고, 값 쪽지 위로 숫자가 굴러 오른다(나트륨이면 소금 조각이 띠를
 * 따라 흘러간다). 둘이고 차이가 크면 작은 쪽 아래 '약 N분의 1' 쪽지. 강조 띠는 노랑, 나머지는 옅은 하늘색.
 * 값을 모르는 막대(서버가 못 구했다)는 띠 없이 '값 없음' — 0 으로 그리지 않는다.
 */
export const ChapterBars = ({ scene, ctx }: { scene: BarsScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal, id } = ctx;
  const v = boil(f);
  const values = scene.bars.map((b) => b.figure.value);
  const known = values.filter((x): x is number => x !== null);
  const max = Math.max(1, ...known);
  const salty = ctx.story.topic?.nutrient === 'sodium' && scene.bars.every((b) => b.figure.unit === 'mg');
  const timing = barsTiming(scene.bars.length);
  const { growStart } = timing;
  const noteLines = scene.note ? wrapText(scene.note, NOTE_SIZE, 840) : [];
  const footLines = barsFootnotes(scene).flatMap((d) => wrapText(`※ ${d}`, TYPE.foot, 840));
  const L = barsLayout(scene.bars.length, noteLines.length, footLines.length);

  // 작은 쪽이 큰 쪽의 '약 N분의 1' — 서버가 두 값으로 계산해 준 것만 말한다(어림이 맞지 않으면 서버가 비운다).
  const fraction = scene.fraction;
  const stamp = fraction ? pop(f, timing.stampAt, fps, { damping: 9, stiffness: 200 }) : 0;
  const note = prog(f, timing.noteAt, timing.noteAt + 18);
  const paperW = barsPaperWidth(
    scene.bars.map((b) => ({ number: b.figure.value === null ? null : formatAmount(b.figure.value, b.figure.unit), unit: b.figure.unit })),
    L.numSize,
  );
  const paperLeft = TRACK_X + TRACK_W - paperW;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PaperHeading ctx={ctx} title={scene.title} />
      <PaperStage ctx={ctx} table={null} />
      {scene.bars.map((bar, i) => {
        const enter = pop(f, growStart(i) - 14, fps, { damping: 14, stiffness: 140 });
        const grow = prog(f, growStart(i), growStart(i) + timing.grow);
        const value = values[i] ?? null;
        const full = value === null ? 0 : Math.max(18, (value / max) * TRACK_W);
        const top = TOP + i * L.rowH;
        const barTop = top + L.barTop;
        const paperTop = barTop - 8 - L.paperH;
        const fill = bar.highlight ? pal.yellow : '#dbe6f7';
        const aside = bar.aside;
        return (
          <AbsoluteFill key={i} style={{ opacity: Math.min(1, enter * 1.5), transform: `translateX(${(1 - enter) * 160}px)` }}>
            <Sheet>
              <defs>
                <clipPath id={`${id}-bar-${i}`}>
                  <rect x={TRACK_X - 10} y={barTop - 12} width={10 + full * grow + 12} height={L.barH + 34} />
                </clipPath>
              </defs>
              <Note
                x={TRACK_X}
                y={top}
                text={bar.label}
                size={fitSize(bar.label, L.labelSize, paperLeft - TRACK_X - 76, TYPE.foot)}
                fill={pal.paper}
                color={pal.ink}
                weight={bar.highlight ? 800 : 700}
                anchor="start"
                angle={-1.2}
                seed={31 + i + v * 101}
              />
              <Paper d={tornRect(TRACK_X, Math.round(barTop + 4), TRACK_W, Math.round(L.barH - 8), { seed: 35 + i + v * 101, amp: 2, step: 7 })} fill="rgba(255,255,255,0.16)" lift={0} />
              {value !== null ? (
                <g clipPath={`url(#${id}-bar-${i})`}>
                  <Paper d={tornRect(TRACK_X, Math.round(barTop), Math.round(full), L.barH, { seed: 37 + i + v * 101, amp: 2.6, step: 7 })} fill={fill} lift={0.8} />
                </g>
              ) : null}
              {salty && value !== null && grow > 0 && grow < 1
                ? Array.from({ length: 12 }, (_, k) => {
                    const t = ((f * 0.06 + rand(i * 31 + k)) % 1) * Math.max(0, full * grow - 20);
                    const y = barTop + 10 + rand(i * 17 + k * 3.3) * (L.barH - 26);
                    return <rect key={k} x={TRACK_X + t} y={y} width={11} height={11} rx={1.5} fill={pal.salt} transform={`rotate(${k * 33 + f * 4} ${TRACK_X + t + 5} ${y + 5})`} />;
                  })
                : null}
              <g transform={`rotate(1.5 ${paperLeft + paperW / 2} ${paperTop + L.paperH / 2})`}>
                <Paper d={tornRect(paperLeft, Math.round(paperTop), paperW, L.paperH, { seed: 39 + i + v * 101, amp: 2.2, step: 6 })} fill={pal.paper} lift={0.8} />
              </g>
              {aside ? (
                <text x={TRACK_X} y={barTop + L.barH + 46} fontFamily={FONT} fontWeight={600} fontSize={TYPE.sub} fill="#ffffff" opacity={0.94 * grow}>
                  {aside.label} {aside.figure.value !== null ? `${formatAmount(aside.figure.value, aside.figure.unit)}${aside.figure.unit}` : '값 없음'}
                </text>
              ) : null}
              {fraction && i === fraction.bar ? (
                <g transform={`translate(${TRACK_X + 14} ${barTop + L.barH + (aside ? 70 : 22)}) rotate(-6) scale(${lerp(2.2, 1, stamp)})`} opacity={Math.min(1, stamp * 3)}>
                  <Note x={0} y={0} text={`약 ${fraction.denominator}분의 1`} size={Math.round(L.numSize * 0.62)} fill={pal.yellow} color={pal.ink} weight={900} anchor="start" seed={45 + v * 101} lift={1.2} />
                  <Tape x={20} y={6} angle={-30} pal={pal} w={80} />
                </g>
              ) : null}
            </Sheet>
            <div
              style={{
                position: 'absolute',
                right: 1080 - (TRACK_X + TRACK_W) + 20,
                top: paperTop + (L.paperH - L.numSize) / 2 - 2,
                width: 'max-content',
                transform: 'rotate(1.5deg)',
              }}
            >
              {value !== null ? (
                <RollingNumber target={value} progress={grow} size={L.numSize} color={pal.ink} unit={bar.figure.unit} unitScale={0.5} />
              ) : (
                <span style={{ display: 'block', fontFamily: FONT, fontSize: Math.round(L.numSize * 0.6), lineHeight: `${L.numSize}px`, fontWeight: 700, color: pal.inkFaint }}>값 없음</span>
              )}
            </div>
          </AbsoluteFill>
        );
      })}
      {noteLines.length || footLines.length ? (
        <Sheet>
          <g opacity={note} transform={`translate(0 ${(1 - note) * 30})`}>
            {noteLines.length ? <Card x={540} y={L.noteTop} lines={noteLines} size={NOTE_SIZE} fill={pal.paper} color={pal.ink} angle={-0.8} seed={51 + v * 101} /> : null}
            {footLines.length ? (
              <Card x={540} y={L.footTop} lines={footLines} size={TYPE.foot} fill={pal.cream} color={pal.inkFaint} weight={600} angle={0.6} seed={53 + v * 101} lift={0.4} />
            ) : null}
          </g>
        </Sheet>
      ) : null}
    </AbsoluteFill>
  );
};
