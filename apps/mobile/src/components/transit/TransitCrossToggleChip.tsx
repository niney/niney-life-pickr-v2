import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@repo/shared';
import { useTransitCrossShowStore } from '~/lib/transitCrossShowStore';

// 통합 주변 겸표시 토글 칩 — 지도 우상단 오버레이(웹 동명 이식). 버스 모드
// "지하철역 표시" / 지하철 모드 "정류장 표시". on/off 는 스토어(persist) 공유.
// visible=false(주변 모드 아님/집중 모드)면 렌더하지 않는다. top 배치는 부모.
export const TransitCrossToggleChip = ({
  label,
  visible,
  top,
}: {
  label: string;
  visible: boolean;
  top: number;
}) => {
  const theme = useTheme();
  const show = useTransitCrossShowStore((s) => s.show);
  const toggle = useTransitCrossShowStore((s) => s.toggle);
  if (!visible) return null;
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityState={{ selected: show }}
      style={[
        styles.chip,
        { top, backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Text style={[styles.text, { color: show ? theme.colors.text : theme.colors.textMuted }]}>
        {show ? '👁' : '−'} {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    right: 12,
    zIndex: 14,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  text: { fontSize: 11, fontWeight: '600' },
});
