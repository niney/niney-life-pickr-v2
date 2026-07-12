import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { BusStationItemType } from '@repo/api-contract';
import { formatDistanceM } from '@repo/utils';

// 주변 모드 행 — 검색 항목에 서버 계산 거리(m)를 덧댄 형태(웹 BusStationRow).
export type BusStationRowData = BusStationItemType & { dist?: number };

interface RowProps {
  item: BusStationRowData;
  selected: boolean;
  onSelect(stId: string): void;
  // 즐겨찾기 별 — M6 에서 배선.
  starContent?: React.ReactNode;
}

// 정류장 행 — 정류장명 + (주변 모드) 거리 + arsId 뱃지('0'=가상정류장은 숨김).
export const BusStationRow = ({ item, selected, onSelect, starContent }: RowProps) => {
  const theme = useTheme();
  return (
    <View style={styles.rowWrap}>
      <Pressable
        onPress={() => onSelect(item.stId)}
        android_ripple={{ color: theme.colors.surfaceAlt }}
        style={[styles.row, selected && { backgroundColor: theme.colors.surfaceAlt }]}
        accessibilityRole="button"
        accessibilityState={selected ? { selected: true } : undefined}
      >
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.rightCol}>
          {item.dist !== undefined && (
            <Text style={[styles.dist, { color: theme.colors.textMuted }]}>
              {formatDistanceM(item.dist)}
            </Text>
          )}
          {item.arsId !== '0' && (
            <View style={[styles.arsBadge, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Text style={[styles.arsText, { color: theme.colors.textMuted }]}>
                {item.arsId}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
      {starContent}
    </View>
  );
};

const styles = StyleSheet.create({
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  row: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  rightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  dist: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  arsBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  arsText: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
