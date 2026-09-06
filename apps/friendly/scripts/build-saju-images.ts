// 사주 이미지 빌드 — 제미나이 원본(assets-src/saju/raw/<id>.png|jpg|webp) → 1:1 중앙 크롭 → webp 1024/512
// → apps/web/public/saju-c/images/. 일간 10장(stem-*) + 띠 12장(branch-*). id 의 단일 출처는 @repo/utils sajuImages.ts.
//
// 실행: pnpm --filter friendly build:saju-images [--src=<dir>] [--out=<dir>] [--only=stem-gap,branch-rat]
//        [--quality=82] [--placeholders]
//   --placeholders   원본이 없는 id 는 한자 한 글자 + 오행색의 임시 이미지를 만든다(2차 개발용).
// 산출물 목록·누락은 manifest.json 과 콘솔에 남긴다. 원본 디렉터리는 gitignore, 산출물은 커밋.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SAJU_IMAGE_IDS, SAJU_IMAGE_SIZES, sajuImageMeta } from '@repo/utils';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SRC = path.resolve(REPO_ROOT, opt('src', 'assets-src/saju/raw'));
const OUT = path.resolve(REPO_ROOT, opt('out', 'apps/web/public/saju-c/images'));
const QUALITY = Number(opt('quality', '82'));
const ONLY = new Set(opt('only', '').split(',').map((s) => s.trim()).filter(Boolean));
const PLACEHOLDERS = args.includes('--placeholders');
const FULL = 1024;
const EXTS = ['png', 'jpg', 'jpeg', 'webp'];

interface ManifestEntry {
  placeholder: boolean;
  source: string | null;
  builtAt: string;
}
interface Manifest {
  generatedAt: string;
  sizes: readonly number[];
  images: Record<string, ManifestEntry>;
  missing: string[];
}

const findSource = (id: string): string | null =>
  EXTS.map((e) => path.join(SRC, `${id}.${e}`)).find((p) => existsSync(p)) ?? null;

// 1:1 중앙 크롭 → 1024 PNG.
const cropSquare = async (file: string): Promise<Buffer> => {
  const img = sharp(file);
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error(`${file}: 크기를 읽지 못함`);
  const side = Math.min(w, h);
  return img
    .extract({ left: Math.floor((w - side) / 2), top: Math.floor((h - side) / 2), width: side, height: side })
    .resize(FULL, FULL, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
};

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 임시 이미지 — 흑요석 바탕 + 금선 원 + 한자 한 글자(오행색) + 한글 이름.
const placeholderSvg = (id: string): string => {
  const m = sajuImageMeta(id);
  const hanja = m?.hanja ?? '?';
  const ko = m?.ko ?? id;
  const color = m?.colorHex ?? '#d9b65b';
  const korean = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
  const serif = "'Batang','Noto Serif KR','Noto Serif CJK KR',serif";
  const s = FULL;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#1a1a22"/><stop offset="1" stop-color="#07070a"/></radialGradient></defs>
  <rect width="${s}" height="${s}" fill="url(#g)"/>
  <circle cx="${s / 2}" cy="${s / 2}" r="440" fill="none" stroke="#d9b65b" stroke-width="5" opacity="0.8"/>
  <circle cx="${s / 2}" cy="${s / 2}" r="400" fill="none" stroke="#d9b65b" stroke-width="2" opacity="0.4" stroke-dasharray="6 14"/>
  <text x="${s / 2}" y="${s / 2 + 110}" font-size="360" text-anchor="middle" fill="${color}" font-family="${serif}">${esc(hanja)}</text>
  <text x="${s / 2}" y="${s - 170}" font-size="72" font-weight="700" text-anchor="middle" fill="#efe6d3" font-family="${korean}">${esc(ko)}</text>
  <text x="${s / 2}" y="${s - 90}" font-size="30" letter-spacing="6" text-anchor="middle" fill="#6f6a5a" font-family="sans-serif">PLACEHOLDER</text>
</svg>`;
};

const writeSizes = async (id: string, base: Buffer): Promise<void> => {
  for (const size of SAJU_IMAGE_SIZES) {
    await sharp(base).resize(size, size, { kernel: 'lanczos3' }).webp({ quality: QUALITY, effort: 5 }).toFile(path.join(OUT, `${id}-${size}.webp`));
  }
};

const loadManifest = (): Manifest => {
  const p = path.join(OUT, 'manifest.json');
  if (!existsSync(p)) return { generatedAt: '', sizes: SAJU_IMAGE_SIZES, images: {}, missing: [] };
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Manifest;
  } catch {
    return { generatedAt: '', sizes: SAJU_IMAGE_SIZES, images: {}, missing: [] };
  }
};

const main = async (): Promise<void> => {
  mkdirSync(OUT, { recursive: true });
  const manifest = loadManifest();
  const ids = SAJU_IMAGE_IDS.filter((id) => ONLY.size === 0 || ONLY.has(id));
  let built = 0;
  let placeholders = 0;
  const missing: string[] = [];
  const now = new Date().toISOString();
  for (const id of ids) {
    const src = findSource(id);
    if (src) {
      await writeSizes(id, await cropSquare(src));
      manifest.images[id] = { placeholder: false, source: path.relative(REPO_ROOT, src), builtAt: now };
      built++;
      console.log(`✓ ${id}  ← ${path.basename(src)}`);
      continue;
    }
    if (PLACEHOLDERS) {
      await writeSizes(id, await sharp(Buffer.from(placeholderSvg(id))).png().toBuffer());
      manifest.images[id] = { placeholder: true, source: null, builtAt: now };
      placeholders++;
      console.log(`· ${id}  (placeholder)`);
      continue;
    }
    missing.push(id);
  }
  manifest.missing = SAJU_IMAGE_IDS.filter((id) => !manifest.images[id] || missing.includes(id));
  manifest.generatedAt = now;
  manifest.sizes = SAJU_IMAGE_SIZES;
  writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const realTotal = Object.values(manifest.images).filter((e) => !e.placeholder).length;
  console.log(
    `\n원본 ${SRC}\n산출 ${OUT}\n이번 실행: 실제 ${built} · placeholder ${placeholders} · 누락 ${missing.length}\n누적: 실제 이미지 ${realTotal}/${SAJU_IMAGE_IDS.length}` +
      (manifest.missing.length ? `\n아직 없는 이미지(${manifest.missing.length}): ${manifest.missing.join(', ')}` : '\n이미지 완성.'),
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
