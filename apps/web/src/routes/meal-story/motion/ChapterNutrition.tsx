import type { MealStorySceneType } from '@repo/api-contract';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { pop, prog, useClock } from './anim';
import { STAGE_BOTTOM, cardHeight, clamp, wrapText } from './layout';
import { RollingNumber } from './RollingNumber';
import { Card, Paper, Sheet, Tape } from './paper/kit';
import { Plate } from './paper/props';
import { boil, tornRect } from './paper/torn';
import { PaperHeading, PaperStage } from './Stage';
import { FONT, TYPE } from './theme';
import { NUTRITION, nutritionTiming } from './timeline';
import type { ChapterContext } from './types';

type NutritionScene = Extract<MealStorySceneType, { type: 'nutrition' }>;

const CARD = { x: 110, y: 690, w: 860 };
/** 라벨 머리(제목·기준·굵은 줄)의 높이 + 아래 여백. */
const HEAD = 230;
const NOTE_GAP = 22;

/**
 * 영양정보 — 식단 '영양정보 라벨'을 종이로 오려 붙였다. 라벨이 떨어져 테이프로 붙고, 굵은 줄이 그어지고, 줄마다 숫자가
 * 굴러 오른다. 주의 문구·덧말은 분홍 쪽지로 라벨 아래. 줄이 많고 쪽지도 많으면 줄 높이를 줄여 무대 안에 넣는다
 * (줄 6 + 주의 2 + 덧말까지 — 줄 이름은 보조 글 하한 아래로 내리지 않는다).
 */
export const ChapterNutrition = ({ scene, ctx }: { scene: NutritionScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal } = ctx;
  const v = boil(f);
  const timing = nutritionTiming(scene.rows.length);
  const notes = [...scene.cautions, ...(scene.note ? [scene.note] : [])].map((text) => wrapText(text, TYPE.sub, 800));
  const notesH = notes.reduce((sum, lines) => sum + cardHeight(lines.length, TYPE.sub) + NOTE_GAP, 0);
  const rows = Math.max(1, scene.rows.length);
  const rowH = clamp((STAGE_BOTTOM - (notes.length ? notesH + 14 : 0) - CARD.y - HEAD) / rows, 70, 96);
  const labelSize = clamp(Math.round(rowH * 0.44), TYPE.sub, 42);
  const numSize = clamp(Math.round(rowH * 0.52), 44, 50);
  const cardH = HEAD + scene.rows.length * rowH;
  const drop = pop(f, NUTRITION.card[0], fps, { damping: 13, stiffness: 120 });
  const rule = prog(f, NUTRITION.rule[0], NUTRITION.rule[1]);
  const tail = prog(f, timing.tailAt, timing.tailAt + 20);
  let y = CARD.y + cardH + 36;
  const cards = notes.map((lines) => {
    const at = y;
    y += cardHeight(lines.length, TYPE.sub) + NOTE_GAP;
    return { lines, at };
  });
  const rowTop = (i: number) => CARD.y + 206 + i * rowH;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PaperHeading ctx={ctx} title={scene.title} />
      <PaperStage ctx={ctx} table={1620}>
        <g transform="translate(840 1760) scale(0.8)">
          <Plate pal={pal} f={f} v={v} />
        </g>
      </PaperStage>
      <AbsoluteFill style={{ transform: `translateY(${(1 - drop) * -700}px) rotate(${(1 - drop) * 4}deg)`, opacity: Math.min(1, drop * 2) }}>
        <Sheet>
          <g transform={`rotate(-0.6 540 ${CARD.y + cardH / 2})`}>
            <Paper d={tornRect(CARD.x, CARD.y, CARD.w, Math.round(cardH), { seed: 101 + v * 101, amp: 2.6, step: 8 })} fill={pal.paper} lift={1.4} />
            <rect x={CARD.x + 22} y={CARD.y + 22} width={CARD.w - 44} height={cardH - 44} fill="none" stroke={pal.ink} strokeWidth={8} />
            <text x={CARD.x + 46} y={CARD.y + 104} fontFamily={FONT} fontWeight={900} fontSize={70} letterSpacing={-3} fill={pal.ink}>
              영양정보
            </text>
            <text x={CARD.x + 48} y={CARD.y + 154} fontFamily={FONT} fontWeight={700} fontSize={TYPE.sub} fill={pal.ink}>
              {scene.servings}인분 기준
            </text>
            <rect x={CARD.x + 46} y={CARD.y + 174} width={(CARD.w - 92) * rule} height={18} fill={pal.ink} />
            {scene.rows.map((row, i) => {
              const start = timing.rowStart(i);
              const p = pop(f, start, fps, { damping: 14, stiffness: 160 });
              const top = rowTop(i);
              return (
                <g key={row.key} opacity={p} transform={`translate(0 ${(1 - p) * 18})`}>
                  <text x={CARD.x + 48} y={top + rowH * 0.65} fontFamily={FONT} fontWeight={800} fontSize={labelSize} fill={pal.ink}>
                    {row.label}
                  </text>
                  {i < scene.rows.length - 1 ? <rect x={CARD.x + 46} y={top + rowH - 2} width={CARD.w - 92} height={3} fill={pal.ink} /> : null}
                </g>
              );
            })}
          </g>
          <Tape x={540} y={CARD.y + 2} angle={-3} pal={pal} w={150} />
        </Sheet>
        {scene.rows.map((row, i) => {
          const start = timing.rowStart(i);
          const p = pop(f, start, fps, { damping: 14, stiffness: 160 });
          const count = prog(f, start, start + NUTRITION.count);
          const value = row.figure.value;
          return (
            <div
              key={row.key}
              style={{ position: 'absolute', right: 1080 - (CARD.x + CARD.w - 48), top: rowTop(i) + (rowH - numSize) / 2 - 4, width: 'max-content', opacity: p, transform: 'rotate(-0.6deg)' }}
            >
              {value !== null ? (
                <RollingNumber target={value} progress={count} size={numSize} color={pal.ink} unit={row.figure.unit} unitScale={0.7} />
              ) : (
                <span style={{ display: 'block', fontFamily: FONT, fontSize: 36, lineHeight: `${numSize}px`, fontWeight: 600, color: pal.ink }}>값 없음</span>
              )}
            </div>
          );
        })}
      </AbsoluteFill>
      {cards.length ? (
        <Sheet>
          <g opacity={tail} transform={`translate(0 ${(1 - tail) * 30})`}>
            {cards.map((c, i) => (
              <Card key={i} x={540} y={c.at} lines={c.lines} size={TYPE.sub} fill={i < scene.cautions.length ? pal.pink : pal.paper} color={pal.ink} weight={700} angle={i % 2 ? 0.8 : -0.8} seed={111 + i + v * 101} />
            ))}
          </g>
        </Sheet>
      ) : null}
    </AbsoluteFill>
  );
};
