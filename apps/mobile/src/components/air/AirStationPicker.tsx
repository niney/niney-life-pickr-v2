import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAirSidoRealtime, useTheme } from '@repo/shared';
import { AIR_SIDO_OPTIONS } from '@repo/utils';
import { AirGradeBadge } from './AirPrimitives';

// 측정소 선택 모달 — 시도 칩 + 그 시도의 측정소 목록(현재 등급 배지). 웹의 시도/측정소 <select> 두 개를
// 앱 한 화면으로. 목록은 시도별 실시간 응답(서버 '전국' 캐시 필터)에서 뽑는다.

interface Props {
  visible: boolean;
  onClose: () => void;
  initialSido: string;
  currentStation: string | null;
  onSelect: (sido: string, station: string) => void;
}

export const AirStationPicker = ({ visible, onClose, initialSido, currentStation, onSelect }: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [sido, setSido] = useState(initialSido);
  const q = useAirSidoRealtime(visible ? sido : null);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (q.data?.items ?? [])
      .filter((m) => (seen.has(m.stationName) ? false : (seen.add(m.stationName), true)))
      .sort((a, b) => a.stationName.localeCompare(b.stationName, 'ko'));
  }, [q.data]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: Math.max(insets.top, 12) }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>측정소 선택</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={22} color={theme.colors.textMuted} />
          </Pressable>
        </View>
        <View style={[styles.sidos, { borderBottomColor: theme.colors.border }]}>
          {AIR_SIDO_OPTIONS.map((o) => {
            const active = o.value === sido;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSido(o.value)}
                style={[styles.chip, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primary : 'transparent' }]}
              >
                <Text style={[styles.chipText, { color: active ? theme.colors.primaryText : theme.colors.textMuted }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {q.isLoading && !q.data ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.textMuted} />
          </View>
        ) : q.isError && !q.data ? (
          <View style={styles.center}>
            <Text style={{ color: theme.colors.danger, fontSize: 13 }}>측정소 목록을 불러오지 못했습니다.</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(m) => m.stationName}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            initialNumToRender={24}
            renderItem={({ item: m }) => {
              const selected = m.stationName === currentStation;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(sido, m.stationName)}
                  style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
                >
                  <View style={styles.rowMain}>
                    <Text style={[styles.rowText, { color: theme.colors.text, fontWeight: selected ? '700' : '400' }]}>{m.stationName}</Text>
                    <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
                      {m.sidoName ?? ''}{m.mangName ? ` · ${m.mangName}` : ''}
                    </Text>
                  </View>
                  <AirGradeBadge grade={m.khaiGrade ?? m.pm25Grade ?? m.pm10Grade} />
                  {selected && <MaterialCommunityIcons name="check" size={18} color={theme.colors.primary} />}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>이 시도에 측정소가 없습니다.</Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '700' },
  sidos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '500' },
  center: { paddingVertical: 40, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowMain: { flex: 1, gap: 2 },
  rowText: { fontSize: 15 },
  rowSub: { fontSize: 11 },
});
