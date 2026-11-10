import type { MealStorySceneType, MealStoryType } from '@repo/api-contract';
import type { Span } from './saltPose';
import { TEMPO } from './theme';

// 스토리 타임라인 — 장면(원고 scenes)마다 길이를 정하고, 이웃 장면은 전환(TRANSITION_FRAMES)만큼 겹친다(@remotion/transitions
// TransitionSeries 와 같은 셈). 재생기의 진행 막대·장면 건너뛰기와 영상이 같은 표를 쓴다.
//
// 빠르기 — 장면 안의 시각표는 '설계 프레임'으로 적고(아래 상수, 장면 그림도 이것을 쓴다), 그림은 useClock()(실제 프레임 ÷
// TEMPO)으로 읽는다. 글 읽는 시간은 TEMPO 와 따로 실제 프레임으로 지킨다(공백 뺀 글자당 2.4프레임 = 초당 약 12.5자).
// 장면 길이 = max(움직임이 끝나는 때, 글이 다 보인 때 + 읽을 시간) + 잠깐 머묾.

export const TRANSITION_FRAMES = 12;
export const READ_FRAMES_PER_CHAR = 2.4;
const HOLD = 12;

/** 글 읽는 시간(실제 프레임) — 공백 뺀 글자 수 × 2.4. */
export const readFrames = (...texts: (string | null | undefined)[]): number =>
  Math.round(texts.reduce((n, t) => n + (t ? t.replace(/\s/g, '').length : 0), 0) * READ_FRAMES_PER_CHAR);

/** 설계 프레임 → 실제 프레임, 실제 → 설계. */
export const toReal = (design: number): number => design * TEMPO;
export const toDesign = (real: number): number => real / TEMPO;

const chapterLength = (motionEnd: number, textReady: number, read: number): number =>
  Math.round(Math.max(toReal(motionEnd), toReal(textReady) + read) + HOLD);

// ── 장면별 시각표(설계 프레임) — 장면 그림과 길이 셈이 함께 쓴다 ──

/** 표지 — 머리말, 제목(낱말마다), 부제, 소금통이 다 쏟고 빠지는 때. */
export const COVER = { kicker: 6, title: 12, sub: [44, 64] as Span, end: 136 } as const;

/** 숟가락 장면('하루 기준', 나트륨) — 기준 숟가락 A, 덧말(나이별 기준)은 A 바로 뒤, 내 숟가락 B, 도장. */
export const SPOON = {
  enterA: 16,
  shakerA: { drop: 28, tilt: [40, 54] as Span, pour: [52, 124] as Span },
  fillA: [58, 134] as Span,
  saltA: 136,
  detail: 142,
  note: [148, 166] as Span,
  shift: 152,
  enterB: 160,
  shakerB: { drop: 168, tilt: [178, 190] as Span, pour: [190, 246] as Span },
  fillB: [196, 254] as Span,
  stamp: 258,
  extraB: 266,
  end: 284,
} as const;
// 내 숟가락 아래 글(소금 환산·기준 대비·판정 도장)을 읽는 시간 — 로그인 여부와 무관하게 같은 길이(실제 프레임).
// 이 편에서 보는 사람 자신의 숫자가 나오는 유일한 순간이라 넉넉히(40 이던 때는 쪽지가 뜨고 1.1초 뒤 장면이 넘어갔다).
const SPOON_READ = 85;

/** 숫자 장면(숟가락이 아닐 때) — 숫자마다 차례로 솟고 굴러 오른 뒤 덧말. */
export const statTiming = (figures: number) => ({
  start: (i: number) => 30 + i * 75,
  noteAt: 40 + figures * 75,
  ready: 60 + figures * 75,
});

/** 막대 — 차례로 자라고, 마지막 막대가 자라기 시작하면 덧말, 다 자라면 도장. */
export const barsTiming = (bars: number) => {
  const growStart = (i: number) => 34 + i * 45;
  const last = growStart(bars - 1) + 44;
  return { growStart, grow: 44, last, stampAt: last + 8, noteAt: growStart(bars - 1) + 10, end: last + 28 };
};

/** 목록 — 항목마다 크게 들어와(beat) 작아지며 쌓이고(move), 다 쌓이면 덧말. */
export const LIST = { first: 50, beat: 60, move: 18 } as const;
// 다 쌓인 목록을 한 번 훑어보는 시간(실제 프레임).
const LIST_SCAN = 36;

/** 재료 — 줄마다 차례로(stagger), 그릇은 먼저. */
export const INGREDIENTS = { first: 40, stagger: 14, bowl: 20, count: 24 } as const;

/** 만드는 법 — 단계 글이 낱말마다 솟고, 글을 거의 다 읽었을 때(읽는 시간의 85%) 팁이 튀어나온다. */
export const STEP = { text: 24, stagger: 2, settle: 14 } as const;
export const stepTiming = (scene: { text: string; tip: string | null }) => {
  const words = scene.text.split(/\s+/).filter(Boolean).length;
  const textReady = STEP.text + words * STEP.stagger + STEP.settle;
  const tipAt = scene.tip ? toDesign(toReal(textReady) + readFrames(scene.text) * 0.85) : null;
  const frames =
    tipAt === null
      ? chapterLength(textReady, textReady, readFrames(scene.text))
      : chapterLength(tipAt + 20, tipAt + 10, readFrames(scene.tip));
  return { textReady, tipAt, frames };
};

/** 영양정보 — 라벨 테두리·굵은 줄, 줄마다 숫자, 주의 문구는 마지막 두 줄이 구를 때 들어온다. */
export const NUTRITION = { card: [14, 40] as Span, rule: [36, 52] as Span, first: 50, row: 16, count: 30 } as const;
export const nutritionTiming = (rows: number) => ({
  rowStart: (i: number) => NUTRITION.first + i * NUTRITION.row,
  tailAt: NUTRITION.first + Math.max(0, rows - 2) * NUTRITION.row,
  end: NUTRITION.first + Math.max(0, rows - 1) * NUTRITION.row + NUTRITION.count,
});

/** 마무리 — 제목 카드(fill)·제목·글, 소금통과 숟가락(ring). 영상이 여기서 멈추므로 손 흔들 시간은 둔다(실제 프레임 minReal). */
export const OUTRO = { fill: [0, 16] as Span, title: 12, text: [30, 48] as Span, ring: 40, minReal: 120 } as const;

/** 나트륨 이야기의 '하루 기준' 장면 — 숟가락에 소금이 쌓이는 장면으로 그린다. */
export const isSaltSpoonScene = (story: Pick<MealStoryType, 'topic'>, scene: MealStorySceneType): boolean =>
  story.topic?.nutrient === 'sodium' &&
  scene.type === 'stat' &&
  scene.figures.some((f) => !f.figure.my && f.figure.unit === 'mg' && f.figure.value !== null);

/** 막대 아래 작은 덧말(값마다 서버가 단 detail, 같은 것은 한 번) — 표시한 제품 수 같은 것. */
export const barsFootnotes = (scene: Extract<MealStorySceneType, { type: 'bars' }>): string[] => [
  ...new Set(scene.bars.map((b) => b.figure.detail).filter((d): d is string => !!d)),
];

/** 장면 길이(실제 프레임, 30fps). */
export const chapterFrames = (story: Pick<MealStoryType, 'topic'>, scene: MealStorySceneType): number => {
  switch (scene.type) {
    case 'cover':
      return chapterLength(COVER.end, COVER.sub[1], readFrames(scene.subtitle) + Math.round(readFrames(scene.title) * 0.5));
    case 'stat': {
      if (isSaltSpoonScene(story, scene)) return chapterLength(SPOON.end, SPOON.extraB, SPOON_READ);
      const t = statTiming(scene.figures.length);
      return chapterLength(t.ready, t.ready, readFrames(scene.note) + 30);
    }
    case 'bars': {
      const t = barsTiming(scene.bars.length);
      const foot = barsFootnotes(scene).reduce((n, d) => n + readFrames(d), 0);
      return chapterLength(t.end, t.noteAt + 18, readFrames(scene.note) + Math.round(foot * 0.5));
    }
    case 'list': {
      const end = LIST.first + scene.items.length * LIST.beat;
      return chapterLength(end + (scene.note ? 18 : 0), end + (scene.note ? 18 : 0), readFrames(scene.note) + LIST_SCAN);
    }
    case 'ingredients': {
      const ready = INGREDIENTS.first + Math.max(0, scene.items.length - 1) * INGREDIENTS.stagger + INGREDIENTS.count;
      const read = Math.round(readFrames(...scene.items.map((i) => i.label)) * 0.5);
      return chapterLength(ready + 10, ready, read);
    }
    case 'step':
      return stepTiming(scene).frames;
    case 'nutrition': {
      const t = nutritionTiming(scene.rows.length);
      return chapterLength(t.end, t.tailAt + 20, readFrames(...scene.cautions, scene.note));
    }
    case 'outro':
      return Math.max(
        OUTRO.minReal,
        chapterLength(OUTRO.text[1], OUTRO.text[1], readFrames(scene.text) + Math.round(readFrames(scene.title) * 0.5)),
      );
  }
};

export interface TimelineChapter {
  index: number;
  scene: MealStorySceneType;
  /** 이 장면 시퀀스가 시작하는 프레임(앞 장면과 전환만큼 겹친다). */
  from: number;
  duration: number;
}

export interface Timeline {
  chapters: TimelineChapter[];
  total: number;
}

export const buildTimeline = (story: Pick<MealStoryType, 'topic' | 'scenes'>): Timeline => {
  const chapters: TimelineChapter[] = [];
  let from = 0;
  story.scenes.forEach((scene, index) => {
    const duration = chapterFrames(story, scene);
    chapters.push({ index, scene, from, duration });
    from += duration - TRANSITION_FRAMES;
  });
  const last = chapters[chapters.length - 1];
  return { chapters, total: last ? last.from + last.duration : 1 };
};

/** 지금 보이는 장면 — 전환의 절반을 넘으면 다음 장면으로 친다. */
export const chapterAt = (timeline: Timeline, frame: number): number => {
  let at = 0;
  for (const c of timeline.chapters) {
    if (frame >= c.from + (c.index === 0 ? 0 : TRANSITION_FRAMES / 2)) at = c.index;
  }
  return at;
};

/** 장면으로 건너뛸 때 서는 프레임 — 전환이 끝난 뒤. */
export const chapterSeekFrame = (timeline: Timeline, index: number): number => {
  const c = timeline.chapters[index];
  if (!c) return 0;
  return index === 0 ? 0 : c.from + TRANSITION_FRAMES;
};

/** 장면 안에서 얼마나 왔는지(0~1) — 진행 막대 칸 채우기. */
export const chapterProgress = (timeline: Timeline, index: number, frame: number): number => {
  const c = timeline.chapters[index];
  if (!c) return 0;
  const start = chapterSeekFrame(timeline, index);
  const end = c.from + c.duration;
  return Math.min(1, Math.max(0, (frame - start) / Math.max(1, end - start)));
};
