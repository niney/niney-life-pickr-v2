import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';

interface Props {
  images: string[];
  index: number;
  onChangeIndex(next: number): void;
  onClose(): void;
}

// 풀스크린 가로 스와이프 캐러셀. FlatList horizontal pagingEnabled 가 RN 의
// scroll-snap 역할 — 손가락 momentum + 페이지 단위 안착이 자동.
// 외부 index 와 내부 currentIndex 양방향 sync:
//   - 사용자 스와이프 → onMomentumScrollEnd 가 index 계산 → onChangeIndex
//   - 외부 index 변경 → scrollToIndex 로 jump
// 이중 트리거 방지: programmatic scroll 중에는 onMomentumScrollEnd 무시.
export const Lightbox = ({ images, index, onChangeIndex, onClose }: Props) => {
  const safeIdx =
    images.length > 0 ? ((index % images.length) + images.length) % images.length : 0;
  const [width, setWidth] = useState(Dimensions.get('window').width);
  const listRef = useRef<FlatList<string> | null>(null);
  const ignoreScrollRef = useRef(false);

  // 외부 index 변경 → scroll. 첫 mount 도 같은 effect 가 처리.
  useEffect(() => {
    if (!listRef.current) return;
    ignoreScrollRef.current = true;
    listRef.current.scrollToIndex({ index: safeIdx, animated: false });
    // 다음 프레임에 플래그 해제 — onMomentumScrollEnd 가 안 발사되더라도 안전.
    const t = setTimeout(() => {
      ignoreScrollRef.current = false;
    }, 50);
    return () => clearTimeout(t);
  }, [safeIdx, width]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (ignoreScrollRef.current) {
        ignoreScrollRef.current = false;
        return;
      }
      if (width <= 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      if (next !== safeIdx) onChangeIndex(next);
    },
    [safeIdx, width, onChangeIndex],
  );

  if (images.length === 0) return null;

  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar hidden />
      <View
        style={styles.root}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(uri, i) => `${i}-${uri}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={safeIdx}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onViewableItemsChanged={undefined as unknown as (info: { viewableItems: ViewToken[] }) => void}
          renderItem={({ item }) => (
            <View style={{ width, alignItems: 'center', justifyContent: 'center' }}>
              <Image
                source={{ uri: item }}
                style={{ width, height: '100%' }}
                resizeMode="contain"
              />
            </View>
          )}
        />

        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="닫기"
          style={styles.closeBtn}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {images.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {safeIdx + 1} / {images.length}
            </Text>
          </View>
        )}
      </View>
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
