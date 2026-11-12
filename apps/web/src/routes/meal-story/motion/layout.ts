import { TYPE } from './theme';

// 장면들이 함께 쓰는 자리·글 배치 계산(컴포넌트 없음 — 테스트하기 쉽고, 빠른 새로고침이 컴포넌트 파일만 다시 그리게).

/** 아래쪽 주제색 무대의 자리(1080×1920 화면 기준). */
export const PANEL = { x: 40, y: 600, w: 1000, h: 1270, r: 56 } as const;

/** 장면 머리 제목(Stage Heading)의 자리·크기. */
export const HEADING = { top: 214, left: 84, size: 108, width: 900 } as const;

// 두 줄이 될 제목은 줄 길이가 고르게 끊는다('하루 나트륨, / 이보다 적게' — 마지막 낱말만 떨어지지 않게).
// 글자 수로 어림한다(한글 1, 그 밖 0.6).
export const textUnits = (w: string): number => [...w].reduce((s, ch) => s + (/[가-힣]/.test(ch) ? 1 : 0.6), 0);

/** 글 너비 어림(px) — 쪽지 크기 맞추기. 한글 0.95em, 숫자·영문 0.58em, 빈칸·문장부호 0.3em. */
export const textWidth = (text: string, size: number): number =>
  [...text].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 0.95 : /[0-9A-Za-z%]/.test(ch) ? 0.58 : 0.3), 0) * size;

const lineUnits = (words: string[]): number => words.reduce((s, w) => s + textUnits(w), 0) + (words.length - 1) * 0.3;

/**
 * 낱말을 줄로 — 들어가는 가장 적은 줄 수에서, 가장 긴 줄이 가장 짧아지게 끊는다(줄 길이가 고르다).
 * 두 줄로 고르게 못 나누면(낱말 하나가 길다) 세 줄로 간다 — 예전엔 그럴 때 둘째 줄이 화면 밖으로 넘쳤다.
 * 한 낱말이 한 줄보다 길면 그 낱말만 한 줄에 둔다.
 */
export const balanceLines = (words: string[], maxPerLine: number): string[][] => {
  if (words.length < 2 || lineUnits(words) <= maxPerLine) return [words];
  const fits = (line: string[]) => line.length === 1 || lineUnits(line) <= maxPerLine;
  for (let n = 2; n < words.length; n += 1) {
    let best: string[][] | null = null;
    let bestWidest = Infinity;
    let bestSpread = Infinity;
    const walk = (from: number, left: number, lines: string[][]) => {
      if (left === 1) {
        const last = words.slice(from);
        if (!fits(last)) return;
        const all = [...lines, last];
        const widths = all.map(lineUnits);
        const widest = Math.max(...widths);
        // 가장 긴 줄이 같으면 줄 길이가 더 고른 쪽(제곱 합이 작은 쪽).
        const spread = widths.reduce((sum, w) => sum + w * w, 0);
        if (widest < bestWidest - 1e-9 || (Math.abs(widest - bestWidest) <= 1e-9 && spread < bestSpread)) {
          bestWidest = widest;
          bestSpread = spread;
          best = all;
        }
        return;
      }
      for (let to = from + 1; to <= words.length - (left - 1); to += 1) {
        const line = words.slice(from, to);
        if (!fits(line)) break;
        walk(to, left - 1, [...lines, line]);
      }
    };
    walk(0, n, []);
    if (best) return best;
  }
  return words.map((w) => [w]);
};

/** 키네틱 제목(KineticTitle)의 줄 — 그 아래에 놓을 글의 자리도 이 셈으로 잰다. */
export const titleLines = (text: string, size: number, width: number): string[][] =>
  balanceLines(text.split(/\s+/).filter(Boolean), width / (size * 0.98));

/** 키네틱 제목이 차지하는 높이(px) — 줄 높이 1.08, 줄 사이 0.02. */
export const titleHeight = (text: string, size: number, width: number): number => {
  const n = titleLines(text, size, width).length;
  return n * size * 1.08 + (n - 1) * size * 0.02;
};

/** 자리 k(0 = 일의 자리)의 띠 위치(0~10). */
export const odometerPosition = (value: number, k: number): number => {
  const place = 10 ** k;
  const v = Math.max(0, value);
  if (k === 0) return v % 10;
  const base = Math.floor(v / place) % 10;
  const below = v % place; // 아랫자리 값
  const carry = Math.min(1, Math.max(0, below - (place - 1))); // 아랫자리가 99…9 에서 넘어가는 마지막 한 칸
  return base + carry;
};

/**
 * 장면 머리 제목의 글씨 크기 — 두 줄까지는 기본 크기, 길어서 세 줄이 되면 한 단계씩 줄인다(제목 띠가 무대를 덮지 않게).
 * 원고 제목 한도(32자)까지 세 줄 안에 든다.
 */
export const headingSize = (title: string): number => {
  if (titleLines(title, HEADING.size, HEADING.width).length <= 2) return HEADING.size;
  return titleLines(title, 88, HEADING.width).length <= 3 ? 88 : 72;
};

/** 종이 제목 띠의 아래 끝(y) — 제목 아래 덧말 자리. */
export const headingBottom = (title: string): number =>
  HEADING.top + titleHeight(title, headingSize(title), HEADING.width) + 28;

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 글이 너비에 들 때까지 글씨를 줄인다(하한까지) — 이름표가 옆 쪽지와 겹치지 않게. */
export const fitSize = (text: string, size: number, maxWidth: number, min: number): number => {
  let s = size;
  while (s > min && textWidth(text, s) > maxWidth) s -= 2;
  return Math.max(min, s);
};

/** 줄 수를 넘는 글은 자르고 말줄임표 — 영상은 넘치는 글을 보여 줄 자리가 없다(점검 스크립트가 미리 알린다). */
export const clipLines = (lines: string[], max: number): string[] =>
  lines.length <= max ? lines : [...lines.slice(0, max - 1), `${lines[max - 1]!.replace(/[\s.,·]+$/, '')}…`];

/** 쪽지(kit Card)의 높이 — 줄 수 × 글씨 × 줄 높이 + 위아래 여백. 아래에서부터 자리를 잡을 때 쓴다. */
export const cardHeight = (lines: number, size: number, lineHeight = 1.32, padY = 18): number =>
  lines * size * lineHeight + padY * 2;

/**
 * 내 값 옆의 '기준 대비 %' 글 — 그 장면의 기준 숫자가 하나이고 내 기준과 같으면 그냥 '기준의 N%', 내 기준이 다르거나
 * (나이가 달라서) 기준 숫자가 여럿이면(남·여) '내 기준 X의 N%'로 어느 기준인지 밝힌다. 글로 보기와 영상이 같이 쓴다.
 * standards = 같은 장면의 (내 기록이 아닌) 기준 숫자들, amount = 형식을 갖춘 내 기준 글('30g'), 없으면 null.
 */
export const ownStandardText = (percent: number, own: number | null, amount: string | null, standards: readonly number[]): string =>
  own === null || amount === null || (standards.length === 1 && standards[0] === own) ? `기준의 ${percent}%` : `내 기준 ${amount}의 ${percent}%`;

/**
 * 막대 둘의 어림 쪽지 글 — 서버가 준 값 그대로: 작은 쪽에 '약 10분의 1', 강조한 큰 쪽에 '약 2배'. 글로 보기와 영상이 같이 쓴다.
 */
export const fractionText = (fraction: { denominator: number; multiple: boolean }): string =>
  fraction.multiple ? `약 ${fraction.denominator}배` : `약 ${fraction.denominator}분의 1`;

/** 무대 안에서 글·쪽지를 놓을 수 있는 아래 끝(y) — 무대 바닥(1870)에서 조금 안쪽. */
export const STAGE_BOTTOM = 1836;

/** 막대 값 쪽지의 폭 — 가장 긴 값 글(숫자 + 단위, 또는 값 없음)에 맞춘다. 모든 줄이 같은 폭이라 오른쪽이 가지런하다. */
export const barsPaperWidth = (texts: { number: string | null; unit: string }[], numSize: number): number =>
  Math.round(
    Math.max(
      numSize * 2.2,
      ...texts.map((t) => (t.number === null ? textWidth('값 없음', numSize * 0.6) : textWidth(t.number, numSize) * 1.06 + textWidth(t.unit, numSize * 0.5))),
    ) + 68,
  );

/** 막대 장면의 자리 — 띠 왼쪽 끝·길이, 첫 줄 위 끝, 덧말 글씨. */
export const BARS = { TRACK_X: 100, TRACK_W: 880, TOP: 690, NOTE_SIZE: 36 } as const;

/**
 * 막대 줄의 자리 — 줄 수(2~4)와 아래 쪽지(덧말·각주) 높이에 맞춰 줄 높이를 정하고, 줄이 넉넉하면(둘) 띠·숫자를 키운다.
 * 아래 쪽지는 무대 바닥에서부터 쌓고, 줄은 그 위 남는 자리를 나눠 쓴다(넷이어도 쪽지와 겹치지 않게).
 */
export const barsLayout = (bars: number, noteLines: number, footLines: number) => {
  const noteH = noteLines ? cardHeight(noteLines, BARS.NOTE_SIZE) : 0;
  const footH = footLines ? cardHeight(footLines, TYPE.foot) : 0;
  const blockH = noteH + footH + (noteH && footH ? 18 : 0);
  const noteTop = STAGE_BOTTOM - blockH;
  const rowH = clamp(((blockH ? noteTop - 34 : 1800) - BARS.TOP) / Math.max(1, bars), 190, 420);
  const labelSize = clamp(Math.round(rowH * 0.125), 36, 48);
  const barH = clamp(Math.round(rowH * 0.25), 54, 104);
  const numSize = clamp(Math.round(rowH * 0.24), 60, 100);
  return {
    rowH,
    labelSize,
    /** 줄 위 끝에서 띠 위 끝까지(이름표 높이 + 틈). */
    barTop: labelSize * 1.3 + 24 + 12,
    barH,
    numSize,
    paperH: Math.round(numSize * 1.48),
    noteTop,
    footTop: noteTop + noteH + (noteH ? 18 : 0),
  };
};

/** 줄 세우기 장면의 자리 — 종이 띠 왼쪽 끝·너비, 글·막대 왼쪽 끝, 값의 오른쪽 끝, 첫 줄 위 끝, 덧말 글씨. */
export const LINEUP = { X: 70, W: 940, TEXT_X: 226, RIGHT: 984, TOP: 690, NOTE_SIZE: 36 } as const;

/**
 * 줄 세우기 줄의 자리 — 줄 수(4~7)와 아래 쪽지(덧말·각주) 높이에 맞춰 줄 높이를 정한다. 줄 하나 = 이름 한 줄 + 가는 막대.
 * 잣대 쪽지(basis)가 있으면 첫 줄을 그만큼 내린다. 이름은 보조 글 하한(TYPE.sub), 값은 본문 하한 아래로 내리지 않는다 —
 * 가장 빽빽한 경우(일곱 줄 + 잣대 + 덧말 세 줄)에도 줄 높이 100 이 나온다.
 */
export const lineupLayout = (rows: number, hasBasis: boolean, noteLines: number, footLines: number) => {
  const noteH = noteLines ? cardHeight(noteLines, LINEUP.NOTE_SIZE) : 0;
  const footH = footLines ? cardHeight(footLines, TYPE.foot) : 0;
  const blockH = noteH + footH + (noteH && footH ? 18 : 0);
  const noteTop = STAGE_BOTTOM - blockH;
  const top = LINEUP.TOP + (hasBasis ? 84 : 0);
  const rowH = clamp(((blockH ? noteTop - 26 : 1806) - top) / Math.max(1, rows), 100, 232);
  const cardH = rowH - 16;
  const labelSize = clamp(Math.round(cardH * 0.3), TYPE.sub, 48);
  const barH = clamp(Math.round(cardH * 0.22), 20, 44);
  const gap = clamp(Math.round(cardH * 0.06), 2, 14);
  return {
    top,
    rowH,
    cardH,
    labelSize,
    barH,
    gap,
    /** 종이 띠 위 끝에서 이름 글줄 위 끝까지 — 이름 + 틈 + 막대 묶음을 띠 가운데에 둔다. */
    padY: Math.max(4, (cardH - (labelSize * 1.2 + gap + barH)) / 2),
    numSize: clamp(Math.round(cardH * 0.42), 44, 84),
    noteTop,
    footTop: noteTop + noteH + (noteH ? 18 : 0),
  };
};

/** 줄 세우기 값의 단위 글씨(숫자 크기의 배수) — 숫자의 절반, 숫자가 작아도 각주 하한(TYPE.foot) 아래로는 안 내린다. */
export const lineupUnitScale = (numSize: number): number => Math.max(0.5, TYPE.foot / numSize);

/** 줄 세우기 값 글의 폭 — 가장 긴 값(숫자 + 단위, 또는 값 없음). 막대는 그 왼쪽까지만 자란다. */
export const lineupValueWidth = (texts: { number: string | null; unit: string }[], numSize: number): number =>
  Math.round(
    Math.max(
      numSize * 1.6,
      ...texts.map((t) =>
        t.number === null
          ? textWidth('값 없음', Math.max(TYPE.sub, numSize * 0.6))
          : textWidth(t.number, numSize) * 1.06 + textWidth(t.unit, numSize * lineupUnitScale(numSize)) + 8,
      ),
    ),
  );

/** 서로 비슷한 값들인가 — 셋 이상이고 가장 큰 값이 가장 작은 값의 1.3배 안이면 그 둘(점선을 내릴 자리). 아니면 null. */
export const lineupBand = (values: readonly number[]): { min: number; max: number } | null => {
  if (values.length < 3) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min > 0 && max / min <= 1.3 ? { min, max } : null;
};

/** 글을 너비에 맞춰 줄로 — 낱말(빈칸) 단위로 앞에서부터 채운다(쪽지 크기 맞추기). */
export const wrapText = (text: string, size: number, maxWidth: number): string[] => {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(next, size) > maxWidth) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
};
