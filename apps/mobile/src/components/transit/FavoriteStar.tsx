import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@repo/shared';

// 즐겨찾기 별 토글 — 버스/지하철 공용(웹 BusFavoriteStar 이식).
interface Props {
  active: boolean;
  onToggle(): void;
  label: string;
}

export const FavoriteStar = ({ active, onToggle, label }: Props) => {
  const theme = useTheme();
  const amber = theme.mode === 'dark' ? '#fbbf24' : '#f59e0b';
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={styles.btn}
    >
      <Text style={{ fontSize: 16, color: active ? amber : theme.colors.textMuted }}>
        {active ? '★' : '☆'}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
