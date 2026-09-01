// 메뉴 칼로리 판정 엔진 — 인덱스·어휘를 들고 메뉴명을 동기로 판정한다.
//
// 사용: const engine = new MenuNutritionEngine(await loadCatalogIndex(prisma)); engine.resolve('항정살 150g')
// DB·LLM·웹 의존이 없어 골든셋 수천 건을 밀리초에 돌린다. LLM·웹 계층은 이 엔진 **뒤**에 있고,
// LLM 이 준 표준명은 다시 이 엔진에 넣어 판정한다(등급 규칙이 한 곳에만 있도록).

import type { CatalogIndex } from './catalog-index.js';
import { DEFAULT_LEXICON, type Lexicon } from './lexicon.js';
import { resolveMenuName, type MenuKcalResult } from './resolve.js';

export class MenuNutritionEngine {
  constructor(
    private index: CatalogIndex,
    private lexicon: Lexicon = DEFAULT_LEXICON,
  ) {}

  get catalogSize(): number {
    return this.index.size;
  }

  /** 카탈로그 적재 뒤 인덱스를 바꿔 끼운다. */
  replaceIndex(index: CatalogIndex): void {
    this.index = index;
  }

  /** 어휘(DB 편집) 갱신. */
  replaceLexicon(lexicon: Lexicon): void {
    this.lexicon = lexicon;
  }

  resolve(name: string): MenuKcalResult {
    return resolveMenuName(name, this.index, this.lexicon);
  }

  /** 같은 이름은 한 번만 판정한다. */
  resolveMany(names: string[]): Map<string, MenuKcalResult> {
    const out = new Map<string, MenuKcalResult>();
    for (const name of names) {
      if (out.has(name)) continue;
      out.set(name, this.resolve(name));
    }
    return out;
  }
}
