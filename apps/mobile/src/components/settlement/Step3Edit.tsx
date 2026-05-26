import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';

interface Props {
  onBack: () => void;
  onNext: () => void;
}

// #70 에서 실제 구현 — 현재는 wizard 셸 검증용 placeholder.
export const Step3Edit = ({ onBack, onNext }: Props) => {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>3. 편집</Text>
      <Text style={[styles.body, { color: theme.colors.textMuted }]}>
        곧 구현됩니다.
      </Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.buttonGhost,
            {
              borderColor: theme.colors.border,
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.colors.text }]}>
            이전
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onNext}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: pressed
                ? theme.colors.primaryHover
                : theme.colors.primary,
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.colors.primaryText }]}>
            다음
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 14 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  buttonGhost: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonText: { fontSize: 14, fontWeight: '600' },
});
