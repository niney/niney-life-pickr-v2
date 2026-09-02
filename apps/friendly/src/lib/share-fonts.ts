import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// satori 공유 이미지용 한글 폰트(IBM Plex Sans KR Regular/Bold, apps/friendly/assets/fonts).
// satori 는 시스템 폰트를 못 쓰므로 ttf 버퍼를 명시 주입한다. settlement-card 와 같은 탐색
// 전략(dev src / prod dist 모두 커버) — 프로세스 수명 동안 1회 로드.

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
