import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@repo/shared';
import type {
  RestaurantInsightsType,
  RestaurantPublicDetailType,
} from '@repo/api-contract';
import { MenuGrid } from './shared/MenuGrid';

interface Props {
  detail: RestaurantPublicDetailType;
  insights: RestaurantInsightsType | undefined;
}

export const MenuTab = ({ detail, insights }: Props) => {
  const theme = useTheme();
  if (detail.menus.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: theme.colors.textMuted }}>등록된 메뉴가 없습니다.</Text>
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <MenuGrid menus={detail.menus} insights={insights} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  empty: { paddingVertical: 48, alignItems: 'center' },
});
