import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import { BusStationRow } from '~/components/bus/BusStationListRows';
import { SubwayStationRow } from '~/components/subway/SubwayStationListRows';
import type {
  TransitRecentQuery,
  TransitRecentTarget,
} from '~/lib/transitRecentStore';

interface Props {
  filtering: boolean;
  queries: TransitRecentQuery[];
  targets: TransitRecentTarget[];
  onUseQuery(q: string): void;
  onSelectTarget(target: TransitRecentTarget): void;
  onRemoveQuery(query: TransitRecentQuery): void;
  onRemoveTarget(target: TransitRecentTarget): void;
  onClear(): void;
}

// 검색 입력 focus 동안 리스트 최상단에 붙는 로컬 기록/자동완성 섹션. 서버 검색
// 결과와 섞지 않고 위에 분리해, 버스는 타이핑 중 업스트림 호출 없이 재사용한다.
export const TransitRecentSection = ({
  filtering,
  queries,
  targets,
  onUseQuery,
  onSelectTarget,
  onRemoveQuery,
  onRemoveTarget,
  onClear,
}: Props) => {
  const theme = useTheme();
  if (queries.length === 0 && targets.length === 0) return null;

  return (
    <View style={[styles.card, { borderColor: theme.colors.border }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {filtering ? '최근 기록 자동완성' : '최근 기록'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>기기에만 저장됩니다</Text>
        </View>
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="현재 교통수단 최근 기록 삭제">
          <Text style={[styles.clearText, { color: theme.colors.textMuted }]}>전체 삭제</Text>
        </Pressable>
      </View>

      {targets.length > 0 && (
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>최근 선택</Text>
          {targets.map((target) =>
            target.kind === 'bus' ? (
              <BusStationRow
                key={`bus:${target.stId}`}
                item={target}
                selected={false}
                onSelect={() => onSelectTarget(target)}
                starContent={
                  <RemoveButton
                    label={`${target.name} 최근 선택 삭제`}
                    onPress={() => onRemoveTarget(target)}
                  />
                }
              />
            ) : (
              <SubwayStationRow
                key={`subway:${target.stationId}`}
                item={{
                  id: target.stationId,
                  name: target.name,
                  lat: target.lat,
                  lng: target.lng,
                  lines: target.lines,
                }}
                selected={false}
                onSelect={() => onSelectTarget(target)}
                starContent={
                  <RemoveButton
                    label={`${target.name} 최근 선택 삭제`}
                    onPress={() => onRemoveTarget(target)}
                  />
                }
              />
            ),
          )}
        </View>
      )}

      {queries.length > 0 && (
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>최근 검색어</Text>
          {queries.map((query) => (
            <View key={`${query.mode}:${query.q}`} style={styles.queryRow}>
              <Pressable
                onPress={() => onUseQuery(query.q)}
                android_ripple={{ color: theme.colors.surfaceAlt }}
                style={styles.queryMain}
              >
                <Text style={[styles.clock, { color: theme.colors.textMuted }]}>↻</Text>
                <Text style={[styles.queryText, { color: theme.colors.text }]} numberOfLines={1}>
                  {query.q}
                </Text>
              </Pressable>
              <RemoveButton
                label={`${query.q} 최근 검색어 삭제`}
                onPress={() => onRemoveQuery(query)}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const RemoveButton = ({ label, onPress }: { label: string; onPress(): void }) => {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.removeBtn} accessibilityLabel={label}>
      <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>✕</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 10, marginTop: 2 },
  clearText: { fontSize: 11 },
  group: { gap: 3 },
  groupTitle: { fontSize: 11, fontWeight: '600', paddingHorizontal: 4, marginBottom: 2 },
  queryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  queryMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clock: { fontSize: 12 },
  queryText: { flex: 1, minWidth: 0, fontSize: 14 },
  removeBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
