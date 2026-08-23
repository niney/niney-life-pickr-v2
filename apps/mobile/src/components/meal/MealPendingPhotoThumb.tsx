import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { type MealDraftPendingPhoto, useTheme } from '@repo/shared';
import { isMealDraftPhotoAvailable } from '~/lib/mealDraftPhotos';

export const MealPendingPhotoThumb = ({
  photo,
  size = 72,
  onRemove,
  onMissing,
}: {
  photo: MealDraftPendingPhoto;
  size?: number;
  onRemove?: () => void;
  onMissing: () => void;
}) => {
  const theme = useTheme();
  const onMissingRef = useRef(onMissing);

  useEffect(() => {
    onMissingRef.current = onMissing;
  }, [onMissing]);

  useEffect(() => {
    // missing 상태에서는 부모 업데이트를 다시 호출하지 않는다. inline callback이
    // 매 render마다 바뀌어도 effect → update → render 반복이 생기지 않는 경계다.
    if (photo.status === 'missing') return;
    let active = true;
    void isMealDraftPhotoAvailable(photo.localUri).then((available) => {
      if (active && !available) onMissingRef.current();
    });
    return () => {
      active = false;
    };
  }, [photo.localUri, photo.status]);

  const missing = photo.status === 'missing';
  const temporary = !photo.managedLocalFile;
  return (
    <View>
      <View
        accessibilityRole="image"
        accessibilityLabel={missing ? '원본을 찾을 수 없는 업로드 대기 사진' : '업로드 대기 사진'}
        style={[
          styles.box,
          {
            width: size,
            height: size,
            borderColor: missing ? theme.colors.danger : theme.colors.border,
            backgroundColor: theme.colors.surfaceAlt,
          },
        ]}
      >
        {missing ? (
          <Text style={[styles.missing, { color: theme.colors.danger }]}>원본{`\n`}없음</Text>
        ) : (
          <Image
            source={photo.localUri}
            style={{ width: size, height: size }}
            contentFit="cover"
            recyclingKey={photo.clientId}
            cachePolicy="none"
            onError={() => onMissingRef.current()}
          />
        )}
        <View
          style={[
            styles.badge,
            { backgroundColor: missing ? theme.colors.danger : 'rgba(0,0,0,0.68)' },
          ]}
        >
          <Text style={styles.badgeText}>
            {missing ? '확인 필요' : temporary ? '임시 원본' : '업로드 대기'}
          </Text>
        </View>
      </View>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대기 사진 삭제"
          onPress={onRemove}
          style={[
            styles.remove,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
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
  missing: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  badge: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700', textAlign: 'center' },
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
