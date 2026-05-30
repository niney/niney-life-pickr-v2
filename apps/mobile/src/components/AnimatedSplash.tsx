import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// 인앱 2단 애니메이션 스플래시.
//   1단) 코드 그라데이션 배경 위로 핀 로고가 위에서 톡 떨어지며 바운스 등장
//   2단) 핀이 자리잡은 뒤 풀스크린 splash.png 가 크로스페이드로 덮임 (브랜드 화면)
//   3단) 앱 준비되면 전체 페이드아웃
// 1단 배경 그라데이션 색은 splash.png 와 동일(#5e1dde→#3916ae→#161380)이라,
// 네이티브 단색(#3916ae) → 1단 → 2단 splash.png 가 색 끊김 없이 이어진다.
const PIN = require('../../assets/splash-logo.png');
const SPLASH = require('../../assets/splash.png');

// 1단 핀이 자리잡은 뒤 2단 splash.png 페이드인 시작/길이(ms).
const SPLASH_FADE_DELAY = 950;
const SPLASH_FADE_DURATION = 550;

type Props = {
  /** false 가 되는 순간 전체 페이드아웃 시작 */
  visible: boolean;
  /** 페이드아웃이 끝나 완전히 사라진 뒤 호출 (부모가 unmount) */
  onHidden?: () => void;
};

export function AnimatedSplash({ visible, onHidden }: Props) {
  const containerOpacity = useSharedValue(1); // 전체 퇴장 페이드
  const pinOpacity = useSharedValue(0);
  const pinY = useSharedValue(-64);
  const pinScale = useSharedValue(0.5);
  const splashOpacity = useSharedValue(0); // 2단 splash.png 오버레이

  // 입장 시퀀스 (마운트 1회)
  useEffect(() => {
    // 1단 — 핀 바운스 등장
    pinOpacity.value = withTiming(1, { duration: 260 });
    pinY.value = withSpring(0, { damping: 7, stiffness: 130, mass: 0.85 });
    pinScale.value = withSpring(1, { damping: 6, stiffness: 140, mass: 0.85 });
    // 2단 — splash.png 크로스페이드 인
    splashOpacity.value = withDelay(
      SPLASH_FADE_DELAY,
      withTiming(1, { duration: SPLASH_FADE_DURATION, easing: Easing.out(Easing.quad) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3단 — 퇴장 페이드아웃
  useEffect(() => {
    if (visible) return;
    containerOpacity.value = withTiming(
      0,
      { duration: 400, easing: Easing.out(Easing.quad) },
      (finished) => {
        if (finished && onHidden) runOnJS(onHidden)();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
  const pinStyle = useAnimatedStyle(() => ({
    opacity: pinOpacity.value,
    transform: [{ translateY: pinY.value }, { scale: pinScale.value }],
  }));
  const splashStyle = useAnimatedStyle(() => ({ opacity: splashOpacity.value }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, containerStyle]}>
      {/* 1단 — 그라데이션 배경 + 바운스 핀 */}
      <LinearGradient
        colors={['#5e1dde', '#3916ae', '#161380']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.center}>
        <Animated.View style={pinStyle}>
          <Image source={PIN} style={styles.pin} contentFit="contain" />
        </Animated.View>
      </View>
      {/* 2단 — 풀스크린 splash.png 오버레이 (크로스페이드로 1단을 덮음) */}
      <Animated.View style={[StyleSheet.absoluteFill, splashStyle]}>
        <Image source={SPLASH} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: { width: 200, height: 200 },
});
