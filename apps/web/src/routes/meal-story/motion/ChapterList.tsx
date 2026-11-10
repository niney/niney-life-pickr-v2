import type { MealStorySceneType } from '@repo/api-contract';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { lerp, pop, prog, useClock } from './anim';
import { STAGE_BOTTOM, cardHeight, clamp, clipLines, fitSize, wrapText } from './layout';
import { Icon } from './paper/Icon';
import { Card, Paper, Sheet, Tape } from './paper/kit';
import { boil, tornEllipse, tornRect } from './paper/torn';
import { PaperHeading, PaperStage } from './Stage';
import { FONT, TYPE } from './theme';
import { LIST } from './timeline';
import type { ChapterContext } from './types';

type ListScene = Extract<MealStorySceneType, { type: 'list' }>;

const SLOT_TOP = 680;
const BIG_CENTER = 1400;
const NOTE_SIZE = 36;
const TEXT_X = 270;
const TEXT_W = 690;

/**
 * 목록 — 항목마다 종이 카드(소품 그림·번호 스티커·제목·설명)가 무대 아래쪽에 크게 날아와 잠시 머문 뒤, 작아지며 위쪽
 * 목록 자리로 올라가 붙는다. 소품은 살랑거린다. 자리 높이는 항목 수로 나눠 무대를 채우고(덧말 쪽지는 바닥에서부터),
 * 설명은 보조 글 하한(TYPE.sub) 아래로 줄이지 않는다 — 자리가 낮으면 한 줄만 보이고 넘치면 말줄임표.
 */
export const ChapterList = ({ scene, ctx }: { scene: ListScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal } = ctx;
  const v = boil(f);
  const end = LIST.first + scene.items.length * LIST.beat;
  const note = prog(f, end, end + 18);
  const noteLines = scene.note ? wrapText(scene.note, NOTE_SIZE, 840) : [];
  const noteTop = STAGE_BOTTOM - cardHeight(noteLines.length, NOTE_SIZE);
  const slotH = clamp(((noteLines.length ? noteTop - 30 : 1800) - SLOT_TOP) / Math.max(1, scene.items.length), 150, 270);
  const h = slotH - 22;
  const titleSize = clamp(Math.round(h * 0.25), TYPE.body, 54);
  const textSize = h >= 200 ? 36 : TYPE.sub;
  const maxLines = h >= titleSize + textSize * 2.3 + 60 ? 2 : 1;
  const iconScale = Math.min(0.56, (h - 24) / 250);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PaperHeading ctx={ctx} title={scene.title} />
      <PaperStage ctx={ctx} table={null} wall="dots" />
      <Sheet>
        {scene.items.map((item, i) => {
          const start = LIST.first + i * LIST.beat;
          const enter = pop(f, start, fps, { damping: 13, stiffness: 120 });
          if (enter <= 0) return null;
          const move = prog(f, start + LIST.beat - LIST.move, start + LIST.beat);
          const slot = SLOT_TOP + i * slotH;
          const cySlot = slot + h / 2;
          const cy = lerp(Math.max(BIG_CENTER, cySlot + 150), cySlot, move) + (1 - enter) * 520;
          const sc = lerp(1.2, 1, move);
          const rot = lerp(-2.5, i % 2 ? 1 : -1, move);
          const wiggle = Math.sin(f / 9 + i) * lerp(6, 3, move);
          const lines = item.text ? clipLines(wrapText(item.text, textSize, TEXT_W), maxLines) : [];
          const itemTitle = fitSize(item.title, titleSize, TEXT_W, TYPE.sub);
          // 설명이 없거나 한 줄이면 글 묶음을 카드 가운데로.
          const blockH = titleSize + (lines.length ? 14 + lines.length * textSize * 1.3 : 0);
          const textTop = slot + Math.max(16, (h - blockH) / 2);
          return (
            <g key={i} transform={`translate(540 ${cy}) rotate(${rot}) scale(${sc}) translate(-540 ${-cySlot})`}>
              <Paper d={tornRect(80, Math.round(slot), 920, Math.round(h), { seed: 61 + i + v * 101, amp: 2.6, step: 7 })} fill={pal.paper} lift={1.1} />
              <Tape x={110} y={slot + 4} angle={-32} pal={pal} w={88} />
              <g transform={`translate(160 ${cySlot}) rotate(${wiggle}) scale(${iconScale})`}>
                <Icon icon={item.icon} fallback={item.title} pal={pal} f={f} v={v} />
              </g>
              <g transform={`translate(96 ${slot + 30})`}>
                <Paper d={tornEllipse(0, 0, 30, 30, { seed: 65 + i + v * 101, amp: 1.6, step: 5 })} fill={pal.yellow} lift={0.5} />
                <text x={0} y={11} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={30} fill={pal.ink} data-deco="">
                  {i + 1}
                </text>
              </g>
              <text x={TEXT_X} y={textTop + titleSize * 0.86} fontFamily={FONT} fontWeight={800} fontSize={itemTitle} letterSpacing={-itemTitle * 0.03} fill={pal.ink}>
                {item.title}
              </text>
              {lines.length ? (
                <text fontFamily={FONT} fontWeight={600} fontSize={textSize} fill={pal.inkFaint}>
                  {lines.map((l, k) => (
                    <tspan key={k} x={TEXT_X} y={textTop + titleSize + 14 + textSize * (0.9 + k * 1.3)}>
                      {l}
                    </tspan>
                  ))}
                </text>
              ) : null}
            </g>
          );
        })}
        {noteLines.length ? (
          <g opacity={note} transform={`translate(0 ${(1 - note) * 30})`}>
            <Card x={540} y={noteTop} lines={noteLines} size={NOTE_SIZE} fill={pal.paper} color={pal.ink} angle={-0.8} seed={71 + v * 101} />
          </g>
        ) : null}
      </Sheet>
    </AbsoluteFill>
  );
};
