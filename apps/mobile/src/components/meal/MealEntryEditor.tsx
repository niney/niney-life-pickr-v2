import { useEffect, useMemo, useRef, useState } from 'react';
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
  beginMealDraftPhotoPreparation,
  draftItemToInput,
  getMealDraftIdentity,
  getMealDraftSaveFlight,
  isMealDraftIdentityCurrent,
  MEAL_DRAFT_MAX_PHOTOS,
  runMealDraftPhotoFlushSingleFlight,
  runMealDraftSaveSingleFlight,
  type MealDraftIdentity,
  type MealDraftItem,
  type Theme,
  useCreateMealEntry,
  useDeleteMealPhoto,
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
import { MealPendingPhotoThumb } from './MealPendingPhotoThumb';
import { RestaurantPickerSheet } from '~/components/settlement/RestaurantPickerSheet';
import { Chip, ChipRow, FieldLabel } from './mealUi';
import {
  createUnmanagedPendingMealDraftPhoto,
  deleteMealDraftPhotoFiles,
  isMealDraftPhotoAvailable,
  stageMealDraftPhoto,
} from '~/lib/mealDraftPhotos';

// 식단 입력 — 사진 → 인식 → 편집 → 저장. 입력은 앱에서만 하고(계획 결정) 진행 중 상태는
// mealDraftStore 에 persist 해 앱이 백그라운드에서 종료돼도 이어서 쓸 수 있다.
//
// 인식은 "실패해도 흐름을 막지 않는다": 실패하면 경고만 남기고 사용자는 그대로 손으로 적는다.
// 사진 없이 손으로만 적는 경로도 같은 화면이다(추천 "이거 먹었어요" 도 여기로 들어온다).

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

export const MealEntryEditor = ({
  entryId,
  initialSlot,
}: {
  entryId?: string | null;
  initialSlot?: MealSlot;
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const draft = useMealDraftStore();
  const timePresets = useMealTimePresets();
  const [editingTime, setEditingTime] = useState<string | null>(null);
  const upload = useUploadMealPhoto();
  const deletePhoto = useDeleteMealPhoto();
  const recognize = useRecognizeMeal();
  const create = useCreateMealEntry();
  const update = useUpdateMealEntry();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const recognizePromiseRef = useRef<{
    sessionId: string;
    promise: Promise<void>;
  } | null>(null);
  const mountedRef = useRef(true);
  const totalPhotoCount = draft.photos.length + draft.pendingPhotos.length;

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const isUiIdentityCurrent = (identity: MealDraftIdentity): boolean =>
    mountedRef.current && isMealDraftIdentityCurrent(identity);

  // 같은 계정 안에서 draft만 바뀐 경우에는 방금 업로드된 서버 고아를 즉시 지운다.
  // 계정까지 바뀌었으면 현재 토큰으로 다른 사용자 사진을 지울 수 없으므로 서버 GC에 맡긴다.
  const discardStaleUploadedPhoto = async (
    identity: MealDraftIdentity,
    token: string,
  ): Promise<void> => {
    const current = getMealDraftIdentity();
    if (!identity.principalId || current.principalId !== identity.principalId) return;
    await deletePhoto.mutateAsync(token).catch(() => undefined);
  };

  // 새 기록이면 지금 시각으로 draft 를 연다. 수정이면 화면(부모)이 미리 draft 를 채워 둔다.
  useEffect(() => {
    if (entryId) return;
    if (draft.entryId !== null || draft.eatenDate === '') {
      const now = new Date();
      draft.start({
        eatenAt: now.toISOString(),
        eatenDate: toLocalDateKey(now),
        slot: initialSlot ?? guessMealSlot(now),
      });
    }
    // draft 는 zustand 스토어라 참조가 안정적이지 않다 — 최초 1회만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const pickPhotos = async () => {
    setError(null);
    if (totalPhotoCount >= MEAL_DRAFT_MAX_PHOTOS) {
      setError(`사진은 최대 ${MEAL_DRAFT_MAX_PHOTOS}장까지 넣을 수 있어요.`);
      return;
    }
    const remaining = MEAL_DRAFT_MAX_PHOTOS - totalPhotoCount;
    const identity = getMealDraftIdentity();
    const preparation = beginMealDraftPhotoPreparation(identity);
    if (!preparation) {
      if (isUiIdentityCurrent(identity)) setError('저장이 끝난 뒤 사진을 다시 선택해 주세요.');
      return;
    }

    const fromLibrary = async () => {
      try {
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsMultipleSelection: true,
          selectionLimit: remaining,
          // iOS 앨범 원본은 HEIC(HEVC) — 서버 sharp 가 디코드 못 한다. 픽 시점에 JPEG 로.
          preferredAssetRepresentationMode:
            ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        });
        if (res.canceled || !isMealDraftIdentityCurrent(identity)) return;
        await uploadAssets(res.assets, identity, true);
      } catch (e) {
        if (isUiIdentityCurrent(identity)) {
          setError(e instanceof Error ? e.message : '사진 선택을 완료하지 못했어요.');
        }
      } finally {
        preparation.finish();
      }
    };

    // 웹(Expo Web)에는 카메라 경로가 없다 — 바로 앨범.
    if (Platform.OS === 'web') {
      await fromLibrary();
      return;
    }
    let actionChosen = false;
    try {
      Alert.alert(
        '식단 사진',
        undefined,
        [
          {
            text: '카메라',
            onPress: () => {
              actionChosen = true;
              void (async () => {
                try {
                  const perm = await ImagePicker.requestCameraPermissionsAsync();
                  if (!isMealDraftIdentityCurrent(identity)) return;
                  if (!perm.granted) {
                    if (isUiIdentityCurrent(identity)) setError('카메라 권한이 필요합니다.');
                    return;
                  }
                  const res = await ImagePicker.launchCameraAsync({
                    mediaTypes: ['images'],
                    quality: 0.8,
                    exif: true,
                  });
                  if (res.canceled || !isMealDraftIdentityCurrent(identity)) return;
                  await uploadAssets(res.assets, identity, true);
                } catch (e) {
                  if (isUiIdentityCurrent(identity)) {
                    setError(e instanceof Error ? e.message : '사진 촬영을 완료하지 못했어요.');
                  }
                } finally {
                  preparation.finish();
                }
              })();
            },
          },
          {
            text: '앨범',
            onPress: () => {
              actionChosen = true;
              void fromLibrary();
            },
          },
          {
            text: '취소',
            style: 'cancel',
            onPress: () => {
              actionChosen = true;
              preparation.finish();
            },
          },
        ],
        {
          cancelable: true,
          onDismiss: () => {
            if (!actionChosen) preparation.finish();
          },
        },
      );
    } catch (e) {
      preparation.finish();
      if (isUiIdentityCurrent(identity)) {
        setError(e instanceof Error ? e.message : '사진 선택기를 열지 못했어요.');
      }
    }
  };

  // 선택 직후 앱 소유 경로에 먼저 복사한다. 네트워크가 끊겨도
  // pendingPhotos 메타데이터와 물리 파일이 같이 남아 재시작 후 재시도할 수 있다.
  const uploadAssets = async (
    assets: ImagePicker.ImagePickerAsset[],
    identity: MealDraftIdentity,
    allowRecognitionDuringSave = false,
  ) => {
    if (!isMealDraftIdentityCurrent(identity)) return;
    const current = useMealDraftStore.getState();
    const list = assets.slice(
      0,
      MEAL_DRAFT_MAX_PHOTOS - current.photos.length - current.pendingPhotos.length,
    );
    if (list.length === 0) return;

    // 촬영 시각(EXIF)은 업로드 성공 여부와 무관하게 draft에 반영한다.
    const exifTime = firstExifTime(list);
    if (exifTime && isMealDraftIdentityCurrent(identity)) {
      const currentDraft = useMealDraftStore.getState();
      currentDraft.setField('eatenAt', exifTime.toISOString());
      currentDraft.setField('eatenDate', toLocalDateKey(exifTime));
      currentDraft.setField('slot', guessMealSlot(exifTime));
    }

    // Expo Web은 앱 문서 디렉터리가 없어 즉시 업로드를 유지한다.
    // 실패하면 재선택이 필요함을 명시하고 성공한 사진은 보존한다.
    if (Platform.OS === 'web') {
      const uploadedTokens: string[] = [];
      let failed = 0;
      if (isUiIdentityCurrent(identity)) setUploading({ done: 0, total: list.length });
      for (const [index, asset] of list.entries()) {
        if (!isMealDraftIdentityCurrent(identity)) break;
        try {
          const file = await webFile(asset);
          // Blob 변환 중 계정/draft가 바뀌면 새 계정 토큰으로 서버 업로드를 시작하지 않는다.
          if (!isMealDraftIdentityCurrent(identity)) break;
          const result = await upload.mutateAsync(file);
          if (!isMealDraftIdentityCurrent(identity)) {
            await discardStaleUploadedPhoto(identity, result.token);
            break;
          }
          useMealDraftStore.getState().addPhoto({ token: result.token, localUri: asset.uri });
          if (useMealDraftStore.getState().photos.some((photo) => photo.token === result.token)) {
            uploadedTokens.push(result.token);
          } else {
            await discardStaleUploadedPhoto(identity, result.token);
          }
        } catch {
          failed += 1;
        }
        if (isUiIdentityCurrent(identity)) {
          setUploading({ done: index + 1, total: list.length });
        }
      }
      if (isUiIdentityCurrent(identity)) setUploading(null);
      if (failed > 0 && isUiIdentityCurrent(identity)) {
        setError(`사진 ${failed}장을 올리지 못했어요. Expo Web에서는 다시 선택해 주세요.`);
      }
      if (uploadedTokens.length > 0 && isMealDraftIdentityCurrent(identity)) {
        await runRecognize(
          undefined,
          'replace-recognized',
          identity,
          allowRecognitionDuringSave,
        );
      }
      return;
    }

    if (isUiIdentityCurrent(identity)) setUploading({ done: 0, total: list.length });
    for (const [index, asset] of list.entries()) {
      if (!isMealDraftIdentityCurrent(identity)) break;
      try {
        const pending = await stageMealDraftPhoto(asset);
        if (!isMealDraftIdentityCurrent(identity)) {
          if (pending.managedLocalFile) {
            await deleteMealDraftPhotoFiles([pending.localUri]).catch(() => undefined);
          }
          break;
        }
        useMealDraftStore.getState().addPendingPhoto(pending);
        if (
          pending.managedLocalFile &&
          !useMealDraftStore
            .getState()
            .pendingPhotos.some((photo) => photo.clientId === pending.clientId)
        ) {
          await deleteMealDraftPhotoFiles([pending.localUri]).catch(() => undefined);
        }
      } catch (e) {
        if (!isMealDraftIdentityCurrent(identity)) break;
        // content:// 권한 등으로 복사가 안 되면 picker URI를 임시 폴백으로 남겨
        // 현재 세션의 재시도 기회는 보존한다. UI에는 안전 보관 실패를 표시한다.
        const reason = e instanceof Error ? e.message : '앱 소유 경로에 복사하지 못했습니다.';
        useMealDraftStore
          .getState()
          .addPendingPhoto(createUnmanagedPendingMealDraftPhoto(asset, reason));
      }
      if (isUiIdentityCurrent(identity)) {
        setUploading({ done: index + 1, total: list.length });
      }
    }
    if (isUiIdentityCurrent(identity)) setUploading(null);
    if (isMealDraftIdentityCurrent(identity)) {
      await runRecognize(
        undefined,
        'replace-recognized',
        identity,
        allowRecognitionDuringSave,
      );
    }
  };

  // 장당 1요청 순차 업로드(서버 multipart 한도 files:1). 한 장 실패가
  // 다른 장의 재시도를 막지 않고, 성공한 항목만 즉시 uploaded로 승격한다.
  const flushPendingPhotosOnce = async (identity: MealDraftIdentity): Promise<boolean> => {
    if (!isMealDraftIdentityCurrent(identity)) return false;
    const pending = [...useMealDraftStore.getState().pendingPhotos];
    if (pending.length === 0) return true;
    if (isUiIdentityCurrent(identity)) {
      setError(null);
      setUploading({ done: 0, total: pending.length });
    }
    let failed = 0;
    for (const [index, photo] of pending.entries()) {
      if (!isMealDraftIdentityCurrent(identity)) return false;
      const stillPending = useMealDraftStore
        .getState()
        .pendingPhotos.some((item) => item.clientId === photo.clientId);
      if (!stillPending) continue;
      const available = await isMealDraftPhotoAvailable(photo.localUri);
      if (!isMealDraftIdentityCurrent(identity)) return false;
      if (!available) {
        failed += 1;
        useMealDraftStore.getState().updatePendingPhoto(photo.clientId, {
          status: 'missing',
          lastError: '원본 파일을 찾을 수 없어요. 삭제한 뒤 다시 선택해 주세요.',
        });
        if (isUiIdentityCurrent(identity)) {
          setUploading({ done: index + 1, total: pending.length });
        }
        continue;
      }
      useMealDraftStore
        .getState()
        .updatePendingPhoto(photo.clientId, { status: 'pending', lastError: null });
      try {
        // RN은 Blob 대신 { uri, name, type }을 FormData에 넣어야 빈 파일이 안 된다.
        const result = await upload.mutateAsync({
          uri: photo.localUri,
          name: photo.name,
          type: photo.mimeType,
        });
        if (!isMealDraftIdentityCurrent(identity)) {
          await discardStaleUploadedPhoto(identity, result.token);
          if (photo.managedLocalFile) {
            await deleteMealDraftPhotoFiles([photo.localUri]).catch(() => undefined);
          }
          return false;
        }
        useMealDraftStore.getState().promotePendingPhoto(photo.clientId, {
          token: result.token,
          localUri: photo.localUri,
          managedLocalFile: photo.managedLocalFile,
        });
        if (!useMealDraftStore.getState().photos.some((item) => item.token === result.token)) {
          // pending이 다른 편집기/사용자 동작에서 먼저 사라졌다면 새 서버 토큰은 고아다.
          await discardStaleUploadedPhoto(identity, result.token);
          if (photo.managedLocalFile) {
            await deleteMealDraftPhotoFiles([photo.localUri]).catch(() => undefined);
          }
        }
      } catch (e) {
        if (!isMealDraftIdentityCurrent(identity)) return false;
        failed += 1;
        useMealDraftStore.getState().updatePendingPhoto(photo.clientId, {
          status: 'pending',
          lastError: e instanceof ApiError ? e.message : '사진 업로드에 실패했어요.',
        });
      }
      if (isUiIdentityCurrent(identity)) {
        setUploading({ done: index + 1, total: pending.length });
      }
    }
    if (!isMealDraftIdentityCurrent(identity)) return false;
    if (isUiIdentityCurrent(identity)) setUploading(null);
    const remaining = useMealDraftStore.getState().pendingPhotos.length;
    if (failed > 0 || remaining > 0) {
      if (isUiIdentityCurrent(identity)) {
        setError(
          `사진 ${remaining}장이 업로드 대기 중이에요. 네트워크를 확인하고 재시도해 주세요.`,
        );
      }
      return false;
    }
    return true;
  };

  const flushPendingPhotos = (identity: MealDraftIdentity): Promise<boolean> =>
    runMealDraftPhotoFlushSingleFlight(identity, () => flushPendingPhotosOnce(identity));

  const recognizeUploaded = async (
    identity: MealDraftIdentity,
    tokens?: string[],
    mode: 'append' | 'replace-recognized' = 'replace-recognized',
  ) => {
    if (!isMealDraftIdentityCurrent(identity)) return;
    const photoTokens = tokens ?? useMealDraftStore.getState().photos.map((p) => p.token);
    if (photoTokens.length === 0) return;
    if (isUiIdentityCurrent(identity)) {
      setError(null);
      setNotice(null);
    }
    try {
      const current = useMealDraftStore.getState();
      const res = await recognize.mutateAsync({
        photoTokens,
        placeId: current.placeId,
        slot: current.slot,
      });
      if (!isMealDraftIdentityCurrent(identity)) return;
      useMealDraftStore
        .getState()
        .applyRecognition(res.dishes, { model: res.model, version: res.promptVersion }, { mode });
      if (isUiIdentityCurrent(identity)) {
        setNotice(
          res.warning ??
            (res.dishes.length > 0
              ? `${res.dishes.length}개 음식을 찾았어요. 확인해 주세요.`
              : null),
        );
      }
    } catch (e) {
      // 인식 실패는 막다른 길이 아니다 — 손으로 적으면 된다.
      if (isUiIdentityCurrent(identity)) {
        setNotice(
          e instanceof ApiError
            ? `${e.message} 직접 입력해 주세요.`
            : '인식에 실패했어요. 직접 입력해 주세요.',
        );
      }
    }
  };

  // 재인식 전에 pending을 자동 flush해 선택한 사진 전체가 같은 인식에 들어가게 한다.
  const runRecognize = async (
    tokens?: string[],
    mode: 'append' | 'replace-recognized' = 'replace-recognized',
    identity: MealDraftIdentity = getMealDraftIdentity(),
    allowDuringSave = false,
  ): Promise<void> => {
    // 저장이 먼저 시작됐으면 저장 후 비워진 draft에 늦은 인식 응답을
    // 다시 쓰지 않도록 새 인식을 시작하지 않는다.
    const saveFlight = getMealDraftSaveFlight(identity);
    if (saveFlight && !allowDuringSave) return saveFlight;
    if (recognizePromiseRef.current?.sessionId === identity.sessionId) {
      return recognizePromiseRef.current.promise;
    }
    const running = Promise.resolve()
      .then(async () => {
        const flushed = await flushPendingPhotos(identity);
        if (!isMealDraftIdentityCurrent(identity)) return;
        if (!flushed) {
          if (isUiIdentityCurrent(identity)) {
            setNotice('대기 사진을 모두 올린 뒤 음식 인식을 시작할게요.');
          }
          return;
        }
        await recognizeUploaded(identity, tokens, mode);
      })
      .finally(() => {
        if (recognizePromiseRef.current?.promise === running) {
          recognizePromiseRef.current = null;
        }
      });
    recognizePromiseRef.current = { sessionId: identity.sessionId, promise: running };
    return running;
  };

  // 날짜는 그대로 두고 시:분만 바꾼다 — '◀ 하루'로 옮겨 둔 날짜가 되돌아가면 안 된다.
  // (시각은 기기 로컬 기준으로 적용한다. 서버 프리셋은 Asia/Seoul 기준이라 국내 사용에선 같다.)
  const setTimeOfDay = (minutesOfDay: number) => {
    // 편집 중이었다면 닫는다 — 안 닫으면 입력칸이 그대로 떠 있어 바뀐 시각이 가려진다(시뮬레이터 실측).
    setEditingTime(null);
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
    setEditingTime(null);
    const d = new Date(draft.eatenAt);
    d.setMinutes(d.getMinutes() + minutes);
    draft.setField('eatenAt', d.toISOString());
    draft.setField('eatenDate', toLocalDateKey(d));
  };

  const shiftDay = (days: number) => {
    setEditingTime(null);
    const d = new Date(draft.eatenAt);
    d.setDate(d.getDate() + days);
    draft.setField('eatenAt', d.toISOString());
    draft.setField('eatenDate', toLocalDateKey(d));
  };

  const items = draft.items.filter((it) => it.name.trim().length > 0);
  const busy = uploading !== null || upload.isPending || recognize.isPending;
  const actionBusy = busy || create.isPending || update.isPending;
  const canSave = items.length > 0 && !actionBusy;

  const saveOnce = async (identity: MealDraftIdentity): Promise<void> => {
    if (actionBusy) return;
    // 재인식이 먼저 시작된 극시간 이중 탭에서는 그 응답까지 기다려
    // recognition snapshot을 저장하고, 저장 후 ghost draft가 다시 생기지 않게 한다.
    if (recognizePromiseRef.current?.sessionId === identity.sessionId) {
      await recognizePromiseRef.current.promise;
    }
    if (!isMealDraftIdentityCurrent(identity)) return;
    if (isUiIdentityCurrent(identity)) setError(null);
    if (useMealDraftStore.getState().items.every((item) => item.name.trim().length === 0)) {
      if (isUiIdentityCurrent(identity)) setError('음식을 하나 이상 적어 주세요.');
      return;
    }
    // 저장 전에도 pending을 자동 flush한다. 선택한 사진 일부를 조용히
    // 빼고 기록하지 않도록 한 장이라도 남으면 저장을 멈춘다.
    const flushed = await flushPendingPhotos(identity);
    if (!flushed || !isMealDraftIdentityCurrent(identity)) return;
    const current = useMealDraftStore.getState();
    const currentItems = current.items.filter((item) => item.name.trim().length > 0);
    const payload = {
      eatenAt: new Date(current.eatenAt).toISOString(),
      eatenDate: current.eatenDate || toLocalDateKey(new Date(current.eatenAt)),
      slot: current.slot,
      mealType: current.mealType,
      placeId: current.placeId,
      placeName: current.placeName,
      memo: current.memo.trim() ? current.memo.trim() : null,
      items: currentItems.map(draftItemToInput),
      photoTokens: current.photos.map((p) => p.token),
    };
    try {
      if (entryId) {
        await update.mutateAsync({
          id: entryId,
          input: payload,
          expectedPrincipalId: identity.principalId,
        });
      } else {
        await create.mutateAsync({
          input: {
            ...payload,
            source: current.originRecommendationId
              ? 'recommendation'
              : current.recognition || current.photos.length > 0
                ? 'photo'
                : 'manual',
            originRecommendationId: current.originRecommendationId,
            recognition: current.recognition,
          },
          expectedPrincipalId: identity.principalId,
        });
      }
      if (!isMealDraftIdentityCurrent(identity)) return;
      const cleared = useMealDraftStore.getState().clear(identity.sessionId);
      if (cleared && mountedRef.current) router.back();
    } catch (e) {
      if (isUiIdentityCurrent(identity)) {
        setError(e instanceof ApiError ? e.message : '저장에 실패했어요.');
      }
    }
  };

  const save = (): Promise<void> => {
    const identity = getMealDraftIdentity();
    return runMealDraftSaveSingleFlight(identity, () => saveOnce(identity));
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
          <CardTitle
            title="사진"
            sub={`최대 ${MEAL_DRAFT_MAX_PHOTOS}장 · 찍으면 음식을 자동으로 찾아 줘요`}
          />
          <View style={styles.photoRow}>
            {draft.photos.map((p) => (
              <MealPhotoThumb
                key={p.token}
                token={p.token}
                localUri={p.localUri}
                onRemove={busy ? undefined : () => draft.removePhoto(p.token)}
              />
            ))}
            {draft.pendingPhotos.map((photo) => (
              <MealPendingPhotoThumb
                key={photo.clientId}
                photo={photo}
                onRemove={busy ? undefined : () => draft.removePendingPhoto(photo.clientId)}
                onMissing={() =>
                  draft.updatePendingPhoto(photo.clientId, {
                    status: 'missing',
                    lastError: '원본 파일을 찾을 수 없어요. 삭제한 뒤 다시 선택해 주세요.',
                  })
                }
              />
            ))}
            {totalPhotoCount < MEAL_DRAFT_MAX_PHOTOS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="사진 추가"
                onPress={() => void pickPhotos()}
                disabled={busy}
                style={[
                  styles.addPhoto,
                  { borderColor: theme.colors.border, opacity: busy ? 0.5 : 1 },
                ]}
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
          ) : draft.pendingPhotos.length > 0 ? (
            <View style={styles.pendingActions}>
              <Text style={styles.busyText}>
                {draft.pendingPhotos.length}장 업로드 대기 · 앱을 닫아도 다시 시도할 수 있어요
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="대기 사진 업로드 재시도"
                onPress={() => void runRecognize(undefined, 'replace-recognized')}
                style={styles.linkBtn}
              >
                <Text style={{ color: theme.colors.primary, fontSize: 13 }}>업로드 재시도</Text>
              </Pressable>
              {draft.pendingPhotos.some((photo) => photo.status === 'missing') ? (
                <Text style={[styles.pendingError, { color: theme.colors.danger }]}>
                  원본이 없는 사진은 삭제한 뒤 다시 선택해 주세요.
                </Text>
              ) : null}
              {draft.pendingPhotos.some((photo) => !photo.managedLocalFile) ? (
                <Text style={[styles.pendingError, { color: theme.colors.danger }]}>
                  ‘임시 원본’은 앱 종료 후 없어질 수 있어요. 현재 앱에서 업로드를 재시도해 주세요.
                </Text>
              ) : null}
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
          <Pressable
            accessibilityRole="button"
            onPress={() => draft.addItem(newItem())}
            style={styles.addItemBtn}
          >
            <Text style={{ color: theme.colors.primary, fontSize: 14, fontWeight: '600' }}>
              ＋ 음식 추가
            </Text>
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
                // 빈 칸으로 열고 지금 시각을 placeholder 로 보여 준다. 값을 채워 두면 maxLength(5)에
                // 걸려 한 글자도 못 치고 백스페이스를 다섯 번 눌러야 한다(시뮬레이터 실측).
                onPress={() => setEditingTime('')}
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
                placeholder={timeLabel(draft.eatenAt)}
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
                setEditingTime(null);
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
              accessibilityLabel={
                draft.placeName ? `선택한 식당 ${draft.placeName} 변경` : '식당 선택'
              }
              onPress={() => setPlacePickerOpen(true)}
              disabled={actionBusy}
              style={[
                styles.placeButton,
                { borderColor: theme.colors.border, opacity: actionBusy ? 0.5 : 1 },
              ]}
            >
              <Text
                style={{
                  color: draft.placeName ? theme.colors.text : theme.colors.textMuted,
                  fontSize: 14,
                }}
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
          {draft.placeId && totalPhotoCount > 0 ? (
            <Text style={styles.placeHint}>
              다시 인식하면 이 식당의 등록 메뉴를 힌트로 사용해요.
            </Text>
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

      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            paddingBottom: insets.bottom + 10,
          },
        ]}
      >
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
            {
              backgroundColor: theme.colors.primary,
              borderColor: theme.colors.primary,
              opacity: canSave ? 1 : 0.5,
            },
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
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    );
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
    pendingActions: { gap: 4 },
    pendingError: { fontSize: 12, lineHeight: 17 },
    itemList: { gap: 8 },
    emptyText: { fontSize: 13, color: theme.colors.textMuted },
    addItemBtn: { paddingVertical: 8 },
    whenRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
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
