import { Pressable, StyleSheet, Text, View } from 'react-native';
// gorhom BottomSheet(맛집 탭) 안에서 가로 스크롤이 안드로이드 제스처 오케스트
// 레이터에 잡히도록 gesture-handler 의 ScrollView 사용. (ReviewCard 와 동일 이유)
import { ScrollView } from 'react-native-gesture-handler';
import { useTheme } from '@repo/shared';
import { TAB_ORDER, type TabKey } from './tabs';

interface Props {
  active: TabKey;
  onChange(next: TabKey): void;
}

// 6개 탭은 좁은 단말에 균등 분할 시 텍스트가 잘려 가로 스크롤로 처리.
// 활성 인디케이터는 라벨 하단 짧은 막대 (instagram/youtube 프로필 패턴).
export const TabBar = ({ active, onChange }: Props) => {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: theme.colors.bg, borderBottomColor: theme.colors.border },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {TAB_ORDER.map((t) => {
          const isActive = active === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => onChange(t.key)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.label,
                  { color: isActive ? theme.colors.text : theme.colors.textMuted },
                  isActive && styles.labelActive,
                ]}
              >
                {t.label}
              </Text>
              <View
                style={[
                  styles.indicator,
                  {
                    backgroundColor: isActive ? theme.colors.primary : 'transparent',
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1 },
  row: { paddingHorizontal: 4 },
  tab: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,
    alignItems: 'center',
  },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  labelActive: { fontWeight: '600' },
  indicator: { height: 2, width: '60%', borderRadius: 1 },
});
