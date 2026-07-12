import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { SubwayStationGroupItemType } from '@repo/api-contract';
import { formatDistanceM } from '@repo/utils';
import { SubwayLineBadge } from './SubwayLineBadge';

// 주변 모드 행 — 검색 그룹에 서버 계산 거리(m)를 덧댄 형태(웹 SubwayStationRow).
export type SubwayStationRowData = SubwayStationGroupItemType & { dist?: number };

interface RowProps {
  item: SubwayStationRowData;
  selected: boolean;
  onSelect(id: string): void;
  // 즐겨찾기 별 — M6 에서 배선. 미지정이면 렌더하지 않는다.
  starContent?: React.ReactNode;
}

// 역 그룹 행 — 역명 + 환승 뱃지 + (주변 모드) 거리 + 호선 뱃지들.
// BottomSheetFlatList 의 renderItem 에서 사용.
export const SubwayStationRow = ({ item, selected, onSelect, starContent }: RowProps) => {
  const theme = useTheme();
  const transfer = item.lines.length > 1;
  return (
    <View style={styles.rowWrap}>
      <Pressable
        onPress={() => onSelect(item.id)}
        android_ripple={{ color: theme.colors.surfaceAlt }}
        style={[
          styles.row,
          selected && { backgroundColor: theme.colors.surfaceAlt },
        ]}
        accessibilityRole="button"
        accessibilityState={selected ? { selected: true } : undefined}
      >
        <View style={styles.nameCol}>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {transfer && (
            <View style={[styles.transferBadge, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Text style={[styles.transferText, { color: theme.colors.textMuted }]}>환승</Text>
            </View>
          )}
        </View>
        <View style={styles.rightCol}>
          {item.dist !== undefined && (
            <Text style={[styles.dist, { color: theme.colors.textMuted }]}>
              {formatDistanceM(item.dist)}
            </Text>
          )}
          <View style={styles.badges}>
            {item.lines.map((l) => (
              <SubwayLineBadge key={l.stationId} lineId={l.lineId} />
            ))}
          </View>
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
  nameCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  transferBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  transferText: {
    fontSize: 10,
    fontWeight: '600',
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
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
