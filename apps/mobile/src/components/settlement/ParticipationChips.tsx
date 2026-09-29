import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  PARTICIPATION_AXES,
  type ExcludeKey,
  type ParticipationFlags,
  type Theme,
} from '@repo/shared';

// 참여 축(술·음료·안주) 토글 칩 — 라벨·축 규칙은 @repo/shared participation,
// 여기는 앱 표현(아이콘·스타일)만. 웹 ParticipationChips 와 같은 상태 표현.

const AXIS_ICON: Record<ExcludeKey, keyof typeof MaterialCommunityIcons.glyphMap> = {
  excludeAlcohol: 'glass-mug-variant',
  excludeNonAlcohol: 'cup-outline',
  excludeSide: 'silverware-fork-knife',
};

// 참여자 한 명의 술·음료·안주 토글 묶음. 켜짐(기본)=분담, 탭하면 빠짐.
// 켜짐은 강조색 외곽선만(기본 상태가 요란하지 않게), 빠짐은 점선·취소선으로
// 흐리게 — "누가 빠졌나" 가 한눈에 튄다.
export const ParticipationToggles = ({
  value,
  onChange,
  theme,
  size = 'md',
}: {
  value: ParticipationFlags;
  onChange: (key: ExcludeKey, exclude: boolean) => void;
  theme: Theme;
  size?: 'md' | 'sm';
}) => {
  const sm = size === 'sm';
  return (
    <View style={styles.row}>
      {PARTICIPATION_AXES.map((axis) => {
        const joined = !value[axis.key];
        const color = joined ? theme.colors.text : theme.colors.textMuted;
        return (
          <Pressable
            key={axis.key}
            accessibilityRole="switch"
            accessibilityState={{ checked: joined }}
            accessibilityLabel={`${axis.label} 분담`}
            onPress={() => onChange(axis.key, joined)}
            style={({ pressed }) => [
              styles.chip,
              sm ? styles.chipSm : styles.chipMd,
              {
                borderColor: joined ? theme.colors.primary : theme.colors.border,
                borderStyle: joined ? 'solid' : 'dashed',
                backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
                opacity: joined ? 1 : 0.7,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={AXIS_ICON[axis.key]}
              size={sm ? 12 : 14}
              color={joined ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text
              style={{
                fontSize: sm ? 11 : 12,
                fontWeight: '500',
                color,
                textDecorationLine: joined ? 'none' : 'line-through',
              }}
            >
              {axis.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipMd: { paddingHorizontal: 10, paddingVertical: 6 },
  chipSm: { paddingHorizontal: 8, paddingVertical: 4 },
});
