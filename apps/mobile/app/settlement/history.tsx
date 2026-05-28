import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  ApiError,
  useDeleteSettlement,
  useDeleteSettlementDraft,
  useListSettlementDrafts,
  useListSettlements,
  useTheme,
  type Theme,
} from '@repo/shared';
import type {
  SettlementDraftType,
  SettlementSessionSummaryType,
} from '@repo/api-contract';

// 정산 이력 — 최근순 단순 리스트. 임시저장(draft) 도 상단에 같이 노출.
// 페이지네이션은 추후 (현재 한 번에 50건). 다중 선택은 생략 — 행 트레일링
// 삭제 버튼 + Alert confirm.
export default function SettlementHistoryScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const list = useListSettlements({ offset: 0, limit: 50 });
  const drafts = useListSettlementDrafts(true);
  const deleteMut = useDeleteSettlement();
  const deleteDraft = useDeleteSettlementDraft();
  const [error, setError] = useState<string | null>(null);

  const items = list.data?.items ?? [];
  const draftItems = drafts.data?.items ?? [];

  const confirmDelete = (id: string, label: string) => {
    Alert.alert(
      '정산 삭제',
      `'${label}' 이력을 삭제할까요? 되돌릴 수 없습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMut.mutateAsync(id);
            } catch (e) {
              setError(e instanceof ApiError ? e.message : '삭제 실패');
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const confirmDeleteDraft = (d: SettlementDraftType) => {
    Alert.alert(
      '임시저장 삭제',
      '이 임시저장을 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () =>
            deleteDraft.mutate(d.id, {
              onError: (e) =>
                setError(e instanceof ApiError ? e.message : '임시저장 삭제 실패'),
            }),
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: '내 정산 이력' }} />
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        {(list.isLoading || drafts.isLoading) && items.length === 0 && (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.text} />
          </View>
        )}

        {error && (
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>
            {error}
          </Text>
        )}

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/settlement/new')}
            style={({ pressed }) => [
              styles.newButton,
              {
                backgroundColor: pressed
                  ? theme.colors.primaryHover
                  : theme.colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.newButtonText,
                { color: theme.colors.primaryText },
              ]}
            >
              + 새 정산
            </Text>
          </Pressable>

          {draftItems.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>
                이어 입력 {draftItems.length}건
              </Text>
              {draftItems.map((d) => (
                <DraftRow
                  key={d.id}
                  draft={d}
                  isDeleting={
                    deleteDraft.isPending && deleteDraft.variables === d.id
                  }
                  onPress={() => {
                    if (d.placeId) {
                      router.push(`/restaurant/${d.placeId}/settle/new`);
                    } else {
                      router.push('/settlement/new');
                    }
                  }}
                  onDelete={() => confirmDeleteDraft(d)}
                  theme={theme}
                />
              ))}
            </View>
          )}

          {items.length > 0 && (
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.textMuted, marginTop: 12 },
              ]}
            >
              저장된 정산 {list.data?.total ?? items.length}건
            </Text>
          )}

          {items.map((item) => (
            <SessionRow
              key={item.id}
              session={item}
              isDeleting={
                deleteMut.isPending && deleteMut.variables === item.id
              }
              onPress={() =>
                router.push(
                  `/restaurant/${item.restaurantPlaceId}/settle/${item.id}`,
                )
              }
              onDelete={() => {
                const label = `${item.restaurantName}${item.roundCount > 1 ? ` 외 ${item.roundCount - 1}곳` : ''}`;
                confirmDelete(item.id, label);
              }}
              theme={theme}
            />
          ))}

          {list.isSuccess && items.length === 0 && draftItems.length === 0 && (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
                아직 저장된 정산이 없습니다.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const SessionRow = ({
  session,
  isDeleting,
  onPress,
  onDelete,
  theme,
}: {
  session: SettlementSessionSummaryType;
  isDeleting: boolean;
  onPress: () => void;
  onDelete: () => void;
  theme: Theme;
}) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const created = new Date(session.createdAt);
  const dateLabel = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
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
      <Pressable
        accessibilityRole="button"
        disabled={isDeleting}
        onPress={onPress}
        style={({ pressed }) => [
          styles.cardBody,
          {
            backgroundColor: pressed
              ? theme.colors.surfaceAlt
              : 'transparent',
          },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.cardTitle, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {session.restaurantName}
            {session.roundCount > 1 ? ` 외 ${session.roundCount - 1}곳` : ''}
          </Text>
          <Text
            style={[styles.cardMeta, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {dateLabel} · 항목 {session.itemCount} · 참여 {session.participantCount}명
            {session.roundCount > 1 ? ` · ${session.roundCount}차` : ''}
          </Text>
        </View>
        <Text style={[styles.cardAmount, { color: theme.colors.text }]}>
          {session.grandTotal.toLocaleString('ko-KR')}원
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="삭제"
        disabled={isDeleting}
        onPress={onDelete}
        style={({ pressed }) => [
          styles.cardDelete,
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
  );
};

const DraftRow = ({
  draft,
  isDeleting,
  onPress,
  onDelete,
  theme,
}: {
  draft: SettlementDraftType;
  isDeleting: boolean;
  onPress: () => void;
  onDelete: () => void;
  theme: Theme;
}) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const updated = new Date(draft.updatedAt);
  const dateLabel = `${updated.getFullYear()}-${String(updated.getMonth() + 1).padStart(2, '0')}-${String(updated.getDate()).padStart(2, '0')} ${String(updated.getHours()).padStart(2, '0')}:${String(updated.getMinutes()).padStart(2, '0')}`;
  return (
    <View
      style={[
        styles.card,
        styles.cardDashed,
        {
          borderColor: theme.colors.border,
          opacity: isDeleting ? 0.5 : 1,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        disabled={isDeleting}
        onPress={onPress}
        style={({ pressed }) => [
          styles.cardBody,
          {
            backgroundColor: pressed
              ? theme.colors.surfaceAlt
              : 'transparent',
          },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.cardTitle, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {draft.placeNameHint ?? '식당 미지정'}
          </Text>
          <Text
            style={[styles.cardMeta, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {dateLabel} · 자동 저장됨
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="삭제"
        disabled={isDeleting}
        onPress={onDelete}
        style={({ pressed }) => [
          styles.cardDelete,
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
  );
};

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    scrollContent: { padding: 16, gap: 8, paddingBottom: 24 },
    sectionTitle: { fontSize: 12, fontWeight: '600' },
    errorText: { fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
    newButton: {
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    newButtonText: { fontSize: 14, fontWeight: '600' },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    cardDashed: { borderStyle: 'dashed', backgroundColor: 'transparent' },
    cardBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    cardTitle: { fontSize: 14, fontWeight: '600' },
    cardMeta: { fontSize: 11, marginTop: 2 },
    cardAmount: { fontSize: 14, fontWeight: '700' },
    cardDelete: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: { padding: 32, alignItems: 'center' },
    emptyText: { fontSize: 13 },
  });
