import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';

// 화면 머리 — 측정소 이름(탭 → 선택 모달) + 내 주변 / 내 위치 저장 / 새로고침 아이콘 버튼, 아래 메타.

interface Props {
  label: string;
  sub: string;
  fetchedLabel: string | null;
  stale: boolean;
  onOpenPicker: () => void;
  onLocate: () => void;
  locating: boolean;
  savedHere: boolean;
  canSave: boolean;
  saving: boolean;
  onToggleSave: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export const AirStationBar = ({ label, sub, fetchedLabel, stale, onOpenPicker, onLocate, locating, savedHere, canSave, saving, onToggleSave, onRefresh, refreshing }: Props) => {
  const theme = useTheme();
  const iconBtn = (
    name: 'crosshairs-gps' | 'map-marker-check' | 'map-marker-plus' | 'refresh',
    onPress: () => void,
    accessibilityLabel: string,
    opts: { busy?: boolean; active?: boolean; disabled?: boolean } = {},
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={opts.busy || opts.disabled}
      style={({ pressed }) => [
        styles.iconBtn,
        {
          borderColor: opts.active ? theme.colors.primary : theme.colors.border,
          backgroundColor: opts.active ? 'rgba(245,158,11,0.12)' : theme.colors.surface,
          opacity: pressed || opts.disabled ? 0.5 : 1,
        },
      ]}
    >
      {opts.busy ? (
        <ActivityIndicator size="small" color={theme.colors.textMuted} />
      ) : (
        <MaterialCommunityIcons name={name} size={18} color={opts.active ? theme.colors.primary : theme.colors.text} />
      )}
    </Pressable>
  );
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`측정소 선택 — 현재 ${label}`}
          onPress={onOpenPicker}
          style={({ pressed }) => [styles.place, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialCommunityIcons name="map-marker" size={16} color="#8b5cf6" />
          <Text style={[styles.placeText, { color: theme.colors.text }]} numberOfLines={1}>
            {label}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={theme.colors.textMuted} />
        </Pressable>
        {iconBtn('crosshairs-gps', onLocate, '내 주변 측정소 찾기', { busy: locating })}
        {iconBtn(savedHere ? 'map-marker-check' : 'map-marker-plus', onToggleSave, savedHere ? '내 위치 저장 해제' : '이 측정소를 내 위치로 저장', {
          busy: saving,
          active: savedHere,
          disabled: !savedHere && !canSave,
        })}
        {iconBtn('refresh', onRefresh, '새로고침', { busy: refreshing })}
      </View>
      <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {sub}
        {fetchedLabel ? ` · 갱신 ${fetchedLabel}` : ''}
        {stale ? ' · 저장본' : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  place: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  placeText: { flex: 1, fontSize: 14, fontWeight: '600' },
  iconBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  meta: { fontSize: 11, paddingHorizontal: 2 },
});
