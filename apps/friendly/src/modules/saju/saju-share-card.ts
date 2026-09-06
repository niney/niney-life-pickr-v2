import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import type { SharedSajuReadingType } from '@repo/api-contract';
import { SAJU_WUXING_META, sajuImagePath, sajuStemImageId } from '@repo/utils';
import { loadPlexFonts } from '../../lib/share-fonts.js';
import { candidateWebAssetRoots } from '../../lib/web-index.js';

// 사주 공유 이미지 — satori + resvg 2D 합성(타로와 같은 파이프라인). 팔레트는 먹·한지·주사·금.
//   og    1200×630  일간 이미지 + 8글자 인장 + 한 줄 별칭 + 성격 요약.
//   story 1080×1920 세로.
// 일간 이미지는 웹 정적 자산(apps/web/{dist|public}/saju/images/stem-*-512.webp)을 JPEG data URI 로.

type Style = Record<string, unknown>;
interface Node {
  type: string;
  props: { style?: Style; children?: unknown; src?: string; width?: number; height?: number };
}
const h = (type: string, style: Style, children?: unknown, extra: Partial<Node['props']> = {}): Node => ({
  type,
  props: { style, ...(children === undefined ? {} : { children }), ...extra },
});
const text = (content: string, style: Style): Node => h('div', { display: 'flex', ...style }, content);

const C = { bg: '#0b0b0f', bg2: '#1c1a22', gold: '#d9b65b', jusa: '#b8322a', ink: '#e9e2d2', sub: 'rgba(233,226,210,0.62)' } as const;
const WUXING_HEX: Record<string, string> = { wood: '#5fc39b', fire: '#ff6b4a', earth: '#e0b45a', metal: '#f0efe6', water: '#6f95d6' };

// 한자 글리프 PNG(assets/saju-glyphs, build:saju-glyphs) — Plex 에 한자가 없어 이미지로 그린다.
const glyphDir = (): string[] => {
  const here = dirname(fileURLToPath(import.meta.url));
  const out: string[] = [];
  for (const base of [here, process.cwd()]) {
    let cur = base;
    for (let i = 0; i < 7; i += 1) {
      out.push(resolve(cur, 'apps/friendly/assets/saju-glyphs'), resolve(cur, 'assets/saju-glyphs'));
      const up = dirname(cur);
      if (up === cur) break;
      cur = up;
    }
  }
  return out;
};
const glyphCache = new Map<string, Promise<string | null>>();
const glyphDataUri = (ch: string, variant: '' | '-hanji' | '-gold' = ''): Promise<string | null> => {
  const key = ch + variant;
  let hit = glyphCache.get(key);
  if (!hit) {
    hit = (async () => {
      const file = 'u' + ch.codePointAt(0)!.toString(16) + variant + '.png';
      for (const dir of glyphDir()) {
        try {
          const buf = await readFile(resolve(dir, file));
          return 'data:image/png;base64,' + buf.toString('base64');
        } catch {
          // 다음 후보
        }
      }
      return null;
    })().catch(() => null);
    glyphCache.set(key, hit);
  }
  return hit;
};

const imageCache = new Map<number, Promise<string | null>>();
const dayMasterDataUri = (stem: number): Promise<string | null> => {
  let hit = imageCache.get(stem);
  if (!hit) {
    hit = (async () => {
      const rel = sajuImagePath(sajuStemImageId(stem), 512).replace(/^\//, '');
      for (const root of candidateWebAssetRoots()) {
        try {
          const buf = await sharp(resolve(root, rel)).resize(420).jpeg({ quality: 82 }).toBuffer();
          return `data:image/jpeg;base64,${buf.toString('base64')}`;
        } catch {
          // 다음 후보
        }
      }
      return null;
    })().catch(() => null);
    imageCache.set(stem, hit);
  }
  return hit;
};

// 인장 하나 — 주사 바탕 + 금 테두리 + 한자(글리프 이미지, 없으면 글자 그대로).
const seal = (hanja: string, glyph: string | null, size: number, accent: boolean): Node =>
  h(
    'div',
    {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.12),
      backgroundColor: accent ? '#c93a2f' : C.jusa,
      borderWidth: accent ? 4 : 3,
      borderStyle: 'solid',
      borderColor: C.gold,
      color: '#f7eddc',
      fontSize: Math.round(size * 0.58),
      fontWeight: 700,
    },
    glyph ? h('img', { width: Math.round(size * 0.8), height: Math.round(size * 0.8) }, undefined, { src: glyph, width: Math.round(size * 0.8), height: Math.round(size * 0.8) }) : hanja,
  );

const pillarsNode = (reading: SharedSajuReadingType, glyphs: Map<string, string | null>, size: number, gap: number): Node => {
  const p = reading.chart.pillars;
  const cols = [p.year, p.month, p.day, ...(p.hour ? [p.hour] : [])];
  const labels = ['년', '월', '일', '시'];
  return h(
    'div',
    { display: 'flex', flexDirection: 'row', gap },
    cols.map((c, i) =>
      h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: Math.round(gap * 0.6) }, [
        text(labels[i] ?? '', { fontSize: Math.round(size * 0.22), color: C.gold }),
        seal(c.hanja.charAt(0), glyphs.get(c.hanja.charAt(0)) ?? null, size, c.key === 'day'),
        seal(c.hanja.charAt(1), glyphs.get(c.hanja.charAt(1)) ?? null, size, false),
      ]),
    ),
  );
};

const SIZE = { og: { w: 1200, h: 630 }, story: { w: 1080, h: 1920 } } as const;

async function buildTree(reading: SharedSajuReadingType, format: 'og' | 'story'): Promise<{ node: Node; graphemeImages: Record<string, string> }> {
  const c = reading.chart;
  const src = await dayMasterDataUri(c.dayMaster.index);
  const chars = [...new Set([c.pillars.year, c.pillars.month, c.pillars.day, c.pillars.hour].flatMap((p) => (p ? [...p.hanja] : [])).concat([...c.dayMaster.hanja]))];
  const glyphs = new Map<string, string | null>(await Promise.all(chars.map(async (ch) => [ch, await glyphDataUri(ch)] as const)));
  // 본문 텍스트 속 한자(제목의 일간 한자)는 satori graphemeImages 로 — 한지색 판.
  const graphemeImages: Record<string, string> = {};
  for (const ch of [...c.dayMaster.hanja]) {
    const g = await glyphDataUri(ch, '-gold');
    if (g) graphemeImages[ch] = g;
  }
  const { w, h: hh } = SIZE[format];
  const title = `${c.dayMaster.ko}${c.dayMaster.hanja} 일간 · ${c.zodiac.animal}띠 · ${SAJU_WUXING_META[c.dayMaster.element].ko}의 기운`;
  const headline = reading.sections.personality.headline || reading.sections.advice.keyword;
  const frame = (children: unknown, style: Style = {}): Node =>
    h('div', { display: 'flex', width: w, height: hh, backgroundColor: C.bg, backgroundImage: `radial-gradient(circle at 20% 15%, ${C.bg2} 0%, ${C.bg} 60%)`, color: C.ink, fontFamily: 'Plex', ...style }, children);
  const portrait = (size: number): Node =>
    src
      ? h('img', { width: size, height: size, borderRadius: size / 2, borderWidth: 4, borderStyle: 'solid', borderColor: C.gold }, undefined, { src, width: size, height: size })
      : h('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: size / 2, borderWidth: 4, borderStyle: 'solid', borderColor: C.gold, backgroundColor: C.bg2, color: WUXING_HEX[c.dayMaster.element] ?? C.ink, fontSize: Math.round(size * 0.5), fontWeight: 700 }, c.dayMaster.hanja);

  if (format === 'og') {
    const textW = w - 56 * 2 - 260 - 40;
    return { graphemeImages, node: frame(
      [
        h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: 260, flexShrink: 0 }, [portrait(220), pillarsNode(reading, glyphs, 46, 8)]),
        h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: textW, marginLeft: 40 }, [
          text(title, { fontSize: 24, color: C.gold, letterSpacing: 1, width: textW }),
          text(headline, { fontSize: 54, fontWeight: 700, color: '#f3e9c6', marginTop: 10, lineClamp: 1, width: textW }),
          text(reading.sections.personality.body, { fontSize: 24, lineHeight: 1.5, color: C.ink, marginTop: 18, lineClamp: 4, width: textW }),
          text('Life Pickr · 사주', { fontSize: 20, color: C.sub, marginTop: 18, width: textW }),
        ]),
      ],
      { flexDirection: 'row', alignItems: 'center', padding: 56 },
    ) };
  }
  const PAD = 72;
  const inner = w - PAD * 2;
  const para = (content: string, style: Style): Node => h('div', { display: 'flex', width: inner, justifyContent: 'center', ...style }, content);
  return { graphemeImages, node: frame(
    [
      text('Life Pickr · 사주', { fontSize: 30, color: C.sub, letterSpacing: 2 }),
      text(title, { fontSize: 36, color: C.gold, marginTop: 10 }),
      h('div', { display: 'flex', marginTop: 40 }, portrait(420)),
      h('div', { display: 'flex', marginTop: 40 }, pillarsNode(reading, glyphs, 96, 16)),
      para(headline, { fontSize: 74, fontWeight: 700, color: '#f3e9c6', marginTop: 54, lineClamp: 1, textAlign: 'center' }),
      h('div', { display: 'flex', width: 120, height: 3, backgroundColor: C.gold, marginTop: 26, marginBottom: 26 }),
      para(reading.sections.personality.body, { fontSize: 33, lineHeight: 1.55, color: C.ink, lineClamp: 6, textAlign: 'center' }),
      para(reading.sections.advice.body, { fontSize: 29, lineHeight: 1.5, color: C.sub, marginTop: 30, lineClamp: 4, textAlign: 'center' }),
    ],
    { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: PAD },
  ) };
}

export async function renderSajuShareCardPng(reading: SharedSajuReadingType, format: 'og' | 'story'): Promise<Buffer> {
  const { regular, bold } = await loadPlexFonts();
  const { node, graphemeImages } = await buildTree(reading, format);
  const { w, h: hh } = SIZE[format];
  const svg = await satori(node as never, {
    width: w,
    height: hh,
    graphemeImages,
    fonts: [
      { name: 'Plex', data: regular, weight: 400, style: 'normal' },
      { name: 'Plex', data: bold, weight: 700, style: 'normal' },
    ],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: w }, background: C.bg });
  return Buffer.from(resvg.render().asPng());
}
