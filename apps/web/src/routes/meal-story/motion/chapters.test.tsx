import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MealStorySceneType } from '@repo/api-contract';
import { FONT_STYLESHEETS } from './fonts';
import { BARS, STAGE_BOTTOM, barsLayout, cardHeight, clipLines, fitSize, headingBottom, headingSize, textWidth } from './layout';
import { paperPalette } from './paper/palette';
import { Chapter } from './StoryVideo';
import { variantMine, variantMineSenior, variantStory } from './storyFixture';
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
];

const draw = (scene: MealStorySceneType, viewer: Viewer, frame: number, id = 'c0'): string => {
  clock.frame = frame;
  const pal = paperPalette(variantStory.topic?.nutrient ?? null, viewer.dark ?? false);
  return renderToStaticMarkup(
    <Chapter
      scene={scene}
      ctx={{ story: variantStory, pal, kicker: '변형 점검', mine: viewer.mine, loggedIn: viewer.loggedIn, id }}
      saltSpoon={isSaltSpoonScene(variantStory, scene)}
    />,
  );
};

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

describe('글꼴 주소', () => {
  it('영상이 미리 받는 원티드 산스 주소는 식단 화면이 붙이는 주소와 같다(다르면 같은 글꼴을 두 번 받는다)', () => {
    expect(FONT_STYLESHEETS.wanted).toBe(WANTED_SANS_CSS);
  });
});
