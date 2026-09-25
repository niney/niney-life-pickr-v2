import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Font, SatoriOptions } from 'satori';

// satori 공유 이미지용 한글 폰트(IBM Plex Sans KR Regular/Bold, apps/friendly/assets/fonts).
// satori 는 시스템 폰트를 못 쓰므로 ttf 버퍼를 명시 주입한다. settlement-card 와 같은 탐색
// 전략(dev src / prod dist 모두 커버) — 프로세스 수명 동안 1회 로드.
//
// 한자: Plex 에는 한자가 없어 LLM 본문 속 한자(正官·比肩 등)가 □로 나왔다. satori 가 글꼴에 없는 글자
// 묶음을 loadAdditionalAsset 으로 물을 때만 한자 글꼴을 보탠다(한자 없는 카드는 불러오지도 않는다).
// NotoSansKR-Hanja-Regular.otf = Noto Sans CJK KR(OFL, notofonts/noto-cjk Sans/SubsetOTF/KR 의
// NotoSansKR-Regular.otf)에서 한자 8,651자만 남긴 서브셋(1.9MB). 다시 만들 때(fonttools):
//   pyftsubset NotoSansKR-Regular.otf --unicodes="U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+20000-2FFFF" \
//     --output-file=NotoSansKR-Hanja-Regular.otf --layout-features='' --no-hinting \
//     --name-IDs='*' --name-languages='*' --notdef-outline

const __dirname = dirname(fileURLToPath(import.meta.url));

function fontCandidates(file: string): string[] {
  const seen = new Set<string>();
  for (const base of [__dirname, process.cwd()]) {
    let cur = base;
    for (let i = 0; i < 7; i += 1) {
      seen.add(resolve(cur, 'apps/friendly/assets/fonts', file));
      seen.add(resolve(cur, 'assets/fonts', file));
      const up = dirname(cur);
      if (up === cur) break;
      cur = up;
    }
  }
  return [...seen];
}

async function readFirst(file: string): Promise<Buffer> {
  const tried = fontCandidates(file);
  for (const p of tried) {
    try {
      return await readFile(p);
    } catch {
      // 다음 후보
    }
  }
  throw new Error(`폰트를 찾지 못함: ${file} (tried ${tried.length} paths)`);
}

export interface PlexFonts {
  regular: Buffer;
  bold: Buffer;
}

let fontsPromise: Promise<PlexFonts> | null = null;
export function loadPlexFonts(): Promise<PlexFonts> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      readFirst('IBMPlexSansKR-Regular.ttf'),
      readFirst('IBMPlexSansKR-Bold.ttf'),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return fontsPromise;
}

let shareFontsPromise: Promise<Font[]> | null = null;
/**
 * satori `fonts` — 늘 같은 배열을 돌려준다. satori 는 파싱한 글꼴을 이 배열을 키로 캐시하므로(WeakMap)
 * 호출마다 새 배열을 넘기면 Plex 를 매번 다시 파싱한다. 한자 글꼴도 한 번 보태지면 이 캐시에 남는다.
 */
export function loadShareFonts(): Promise<Font[]> {
  if (!shareFontsPromise) {
    shareFontsPromise = loadPlexFonts().then(({ regular, bold }) => [
      { name: 'Plex', data: regular, weight: 400, style: 'normal' },
      { name: 'Plex', data: bold, weight: 700, style: 'normal' },
    ]);
  }
  return shareFontsPromise;
}

// CJK 통합 한자(확장 A 포함)·호환 한자·보조 평면(확장 B~, 서로게이트 쌍).
const HAN = /[㐀-䶿一-鿿豈-﫿]|[\ud840-\ud87f][\udc00-\udfff]/;

let hanjaPromise: Promise<Buffer | null> | null = null;

/**
 * satori `loadAdditionalAsset` — 글꼴에 없는 글자 묶음에 한자가 있으면 한자 글꼴을 보탠다. 그 밖(이모지 등)은
 * 그대로 둔다. 글꼴 파일을 못 찾으면 카드는 그리고(한자만 □) 이유는 남긴다.
 */
export const loadShareFallbackAsset: NonNullable<SatoriOptions['loadAdditionalAsset']> = async (_code, segment) => {
  if (!HAN.test(segment)) return [];
  if (!hanjaPromise) {
    hanjaPromise = readFirst('NotoSansKR-Hanja-Regular.otf').catch((err: unknown) => {
      console.warn('[share-fonts] 한자 글꼴을 불러오지 못함 — 한자가 □로 그려진다', err);
      return null;
    });
  }
  const data = await hanjaPromise;
  return data ? [{ name: 'NotoSansKRHanja', data, weight: 400, style: 'normal' }] : [];
};
