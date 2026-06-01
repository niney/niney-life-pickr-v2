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
import type { SettlementContactType } from '@repo/api-contract';
import {
  ApiError,
  useSettlementContacts,
  useTheme,
  type Theme,
} from '@repo/shared';
import { displayName } from './ContactSuggestions';

interface Props {
  open: boolean;
  // 이미 추가된 단골 (contactId 또는 normalizedKey 일치) — 회색 처리.
  existingContactIds: Set<string>;
  existingKeys: Set<string>;
  onClose: () => void;
  onConfirm: (picked: SettlementContactType[]) => void;
}

// 단골에서 다중 선택 — 한 번에 N명 append. 풀스크린 모달 (RestaurantPickerSheet 와 동일 패턴).
export const ContactPickerSheet = ({
  open,
  existingContactIds,
  existingKeys,
  onClose,
  onConfirm,
}: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSelected(new Set());
  }, [open]);

  const list = useSettlementContacts({
    q: q.trim() || undefined,
    take: 100,
  });

  const items = list.data?.items ?? [];

  const isAlreadyAdded = (c: SettlementContactType) => {
    if (existingContactIds.has(c.id)) return true;
    const key = normalizeContactKey(c.name, c.nickname);
    return existingKeys.has(key);
  };

  const toggle = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const picked = items.filter((c) => selected.has(c.id));
    onConfirm(picked);
    onClose();
  };

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
            단골에서 추가
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
            placeholder="이름·닉네임 검색"
            placeholderTextColor={theme.colors.textMuted}
            onChangeText={setQ}
            style={styles.search}
          />
        </View>

        {list.isLoading && (
          <View style={styles.statusBox}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        )}

        {list.isError && (
          <View style={styles.statusBox}>
            <Text style={{ color: theme.colors.danger, fontSize: 13 }}>
              단골을 불러오지 못했습니다.
              {list.error instanceof ApiError ? `\n${list.error.message}` : ''}
            </Text>
          </View>
        )}

        {list.data && items.length === 0 && (
          <View style={styles.statusBox}>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' }}>
              {q.trim()
                ? `'${q.trim()}' 에 일치하는 단골이 없습니다`
                : '아직 단골이 없습니다 — 정산을 저장하면 자동 적립됩니다'}
            </Text>
          </View>
        )}

        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: theme.colors.border,
              }}
            />
          )}
          renderItem={({ item: c }) => {
            const already = isAlreadyAdded(c);
            const checked = selected.has(c.id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: already }}
                disabled={already}
                onPress={() => toggle(c.id)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: checked
                      ? theme.colors.dangerBg
                      : pressed && !already
                        ? theme.colors.surfaceAlt
                        : 'transparent',
                    opacity: already ? 0.5 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: checked ? theme.colors.primary : theme.colors.border,
                      backgroundColor: checked ? theme.colors.primary : 'transparent',
                    },
                  ]}
                >
                  {checked && (
                    <Text
                      style={{
                        color: theme.colors.primaryText,
                        fontSize: 12,
                        fontWeight: '700',
                      }}
                    >
                      ✓
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[styles.rowName, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {displayName(c)}
                  </Text>
                  <View style={styles.tagRow}>
                    {c.lastExcludeAlcohol && (
                      <Tag theme={theme}>주류 X</Tag>
                    )}
                    {c.lastExcludeNonAlcohol && (
                      <Tag theme={theme}>비주류 X</Tag>
                    )}
                    {c.lastExcludeSide && <Tag theme={theme}>안주 X</Tag>}
                    <Tag theme={theme}>{c.useCount}회</Tag>
                  </View>
                </View>
                {already && (
                  <Text
                    style={[styles.alreadyBadge, { color: theme.colors.textMuted }]}
                  >
                    이미 추가됨
                  </Text>
                )}
              </Pressable>
            );
          }}
        />

        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>
            {selected.size > 0 ? `${selected.size}명 선택됨` : '선택 없음'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.ghostButton,
                {
                  backgroundColor: pressed
                    ? theme.colors.surfaceAlt
                    : 'transparent',
                },
              ]}
            >
              <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>
                취소
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={selected.size === 0}
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor:
                    selected.size === 0
                      ? theme.colors.surfaceAlt
                      : pressed
                        ? theme.colors.primaryHover
                        : theme.colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  {
                    color:
                      selected.size === 0
                        ? theme.colors.textMuted
                        : theme.colors.primaryText,
                  },
                ]}
              >
                추가
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const Tag = ({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: Theme;
}) => (
  <Text
    style={{
      fontSize: 10,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
      color: theme.colors.textMuted,
      backgroundColor: theme.colors.surfaceAlt,
    }}
  >
    {children}
  </Text>
);

// 서버 normalizeContactKey 와 동일 — 직접 타이핑한 행과 단골 중복 인식.
export const normalizeContactKey = (
  name: string | null,
  nickname: string | null,
): string => {
  const n = (name ?? '').trim().toLowerCase();
  const k = (nickname ?? '').trim().toLowerCase();
  return `${n}|${k}`;
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
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowName: { fontSize: 14, fontWeight: '500' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
    alreadyBadge: {
      fontSize: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: theme.colors.surfaceAlt,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    footerText: { fontSize: 12 },
    ghostButton: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
    },
    ghostButtonText: { fontSize: 14, fontWeight: '500' },
    primaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    primaryButtonText: { fontSize: 14, fontWeight: '600' },
  });
