import { continueRender, delayRender, getInputProps, registerRoot } from 'remotion';
import { FONT_LOADS, FONT_STYLESHEETS, motionFontText } from '../../../apps/web/src/routes/meal-story/motion/fonts';
import { variantMine, variantStory } from '../../../apps/web/src/routes/meal-story/motion/storyFixture';
import { Root } from './Root';

// 렌더·스튜디오 전용 — 웹 화면은 글꼴을 따로 받으므로(mealStoryFont.ts) 이 파일을 쓰지 않는다. 글꼴 주소·받을 글자는
// 웹과 같은 것(motion/fonts.ts)을 쓴다: 원티드 산스(숫자·작은 글)와 개구(손글씨 제목, OFL) 분할판 CSS 를 붙이고, 영상에
// 나올 글자(스토리 원고 + 장면 틀의 고정 문구 + 변형 점검 원고)를 미리 받아 둔 뒤 그린다 — 분할판은 글자가 처음 보일 때
// 조각을 받아서, 미리 받지 않으면 장면마다 첫 몇 프레임이 다른 글꼴로 찍힌다.
const SHEETS = Object.values(FONT_STYLESHEETS);

if (typeof document !== 'undefined' && !document.getElementById('meal-motion-font-0')) {
  const handle = delayRender('글꼴');
  const text = motionFontText([getInputProps(), variantStory, variantMine]);
  let pending = SHEETS.length;
  const done = () => {
    pending -= 1;
    if (pending > 0) return;
    Promise.all(FONT_LOADS.map((font) => document.fonts.load(font, text)))
      .catch(() => undefined)
      .finally(() => continueRender(handle));
  };
  SHEETS.forEach((href, i) => {
    const link = document.createElement('link');
    link.id = `meal-motion-font-${i}`;
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = done;
    link.onerror = done;
    document.head.appendChild(link);
  });
}

registerRoot(Root);
