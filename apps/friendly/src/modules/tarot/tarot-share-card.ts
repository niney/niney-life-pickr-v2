import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import type { SharedTarotReadingType, TarotShareImageFormatType } from '@repo/api-contract';
import { TAROT_TOPIC_LABEL, getTarotSpread, tarotCardImagePath } from '@repo/utils';
import { loadPlexFonts } from '../../lib/share-fonts.js';
import { candidateWebAssetRoots } from '../../lib/web-index.js';

// 타로 공유 이미지 — satori(레이아웃→SVG) + resvg(SVG→PNG). WebGL 캡처가 아니라 2D 합성이라
// 서버에서 결정적으로 나온다.
//   og    1200×630  링크 미리보기(카카오·트위터).
//   story 1080×1920 카톡·인스타 스토리에 붙이는 세로 이미지.
// 카드 그림은 웹 정적 자산(apps/web/{dist|public}/tarot/cards/<id>-512.webp)을 sharp 로 JPEG 로 바꿔
// data URI 로 넣는다(satori/resvg 는 webp 를 못 읽는다). 아직 생성되지 않은 카드는 이름 박스.

type Style = Record<string, unknown>;
interface Node {
  type: string;
  props: { style?: Style; children?: unknown; src?: string; width?: number; height?: number };
}

const h = (type: string, style: Style, children?: unknown, extra: Partial<Node['props']> = {}): Node => ({
  type,
  props: { style, ...(children === undefined ? {} : { children }), ...extra },
});

const C = {
  bg: '#070a1e',
  bg2: '#141c46',
  gold: '#d9b65b',
  ink: '#ece6d6',
  sub: 'rgba(236,230,214,0.62)',
  line: 'rgba(217,182,91,0.35)',
} as const;

const CARD_RATIO = 1756 / 1024;

// ── 카드 이미지 ─────────────────────────────────────────────────────────────

const imageCache = new Map<string, Promise<string | null>>();

async function findCardFile(cardId: string): Promise<string | null> {
  const rel = tarotCardImagePath(cardId, 512).replace(/^\//, '');
  for (const root of candidateWebAssetRoots()) {
    const p = resolve(root, rel);
    try {
      await readFile(p, { flag: 'r' });
      return p;
    } catch {
      // 다음 후보
    }
  }
  return null;
}

// 카드 앞면 → JPEG data URI(폭 360). 없으면 null(이름 박스로 대체).
export function cardImageDataUri(cardId: string): Promise<string | null> {
  let hit = imageCache.get(cardId);
  if (!hit) {
    hit = (async () => {
      const file = await findCardFile(cardId);
      if (!file) return null;
      const buf = await sharp(file).resize(360).jpeg({ quality: 82 }).toBuffer();
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    })().catch(() => null);
    imageCache.set(cardId, hit);
  }
  return hit;
}

// ── 조각 ─────────────────────────────────────────────────────────────────────

const cardNode = (
  card: SharedTarotReadingType['cards'][number],
  src: string | null,
  width: number,
  labelSize: number,
): Node => {
  const height = Math.round(width * CARD_RATIO);
  const image = src
    ? h('img', { width, height, borderRadius: Math.round(width * 0.06), ...(card.reversed ? { transform: 'rotate(180deg)' } : {}) }, undefined, {
        src,
        width,
        height,
      })
    : h(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width,
          height,
          borderRadius: Math.round(width * 0.06),
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: C.gold,
          backgroundColor: C.bg2,
          color: C.ink,
          fontSize: Math.round(width * 0.11),
          fontWeight: 700,
          textAlign: 'center',
        },
        card.nameKo,
      );
  return h(
    'div',
    { display: 'flex', flexDirection: 'column', alignItems: 'center', width },
    [
      h('div', { display: 'flex', fontSize: labelSize * 0.8, color: C.gold, marginBottom: 6 }, card.positionLabel),
      image,
      h(
        'div',
        { display: 'flex', marginTop: 8, fontSize: labelSize, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' },
        `${card.nameKo}${card.reversed ? ' · 역' : ''}`,
      ),
    ],
  );
};

const text = (content: string, style: Style): Node => h('div', { display: 'flex', ...style }, content);

// ── 레이아웃 ─────────────────────────────────────────────────────────────────

const SIZE: Record<TarotShareImageFormatType, { w: number; h: number }> = {
  og: { w: 1200, h: 630 },
  story: { w: 1080, h: 1920 },
};

async function buildTree(reading: SharedTarotReadingType, format: TarotShareImageFormatType): Promise<Node> {
  const spread = getTarotSpread(reading.spreadId);
  const title = `${spread?.nameKo ?? '타로'} · ${TAROT_TOPIC_LABEL[reading.topic]}`;
  const srcs = await Promise.all(reading.cards.map((c) => cardImageDataUri(c.cardId)));
  const n = reading.cards.length;
  const { w, h: hh } = SIZE[format];

  const frame = (children: unknown, style: Style = {}): Node =>
    h(
      'div',
      {
        display: 'flex',
        width: w,
        height: hh,
        backgroundColor: C.bg,
        backgroundImage: `radial-gradient(circle at 30% 20%, ${C.bg2} 0%, ${C.bg} 60%)`,
        color: C.ink,
        fontFamily: 'Plex',
        ...style,
      },
      children,
    );

  if (format === 'og') {
    const cardW = n === 1 ? 250 : n <= 3 ? 170 : 110;
    const gap = n <= 3 ? 18 : 10;
    const cardsW = cardW * n + gap * (n - 1);
    const textW = w - 56 * 2 - cardsW - 44;
    return frame(
      [
        h(
          'div',
          { display: 'flex', flexDirection: 'row', alignItems: 'center', gap, flexShrink: 0, width: cardsW },
          reading.cards.map((c, i) => cardNode(c, srcs[i] ?? null, cardW, 20)),
        ),
        h(
          'div',
          { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: textW, marginLeft: 44 },
          [
            text(title, { fontSize: 24, color: C.gold, letterSpacing: 1, width: textW }),
            text(reading.keyword, { fontSize: 60, fontWeight: 700, color: '#f3e9c6', marginTop: 10, lineClamp: 1, width: textW }),
            text(reading.summary, { fontSize: 25, lineHeight: 1.5, color: C.ink, marginTop: 18, lineClamp: 4, width: textW }),
            reading.question
              ? text(`“${reading.question}”`, { fontSize: 20, color: C.sub, marginTop: 18, lineClamp: 1, width: textW })
              : text('Life Pickr · 타로', { fontSize: 20, color: C.sub, marginTop: 18, width: textW }),
          ],
        ),
      ],
      { flexDirection: 'row', alignItems: 'center', padding: 56 },
    );
  }

  // 세로 — 카드는 한 줄에 다 들어가게 폭을 나눠 갖고, 문단은 명시 폭(가운데 정렬 텍스트가 shrink-to-fit
  // 으로 줄바꿈 폭과 렌더 폭이 어긋나 겹치던 것을 막는다).
  const PAD = 72;
  const GAP = 26;
  const inner = w - PAD * 2;
  const cardW = Math.min(n === 1 ? 460 : 300, Math.floor((inner - (n - 1) * GAP) / n));
  const para = (content: string, style: Style): Node =>
    h('div', { display: 'flex', width: inner, justifyContent: 'center', ...style }, content);
  return frame(
    [
      text('Life Pickr · 타로', { fontSize: 30, color: C.sub, letterSpacing: 2 }),
      text(title, { fontSize: 38, color: C.gold, marginTop: 10 }),
      reading.question ? para(`“${reading.question}”`, { fontSize: 32, color: C.ink, marginTop: 22, lineClamp: 2, textAlign: 'center' }) : null,
      h(
        'div',
        { display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: GAP, marginTop: 44, width: inner },
        reading.cards.map((c, i) => cardNode(c, srcs[i] ?? null, cardW, n > 3 ? 22 : 30)),
      ),
      para(reading.keyword, { fontSize: 78, fontWeight: 700, color: '#f3e9c6', marginTop: 54, lineClamp: 1, textAlign: 'center' }),
      h('div', { display: 'flex', width: 120, height: 3, backgroundColor: C.gold, marginTop: 26, marginBottom: 26 }),
      para(reading.summary, { fontSize: 34, lineHeight: 1.55, color: C.ink, lineClamp: 6, textAlign: 'center' }),
      para(reading.advice, { fontSize: 30, lineHeight: 1.5, color: C.sub, marginTop: 30, lineClamp: 4, textAlign: 'center' }),
    ].filter((x): x is Node => x !== null),
    { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: PAD },
  );
}

export async function renderTarotShareCardPng(
  reading: SharedTarotReadingType,
  format: TarotShareImageFormatType,
): Promise<Buffer> {
  const { regular, bold } = await loadPlexFonts();
  const node = await buildTree(reading, format);
  const { w, h: hh } = SIZE[format];
  const svg = await satori(node as never, {
    width: w,
    height: hh,
    fonts: [
      { name: 'Plex', data: regular, weight: 400, style: 'normal' },
      { name: 'Plex', data: bold, weight: 700, style: 'normal' },
    ],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: w }, background: C.bg });
  return Buffer.from(resvg.render().asPng());
}
