// 메뉴 칼로리 판정 엔진 어휘(menu_lexicon) 어드민 편집.
//
// 값이 아니라 어휘만 다루므로 잘못 넣어도 칼로리가 생기지 않는다 — 기껏해야 연결이 안 되거나 다른 행에
// 붙는다. 그래서 검증은 형식(종류별 target 필요 여부·중복)까지만 하고, 효과는 measure:menu-golden 으로 본다.

import type { PrismaClient } from '@prisma/client';
import {
  MENU_LEXICON_KINDS_WITH_TARGET,
  type MenuLexiconCreateInputType,
  type MenuLexiconEntryType,
  type MenuLexiconKindType,
  type MenuLexiconListResultType,
} from '@repo/api-contract';
import { normalizeTerm } from '../../lib/text.js';
import { DEFAULT_LEXICON_SOURCE } from './engine/lexicon.js';

export class MenuLexiconValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MenuLexiconValidationError';
  }
}

const toEntry = (r: {
  id: string;
  kind: string;
  term: string;
  target: string | null;
  note: string | null;
  active: boolean;
  createdAt: Date;
}): MenuLexiconEntryType => ({
  id: r.id,
  kind: r.kind as MenuLexiconKindType,
  term: r.term,
  target: r.target,
  note: r.note,
  active: r.active,
  createdAt: r.createdAt.toISOString(),
});

const defaultCounts = (): MenuLexiconListResultType['defaults'] => {
  const d = DEFAULT_LEXICON_SOURCE;
  return {
    modifier: d.leadingModifiers.length,
    size: d.sizeModifiers.length,
    synonym: d.synonymPairs.length,
    set: d.setWords.length,
    option: d.optionWords.length,
    suffix_block: d.suffixBlock.length,
    raw_suffix: d.rawSuffixes.length,
    quantifier: d.quantifierWords.length,
    alias: Object.values(d.extraAliases).reduce((a, v) => a + v.length, 0),
    portion: Object.keys(d.portionGrams).length,
  };
};

export class MenuLexiconService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(kind?: MenuLexiconKindType): Promise<MenuLexiconListResultType> {
    const rows = await this.prisma.menuLexicon.findMany({
      where: kind ? { kind } : {},
      orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }],
    });
    return { items: rows.map(toEntry), defaults: defaultCounts() };
  }

  async create(input: MenuLexiconCreateInputType): Promise<MenuLexiconEntryType> {
    const needsTarget = MENU_LEXICON_KINDS_WITH_TARGET.includes(input.kind);
    const target = input.target?.trim() || null;
    if (needsTarget && !target) throw new MenuLexiconValidationError(`${input.kind} 은 target 이 필요합니다`);
    if (!needsTarget && target) throw new MenuLexiconValidationError(`${input.kind} 은 target 을 받지 않습니다`);
    const term = input.term.trim();
    if (!normalizeTerm(term)) throw new MenuLexiconValidationError('term 이 비어 있습니다');
    if (input.kind === 'portion' && !(Number(target) > 0)) throw new MenuLexiconValidationError('portion 의 target 은 그램(양수)입니다');
    if (input.kind === 'alias') {
      const food = await this.prisma.foodItem.findFirst({
        where: { OR: [{ nameNorm: normalizeTerm(target!) }, { name: target! }], active: true },
        select: { name: true },
      });
      if (!food) throw new MenuLexiconValidationError(`카탈로그에 "${target}" 이(가) 없습니다`);
    }
    const dup = await this.prisma.menuLexicon.findFirst({ where: { kind: input.kind, term, target } });
    if (dup) throw new MenuLexiconValidationError('같은 항목이 이미 있습니다');
    const row = await this.prisma.menuLexicon.create({
      data: { kind: input.kind, term, target, note: input.note?.trim() || null },
    });
    return toEntry(row);
  }

  async remove(id: string): Promise<boolean> {
    const r = await this.prisma.menuLexicon.deleteMany({ where: { id } });
    return r.count > 0;
  }
}
