import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { MEAL_DATA_DELETE_CONFIRMATION } from '@repo/api-contract';
import {
  useDeleteAllMealData,
  useExportMealData,
  useMealDraftStore,
  useTheme,
  type Theme,
} from '@repo/shared';
import { Card, CardTitle, Note } from '~/components/common/Cards';
import { loadMealReminderSettings, syncMealReminders } from '~/lib/mealReminders';

export const MealDataManagementCard = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const exportData = useExportMealData();
  const deleteAll = useDeleteAllMealData();
  const clearDraft = useMealDraftStore((state) => state.clear);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setNotice(null);
    try {
      const data = await exportData.mutateAsync();
      const date = data.exportedAt.slice(0, 10);
      const contents = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        await Share.share({ message: contents });
        return;
      }
      const uri = `${FileSystem.cacheDirectory}meal-data-${date}.json`;
      await FileSystem.writeAsStringAsync(uri, contents, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          UTI: 'public.json',
          dialogTitle: '내 식단 데이터 내보내기',
        });
      } else {
        await Share.share({ url: uri });
      }
      setNotice('식단 JSON 파일을 만들었어요. 사진 원본은 개인정보 보호와 용량 때문에 포함되지 않아요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '식단 데이터를 내보내지 못했어요.');
    }
  };

  const runDelete = async () => {
    setError(null);
    setNotice(null);
    try {
      const result = await deleteAll.mutateAsync({ confirmation: MEAL_DATA_DELETE_CONFIRMATION });
      clearDraft();
      // 서버 데이터와 함께 이 기기의 예약 알림도 정리한다. 다른 기능의 로컬 알림은 건드리지 않는다.
      const reminders = await loadMealReminderSettings();
      await syncMealReminders({ enabled: false, slots: [], times: reminders.times }).catch(() => {});
      setConfirmation('');
      setShowDelete(false);
      setNotice(
        `기록 ${result.deleted.entries}개와 사진 ${result.deleted.photos}개를 삭제했어요. 이 작업은 되돌릴 수 없어요.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '식단 데이터를 삭제하지 못했어요.');
    }
  };

  const confirmDelete = () => {
    Alert.alert('식단 데이터 전체 삭제', '기록·사진·추천·선호 설정을 모두 삭제합니다. 계속할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '전체 삭제', style: 'destructive', onPress: () => void runDelete() },
    ]);
  };

  return (
    <Card>
      <CardTitle title="내 데이터" sub="식단 기록은 공개되지 않으며 언제든 내보내거나 전부 지울 수 있어요." />
      <Pressable
        accessibilityRole="button"
        onPress={() => void handleExport()}
        disabled={exportData.isPending || deleteAll.isPending}
        style={[styles.action, { borderColor: theme.colors.border }]}
      >
        <Text style={styles.actionTitle}>{exportData.isPending ? '파일 만드는 중…' : 'JSON으로 내보내기'}</Text>
        <Text style={styles.actionDescription}>기록·사진 메타·추천·선호 설정을 내려받아요. 사진 파일은 제외돼요.</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showDelete }}
        onPress={() => setShowDelete((value) => !value)}
        disabled={deleteAll.isPending}
        style={[styles.action, { borderColor: theme.colors.danger }]}
      >
        <Text style={[styles.actionTitle, { color: theme.colors.danger }]}>식단 데이터 전체 삭제</Text>
        <Text style={styles.actionDescription}>계정은 유지하고 식단 기능의 내 데이터만 영구 삭제해요.</Text>
      </Pressable>

      {showDelete ? (
        <View style={styles.deletePanel}>
          <Text style={styles.warning}>아래 확인 문구를 정확히 입력해야 삭제할 수 있어요.</Text>
          <Text selectable style={styles.confirmationText}>{MEAL_DATA_DELETE_CONFIRMATION}</Text>
          <TextInput
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="확인 문구 입력"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            disabled={confirmation !== MEAL_DATA_DELETE_CONFIRMATION || deleteAll.isPending}
            style={[
              styles.deleteButton,
              {
                backgroundColor: theme.colors.danger,
                opacity: confirmation !== MEAL_DATA_DELETE_CONFIRMATION || deleteAll.isPending ? 0.45 : 1,
              },
            ]}
          >
            <Text style={styles.deleteButtonText}>{deleteAll.isPending ? '삭제 중…' : '영구 삭제'}</Text>
          </Pressable>
        </View>
      ) : null}

      {notice ? <Note tone="muted">{notice}</Note> : null}
      {error ? <Note tone="warn">{error}</Note> : null}
    </Card>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    action: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, padding: 11, gap: 3 },
    actionTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
    actionDescription: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
    deletePanel: { gap: 8, paddingTop: 2 },
    warning: { color: theme.colors.danger, fontSize: 12, lineHeight: 17 },
    confirmationText: {
      color: theme.colors.text,
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      fontSize: 11,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 9,
      color: theme.colors.text,
      fontSize: 12,
    },
    deleteButton: { borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
    deleteButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  });
