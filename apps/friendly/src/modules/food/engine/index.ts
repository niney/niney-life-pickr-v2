export { DEFAULT_LEXICON, DEFAULT_LEXICON_SOURCE, compileLexicon, type Lexicon, type LexiconSource } from './lexicon.js';
export { parseMenuName, stripLeadingModifiers, synonymVariants, type ParsedMenuName } from './parse.js';
export {
  buildCatalogIndex,
  catalogRow,
  loadCatalogIndex,
  type CatalogIndex,
  type CatalogRow,
  type IndexHit,
} from './catalog-index.js';
export {
  decideMenuKcal,
  matchNorm,
  resolveMenuName,
  type MatchInput,
  type MenuKcalBasis,
  type MenuKcalMatchedBy,
  type MenuKcalReason,
  type MenuKcalResult,
} from './resolve.js';
export { MenuNutritionEngine } from './engine.js';
export { MENU_LEXICON_KINDS, loadLexicon, mergeLexiconRows, type MenuLexiconKind, type MenuLexiconRow } from './lexicon-db.js';
