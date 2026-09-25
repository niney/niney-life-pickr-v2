import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { tarotHistoryShareBase, useTarotSession } from '@repo/shared';
import { tarotRemainingPicks, tarotRequiredPicks } from '@repo/utils';
import { TarotCardBack } from '~/components/tarot/TarotCardImage';
import { prefetchTarotFaces } from '~/components/tarot/tarotImages';
import { TarotReadingPanel } from '~/components/tarot/TarotReadingPanel';
import { TarotSetupPanel } from '~/components/tarot/TarotSetupPanel';
import { TarotStage2D, TarotStars } from '~/components/tarot/TarotStage2D';
import { TAROT_STAGE_TIMING } from '~/components/tarot/stageTiming';
import { Icon, TextButton } from '~/components/tarot/tarotUi';
import { TR, gold, ink } from '~/components/tarot/tarotTokens';

// 타로 — 네이티브 화면(웹 /tarot 와 같은 흐름·API). 흐름·해석 요청·게스트 기록·오늘의 카드 잠금은 @repo/shared 의
// useTarotSession(웹 TarotPage 와 공용)이 맡고, 이 화면은 2D 무대와 패널을 그린다.
//   setup(설정) → shuffling(섞기) → picking(부채꼴에서 고르기, 자동으로 뽑기) → placing(자리 잡기) → revealing(한 장씩
//   뒤집기, 모두 뒤집기) → reading(해석 패널). 해석 요청은 마지막 카드를 고른 순간 보내고 연출이 대기를 덮는다.
// 흐름 전환(shuffle_done·placed·reveal_next)은 이 화면의 JS 타이머가 무대와 같은 타이밍으로 낸다 — 무대는 그리기만.
// 뽑은 카드의 앞면은 자리 잡는 동안 미리 받는다. 기기 "동작 줄이기" 면 섞기·자리 잡기·뒤집기 연출을 건너뛴다.
// 딥링크: ?spread=menu(홈 카드) · ?q=&topic=(사주 "타로로도 보기"). 공유는 웹 링크(TarotShareSheet).

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

const HEADER_COLLAPSED = 58;

export default function TarotScreen() {
  const params = useLocalSearchParams<{ spread?: string | string[]; q?: string | string[]; topic?: string | string[] }>();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const session = useTarotSession({
    initial: { spread: first(params.spread), q: first(params.q), topic: first(params.topic) },
    instantShuffle: reduceMotion,
    instantPlace: reduceMotion,
  });
  const { state, callbacks, review } = session;
  const { onShuffleDone, onPlaced, onRevealed } = callbacks;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [collapsed, setCollapsed] = useState(false);

  // 새 리딩을 시작하면 해석 패널을 다시 펼친다(전환 판정은 렌더 중 이전 값 비교).
  const [prevPhase, setPrevPhase] = useState(state.phase);
  if (prevPhase !== state.phase) {
    setPrevPhase(state.phase);
    if (state.phase === 'shuffling') setCollapsed(false);
  }

  // 흐름 타이머 — 무대 연출과 같은 타이밍으로 리듀서를 진행시킨다.
  const T = TAROT_STAGE_TIMING;
  useEffect(() => {
    if (state.phase !== 'shuffling') return undefined;
    const id = setTimeout(onShuffleDone, T.shuffleMs);
    return () => clearTimeout(id);
  }, [state.phase, onShuffleDone, T]);
  useEffect(() => {
    if (state.phase !== 'placing') return undefined;
    const id = setTimeout(onPlaced, T.placeMs);
    return () => clearTimeout(id);
  }, [state.phase, onPlaced, T]);
  useEffect(() => {
    if (state.phase !== 'revealing') return undefined;
    if (reduceMotion) {
      session.send({ type: 'reveal_all' });
      return undefined;
    }
    const id = setTimeout(onRevealed, T.flipGapMs + T.flipMs);
    return () => clearTimeout(id);
    // session.send 는 렌더마다 새 함수라 넣지 않는다 — 동작 줄이기 분기는 phase 가 바뀔 때 한 번이면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.revealed, onRevealed, reduceMotion, T]);
  // 뽑은 카드 앞면을 자리 잡는 동안 미리 받는다.
  useEffect(() => {
    if (state.drawn.length > 0) prefetchTarotFaces(state.drawn.map((d) => d.cardId));
  }, [state.drawn]);

  const total = tarotRequiredPicks(state);
  const remaining = tarotRemainingPicks(state);
  const showReading = !review && (state.phase === 'reading' || (state.phase === 'revealing' && state.revealed > 0));
  const panelOpen = showReading || review !== null;
  const panelExpandedH = Math.round(size.h * 0.56);
  const panelH = panelOpen ? (collapsed ? HEADER_COLLAPSED + insets.bottom : panelExpandedH) : 0;
  const hudVisible = !review && (state.phase === 'shuffling' || state.phase === 'picking' || state.phase === 'placing' || state.phase === 'revealing');
  const inSetup = state.phase === 'setup' && !review;
  const openRecord = (id: string) => router.push(`/tarot/me/${id}` as never);

  return (
    <View style={styles.root} onLayout={(e) => setSize({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '타로',
          headerStyle: { backgroundColor: TR.bg },
          headerTintColor: TR.cream,
          headerTitleStyle: { color: TR.cream },
          headerShadowVisible: false,
          headerRight: session.isMember
            ? () => (
                <Pressable accessibilityRole="button" accessibilityLabel="내 타로 기록" onPress={() => router.push('/tarot/me' as never)} hitSlop={10} style={{ paddingHorizontal: 4 }}>
                  <Icon name="history" size={22} color={TR.cream} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <LinearGradient colors={[TR.bg2, TR.bg]} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
      <TarotStars />

      {size.h > 0 && !inSetup ? (
        <TarotStage2D
          phase={review ? 'review' : state.phase}
          spreadId={review ? review.result.spreadId : state.spreadId}
          deckOrder={state.deckOrder}
          picked={state.picked}
          drawn={review ? review.cards : state.drawn}
          revealed={review ? review.cards.length : state.revealed}
          width={size.w}
          height={size.h}
          hudVisible={hudVisible}
          panelHeight={panelH}
          reduceMotion={reduceMotion}
          onPick={callbacks.onPick}
        />
      ) : null}

      {inSetup ? (
        <ScrollView contentContainerStyle={[styles.setup, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets testID="tarot-setup">
          <View style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[-10, 0, 10].map((deg, i) => (
              <View key={deg} style={{ position: 'absolute', left: '50%', marginLeft: -36 + (i - 1) * 26, top: i === 1 ? 0 : 8, transform: [{ rotate: `${deg}deg` }] }}>
                <TarotCardBack style={{ width: 72 }} />
              </View>
            ))}
          </View>
          <TarotSetupPanel session={session} onOpenRecord={openRecord} onOpenRecords={() => router.push('/tarot/me' as never)} />
        </ScrollView>
      ) : null}

      {hudVisible ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.hud} pointerEvents="box-none">
          <View style={styles.pill}>
            {state.phase === 'shuffling' ? (
              <>
                <ActivityIndicator size="small" color={TR.gold} />
                <Text style={styles.pillText}>카드를 섞는 중… 질문을 마음속으로 떠올려 보세요.</Text>
              </>
            ) : null}
            {state.phase === 'picking' ? (
              <>
                <Text style={styles.pillText}>
                  카드 {total}장을 골라 주세요 <Text style={{ color: ink(0.5) }}>· 남은 {remaining}장</Text>
                </Text>
                <TextButton label="자동으로 뽑기" color={TR.gold} onPress={session.autoPick} />
                <TextButton label="" icon="close" accessibilityLabel="처음으로" onPress={session.reset} />
              </>
            ) : null}
            {state.phase === 'placing' ? (
              <>
                <Icon name="star-four-points" size={14} />
                <Text style={styles.pillText}>카드가 자리를 찾는 중…</Text>
              </>
            ) : null}
            {state.phase === 'revealing' ? (
              <>
                <Text style={styles.pillText}>
                  카드를 뒤집는 중… <Text style={{ color: ink(0.5) }}>{`${state.revealed}/${state.drawn.length}`}</Text>
                </Text>
                <TextButton label="모두 뒤집기" color={TR.gold} onPress={() => session.send({ type: 'reveal_all' })} />
              </>
            ) : null}
          </View>
        </Animated.View>
      ) : null}

      {showReading ? (
        <TarotReadingPanel
          spreadId={state.spreadId}
          topic={state.topic}
          question={state.question}
          choices={state.spreadId === 'choice' ? { a: state.choiceA, b: state.choiceB } : null}
          drawn={state.drawn}
          revealed={state.revealed}
          result={state.result}
          resultStatus={state.resultStatus}
          animate={!reduceMotion}
          shareBase={session.shareBase}
          height={panelExpandedH}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          onRetry={session.retry}
          onReset={session.reset}
        />
      ) : null}

      {review ? (
        <TarotReadingPanel
          spreadId={review.result.spreadId}
          topic={review.result.topic}
          question={review.result.question}
          choices={review.result.choices}
          drawn={review.cards}
          revealed={review.cards.length}
          result={review.result}
          resultStatus="ready"
          animate={false}
          shareBase={tarotHistoryShareBase(review)}
          height={panelExpandedH}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          onRetry={() => undefined}
          onReset={() => session.setReview(null)}
          onClose={() => session.setReview(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: TR.bg },
  setup: { paddingHorizontal: 14, paddingTop: 8, gap: 10 },
  hero: { height: 136, marginBottom: 4 },
  hud: { position: 'absolute', top: 10, left: 12, right: 12, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: gold(0.2), backgroundColor: 'rgba(11,16,48,0.92)', maxWidth: '100%' },
  pillText: { fontSize: 12, color: TR.ink, flexShrink: 1 },
});
