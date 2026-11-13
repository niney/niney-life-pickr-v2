import { Fragment } from 'react';
import type { MealStorySceneType, MealStoryType } from '@repo/api-contract';
import { AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { ChalkChapter } from './chalk';
import { CHALK, chalkDraws } from './chalk/chalkLayout';
import { ChapterBars } from './ChapterBars';
import { ChapterCover } from './ChapterCover';
import { ChapterIngredients } from './ChapterIngredients';
import { ChapterLineup } from './ChapterLineup';
import { ChapterList } from './ChapterList';
import { ChapterNutrition } from './ChapterNutrition';
import { ChapterOutro } from './ChapterOutro';
import { ChapterStat } from './ChapterStat';
import { ChapterStep } from './ChapterStep';
import { Grain } from './paper/kit';
import { PaperShadow } from './paper/shadow';
import { paperPalette } from './paper/palette';
import { TRANSITION_FRAMES, buildTimeline, isSaltSpoonScene } from './timeline';
import { FONT } from './theme';
import type { ChapterContext, MotionMine } from './types';

// 스토리 한 편 = 영상 한 편. 장면(원고 scenes)마다 장면 틀 하나를 그려 이어 붙이고, 사이는 종이 한 장이 밀려 들어오는 전환.
// 그림체는 종이 오리기(motion/paper — 찢긴 색종이·테이프·손글씨 제목·얼굴 있는 소품)가 기본이고, 원고가 look: "chalk" 를 고르면
// 칠판 메뉴판(motion/chalk). 장면 시각표(timeline.ts)는 같이 쓴다.
// 웹 재생기(@remotion/player)와 MP4 렌더 도구(tools/meal-motion)가 같은 컴포넌트를 쓴다 — 숫자는 모두 서버 응답.
// type 별칭이어야 Remotion 컴포지션 props(Record<string, unknown>)에 맞는다.
export type StoryVideoProps = {
  story: MealStoryType;
  mine: MotionMine | null;
  loggedIn: boolean;
  dark: boolean;
};

// 전환 — 새 종이가 오른쪽·아래에서 번갈아 밀려 들어온다. 칠판은 지우개가 지나가듯 왼쪽에서 닦인다(같은 칠판 위라 글만 지워진다).
const transitionAt = (i: number, chalk: boolean) => {
  const timing = linearTiming({ durationInFrames: TRANSITION_FRAMES });
  return chalk ? (
    <TransitionSeries.Transition presentation={wipe({ direction: 'from-left' })} timing={timing} />
  ) : (
    <TransitionSeries.Transition presentation={slide({ direction: i % 2 === 0 ? 'from-right' : 'from-bottom' })} timing={timing} />
  );
};

/** 장면 하나 — 원고 장면 종류에 맞는 장면 틀(장면 그림 테스트도 이것으로 그린다). */
export const Chapter = (props: { scene: MealStorySceneType; ctx: ChapterContext; saltSpoon: boolean }) => (
  <PaperShadow.Provider value={props.ctx.pal.shadow}>
    <ChapterBody {...props} />
  </PaperShadow.Provider>
);

const ChapterBody = ({ scene, ctx, saltSpoon }: { scene: MealStorySceneType; ctx: ChapterContext; saltSpoon: boolean }) => {
  // 칠판 메뉴판 그림체 — 그릴 수 있는 장면만(레시피 장면이 섞여 오면 그 장면은 종이 오리기로).
  if (ctx.story.look === 'chalk' && chalkDraws(scene)) return <ChalkChapter scene={scene} ctx={ctx} />;
  switch (scene.type) {
    case 'cover':
      return <ChapterCover scene={scene} ctx={ctx} />;
    case 'stat':
      return <ChapterStat scene={scene} ctx={ctx} saltSpoon={saltSpoon} />;
    case 'bars':
      return <ChapterBars scene={scene} ctx={ctx} />;
    case 'lineup':
      return <ChapterLineup scene={scene} ctx={ctx} />;
    case 'list':
      return <ChapterList scene={scene} ctx={ctx} />;
    case 'ingredients':
      return <ChapterIngredients scene={scene} ctx={ctx} />;
    case 'step':
      return <ChapterStep scene={scene} ctx={ctx} />;
    case 'nutrition':
      return <ChapterNutrition scene={scene} ctx={ctx} />;
    case 'outro':
      return <ChapterOutro scene={scene} ctx={ctx} />;
  }
};

export const StoryVideo = ({ story, mine, loggedIn, dark }: StoryVideoProps) => {
  const timeline = buildTimeline(story);
  const topic = story.topic?.nutrient ?? null;
  const pal = paperPalette(topic, dark);
  const chalk = story.look === 'chalk';
  const bg = chalk ? CHALK.wood : pal.bg;
  const kicker = story.scenes.find((s) => s.type === 'cover')?.kicker ?? story.title;
  return (
    // 글 기본값을 여기서 고정 — 웹 재생기는 페이지 CSS(줄 높이·낱말 끊기)를 물려받고 MP4 렌더는 브라우저 기본값이라, 정하지
    // 않으면 둘의 줄 높이가 달라 머리말 상자가 제목을 덮었다.
    <AbsoluteFill
      style={{
        backgroundColor: bg,
        color: pal.onBg,
        fontFamily: FONT,
        fontWeight: 400,
        lineHeight: 1.25,
        letterSpacing: 'normal',
        textAlign: 'left',
        wordBreak: 'keep-all',
        overflowWrap: 'anywhere',
      }}
    >
      <TransitionSeries>
        {timeline.chapters.map((ch) => (
          <Fragment key={ch.index}>
            {ch.index > 0 ? transitionAt(ch.index - 1, chalk) : null}
            <TransitionSeries.Sequence durationInFrames={ch.duration}>
              <AbsoluteFill style={{ backgroundColor: bg }}>
                <Chapter
                  scene={ch.scene}
                  ctx={{ story, pal, kicker, mine, loggedIn, id: `c${ch.index}` }}
                  saltSpoon={isSaltSpoonScene(story, ch.scene)}
                />
              </AbsoluteFill>
            </TransitionSeries.Sequence>
          </Fragment>
        ))}
      </TransitionSeries>
      {chalk ? null : <Grain />}
    </AbsoluteFill>
  );
};
