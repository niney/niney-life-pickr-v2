import type { MealStorySceneType } from '@repo/api-contract';
import { prog, useClock } from '../anim';
import { clamp, clipLines, wrapText } from '../layout';
import { HAND, TYPE } from '../theme';
import { LIST } from '../timeline';
import type { ChapterContext } from '../types';
import { CHALK, CHALK_AREA, chalkHeading, chalkNoteLayout, draw, fitHand, wobble, writeOn } from './chalkLayout';
import { ChalkBoard, ChalkHeading, ChalkNote, ChalkSvg } from './kit';

type ListScene = Extract<MealStorySceneType, { type: 'list' }>;

const { left: X, width: W } = CHALK_AREA;
const TEXT_X = 116;

/**
 * 목록(칠판) — 항목마다 노란 분필 동그라미 번호가 그려지고 제목이 써진 뒤 설명이 따라 나온다. 소품 그림은 쓰지 않는다
 * (색종이 소품은 칠판과 어울리지 않는다). 자리 높이는 항목 수로 나누고, 자리가 낮으면 설명은 한 줄만(넘치면 말줄임표).
 */
export const ChalkList = ({ scene, ctx }: { scene: ListScene; ctx: ChapterContext }) => {
  const f = useClock();
  const n = scene.items.length;
  const head = chalkHeading(scene.title);
  const note = chalkNoteLayout(scene.note, []);
  const areaTop = head.bottom + 76;
  const areaH = (note.h ? note.top - 30 : CHALK_AREA.noteBottom) - areaTop;
  const slotH = clamp(areaH / Math.max(1, n), 140, 300);
  // 항목이 적어 자리가 남으면 목록을 조금 내려 가운데 쪽에 둔다.
  const top = areaTop + clamp((areaH - n * slotH) / 2, 0, 140);
  const titleSize = clamp(Math.round(slotH * 0.3), TYPE.body, 64);
  const titleH = Math.round(titleSize * 1.2);
  const textSize = slotH >= 240 ? TYPE.body : slotH >= 200 ? 36 : TYPE.sub;
  const textLineH = Math.round(textSize * 1.36);
  const maxLines = slotH >= titleH + textLineH * 2 + 34 ? 2 : 1;
  const end = LIST.first + n * LIST.beat;
  return (
    <ChalkBoard>
      <ChalkHeading ctx={ctx} title={scene.title} />
      {scene.items.map((item, i) => {
        const s = LIST.first + i * LIST.beat;
        const mark = prog(f, s, s + 14);
        const lines = item.text ? clipLines(wrapText(item.text, textSize, W - TEXT_X), maxLines) : [];
        const blockH = titleH + lines.length * textLineH;
        const y = top + i * slotH + Math.max(0, (slotH - 24 - blockH) / 2);
        return (
          <div key={i} style={{ position: 'absolute', left: X, top: y, width: W, opacity: mark > 0 ? 1 : 0 }}>
            <svg width={88} height={88} viewBox="0 0 88 88" style={{ position: 'absolute', left: 0, top: Math.round((titleH - 88) / 2), overflow: 'visible' }}>
              <ellipse cx={44} cy={44} rx={38} ry={36} fill="none" stroke={CHALK.yellow} strokeWidth={6} transform="rotate(-8 44 44)" {...draw(mark)} />
              <text data-deco="" x={44} y={61} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={50} fill={CHALK.yellow} opacity={mark}>
                {i + 1}
              </text>
            </svg>
            <div style={{ marginLeft: TEXT_X }}>
              <div style={{ height: titleH, fontFamily: HAND, fontWeight: 700, fontSize: fitHand(item.title, titleSize, W - TEXT_X, TYPE.sub), lineHeight: `${titleH}px`, letterSpacing: '-0.04em', whiteSpace: 'nowrap', ...writeOn(prog(f, s + 6, s + 22)) }}>
                {item.title}
              </div>
              <div style={{ opacity: prog(f, s + 20, s + 34) }}>
                {lines.map((l, k) => (
                  <div key={k} style={{ fontSize: textSize, lineHeight: `${textLineH}px`, fontWeight: 600, color: CHALK.faint, whiteSpace: 'nowrap' }}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <ChalkSvg>
        {scene.items.slice(1).map((_, i) => {
          const y = top + (i + 1) * slotH - 14;
          const s = LIST.first + (i + 1) * LIST.beat;
          return <path key={i} d={wobble(X, y, X + W, y - 2, 71 + i)} stroke={CHALK.dim} strokeWidth={3} fill="none" strokeLinecap="round" {...draw(prog(f, s - 8, s + 6))} />;
        })}
      </ChalkSvg>
      <ChalkNote layout={note} p={prog(f, end, end + 18)} />
    </ChalkBoard>
  );
};
