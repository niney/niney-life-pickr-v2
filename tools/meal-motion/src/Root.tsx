import { Composition } from 'remotion';
import { StoryVideo, type StoryVideoProps } from '../../../apps/web/src/routes/meal-story/motion/StoryVideo';
import { variantMine, variantStory } from '../../../apps/web/src/routes/meal-story/motion/storyFixture';
import { FPS, H, W } from '../../../apps/web/src/routes/meal-story/motion/theme';
import { buildTimeline } from '../../../apps/web/src/routes/meal-story/motion/timeline';
import { PropsSheet } from './PropsSheet';

// 영상 한 편 = 스토리 한 편. 입력은 --props 로 받는 JSON(pnpm --filter friendly export:meal-story 가 쓴다 — 서버가 계산한
// 숫자 그대로). 길이는 원고 장면으로 정한다(웹 재생기와 같은 시간표).
const placeholder: StoryVideoProps = {
  story: {
    slug: 'placeholder',
    status: 'draft',
    title: '건강식단 스토리',
    summary: '',
    topic: { nutrient: 'sodium', direction: 'reduce' },
    publishedAt: null,
    reviewedAt: null,
    coverUrl: null,
    scenes: [
      { type: 'cover', kicker: '건강식단', title: '--props 로 스토리 JSON 을 주세요', subtitle: 'pnpm --filter friendly export:meal-story', image: null },
      { type: 'outro', title: '끝', text: null, actions: [] },
    ],
    recipe: null,
    sources: [],
  },
  mine: null,
  loggedIn: false,
  dark: false,
};

export const Root = () => (
  <>
    <Composition
      id="MealStory"
      component={StoryVideo}
      width={W}
      height={H}
      fps={FPS}
      durationInFrames={buildTimeline(placeholder.story).total}
      defaultProps={placeholder}
      calculateMetadata={({ props }) => ({ durationInFrames: buildTimeline(props.story).total })}
    />
    {/* 변형 점검 — 첫 편에 없는 모양(사진·값 없음·소품 없음·한도까지 찬 줄 수)을 모은 가짜 원고. 장면 틀을 고치면 이것도 본다.
        npx remotion render src/index.ts Variants out/frames-variants --sequence --every-nth-frame=6 --image-format=jpeg --scale=0.5 */}
    <Composition
      id="Variants"
      component={StoryVideo}
      width={W}
      height={H}
      fps={FPS}
      durationInFrames={buildTimeline(variantStory).total}
      defaultProps={{ story: variantStory, mine: variantMine, loggedIn: true, dark: false }}
    />
    {/* 소품 점검(한 장) */}
    <Composition id="Props" component={PropsSheet} width={W} height={H} fps={FPS} durationInFrames={1} />
  </>
);
