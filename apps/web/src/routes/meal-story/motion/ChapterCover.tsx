import type { MealStorySceneType } from '@repo/api-contract';
import { AbsoluteFill, Img, useVideoConfig } from 'remotion';
import { pop, prog, useClock } from './anim';
import { KineticTitle } from './KineticTitle';
import { titleHeight, wrapText } from './layout';
import { PaperGrains } from './paper/grains';
import { Note, Paper, Sheet, Tape } from './paper/kit';
import { Icon } from './paper/Icon';
import { PaperShaker } from './paper/props';
import { boil, tornRect } from './paper/torn';
import { shakerPose, type Span } from './saltPose';
import { PaperStage } from './Stage';
import { coverIcons } from './storyProps';
import { FONT, HAND } from './theme';
import { COVER } from './timeline';
import type { ChapterContext } from './types';

type CoverScene = Extract<MealStorySceneType, { type: 'cover' }>;

// 소금통 — 다 쏟고 빠지는 끝(pour 끝 + 28)이 COVER.end.
const SHAKER = { drop: 16, tilt: [28, 40] as Span, pour: [40, 108] as Span };
const SHAKER_AT = { x: 840, y: 470, s: 0.9 };
const CARD = { x: 60, w: 960, title: 118, sub: 42 };

/**
 * 식탁 위 소품 셋 — 그 편의 레시피에서 고른다: 가운데는 완성 그릇(마지막 만드는 법 단계의 소품), 왼쪽·오른쪽은 재료의
 * 둘째·첫째 소품(같은 그림은 한 번만). 첫 편은 토마토·파스타 접시·면, 식이섬유 편은 버섯·비빔밥·밥공기. 레시피가 없는 편은
 * 줄 세우기·목록에 나온 소품(storyProps 의 coverIcons). 소품이 없으면 비운다.
 */
const TABLE = [
  { x: 200, y: 1620, s: 0.9 },
  { x: 560, y: 1700, s: 1 },
  { x: 900, y: 1630, s: 0.82 },
] as const;
/**
 * 표지 — 화면 가득 색종이 부엌(줄무늬 벽·깅엄 식탁, 식탁 위에는 그 편 레시피의 재료와 완성 그릇). 가운데 제목 카드가 떨어져 붙고(테이프),
 * 머리말 쪽지가 붙고, 손글씨 제목이 낱말마다 솟는다. 나트륨 이야기면 소금통이 떨어져 카드 위로 소금을 뿌린다.
 * 사진이 있으면 벽에 폴라로이드로 붙는다.
 */
export const ChapterCover = ({ scene, ctx }: { scene: CoverScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal } = ctx;
  const v = boil(f);
  const card = pop(f, COVER.title - 6, fps, { damping: 13, stiffness: 120 });
  const kicker = pop(f, COVER.kicker + 8, fps, { damping: 14, stiffness: 150 });
  const sub = prog(f, COVER.sub[0], COVER.sub[1]);
  const salty = ctx.story.topic?.nutrient === 'sodium' && !scene.image;
  const titleH = titleHeight(scene.title, CARD.title, 860);
  const subLines = scene.subtitle ? wrapText(scene.subtitle, CARD.sub, 840) : [];
  const cardH = Math.round(64 + titleH + (subLines.length ? 34 + subLines.length * CARD.sub * 1.35 : 0) + 56);
  const cardY = scene.image ? 1010 : 860;
  const pose = shakerPose(f, fps, SHAKER_AT, SHAKER);
  const photo = prog(f, 4, 26);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PaperStage ctx={ctx} table={1440} decor={scene.image ? [] : ['clock']} area={{ x: -30, y: -30, w: 1140, h: 1980 }}>
        {coverIcons(ctx.story).map((icon, i) =>
          icon ? (
            <g key={i} transform={`translate(${TABLE[i]!.x} ${TABLE[i]!.y}) scale(${TABLE[i]!.s})`}>
              <Icon icon={icon} fallback="" pal={pal} f={f} v={v} />
            </g>
          ) : null,
        )}
      </PaperStage>
      {scene.image ? (
        <AbsoluteFill style={{ opacity: photo, transform: `translateY(${(1 - photo) * -60}px) rotate(${-3 + (1 - photo) * -4}deg)` }}>
          <Sheet>
            <Paper d={tornRect(170, 150, 740, 760, { seed: 7 + v * 101, amp: 2.4, step: 8 })} fill={pal.paper} lift={1.4} />
            <Tape x={540} y={156} angle={-4} pal={pal} w={150} />
          </Sheet>
          <div style={{ position: 'absolute', left: 200, top: 180, width: 680, height: 620, overflow: 'hidden' }}>
            <Img src={scene.image} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.1 - 0.1 * prog(f, 0, 150)})` }} />
          </div>
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill style={{ transform: `translateY(${(1 - card) * -500}px) rotate(${(1 - card) * -6}deg)`, opacity: Math.min(1, card * 2) }}>
        <Sheet>
          <g transform={`rotate(-1.5 540 ${cardY + cardH / 2})`}>
            <Paper d={tornRect(CARD.x, cardY, CARD.w, cardH, { seed: 17 + v * 101, amp: 3.4, step: 8 })} fill={pal.paper} lift={1.6} />
          </g>
          <Tape x={120} y={cardY + 6} angle={-28} pal={pal} />
          <Tape x={960} y={cardY - 2} angle={22} pal={pal} />
          {subLines.length ? (
            <g opacity={sub}>
              <text fontFamily={FONT} fontWeight={600} fontSize={CARD.sub} fill={pal.inkFaint} transform={`rotate(-1.5 540 ${cardY + cardH / 2})`}>
                {subLines.map((l, i) => (
                  <tspan key={i} x={110} y={cardY + 64 + titleH + 34 + CARD.sub * (0.95 + i * 1.35)}>
                    {l}
                  </tspan>
                ))}
              </text>
            </g>
          ) : null}
        </Sheet>
        <KineticTitle
          text={scene.title}
          start={COVER.title}
          size={CARD.title}
          color={pal.ink}
          font={HAND}
          weight={700}
          tracking="-0.07em"
          stagger={4}
          style={{ position: 'absolute', left: 110, top: cardY + 56, width: 860, transform: 'rotate(-1.5deg)', transformOrigin: '430px 0' }}
        />
      </AbsoluteFill>
      <Sheet>
        <g transform={`translate(${(1 - kicker) * -400} 0)`}>
          <Note x={90} y={cardY - 56} text={scene.kicker} size={46} fill={pal.stage} color="#ffffff" font={HAND} weight={700} angle={-4} seed={27 + v * 101} anchor="start" tracking={-0.06} lift={1.2} />
        </g>
        {salty ? (
          <>
            <PaperGrains f={f} fps={fps} at={SHAKER_AT} timing={SHAKER} land={(i) => cardY + 14 + (i % 7) * 26} count={46} seed={7} pal={pal} />
            <g transform={`translate(${pose.cx} ${pose.cy}) rotate(${pose.angle}) scale(${SHAKER_AT.s})`}>
              <PaperShaker pal={pal} f={f} v={v} />
            </g>
          </>
        ) : null}
      </Sheet>
    </AbsoluteFill>
  );
};
