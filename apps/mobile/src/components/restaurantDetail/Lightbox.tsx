import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
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
import { Image } from 'expo-image';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

// 이 거리 이상 끌어내리면(또는 살짝 튕기면) 닫는다 — 작은 스와이프에도
// 반응하도록 낮게 잡았다.
const DISMISS_THRESHOLD = 60;
// 거리가 짧아도 이 속도 이상으로 아래로 튕기면 닫는다.
const DISMISS_VELOCITY = 500;
// 배경 페이드 기준 — 끌어내린 거리에 비례해 어두운 배경이 옅어진다.
const DISMISS_FADE_DISTANCE = 320;

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
  const safeIdx = images.length > 0 ? ((index % images.length) + images.length) % images.length : 0;
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

  // 아래로 쓸어내려 닫기. translateY 가 손가락을 따라가고, 손을 떼는 시점에
  // 임계값을 넘겼거나 빠르게 튕겼으면 화면 밖으로 마저 내린 뒤 onClose.
  // 가로 스와이프(사진 넘기기)와 충돌하지 않도록:
  //   - failOffsetX([-16,16]) — 가로로 16px 넘게 움직이면 이 제스처는 실패,
  //     터치가 FlatList 로 넘어가 페이징이 동작.
  //   - activeOffsetY([-8,8]) — 세로로 8px 넘게 움직이면 곧장 활성(민감).
  const translateY = useSharedValue(0);
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(translateY.value),
      [0, DISMISS_FADE_DISTANCE],
      [1, 0.25],
      Extrapolation.CLAMP,
    ),
  }));
  const dismissGesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-16, 16])
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
        // 빠른 전환 — 슬라이드아웃 애니메이션 없이 즉시 닫는다.
        runOnJS(onClose)();
      } else {
        // 닫지 않고 놓으면 원위치로 복귀(드래그 취소 피드백).
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  if (images.length === 0) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar hidden />
      {/* RN Modal 은 앱 루트와 분리된 네이티브 뷰 계층이라, 그 안의 제스처가
          동작하려면 Modal 내부를 별도 GestureHandlerRootView 로 감싸야 한다. */}
      <GestureHandlerRootView style={styles.ghRoot}>
        {/* 어두운 배경 — 끌어내리는 동안 옅어진다. */}
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
          pointerEvents="none"
        />
        <GestureDetector gesture={dismissGesture}>
          <Animated.View
            style={[styles.root, contentStyle]}
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
              onViewableItemsChanged={
                undefined as unknown as (info: { viewableItems: ViewToken[] }) => void
              }
              renderItem={({ item }) => (
                // 뷰어를 탭하면 닫는다 (X 버튼 외 보조 닫기). FlatList 가 스와이프
                // 중에는 Pressable 의 press 를 취소하므로, 좌우로 넘기는 동작과
                // 충돌하지 않고 '진짜 탭'에서만 닫힌다.
                <Pressable
                  onPress={onClose}
                  style={{ width, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Image
                    source={item}
                    style={{ width, height: '100%' }}
                    contentFit="contain"
                    recyclingKey={item}
                    transition={150}
                  />
                </Pressable>
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
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  ghRoot: { flex: 1 },
  // 배경색은 backdrop 가 담당 — root(콘텐츠)는 끌어내릴 때 뒤의 backdrop 가
  // 드러나도록 투명하게 둔다.
  backdrop: { backgroundColor: 'rgba(0,0,0,0.95)' },
  root: { flex: 1 },
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
