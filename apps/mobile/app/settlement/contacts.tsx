import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SettlementContactType } from '@repo/api-contract';
import {
  ApiError,
  useDeleteSettlementContact,
  useSettlementContacts,
  useTheme,
  useUpdateSettlementContact,
  type Theme,
} from '@repo/shared';

const displayName = (c: SettlementContactType): string => {
  const nm = (c.name ?? '').trim();
  const nick = (c.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || '(이름 없음)';
};

// 단골 관리 — 검색 + 수정/삭제. 삭제는 자동완성에서만 제거, 과거 정산 본문은
// 그대로 남는다 (서버가 contactId 만 SetNull).
export default function ContactsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [q, setQ] = useState('');
  const list = useSettlementContacts({ q: q.trim() || undefined, take: 100 });
  const remove = useDeleteSettlementContact();
  const [editing, setEditing] = useState<SettlementContactType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = (c: SettlementContactType) => {
    const label = displayName(c);
    Alert.alert(
      '단골 삭제',
      `'${label}' 단골을 삭제할까요?\n\n자동완성에서 더 이상 보이지 않습니다. 과거 정산의 본문은 그대로 남습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove.mutateAsync(c.id);
            } catch (e) {
              setError(e instanceof ApiError ? e.message : '삭제 실패');
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '내 단골' }} />
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <View style={[styles.searchWrap, { borderBottomColor: theme.colors.border }]}>
          <TextInput
            value={q}
            placeholder="이름·닉네임으로 검색"
            placeholderTextColor={theme.colors.textMuted}
            onChangeText={setQ}
            style={styles.search}
          />
        </View>

        {list.isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        )}

        {list.isError && (
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>
            단골을 불러오지 못했습니다.
          </Text>
        )}

        {error && (
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>
            {error}
          </Text>
        )}

        <FlatList
          data={list.data?.items ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item: c }) => (
            <ContactRow
              contact={c}
              isDeleting={remove.isPending && remove.variables === c.id}
              onEdit={() => setEditing(c)}
              onDelete={() => confirmDelete(c)}
              theme={theme}
            />
          )}
          ListEmptyComponent={
            list.isSuccess ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                  {q.trim()
                    ? `'${q.trim()}' 에 일치하는 단골이 없습니다.`
                    : '아직 단골이 없습니다. 정산을 저장하면 자동 적립됩니다.'}
                </Text>
              </View>
            ) : null
          }
        />

        <ContactEditSheet
          key={editing?.id ?? 'closed'}
          contact={editing}
          onClose={() => setEditing(null)}
          theme={theme}
        />
      </View>
    </>
  );
}

// 단골 1행 — 별도 컴포넌트로 추출해 FlatList 가 보이는 행만 렌더하고
// React Compiler 가 행 단위로 메모이즈하게 한다.
const ContactRow = ({
  contact: c,
  isDeleting,
  onEdit,
  onDelete,
  theme,
}: {
  contact: SettlementContactType;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  theme: Theme;
}) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const lastUsed = new Date(c.lastUsedAt);
  const usedLabel = `${lastUsed.getFullYear()}-${String(lastUsed.getMonth() + 1).padStart(2, '0')}-${String(lastUsed.getDate()).padStart(2, '0')}`;
  return (
    <View
      style={[
        styles.card,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          opacity: isDeleting ? 0.5 : 1,
        },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.cardName, { color: theme.colors.text }]}
          numberOfLines={1}
        >
          {displayName(c)}
        </Text>
        <View style={styles.tagRow}>
          {c.lastExcludeAlcohol && <Tag theme={theme}>주류 X</Tag>}
          {c.lastExcludeNonAlcohol && <Tag theme={theme}>비주류 X</Tag>}
          {c.lastExcludeSide && <Tag theme={theme}>안주 X</Tag>}
          <Tag theme={theme}>{c.useCount}회</Tag>
          <Tag theme={theme}>최근 {usedLabel}</Tag>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="수정"
          onPress={onEdit}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text style={{ color: theme.colors.text, fontSize: 16 }}>✎</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="삭제"
          disabled={isDeleting}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: pressed
                ? theme.colors.dangerBg
                : 'transparent',
            },
          ]}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={theme.colors.textMuted} />
          ) : (
            <Text style={{ color: theme.colors.textMuted, fontSize: 16 }}>🗑</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
};

interface EditSheetProps {
  contact: SettlementContactType | null;
  onClose: () => void;
  theme: Theme;
}

// 단골 수정 시트 — 이름/닉네임만 수정. 마지막 제외 옵션은 다음 정산이
// 자연스럽게 갱신하므로 수정 UI 에 두지 않는다.
const ContactEditSheet = ({ contact, onClose, theme }: EditSheetProps) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const update = useUpdateSettlementContact();
  // 초기값을 contact 에서 직접 잡는다. contact 가 바뀌면 부모가 key 로 이 시트를
  // 리마운트하므로(아래 <ContactEditSheet key=...>), useEffect/useMemo 로 prop→state
  // 를 동기화할 필요가 없다.
  const [name, setName] = useState(contact?.name ?? '');
  const [nickname, setNickname] = useState(contact?.nickname ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const nm = name.trim();
    const nick = nickname.trim();
    if (!nm && !nick) {
      setError('이름 또는 닉네임 중 하나는 입력해야 합니다.');
      return;
    }
    if (!contact) return;
    try {
      await update.mutateAsync({
        id: contact.id,
        input: { name: nm || null, nickname: nick || null },
      });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  };

  return (
    <Modal
      visible={!!contact}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="formSheet"
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <View style={[styles.editHeader, { borderBottomColor: theme.colors.border }]}>
          <Text style={[styles.editHeaderTitle, { color: theme.colors.text }]}>
            단골 수정
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={onClose}
            style={({ pressed }) => [
              styles.iconButton,
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

        <View style={styles.editForm}>
          <View style={{ gap: 6 }}>
            <Text style={[styles.editLabel, { color: theme.colors.textMuted }]}>
              이름
            </Text>
            <TextInput
              value={name}
              placeholder="홍길동"
              placeholderTextColor={theme.colors.textMuted}
              onChangeText={setName}
              style={styles.editInput}
              maxLength={40}
              autoFocus
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={[styles.editLabel, { color: theme.colors.textMuted }]}>
              닉네임
            </Text>
            <TextInput
              value={nickname}
              placeholder="길동이"
              placeholderTextColor={theme.colors.textMuted}
              onChangeText={setNickname}
              style={styles.editInput}
              maxLength={40}
            />
          </View>

          {error && (
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              {error}
            </Text>
          )}
        </View>

        <View style={[styles.editFooter, { borderTopColor: theme.colors.border }]}>
          <Pressable
            accessibilityRole="button"
            disabled={update.isPending}
            onPress={onClose}
            style={({ pressed }) => [
              styles.ghostBtn,
              {
                backgroundColor: pressed
                  ? theme.colors.surfaceAlt
                  : 'transparent',
              },
            ]}
          >
            <Text style={[styles.ghostBtnText, { color: theme.colors.text }]}>
              취소
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={update.isPending}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: update.isPending
                  ? theme.colors.surfaceAlt
                  : pressed
                    ? theme.colors.primaryHover
                    : theme.colors.primary,
              },
            ]}
          >
            {update.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.text} />
            ) : (
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: theme.colors.primaryText },
                ]}
              >
                저장
              </Text>
            )}
          </Pressable>
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
      paddingVertical: 2,
      borderRadius: 4,
      color: theme.colors.textMuted,
      backgroundColor: theme.colors.surfaceAlt,
    }}
  >
    {children}
  </Text>
);

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    searchWrap: {
      padding: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    search: {
      fontSize: 15,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: _theme.colors.border,
      color: _theme.colors.text,
      backgroundColor: _theme.colors.surface,
    },
    scrollContent: { padding: 16, gap: 8, paddingBottom: 24 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
    },
    cardName: { fontSize: 14, fontWeight: '600' },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
    iconButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    empty: { padding: 32, alignItems: 'center' },
    emptyText: { fontSize: 13, textAlign: 'center' },
    errorText: { fontSize: 12, padding: 16 },
    editHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    editHeaderTitle: { fontSize: 15, fontWeight: '600' },
    editForm: { padding: 16, gap: 12 },
    editLabel: { fontSize: 12, fontWeight: '500' },
    editInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: _theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: _theme.colors.text,
      backgroundColor: _theme.colors.surface,
    },
    editFooter: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    ghostBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    ghostBtnText: { fontSize: 14, fontWeight: '500' },
    primaryBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
    },
    primaryBtnText: { fontSize: 14, fontWeight: '600' },
  });
