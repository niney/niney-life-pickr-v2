import { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@repo/shared';
import { WEATHER_SIDOS, weatherDefaultPlaceOfSido, weatherPlacesBySido, type WeatherPlace, type WeatherSido } from '@repo/utils';

// 지점 선택 모달 — 위 두 줄(내 위치 / 저장한 내 위치) + 시도 칩 + 그 시도의 시·군·구 지점 목록.
// 웹의 시도/지점 <select> 두 개를 앱에 맞게 한 화면으로.

interface Props {
  visible: boolean;
  onClose: () => void;
  currentPlaceId: string | null;
  initialSido: WeatherSido;
  savedLabel: string | null;
  onSelectPlace: (place: WeatherPlace) => void;
  onSelectMyLocation: () => void;
  onSelectSaved: () => void;
}

export const WeatherPlacePicker = ({ visible, onClose, currentPlaceId, initialSido, savedLabel, onSelectPlace, onSelectMyLocation, onSelectSaved }: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [sido, setSido] = useState<WeatherSido>(initialSido);
  const places = useMemo(() => weatherPlacesBySido(sido), [sido]);
  const defaultId = weatherDefaultPlaceOfSido(sido)?.id ?? null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* iOS pageSheet 은 이미 상태바 아래에 카드로 뜨므로 상단 inset 을 또 더하지 않는다(안드로이드 edge-to-edge 만 inset) */}
      <View style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: Platform.OS === 'ios' ? 12 : Math.max(insets.top, 12) }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>지점 선택</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={22} color={theme.colors.textMuted} />
          </Pressable>
        </View>
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View>
              <Pressable accessibilityRole="button" onPress={onSelectMyLocation} style={({ pressed }) => [styles.quick, { opacity: pressed ? 0.6 : 1 }]}>
                <MaterialCommunityIcons name="crosshairs-gps" size={18} color={theme.colors.primary} />
                <Text style={[styles.quickText, { color: theme.colors.text }]}>내 위치(GPS)로 보기</Text>
              </Pressable>
              {savedLabel !== null && (
                <Pressable accessibilityRole="button" onPress={onSelectSaved} style={({ pressed }) => [styles.quick, { opacity: pressed ? 0.6 : 1 }]}>
                  <MaterialCommunityIcons name="map-marker" size={18} color="#8b5cf6" />
                  <Text style={[styles.quickText, { color: theme.colors.text }]}>저장한 내 위치({savedLabel})</Text>
                </Pressable>
              )}
              <View style={[styles.sidos, { borderTopColor: theme.colors.border, borderBottomColor: theme.colors.border }]}>
                {WEATHER_SIDOS.map((s) => {
                  const active = s === sido;
                  return (
                    <Pressable
                      key={s}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setSido(s)}
                      style={[
                        styles.chip,
                        { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primary : 'transparent' },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: active ? theme.colors.primaryText : theme.colors.textMuted }]}>{s}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          renderItem={({ item: p }) => {
            const selected = p.id === currentPlaceId;
            const label = p.kind === 'city' && p.id === defaultId && places.length > 1 ? `${p.name} (전체)` : p.name;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelectPlace(p)}
                style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={[styles.rowText, { color: theme.colors.text, fontWeight: selected ? '700' : '400' }]}>{label}</Text>
                <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>{p.kind === 'district' ? '구·군' : '시·군'}</Text>
                {selected && <MaterialCommunityIcons name="check" size={18} color={theme.colors.primary} />}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '700' },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  quickText: { fontSize: 15 },
  sidos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { fontSize: 15, flex: 1 },
  rowSub: { fontSize: 11 },
});
