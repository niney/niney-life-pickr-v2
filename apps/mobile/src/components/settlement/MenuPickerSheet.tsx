import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MenuItemType } from '@repo/api-contract';
import { useTheme, type Theme } from '@repo/shared';

interface Props {
  open: boolean;
  menus: MenuItemType[];
  onPick: (menu: MenuItemType) => void;
  onClose: () => void;
}

// 식당 등록 메뉴에서 검색해 항목을 추가하는 풀스크린 시트. 차수의 placeId 의
// 식당 메뉴 목록을 Step3 가 전달한다.
export const MenuPickerSheet = ({ open, menus, onPick, onClose }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length === 0) return menus;
    return menus.filter((m) => m.name.toLowerCase().includes(term));
  }, [menus, q]);

  return (
    <Modal
      visible={open}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="formSheet"
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            메뉴에서 추가
          </Text>
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

        <View style={styles.searchWrap}>
          <TextInput
            value={q}
            placeholder="메뉴 검색"
            placeholderTextColor={theme.colors.textMuted}
            onChangeText={setQ}
            style={styles.search}
            autoFocus
          />
        </View>

        {filtered.length === 0 ? (
          <View style={styles.statusBox}>
            <Text
              style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' }}
            >
              {menus.length === 0
                ? '등록된 메뉴가 없습니다.'
                : '검색 결과가 없습니다.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(m, idx) => `${m.name}-${idx}`}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => (
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: theme.colors.border,
                }}
              />
            )}
            renderItem={({ item: m }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onPick(m);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed
                      ? theme.colors.surfaceAlt
                      : 'transparent',
                  },
                ]}
              >
                <Text
                  style={[styles.rowName, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {m.name}
                </Text>
                {m.price && (
                  <Text
                    style={[styles.rowPrice, { color: theme.colors.textMuted }]}
                  >
                    {m.price}
                  </Text>
                )}
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

// '15,000원' / '15000' / null → 정수 또는 null. parsing 결과로 unitPrice 와
// amount 가 세팅된다 (수량 1 기준).
export const parseMenuPrice = (raw: string | null): number | null => {
  if (raw == null) return null;
  const cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: { fontSize: 15, fontWeight: '600' },
    closeButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    searchWrap: { padding: 12 },
    search: {
      fontSize: 15,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      color: theme.colors.text,
      backgroundColor: theme.colors.surface,
    },
    statusBox: { padding: 24, alignItems: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    rowName: { fontSize: 14, fontWeight: '500', flex: 1 },
    rowPrice: { fontSize: 12 },
  });
