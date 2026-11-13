import type { MealStorySceneType } from '@repo/api-contract';
import { prog, useClock } from '../anim';
import { wrapText } from '../layout';
import { HAND } from '../theme';
import { OUTRO } from '../timeline';
import type { ChapterContext } from '../types';
import { CHALK, chalkTitle, draw, writeOn } from './chalkLayout';
import { ChalkBoard, ChalkBowl, ChalkStar, ChalkSvg } from './kit';

type OutroScene = Extract<MealStorySceneType, { type: 'outro' }>;

// 그릇(절반 크기)이 끝나는 자리 — 그 아래는 웹이 진짜 단추(기록·레시피·통계·공유)를 얹는 곳이라 비워 둔다.
const ART_BOTTOM = 1234;
const BOWL_H = 254;

/** 마무리(칠판) — 큰 손글씨 제목과 노란 물결 밑줄, 글, 그 아래 김 나는 그릇. 아래쪽은 단추 자리로 비운다. */
export const ChalkOutro = ({ scene }: { scene: OutroScene; ctx: ChapterContext }) => {
  const f = useClock();
  const t = chalkTitle(scene.title, 900);
  const top = 300;
  const bottom = top + t.lines.length * t.lineH;
  const textLines = scene.text ? wrapText(scene.text, 42, 820) : [];
  const textBottom = bottom + 70 + textLines.length * 58;
  const bowlTop = textBottom + 40;
  const art = prog(f, OUTRO.ring, OUTRO.ring + 40);
  const wave = Array.from({ length: 9 }, (_, i) => `${i === 0 ? 'M' : 'L'} ${300 + i * 60} ${bottom + 26 + (i % 2 ? -9 : 9)}`).join(' ');
  return (
    <ChalkBoard>
      <ChalkSvg>
        <ChalkStar x={170} y={210} color={CHALK.yellow} p={prog(f, 20, 30)} />
        <ChalkStar x={910} y={240} color={CHALK.pink} p={prog(f, 24, 34)} />
        <path d={wave} stroke={CHALK.yellow} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" {...draw(prog(f, OUTRO.title + 22, OUTRO.title + 40))} />
        {/* 글이 길어 그릇 자리가 모자라면 그리지 않는다(단추 자리를 침범하지 않게). */}
        {bowlTop + BOWL_H <= ART_BOTTOM ? (
          <g transform={`translate(540 ${bowlTop}) scale(0.5) translate(-540 -1196)`}>
            <ChalkBowl f={f} p={art} />
          </g>
        ) : null}
      </ChalkSvg>
      <div style={{ position: 'absolute', left: 60, top, width: 960, textAlign: 'center', fontFamily: HAND, fontWeight: 700, fontSize: t.size, lineHeight: `${t.lineH}px`, letterSpacing: '-0.05em' }}>
        {t.lines.map((l, i) => (
          <div key={i} style={{ ...writeOn(prog(f, OUTRO.title + i * 10, OUTRO.title + 16 + i * 10)), whiteSpace: 'nowrap' }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 130, top: bottom + 70, width: 820, textAlign: 'center', fontSize: 42, lineHeight: '58px', fontWeight: 600, color: CHALK.faint, opacity: prog(f, OUTRO.text[0], OUTRO.text[1]) }}>
        {textLines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </ChalkBoard>
  );
};
