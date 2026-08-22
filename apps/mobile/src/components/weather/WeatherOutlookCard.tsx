import { StyleSheet, Text } from 'react-native';
import { SegmentedControl, useTheme } from '@repo/shared';
import { CardTitle, StateBlock } from '~/components/common/Cards';

// 중기전망 — 예보관이 쓴 전망 원문(권역 / 전국 토글). 카드 본문은 호출자(화면)가 상태별로 고른다.

export type OutlookScope = 'region' | 'nation';

interface Props {
  scope: OutlookScope;
  onScope: (s: OutlookScope) => void;
  regionLabel: string;
  tmFcLabel: string | null;
  text: string | null;
  loading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  retrying: boolean;
}

export const WeatherOutlookCard = ({ scope, onScope, regionLabel, tmFcLabel, text, loading, errorMessage, onRetry, retrying }: Props) => {
  const theme = useTheme();
  return (
    <>
      <CardTitle
        title="중기전망"
        sub={`${scope === 'nation' ? '전국' : regionLabel}${tmFcLabel ? ` · ${tmFcLabel} 발표` : ''}`}
        right={
          <SegmentedControl
            fullWidth={false}
            value={scope}
            options={[
              { value: 'region', label: '권역' },
              { value: 'nation', label: '전국' },
            ]}
            onChange={onScope}
          />
        }
      />
      {loading ? (
        <StateBlock kind="loading" />
      ) : errorMessage ? (
        <StateBlock kind="error" message={errorMessage} onRetry={onRetry} retrying={retrying} />
      ) : text ? (
        <Text style={[styles.text, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt }]}>{text}</Text>
      ) : (
        <StateBlock kind="empty" message="이 발표분의 중기전망 원문이 없습니다." />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  text: { fontSize: 13, lineHeight: 20, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
});
