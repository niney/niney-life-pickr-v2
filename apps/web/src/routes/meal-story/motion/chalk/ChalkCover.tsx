import type { MealStorySceneType } from '@repo/api-contract';
import { Img } from 'remotion';
import { prog, useClock } from '../anim';
import { clamp, wrapText } from '../layout';
import { HAND } from '../theme';
import { COVER } from '../timeline';
import type { ChapterContext } from '../types';
import { CHALK, chalkTitle, draw, wobble, writeOn } from './chalkLayout';
import { ChalkBoard, ChalkBowl, ChalkStar, ChalkSvg, ChalkTag } from './kit';

type CoverScene = Extract<MealStorySceneType, { type: 'cover' }>;

/**
 * 표지(칠판) — 분필로 두른 테두리 안에 머리말 쪽지, 줄마다 써지는 큰 손글씨 제목, 노란 물결 밑줄, 부제. 아래에는 김 나는
 * 그릇과 소금통(선 그림). 사진이 있으면 그릇 대신 사진을 종이에 붙여 칠판에 테이프로 붙인다.
 */
export const ChalkCover = ({ scene }: { scene: CoverScene; ctx: ChapterContext }) => {
  const f = useClock();
  const t = chalkTitle(scene.title, 940);
  const top = scene.image ? 300 : 480;
  const bottom = top + t.lines.length * t.lineH;
  const subLines = scene.subtitle ? wrapText(scene.subtitle, 42, 800) : [];
  const subBottom = bottom + 74 + subLines.length * 58;
  const art = prog(f, COVER.sub[0], COVER.sub[1] + 26);
  const photoTop = subBottom + 56;
  const photoH = clamp(1700 - photoTop, 320, 620);
  const wave = Array.from({ length: 9 }, (_, i) => `${i === 0 ? 'M' : 'L'} ${300 + i * 60} ${bottom + 26 + (i % 2 ? -9 : 9)}`).join(' ');
  return (
    <ChalkBoard>
      <ChalkSvg>
        {[wobble(96, 100, 984, 96, 11), wobble(984, 96, 988, 1724, 13), wobble(988, 1724, 92, 1728, 15), wobble(92, 1728, 96, 100, 17)].map((d, i) => (
          <path key={i} d={d} stroke={CHALK.dim} strokeWidth={4} fill="none" strokeLinecap="round" {...draw(prog(f, i * 5, 14 + i * 5))} />
        ))}
        <ChalkStar x={190} y={top - 180} color={CHALK.yellow} p={prog(f, 30, 40)} />
        <ChalkStar x={900} y={top - 140} color={CHALK.pink} p={prog(f, 34, 44)} />
        <ChalkStar x={150} y={1180} color={CHALK.pink} p={prog(f, 38, 48)} />
        <ChalkStar x={930} y={1150} color={CHALK.yellow} p={prog(f, 42, 52)} />
        <path d={wave} stroke={CHALK.yellow} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" {...draw(prog(f, COVER.title + 26, COVER.title + 44))} />
        {scene.image ? null : (
          <g transform={`translate(0 ${Math.max(0, subBottom + 50 - 1196)})`}>
            <ChalkBowl f={f} p={art} salt />
          </g>
        )}
      </ChalkSvg>
      {scene.image ? (
        <div
          style={{
            position: 'absolute',
            left: 190,
            top: photoTop,
            width: 700,
            height: photoH,
            padding: '24px 24px 60px',
            boxSizing: 'border-box',
            backgroundColor: '#f3ead6',
            transform: `translateY(${(1 - art) * 60}px) rotate(2deg)`,
            opacity: art,
          }}
        >
          <Img src={scene.image} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', left: -30, top: -16, width: 120, height: 36, backgroundColor: 'rgba(245,215,106,0.72)', transform: 'rotate(-32deg)' }} />
          <div style={{ position: 'absolute', right: -30, top: -16, width: 120, height: 36, backgroundColor: 'rgba(245,215,106,0.72)', transform: 'rotate(30deg)' }} />
        </div>
      ) : null}
      <ChalkTag text={scene.kicker} x={540} y={top - 132} center p={prog(f, COVER.kicker, COVER.kicker + 10)} />
      <div style={{ position: 'absolute', left: 60, top, width: 960, textAlign: 'center', fontFamily: HAND, fontWeight: 700, fontSize: t.size, lineHeight: `${t.lineH}px`, letterSpacing: '-0.05em' }}>
        {t.lines.map((l, i) => (
          <div key={i} style={{ ...writeOn(prog(f, COVER.title + i * 10, COVER.title + 16 + i * 10)), whiteSpace: 'nowrap' }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 120, top: bottom + 74, width: 840, textAlign: 'center', fontSize: 42, lineHeight: '58px', fontWeight: 600, color: CHALK.faint, opacity: prog(f, COVER.sub[0], COVER.sub[1]) }}>
        {subLines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </ChalkBoard>
  );
};
