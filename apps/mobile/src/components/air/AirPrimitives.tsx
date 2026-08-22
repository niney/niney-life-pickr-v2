import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { AirGradeLevel } from '@repo/utils';
import { airGradeColor, airGradeColorFromText, type AirGradeColor } from '~/lib/airGradeColor';

// 대기 공용 조각 — 등급 배지(점 + 글자, 틴트 배경)와 점. 색만으로 뜻을 전하지 않는다.

export const AirGradeBadge = ({ grade, text, size = 'sm' }: { grade?: AirGradeLevel | null; text?: string | null; size?: 'sm' | 'md' }) => {
  const theme = useTheme();
  const c: AirGradeColor = text !== undefined ? airGradeColorFromText(text) : airGradeColor(grade);
  return (
    <View style={[styles.badge, { backgroundColor: c.tint }, size === 'md' && styles.badgeMd]}>
      <View style={[styles.dot, { backgroundColor: c.hex }]} />
      <Text style={[styles.badgeText, { color: theme.colors.text }, size === 'md' && styles.badgeTextMd]}>{c.label}</Text>
    </View>
  );
};

export const AirGradeDot = ({ grade, size = 8 }: { grade: AirGradeLevel | null | undefined; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: airGradeColor(grade).hex }} />
);

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeMd: { paddingHorizontal: 8, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextMd: { fontSize: 14 },
});
