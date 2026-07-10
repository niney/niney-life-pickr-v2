import { useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { SegmentedControl, useTheme } from '@repo/shared';
import type { TransitMode } from '~/hooks/useTransitScreen';

interface Props {
  mode: TransitMode;
  onChangeMode(next: TransitMode): void;
  // 확정 입력값(리듀서 진실) — 내부 draft 는 이 값에서 동기화(IME 안전).
  q: string;
  // 라이브 채널(지하철 전용 — 300ms 디바운스로 발화). 미지정이면 제출형만.
  onChangeQ?(next: string): void;
  // 제출 채널(Enter/키보드 검색 키) — draft 를 그대로 넘긴다.
  onSubmitQ(q: string): void;
  nearMode: boolean;
  onNearby(): void;
  onClearNear(): void;
  nearestActive: boolean;
  onNearest(): void;
  // 메타 행 문자열("총 N개 · 갱신 N분 전" 등) — null 이면 행 생략.
  meta: string | null;
  // 결과 절단 안내(items < total).
  truncated?: boolean;
  // 서울시 API 실패로 만료 캐시 표시 중(버스 검색 응답 source==='stale').
  stale?: boolean;
  // 버스 강제 새로고침(M4) — 지정 시 버튼 노출.
  onRefresh?(): void;
  refreshing?: boolean;
  // 0=peek, 1=half, 2=full — gorhom BottomSheet 의 animatedIndex.
  sheetIndex: SharedValue<number>;
  topInset: number;
  onMeasure?(cardHeight: number): void;
}

const MODE_OPTIONS = [
  { value: 'bus' as const, label: '버스' },
  { value: 'subway' as const, label: '지하철' },
];

// 대중교통 플로팅 헤더 — 지도 위 상단 카드(RestaurantsFloatingHeader 골격).
// [버스|지하철] 세그먼트 + 검색 인풋 + 주변/해제 버튼 + 메타 행. snap 위치에
// 따라 floating 카드 ↔ sticky 로 보간.
export const TransitFloatingHeader = ({
  mode,
  onChangeMode,
  q,
  onChangeQ,
  onSubmitQ,
  nearMode,
  onNearby,
  onClearNear,
  nearestActive,
  onNearest,
  meta,
  truncated,
  stale,
  onRefresh,
  refreshing,
  sheetIndex,
  topInset,
  onMeasure,
}: Props) => {
  const theme = useTheme();
  const [draft, setDraft] = useState(q);
  // onChangeQ 최신 참조 — 디바운스 effect 가 콜백 참조 변경마다 재예약되지 않게.
  const changeQRef = useRef(onChangeQ);
  useEffect(() => {
    changeQRef.current = onChangeQ;
  });

  // 외부(모드 전환·주변 진입 등)에서 q 가 바뀌면 draft 동기화.
  useEffect(() => {
    setDraft(q);
  }, [q]);

  // 라이브 채널 — 300ms 디바운스(RestaurantSearchBar 관용구). 제출형(버스)은
  // onChangeQ 미지정이라 발화하지 않는다.
  useEffect(() => {
    if (!changeQRef.current || draft === q) return;
    const t = setTimeout(() => changeQRef.current?.(draft), 300);
    return () => clearTimeout(t);
  }, [draft, q]);

  const animatedCardStyle = useAnimatedStyle(() => {
    'worklet';
    const idx = sheetIndex.value;
    const t = Math.min(1, Math.max(0, (idx - 1.5) / 0.5));
    return {
      marginHorizontal: 16 * (1 - t),
      borderRadius: 12 * (1 - t),
      marginTop: 8 * (1 - t),
      shadowOpacity: 0.15 * (1 - t),
      elevation: 4 * (1 - t),
    };
  });

  const animatedWrapStyle = useAnimatedStyle(() => {
    'worklet';
    const idx = sheetIndex.value;
    const t = Math.min(1, Math.max(0, (idx - 1.5) / 0.5));
    return {
      backgroundColor: interpolateColor(t, [0, 1], ['transparent', theme.colors.surface]),
    };
  });

  const handleLayout = (e: LayoutChangeEvent) => {
    if (onMeasure) onMeasure(e.nativeEvent.layout.height);
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingTop: topInset }, animatedWrapStyle]}
    >
      <Animated.View
        onLayout={handleLayout}
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          animatedCardStyle,
        ]}
      >
        <View style={styles.content}>
          <SegmentedControl value={mode} options={MODE_OPTIONS} onChange={onChangeMode} />
          <View style={styles.searchRow}>
            <View
              style={[
                styles.inputBox,
                { backgroundColor: theme.colors.bg, borderColor: theme.colors.border },
              ]}
            >
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => onSubmitQ(draft)}
                placeholder={mode === 'subway' ? '역 이름으로 검색' : '정류장 이름으로 검색'}
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="search"
                maxLength={50}
                autoCorrect={false}
                style={[styles.input, { color: theme.colors.text }]}
              />
              {draft.length > 0 && (
                <Pressable
                  onPress={() => {
                    setDraft('');
                    // 라이브(지하철)는 즉시 반영, 제출형(버스)은 빈 제출로 초기화.
                    if (onChangeQ) onChangeQ('');
                    else onSubmitQ('');
                  }}
                  hitSlop={8}
                  accessibilityLabel="검색어 지우기"
                >
                  <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>✕</Text>
                </Pressable>
              )}
            </View>
            {onRefresh && (
              <Pressable
                onPress={onRefresh}
                disabled={refreshing}
                style={[
                  styles.iconBtn,
                  { borderColor: theme.colors.border, opacity: refreshing ? 0.5 : 1 },
                ]}
                accessibilityLabel="강제 새로고침"
              >
                <Text style={{ fontSize: 14 }}>↻</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onNearest}
              style={[
                styles.quickBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: nearestActive ? theme.colors.surfaceAlt : 'transparent',
                },
              ]}
              accessibilityLabel="내 위치에서 가까운 정류장과 역"
              accessibilityState={{ selected: nearestActive }}
            >
              <Text style={[styles.quickBtnText, { color: theme.colors.text }]}>근처</Text>
            </Pressable>
            <Pressable
              onPress={onNearby}
              style={[
                styles.iconBtn,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: nearMode ? theme.colors.surfaceAlt : 'transparent',
                },
              ]}
              accessibilityLabel={mode === 'subway' ? '내 주변 역' : '내 주변 정류장'}
            >
              <Text style={{ fontSize: 14 }}>📍</Text>
            </Pressable>
          </View>
          {(meta || nearMode) && (
            <View style={styles.metaRow}>
              {nearMode && (
                <View style={[styles.pill, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>
                    📍 주변
                  </Text>
                </View>
              )}
              {meta && (
                <Text
                  style={[styles.metaText, { color: theme.colors.textMuted }]}
                  numberOfLines={1}
                >
                  {meta}
                </Text>
              )}
              {nearMode && (
                <Pressable
                  onPress={onClearNear}
                  hitSlop={8}
                  style={styles.clearNear}
                  accessibilityLabel="주변 모드 해제"
                >
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>✕</Text>
                </Pressable>
              )}
            </View>
          )}
          {stale && (
            <Text style={[styles.metaText, { color: theme.mode === 'dark' ? '#fbbf24' : '#b45309' }]}>
              서울시 응답 지연 — 캐시 결과 표시 중
            </Text>
          )}
          {truncated && (
            <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>
              결과가 많아 일부만 표시합니다.
            </Text>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBtn: {
    width: 44,
    height: 36,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBtnText: { fontSize: 12, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillText: { fontSize: 11, fontWeight: '600' },
  metaText: {
    fontSize: 11,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  clearNear: { marginLeft: 'auto' },
});
