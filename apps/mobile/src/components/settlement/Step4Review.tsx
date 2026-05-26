import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';

interface Props {
  onBack: () => void;
  editingId: string | null;
  fromDraftId: string | null;
}

// #71 에서 실제 구현 — 현재는 wizard 셸 검증용 placeholder. 저장 mutation 은
// 추후 구현되며, editingId / fromDraftId 는 그 시점에 활용된다.
export const Step4Review = ({ onBack, editingId, fromDraftId }: Props) => {
  const theme = useTheme();
  // lint 회피용 참조 — 추후 useUpdateSettlement / useCreateSettlement 인자에 그대로
  // 들어간다.
  void editingId;
  void fromDraftId;
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>4. 검토</Text>
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
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 14 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  buttonGhost: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonText: { fontSize: 14, fontWeight: '600' },
});
