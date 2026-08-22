import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMealPhotoUrl, useTheme } from '@repo/shared';

// 식단 사진 썸네일 — 서버가 JWT 를 요구해 <Image source={{uri}}> 로 직접 못 부른다.
// useMealPhotoUrl 이 blob 을 받아 RN 에서는 data URL 로 바꿔 준다(웹은 objectURL).
// localUri 가 있으면(앱 픽커가 방금 준 파일) 그걸 먼저 써서 업로드 직후 즉시 보이게 한다.
export const MealPhotoThumb = ({
  token,
  localUri,
  size = 72,
  onPress,
  onRemove,
}: {
  token: string;
  localUri?: string | null;
  size?: number;
  onPress?: () => void;
  onRemove?: () => void;
}) => {
  const theme = useTheme();
  const { url, error } = useMealPhotoUrl(token, { variant: 'thumb', enabled: !localUri });
  const uri = localUri ?? url;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="식단 사진"
        onPress={onPress}
        disabled={!onPress}
        style={[
          styles.box,
          { width: size, height: size, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
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
