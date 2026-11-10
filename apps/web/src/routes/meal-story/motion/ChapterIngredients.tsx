import type { MealStorySceneType } from '@repo/api-contract';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { lerp, pop, prog, rand, useClock } from './anim';
import { fitSize, textWidth } from './layout';
import { RollingNumber } from './RollingNumber';
import { Icon } from './paper/Icon';
import { Note, Paper, Sheet, Tape } from './paper/kit';
import { boil, tornEllipse, tornPath, tornRect } from './paper/torn';
import { PaperHeading, PaperStage } from './Stage';
import { FONT, TYPE, formatAmount } from './theme';
import { INGREDIENTS } from './timeline';
import type { ChapterContext } from './types';

type IngredientsScene = Extract<MealStorySceneType, { type: 'ingredients' }>;

const CARD = { x: 70, y: 650, w: 940 };
// 카드 안 자리 — 소품 그림(가운데 x), 공책 세로줄, 재료 이름 시작. 세로줄은 그림과 이름 사이(이름 글자를 가로지르지 않게).
const ICON_X = CARD.x + 58;
const MARGIN_X = CARD.x + 114;
const LABEL_X = CARD.x + 134;
/** 이름(+메모)이 쓸 수 있는 너비 — 오른쪽 그램 숫자 앞까지. */
const LABEL_W = 600;
const BOWL = { x: 540, y: 1610 };
const BOWL_FRONT = `M ${BOWL.x - 300} ${BOWL.y} L ${BOWL.x + 300} ${BOWL.y} C ${BOWL.x + 290} ${BOWL.y + 170}, ${BOWL.x + 160} ${BOWL.y + 236}, ${BOWL.x} ${BOWL.y + 236} C ${BOWL.x - 160} ${BOWL.y + 236}, ${BOWL.x - 290} ${BOWL.y + 170}, ${BOWL.x - 300} ${BOWL.y} Z`;

/**
 * 재료 — 줄 쳐진 레시피 카드에 재료가 한 줄씩 붙고 그램이 굴러 오른다. 줄마다 그 재료 그림이 그램 쪽지를 달고 포물선으로
 * 날아 식탁 위 큰 그릇에 쏙 들어간다. 이름은 본문 크기(재료 9개까지 TYPE.sub 이상), 메모는 자리가 될 때만 옆에 붙는다.
 */
export const ChapterIngredients = ({ scene, ctx }: { scene: IngredientsScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal } = ctx;
  const v = boil(f);
  const n = Math.max(1, scene.items.length);
  const rowH = Math.min(104, 720 / n);
  const cardH = Math.round(56 + n * rowH);
  const card = pop(f, 8, fps, { damping: 14, stiffness: 120 });
  const bowlIn = pop(f, INGREDIENTS.bowl, fps, { damping: 14, stiffness: 120 });
  const labelSize = Math.min(44, Math.round(rowH * 0.42));
  const noteSize = Math.max(TYPE.foot, Math.round(labelSize * 0.74));
  const flights = scene.items.map((item, i) => {
    const start = INGREDIENTS.first + i * INGREDIENTS.stagger + 12;
    const t = prog(f, start, start + 22, (x) => x);
    const rowY = CARD.y + 34 + i * rowH + rowH / 2;
    const toX = BOWL.x + (rand(i * 7.1) - 0.5) * 380;
    const toY = BOWL.y - 10 - (i % 3) * 18 - rand(i * 3.3) * 14;
    return { item, t, x: lerp(ICON_X, toX, t), y: lerp(rowY, toY, t) - Math.sin(t * Math.PI) * 240, landed: t >= 1 };
  });
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PaperHeading ctx={ctx} title={`${scene.title} · ${scene.servings}인분`} />
      <PaperStage ctx={ctx} table={1460} />
      <AbsoluteFill style={{ transform: `translateY(${(1 - card) * 300}px)`, opacity: Math.min(1, card * 2) }}>
        <Sheet>
          <g transform={`rotate(-0.8 540 ${CARD.y + cardH / 2})`}>
            <Paper d={tornRect(CARD.x, CARD.y, CARD.w, cardH, { seed: 81 + v * 101, amp: 3, step: 8 })} fill={pal.paper} lift={1.3} />
            {scene.items.map((_, i) => (
              <rect key={i} x={CARD.x + 30} y={CARD.y + 34 + (i + 1) * rowH - 2} width={CARD.w - 60} height={3} fill="#9fb5d9" opacity={0.7} />
            ))}
            <rect x={MARGIN_X} y={CARD.y + 16} width={3} height={cardH - 32} fill="#e58f8f" opacity={0.6} />
          </g>
          <Tape x={CARD.x + 60} y={CARD.y + 4} angle={-30} pal={pal} />
          <Tape x={CARD.x + CARD.w - 60} y={CARD.y + 2} angle={26} pal={pal} />
          {scene.items.map((item, i) => {
            const start = INGREDIENTS.first + i * INGREDIENTS.stagger;
            const enter = pop(f, start, fps, { damping: 14, stiffness: 150 });
            const rowTop = CARD.y + 34 + i * rowH;
            const flown = flights[i]!.t > 0;
            const size = fitSize(item.label, labelSize, LABEL_W, TYPE.foot);
            const noteText = item.note ? ` · ${item.note}` : '';
            // 메모는 이름 옆에 다 들어갈 때만(안 들어가면 영상에서는 뺀다 — 레시피 전체 보기에 있다).
            const showNote = !!noteText && textWidth(item.label, size) + textWidth(noteText, noteSize) <= LABEL_W;
            return (
              <g key={i} opacity={Math.min(1, enter * 1.5)} transform={`translate(${(1 - enter) * 360} 0)`}>
                {!flown ? (
                  <g transform={`translate(${ICON_X} ${rowTop + rowH / 2}) scale(${rowH / 320})`}>
                    <Icon icon={item.icon} fallback={item.label} pal={pal} f={f} v={v} />
                  </g>
                ) : null}
                <text x={LABEL_X} y={rowTop + rowH * 0.64} fontFamily={FONT} fontWeight={800} fontSize={size} letterSpacing={-size * 0.02} fill={pal.ink}>
                  {item.label}
                  {showNote ? (
                    <tspan fontSize={noteSize} fontWeight={600} fill={pal.inkFaint}>
                      {noteText}
                    </tspan>
                  ) : null}
                </text>
              </g>
            );
          })}
        </Sheet>
        {scene.items.map((item, i) => {
          const start = INGREDIENTS.first + i * INGREDIENTS.stagger;
          const enter = pop(f, start, fps, { damping: 14, stiffness: 150 });
          const count = prog(f, start, start + INGREDIENTS.count);
          const numSize = Math.max(TYPE.foot, Math.round(rowH * 0.5));
          return (
            <div key={i} style={{ position: 'absolute', right: 1080 - (CARD.x + CARD.w - 30), top: CARD.y + 34 + i * rowH + (rowH - numSize) / 2 - 2, width: 'max-content', opacity: Math.min(1, enter * 1.5) }}>
              <RollingNumber target={item.grams} progress={count} size={numSize} color={pal.ink} unit="g" unitScale={0.76} />
            </div>
          );
        })}
      </AbsoluteFill>
      <Sheet>
        <g transform={`translate(0 ${(1 - bowlIn) * 420})`}>
          <Paper d={tornEllipse(BOWL.x, BOWL.y, 300, 54, { seed: 91 + v * 101, amp: 2.4, step: 8 })} fill="#e9dfc8" lift={0} />
          {flights
            .filter((fl) => fl.landed)
            .map((fl, i) => (
              <g key={i} transform={`translate(${fl.x} ${fl.y}) rotate(${(i % 2 ? 1 : -1) * 12}) scale(0.4)`}>
                <Icon icon={fl.item.icon} fallback={fl.item.label} pal={pal} f={f} v={v} />
              </g>
            ))}
          <Paper d={tornPath(BOWL_FRONT, { seed: 93 + v * 101, amp: 3, step: 8 })} fill={pal.paper} lift={1.2} />
          <path d={`M ${BOWL.x - 286} ${BOWL.y + 50} C ${BOWL.x - 150} ${BOWL.y + 80}, ${BOWL.x + 150} ${BOWL.y + 80}, ${BOWL.x + 286} ${BOWL.y + 50}`} stroke={pal.navy} strokeWidth={14} fill="none" />
        </g>
        {flights
          .filter((fl) => fl.t > 0 && !fl.landed)
          .map((fl, i) => (
            <g key={i}>
              <g transform={`translate(${fl.x} ${fl.y}) rotate(${fl.t * 240}) scale(${lerp(0.32, 0.42, fl.t)})`}>
                <Icon icon={fl.item.icon} fallback={fl.item.label} pal={pal} f={f} v={v} />
              </g>
              <Note x={fl.x + 70} y={fl.y - 40} text={`${formatAmount(fl.item.grams, 'g')}g`} size={TYPE.sub} fill={pal.yellow} color={pal.ink} weight={900} seed={95 + i} padX={14} padY={6} lift={0.6} />
            </g>
          ))}
      </Sheet>
    </AbsoluteFill>
  );
};
