import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type { RestaurantPublicDetailType } from '@repo/api-contract';

interface Props {
  detail: RestaurantPublicDetailType;
}

// 빠른 행동 — 길찾기/네이버지도/전화. 웹의 <a target="_blank"> / tel: 를
// Linking.openURL 로 치환. 좌표 없으면 길찾기도 검색 페이지로 fallback.
export const QuickActions = ({ detail }: Props) => {
  const theme = useTheme();
  const naverSearch = `https://map.naver.com/p/search/${encodeURIComponent(detail.name)}`;
  const directionsUrl =
    detail.latitude !== null && detail.longitude !== null
      ? `https://map.naver.com/p/directions/-/${detail.longitude},${detail.latitude},${encodeURIComponent(detail.name)}/-/transit?c=15`
      : naverSearch;

  const open = (url: string) => {
    Linking.openURL(url).catch(() => {
      /* 일부 단말이 매핑된 앱이 없으면 실패할 수 있음 — 무시 */
    });
  };

  return (
    <View style={styles.row}>
      <ActionBtn
        label="길찾기"
        primary
        onPress={() => open(directionsUrl)}
      />
      <ActionBtn label="네이버 지도" onPress={() => open(detail.rawSourceUrl)} />
      {detail.phone && (
        <ActionBtn label="전화" onPress={() => open(`tel:${detail.phone}`)} />
      )}
      <View style={{ flex: 1 }} />
      <Text style={[styles.note, { color: theme.colors.textMuted }]} />
    </View>
  );
};

const ActionBtn = ({
  label,
  onPress,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.btn,
        primary
          ? { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }
          : { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
      ]}
    >
      <Text
        style={[
          styles.btnText,
          { color: primary ? theme.colors.primaryText : theme.colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnText: { fontSize: 13, fontWeight: '600' },
  note: { fontSize: 11 },
});
