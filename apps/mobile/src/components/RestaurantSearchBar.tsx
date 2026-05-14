import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '@repo/shared';
import type { RestaurantPublicListQueryType } from '@repo/api-contract';

type SortKey = NonNullable<RestaurantPublicListQueryType['sort']>;

// 웹 RestaurantsPage/PublicRestaurantList 와 동일한 칩 목록.
export const CATEGORY_CHIPS: ReadonlyArray<string> = [
  '한식',
  '일식',
  '중식',
  '카페',
  '디저트',
  '술집',
  '양식',
  '분식',
];

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'recent', label: '최신' },
  { value: 'satisfaction', label: '만족도' },
  { value: 'positive', label: '긍정' },
  { value: 'rating', label: '별점' },
];

interface Props {
  q: string;
  category: string | null;
  sort: SortKey;
  total: number;
  onChangeQ(next: string): void;
  onChangeCategory(next: string | null): void;
  onChangeSort(next: SortKey): void;
}

// 검색 input + 카테고리 칩 가로 스크롤 + 정렬 칩 + 총 개수.
// 검색은 디바운스 300ms — 글자마다 fetch 방지. 한글 IME 는 RN 의 onChangeText 가
// 자체 처리하므로 웹의 compositionRef 트릭 불필요.
export const RestaurantSearchBar = ({
  q,
  category,
  sort,
  total,
  onChangeQ,
  onChangeCategory,
  onChangeSort,
}: Props) => {
  const theme = useTheme();
  const [draft, setDraft] = useState(q);

  useEffect(() => {
    // 외부에서 q 가 reset 되면 draft 도 동기화 (예: 카테고리 변경 후 reset).
    setDraft(q);
  }, [q]);

  useEffect(() => {
    if (draft === q) return;
    const t = setTimeout(() => onChangeQ(draft), 300);
    return () => clearTimeout(t);
  }, [draft, q, onChangeQ]);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.searchBox,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="식당명, 카테고리, 메뉴로 검색"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { color: theme.colors.text }]}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {draft.length > 0 && (
          <Pressable
            onPress={() => {
              setDraft('');
              onChangeQ('');
            }}
            hitSlop={10}
            style={styles.clearBtn}
          >
            <Text style={{ color: theme.colors.textMuted, fontSize: 16 }}>✕</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {CATEGORY_CHIPS.map((c) => {
          const active = category === c;
          return (
            <Chip
              key={c}
              label={c}
              active={active}
              onPress={() => onChangeCategory(active ? null : c)}
            />
          );
        })}
      </ScrollView>

      <View style={styles.bottomRow}>
        <Text style={[styles.totalText, { color: theme.colors.textMuted }]}>
          총 {total}곳
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
        >
          {SORT_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              label={o.label}
              active={sort === o.value}
              onPress={() => onChangeSort(o.value)}
              small
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const Chip = ({
  label,
  active,
  onPress,
  small = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
}) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        small ? styles.chipSmall : styles.chip,
        {
          backgroundColor: active ? theme.colors.primary : theme.colors.surface,
          borderColor: active ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      <Text
        style={[
          small ? styles.chipLabelSmall : styles.chipLabel,
          { color: active ? theme.colors.primaryText : theme.colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingBottom: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 0 },
  clearBtn: { paddingLeft: 8, paddingVertical: 4 },
  chipsRow: { gap: 6, paddingHorizontal: 0 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 12, fontWeight: '500' },
  chipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipLabelSmall: { fontSize: 11, fontWeight: '500' },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  totalText: { fontSize: 12, fontVariant: ['tabular-nums'] },
  sortRow: { gap: 4 },
});
