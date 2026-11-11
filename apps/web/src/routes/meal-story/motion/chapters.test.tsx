import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MealStoryIconType, MealStorySceneType, MealStoryType } from '@repo/api-contract';
import { FONT_STYLESHEETS } from './fonts';
import { BARS, STAGE_BOTTOM, barsLayout, cardHeight, clipLines, fitSize, headingBottom, headingSize, ownStandardText, textWidth } from './layout';
import { Icon } from './paper/Icon';
import { PROP_FOR } from './paper/icons';
import { paperPalette } from './paper/palette';
import { Chapter } from './StoryVideo';
import { variantMine, variantMineChanged, variantMineFiber, variantMineSenior, variantStory } from './storyFixture';
import { dishIcon, ingredientIcons } from './storyProps';
import { TYPE } from './theme';
import { buildTimeline, chapterFrames, isSaltSpoonScene } from './timeline';
import type { MotionMine } from './types';
import { WANTED_SANS_CSS } from '../../meal/mealFont';

// 장면 그림 — 재생기 없이 장면 틀을 프레임마다 그려 본다(Remotion 의 프레임·영상 설정만 가짜로). 웹 테스트의 가짜 재생기는
// 장면을 그리지 않으므로, 여기서 변형 원고(storyFixture — 사진·값 없음·소품 없음·한도까지 찬 줄 수)를 모두 그려
// 예외·잘못된 숫자(NaN)·너무 작은 글씨가 없는지 본다. 눈으로 보는 검수는 MP4 도구의 Variants 컴포지션.

const clock = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async (original) => {
  const actual = await original<Record<string, unknown>>();
  const React = await import('react');
  return {
    ...actual,
    useCurrentFrame: () => clock.frame,
    useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920, durationInFrames: 3000, id: 'test' }),
    Img: (props: Record<string, unknown>) => React.createElement('img', props),
  };
});

interface Viewer {
  name: string;
  mine: MotionMine | null;
  loggedIn: boolean;
  dark?: boolean;
}

const VIEWERS: Viewer[] = [
  { name: '로그인 전', mine: null, loggedIn: false },
  { name: '내 값 받는 중', mine: null, loggedIn: true },
  { name: '내 값 있음', mine: variantMine, loggedIn: true },
  { name: '기록 부족', mine: {}, loggedIn: true },
  { name: '다크', mine: variantMine, loggedIn: true, dark: true },
  { name: '직전보다 달라짐', mine: variantMineChanged, loggedIn: true },
];

const draw = (scene: MealStorySceneType, viewer: Viewer, frame: number, id = 'c0', story: MealStoryType = variantStory): string => {
  clock.frame = frame;
  const pal = paperPalette(story.topic?.nutrient ?? null, viewer.dark ?? false);
  return renderToStaticMarkup(
    <Chapter
      scene={scene}
      ctx={{ story, pal, kicker: '변형 점검', mine: viewer.mine, loggedIn: viewer.loggedIn, id }}
      saltSpoon={isSaltSpoonScene(story, scene)}
    />,
  );
};

/** 같은 장면들을 식이섬유 주제로 — 무대 색·마무리 짝이 주제를 따른다. */
const fiberStory: MealStoryType = { ...variantStory, topic: { nutrient: 'fiber', direction: 'increase' } };

const sceneName = (scene: MealStorySceneType, i: number): string =>
  `${i + 1} ${scene.type}${'title' in scene ? ` '${scene.title}'` : scene.type === 'step' ? ` ${scene.number}` : ''}`;

/** 읽으라고 놓은 글의 크기(px) — 소품 안 꾸밈 글자(data-deco)는 빼고, em 은 가까운 조상의 px 로 푼다. */
const textSizes = (markup: string): { size: number; text: string }[] => {
  const doc = new DOMParser().parseFromString(`<div id="root">${markup}</div>`, 'text/html');
  const px = (el: Element): number | null => {
    const attr = el.getAttribute('font-size');
    if (attr && /^[\d.]+$/.test(attr)) return Number(attr);
    const style = (el as HTMLElement).style?.fontSize ?? '';
    if (style.endsWith('px')) return Number.parseFloat(style);
    if (style.endsWith('em')) {
      for (let up = el.parentElement; up; up = up.parentElement) {
        const base = px(up);
        if (base !== null) return base * Number.parseFloat(style);
      }
    }
    return null;
  };
  const out: { size: number; text: string }[] = [];
  for (const el of doc.querySelectorAll('#root *')) {
    if (el.closest('[data-deco]')) continue;
    const size = px(el);
    const text = (el.textContent ?? '').trim();
    if (size !== null && text) out.push({ size, text: text.slice(0, 24) });
  }
  return out;
};

describe('장면 그림 — 변형 원고', () => {
  const scenes = variantStory.scenes;

  it.each(scenes.map((scene, i) => [sceneName(scene, i), scene] as const))('%s — 어느 프레임·어느 사람에게도 예외·NaN 없이 그려진다', (_, scene) => {
    const end = chapterFrames(variantStory, scene);
    for (const viewer of VIEWERS) {
      for (const frame of [0, 9, 31, 78, 140, Math.round(end / 2), end - 13, end - 1]) {
        const markup = draw(scene, viewer, frame);
        expect(markup.length).toBeGreaterThan(200);
        expect(markup, `${viewer.name} · 프레임 ${frame}`).not.toMatch(/NaN|undefined|Infinity/);
      }
    }
  });

  it('읽는 글은 각주 하한(30px)보다 작지 않다 — 줄 수가 한도까지 차도(재료는 권장 9개까지)', () => {
    for (const [i, raw] of scenes.entries()) {
      const scene = raw.type === 'ingredients' ? { ...raw, items: raw.items.slice(0, 9) } : raw;
      const markup = draw(scene, VIEWERS[2]!, chapterFrames(variantStory, scene) - 1);
      const small = textSizes(markup).filter((t) => t.size < TYPE.foot - 0.01);
      expect(small, sceneName(scene, i)).toEqual([]);
    }
  });

  it('값을 못 구한 숫자는 0 으로 그리지 않고 값 없음 — 막대·옆 값·영양 줄·일반 숫자', () => {
    const at = (type: MealStorySceneType['type'], nth = 0) => scenes.filter((s) => s.type === type)[nth]!;
    const last = (scene: MealStorySceneType) => draw(scene, VIEWERS[0]!, chapterFrames(variantStory, scene) - 1);
    // 막대 넷 장면 — 셋째 막대와 그 옆 값(열량)이 비었다.
    expect(last(at('bars', 1)).match(/값 없음/g)).toHaveLength(2);
    expect(last(at('nutrition')).match(/값 없음/g)).toHaveLength(1);
    // 일반 숫자 장면 — 내 기록이 아닌 빈 숫자는 로그인 안내가 아니라 값 없음, 내 기록 숫자는 로그인 안내.
    const stat = last(at('stat', 1));
    expect(stat.match(/값 없음/g)).toHaveLength(1);
    expect(stat.match(/로그인하면 내 값도 보여요/g)).toHaveLength(1);
  });

  it('소금 환산·약 N분의 1 은 서버가 준 값만 — 화면이 비율을 지어내지 않는다', () => {
    const spoon = scenes.find((s) => s.type === 'stat')!;
    const last = (scene: MealStorySceneType, viewer: Viewer) => draw(scene, viewer, chapterFrames(variantStory, scene) - 1);
    // 기준 숫자는 서버가 환산한 5.8g, 내 값은 서버가 준 식(÷ 400)으로 3,120 → 7.8g.
    const mine = last(spoon, VIEWERS[2]!);
    expect(mine).toContain('소금 약 5.8g');
    expect(mine).toContain('소금 약 7.8g');
    expect(mine).toContain('기준의 136%');
    // 환산이 없는 원고면 소금 쪽지도 없다.
    const bare = { ...spoon, figures: spoon.type === 'stat' ? spoon.figures.map((f) => ({ ...f, figure: { ...f.figure, equivalent: null } })) : [] } as MealStorySceneType;
    expect(last(bare, VIEWERS[2]!)).not.toContain('소금 약');
    // 막대 — 서버가 준 '약 10분의 1'만, 비우면 말하지 않는다.
    const two = scenes.filter((s) => s.type === 'bars')[0]!;
    expect(last(two, VIEWERS[0]!)).toContain('약 10분의 1');
    expect(last({ ...two, fraction: null } as MealStorySceneType, VIEWERS[0]!)).not.toContain('분의 1');
  });

  it('내 기준이 원고의 성인 기준과 다르면(65세 이상) 숟가락·% ·도장이 내 기준을 따르고 어느 기준인지 밝힌다', () => {
    const spoon = scenes.find((s) => s.type === 'stat')!;
    const senior: Viewer = { name: '65세 이상', mine: variantMineSenior, loggedIn: true };
    const markup = draw(spoon, senior, chapterFrames(variantStory, spoon) - 1);
    // 2,200mg 은 성인 기준(2,300) 안이지만 내 기준(2,100)으로는 105% — 쪽지가 내 기준을 밝히고 도장은 '많음'.
    expect(markup).toContain('내 기준 2,100mg의 105%');
    expect(markup).toContain('많음');
    expect(markup).toContain('소금 약 5.5g');
    // 성인 기준인 사람에게는 그냥 '기준의 N%'.
    expect(draw(spoon, VIEWERS[2]!, chapterFrames(variantStory, spoon) - 1)).not.toContain('내 기준');
  });

  it('일반 숫자 장면 — 내 값 아래에 내 기준 대비 % 와 판정을 밝힌다(기준이 남·여 둘로 나뉜 주제에서 내가 어느 쪽인지)', () => {
    const plain = scenes.filter((s) => s.type === 'stat')[1]!;
    const last = (viewer: Viewer) => draw(plain, viewer, chapterFrames(variantStory, plain) - 1);
    const fiber = last({ name: '식이섬유 값 있음', mine: variantMineFiber, loggedIn: true });
    expect(fiber).toContain('내 기준 20g의 82% · 조금 부족');
    // 내 값이 없거나(나트륨만 있는 사람) 로그인 전이면 쪽지도 없다 — 기준 숫자의 덧말은 그대로.
    expect(last(VIEWERS[2]!)).not.toContain('내 기준');
    expect(last(VIEWERS[0]!)).not.toContain('내 기준');
    expect(last(VIEWERS[0]!)).toContain('여성 20g · 남성 25~30g');
    // 기준 대비 % 를 모르면(통계가 못 줬다) 말하지 않는다.
    const noPercent: MotionMine = { fiber: { ...variantMineFiber.fiber!, percent: null } };
    expect(last({ name: '% 없음', mine: noPercent, loggedIn: true })).not.toContain('내 기준');
  });

  it('직전 2주보다 달라졌으면 내 값 칸에 변화 쪽지가 하나 더 — 웹이 준 글 그대로, 없으면 붙이지 않는다', () => {
    const [spoon, plain] = scenes.filter((s) => s.type === 'stat') as [MealStorySceneType, MealStorySceneType];
    const last = (scene: MealStorySceneType, viewer: Viewer) => draw(scene, viewer, chapterFrames(variantStory, scene) - 1);
    const changed = VIEWERS[5]!;
    // 숟가락 장면 — 소금·기준 대비 % 아래 셋째 쪽지.
    const s = last(spoon, changed);
    expect(s).toContain('기준의 120%');
    expect(s).toContain('직전 2주보다 12% 줄었어요');
    expect(last(spoon, VIEWERS[2]!)).not.toContain('직전 2주보다');
    // 내 쪽 칸이 길어져도 겹치지 않게, 기준 숫자의 덧말(나이별 기준)은 기준 쪽 칸 아래에 줄을 나눠 붙는다.
    expect(s).not.toContain('65~74세 2,100mg · 75세 이상 1,700mg');
    expect(s).toContain('65~74세 2,100mg');
    expect(s).toContain('75세 이상 1,700mg');
    // 일반 숫자 장면 — 기준 대비 % 아래 둘째 줄.
    const p = last(plain, changed);
    expect(p).toContain('내 기준 20g의 82% · 조금 부족');
    expect(p).toContain('직전 2주보다 20% 늘었어요');
    // 읽는 글 하한은 그대로.
    for (const markup of [s, p]) expect(textSizes(markup).filter((t) => t.size < TYPE.foot - 0.01)).toEqual([]);
  });

  it('주제가 바뀌면 무대 색과 마무리의 짝이 바뀐다 — 나트륨은 소금통·숟가락, 식이섬유는 밥공기·버섯', () => {
    expect(paperPalette('fiber', false).stage).not.toBe(paperPalette('sodium', false).stage);
    // 다크 모드의 짙은 줄무늬도 주제색(빠지면 undefined 가 그림에 박힌다), 모르는 주제는 기본(나트륨) 색.
    expect(paperPalette('fiber', true).stageDeep).not.toBe(paperPalette('sodium', true).stageDeep);
    expect(new Set(['sodium', 'fiber', 'calcium'].map((t) => paperPalette(t, false).stage)).size).toBe(3);
    expect(paperPalette('vitaminD', false).stage).toBe(paperPalette('sodium', false).stage);
    expect(paperPalette(null, true).stageDeep).toBe(paperPalette('sodium', true).stageDeep);
    const outro = scenes.find((s) => s.type === 'outro')!;
    const end = chapterFrames(variantStory, outro) - 1;
    // 소금통에는 '소금' 이름표가 있다.
    expect(draw(outro, VIEWERS[0]!, end)).toContain('소금');
    const fiber = draw(outro, VIEWERS[0]!, end, 'c0', fiberStory);
    expect(fiber).not.toContain('소금');
    expect(fiber).not.toMatch(/NaN|undefined|Infinity/);
    // 칼슘의 짝은 우유곽·멸치 — 우유곽은 얼굴이라 '우유' 이름표가 없고, 소금통도 없다.
    const calciumStory: MealStoryType = { ...variantStory, topic: { nutrient: 'calcium', direction: 'increase' } };
    const calcium = draw(outro, VIEWERS[0]!, end, 'c0', calciumStory);
    expect(calcium).not.toContain('소금');
    expect(calcium).not.toBe(fiber);
    for (const story of [fiberStory, calciumStory]) {
      for (const scene of scenes) {
        for (const dark of [false, true]) {
          const markup = draw(scene, { name: '주제 바꿈', mine: variantMineFiber, loggedIn: true, dark }, chapterFrames(story, scene) - 1, 'c0', story);
          expect(markup, sceneName(scene, 0)).not.toMatch(/NaN|undefined|Infinity/);
        }
      }
    }
  });

  it('틀은 그 편의 소품을 원고에서 고른다 — 완성 그릇은 마지막 만드는 법 단계, 재료는 나온 차례(같은 그림은 한 번)', () => {
    expect(dishIcon(variantStory)).toBe('pan');
    const icons = ingredientIcons(variantStory);
    expect(icons.slice(0, 2)).toEqual(['noodle', 'tomato']);
    expect(new Set(icons).size).toBe(icons.length);
    // 소품을 달지 않은 원고는 비운다(틀이 다른 편의 그림을 대신 놓지 않는다).
    const bare: MealStoryType = { ...variantStory, scenes: variantStory.scenes.filter((s) => s.type !== 'ingredients' && s.type !== 'step') };
    expect(dishIcon(bare)).toBeNull();
    expect(ingredientIcons(bare)).toEqual([]);
    const cover = scenes.find((s) => s.type === 'cover')!;
    expect(draw(cover, VIEWERS[0]!, 60, 'c0', bare)).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('소품은 모두 예외·NaN 없이 그려진다(계약의 이름마다 그림이 있다)', () => {
    const pal = paperPalette('fiber', false);
    for (const icon of Object.keys(PROP_FOR) as MealStoryIconType[]) {
      const markup = renderToStaticMarkup(
        <svg>
          <Icon icon={icon} fallback="" pal={pal} f={30} v={1} />
        </svg>,
      );
      expect(markup.length, icon).toBeGreaterThan(80);
      expect(markup, icon).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('시간표 — 장면마다 길이가 있고 전체가 이어진다', () => {
    const timeline = buildTimeline(variantStory);
    expect(timeline.chapters).toHaveLength(scenes.length);
    for (const c of timeline.chapters) expect(c.duration).toBeGreaterThan(60);
    expect(Number.isFinite(timeline.total)).toBe(true);
  });
});

describe('자리 계산', () => {
  it('막대 — 넷이고 덧말·각주가 길어도 마지막 줄이 아래 쪽지 위에서 끝나고, 쪽지는 무대 안에서 끝난다', () => {
    for (const bars of [2, 3, 4]) {
      for (const [noteLines, footLines] of [[0, 0], [2, 0], [2, 1], [4, 2]] as const) {
        const L = barsLayout(bars, noteLines, footLines);
        const lastRowEnd = BARS.TOP + (bars - 1) * L.rowH + L.barTop + L.barH + 56; // 띠 + 옆 값 한 줄
        if (noteLines || footLines) expect(lastRowEnd, `막대 ${bars} · 덧말 ${noteLines} · 각주 ${footLines}`).toBeLessThanOrEqual(L.noteTop);
        const end = footLines ? L.footTop + cardHeight(footLines, TYPE.foot) : L.noteTop + (noteLines ? cardHeight(noteLines, BARS.NOTE_SIZE) : 0);
        expect(end).toBeLessThanOrEqual(STAGE_BOTTOM + 0.5);
        // 줄 사이 — 다음 줄의 값 쪽지(오른쪽)는 앞 줄의 띠 아래에서 시작하고, 앞 줄의 옆 값 글(왼쪽)은 다음 줄 이름표 위에서 끝난다.
        expect(L.rowH + L.barTop - 8 - L.paperH).toBeGreaterThanOrEqual(L.barTop + L.barH + 8);
        expect(L.rowH).toBeGreaterThanOrEqual(L.barTop + L.barH + 50);
      }
    }
    // 막대가 둘이면 띠·숫자를 키운다.
    expect(barsLayout(2, 2, 0).numSize).toBeGreaterThan(barsLayout(3, 2, 0).numSize);
  });

  it('제목 — 두 줄까지는 기본 크기, 한도(32자)까지 길어도 제목 띠가 무대(600) 위에서 끝난다', () => {
    expect(headingSize('하루 나트륨, 이보다 적게')).toBe(108);
    const long = '가나다라 마바사 아자차카 타파하 가나다라 마바사 아자차카';
    expect(long.length).toBeGreaterThanOrEqual(30);
    expect(long.length).toBeLessThanOrEqual(32);
    expect(headingSize(long)).toBeLessThan(108);
    expect(headingBottom(long)).toBeLessThan(600);
  });

  it('글 맞추기 — 너비에 들 때까지 줄이되 하한 아래로는 안 줄이고, 줄 수를 넘으면 말줄임표', () => {
    expect(fitSize('짧은 이름', 44, 600, 30)).toBe(44);
    const size = fitSize('이름이 아주 긴 재료 한 줄에 다 들어가는지 보는 이름', 44, 600, 30);
    expect(size).toBeLessThan(44);
    expect(size).toBeGreaterThanOrEqual(30);
    expect(textWidth('가나다', 40)).toBeCloseTo(114);
    expect(clipLines(['한 줄', '두 줄.', '세 줄'], 2)).toEqual(['한 줄', '두 줄…']);
    expect(clipLines(['한 줄'], 2)).toEqual(['한 줄']);
  });
});

describe('기준 대비 % 글', () => {
  it('기준 숫자가 하나이고 내 기준과 같으면 기준의 N%, 다르거나 여럿이면(남·여) 내 기준을 밝힌다 — 글로 보기와 영상이 같이 쓴다', () => {
    expect(ownStandardText(136, 2300, '2,300mg', [2300])).toBe('기준의 136%');
    expect(ownStandardText(105, 2100, '2,100mg', [2300])).toBe('내 기준 2,100mg의 105%');
    expect(ownStandardText(35, 30, '30g', [30, 20])).toBe('내 기준 30g의 35%');
    // 내 기준을 모르면(통계가 주지 않았다) 지어내지 않는다.
    expect(ownStandardText(80, null, null, [30, 20])).toBe('기준의 80%');
    // 장면에 기준 숫자가 없으면 무엇의 % 인지 알 수 없으니 내 기준을 밝힌다.
    expect(ownStandardText(80, 25, '25g', [])).toBe('내 기준 25g의 80%');
  });
});

describe('글꼴 주소', () => {
  it('영상이 미리 받는 원티드 산스 주소는 식단 화면이 붙이는 주소와 같다(다르면 같은 글꼴을 두 번 받는다)', () => {
    expect(FONT_STYLESHEETS.wanted).toBe(WANTED_SANS_CSS);
  });
});
