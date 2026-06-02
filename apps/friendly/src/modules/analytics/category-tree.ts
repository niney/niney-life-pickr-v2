import type { CategoryTreeNodeType } from '@repo/api-contract';

// 트리 한 그루의 잎(leaf) — 하나의 categoryPath 와 그에 누적된 멘션 통계.
// "한식 > 찌개 > 김치찌개" 같은 path 와 그 메뉴의 긍/부/합계.
export interface CategoryTreeLeaf {
  categoryPath: string;
  total: number;
  positive: number;
  negative: number;
}

// categoryPath 들을 받아 계층 트리로 조립한다. path 의 모든 prefix 를 노드로
// 만들고 잎 통계를 부모로 누적 — 어느 레벨에서나 그 가지의 합계가 된다.
// depth 고정 없음(세그먼트 수만큼). 자식은 멘션 많은 순 정렬.
// 전역(어드민)·식당별(공개) 양쪽이 같은 규칙을 쓰도록 단일 구현으로 둔다.
export function buildCategoryTree(
  leaves: CategoryTreeLeaf[],
): CategoryTreeNodeType[] {
  interface MutableNode {
    path: string;
    label: string;
    totalMentions: number;
    positive: number;
    negative: number;
    children: Map<string, MutableNode>;
  }
  const roots = new Map<string, MutableNode>();

  for (const leaf of leaves) {
    if (leaf.total === 0) continue;
    const segments = leaf.categoryPath.split(' > ');
    let parentMap = roots;
    let acc = '';
    for (const seg of segments) {
      acc = acc === '' ? seg : `${acc} > ${seg}`;
      let node = parentMap.get(seg);
      if (!node) {
        node = {
          path: acc,
          label: seg,
          totalMentions: 0,
          positive: 0,
          negative: 0,
          children: new Map(),
        };
        parentMap.set(seg, node);
      }
      node.totalMentions += leaf.total;
      node.positive += leaf.positive;
      node.negative += leaf.negative;
      parentMap = node.children;
    }
  }

  const toJson = (node: MutableNode): CategoryTreeNodeType => {
    const denom = node.positive + node.negative;
    const children = [...node.children.values()]
      .map(toJson)
      .sort((a, b) => b.totalMentions - a.totalMentions);
    return {
      path: node.path,
      label: node.label,
      totalMentions: node.totalMentions,
      positive: node.positive,
      negative: node.negative,
      positiveRatio: denom === 0 ? null : node.positive / denom,
      children: children.length > 0 ? children : undefined,
    };
  };

  return [...roots.values()]
    .map(toJson)
    .sort((a, b) => b.totalMentions - a.totalMentions);
}
