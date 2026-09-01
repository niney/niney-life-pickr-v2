import { z } from 'zod';

// 메뉴 칼로리 판정 엔진의 어휘(어드민 편집) — 코드 기본 어휘 위에 얹는 항목.
// 값(칼로리)이 아니라 "메뉴명을 카탈로그 행에 맞추는 말"만 다룬다. 엔진은 10분 안에 다시 읽는다.
//   modifier     떼어도 같은 음식인 앞말("숙성")           term
//   size         양이 달라지는 앞말("미니")               term  (1인분 표시 금지)
//   synonym      표기 동의어                              term ↔ target
//   set          세트 표식("한상")                        term
//   option       맛·온도 선택어(슬래시 양쪽, "냉/온")      term
//   suffix_block 접미 매칭 제외 범주어("면")              term
//   raw_suffix   떼어서 원재료를 찾는 조리 접미("타다끼")   term
//   quantifier   한판·반판 류 수량 표식                   term
//   alias        카탈로그 행에 덧붙이는 별칭              term → target(카탈로그 음식명)

export const MenuLexiconKind = z.enum([
  'modifier',
  'size',
  'synonym',
  'set',
  'option',
  'suffix_block',
  'raw_suffix',
  'quantifier',
  'alias',
]);
export type MenuLexiconKindType = z.infer<typeof MenuLexiconKind>;

// target 이 필요한 종류.
export const MENU_LEXICON_KINDS_WITH_TARGET: readonly MenuLexiconKindType[] = ['synonym', 'alias'];

export const MenuLexiconEntry = z.object({
  id: z.string(),
  kind: MenuLexiconKind,
  term: z.string(),
  target: z.string().nullable(),
  note: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
});
export type MenuLexiconEntryType = z.infer<typeof MenuLexiconEntry>;

export const MenuLexiconCreateInput = z.object({
  kind: MenuLexiconKind,
  term: z.string().trim().min(1).max(40),
  target: z.string().trim().min(1).max(60).optional(),
  note: z.string().trim().max(200).optional(),
});
export type MenuLexiconCreateInputType = z.infer<typeof MenuLexiconCreateInput>;

export const MenuLexiconListQuery = z.object({
  kind: MenuLexiconKind.optional(),
});
export type MenuLexiconListQueryType = z.infer<typeof MenuLexiconListQuery>;

export const MenuLexiconListResult = z.object({
  items: z.array(MenuLexiconEntry),
  // 코드 기본 어휘의 종류별 개수 — 어드민이 "이미 있는 말"을 짐작할 수 있게.
  defaults: z.record(MenuLexiconKind, z.number().int().nonnegative()),
});
export type MenuLexiconListResultType = z.infer<typeof MenuLexiconListResult>;

export const MenuLexiconIdParams = z.object({ id: z.string().min(1) });
