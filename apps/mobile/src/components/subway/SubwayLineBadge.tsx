import { StyleSheet, Text, View } from 'react-native';
import { subwayLineColor, subwayLineShortLabel } from '@repo/utils';

// 노선 뱃지 — 배경=노선색, 텍스트=축약 라벨(흰색). 리스트/패널 공용(웹 동명
// 컴포넌트 이식). '1'/'2' 처럼 1~2글자는 원형, '경중'/'신분당' 처럼 길면
// 알약(가변폭)으로 자연 분기.
interface Props {
  lineId: string;
  size?: 'sm' | 'md';
}

export const SubwayLineBadge = ({ lineId, size = 'sm' }: Props) => {
  const label = subwayLineShortLabel(lineId);
  const isShort = label.length <= 2;
  const height = size === 'sm' ? 20 : 24;
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: subwayLineColor(lineId),
          height,
          borderRadius: height / 2,
          ...(isShort ? { width: height } : { paddingHorizontal: size === 'sm' ? 6 : 8 }),
        },
      ]}
    >
      <Text style={[styles.label, { fontSize: size === 'sm' ? 11 : 12 }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    color: '#fff',
    fontWeight: '700',
    // 원형 뱃지에서 한 글자가 세로 중앙에 오도록 — lineHeight 명시.
    lineHeight: 13,
  },
});
