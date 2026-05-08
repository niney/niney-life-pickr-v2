import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useGroupForRestaurant, useMenuRanking } from '@repo/shared';
import type { MenuRankingItemType, MenuRankingSortType } from '@repo/api-contract';

const SORTS: { value: MenuRankingSortType; label: string }[] = [
  { value: 'mentions', label: '언급순' },
  { value: 'positive', label: '긍정순' },
  { value: 'positiveRatio', label: '긍정률' },
];

export const MenuRankingCard = ({ placeId }: { placeId: string }) => {
  const [sort, setSort] = useState<MenuRankingSortType>('mentions');
  const ranking = useMenuRanking(placeId, { sort, minMentions: 2 });
  const groupMutation = useGroupForRestaurant();

  if (ranking.isLoading) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>메뉴 순위</Text>
        <ActivityIndicator />
      </View>
    );
  }
  if (!ranking.data || ranking.data.totalMentions === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>메뉴 순위</Text>
        <Text style={styles.empty}>분석된 메뉴 멘션이 아직 없습니다.</Text>
      </View>
    );
  }

  const data = ranking.data;
  const visible = data.items.slice(0, 5);
  const hasUnmapped = data.unmappedMenus.length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>메뉴 순위</Text>
        <View style={styles.sorts}>
          {SORTS.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => setSort(s.value)}
              style={[styles.sortChip, sort === s.value && styles.sortChipOn]}
            >
              <Text
                style={[styles.sortChipText, sort === s.value && styles.sortChipTextOn]}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {hasUnmapped && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            미분류 메뉴 {data.unmappedMenus.length}개 — 분류하면 더 정확해집니다
          </Text>
          <Pressable
            onPress={() => groupMutation.mutate(placeId)}
            disabled={groupMutation.isPending}
            style={[styles.warnBtn, groupMutation.isPending && styles.warnBtnDisabled]}
          >
            <Text style={styles.warnBtnText}>
              {groupMutation.isPending ? '분류 중…' : '분류하기'}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.list}>
        {visible.map((it, idx) => (
          <Row key={it.canonicalKey} item={it} rank={idx + 1} />
        ))}
      </View>

      {data.items.length > visible.length && (
        <Text style={styles.more}>+{data.items.length - visible.length}개 더</Text>
      )}
    </View>
  );
};

const Row = ({ item, rank }: { item: MenuRankingItemType; rank: number }) => {
  const total = item.positive + item.negative + item.neutral;
  const pos = total ? (item.positive / total) * 100 : 0;
  const neu = total ? (item.neutral / total) * 100 : 0;
  const ratio =
    item.positiveRatio === null ? '-' : `${Math.round(item.positiveRatio * 100)}%`;
  return (
    <View style={styles.row}>
      <Text style={styles.rank}>{rank}</Text>
      <View style={styles.rowMain}>
        <Text style={styles.menuName}>{item.canonicalName}</Text>
        {item.topTraits.length > 0 && (
          <Text style={styles.traits}>{item.topTraits.join(' · ')}</Text>
        )}
        <View style={styles.bar}>
          <View style={[styles.barSeg, styles.barPos, { flex: pos }]} />
          <View style={[styles.barSeg, styles.barNeu, { flex: neu }]} />
          <View style={[styles.barSeg, styles.barNeg, { flex: 100 - pos - neu }]} />
        </View>
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.mentions}>{item.mentionCount}회</Text>
        <Text style={styles.ratio}>{ratio}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eee',
    gap: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700' },
  empty: { color: '#888', fontSize: 13 },
  sorts: { flexDirection: 'row', gap: 4 },
  sortChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#f1f5f9' },
  sortChipOn: { backgroundColor: '#1e293b' },
  sortChipText: { fontSize: 11, color: '#475569' },
  sortChipTextOn: { color: '#fff' },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 10,
  },
  warnText: { flex: 1, fontSize: 12, color: '#92400e' },
  warnBtn: { backgroundColor: '#1e293b', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  warnBtnDisabled: { opacity: 0.6 },
  warnBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 22, fontSize: 12, color: '#94a3b8', textAlign: 'right' },
  rowMain: { flex: 1, gap: 4 },
  menuName: { fontSize: 14, fontWeight: '600' },
  traits: { fontSize: 11, color: '#64748b' },
  bar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: '#e2e8f0' },
  barSeg: { height: '100%' },
  barPos: { backgroundColor: '#10b981' },
  barNeu: { backgroundColor: '#94a3b8' },
  barNeg: { backgroundColor: '#ef4444' },
  rowMeta: { alignItems: 'flex-end', gap: 2 },
  mentions: { fontSize: 12, fontWeight: '600' },
  ratio: { fontSize: 11, color: '#64748b' },
  more: { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4 },
});
