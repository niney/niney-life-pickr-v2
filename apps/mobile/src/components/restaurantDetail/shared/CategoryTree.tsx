import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { CategoryTreeNodeType } from '@repo/api-contract';
import { SENTIMENT_COLORS } from '../colors';

// 분석 탭의 메뉴 카테고리 트리(RN). 웹 CategoryTree 와 같은 데이터·규칙:
// "N회" = 멘션 횟수, 우측 = 긍/부. depth 고정 없음(재귀), 루트는 펼침.
const CategoryTreeRow = ({
  node,
  depth,
}: {
  node: CategoryTreeNodeType;
  depth: number;
}) => {
  const theme = useTheme();
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = !!node.children && node.children.length > 0;
  return (
    <View>
      <Pressable
        onPress={hasChildren ? () => setOpen((v) => !v) : undefined}
        disabled={!hasChildren}
        accessibilityRole={hasChildren ? 'button' : undefined}
        style={({ pressed }) => [
          styles.row,
          { paddingLeft: depth * 14, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text style={[styles.caret, { color: theme.colors.textMuted }]}>
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </Text>
        <Text
          style={[styles.label, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {node.label}
        </Text>
        <Text style={[styles.count, { color: theme.colors.textMuted }]}>
          {node.totalMentions}회
        </Text>
        <Text style={styles.stat}>
          <Text style={{ color: SENTIMENT_COLORS.positive }}>+{node.positive}</Text>
          <Text style={{ color: theme.colors.textMuted }}> / </Text>
          <Text style={{ color: SENTIMENT_COLORS.negative }}>-{node.negative}</Text>
        </Text>
      </Pressable>
      {hasChildren && open
        ? node.children!.map((c) => (
            <CategoryTreeRow key={c.path} node={c} depth={depth + 1} />
          ))
        : null}
    </View>
  );
};

export const CategoryTree = ({ roots }: { roots: CategoryTreeNodeType[] }) => (
  <View>
    {roots.map((n) => (
      <CategoryTreeRow key={n.path} node={n} depth={0} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  caret: { width: 14, fontSize: 11, textAlign: 'center' },
  label: { flex: 1, fontSize: 14 },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  stat: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
