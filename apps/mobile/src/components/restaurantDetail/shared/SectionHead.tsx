import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';

interface Props {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}

// 섹션 헤더 — 제목 + 우측 "전체 보기" 액션 (선택). HomeTab 의 각 미리보기 섹션
// 에서 사용. disabled 면 액션 자체를 숨김.
export const SectionHead = ({ title, actionLabel, onAction, disabled }: Props) => {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {actionLabel && onAction && !disabled && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[styles.action, { color: theme.colors.primary }]}>
            {actionLabel} →
          </Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '600' },
  action: { fontSize: 12, fontWeight: '500' },
});
