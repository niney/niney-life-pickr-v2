import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRestaurantsPublic, useTheme, type Theme } from '@repo/shared';

interface PickedRestaurant {
  placeId: string;
  name: string;
}

interface Props {
  open: boolean;
  // 이미 다른 차수에서 고른 placeId — 중복 차단은 안 하지만 시각적으로 회색.
  alreadyPicked?: Set<string>;
  onClose: () => void;
  onPick: (r: PickedRestaurant) => void;
}

// 차수의 식당을 검색해 고르는 풀스크린 모달. 웹 RestaurantSearchDialog 의
// RN 포팅. useRestaurantsPublic 으로 검색하며 300ms 디바운스.
export const RestaurantPickerSheet = ({
  open,
  alreadyPicked,
  onClose,
  onPick,
}: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 300);
    return () => clearTimeout(t);
  }, [raw]);

  useEffect(() => {
    if (!open) {
      setRaw('');
      setQ('');
    }
  }, [open]);

  const list = useRestaurantsPublic({ q: q || undefined, limit: 30 });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  return (
    <Modal
      visible={open}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="formSheet"
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <TextInput
            autoFocus
            value={raw}
            placeholder="식당명·주소 검색"
            placeholderTextColor={theme.colors.textMuted}
            onChangeText={setRaw}
            style={styles.search}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: pressed
                  ? theme.colors.surfaceAlt
                  : 'transparent',
              },
            ]}
          >
            <Text style={{ color: theme.colors.text, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>

        {q === '' && (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
              검색어를 입력해 주세요.
            </Text>
          </View>
        )}
        {q !== '' && list.isLoading && (
          <View style={styles.empty}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        )}
        {q !== '' && !list.isLoading && items.length === 0 && (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
              결과가 없습니다.
            </Text>
          </View>
        )}

        <FlatList
          data={items}
          keyExtractor={(it) => it.placeId}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: theme.colors.border,
              }}
            />
          )}
          renderItem={({ item }) => {
            const dim = alreadyPicked?.has(item.placeId);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onPick({ placeId: item.placeId, name: item.name });
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed
                      ? theme.colors.surfaceAlt
                      : 'transparent',
                    opacity: dim ? 0.5 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[styles.rowTitle, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={[styles.rowSub, { color: theme.colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {item.category ? `${item.category} · ` : ''}
                    {item.address || item.roadAddress || '주소 없음'}
                  </Text>
                </View>
                {dim && (
                  <Text
                    style={[styles.dimBadge, { color: theme.colors.textMuted }]}
                  >
                    이미 선택됨
                  </Text>
                )}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
};

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    search: {
      flex: 1,
      fontSize: 15,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: _theme.colors.border,
      color: _theme.colors.text,
      backgroundColor: _theme.colors.surface,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: { padding: 32, alignItems: 'center' },
    emptyText: { fontSize: 13 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    rowTitle: { fontSize: 14, fontWeight: '500' },
    rowSub: { fontSize: 12, marginTop: 2 },
    dimBadge: {
      fontSize: 11,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
  });
