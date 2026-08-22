// 카탈로그 영양 보강 — 영양이 비어 있는 행에 같은 계열 행의 1인분 영양을 빌려온다.
//
// 왜 필요한가: 카탈로그 병합 키는 nameNorm 이라 이름이 정확히 같아야 합쳐진다. 그래서 식약처
// 표준데이터에 `소불고기`(13행)·`돼지불고기`(13행)가 있어도 외식 어휘 `불고기` 행은 영양이 빈다.
// 실측(2026-08-23): 대표 한식 150종 중 카탈로그 매칭 137, 그 중 영양 보유는 114(76%)뿐이었다.
//
// 규칙: 한국어 음식명은 **뒤가 핵심어**(수식어+핵심어)다. `소불고기`는 불고기의 한 종류지만
// `불고기피자`는 피자다. 그래서 **후보명이 대상명으로 끝날 때만** 빌려온다. 조리형태(dishType)가
// 양쪽에 있으면 같아야 하고, 후보가 너무 많으면 대상이 범주어(찌개·구이…)라는 뜻이라 건너뛴다.
// 빌려온 행은 nutritionFrom 에 출처 id 를 남겨 UI 가 "○○ 기준 추정"이라고 밝힐 수 있게 한다.

import type { PrismaClient } from '@prisma/client';

// 대상명이 이보다 짧으면(1글자) 범주어일 위험이 커서 보강하지 않는다.
const MIN_TARGET_LEN = 2;
// 폭주 방지 backstop — 여기에 걸릴 만큼 후보가 많으면 대상이 사실상 범주다.
const MAX_DONORS = 40;
// 조리형태를 가리키는 낱말은 그 자체로 음식이 아니라 범주다. '볶음'의 후보는 제육볶음·채소볶음처럼
// 서로 다른 음식이라 대표를 고를 수 없다. 반면 김치·만두·떡·회 같은 재료·형태 낱말은 대표를
// 골라도 말이 되므로(김치 ← 배추김치) 막지 않는다.
const CATEGORY_WORDS = new Set([
  '국', '탕', '찌개', '전골', '구이', '볶음', '조림', '찜', '전', '부침', '튀김',
  '무침', '나물', '숙채', '생채', '샐러드', '절임', '젓갈',
  '정식', '세트', '요리', '음식', '메뉴', '반찬', '안주', '사이드', '기타',
]);

export interface NutritionDonor {
  id: string;
  name: string;
  nameNorm: string;
  dishType: string | null;
  servingG: number | null;
  kcal: number | null;
  carbG: number | null;
  proteinG: number | null;
  fatG: number | null;
  sodiumMg: number | null;
  sugarG: number | null;
}

export interface NutritionTarget {
  id: string;
  name: string;
  nameNorm: string;
  dishType: string | null;
}

export interface DonorPick {
  donor: NutritionDonor;
  /** 같은 계열로 판정된 후보 수 — 많을수록 대표성이 낮다(감사용). */
  donorCount: number;
}

/**
 * 대상에게 영양을 빌려줄 행을 고른다. 없으면 null.
 *
 * 후보가 여럿이면 **kcal 중앙값에 가장 가까운** 행을 쓴다. 실측(불고기 10종)에서 138~382kcal 로
 * 2.5배까지 벌어지는데, '이름이 가장 짧은 행'같은 규칙은 꿩불고기를 대표로 뽑는 식으로 엉뚱해진다.
 * 중앙값은 극단값에 안 흔들리고, 매크로 일관성을 위해 값이 아니라 **행**을 고른다.
 */
export const pickNutritionDonor = (target: NutritionTarget, candidates: NutritionDonor[]): DonorPick | null => {
  const t = target.nameNorm;
  if (t.length < MIN_TARGET_LEN) return null;
  if (CATEGORY_WORDS.has(t)) return null;

  const donors = candidates.filter((c) => {
    if (c.kcal === null) return false;
    if (c.nameNorm === t) return false;
    // 핵심어 일치 — 후보가 대상으로 끝나야 한다(수식어+대상 구조).
    if (!c.nameNorm.endsWith(t)) return false;
    // 조리형태가 양쪽에 있으면 같아야 한다(구이 ↔ 볶음 혼입 방지).
    if (target.dishType && c.dishType && target.dishType !== c.dishType) return false;
    return true;
  });
  if (donors.length === 0 || donors.length > MAX_DONORS) return null;

  const sorted = [...donors].sort((a, b) => a.kcal! - b.kcal! || a.nameNorm.localeCompare(b.nameNorm));
  const mid = sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]!.kcal!
    : (sorted[sorted.length / 2 - 1]!.kcal! + sorted[sorted.length / 2]!.kcal!) / 2;
  const donor = sorted.reduce((best, c) => (Math.abs(c.kcal! - mid) < Math.abs(best.kcal! - mid) ? c : best));
  return { donor, donorCount: donors.length };
};

export interface BackfillResult {
  targets: number;
  filled: number;
  skipped: number;
  samples: { name: string; from: string; kcal: number; donorCount: number }[];
}

/** 영양이 빈 활성 행 전체를 훑어 보강한다. dryRun 이면 DB 를 쓰지 않는다. */
export const backfillNutrition = async (
  prisma: PrismaClient,
  opts: { dryRun?: boolean } = {},
): Promise<BackfillResult> => {
  const select = {
    id: true,
    name: true,
    nameNorm: true,
    dishType: true,
    servingG: true,
    kcal: true,
    carbG: true,
    proteinG: true,
    fatG: true,
    sodiumMg: true,
    sugarG: true,
  } as const;

  const candidates = (await prisma.foodItem.findMany({
    where: { active: true, kcal: { not: null } },
    select,
  })) as NutritionDonor[];
  const targets = await prisma.foodItem.findMany({
    where: { active: true, kcal: null },
    select: { id: true, name: true, nameNorm: true, dishType: true },
  });

  const result: BackfillResult = { targets: targets.length, filled: 0, skipped: 0, samples: [] };
  for (const target of targets) {
    const pick = pickNutritionDonor(target, candidates);
    if (!pick) {
      result.skipped += 1;
      continue;
    }
    const d = pick.donor;
    if (!opts.dryRun) {
      await prisma.foodItem.update({
        where: { id: target.id },
        data: {
          servingG: d.servingG,
          kcal: d.kcal,
          carbG: d.carbG,
          proteinG: d.proteinG,
          fatG: d.fatG,
          sodiumMg: d.sodiumMg,
          sugarG: d.sugarG,
          // 여럿에서 고른 것이면 그 사실을 남긴다 — UI 가 "○○ 외 N종 중앙값 기준 추정"이라 밝힌다.
          nutritionFrom: pick.donorCount > 1 ? `${d.name} 외 ${pick.donorCount - 1}종 중앙값` : d.name,
        },
      });
    }
    result.filled += 1;
    if (result.samples.length < 20) {
      result.samples.push({ name: target.name, from: d.name, kcal: d.kcal!, donorCount: pick.donorCount });
    }
  }
  return result;
};
