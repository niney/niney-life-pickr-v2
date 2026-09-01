// 메뉴명 → 카탈로그 후보 검색(LLM 제약 선택용).
//
// 순수 문자열 근접(bigram Jaccard) + 부분어 포함 + 낱말 포함 + 동의어(계란↔달걀·파스타↔스파게티)
// + 괄호 힌트로 카탈로그 전수를 스코어링해 상위 N 개를 돌려준다. 카탈로그가 1~2천 종이라
// 전수 스코어링으로 충분하다. LLM 은 이 후보 안에서만 고르게 해 환각을 막는다(프로브 실측:
// 후보 밖 이름 0건). 후보에 정답이 없는 "지식형"(부타동→돼지고기덮밥)은 LLM 의 자유형 표준명으로
// 따로 회수한다(menu-llm-match.service).

import { normalizeTerm } from '../../lib/text.js';
import { foodNameSimilarity } from './food.service.js';
import { parseMenuName, synonymVariants } from './menu-nutrition.js';

export const MENU_CANDIDATE_LIMIT = 15;

export interface CatalogCandidateRow {
  name: string;
  nameNorm: string;
}

const EXTRA_SYNONYMS: [string, string][] = [
  ['파스타', '스파게티'],
  ['치킨', '닭'],
  ['새우', '쉬림프'],
];

const bigramSet = (s: string): Set<string> => {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
};

export const pickMenuCandidates = <T extends CatalogCandidateRow>(
  menu: string,
  catalog: T[],
  limit = MENU_CANDIDATE_LIMIT,
): T[] => {
  const parsed = parseMenuName(menu);
  const base = normalizeTerm(parsed.cleaned || menu);
  if (!base) return [];
  const variants = new Set<string>([base, ...synonymVariants(base)]);
  for (const [a, b] of EXTRA_SYNONYMS) {
    for (const v of [...variants]) {
      if (v.includes(a)) variants.add(v.split(a).join(b));
      if (v.includes(b)) variants.add(v.split(b).join(a));
    }
  }
  for (const h of parsed.hints) variants.add(normalizeTerm(h));
  const tokens = new Set<string>();
  for (const t of (parsed.cleaned || menu).split(/[\s/·,+&()]+/).map(normalizeTerm)) {
    if (t.length >= 2) tokens.add(t);
  }
  const variantBigrams = [...variants].map((v) => ({ v, bigrams: bigramSet(v) }));

  const scored = catalog.map((row) => {
    let score = 0;
    for (const { v, bigrams } of variantBigrams) {
      score = Math.max(score, foodNameSimilarity(v, row.nameNorm));
      if (row.nameNorm.length >= 2 && v.includes(row.nameNorm)) score = Math.max(score, 0.6);
      // 공유 bigram 수 — "짜장" 하나로도 짜장면·쟁반짜장을 끌어온다.
      let shared = 0;
      for (const b of bigramSet(row.nameNorm)) if (bigrams.has(b)) shared += 1;
      if (shared > 0) score = Math.max(score, 0.2 + shared * 0.1);
    }
    for (const t of tokens) {
      if (row.nameNorm.includes(t)) score = Math.max(score, 0.45 + t.length * 0.02);
    }
    return { row, score };
  });
  return scored
    .filter((s) => s.score >= 0.3)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.row.name.length - b.row.name.length ||
        a.row.name.localeCompare(b.row.name, 'ko'),
    )
    .slice(0, limit)
    .map((s) => s.row);
};
