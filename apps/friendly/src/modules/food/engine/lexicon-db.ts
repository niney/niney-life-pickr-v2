// 어휘 DB(menu_lexicon) — 코드 기본 어휘(DEFAULT_LEXICON_SOURCE) 위에 어드민이 추가한 항목을 얹는다.
//
// 행 하나 = (kind, term, target?). kind 별 의미:
//   modifier   떼어도 같은 음식인 앞말              term=수식어
//   size       양이 달라지는 앞말(미니·점보)          term=수식어 (modifier 에도 자동 포함)
//   synonym    표기 동의어                            term=A, target=B (양방향)
//   set        세트 표식                              term=세트어
//   option     맛·온도 선택어(슬래시 양쪽)             term=옵션어
//   suffix_block 접미 매칭 제외 범주어                 term=범주어
//   raw_suffix 떼어서 원재료를 찾는 조리 접미           term=접미
//   quantifier 한판·반판 류 수량 표식                  term=수량어
//   alias      카탈로그 행에 덧붙이는 별칭              term=별칭, target=카탈로그 음식명
//   portion    종류별 통상 1인분 중량                   term=dishType|raw_meat|raw_seafood, target=그램
// 배포 없이 어휘를 고칠 수 있다 — 엔진은 INDEX_TTL 마다 다시 읽는다.

import type { PrismaClient } from '@prisma/client';
import { DEFAULT_LEXICON_SOURCE, compileLexicon, type Lexicon, type LexiconSource } from './lexicon.js';

export const MENU_LEXICON_KINDS = [
  'modifier',
  'size',
  'synonym',
  'set',
  'option',
  'suffix_block',
  'raw_suffix',
  'quantifier',
  'alias',
  'portion',
] as const;
export type MenuLexiconKind = (typeof MENU_LEXICON_KINDS)[number];

export interface MenuLexiconRow {
  kind: string;
  term: string;
  target: string | null;
}

/** 기본 어휘 + DB 행 → LexiconSource. 순수 함수(테스트용). */
export const mergeLexiconRows = (rows: MenuLexiconRow[], base: LexiconSource = DEFAULT_LEXICON_SOURCE): LexiconSource => {
  const out: LexiconSource = {
    leadingModifiers: [...base.leadingModifiers],
    synonymPairs: [...base.synonymPairs],
    setWords: [...base.setWords],
    optionWords: [...base.optionWords],
    suffixBlock: [...base.suffixBlock],
    cutSuffixes: [...base.cutSuffixes],
    rawSuffixes: [...base.rawSuffixes],
    quantifierWords: [...base.quantifierWords],
    extraAliases: Object.fromEntries(Object.entries(base.extraAliases).map(([k, v]) => [k, [...v]])),
    sizeModifiers: [...base.sizeModifiers],
    portionGrams: { ...base.portionGrams },
  };
  for (const r of rows) {
    const term = r.term.trim();
    if (!term) continue;
    switch (r.kind) {
      case 'modifier':
        out.leadingModifiers.push(term);
        break;
      case 'size':
        out.sizeModifiers.push(term);
        out.leadingModifiers.push(term);
        break;
      case 'synonym':
        if (r.target?.trim()) out.synonymPairs.push([term, r.target.trim()]);
        break;
      case 'set':
        out.setWords.push(term);
        break;
      case 'option':
        out.optionWords.push(term);
        break;
      case 'suffix_block':
        out.suffixBlock.push(term);
        break;
      case 'raw_suffix':
        out.rawSuffixes.push(term);
        break;
      case 'quantifier':
        out.quantifierWords.push(term);
        break;
      case 'alias':
        if (r.target?.trim()) {
          const key = r.target.trim();
          out.extraAliases[key] = [...(out.extraAliases[key] ?? []), term];
        }
        break;
      case 'portion': {
        const g = Number(r.target);
        if (Number.isFinite(g) && g > 0) out.portionGrams[term] = Math.round(g);
        break;
      }
      default:
        break;
    }
  }
  return out;
};

export const loadLexicon = async (prisma: PrismaClient): Promise<Lexicon> => {
  const rows = await prisma.menuLexicon.findMany({
    where: { active: true },
    select: { kind: true, term: true, target: true },
  });
  return compileLexicon(mergeLexiconRows(rows));
};
