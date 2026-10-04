// 흔한 한 끼 목록(meal-recommendation/common-meals.ts)이 이 DB 의 음식 카탈로그와 얼마나 맞는지 — 읽기 전용이라
// 운영에서 돌려도 된다. 목록 이름(메뉴 어휘 표기 변형 포함)이 추천 후보가 될 수 있는 카탈로그 행의 이름·별칭과
// 맞으면 '후보로 쓰임', 이름은 있는데 원재료·반찬급·제외 조리형태라 후보에서 빠지면 '빠짐', 아예 없으면 '없음'.
// dev 카탈로그(식약처 + curated)엔 제육덮밥·닭갈비·보쌈·양념치킨 등이 없다 — 운영(식당 메뉴 정규명)에서 확인한다.
// 실행: pnpm --filter friendly check:common-meals

import { PrismaClient } from '@prisma/client';
import { normalizeTerm } from '../src/lib/text.js';
import { loadLexicon, synonymVariants } from '../src/modules/food/engine/index.js';
import { COMMON_MEALS } from '../src/modules/meal-recommendation/common-meals.js';
import { isExplorableCatalogRow } from '../src/modules/meal-recommendation/meal-pattern.service.js';

const prisma = new PrismaClient();

const parseNorms = (json: string | null): string[] => {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const main = async (): Promise<void> => {
  const lex = await loadLexicon(prisma);
  const rows = await prisma.foodItem.findMany({
    where: { active: true },
    select: {
      name: true,
      nameNorm: true,
      aliasNormsJson: true,
      source: true,
      dishType: true,
      mainIngredient: true,
      sourceCategory: true,
      kcal: true,
    },
  });
  const byNorm = new Map<string, typeof rows>();
  for (const r of rows) {
    for (const norm of [r.nameNorm, ...parseNorms(r.aliasNormsJson)]) {
      byNorm.set(norm, [...(byNorm.get(norm) ?? []), r]);
    }
  }

  let total = 0;
  let usable = 0;
  let excluded = 0;
  let missing = 0;
  console.log(`카탈로그 활성 ${rows.length}행 · 흔한 한 끼 목록과 맞춰 봄\n`);
  for (const [group, names] of Object.entries(COMMON_MEALS)) {
    let hit = 0;
    const out: string[] = [];
    const absent: string[] = [];
    for (const name of names) {
      total += 1;
      const norm = normalizeTerm(name);
      const matched = [norm, ...synonymVariants(norm, lex)].flatMap((v) => byNorm.get(v) ?? []);
      if (matched.some(isExplorableCatalogRow)) {
        hit += 1;
        usable += 1;
      } else if (matched.length > 0) {
        excluded += 1;
        out.push(
          `${name}(${[...new Set(matched.map((r) => `${r.source}/${r.dishType ?? '분류 없음'}`))].join('·')})`,
        );
      } else {
        missing += 1;
        absent.push(name);
      }
    }
    console.log(
      `${group}: ${hit}/${names.length}` +
        (out.length > 0 ? ` · 후보에서 빠짐: ${out.join(', ')}` : '') +
        (absent.length > 0 ? ` · 없음: ${absent.join(', ')}` : ''),
    );
  }
  console.log(
    `\n합계 ${total}개 — 후보로 쓰임 ${usable} · 있지만 후보에서 빠짐 ${excluded} · 카탈로그에 없음 ${missing}`,
  );
};

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
