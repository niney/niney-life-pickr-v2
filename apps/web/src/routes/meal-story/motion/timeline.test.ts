import { describe, expect, it } from 'vitest';
import type { MealStoryFigureType, MealStorySceneType, MealStoryType } from '@repo/api-contract';
import { balanceLines, odometerPosition } from './layout';
import { amountDecimals, formatAmount } from './theme';
import {
  READ_FRAMES_PER_CHAR,
  SPOON,
  TRANSITION_FRAMES,
  barsFootnotes,
  barsTiming,
  buildTimeline,
  chapterAt,
  chapterFrames,
  chapterProgress,
  chapterSeekFrame,
  isSaltSpoonScene,
  lineupFootnotes,
  lineupTiming,
  readFrames,
  statTiming,
  stepTiming,
  toReal,
} from './timeline';

// 스토리 영상의 시간표 — 장면 길이(내용으로), 이웃 장면 겹침(전환), 진행 막대·장면 건너뛰기가 쓰는 셈.

const fig = (over: Partial<MealStoryFigureType> = {}): MealStoryFigureType => ({
  value: null,
  unit: 'mg',
  basis: null,
  detail: null,
  sources: [],
  my: null,
  equivalent: null,
  ...over,
});

const sodium = { topic: { nutrient: 'sodium', direction: 'reduce' } } as const satisfies Pick<MealStoryType, 'topic'>;

const scenes: MealStorySceneType[] = [
  { type: 'cover', kicker: '나트륨 줄이기', title: '표지', subtitle: null, image: null },
  {
    type: 'stat',
    title: '하루 나트륨',
    figures: [
      { label: '성인 하루 기준', figure: fig({ value: 2300 }) },
      { label: '내 평균', figure: fig({ unit: '', my: 'sodium' }) },
    ],
    note: null,
  },
  { type: 'bars', title: '비교', bars: [0, 1].map((i) => ({ label: `막대 ${i}`, figure: fig({ value: 100 * (i + 1) }), aside: null, highlight: i === 1 })), fraction: null, note: null },
  { type: 'list', title: '방법', items: [0, 1, 2].map((i) => ({ title: `방법 ${i}`, text: null, icon: null })), note: null },
  { type: 'ingredients', title: '재료', servings: 1, items: [0, 1, 2, 3].map((i) => ({ label: `재료 ${i}`, grams: 10, note: null, food: 'x', icon: null })) },
  { type: 'step', number: 1, total: 1, text: '가'.repeat(50), tip: '팁', image: null, icon: null },
  { type: 'nutrition', title: '영양', servings: 1, rows: [{ key: 'kcal', label: '열량', figure: fig({ value: 481, unit: 'kcal' }) }], cautions: [], note: null },
  { type: 'outro', title: '끝', text: null, actions: ['share'] },
];

describe('장면 길이', () => {
  it('움직임은 TEMPO 만큼 빠르게 — 나트륨 기준 숫자 장면은 숟가락 시각표 끝까지, 다른 주제는 숫자 수만큼', () => {
    expect(isSaltSpoonScene(sodium, scenes[1]!)).toBe(true);
    const spoon = chapterFrames(sodium, scenes[1]!);
    expect(spoon).toBeGreaterThanOrEqual(Math.round(toReal(SPOON.end)));
    expect(toReal(SPOON.end)).toBeLessThan(SPOON.end); // 움직임은 설계보다 빨리 끝난다
    // 내 숟가락 쪽지(소금 환산·기준 대비)가 뜬 뒤 다음 장면이 밀려오기까지 2.5초 넘게 — 읽을 시간.
    expect(spoon - TRANSITION_FRAMES - toReal(SPOON.extraB)).toBeGreaterThanOrEqual(75);
    const potassium = { topic: { nutrient: 'potassium', direction: 'increase' } } as const satisfies Pick<MealStoryType, 'topic'>;
    expect(isSaltSpoonScene(potassium, scenes[1]!)).toBe(false);
    expect(chapterFrames(potassium, scenes[1]!)).toBeGreaterThanOrEqual(Math.round(toReal(statTiming(2).ready)));
  });

  it('칠판 그림체 — 나트륨 주제여도 숟가락 장면이 없어 큰 숫자 장면은 숫자 수만큼', () => {
    const chalk = { ...sodium, look: 'chalk' } as const;
    expect(isSaltSpoonScene(chalk, scenes[1]!)).toBe(false);
    expect(chapterFrames(chalk, scenes[1]!)).toBeGreaterThanOrEqual(Math.round(toReal(statTiming(2).ready)));
    expect(chapterFrames(chalk, scenes[1]!)).not.toBe(chapterFrames(sodium, scenes[1]!));
    // 다른 장면의 길이는 그림체와 무관하다.
    expect(chapterFrames(chalk, scenes[2]!)).toBe(chapterFrames(sodium, scenes[2]!));
  });

  it('글 읽는 시간은 빠르기와 따로 지킨다 — 공백 뺀 글자당 2.4프레임', () => {
    expect(readFrames('가나다 라마', null, '바')).toBe(Math.round(6 * READ_FRAMES_PER_CHAR));
    // 막대 덧말이 길면 장면이 길어진다(덧말이 보인 뒤 다 읽을 때까지).
    const bars = (note: string | null): MealStorySceneType => ({ ...(scenes[2] as Extract<MealStorySceneType, { type: 'bars' }>), note });
    const t = barsTiming(2);
    const long = '가'.repeat(80);
    expect(chapterFrames(sodium, bars(long))).toBeGreaterThanOrEqual(Math.round(toReal(t.noteAt + 18) + readFrames(long)));
    expect(chapterFrames(sodium, bars(long))).toBeGreaterThan(chapterFrames(sodium, bars(null)));
  });

  it('만드는 법 — 팁은 단계 글을 거의 다 읽은 뒤 나오고, 팁도 읽을 시간을 준다', () => {
    const step = scenes[5] as Extract<MealStorySceneType, { type: 'step' }>;
    const t = stepTiming(step);
    expect(toReal(t.tipAt!)).toBeCloseTo(toReal(t.textReady) + readFrames(step.text) * 0.85);
    expect(t.frames).toBeGreaterThanOrEqual(Math.round(toReal(t.tipAt! + 10) + readFrames(step.tip)));
    const noTip = stepTiming({ text: step.text, tip: null });
    expect(noTip.tipAt).toBeNull();
    expect(noTip.frames).toBeGreaterThanOrEqual(Math.round(toReal(noTip.textReady) + readFrames(step.text)));
  });

  it('줄 세우기 — 줄이 많을수록, 덧말이 길수록 길고, 아래 덧말은 값마다 서버가 단 detail 을 한 번씩', () => {
    const lineup = (rows: number, note: string | null): Extract<MealStorySceneType, { type: 'lineup' }> => ({
      type: 'lineup',
      title: '면끼리',
      basis: '삶은 면 100g',
      rows: Array.from({ length: rows }, (_, i) => ({
        label: `면 ${i}`,
        sub: null,
        figure: fig({ value: 100 + i, unit: 'kcal', detail: i < 2 ? '표시한 제품 4개의 중앙값이에요' : null }),
        icon: null,
        highlight: i === 0,
      })),
      note,
    });
    expect(chapterFrames(sodium, lineup(7, null))).toBeGreaterThanOrEqual(Math.round(toReal(lineupTiming(7).end)));
    expect(chapterFrames(sodium, lineup(7, null))).toBeGreaterThan(chapterFrames(sodium, lineup(4, null)));
    const long = '가'.repeat(60);
    expect(chapterFrames(sodium, lineup(4, long))).toBeGreaterThanOrEqual(Math.round(toReal(lineupTiming(4).noteAt + 18) + readFrames(long)));
    expect(chapterFrames(sodium, lineup(4, long))).toBeGreaterThan(chapterFrames(sodium, lineup(4, null)));
    expect(lineupFootnotes(lineup(4, null))).toEqual(['표시한 제품 4개의 중앙값이에요']);
  });

  it('막대 아래 덧말은 값마다 서버가 단 detail 을 한 번씩', () => {
    const scene: Extract<MealStorySceneType, { type: 'bars' }> = {
      type: 'bars',
      title: '통밀',
      bars: [
        { label: '건면', figure: fig({ value: 2.2, unit: 'g' }), aside: null, highlight: false },
        { label: '반반', figure: fig({ value: 4.3, unit: 'g', detail: '통밀 스파게티의 식이섬유 값은 표시한 제품 4개의 중앙값이에요' }), aside: null, highlight: false },
        { label: '통밀', figure: fig({ value: 6.4, unit: 'g', detail: '통밀 스파게티의 식이섬유 값은 표시한 제품 4개의 중앙값이에요' }), aside: null, highlight: true },
      ],
      fraction: null,
      note: null,
    };
    expect(barsFootnotes(scene)).toEqual(['통밀 스파게티의 식이섬유 값은 표시한 제품 4개의 중앙값이에요']);
  });
});

describe('시간표', () => {
  const timeline = buildTimeline({ ...sodium, scenes });
  const durations = scenes.map((s) => chapterFrames(sodium, s));

  it('이웃 장면은 전환만큼 겹친다 — 전체 = 길이 합 − (장면 수 − 1) × 전환', () => {
    expect(timeline.chapters.map((c) => c.duration)).toEqual(durations);
    expect(timeline.total).toBe(durations.reduce((a, b) => a + b, 0) - (scenes.length - 1) * TRANSITION_FRAMES);
    for (let i = 1; i < timeline.chapters.length; i += 1) {
      const prev = timeline.chapters[i - 1]!;
      expect(timeline.chapters[i]!.from).toBe(prev.from + prev.duration - TRANSITION_FRAMES);
    }
  });

  it('지금 장면은 전환의 절반을 넘으면 다음 장면', () => {
    const second = timeline.chapters[1]!;
    expect(chapterAt(timeline, 0)).toBe(0);
    expect(chapterAt(timeline, second.from + TRANSITION_FRAMES / 2 - 1)).toBe(0);
    expect(chapterAt(timeline, second.from + TRANSITION_FRAMES / 2)).toBe(1);
    expect(chapterAt(timeline, timeline.total - 1)).toBe(scenes.length - 1);
  });

  it('장면으로 건너뛰면 전환이 끝난 프레임에 서고, 그 장면 칸은 비어 있다가 다음 장면 시작에서 꽉 찬다', () => {
    expect(chapterSeekFrame(timeline, 0)).toBe(0);
    const third = timeline.chapters[2]!;
    const seek = chapterSeekFrame(timeline, 2);
    expect(seek).toBe(third.from + TRANSITION_FRAMES);
    expect(chapterAt(timeline, seek)).toBe(2);
    expect(chapterProgress(timeline, 2, seek)).toBe(0);
    expect(chapterProgress(timeline, 2, chapterSeekFrame(timeline, 3))).toBe(1);
    expect(chapterProgress(timeline, 3, seek)).toBe(0);
    expect(chapterSeekFrame(timeline, 99)).toBe(0);
  });
});

describe('글 배치', () => {
  it('두 줄 제목은 줄 길이를 고르게 — 마지막 낱말만 떨어지지 않게', () => {
    expect(balanceLines(['하루', '나트륨,', '이보다', '적게'], 8)).toEqual([
      ['하루', '나트륨,'],
      ['이보다', '적게'],
    ]);
    expect(balanceLines(['짧은', '제목'], 8)).toEqual([['짧은', '제목']]);
  });

  it('세 줄 이상이어도 줄 길이를 고르게 — 낱말 차례는 그대로', () => {
    const lines = balanceLines(['가나다라', '마바사아', '자차카타', '파하가나'], 6);
    expect(lines).toHaveLength(4);
    expect(lines.flat()).toEqual(['가나다라', '마바사아', '자차카타', '파하가나']);
    // 마지막 낱말 하나만 떨어지지 않는다(앞에서부터 채우면 '때' 한 글자가 셋째 줄에 남았다).
    expect(balanceLines('마무리 제목도 두 줄이 될 만큼 길 때'.split(' '), 7.83)).toEqual([
      ['마무리', '제목도'],
      ['두', '줄이', '될'],
      ['만큼', '길', '때'],
    ]);
  });

  it('두 줄로 고르게 못 나누면 세 줄로 — 둘째 줄이 화면 밖으로 넘치지 않는다', () => {
    const lines = balanceLines('사진이 있는 표지와 조금 긴 제목'.split(' '), 7.44);
    expect(lines).toEqual([
      ['사진이', '있는'],
      ['표지와', '조금'],
      ['긴', '제목'],
    ]);
    // 낱말 하나가 한 줄보다 길면 그 낱말만 한 줄에.
    expect(balanceLines(['아주아주아주긴낱말하나', '짧은', '말'], 6)).toEqual([['아주아주아주긴낱말하나'], ['짧은', '말']]);
  });

  it('굴러가는 숫자 — 정수에서는 자리마다 그 숫자에 서고, 윗자리는 아랫자리가 9 에서 넘어갈 때만 움직인다', () => {
    const at = (v: number) => [3, 2, 1, 0].map((k) => odometerPosition(v, k));
    expect(at(2300)).toEqual([2, 3, 0, 0]);
    expect(odometerPosition(9.5, 1)).toBeCloseTo(0.5);
    expect(odometerPosition(15.5, 1)).toBe(1);
    expect(odometerPosition(199.5, 2)).toBeCloseTo(1.5);
  });

  it('소수 한 자리는 10g 미만의 g 만(.0 은 빼고) — 굴러가는 숫자와 글이 같은 규칙', () => {
    expect(amountDecimals(9.9, 'g')).toBe(1);
    expect(amountDecimals(5, 'g')).toBe(0);
    expect(amountDecimals(15.4, 'g')).toBe(0);
    expect(amountDecimals(9.9, 'mg')).toBe(0);
    expect(formatAmount(9.9, 'g')).toBe('9.9');
    expect(formatAmount(2878.6, 'mg')).toBe('2,879');
  });
});
