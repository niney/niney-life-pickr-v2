import { useState } from 'react';
import {
  ApiError,
  MEAL_DRAFT_MAX_PHOTOS,
  beginMealDraftPhotoPreparation,
  getMealDraftIdentity,
  isMealDraftIdentityCurrent,
  useDeleteMealPhoto,
  useMealDraftStore,
  useRecognizeMeal,
  useUploadMealPhoto,
  type MealDraftIdentity,
} from '@repo/shared';
import { guessMealSlot, toLocalDateKey } from '@repo/utils';
import { isImageFile, prepareMealPhoto, readPhotoTakenAt } from './mealPhotoFile';

// 식단 사진 넣기(웹) — 고르기·끌어다 놓기·붙여넣기 → 촬영 시각 반영 → 줄여서 올리기 → 음식 인식.
// 앱 MealEntryEditor 의 Expo Web 경로와 같은 규칙이다: 바로 올리고(웹은 파일을 draft 에 붙들어 둘 수 없어 대기열이
// 없다), 다 올린 뒤 전체 사진으로 다시 인식해 이전 자동 인식 항목만 바꾼다. 인식이 실패해도 막다른 길이 아니라
// 직접 적으면 된다.
//
// 올리기·인식은 사진 준비 lease(beginMealDraftPhotoPreparation) 안에서 한다 — 저장을 누르면 이 작업이 끝날 때까지
// 기다렸다가 올린 사진과 인식 원본까지 함께 저장한다. 시작할 때의 draft 세대를 들고 다니다가 그사이 취소·저장·계정
// 전환으로 draft 가 바뀌었으면 결과를 쓰지 않고, 방금 올린 사진은 바로 지운다(서버 24시간 정리를 기다리지 않게).

export interface MealPhotoIntake {
  addFiles: (files: File[]) => Promise<void>;
  recognizeAgain: () => Promise<void>;
  removePhoto: (token: string) => void;
  /** 올리거나 인식하는 중 — 저장·사진 추가를 막는다. */
  busy: boolean;
  uploading: { done: number; total: number } | null;
  recognizing: boolean;
  error: string | null;
  notice: string | null;
  /** 사진 촬영 시각으로 먹은 시각을 맞췄으면 그 시각. */
  takenAt: Date | null;
}

const firstTakenAt = async (files: File[]): Promise<Date | null> => {
  for (const file of files) {
    const takenAt = await readPhotoTakenAt(file);
    if (takenAt) return takenAt;
  }
  return null;
};

export const useMealPhotoIntake = (): MealPhotoIntake => {
  const upload = useUploadMealPhoto();
  const deletePhoto = useDeleteMealPhoto();
  const recognize = useRecognizeMeal();
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [takenAt, setTakenAt] = useState<Date | null>(null);
  const busy = uploading !== null || recognize.isPending;

  // 같은 계정이면 방금 올린 고아 사진을 바로 지운다. 계정이 바뀌었으면 지금 토큰으로 남의 사진을 지울 수 없어
  // 서버 정리에 맡긴다(앱과 같은 경계).
  const discardStaleUpload = async (identity: MealDraftIdentity, token: string) => {
    const current = getMealDraftIdentity();
    if (!identity.principalId || current.principalId !== identity.principalId) return;
    await deletePhoto.mutateAsync(token).catch(() => undefined);
  };

  const recognizeAll = async (identity: MealDraftIdentity) => {
    if (!isMealDraftIdentityCurrent(identity)) return;
    const current = useMealDraftStore.getState();
    const photoTokens = current.photos.map((photo) => photo.token);
    if (photoTokens.length === 0) return;
    setNotice(null);
    try {
      const res = await recognize.mutateAsync({ photoTokens, placeId: current.placeId, slot: current.slot });
      if (!isMealDraftIdentityCurrent(identity)) return;
      const draft = useMealDraftStore.getState();
      draft.applyRecognition(res.dishes, { model: res.model, version: res.promptVersion }, { mode: 'replace-recognized' });
      // 새 기록은 빈 첫 줄로 열린다 — 인식이 음식을 채웠으면 그 빈 줄은 지울 일만 남기니 치운다.
      if (res.dishes.length > 0) {
        for (const item of useMealDraftStore.getState().items) {
          if (item.name.trim().length === 0) draft.removeItem(item.clientId);
        }
      }
      setNotice(res.warning ?? (res.dishes.length > 0 ? `${res.dishes.length}개 음식을 찾았어요. 확인해 주세요.` : null));
    } catch (e) {
      if (isMealDraftIdentityCurrent(identity)) {
        setNotice(e instanceof ApiError ? `${e.message} 직접 입력해 주세요.` : '인식에 실패했어요. 직접 입력해 주세요.');
      }
    }
  };

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (busy) {
      setError('사진을 올리는 중이에요. 끝난 뒤 다시 넣어 주세요.');
      return;
    }
    setError(null);
    const images = files.filter(isImageFile);
    if (images.length === 0) {
      setError('사진 파일만 넣을 수 있어요.');
      return;
    }
    const remaining = MEAL_DRAFT_MAX_PHOTOS - useMealDraftStore.getState().photos.length;
    if (remaining <= 0) {
      setError(`사진은 최대 ${MEAL_DRAFT_MAX_PHOTOS}장까지 넣을 수 있어요.`);
      return;
    }
    const identity = getMealDraftIdentity();
    const preparation = beginMealDraftPhotoPreparation(identity);
    if (!preparation) {
      setError('저장이 끝난 뒤 사진을 다시 넣어 주세요.');
      return;
    }
    const list = images.slice(0, remaining);
    try {
      setUploading({ done: 0, total: list.length });
      // 촬영 시각은 올리기 성공과 상관없이 먹은 시각·끼니에 반영한다(앱과 같이 처음 읽히는 사진 기준).
      const shotAt = await firstTakenAt(list);
      if (shotAt && isMealDraftIdentityCurrent(identity)) {
        const draft = useMealDraftStore.getState();
        draft.setField('eatenAt', shotAt.toISOString());
        draft.setField('eatenDate', toLocalDateKey(shotAt));
        draft.setField('slot', guessMealSlot(shotAt));
        setTakenAt(shotAt);
      }

      const uploaded: string[] = [];
      const failures: string[] = [];
      for (const [index, file] of list.entries()) {
        if (!isMealDraftIdentityCurrent(identity)) break;
        try {
          const prepared = await prepareMealPhoto(file);
          if (!isMealDraftIdentityCurrent(identity)) break;
          if (!prepared.ok) {
            failures.push(prepared.message);
          } else {
            const result = await upload.mutateAsync(prepared.blob);
            if (!isMealDraftIdentityCurrent(identity)) {
              await discardStaleUpload(identity, result.token);
              break;
            }
            useMealDraftStore.getState().addPhoto({ token: result.token, localUri: null });
            if (useMealDraftStore.getState().photos.some((photo) => photo.token === result.token)) {
              uploaded.push(result.token);
            } else {
              await discardStaleUpload(identity, result.token);
            }
          }
        } catch (e) {
          failures.push(e instanceof ApiError ? e.message : '사진을 올리지 못했어요.');
        }
        setUploading({ done: index + 1, total: list.length });
      }
      setUploading(null);

      if (isMealDraftIdentityCurrent(identity)) {
        const messages: string[] = [];
        if (images.length > list.length) {
          messages.push(`사진은 최대 ${MEAL_DRAFT_MAX_PHOTOS}장이라 ${images.length - list.length}장은 넣지 않았어요.`);
        }
        if (failures.length === 1) messages.push(failures[0]!);
        else if (failures.length > 1) messages.push(`사진 ${failures.length}장을 올리지 못했어요. ${failures[0]}`);
        if (messages.length > 0) setError(messages.join(' '));
      }
      if (uploaded.length > 0) await recognizeAll(identity);
    } finally {
      setUploading(null);
      preparation.finish();
    }
  };

  const recognizeAgain = async () => {
    if (busy) return;
    const identity = getMealDraftIdentity();
    const preparation = beginMealDraftPhotoPreparation(identity);
    if (!preparation) return;
    try {
      await recognizeAll(identity);
    } finally {
      preparation.finish();
    }
  };

  return {
    addFiles,
    recognizeAgain,
    removePhoto: (token) => useMealDraftStore.getState().removePhoto(token),
    busy,
    uploading,
    recognizing: recognize.isPending,
    error,
    notice,
    takenAt,
  };
};
