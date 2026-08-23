import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ApiError,
  draftItemToInput,
  type MealDraftItem,
  type Theme,
  useCreateMealEntry,
  useMealDraftStore,
  useMealTimePresets,
  useRecognizeMeal,
  useTheme,
  useUpdateMealEntry,
  useUploadMealPhoto,
} from '@repo/shared';
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  MEAL_TYPES,
  MEAL_TYPE_LABEL,
  guessMealSlot,
  parseTimeOfDay,
  toLocalDateKey,
  type MealSlot,
  type MealType,
} from '@repo/utils';
import { Card, CardTitle, Note } from '~/components/common/Cards';
import { MealItemRow } from './MealItemRow';
import { MealPhotoThumb } from './MealPhotoThumb';
import { RestaurantPickerSheet } from '~/components/settlement/RestaurantPickerSheet';
import { Chip, ChipRow, FieldLabel } from './mealUi';

// 식단 입력 — 사진 → 인식 → 편집 → 저장. 입력은 앱에서만 하고(계획 결정) 진행 중 상태는
// mealDraftStore 에 persist 해 앱이 백그라운드에서 종료돼도 이어서 쓸 수 있다.
//
// 인식은 "실패해도 흐름을 막지 않는다": 실패하면 경고만 남기고 사용자는 그대로 손으로 적는다.
// 사진 없이 손으로만 적는 경로도 같은 화면이다(추천 "이거 먹었어요" 도 여기로 들어온다).

const MAX_PHOTOS = 5;

const newItem = (name = ''): Omit<MealDraftItem, 'clientId'> => ({
  name,
  foodId: null,
  dishType: null,
  mainIngredient: null,
  cuisine: null,
  portion: null,
  isMain: true,
  confidence: null,
  source: 'manual',
  candidates: [],
});

// 'HH:MM' 표시 — eatenAt(ISO) 은 UTC 지만 표시는 로컬.
const timeLabel = (iso: string): string => {
  const d = new Date(iso);
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
};

export const MealEntryEditor = ({ entryId }: { entryId?: string | null }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const draft = useMealDraftStore();
  const timePresets = useMealTimePresets();
  const [editingTime, setEditingTime] = useState<string | null>(null);
  const upload = useUploadMealPhoto();
  const recognize = useRecognizeMeal();
  const create = useCreateMealEntry();
  const update = useUpdateMealEntry();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);

  // 새 기록이면 지금 시각으로 draft 를 연다. 수정이면 화면(부모)이 미리 draft 를 채워 둔다.
  useEffect(() => {
    if (entryId) return;
    if (draft.entryId !== null || draft.eatenDate === '') {
      const now = new Date();
      draft.start({
        eatenAt: now.toISOString(),
        eatenDate: toLocalDateKey(now),
        slot: guessMealSlot(now),
      });
    }
    // draft 는 zustand 스토어라 참조가 안정적이지 않다 — 최초 1회만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const pickPhotos = async () => {
    setError(null);
    if (draft.photos.length >= MAX_PHOTOS) {
      setError(`사진은 최대 ${MAX_PHOTOS}장까지 넣을 수 있어요.`);
      return;
    }
    const remaining = MAX_PHOTOS - draft.photos.length;

    const fromLibrary = async () => {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        // iOS 앨범 원본은 HEIC(HEVC) — 서버 sharp 가 디코드 못 한다. 픽 시점에 JPEG 로.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (res.canceled) return;
      await uploadAssets(res.assets);
    };

    // 웹(Expo Web)에는 카메라 경로가 없다 — 바로 앨범.
    if (Platform.OS === 'web') {
      await fromLibrary();
      return;
    }
    Alert.alert(
      '식단 사진',
      undefined,
      [
        {
          text: '카메라',
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              setError('카메라 권한이 필요합니다.');
              return;
            }
            const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, exif: true });
            if (res.canceled) return;
            await uploadAssets(res.assets);
          },
        },
        { text: '앨범', onPress: () => void fromLibrary() },
        { text: '취소', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  // 장당 1요청 순차 업로드(서버 multipart 한도 files:1) — 진행률을 보여 준다.
  const uploadAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const list = assets.slice(0, MAX_PHOTOS - draft.photos.length);
    const existingTokens = draft.photos.map((photo) => photo.token);
    setUploading({ done: 0, total: list.length });
    const tokens: string[] = [];
    try {
      for (const [i, asset] of list.entries()) {
        // RN 은 Blob 을 FormData 에 넣으면 본문이 비어 서버에 빈 파일이 간다 — { uri, name, type }.
        const uploaded = await upload.mutateAsync(
          Platform.OS === 'web'
            ? await webFile(asset)
            : { uri: asset.uri, name: asset.fileName ?? `meal-${i}.jpg`, type: asset.mimeType ?? 'image/jpeg' },
        );
        draft.addPhoto({ token: uploaded.token, localUri: asset.uri });
        tokens.push(uploaded.token);
        setUploading({ done: i + 1, total: list.length });
      }
      // 촬영 시각(EXIF)이 있으면 먹은 시각의 기본값으로 쓴다 — 나중에 정리해 올리는 흐름에 맞다.
      const exifTime = firstExifTime(list);
      if (exifTime) {
        draft.setField('eatenAt', exifTime.toISOString());
        draft.setField('eatenDate', toLocalDateKey(exifTime));
        draft.setField('slot', guessMealSlot(exifTime));
      }
      // 새 사진만 따로 인식하면 이전 결과 뒤에 같은 음식이 계속 붙을 수 있다. 현재 사진 전체를
      // 다시 보고, 사용자가 손보지 않은 자동 인식 항목만 교체한다.
      if (tokens.length > 0) {
        await runRecognize([...existingTokens, ...tokens], 'replace-recognized');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '사진 업로드에 실패했어요.');
    } finally {
      setUploading(null);
    }
  };

  const runRecognize = async (
    tokens?: string[],
    mode: 'append' | 'replace-recognized' = 'replace-recognized',
  ) => {
    const photoTokens = tokens ?? draft.photos.map((p) => p.token);
    if (photoTokens.length === 0) return;
    setError(null);
    setNotice(null);
    try {
      const res = await recognize.mutateAsync({
        photoTokens,
        placeId: draft.placeId,
        slot: draft.slot,
      });
      draft.applyRecognition(
        res.dishes,
        { model: res.model, version: res.promptVersion },
        { mode },
      );
      setNotice(res.warning ?? (res.dishes.length > 0 ? `${res.dishes.length}개 음식을 찾았어요. 확인해 주세요.` : null));
    } catch (e) {
      // 인식 실패는 막다른 길이 아니다 — 손으로 적으면 된다.
      setNotice(e instanceof ApiError ? `${e.message} 직접 입력해 주세요.` : '인식에 실패했어요. 직접 입력해 주세요.');
    }
  };

  // 날짜는 그대로 두고 시:분만 바꾼다 — '◀ 하루'로 옮겨 둔 날짜가 되돌아가면 안 된다.
  // (시각은 기기 로컬 기준으로 적용한다. 서버 프리셋은 Asia/Seoul 기준이라 국내 사용에선 같다.)
  const setTimeOfDay = (minutesOfDay: number) => {
    const d = new Date(draft.eatenAt);
    d.setHours(Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0, 0);
    draft.setField('eatenAt', d.toISOString());
    draft.setField('eatenDate', toLocalDateKey(d));
  };

  const applyPreset = (slot: MealSlot, time: string) => {
    const minutes = parseTimeOfDay(time);
    if (minutes === null) return;
    setTimeOfDay(minutes);
    draft.setField('slot', slot);
  };

  // 시각 직접 입력 — '12:40' 도 '1240' 도 받는다. 형식이 틀리면 조용히 되돌린다.
  const commitTime = () => {
    const minutes = editingTime === null ? null : parseTimeOfDay(editingTime);
    if (minutes !== null) setTimeOfDay(minutes);
    setEditingTime(null);
  };

  const shiftTime = (minutes: number) => {
    const d = new Date(draft.eatenAt);
    d.setMinutes(d.getMinutes() + minutes);
    draft.setField('eatenAt', d.toISOString());
    draft.setField('eatenDate', toLocalDateKey(d));
  };

  const shiftDay = (days: number) => {
    const d = new Date(draft.eatenAt);
    d.setDate(d.getDate() + days);
    draft.setField('eatenAt', d.toISOString());
    draft.setField('eatenDate', toLocalDateKey(d));
  };

  const items = draft.items.filter((it) => it.name.trim().length > 0);
  const busy = uploading !== null || recognize.isPending;
  const actionBusy = busy || create.isPending || update.isPending;
  const canSave = items.length > 0 && !actionBusy;

  const save = async () => {
    if (actionBusy) return;
    setError(null);
    if (items.length === 0) {
      setError('음식을 하나 이상 적어 주세요.');
      return;
    }
    const payload = {
      eatenAt: new Date(draft.eatenAt).toISOString(),
      eatenDate: draft.eatenDate || toLocalDateKey(new Date(draft.eatenAt)),
      slot: draft.slot,
      mealType: draft.mealType,
      placeId: draft.placeId,
      placeName: draft.placeName,
      memo: draft.memo.trim() ? draft.memo.trim() : null,
      items: items.map(draftItemToInput),
      photoTokens: draft.photos.map((p) => p.token),
    };
    try {
      if (entryId) {
        await update.mutateAsync({ id: entryId, input: payload });
      } else {
        await create.mutateAsync({
          ...payload,
          source: draft.originRecommendationId
            ? 'recommendation'
            : draft.recognition
              ? 'photo'
              : 'manual',
          originRecommendationId: draft.originRecommendationId,
          recognition: draft.recognition,
        });
      }
      draft.clear();
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장에 실패했어요.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.bg }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* 사진 */}
        <Card>
          <CardTitle title="사진" sub={`최대 ${MAX_PHOTOS}장 · 찍으면 음식을 자동으로 찾아 줘요`} />
          <View style={styles.photoRow}>
            {draft.photos.map((p) => (
              <MealPhotoThumb
                key={p.token}
                token={p.token}
                localUri={p.localUri}
                onRemove={busy ? undefined : () => draft.removePhoto(p.token)}
              />
            ))}
            {draft.photos.length < MAX_PHOTOS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="사진 추가"
                onPress={() => void pickPhotos()}
                disabled={busy}
                style={[styles.addPhoto, { borderColor: theme.colors.border, opacity: busy ? 0.5 : 1 }]}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 22 }}>＋</Text>
              </Pressable>
            ) : null}
          </View>
          {uploading ? (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
              <Text style={styles.busyText}>
                사진 올리는 중… {uploading.done}/{uploading.total}
              </Text>
            </View>
          ) : recognize.isPending ? (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
              <Text style={styles.busyText}>음식을 찾는 중…</Text>
            </View>
          ) : draft.photos.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void runRecognize(undefined, 'replace-recognized')}
              style={styles.linkBtn}
            >
              <Text style={{ color: theme.colors.primary, fontSize: 13 }}>다시 인식하기</Text>
            </Pressable>
          ) : null}
          {notice ? <Note tone="warn">{notice}</Note> : null}
        </Card>

        {/* 음식 */}
        <Card>
          <CardTitle title="먹은 음식" sub="이름을 고치거나 추가할 수 있어요" />
          {draft.items.length === 0 ? (
            <Text style={styles.emptyText}>사진을 넣거나 직접 추가해 주세요.</Text>
          ) : (
            <View style={styles.itemList}>
              {draft.items.map((item) => (
                <MealItemRow
                  key={item.clientId}
                  item={item}
                  onChange={(patch) => draft.updateItem(item.clientId, patch)}
                  onRemove={() => draft.removeItem(item.clientId)}
                />
              ))}
            </View>
          )}
          <Pressable accessibilityRole="button" onPress={() => draft.addItem(newItem())} style={styles.addItemBtn}>
            <Text style={{ color: theme.colors.primary, fontSize: 14, fontWeight: '600' }}>＋ 음식 추가</Text>
          </Pressable>
        </Card>

        {/* 언제·어떻게 */}
        <Card>
          <CardTitle title="언제 먹었나요" />
          <View style={styles.whenRow}>
            <Chip label="◀ 하루" onPress={() => shiftDay(-1)} />
            {editingTime === null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="시각 직접 입력"
                onPress={() => setEditingTime(timeLabel(draft.eatenAt))}
                style={styles.whenPress}
              >
                <Text style={styles.whenText}>
                  {draft.eatenDate} {timeLabel(draft.eatenAt)}
                </Text>
              </Pressable>
            ) : (
              <TextInput
                value={editingTime}
                onChangeText={setEditingTime}
                onBlur={commitTime}
                onSubmitEditing={commitTime}
                keyboardType="number-pad"
                maxLength={5}
                autoFocus
                selectTextOnFocus
                placeholder="12:40"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.timeInput}
                accessibilityLabel="시각 입력"
              />
            )}
            <Chip label="하루 ▶" onPress={() => shiftDay(1)} />
          </View>

          {/* 끼니별 '내가 보통 먹는 시각' — 한 번에 시각+끼니를 정한다. 기록이 적으면 일반값. */}
          <ChipRow>
            {(timePresets.data?.presets ?? []).map((p) => (
              <Chip
                key={p.slot}
                label={`${MEAL_SLOT_LABEL[p.slot]} ${p.time}`}
                onPress={() => applyPreset(p.slot, p.time)}
              />
            ))}
          </ChipRow>

          <ChipRow>
            <Chip label="-30분" onPress={() => shiftTime(-30)} />
            <Chip label="+30분" onPress={() => shiftTime(30)} />
            <Chip
              label="지금"
              onPress={() => {
                const now = new Date();
                draft.setField('eatenAt', now.toISOString());
                draft.setField('eatenDate', toLocalDateKey(now));
                draft.setField('slot', guessMealSlot(now));
              }}
            />
          </ChipRow>

          <FieldLabel>끼니</FieldLabel>
          <ChipRow>
            {MEAL_SLOTS.map((s: MealSlot) => (
              <Chip
                key={s}
                label={MEAL_SLOT_LABEL[s]}
                selected={draft.slot === s}
                onPress={() => draft.setField('slot', s)}
              />
            ))}
          </ChipRow>

          <FieldLabel>식사 방식</FieldLabel>
          <ChipRow>
            {MEAL_TYPES.map((t: MealType) => (
              <Chip
                key={t}
                label={MEAL_TYPE_LABEL[t]}
                selected={draft.mealType === t}
                onPress={() => draft.setField('mealType', draft.mealType === t ? null : t)}
              />
            ))}
          </ChipRow>

          <FieldLabel>식당 / 장소 (선택)</FieldLabel>
          <View style={styles.placeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={draft.placeName ? `선택한 식당 ${draft.placeName} 변경` : '식당 선택'}
              onPress={() => setPlacePickerOpen(true)}
              disabled={actionBusy}
              style={[
                styles.placeButton,
                { borderColor: theme.colors.border, opacity: actionBusy ? 0.5 : 1 },
              ]}
            >
              <Text
                style={{ color: draft.placeName ? theme.colors.text : theme.colors.textMuted, fontSize: 14 }}
                numberOfLines={1}
              >
                {draft.placeName ?? '식당 검색해서 선택'}
              </Text>
            </Pressable>
            {draft.placeId ? (
              <Chip
                label="지우기"
                disabled={actionBusy}
                onPress={() => {
                  draft.setField('placeId', null);
                  draft.setField('placeName', null);
                }}
              />
            ) : null}
          </View>
          {draft.placeId && draft.photos.length > 0 ? (
            <Text style={styles.placeHint}>다시 인식하면 이 식당의 등록 메뉴를 힌트로 사용해요.</Text>
          ) : null}

          <FieldLabel>메모</FieldLabel>
          <TextInput
            value={draft.memo}
            onChangeText={(v) => draft.setField('memo', v)}
            placeholder="선택 — 같이 먹은 사람, 기분 등"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.memo}
            multiline
          />
        </Card>

        {error ? <Note tone="warn">{error}</Note> : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, paddingBottom: insets.bottom + 10 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            draft.clear();
            router.back();
          }}
          disabled={actionBusy}
          style={[
            styles.footerBtn,
            { borderColor: theme.colors.border, opacity: actionBusy ? 0.5 : 1 },
          ]}
        >
          <Text style={{ color: theme.colors.text, fontSize: 15 }}>취소</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void save()}
          disabled={!canSave}
          style={[
            styles.footerBtn,
            { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary, opacity: canSave ? 1 : 0.5 },
          ]}
        >
          <Text style={{ color: theme.colors.primaryText, fontSize: 15, fontWeight: '600' }}>
            {create.isPending || update.isPending ? '저장 중…' : '저장'}
          </Text>
        </Pressable>
      </View>

      <RestaurantPickerSheet
        open={placePickerOpen}
        onClose={() => setPlacePickerOpen(false)}
        onPick={(restaurant) => {
          draft.setField('placeId', restaurant.placeId);
          draft.setField('placeName', restaurant.name);
          if (draft.mealType === null) draft.setField('mealType', 'dining_out');
        }}
      />
    </KeyboardAvoidingView>
  );
};

// Expo Web 에서만 쓰이는 경로 — 픽커가 준 uri 를 Blob 으로 바꿔 올린다(웹은 Blob 이 정상).
const webFile = async (asset: ImagePicker.ImagePickerAsset): Promise<Blob> => {
  const res = await fetch(asset.uri);
  return res.blob();
};

// 촬영 시각(EXIF DateTimeOriginal, 'YYYY:MM:DD HH:MM:SS') → Date. 없으면 null.
const firstExifTime = (assets: ImagePicker.ImagePickerAsset[]): Date | null => {
  for (const a of assets) {
    const raw = (a.exif?.['DateTimeOriginal'] ?? a.exif?.['DateTime']) as string | undefined;
    if (typeof raw !== 'string') continue;
    const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
    if (!m) continue;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 12 },
    photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    addPhoto: {
      width: 72,
      height: 72,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    busyText: { fontSize: 13, color: theme.colors.textMuted },
    linkBtn: { paddingVertical: 4 },
    itemList: { gap: 8 },
    emptyText: { fontSize: 13, color: theme.colors.textMuted },
    addItemBtn: { paddingVertical: 8 },
    whenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    whenText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
    whenPress: { flex: 1, alignItems: 'center', paddingVertical: 4 },
    timeInput: {
      flex: 1,
      textAlign: 'center',
      fontSize: 14,
      fontVariant: ['tabular-nums'],
      color: theme.colors.text,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.primary,
      paddingVertical: 2,
    },
    memo: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 8,
      padding: 10,
      minHeight: 56,
      color: theme.colors.text,
      fontSize: 14,
      textAlignVertical: 'top',
    },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    placeButton: {
      flex: 1,
      minWidth: 0,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    placeHint: { fontSize: 11, color: theme.colors.textMuted },
    footer: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    footerBtn: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
  });
