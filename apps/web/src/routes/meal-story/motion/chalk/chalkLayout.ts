import type { CSSProperties } from 'react';
import type { MealStorySceneType } from '@repo/api-contract';
import { rand } from '../anim';
import { textWidth, titleLines, wrapText } from '../layout';

// 칠판 메뉴판 그림체의 색·자리·선 계산(컴포넌트 없음 — 빠른 새로고침이 컴포넌트 파일만 다시 그리게). 그림은 kit.tsx 와 장면 파일.

export const CHALK = {
  board: '#22302b',
  wood: '#8a5a34',
  woodDeep: '#6e4526',
  white: '#f3f0e4',
  /** 보조 글 — 칠판 위 대비 6:1 안팎. */
  faint: 'rgba(243,240,228,0.72)',
  dim: 'rgba(243,240,228,0.4)',
  yellow: '#f5d76a',
  pink: '#f2a1a8',
  green: '#a9dc9b',
} as const;

/** 글·그림을 놓는 자리 — 왼쪽·오른쪽 끝, 머리말 쪽지 위 끝, 제목 위 끝, 아래 덧말의 아래 끝(분필 받침 위). */
export const CHALK_AREA = { left: 74, width: 936, tagTop: 84, headTop: 186, noteBottom: 1750 } as const;

// 칠판 메뉴판 그림체가 그리는 장면 — 표지·큰 숫자·막대·줄 세우기·목록·마무리. 레시피 장면(재료·만드는 법·영양정보)은 없다:
// 원고가 칠판을 고르고 그 장면을 쓰면 서버 점검이 막는다(friendly meal-story.defs 의 MEAL_STORY_LOOK_SCENES — 같은 목록).
// 혹시 들어오면 그 장면만 종이 오리기로 그린다(StoryVideo).
const DRAWS: readonly MealStorySceneType['type'][] = ['cover', 'stat', 'bars', 'lineup', 'list', 'outro'];

export const chalkDraws = (scene: MealStorySceneType): boolean => DRAWS.includes(scene.type);

export const clamp01 = (p: number): number => Math.min(1, Math.max(0, p));

/** 손으로 그은 선 — 조금씩 흔들린다. */
export const wobble = (x1: number, y1: number, x2: number, y2: number, seed: number, amp = 3, step = 46): string => {
  const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
  const n = Math.max(2, Math.round(len / step));
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    const j = (rand(seed + i * 1.7) - 0.5) * 2 * amp;
    d += ` L ${(x1 + (x2 - x1) * t + nx * j).toFixed(1)} ${(y1 + (y2 - y1) * t + ny * j).toFixed(1)}`;
  }
  return d;
};

/** 분필로 칠한 막대 — 위아래로 오가는 빗금. */
export const scribble = (x: number, y: number, len: number, h: number, seed: number, pitch = 13): string => {
  const n = Math.max(1, Math.floor(len / pitch));
  let d = `M ${x} ${y + h}`;
  for (let i = 0; i < n; i += 1) {
    const px = x + i * pitch;
    const j = (rand(seed + i) - 0.5) * 4;
    d += ` L ${(px + pitch * 0.46 + j).toFixed(1)} ${(y + rand(seed + i * 3.1) * 4).toFixed(1)} L ${(px + pitch + j).toFixed(1)} ${(y + h - rand(seed + i * 5.3) * 4).toFixed(1)}`;
  }
  return d;
};

/** 선이 그어지는 진행(0~1) — path·ellipse 에 펼쳐 넣는다. 시작 전에는 점도 찍히지 않게 숨긴다. */
export const draw = (p: number) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - clamp01(p), opacity: p > 0 ? 1 : 0 });

/** 글이 왼쪽부터 써지는 진행(0~1). */
export const writeOn = (p: number): CSSProperties => ({ clipPath: `inset(-14% ${((1 - clamp01(p)) * 100).toFixed(1)}% -22% -2%)` });

/** 손글씨(개구)의 너비 어림 — 앱 글꼴보다 좁다. */
export const handWidth = (text: string, size: number): number => textWidth(text, size) * 0.86;

/** 손글씨가 너비에 들 때까지 줄인다(하한까지). */
export const fitHand = (text: string, size: number, maxWidth: number, min: number): number => {
  let s = size;
  while (s > min && handWidth(text, s) > maxWidth) s -= 2;
  return Math.max(min, s);
};

/** 장면 머리 제목의 글씨·줄 — 두 줄까지는 기본 크기, 길면 줄인다(원고 한도 32자까지 세 줄 안). */
export const chalkHeading = (title: string) => {
  let size = 116;
  let lines = titleLines(title, size, 900);
  if (lines.length > 2) {
    size = 96;
    lines = titleLines(title, size, 900);
  }
  if (lines.length > 3) {
    size = 80;
    lines = titleLines(title, size, 900);
  }
  const lineH = Math.round(size * 1.1);
  return { size, lineH, lines: lines.map((l) => l.join(' ')), bottom: CHALK_AREA.headTop + lines.length * lineH };
};

/** 표지·마무리의 큰 제목 — 세 줄까지는 132, 넘으면 줄인다. */
export const chalkTitle = (title: string, width: number) => {
  let size = 132;
  let lines = titleLines(title, size, width);
  if (lines.length > 3) {
    size = 108;
    lines = titleLines(title, size, width);
  }
  return { size, lineH: Math.round(size * 1.14), lines: lines.map((l) => l.join(' ')) };
};

export const CHALK_NOTE = { size: 36, lineH: 50, footSize: 32, footLineH: 44 } as const;

/** 아래 덧말(장면 덧말 + 값마다 서버가 단 덧말)의 줄과 자리 — 분필 받침 위에서부터 쌓는다. */
export const chalkNoteLayout = (note: string | null, foots: readonly string[]) => {
  const noteLines = note ? wrapText(`※ ${note}`, CHALK_NOTE.size, 880) : [];
  const footLines = foots.flatMap((d) => wrapText(`※ ${d}`, CHALK_NOTE.footSize, 880));
  const h = noteLines.length * CHALK_NOTE.lineH + footLines.length * CHALK_NOTE.footLineH + (noteLines.length && footLines.length ? 10 : 0);
  return { noteLines, footLines, h, top: CHALK_AREA.noteBottom - h };
};
export type ChalkNoteLayout = ReturnType<typeof chalkNoteLayout>;
