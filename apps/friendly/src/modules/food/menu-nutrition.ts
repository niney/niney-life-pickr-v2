// 식당 메뉴명 → 카탈로그 열량 표시 판정 — 엔진(./engine) 의 호환 파사드.
//
// 판정 로직·어휘·인덱스는 전부 ./engine 에 있다(순수·동기). 이 파일은 (1) 기존 import 경로를 유지하는
// re-export 와 (2) Prisma 로 인덱스를 만들어 들고 있는 비동기 어댑터 MenuNutritionResolver 만 남긴다.
// 인덱스·어휘(DB menu_lexicon)는 INDEX_TTL_MS 마다 다시 읽는다(카탈로그 적재는 월 1회, 어휘 편집은 어드민 수동).

import type { PrismaClient } from '@prisma/client';
import { MenuNutritionEngine, loadCatalogIndex, loadLexicon, type MenuKcalResult } from './engine/index.js';

export * from './engine/index.js';

const INDEX_TTL_MS = 10 * 60 * 1000;

export class MenuNutritionResolver {
  private engine: MenuNutritionEngine | null = null;
  private loadedAt = 0;
  private loading: Promise<MenuNutritionEngine> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  /** 인덱스를 (필요하면 다시) 읽어 엔진을 돌려준다. 동시 호출은 한 번만 읽는다. */
  async getEngine(): Promise<MenuNutritionEngine> {
    const fresh = this.engine && Date.now() - this.loadedAt < INDEX_TTL_MS;
    if (fresh) return this.engine!;
    if (!this.loading) {
      this.loading = (async () => {
        const lexicon = await loadLexicon(this.prisma);
        const index = await loadCatalogIndex(this.prisma, lexicon.extraAliases);
        if (this.engine) {
          this.engine.replaceLexicon(lexicon);
          this.engine.replaceIndex(index);
        } else this.engine = new MenuNutritionEngine(index, lexicon);
        this.loadedAt = Date.now();
        return this.engine;
      })().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  /** 카탈로그 적재 직후 호출 — 다음 판정에서 새 인덱스를 읽는다. */
  invalidate(): void {
    this.loadedAt = 0;
  }

  async resolve(name: string): Promise<MenuKcalResult> {
    return (await this.getEngine()).resolve(name);
  }

  async resolveMany(names: string[]): Promise<Map<string, MenuKcalResult>> {
    return (await this.getEngine()).resolveMany(names);
  }
}
