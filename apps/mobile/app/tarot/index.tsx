import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
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
import type { TarotStage3D as TarotStage3DView, TarotStage3DControl } from '~/components/tarot/TarotStage3D';
import { STAGE_3D_AVAILABLE } from '~/components/common/stage3d/stage3dAvailable';
import { useStage3DGate } from '~/components/common/stage3d/useStage3DGate';
import { TAROT_STAGE_TIMING } from '~/components/tarot/stageTiming';
import { Icon, TextButton } from '~/components/tarot/tarotUi';
import { TR, gold, ink } from '~/components/tarot/tarotTokens';

// 타로 — 네이티브 화면(웹 /tarot 와 같은 흐름·API). 흐름·해석 요청·게스트 기록·오늘의 카드 잠금은 @repo/shared 의
// useTarotSession(웹 TarotPage 와 공용)이 맡고, 이 화면은 무대와 패널을 그린다.
// 무대: iOS 는 3D(expo-gl — 웹 3D 무대와 같은 탁자·덱·부채꼴·뒤집기, 화면 전체 뒤 캔버스 한 장). 입력 화면 위쪽에 덱을
// 보여 주며 준비를 잰다 — 3D 로 할지·캔버스를 언제 올리고 내릴지는 사주와 같은 공용 문지기(useStage3DGate, 기기 판정
// 기억). 섞는 순간 3D·2D 를 정해 끝까지 간다. Android·"동작 줄이기"·느린 GPU·GL 오류·기록 다시 보기는 2D(Reanimated).
// 3D 에서 고를 때는 캔버스 위 터치 층이 받는다 — 좌우로 밀면 부채꼴을 훑고, 누르는 동안 가까운 카드가 들리고, 떼면 고른다.
//   setup(설정) → shuffling(섞기) → picking(부채꼴에서 고르기, 자동으로 뽑기) → placing(자리 잡기) → revealing(한 장씩
//   뒤집기, 모두 뒤집기) → reading(해석 패널). 해석 요청은 마지막 카드를 고른 순간 보내고 연출이 대기를 덮는다.
// 흐름 전환(shuffle_done·placed·reveal_next)은 이 화면의 JS 타이머가 무대와 같은 타이밍으로 낸다 — 무대는 그리기만.
// 뽑은 카드의 앞면은 자리 잡는 동안 미리 받는다. 기기 "동작 줄이기" 면 섞기·자리 잡기·뒤집기 연출을 건너뛴다.
// 딥링크: ?spread=menu(홈 카드) · ?q=&topic=(사주 "타로로도 보기"). 공유는 웹 링크(TarotShareSheet).

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

const HEADER_COLLAPSED = 58;
/** 입력 화면 위쪽 덱 자리 높이 — 3D 는 이 가운데에 덱이 오게 카메라를 맞춘다. */
const HERO_H = 150;
const SETUP_PAD_TOP = 8;
// 3D 부채꼴 훑기 — 웹과 같은 드래그 감도·한계(rad). 이보다 적게 움직이면 누름(고르기).
const DRAG_GAIN = 0.0032;
const FAN_OFFSET_MAX = 0.95;
const TAP_SLOP = 8;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// 3D 무대 모듈은 expo-gl 네이티브 모듈이 있는 빌드에서만 불러온다 — 없는 빌드에서 import 만으로 화면이 죽지 않게.
const TarotStage3D: typeof TarotStage3DView | null = STAGE_3D_AVAILABLE
  ? (require('~/components/tarot/TarotStage3D') as { TarotStage3D: typeof TarotStage3DView }).TarotStage3D
  : null;

export default function TarotScreen() {
  const params = useLocalSearchParams<{ spread?: string | string[]; q?: string | string[]; topic?: string | string[]; stage?: string | string[] }>();
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

  // ── 3D 무대 ─────────────────────────────────────────────────────────────
  const inSetup = state.phase === 'setup' && !review;
  // 개발 빌드 전용 ?stage=3d|2d — 판정·기억 없이 강제(시뮬레이터는 소프트웨어 GL 이라 평소엔 2D 로 간다).
  const stageParam = __DEV__ ? first(params.stage) : null;
  // 연출(섞기~해석) 무대는 설정을 떠나는 순간 문지기가 3D·2D 로 정해 끝까지 간다.
  const gate = useStage3DGate({
    scope: 'tarot',
    available: TarotStage3D !== null,
    stageParam,
    reduceMotion,
    layoutReady: size.h > 0,
    inHero: inSetup,
    performing: !review && state.phase !== 'setup',
  });
  const stage3D = gate.stage3D;

  // 새 리딩을 시작하면(설정을 떠나는 순간) 해석 패널을 다시 펼친다(렌더 중 이전 값 비교 — 동작 줄이기면 섞기가 바로
  // 뽑기로 넘어가 shuffling 을 건너뛸 수 있다).
  const [prevPhase, setPrevPhase] = useState(state.phase);
  if (prevPhase !== state.phase) {
    setPrevPhase(state.phase);
    if (prevPhase === 'setup' && state.phase !== 'setup') setCollapsed(false);
  }

  // 3D 고르기 터치 층 — 캔버스는 터치를 받지 않아 여기서 받아 장면과 controlRef 로 주고받는다(렌더와 무관한 ref).
  // 누르는 동안 가까운 카드가 들리고, 좌우로 TAP_SLOP 넘게 밀면 부채꼴을 훑고, 밀지 않고 떼면 그 카드를 고른다.
  const controlRef = useRef<TarotStage3DControl>({ fanOffset: 0, hovered: -1, nearestAt: null });
  const dragRef = useRef({ x0: 0, off0: 0, moved: false });
  const nearestAt = (x: number, y: number): number => {
    const f = controlRef.current.nearestAt;
    return f && size.w > 0 && size.h > 0 ? f((x / size.w) * 2 - 1, 1 - (y / size.h) * 2) : -1;
  };
  const onTouchStart = (e: GestureResponderEvent) => {
    dragRef.current = { x0: e.nativeEvent.pageX, off0: controlRef.current.fanOffset, moved: false };
    controlRef.current.hovered = nearestAt(e.nativeEvent.locationX, e.nativeEvent.locationY);
  };
  const onTouchMove = (e: GestureResponderEvent) => {
    const d = dragRef.current;
    const dx = e.nativeEvent.pageX - d.x0;
    if (!d.moved && Math.abs(dx) > TAP_SLOP) d.moved = true;
    if (d.moved) {
      controlRef.current.fanOffset = clamp(d.off0 + dx * DRAG_GAIN, -FAN_OFFSET_MAX, FAN_OFFSET_MAX);
      controlRef.current.hovered = -1;
    } else {
      controlRef.current.hovered = nearestAt(e.nativeEvent.locationX, e.nativeEvent.locationY);
    }
  };
  const onTouchEnd = (e: GestureResponderEvent) => {
    if (!dragRef.current.moved) {
      const hov = controlRef.current.hovered;
      const idx = hov >= 0 ? hov : nearestAt(e.nativeEvent.locationX, e.nativeEvent.locationY);
      const id = idx >= 0 ? state.deckOrder[idx] : undefined;
      if (id) callbacks.onPick(id);
    }
    controlRef.current.hovered = -1;
  };
  const onTouchCancel = () => {
    controlRef.current.hovered = -1;
  };

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
  // 뽑은 카드 앞면을 자리 잡는 동안 미리 받는다 — 2D 무대와 해석 패널의 카드 그림(3D 무대는 장면이 JPEG 텍스처로 따로 받는다).
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

      {gate.mount && TarotStage3D ? (
        <TarotStage3D
          phase={state.phase}
          deckOrder={state.deckOrder}
          picked={state.picked}
          drawn={state.drawn}
          revealed={state.revealed}
          total={total}
          width={size.w}
          height={size.h}
          heroCenterY={SETUP_PAD_TOP + HERO_H / 2}
          panelHeight={panelH}
          visible={gate.visible}
          controlRef={controlRef}
          force={gate.force}
          onReady={gate.onReady}
          onFail={gate.onFail}
          onLost={gate.onLost}
        />
      ) : null}

      {size.h > 0 && !inSetup && !stage3D ? (
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
          {gate.heroMode === '2d' ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="tarot-hero-2d">
              {[-10, 0, 10].map((deg, i) => (
                <View key={deg} style={{ position: 'absolute', left: '50%', marginLeft: -36 + (i - 1) * 26, top: i === 1 ? 12 : 20, transform: [{ rotate: `${deg}deg` }] }}>
                  <TarotCardBack style={{ width: 72 }} />
                </View>
              ))}
            </Animated.View>
          ) : (
            // 3D 캔버스(화면 뒤) 자리 — 준비를 기다리는 동안은 비어 있다(별만).
            <View style={styles.hero} accessibilityLabel="타로 덱" testID={gate.heroMode === '3d' ? 'tarot-hero-3d' : 'tarot-hero-pending'} />
          )}
          <TarotSetupPanel session={session} onOpenRecord={openRecord} onOpenRecords={() => router.push('/tarot/me' as never)} />
        </ScrollView>
      ) : null}

      {stage3D && state.phase === 'picking' ? (
        <>
          <View style={StyleSheet.absoluteFill} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel} testID="tarot-3d-touch" />
          <Text style={[styles.hint3d, { bottom: 18 + insets.bottom }]} pointerEvents="none">
            옆으로 밀어 훑고, 마음이 가는 카드를 누르세요
          </Text>
        </>
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
  setup: { paddingHorizontal: 14, paddingTop: SETUP_PAD_TOP, gap: 10 },
  hero: { height: HERO_H, marginBottom: 4 },
  hint3d: { position: 'absolute', left: 16, right: 16, textAlign: 'center', fontSize: 11, color: 'rgba(236,230,214,0.5)' },
  hud: { position: 'absolute', top: 10, left: 12, right: 12, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: gold(0.2), backgroundColor: 'rgba(11,16,48,0.92)', maxWidth: '100%' },
  pillText: { fontSize: 12, color: TR.ink, flexShrink: 1 },
});
