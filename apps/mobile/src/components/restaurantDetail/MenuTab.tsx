import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore, useTheme } from '@repo/shared';
import type {
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { MenuGrid } from './shared/MenuGrid';

interface Props {
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
  onSelectMenu(name: string): void;
}

export const MenuTab = ({ detail, insights, onSelectMenu }: Props) => {
  const theme = useTheme();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const onSettlePress = () => {
    if (!token) {
      router.push('/(auth)/login' as never);
      return;
    }
    router.push(`/restaurant/${detail.placeId}/settle/new` as never);
  };

  return (
    <View style={styles.wrap}>
      {/* 정산 진입점 — 메뉴를 본 뒤 바로 정산으로 갈 수 있게 탭 최상단 CTA.
          헤더에는 두지 않음 — '메뉴를 봤다 → 정산한다' 의도가 가장 자연스럽다. */}
      <Pressable
        onPress={onSettlePress}
        android_ripple={{ color: theme.colors.primaryHover }}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: pressed ? theme.colors.primaryHover : theme.colors.primary },
        ]}
      >
        <Text style={styles.ctaIcon}>🧮</Text>
        <View style={styles.ctaMid}>
          <Text style={[styles.ctaTitle, { color: theme.colors.primaryText }]}>
            이 메뉴로 정산하기
          </Text>
          <Text style={[styles.ctaDesc, { color: theme.colors.primaryText }]}>
            영수증 사진 또는 직접 입력 · 친구별 분담 자동 계산
          </Text>
        </View>
        <Text style={[styles.ctaChev, { color: theme.colors.primaryText }]}>›</Text>
      </Pressable>

      {detail.menus.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.colors.textMuted }}>등록된 메뉴가 없습니다.</Text>
        </View>
      ) : (
        <MenuGrid menus={detail.menus} insights={insights} onSelectMenu={onSelectMenu} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  ctaIcon: { fontSize: 26, width: 32, textAlign: 'center' },
  ctaMid: { flex: 1, minWidth: 0 },
  ctaTitle: { fontSize: 15, fontWeight: '700' },
  ctaDesc: { fontSize: 11, marginTop: 2, opacity: 0.85 },
  ctaChev: { fontSize: 24, fontWeight: '300' },
  empty: { paddingVertical: 48, alignItems: 'center' },
});
