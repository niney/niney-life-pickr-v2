import type { MealStorySceneType } from '@repo/api-contract';
import { AbsoluteFill, Img, useVideoConfig } from 'remotion';
import { pop, prog, useClock } from './anim';
import { KineticTitle } from './KineticTitle';
import { titleHeight, wrapText } from './layout';
import { Icon } from './paper/Icon';
import { Card, Paper, Sheet, Tape } from './paper/kit';
import { boil, tornEllipse, tornRect } from './paper/torn';
import { PaperHeading, PaperStage } from './Stage';
import { FONT } from './theme';
import { STEP, stepTiming } from './timeline';
import type { ChapterContext } from './types';

type StepScene = Extract<MealStorySceneType, { type: 'step' }>;

const TEXT = { size: 50, width: 840, top: 1130 };

/**
 * 만드는 법 한 단계 — 식탁 위 소품(냄비·팬·접시…)이 김을 내며 살아 있고, 번호 스티커가 붙고, 레시피 쪽지에 단계 글이
 * 낱말마다 솟는다. 사진이 있으면 벽에 폴라로이드. 글을 거의 다 읽을 때쯤 노란 팁 쪽지가 붙는다.
 */
export const ChapterStep = ({ scene, ctx }: { scene: StepScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal } = ctx;
  const v = boil(f);
  const { tipAt } = stepTiming(scene);
  const prop = pop(f, 4, fps, { damping: 12, stiffness: 110 });
  const num = pop(f, 10, fps, { damping: 10, stiffness: 150 });
  const card = pop(f, 14, fps, { damping: 14, stiffness: 130 });
  const tip = tipAt === null ? 0 : pop(f, tipAt, fps, { damping: 10, stiffness: 170 });
  const textH = titleHeight(scene.text, TEXT.size, TEXT.width);
  const cardH = Math.round(textH + 74);
  const tipLines = scene.tip ? wrapText(scene.tip, 36, 700) : [];
  const tipY = Math.max(TEXT.top + cardH + 44, 1540);
  const bob = Math.sin(f / 14) * 6;
  const bare = !scene.image && !scene.icon;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PaperHeading ctx={ctx} title={`만드는 법 ${scene.number} / ${scene.total}`} />
      <PaperStage ctx={ctx} table={1040} />
      {scene.image ? (
        <AbsoluteFill style={{ opacity: Math.min(1, prop * 1.5), transform: `translateY(${(1 - prop) * -80}px) rotate(${-2.5 + (1 - prop) * -5}deg)` }}>
          <Sheet>
            <Paper d={tornRect(200, 640, 680, 470, { seed: 9 + v * 101, amp: 2.4, step: 8 })} fill={pal.paper} lift={1.4} />
            <Tape x={540} y={646} angle={-3} pal={pal} w={140} />
          </Sheet>
          <div style={{ position: 'absolute', left: 226, top: 666, width: 628, height: 390, overflow: 'hidden' }}>
            <Img src={scene.image} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.1 - 0.1 * prog(f, 0, 240)})` }} />
          </div>
        </AbsoluteFill>
      ) : scene.icon ? (
        <Sheet>
          <g transform={`translate(580 ${880 + bob + (1 - prop) * 600}) scale(${1.45 * (0.6 + 0.4 * prop)})`}>
            <Icon icon={scene.icon} fallback={String(scene.number)} pal={pal} f={f} v={v} />
          </g>
        </Sheet>
      ) : null}
      <Sheet>
        {/* 사진도 소품도 없는 단계는 번호 스티커가 주인공 — 가운데 크게 */}
        <g transform={bare ? `translate(540 ${840 + bob}) rotate(${(1 - num) * -40 - 6}) scale(${num * 1.9})` : `translate(168 728) rotate(${(1 - num) * -40 - 6}) scale(${num})`}>
          <Paper d={tornEllipse(0, 0, 76, 76, { seed: 15 + v * 101, amp: 2.6, step: 6 })} fill={pal.yellow} lift={1.2} />
          <text x={0} y={32} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={92} fill={pal.ink} data-deco="">
            {scene.number}
          </text>
        </g>
      </Sheet>
      <AbsoluteFill style={{ transform: `translateY(${(1 - card) * 400}px)`, opacity: Math.min(1, card * 2) }}>
        <Sheet>
          <g transform={`rotate(-0.8 540 ${TEXT.top + cardH / 2})`}>
            <Paper d={tornRect(80, TEXT.top, 920, cardH, { seed: 19 + v * 101, amp: 2.8, step: 8 })} fill={pal.paper} lift={1.2} />
          </g>
          <Tape x={120} y={TEXT.top + 4} angle={-30} pal={pal} />
        </Sheet>
        <KineticTitle
          text={scene.text}
          start={STEP.text}
          size={TEXT.size}
          color={pal.ink}
          weight={700}
          tracking="-0.03em"
          stagger={STEP.stagger}
          style={{ position: 'absolute', left: 120, top: TEXT.top + 34, width: TEXT.width, transform: 'rotate(-0.8deg)', transformOrigin: '420px 0' }}
        />
      </AbsoluteFill>
      {tipLines.length ? (
        <Sheet>
          <g transform={`translate(110 ${tipY}) scale(${tip}) translate(-110 ${-tipY})`} opacity={Math.min(1, tip * 2)}>
            <Card x={110} y={tipY} lines={tipLines.map((l, i) => (i === 0 ? `팁 · ${l}` : l))} size={36} fill={pal.yellow} color={pal.ink} anchor="start" angle={-2} seed={23 + v * 101} lift={1.2} />
            <Tape x={150} y={tipY + 2} angle={-34} pal={pal} w={90} />
          </g>
        </Sheet>
      ) : null}
    </AbsoluteFill>
  );
};
