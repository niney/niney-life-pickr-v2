import { AbsoluteFill } from 'remotion';
import { CHALK, wobble } from '../../../apps/web/src/routes/meal-story/motion/chalk/chalkLayout';
import { ChalkArt, ChalkGrain, ChalkStar, ChalkTag } from '../../../apps/web/src/routes/meal-story/motion/chalk/kit';
import { titleLines } from '../../../apps/web/src/routes/meal-story/motion/layout';
import { Icon } from '../../../apps/web/src/routes/meal-story/motion/paper/Icon';
import { Grain, Note, Paper, Patterns } from '../../../apps/web/src/routes/meal-story/motion/paper/kit';
import { paperPalette } from '../../../apps/web/src/routes/meal-story/motion/paper/palette';
import { tornRect } from '../../../apps/web/src/routes/meal-story/motion/paper/torn';
import { coverIcons } from '../../../apps/web/src/routes/meal-story/motion/storyProps';
import type { StoryVideoProps } from '../../../apps/web/src/routes/meal-story/motion/StoryVideo';
import { FONT, HAND } from '../../../apps/web/src/routes/meal-story/motion/theme';

// 그림 표지 — 영상의 표지를 가로 한 장(1200×630, 공유 미리보기 비율)으로 그린다. 사진 표지가 없는 편의 목록 카드와 공유
// 미리보기에 쓴다(원고 poster). 움직임 없이 끝 상태만. 만드는 법: npm run poster -- out/<slug>.json
// 목록 카드는 4:3 으로 가운데를 잘라 보이니 글과 그림은 가운데 840 폭(x 180~1020) 안에 둔다 — 바깥은 테두리·바탕만.
// 그림을 바꾸면 서버 meal-story.defs 의 POSTER_VERSION 을 올린다(모든 편의 그림 표지를 다시 만들게 된다).
export const POSTER = { w: 1200, h: 630 } as const;

/** 제목이 세 줄 안에 드는 가장 큰 글씨. */
const fitTitle = (title: string, width: number, sizes: readonly number[]) => {
  for (const size of sizes) {
    const lines = titleLines(title, size, width);
    if (lines.length <= 3) return { size, lines: lines.map((l) => l.join(' ')) };
  }
  const size = sizes[sizes.length - 1]!;
  return { size, lines: titleLines(title, size, width).map((l) => l.join(' ')) };
};

const ChalkPoster = ({ kicker, title, topic }: { kicker: string; title: string; topic: string | null }) => {
  const t = fitTitle(title, 500, [80, 72, 64, 56]);
  const lineH = Math.round(t.size * 1.12);
  const top = 190;
  const bottom = top + t.lines.length * lineH;
  const wave = Array.from({ length: 7 }, (_, i) => `${i === 0 ? 'M' : 'L'} ${232 + i * 50} ${bottom + 22 + (i % 2 ? -8 : 8)}`).join(' ');
  return (
    <AbsoluteFill style={{ backgroundColor: CHALK.wood, fontFamily: FONT, color: CHALK.white, overflow: 'hidden' }}>
      <svg width={POSTER.w} height={POSTER.h} viewBox={`0 0 ${POSTER.w} ${POSTER.h}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="poster-dust">
            <stop offset="0" stopColor="#ffffff" stopOpacity={0.085} />
            <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect x={7} y={7} width={POSTER.w - 14} height={POSTER.h - 14} fill="none" stroke={CHALK.woodDeep} strokeWidth={2} opacity={0.5} />
        <rect x={16} y={16} width={POSTER.w - 32} height={POSTER.h - 32} rx={8} fill={CHALK.woodDeep} />
        <rect x={24} y={24} width={POSTER.w - 48} height={POSTER.h - 48} rx={6} fill={CHALK.board} />
        <path d="M 120 380 L 1080 320" stroke="#ffffff" strokeOpacity={0.022} strokeWidth={130} strokeLinecap="round" />
        <ellipse cx={360} cy={220} rx={420} ry={200} fill="url(#poster-dust)" />
        <ellipse cx={880} cy={430} rx={380} ry={220} fill="url(#poster-dust)" />
        {/* 안쪽 테두리 */}
        {[wobble(58, 58, 1142, 56, 11), wobble(1142, 56, 1144, 548, 13), wobble(1144, 548, 56, 550, 15), wobble(56, 550, 58, 58, 17)].map((d, i) => (
          <path key={i} d={d} stroke={CHALK.dim} strokeWidth={4} fill="none" strokeLinecap="round" />
        ))}
        <ChalkStar x={716} y={112} color={CHALK.pink} p={1} />
        <ChalkStar x={980} y={150} color={CHALK.yellow} p={1} />
        <path d={wave} stroke={CHALK.yellow} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* 김 나는 그릇(당류 편은 컵) — 영상 표지의 그림을 줄여서 */}
        <g transform="translate(850 384) scale(0.46) translate(-540 -1440)">
          <ChalkArt f={30} p={1} topic={topic} salt />
        </g>
      </svg>
      <ChalkTag text={kicker} x={224} y={90} p={1} />
      <div style={{ position: 'absolute', left: 228, top, width: 560, fontFamily: HAND, fontWeight: 700, fontSize: t.size, lineHeight: `${lineH}px`, letterSpacing: '-0.05em' }}>
        {t.lines.map((l, i) => (
          <div key={i} style={{ whiteSpace: 'nowrap' }}>
            {l}
          </div>
        ))}
      </div>
      <ChalkGrain style={{ left: 24, top: 24, width: POSTER.w - 48, height: POSTER.h - 48 }} />
      {/* 분필 받침 */}
      <svg width={POSTER.w} height={POSTER.h} viewBox={`0 0 ${POSTER.w} ${POSTER.h}`} style={{ position: 'absolute', inset: 0 }}>
        <rect x={24} y={572} width={POSTER.w - 48} height={20} fill={CHALK.wood} />
        <rect x={24} y={592} width={POSTER.w - 48} height={8} fill={CHALK.woodDeep} />
        <rect x={210} y={560} width={64} height={12} rx={4} fill={CHALK.white} />
        <rect x={284} y={560} width={48} height={12} rx={4} fill={CHALK.yellow} transform="rotate(-4 308 566)" />
        <rect x={342} y={560} width={38} height={12} rx={4} fill={CHALK.pink} />
        <rect x={870} y={542} width={104} height={15} rx={4} fill={CHALK.woodDeep} />
        <rect x={870} y={556} width={104} height={16} rx={3} fill="#3a3f47" />
      </svg>
    </AbsoluteFill>
  );
};

const PaperPoster = ({ story, kicker, title }: { story: StoryVideoProps['story']; kicker: string; title: string }) => {
  const pal = paperPalette(story.topic?.nutrient ?? null, false);
  const t = fitTitle(title, 470, [76, 66, 58, 50]);
  const lineH = Math.round(t.size * 1.1);
  const cardTop = 128;
  const cardH = 76 + t.lines.length * lineH + 36;
  const icons = coverIcons(story);
  // 식탁 위 소품 — 표지 식탁과 같은 차례(왼쪽·가운데·오른쪽).
  const spots = [
    { x: 772, y: 500, s: 0.54 },
    { x: 880, y: 532, s: 0.62 },
    { x: 972, y: 498, s: 0.46 },
  ] as const;
  return (
    <AbsoluteFill style={{ backgroundColor: pal.stage, fontFamily: FONT, color: pal.ink, overflow: 'hidden' }}>
      <svg width={POSTER.w} height={POSTER.h} viewBox={`0 0 ${POSTER.w} ${POSTER.h}`} style={{ position: 'absolute', inset: 0 }}>
        <Patterns idp="poster" pal={pal} />
        <rect width={POSTER.w} height={POSTER.h} fill="url(#poster-stripes)" />
        <Paper d={tornRect(-12, 452, POSTER.w + 24, 200, { seed: 13, amp: 3.5, step: 9 })} fill="url(#poster-gingham)" lift={1} />
        <g transform={`rotate(-1.5 440 ${cardTop + cardH / 2})`}>
          <Paper d={tornRect(190, cardTop, 520, cardH, { seed: 17, amp: 3.4, step: 8 })} fill={pal.paper} lift={1.6} />
        </g>
        <Note x={206} y={cardTop - 44} text={kicker} size={38} fill={pal.stage} color="#ffffff" font={HAND} weight={700} angle={-4} seed={27} anchor="start" tracking={-0.06} lift={1.2} />
        {icons.map((icon, i) =>
          icon ? (
            <g key={i} transform={`translate(${spots[i]!.x} ${spots[i]!.y}) scale(${spots[i]!.s})`}>
              <Icon icon={icon} fallback="" pal={pal} f={30} v={0} />
            </g>
          ) : null,
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 226,
          top: cardTop + 48,
          width: 480,
          fontFamily: HAND,
          fontWeight: 700,
          fontSize: t.size,
          lineHeight: `${lineH}px`,
          letterSpacing: '-0.07em',
          transform: 'rotate(-1.5deg)',
          transformOrigin: '220px 0',
        }}
      >
        {t.lines.map((l, i) => (
          <div key={i} style={{ whiteSpace: 'nowrap' }}>
            {l}
          </div>
        ))}
      </div>
      <Grain />
    </AbsoluteFill>
  );
};

/** 그림 표지 한 장 — 그 편의 그림체로. 입력은 영상과 같은 JSON(export:meal-story). */
export const Poster = ({ story }: StoryVideoProps) => {
  const cover = story.scenes.find((s) => s.type === 'cover');
  const kicker = cover?.type === 'cover' ? cover.kicker : story.title;
  const title = cover?.type === 'cover' ? cover.title : story.title;
  return story.look === 'chalk' ? (
    <ChalkPoster kicker={kicker} title={title} topic={story.topic?.nutrient ?? null} />
  ) : (
    <PaperPoster story={story} kicker={kicker} title={title} />
  );
};
