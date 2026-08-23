import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import type * as DocumentPickerModule from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  MEAL_DATA_BACKUP_MAX_JSON_BYTES,
  MEAL_DATA_DELETE_CONFIRMATION,
  MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION,
  MealDataBackup,
} from '@repo/api-contract';
import {
  useBackupMealData,
  useDeleteAllMealData,
  useDeleteRetainedMealPhotos,
  useExportMealData,
  useMealDraftStore,
  usePreviewMealPhotoRetention,
  useRestoreMealData,
  useTheme,
  type Theme,
} from '@repo/shared';
import { Card, CardTitle, Note } from '~/components/common/Cards';
import { loadMealReminderSettings, syncMealReminders } from '~/lib/mealReminders';
import { clearMealPhotoCache } from '~/lib/mealPhotoCache';

// expo-document-picker 는 **네이티브 모듈**이라 JS 번들만 갱신된 dev client 에서는 없을 수 있다.
// 최상위에서 import 하면 모듈 로드 자체가 터져 설정 탭은 물론 식단 화면 전체가 빈 화면이 된다
// (시뮬레이터 실측). 그래서 실제로 파일을 고를 때만 지연 로드하고, 없으면 안내로 끝낸다.
const loadDocumentPicker = (): typeof DocumentPickerModule | null => {
  try {
    return require('expo-document-picker') as typeof DocumentPickerModule;
  } catch {
    return null;
  }
};


export const MealDataManagementCard = () => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const exportData = useExportMealData();
  const backupData = useBackupMealData();
  const restoreData = useRestoreMealData();
  const retentionPreview = usePreviewMealPhotoRetention();
  const deleteRetainedPhotos = useDeleteRetainedMealPhotos();
  const deleteAll = useDeleteAllMealData();
  const clearDraft = useMealDraftStore((state) => state.clear);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy =
    exportData.isPending ||
    backupData.isPending ||
    restoreData.isPending ||
    retentionPreview.isPending ||
    deleteRetainedPhotos.isPending ||
    deleteAll.isPending;

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

  const handleBackup = async () => {
    setError(null);
    setNotice(null);
    try {
      const data = await backupData.mutateAsync();
      const date = data.exportedAt.slice(0, 10);
      const contents = JSON.stringify(data);
      if (Platform.OS === 'web') {
        await Share.share({ message: contents });
        return;
      }
      const uri = `${FileSystem.cacheDirectory}meal-backup-${date}.mealbackup.json`;
      await FileSystem.writeAsStringAsync(uri, contents, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          UTI: 'public.json',
          dialogTitle: '사진 포함 식단 백업',
        });
      } else {
        await Share.share({ url: uri });
      }
      const orphanMessage = data.notice.orphanPhotosSkipped
        ? ` 저장하지 않은 고아 사진 ${data.notice.orphanPhotosSkipped}장은 제외했어요.`
        : '';
      setNotice(
        `사진 ${data.photos.length}장을 포함한 복원용 백업을 만들었어요.${orphanMessage} 암호화되지 않은 파일이니 안전한 위치에 보관해 주세요.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진 포함 백업을 만들지 못했어요.');
    }
  };

  const handleRestore = async () => {
    setError(null);
    setNotice(null);
    try {
      const documentPicker = loadDocumentPicker();
      if (!documentPicker) {
        throw new Error('이 앱 빌드에는 파일 선택 모듈이 없어요. 앱을 새로 빌드하면 백업 불러오기가 켜집니다.');
      }
      const picked = await documentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset) return;
      if (asset.size !== undefined && asset.size > MEAL_DATA_BACKUP_MAX_JSON_BYTES) {
        throw new Error('백업 파일이 허용 크기(75MB)를 넘었어요.');
      }
      const text = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (text.length > MEAL_DATA_BACKUP_MAX_JSON_BYTES) {
        throw new Error('백업 파일이 허용 크기(75MB)를 넘었어요.');
      }
      const parsed = MealDataBackup.safeParse(JSON.parse(text) as unknown);
      if (!parsed.success) {
        throw new Error(`지원하지 않거나 손상된 식단 백업이에요: ${parsed.error.issues[0]?.message ?? '형식 오류'}`);
      }
      const result = await restoreData.mutateAsync(parsed.data);
      await clearMealPhotoCache().catch(() => {});
      setNotice(
        result.duplicate
          ? '이미 복원한 같은 백업이라 중복으로 추가하지 않았어요.'
          : `기록 ${result.restored.entries}개와 사진 ${result.restored.photos}개를 복원했어요. 기존 기록은 그대로 유지했어요.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '식단 백업을 복원하지 못했어요.');
    }
  };

  const runPhotoRetention = async (before: string) => {
    try {
      const result = await deleteRetainedPhotos.mutateAsync({
        before,
        confirmation: MEAL_PHOTO_RETENTION_DELETE_CONFIRMATION,
      });
      await clearMealPhotoCache().catch(() => {});
      setNotice(
        result.deleted.pendingFileSets > 0
          ? `사진 ${result.deleted.totalPhotos}장의 기록을 정리했어요. 사진 ${result.deleted.pendingFileSets}장의 파일은 자동으로 다시 정리해요. 음식·메모 기록은 그대로 남아 있어요.`
          : `사진 ${result.deleted.totalPhotos}장을 정리했어요. 식단의 음식·메모 기록은 그대로 남아 있어요.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '오래된 사진을 정리하지 못했어요.');
    }
  };

  const handlePhotoRetention = async () => {
    setError(null);
    setNotice(null);
    try {
      const before = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      const preview = await retentionPreview.mutateAsync(before);
      if (preview.totalPhotos === 0) {
        setNotice('90일 이전에 정리할 식단 사진이 없어요.');
        return;
      }
      const mb = (preview.totalBytes / 1024 / 1024).toFixed(1);
      Alert.alert(
        '오래된 사진만 정리',
        `90일 이전 기록 ${preview.entries}개의 사진 ${preview.attachedPhotos}장과 저장되지 않은 사진 ${preview.orphanPhotos}장(${mb}MB)을 지웁니다. 음식·메모 기록은 남아요.`,
        [
          { text: '취소', style: 'cancel' },
          { text: '사진 정리', style: 'destructive', onPress: () => void runPhotoRetention(before) },
        ],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '정리할 사진을 확인하지 못했어요.');
    }
  };

  const runDelete = async () => {
    setError(null);
    setNotice(null);
    try {
      const result = await deleteAll.mutateAsync({ confirmation: MEAL_DATA_DELETE_CONFIRMATION });
      clearDraft();
      await clearMealPhotoCache().catch(() => {});
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
        disabled={busy}
        style={[styles.action, { borderColor: theme.colors.border }]}
      >
        <Text style={styles.actionTitle}>{exportData.isPending ? '파일 만드는 중…' : 'JSON으로 내보내기'}</Text>
        <Text style={styles.actionDescription}>기록·사진 메타·추천·선호 설정을 내려받아요. 사진 파일은 제외돼요.</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => void handleBackup()}
        disabled={busy}
        style={[styles.action, { borderColor: theme.colors.border }]}
      >
        <Text style={styles.actionTitle}>{backupData.isPending ? '백업 만드는 중…' : '사진 포함 백업'}</Text>
        <Text style={styles.actionDescription}>사진·메모를 평문 파일에 담아 복원해요. 파일은 암호화되지 않아요.</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => void handleRestore()}
        disabled={busy}
        style={[styles.action, { borderColor: theme.colors.border }]}
      >
        <Text style={styles.actionTitle}>{restoreData.isPending ? '복원 중…' : '백업 파일 복원'}</Text>
        <Text style={styles.actionDescription}>기존 기록은 유지하고 백업 기록을 추가해요. 같은 파일은 한 번만 복원돼요.</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => void handlePhotoRetention()}
        disabled={busy}
        style={[styles.action, { borderColor: theme.colors.border }]}
      >
        <Text style={styles.actionTitle}>
          {retentionPreview.isPending || deleteRetainedPhotos.isPending ? '사진 확인 중…' : '90일 이전 사진 정리'}
        </Text>
        <Text style={styles.actionDescription}>사진만 지워 용량을 줄이고 음식·장소·메모 기록은 남겨요.</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showDelete }}
        onPress={() => setShowDelete((value) => !value)}
        disabled={busy}
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
