import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import type { TarotDrawnCardType } from '@repo/api-contract';
import { getTarotSpread, type TarotPhase, type TarotSpreadId } from '@repo/utils';
import { TarotCardBack, TarotCardFace } from './TarotCardImage';
import { TAROT_STAGE_TIMING } from './stageTiming';
import { CARD_RATIO, TR, gold } from './tarotTokens';

// 타로 2D 무대(Reanimated) — 웹 3D 무대(R3F)의 흐름·타이밍을 옮긴 것. 그리기만 하고 흐름 전환(shuffle_done·placed·
// reveal_next)은 타로 화면의 JS 타이머가 같은 타이밍(stageTiming)으로 낸다.
//   shuffling  카드 14장이 네 박자로 흩어졌다 모인다(1.9초).
//   picking    부채꼴 — 78장 뒷면을 가로로 훑고(화면 가운데가 솟는 호) 탭해서 고른다. 고른 카드는 위쪽 자리로, 부채엔 빈자리.
//   placing    자리가 작은 줄에서 뒤집기용 큰 줄로 옮겨 간다(0.85초).
//   revealing  한 장씩 0.25초 쉬고 1.1초에 걸쳐 뒤집힌다. "모두 뒤집기" 면 남은 카드가 한꺼번에.
//   reading    해석 패널이 아래를 덮으면 카드가 그 위로 비켜 선다.
// 크기가 바뀌는 이동은 레이아웃 애니메이션 대신 이동·확대 변환으로 한다(자식 그림이 크기 보간을 따라오지 않아서).

const T = TAROT_STAGE_TIMING;

export interface TarotStage2DProps {
  /** review = 게스트 기록 다시 보기(카드가 모두 앞면으로 선다). */
  phase: TarotPhase | 'review';
  spreadId: TarotSpreadId;
  deckOrder: readonly string[];
  picked: readonly string[];
  drawn: readonly TarotDrawnCardType[];
  revealed: number;
  width: number;
  height: number;
  /** 위쪽 안내 알약이 떠 있는지 — 카드가 그 아래에서 시작한다. */
  hudVisible: boolean;
  /** 해석 패널이 덮는 아래 높이(0 = 없음). */
  panelHeight: number;
  reduceMotion: boolean;
  onPick: (cardId: string) => void;
}

// ── 배경 별 ─────────────────────────────────────────────────────────────────
const STARS = Array.from({ length: 46 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin(i * 91.7 + n * 47.3) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: r(1), y: r(2), s: 1 + r(3) * 1.5, o: 0.15 + r(4) * 0.5 };
});

export const TarotStars = () => (
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {STARS.map((st, i) => (
      <View key={i} style={{ position: 'absolute', left: `${st.x * 100}%`, top: `${st.y * 100}%`, width: st.s, height: st.s, borderRadius: st.s, backgroundColor: '#d9def5', opacity: st.o }} />
    ))}
  </View>
);

// ── 섞기 ────────────────────────────────────────────────────────────────────
// (카드, 박자) 해시로 결정적인 흩어짐 — 웹 layout.scatterPose 와 같은 해시.
const hash = (i: number, beat: number): number => {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(beat + 1, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const SHUFFLE_CARDS = 14;
const SHUFFLE_BEATS = 4;

const ShuffleCard = ({ i, cx, cy, w, spreadX, spreadY }: { i: number; cx: number; cy: number; w: number; spreadX: number; spreadY: number }) => {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const r = useSharedValue(0);
  useEffect(() => {
    const e = { duration: T.shuffleBeatMs, easing: Easing.inOut(Easing.quad) };
    const beats = Array.from({ length: SHUFFLE_BEATS }, (_, b) => b);
    x.set(withSequence(...beats.map((b) => withTiming((hash(i, b) - 0.5) * spreadX, e)), withTiming(0, e)));
    y.set(withSequence(...beats.map((b) => withTiming((hash(i + 1000, b) - 0.5) * spreadY, e)), withTiming(0, e)));
    r.set(withSequence(...beats.map((b) => withTiming((hash(i + 2000, b) - 0.5) * 80, e)), withTiming((i % 3) - 1, e)));
  }, [i, spreadX, spreadY, x, y, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }, { rotate: `${r.get()}deg` }] }));
  const h = w * CARD_RATIO;
  return (
    <Animated.View style={[{ position: 'absolute', left: cx - w / 2 + i * 0.4, top: cy - h / 2 - i * 0.6, width: w }, style]}>
      <TarotCardBack style={{ width: w }} />
    </Animated.View>
  );
};

const ShuffleDeck = ({ width, height }: { width: number; height: number }) => (
  <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={StyleSheet.absoluteFill} pointerEvents="none">
    {Array.from({ length: SHUFFLE_CARDS }, (_, i) => (
      <ShuffleCard key={i} i={i} cx={width / 2} cy={height * 0.42} w={Math.min(96, width * 0.24)} spreadX={width * 0.85} spreadY={height * 0.38} />
    ))}
  </Animated.View>
);

// ── 부채꼴 ──────────────────────────────────────────────────────────────────
const FAN_W = 62;
const FAN_STEP = 21;

const FanCard = ({ id, index, picked, scrollX, width, pad, disabled, onPick }: { id: string; index: number; picked: boolean; scrollX: SharedValue<number>; width: number; pad: number; disabled: boolean; onPick: (id: string) => void }) => {
  const style = useAnimatedStyle(() => {
    // 화면 가운데에서 떨어진 정도(-1 ~ 1 이 화면 양 끝) — 가운데가 솟고 바깥으로 기울며 내려앉는 호.
    const cx = pad + index * FAN_STEP + FAN_W / 2 - scrollX.get();
    const d = Math.max(-1.6, Math.min(1.6, (cx - width / 2) / (width / 2)));
    return { opacity: withTiming(picked ? 0 : 1, { duration: 180 }), transform: [{ translateY: d * d * 26 - 6 }, { rotate: `${d * 14}deg` }] };
  });
  return (
    <Animated.View style={[{ width: FAN_W, marginLeft: index === 0 ? 0 : FAN_STEP - FAN_W }, style]}>
      <Pressable disabled={picked || disabled} onPress={() => onPick(id)} accessibilityRole="button" accessibilityLabel={`${index + 1}번째 카드 뽑기`}>
        {({ pressed }) => (
          <View style={{ transform: [{ translateY: pressed ? -18 : 0 }] }}>
            <TarotCardBack style={{ width: FAN_W }} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const Fan = ({ deckOrder, picked, width, height, disabled, onPick }: { deckOrder: readonly string[]; picked: readonly string[]; width: number; height: number; disabled: boolean; onPick: (id: string) => void }) => {
  // 처음엔 덱 한가운데를 보여 준다 — 처음 위치엔 스크롤 이벤트가 오지 않으니 공유값도 거기서 시작해야 호가 맞는다.
  const middle = ((deckOrder.length - 1) * FAN_STEP) / 2;
  const scrollX = useSharedValue(middle);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.set(e.contentOffset.x);
  });
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const pad = width / 2 - FAN_W / 2;
  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(250)} style={[styles.fan, { top: height * 0.5 }]}>
      <Animated.ScrollView
        horizontal
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: middle, y: 0 }}
        contentContainerStyle={{ paddingHorizontal: pad, paddingTop: 34, paddingBottom: 30, alignItems: 'flex-end' }}
        testID="tarot-fan"
      >
        {deckOrder.map((id, i) => (
          <FanCard key={id} id={id} index={i} picked={pickedSet.has(id)} scrollX={scrollX} width={width} pad={pad} disabled={disabled} onPick={onPick} />
        ))}
      </Animated.ScrollView>
      <Text style={styles.fanHint}>옆으로 넘겨 보며 마음이 가는 카드를 탭하세요</Text>
    </Animated.View>
  );
};

// ── 자리(슬롯) ──────────────────────────────────────────────────────────────
interface Frame {
  cx: number;
  cy: number;
  w: number;
}

const LABEL_H = 18;

/** 자리 배치 — pick(위쪽 작은 줄) · reveal(가운데 큰 줄) · read(해석 패널 위로 비켜 선 줄). */
const slotFrames = (n: number, mode: 'pick' | 'reveal' | 'read', W: number, H: number, top: number, panelH: number): { frames: Frame[]; base: number } => {
  const revealGap = 14;
  const base = Math.max(40, Math.min(n === 1 ? 170 : 118, (W - 32 - revealGap * (n - 1)) / n));
  let w = base;
  let gap = revealGap;
  let cy: number;
  if (mode === 'pick') {
    gap = 8;
    w = Math.min(52, (W - 32 - gap * (n - 1)) / n);
    cy = top + (w * CARD_RATIO) / 2;
  } else if (mode === 'reveal') {
    cy = Math.max(top + (w * CARD_RATIO) / 2, H * 0.42);
  } else {
    const bottom = H - panelH - LABEL_H - 10;
    const maxH = Math.max(60, bottom - top);
    w = Math.min(base, maxH / CARD_RATIO);
    cy = top + Math.min(maxH, w * CARD_RATIO) / 2 + Math.max(0, (maxH - w * CARD_RATIO) / 2);
  }
  const total = n * w + (n - 1) * gap;
  const x0 = (W - total) / 2;
  return { frames: Array.from({ length: n }, (_, i) => ({ cx: x0 + i * (w + gap) + w / 2, cy, w })), base };
};

// 자리 옮기기 — 자리 잡기(작은 줄 → 큰 줄)는 0.85초 ease-in-out, 그 밖(해석 패널이 올라오고 접히고 펴질 때)은 패널과 같은
// 0.32초 ease-out cubic 이라 카드가 패널에 붙어 움직인다.
const MOVE_PLACE = { duration: T.placeMs, easing: Easing.inOut(Easing.cubic) };
const MOVE_PANEL = { duration: T.panelMs, easing: Easing.out(Easing.cubic) };

const SlotCard = ({ cardId, reversed, faceUp, flipping, frame, base, placing, reduceMotion, label }: { cardId: string; reversed: boolean; faceUp: boolean; flipping: boolean; frame: Frame; base: number; placing: boolean; reduceMotion: boolean; label: string | undefined }) => {
  const cx = useSharedValue(frame.cx);
  const cy = useSharedValue(frame.cy);
  // 처음 나타날 때(고른 순간) 0 에서 자란다.
  const scale = useSharedValue(0);
  const p = useSharedValue(faceUp ? 1 : 0);
  useEffect(() => {
    const e = reduceMotion ? { duration: 0 } : placing ? MOVE_PLACE : MOVE_PANEL;
    cx.set(withTiming(frame.cx, e));
    cy.set(withTiming(frame.cy, e));
    scale.set(withTiming(frame.w / base, scale.get() === 0 ? { duration: reduceMotion ? 0 : 260, easing: Easing.out(Easing.back(1.4)) } : e));
  }, [frame.cx, frame.cy, frame.w, base, placing, reduceMotion, cx, cy, scale]);
  useEffect(() => {
    if (flipping && !faceUp) {
      p.set(reduceMotion ? 1 : withDelay(T.flipGapMs, withTiming(1, { duration: T.flipMs, easing: Easing.inOut(Easing.cubic) })));
    } else if (faceUp) {
      if (p.get() < 1) p.set(reduceMotion ? 1 : withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    } else {
      p.set(0);
    }
  }, [faceUp, flipping, reduceMotion, p]);

  const h = base * CARD_RATIO;
  const box = useAnimatedStyle(() => ({ transform: [{ translateX: cx.get() - base / 2 }, { translateY: cy.get() - h / 2 }, { scale: scale.get() }] }));
  // 뒤집기 — 가운데(90°)에서 앞뒤를 바꿔 끼운다(backfaceVisibility 에 기대지 않는다). 넘어가는 동안 살짝 부푼다.
  const back = useAnimatedStyle(() => {
    const v = p.get();
    return { opacity: v < 0.5 ? 1 : 0, transform: [{ perspective: 900 }, { rotateY: `${interpolate(v, [0, 0.5], [0, 90], 'clamp')}deg` }, { scale: 1 + 0.08 * Math.sin(Math.PI * v) }] };
  });
  const front = useAnimatedStyle(() => {
    const v = p.get();
    return { opacity: v >= 0.5 ? 1 : 0, transform: [{ perspective: 900 }, { rotateY: `${interpolate(v, [0.5, 1], [-90, 0], 'clamp')}deg` }, { scale: 1 + 0.08 * Math.sin(Math.PI * v) }] };
  });
  const labelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: cx.get() - 60 }, { translateY: cy.get() + (h * scale.get()) / 2 + 4 }], opacity: scale.get() > 0.05 ? 1 : 0 }));
  return (
    <>
      <Animated.View style={[styles.slot, { width: base, height: h }, box]} accessibilityLabel={label ? `${label} 카드` : '카드'}>
        <Animated.View style={[StyleSheet.absoluteFill, back]}>
          <TarotCardBack style={{ width: base }} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, front]}>
          <TarotCardFace cardId={cardId} reversed={reversed} style={{ width: base }} />
        </Animated.View>
      </Animated.View>
      {label ? (
        <Animated.Text style={[styles.slotLabel, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
      ) : null}
    </>
  );
};

const Placeholder = ({ frame, label }: { frame: Frame; label: string | undefined }) => {
  const h = frame.w * CARD_RATIO;
  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ position: 'absolute', left: frame.cx - 60, top: frame.cy - h / 2, width: 120, alignItems: 'center' }}>
      <View style={[styles.placeholder, { width: frame.w, height: h }]} />
      {label ? (
        <Text style={[styles.slotLabel, { position: 'relative', marginTop: 4 }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Animated.View>
  );
};

export const TarotStage2D = ({ phase, spreadId, deckOrder, picked, drawn, revealed, width, height, hudVisible, panelHeight, reduceMotion, onPick }: TarotStage2DProps) => {
  const spread = getTarotSpread(spreadId);
  const n = spread?.positions.length ?? drawn.length;
  const top = hudVisible ? 64 : 18;
  const showSlots = phase === 'picking' || phase === 'placing' || phase === 'revealing' || phase === 'reading' || phase === 'review';
  const mode = phase === 'picking' ? 'pick' : panelHeight > 0 ? 'read' : 'reveal';
  const { frames, base } = slotFrames(Math.max(1, n), mode, width, height, top, panelHeight);
  const placing = phase === 'placing';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {phase === 'shuffling' ? <ShuffleDeck width={width} height={height} /> : null}
      {phase === 'picking' ? <Fan deckOrder={deckOrder} picked={picked} width={width} height={height} disabled={picked.length >= n} onPick={onPick} /> : null}
      {showSlots
        ? frames.map((frame, i) => {
            const label = spread?.positions[i]?.label;
            if (phase === 'picking') {
              const id = picked[i];
              return id ? (
                <SlotCard key={id} cardId={id} reversed={false} faceUp={false} flipping={false} frame={frame} base={base} placing={placing} reduceMotion={reduceMotion} label={label} />
              ) : (
                <Placeholder key={`ph-${i}`} frame={frame} label={label} />
              );
            }
            const d = drawn[i];
            if (!d) return null;
            return (
              <SlotCard
                key={d.cardId}
                cardId={d.cardId}
                reversed={d.reversed}
                faceUp={phase === 'review' || i < revealed}
                flipping={phase === 'revealing' && i === revealed}
                frame={frame}
                base={base}
                placing={placing}
                reduceMotion={reduceMotion}
                label={label}
              />
            );
          })
        : null}
    </View>
  );
};

const styles = StyleSheet.create({
  fan: { position: 'absolute', left: 0, right: 0 },
  fanHint: { textAlign: 'center', fontSize: 11, color: 'rgba(236,230,214,0.45)' },
  slot: { position: 'absolute', left: 0, top: 0 },
  slotLabel: { position: 'absolute', left: 0, top: 0, width: 120, textAlign: 'center', fontSize: 11, color: TR.gold },
  placeholder: { borderWidth: 1, borderStyle: 'dashed', borderColor: gold(0.45), borderRadius: 6, backgroundColor: 'rgba(217,182,91,0.05)' },
});
