import { useState } from 'react';
import type { CategoryTreeNodeType } from '@repo/api-contract';

// 분석 탭의 메뉴 카테고리 트리. 어드민 전역 트리와 같은 노드 구조지만 이 식당
// 멘션만 누적된 값. 괄호 = 멘션 횟수, 우측 = 긍/부. depth 고정 없음(재귀).
const CategoryTreeRow = ({
  node,
  depth,
}: {
  node: CategoryTreeNodeType;
  depth: number;
}) => {
  // 루트(depth 0)는 기본 펼침, 그 아래는 접어 둔다.
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = !!node.children && node.children.length > 0;
  return (
    <li>
      <div
        className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/40"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="size-4 shrink-0 text-xs text-muted-foreground"
            aria-label={open ? '접기' : '펼치기'}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate" title={node.path}>
          {node.label}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {node.totalMentions}회
        </span>
        <span className="shrink-0 text-[11px] tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">
            +{node.positive}
          </span>
          <span className="mx-0.5 text-muted-foreground">/</span>
          <span className="text-rose-600 dark:text-rose-400">-{node.negative}</span>
        </span>
      </div>
      {hasChildren && open && (
        <ul className="space-y-0.5">
          {node.children!.map((c) => (
            <CategoryTreeRow key={c.path} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
};

export const CategoryTree = ({ roots }: { roots: CategoryTreeNodeType[] }) => (
  <ul className="space-y-0.5">
    {roots.map((n) => (
      <CategoryTreeRow key={n.path} node={n} depth={0} />
    ))}
  </ul>
);
