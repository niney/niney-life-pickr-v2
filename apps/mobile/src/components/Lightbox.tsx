import { useState } from 'react';
import { Modal, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Gallery from 'react-native-awesome-gallery';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

interface Props {
  images: string[];
  index: number;
  onChangeIndex(next: number): void;
  onClose(): void;
}

// 풀스크린 이미지 뷰어. 페이징·핀치/더블탭 줌·줌 상태 패닝·아래로 쓸어내려
// 닫기를 react-native-awesome-gallery 가 한 번에 처리한다. (직접 FlatList +
// 제스처 조합으로는 줌 ↔ 페이징 ↔ 닫기 충돌 조율이 까다로워 라이브러리로 대체.)
//
// 닫기: 단일 탭(onTap) / 아래로 쓸어내리기(onSwipeToClose) / X 버튼 / 안드로이드
//       뒤로가기(Modal onRequestClose). 줌: 핀치 + 더블탭.
export const Lightbox = ({ images, index, onChangeIndex, onClose }: Props) => {
  const safeIdx =
    images.length > 0 ? ((index % images.length) + images.length) % images.length : 0;
  // 인디케이터 표시용 현재 인덱스 — 갤러리 스와이프에 맞춰 갱신.
  const [current, setCurrent] = useState(safeIdx);

  if (images.length === 0) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar hidden />
      {/* RN Modal 은 앱 루트와 분리된 네이티브 계층이라, 내부 제스처가 동작하려면
          별도 GestureHandlerRootView 로 감싸야 한다. */}
      <GestureHandlerRootView style={styles.root}>
        <Gallery
          data={images}
          keyExtractor={(uri, i) => `${i}-${uri}`}
          initialIndex={safeIdx}
          numToRender={3}
          doubleTapScale={2.5}
          maxScale={6}
          onIndexChange={(i) => {
            setCurrent(i);
            onChangeIndex(i);
          }}
          onSwipeToClose={onClose}
          onTap={onClose}
          renderItem={({ item, setImageDimensions }) => (
            <Image
              source={item}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              recyclingKey={item}
              transition={150}
              // 갤러리가 contain 배치·줌 경계를 계산하려면 원본 픽셀 크기가 필요.
              onLoad={(e) =>
                setImageDimensions({ width: e.source.width, height: e.source.height })
              }
            />
          )}
        />

        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="닫기" style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {images.length > 1 && (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>
              {current + 1} / {images.length}
            </Text>
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  counter: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  counterText: { color: '#fff', fontSize: 12, fontVariant: ['tabular-nums'] },
});
