import { StyleSheet, Text, View } from 'react-native';
import { SegmentedControl, useTheme } from '@repo/shared';

interface Props {
  sort: 'positive' | 'negative';
  excludeNeutral: boolean;
  onChangeSort: (next: 'positive' | 'negative') => void;
  onChangeNeutral: (excludeNeutral: boolean) => void;
}

export const RankingHeader = ({
  sort,
  excludeNeutral,
  onChangeSort,
  onChangeNeutral,
}: Props) => {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.colors.text }]}>맛집 랭킹</Text>
      <Text style={[styles.desc, { color: theme.colors.textMuted }]}>
        AI가 분석한 리뷰의 긍정/부정 비율로 정렬한 식당 랭킹입니다. 멘션 5건 이상.
      </Text>

      {/* 행 1개로 묶고 flex-wrap — 너비 여유 있으면 한 줄, 좁으면 자동 개행.
          각 컨트롤은 fullWidth=false 라 content 크기만 차지한다. */}
      <View style={styles.controls}>
        <View style={styles.control}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>정렬</Text>
          <SegmentedControl
            fullWidth={false}
            value={sort}
            options={[
              { value: 'positive', label: '긍정 순위' },
              { value: 'negative', label: '부정 순위' },
            ]}
            onChange={onChangeSort}
          />
        </View>

        <View style={styles.control}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>중립</Text>
          <SegmentedControl
            fullWidth={false}
            value={excludeNeutral ? 'exclude' : 'include'}
            options={[
              { value: 'include', label: '중립 포함' },
              { value: 'exclude', label: '중립 제외' },
            ]}
            onChange={(v) => onChangeNeutral(v === 'exclude')}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  desc: { fontSize: 13, lineHeight: 18 },
  controls: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 16,
    rowGap: 10,
  },
  control: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 12, fontWeight: '500' },
});
