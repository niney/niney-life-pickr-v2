import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@repo/shared';
import { useCachedMealPhoto } from '~/hooks/useCachedMealPhoto';

// 식단 사진 썸네일 — 서버가 JWT 를 요구해 <Image source={{uri}}> 로 직접 못 부른다.
// 앱은 인증 응답을 계정별 file:// 캐시에 받아 base64 재변환 없이 표시한다.
// Expo Web만 공통 훅의 object URL 경로로 폴백한다.
// localUri 가 있으면(앱 픽커가 방금 준 파일) 그걸 먼저 써서 업로드 직후 즉시 보이게 한다.
export const MealPhotoThumb = ({
  token,
  localUri,
  size = 72,
  onPress,
  onRemove,
  onUriResolved,
}: {
  token: string;
  localUri?: string | null;
  size?: number;
  onPress?: () => void;
  onRemove?: () => void;
  onUriResolved?: (token: string, uri: string | null) => void;
}) => {
  const theme = useTheme();
  const { uri: cachedUri, error, retry } = useCachedMealPhoto(token, {
    variant: 'thumb',
    enabled: !localUri,
  });
  const uri = localUri ?? cachedUri;

  useEffect(() => {
    onUriResolved?.(token, uri);
    return () => onUriResolved?.(token, null);
  }, [onUriResolved, token, uri]);

  const handlePress = uri ? onPress : error ? retry : undefined;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={error ? '식단 사진 다시 불러오기' : '식단 사진'}
        onPress={handlePress}
        disabled={!handlePress}
        style={[
          styles.box,
          { width: size, height: size, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
        ]}
      >
        {uri ? (
          <Image
            source={uri}
            style={{ width: size, height: size }}
            contentFit="cover"
            recyclingKey={`${token}:${uri}`}
            transition={120}
            cachePolicy="memory"
          />
        ) : error ? (
          <Text style={[styles.err, { color: theme.colors.textMuted }]}>!</Text>
        ) : (
          <ActivityIndicator size="small" color={theme.colors.textMuted} />
        )}
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="사진 삭제"
          onPress={onRemove}
          style={[styles.remove, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
        >
          <Text style={{ color: theme.colors.danger, fontSize: 12, lineHeight: 14 }}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  err: { fontSize: 16, fontWeight: '700' },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
