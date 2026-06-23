import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useReviewAskStore, useTheme } from '@repo/shared';

// 진행 중인 공개 질문(AskTab)을 앱 전역에서 지켜보다 완료되면 상단 배너로 알린다.
// 답변은 LLM 3콜이라 15초+ 걸려 사용자가 탭/화면을 떠나기 쉬운데, 그래도 결과를
// 놓치지 않게 한다 — 탭하거나 '더보기'를 누르면 해당 식당 질문 탭으로 복귀한다.
// 지금 그 식당 질문 탭을 보고 있으면(store.visiblePlaceId) 화면에 이미 결과가
// 뜨므로 배너는 생략(노이즈 방지). 웹의 ReviewAskToaster(Sonner) 대응 — 앱엔
// 지속형 토스트 인프라가 없어 직접 만든다. _layout 에 1개만 상주.
// 애니메이션은 코드베이스 관례대로 reanimated(AnimatedSplash 와 동일 계열).
const AUTO_DISMISS_MS = 8000;

interface Shown {
  placeId: string;
  restaurantName: string | null;
  ok: boolean;
  answer?: string;
}

export const ReviewAskBanner = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const completion = useReviewAskStore((s) => s.completion);
  const clearCompletion = useReviewAskStore((s) => s.clearCompletion);

  const [shown, setShown] = useState<Shown | null>(null);
  const lastSeq = useRef(0);
  const progress = useSharedValue(0); // 0 = 숨김, 1 = 노출

  // 새 완료 이벤트 감지 → 표시 여부 결정.
  useEffect(() => {
    if (!completion || completion.seq === lastSeq.current) return;
    lastSeq.current = completion.seq;
    const { placeId, restaurantName, ok, answer } = completion;
    clearCompletion();
    // 지금 그 식당 질문 탭을 보고 있으면 생략(인라인으로 이미 표시됨). 완료
    // 시점의 최신 값을 store 에서 직접 읽어 ref-during-render 를 피한다.
    if (useReviewAskStore.getState().visiblePlaceId === placeId) return;
    setShown({ placeId, restaurantName, ok, answer });
  }, [completion, clearCompletion]);

  // 표시 중일 때 슬라이드 인 + 자동 닫힘 타이머.
  useEffect(() => {
    if (!shown) return;
    progress.value = withTiming(1, { duration: 220 });
    const t = setTimeout(() => {
      progress.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setShown)(null);
      });
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [shown, progress]);

  // 하단에서 살짝 올라오며 페이드. 상단은 식당 상세의 네이티브 헤더와 겹쳐
  // 가려지므로 하단에 띄운다(웹 Sonner 의 bottom-center 와도 일관).
  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 24 }],
  }));

  if (!shown) return null;

  const dismiss = (): void => {
    progress.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) runOnJS(setShown)(null);
    });
  };
  const goAsk = (): void => {
    dismiss();
    router.push(`/restaurant/${shown.placeId}?tab=ask` as never);
  };

  const bottom = Math.max(insets.bottom, 12) + 8;
  const preview =
    shown.answer && shown.answer.length > 80 ? `${shown.answer.slice(0, 80)}…` : shown.answer;
  const title = shown.ok
    ? shown.restaurantName
      ? `${shown.restaurantName} · 답변 준비됐어요`
      : '답변 준비됐어요'
    : '답변을 가져오지 못했어요';

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom }, animStyle]}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Pressable style={styles.body} onPress={goAsk} accessibilityRole="button">
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {shown.ok && preview ? (
            <Text style={[styles.preview, { color: theme.colors.textMuted }]} numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            onPress={goAsk}
            hitSlop={8}
            style={[styles.moreBtn, { backgroundColor: theme.colors.primary }]}
          >
            <Text style={{ color: theme.colors.primaryText, fontWeight: '600', fontSize: 12 }}>
              {shown.ok ? '더보기' : '다시 보기'}
            </Text>
          </Pressable>
          <Pressable onPress={dismiss} hitSlop={8} style={styles.closeBtn} accessibilityLabel="닫기">
            <Text style={{ color: theme.colors.textMuted, fontSize: 16 }}>✕</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 12, zIndex: 1000, elevation: 1000 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '700' },
  preview: { fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moreBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  closeBtn: { padding: 4 },
});
