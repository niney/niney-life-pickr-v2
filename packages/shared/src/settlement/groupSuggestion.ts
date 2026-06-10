import { isGroupableCategory, matchDrinkKind } from '@repo/api-contract';
import type { GroupableCategoryType, ReceiptItemCategoryType } from '@repo/api-contract';

// 항목명 키워드로 주류/음료를 종류 그룹(소주/맥주/콜라…)으로 묶는 제안.
// 종류 사전은 @repo/api-contract 의 settlement.drink-kinds — 영수증 추출의
// 카테고리 보정·프롬프트 힌트와 같은 사전을 공유한다(단일 소스). 여기는
// FE 그룹 제안 조립만 담당.
//
// 매칭 안 된 항목은 그룹에 안 들어가고 '나머지 풀'로 남아 기존 카테고리
// 균등 분배를 따른다. 사전이 항목과 다른 카테고리의 종류로 매칭되면(예:
// 주류 항목이 음료 키워드에 걸림) 제안하지 않는다 — 그룹 카테고리는 항목
// 카테고리와 같아야 한다는 스키마 제약과 일치.

export {
  GROUPABLE_CATEGORIES,
  isGroupableCategory,
  type GroupableCategoryType,
} from '@repo/api-contract';

export interface GroupSuggestionItemInput {
  clientId: string;
  name: string;
  matchedMenuName: string | null;
  category: ReceiptItemCategoryType;
}

export interface ItemGroupSuggestion {
  label: string;
  category: GroupableCategoryType;
  itemClientIds: string[];
}

/**
 * 주류/음료 항목을 종류별 그룹으로 묶는 제안을 만든다. 같은 종류로 매칭된
 * 항목들이 한 그룹 — 결과 순서는 (카테고리, 첫 매칭 항목) 등장 순서.
 * 멤버/모드는 포함하지 않는다 — 호출부가 기본값(참석자 전원, 균등)을 채운다.
 */
export const suggestItemGroups = (
  items: GroupSuggestionItemInput[],
): ItemGroupSuggestion[] => {
  const out: ItemGroupSuggestion[] = [];
  const byKey = new Map<string, ItemGroupSuggestion>();
  for (const it of items) {
    if (!isGroupableCategory(it.category)) continue;
    const kind = matchDrinkKind([it.matchedMenuName, it.name]);
    if (!kind || kind.category !== it.category) continue;
    const key = `${it.category}:${kind.label}`;
    let group = byKey.get(key);
    if (!group) {
      group = { label: kind.label, category: it.category, itemClientIds: [] };
      byKey.set(key, group);
      out.push(group);
    }
    group.itemClientIds.push(it.clientId);
  }
  return out;
};
