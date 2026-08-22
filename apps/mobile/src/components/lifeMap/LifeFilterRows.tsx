import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import {
  LIFE_CCTV_GROUP_COLOR,
  LIFE_CCTV_PURPOSES,
  LIFE_TOILET_FEATURES,
  LIFE_TOILET_FILTER_KEYS,
  lifeCctvPurposeGroup,
  type LifeCctvPurpose,
  type LifeMapLayer,
  type LifeToiletFilterKey,
} from '@repo/utils';
import type { LifeToiletFilterState } from '~/lib/lifeMapPrefsStore';

// 필터 칩 행 — CCTV 설치목적(다중, 빈 선택 = 전체) / 화장실 편의 조건(AND). 가로 스크롤 한 줄씩.

const FEATURE_LABEL = Object.fromEntries(LIFE_TOILET_FEATURES.map((f) => [f.key, f.label])) as Record<string, string>;

interface Props {
  layers: Record<LifeMapLayer, boolean>;
  purposes: LifeCctvPurpose[];
  toiletFilters: LifeToiletFilterState;
  onTogglePurpose: (p: LifeCctvPurpose) => void;
  onClearPurposes: () => void;
  onToggleToiletFilter: (k: LifeToiletFilterKey) => void;
}

export const LifeFilterRows = ({ layers, purposes, toiletFilters, onTogglePurpose, onClearPurposes, onToggleToiletFilter }: Props) => {
  const theme = useTheme();
  const chip = (key: string, label: string, active: boolean, onPress: () => void, dot?: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: active ? theme.colors.primary : 'transparent' }]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.chipText, { color: active ? theme.colors.primaryText : theme.colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
  if (!layers.cctv && !layers.toilet) return null;
  return (
    <View style={styles.wrap}>
      {layers.cctv && (
        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>설치목적</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {chip('all', '전체', purposes.length === 0, onClearPurposes)}
            {LIFE_CCTV_PURPOSES.map((p) => chip(p, p, purposes.includes(p), () => onTogglePurpose(p), LIFE_CCTV_GROUP_COLOR[lifeCctvPurposeGroup(p)]))}
          </ScrollView>
        </View>
      )}
      {layers.toilet && (
        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>화장실</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {LIFE_TOILET_FILTER_KEYS.map((k) => chip(k, FEATURE_LABEL[k] ?? k, toiletFilters[k], () => onToggleToiletFilter(k)))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { width: 44, fontSize: 11 },
  chips: { gap: 6, paddingRight: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 9, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 11, fontWeight: '500' },
});
