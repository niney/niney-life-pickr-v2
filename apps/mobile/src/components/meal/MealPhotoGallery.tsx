import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '@repo/shared';
import { Lightbox } from '~/components/Lightbox';
import { useCachedMealPhoto } from '~/hooks/useCachedMealPhoto';
import { ensureMealPhotoFile } from '~/lib/mealPhotoCache';
import { MealPhotoThumb } from './MealPhotoThumb';

interface ResolverProps {
  token: string;
  enabled: boolean;
  onResolved(token: string, uri: string): void;
}

interface ResolvedUris {
  authToken: string | null;
  values: Record<string, string>;
}

const EMPTY_URIS: Record<string, string> = {};

// Lightbox가 열린 동안에만 원본을 준비한다. 상세 진입만으로 최대 5장의 1600px
// 원본을 모두 받지 않고, 기다리는 동안은 이미 받은 썸네일을 먼저 보여 준다.
const FullPhotoResolver = ({ token, enabled, onResolved }: ResolverProps) => {
  const { uri } = useCachedMealPhoto(token, { variant: 'full', enabled });
  useEffect(() => {
    if (uri) onResolved(token, uri);
  }, [onResolved, token, uri]);
  return null;
};

export const MealPhotoGallery = ({
  tokens,
  size = 96,
}: {
  tokens: readonly string[];
  size?: number;
}) => {
  const authToken = useAuthStore((state) => state.token);
  const tokenKey = tokens.join(':');
  // 사진 토큰은 UUID라 ':'를 포함하지 않는다. 값 기반 key로 배열 identity를
  // 안정화해 부모가 map()으로 새 배열을 넘겨도 effect/handler가 불필요하게 재생성되지 않는다.
  const tokenList = useMemo(() => (tokenKey ? tokenKey.split(':') : []), [tokenKey]);
  const [thumbState, setThumbState] = useState<ResolvedUris>({
    authToken: null,
    values: {},
  });
  const [fullState, setFullState] = useState<ResolvedUris>({
    authToken: null,
    values: {},
  });
  const [requestedIndex, setRequestedIndex] = useState<number | null>(null);
  const [actionBusy, setActionBusy] = useState<'share' | 'save' | null>(null);

  const activeIndex =
    requestedIndex !== null && requestedIndex < tokenList.length ? requestedIndex : null;

  // state 안 URI도 credential과 묶는다. 계정 A→B 전환 render에서 child effect의
  // cleanup을 기다리지 않고 즉시 A의 file:// 경로를 화면에서 제외한다.
  const thumbUris = thumbState.authToken === authToken ? thumbState.values : EMPTY_URIS;
  const fullUris = fullState.authToken === authToken ? fullState.values : EMPTY_URIS;

  const handleThumbUri = useCallback((token: string, uri: string | null) => {
    setThumbState((state) => {
      const current = state.authToken === authToken ? state.values : EMPTY_URIS;
      if (uri) {
        if (state.authToken === authToken && current[token] === uri) return state;
        return { authToken, values: { ...current, [token]: uri } };
      }
      if (!(token in current)) {
        return state.authToken === authToken ? state : { authToken, values: {} };
      }
      const next = { ...current };
      delete next[token];
      return { authToken, values: next };
    });
  }, [authToken]);

  const handleFullUri = useCallback((token: string, uri: string) => {
    setFullState((state) => {
      const current = state.authToken === authToken ? state.values : EMPTY_URIS;
      if (state.authToken === authToken && current[token] === uri) return state;
      return { authToken, values: { ...current, [token]: uri } };
    });
  }, [authToken]);

  const viewerImages = tokenList.map((token) => fullUris[token] ?? thumbUris[token] ?? null);
  const viewerReady = viewerImages.every((uri): uri is string => !!uri);

  const localFullFile = useCallback(
    async (index: number): Promise<string> => {
      const token = tokenList[index];
      if (!authToken || !token) throw new Error('로그인이 필요합니다.');
      const uri = await ensureMealPhotoFile(authToken, token, 'full');
      handleFullUri(token, uri);
      return uri;
    },
    [authToken, handleFullUri, tokenList],
  );

  const handleShare = useCallback(
    async (index: number) => {
      if (actionBusy) return;
      setActionBusy('share');
      try {
        const uri = await localFullFile(index);
        if (!(await Sharing.isAvailableAsync())) throw new Error('공유 기능을 사용할 수 없습니다.');
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
          UTI: 'public.jpeg',
          dialogTitle: '식단 사진 공유',
        });
      } catch (error) {
        Alert.alert(
          '사진 공유 실패',
          error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        );
      } finally {
        setActionBusy(null);
      }
    },
    [actionBusy, localFullFile],
  );

  const handleSave = useCallback(
    async (index: number) => {
      if (actionBusy) return;
      setActionBusy('save');
      try {
        const uri = await localFullFile(index);
        const token = tokenList[index];
        if (!token) throw new Error('사진을 찾을 수 없습니다.');

        if (Platform.OS === 'android') {
          const permission =
            await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!permission.granted) return;
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const destination = await FileSystem.StorageAccessFramework.createFileAsync(
            permission.directoryUri,
            `life-pickr-meal-${token.slice(0, 8)}`,
            'image/jpeg',
          );
          await FileSystem.StorageAccessFramework.writeAsStringAsync(destination, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          Alert.alert('저장 완료', '선택한 폴더에 식단 사진을 저장했습니다.');
          return;
        }

        // expo-media-library를 추가하지 않고도 iOS 공유 시트의 "이미지 저장" 또는
        // "파일에 저장" 액션으로 내보낼 수 있다.
        if (!(await Sharing.isAvailableAsync())) throw new Error('저장 기능을 사용할 수 없습니다.');
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
          UTI: 'public.jpeg',
          dialogTitle: '식단 사진 저장',
        });
      } catch (error) {
        Alert.alert(
          '사진 저장 실패',
          error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        );
      } finally {
        setActionBusy(null);
      }
    },
    [actionBusy, localFullFile, tokenList],
  );

  const actions = useMemo(
    () =>
      Platform.OS === 'web'
        ? []
        : [
            {
              key: 'share',
              label: actionBusy === 'share' ? '공유 중…' : '공유',
              disabled: actionBusy !== null,
              onPress: (index: number): void => {
                void handleShare(index);
              },
            },
            {
              key: 'save',
              label: actionBusy === 'save' ? '저장 중…' : '저장',
              accessibilityLabel: Platform.OS === 'ios' ? '공유 메뉴에서 사진 저장' : '사진 저장',
              disabled: actionBusy !== null,
              onPress: (index: number): void => {
                void handleSave(index);
              },
            },
          ],
    [actionBusy, handleSave, handleShare],
  );

  if (tokenList.length === 0) return null;

  return (
    <>
      <View style={styles.photos}>
        {tokenList.map((token, index) => (
          <MealPhotoThumb
            key={token}
            token={token}
            size={size}
            onPress={() => setRequestedIndex(index)}
            onUriResolved={handleThumbUri}
          />
        ))}
      </View>

      {activeIndex !== null
        ? tokenList.map((token) => (
            <FullPhotoResolver
              key={`full-${token}`}
              token={token}
              enabled
              onResolved={handleFullUri}
            />
          ))
        : null}

      {activeIndex !== null && viewerReady ? (
        <Lightbox
          images={viewerImages}
          index={activeIndex}
          onChangeIndex={setRequestedIndex}
          onClose={() => setRequestedIndex(null)}
          actions={actions}
        />
      ) : null}

      <Modal
        visible={activeIndex !== null && !viewerReady}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setRequestedIndex(null)}
      >
        <View style={styles.preparing}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.preparingText}>사진 준비 중…</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="사진 보기 취소"
            onPress={() => setRequestedIndex(null)}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preparing: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  preparingText: { color: '#fff', fontSize: 14 },
  cancelButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  cancelText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
