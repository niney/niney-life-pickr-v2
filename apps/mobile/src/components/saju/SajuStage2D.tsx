import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { SAJU_GOLD, SAJU_HANJI, SAJU_JUSA, SAJU_STONE, WUXING_COLOR } from '@repo/shared';
import { SAJU_BRANCHES, SAJU_STEMS, SAJU_WUXING, SAJU_WUXING_META, branchMeta, stemMeta, type SajuChart, type SajuPhase, type Wuxing } from '@repo/utils';
import { SERIF, gold } from './sajuTokens';
import { SAJU_STAGE_TIMING } from './stageConfig';

// 천문도 2D 무대 — 웹 3D 무대(three/R3F)를 Reanimated 로 옮긴 것. 같은 흐름·타이밍:
//   setup     고리 3겹(지지 12·천간 10·오행 5)이 아주 천천히 돈다.
//   casting   고리가 빠르게 돌다 바깥→안 순으로 멈춘다(1.4·2.1·2.8초). 3초 뒤 onCastingDone.
//   stamping  인장이 하나씩 원판에 찍힌다 — 낙하 0.32초 뒤 착지(onStamp) + 파문, 한 장에 약 0.55초.
//   reading   화면이 풀이 패널로 넘어간다(무대는 연출 전용).
// 흐름 전환(onCastingDone·onStamp)은 사주 화면의 JS 타이머가 같은 타이밍(stageConfig)으로 낸다 — 무대는 그리기만.

const BRANCH_GLYPHS = SAJU_BRANCHES.map((b) => b.hanja);
const STEM_GLYPHS = SAJU_STEMS.map((s) => s.hanja);
const ELEMENT_GLYPHS = SAJU_WUXING.map((e) => SAJU_WUXING_META[e].hanja);

// 배경 별 — 시드 고정 의사난수(렌더마다 같은 자리).
const STARS = Array.from({ length: 48 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: r(1), y: r(2), s: 1 + r(3) * 1.6, o: 0.2 + r(4) * 0.5 };
});

const Ring = ({ size, radius, glyphs, fontSize, color, angle }: { size: number; radius: number; glyphs: readonly string[]; fontSize: number; color: string; angle: SharedValue<number> }) => {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      {glyphs.map((g, i) => (
        <View key={g} style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: `${(360 / glyphs.length) * i}deg` }] }]}>
          <Text style={{ marginTop: size / 2 - radius - fontSize * 0.65, fontSize, lineHeight: fontSize * 1.3, color, fontFamily: SERIF }}>{g}</Text>
        </View>
      ))}
    </Animated.View>
  );
};

interface SealSpec {
  index: number;
  hanja: string;
  element: Wuxing;
  accent: boolean;
  x: number;
  y: number;
}

/** 인장 순서(0..7): 년간·년지·월간·월지·일간·일지·시간·시지. 자리: 기둥 4열 × 천간(위)·지지(아래). */
const sealSpecs = (chart: SajuChart, S: number): SealSpec[] => {
  const keys = (['year', 'month', 'day', 'hour'] as const).filter((k) => !!chart.pillars[k]);
  const total = keys.length;
  const out: SealSpec[] = [];
  keys.forEach((key, col) => {
    const p = chart.pillars[key];
    if (!p) return;
    const x = (col - (total - 1) / 2) * S * 1.3;
    const stem = stemMeta(p.stem);
    const branch = branchMeta(p.branch);
    out.push({ index: out.length, hanja: stem.hanja, element: stem.element, accent: key === 'day', x, y: -S * 0.62 });
    out.push({ index: out.length, hanja: branch.hanja, element: branch.element, accent: false, x, y: S * 0.62 });
  });
  return out;
};

const BURST = Array.from({ length: 6 }, (_, i) => (i * Math.PI * 2) / 6);

const Seal = ({ spec, S, center, state }: { spec: SealSpec; S: number; center: number; state: 'dropping' | 'landed' }) => {
  const drop = useSharedValue(state === 'landed' ? 1 : 0);
  const ripple = useSharedValue(state === 'landed' ? 1 : 0);
  const glow = useSharedValue(0);
  const T = SAJU_STAGE_TIMING;
  useEffect(() => {
    if (state !== 'dropping') return;
    drop.set(withDelay(T.dropStartMs, withTiming(1, { duration: T.dropMs, easing: Easing.out(Easing.cubic) })));
    ripple.set(withDelay(T.dropStartMs + T.dropMs, withTiming(1, { duration: T.rippleMs, easing: Easing.out(Easing.quad) })));
  }, [state, drop, ripple, T]);
  useEffect(() => {
    if (!spec.accent) return undefined;
    glow.set(withDelay(T.dropStartMs + T.dropMs, withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true)));
    return () => cancelAnimation(glow);
  }, [spec.accent, glow, T]);

  const sealStyle = useAnimatedStyle(() => {
    const t = drop.get();
    return {
      opacity: Math.min(1, t * 3),
      transform: [{ translateY: (1 - t) * -S * 2.2 }, { scale: 1 + (1 - t) * 0.6 }, { rotate: `${(1 - t) * 14}deg` }],
    };
  });
  const rippleStyle = useAnimatedStyle(() => {
    const r = ripple.get();
    return { opacity: r <= 0 || r >= 1 ? 0 : (1 - r) * 0.9, transform: [{ scale: 0.6 + r * 2.4 }] };
  });
  const burstStyle = useAnimatedStyle(() => {
    const r = ripple.get();
    return { opacity: r <= 0 || r >= 1 ? 0 : 1 - r, transform: [{ scale: 0.4 + r * 2.2 }] };
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: spec.accent ? 0.25 + glow.get() * 0.45 : 0 }));

  const left = center + spec.x - S / 2;
  const top = center + spec.y - S / 2;
  const color = WUXING_COLOR[spec.element];
  return (
    <>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left, top, width: S, height: S, borderRadius: S / 2, borderWidth: 2, borderColor: color }, rippleStyle]} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left, top, width: S, height: S }, burstStyle]}>
        {BURST.map((a) => (
          <View key={a} style={{ position: 'absolute', left: S / 2 + Math.cos(a) * S * 0.45 - 2, top: S / 2 + Math.sin(a) * S * 0.45 - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />
        ))}
      </Animated.View>
      {spec.accent ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: left - 6, top: top - 6, width: S + 12, height: S + 12, borderRadius: S * 0.2, backgroundColor: '#ff5a3c' }, styles.glow, glowStyle]} /> : null}
      <Animated.View style={[{ position: 'absolute', left, top, width: S, height: S }, styles.sealShadow, sealStyle]}>
        <View style={[styles.sealFace, { borderRadius: S * 0.12, backgroundColor: spec.accent ? '#c93a2f' : SAJU_JUSA }]}>
          <View style={[styles.sealFrame, { margin: S * 0.07, borderRadius: S * 0.08, borderWidth: spec.accent ? 2.5 : 1.5 }]}>
            <Text style={{ fontFamily: SERIF, fontSize: S * 0.56, lineHeight: S * 0.7, fontWeight: '700', color: SAJU_HANJI }}>{spec.hanja}</Text>
          </View>
        </View>
      </Animated.View>
    </>
  );
};

export interface SajuStage2DProps {
  phase: SajuPhase;
  chart: SajuChart | null;
  stamped: number;
  /** 원판 지름(px). */
  size: number;
}

export const SajuStage2D = ({ phase, chart, stamped, size }: SajuStage2DProps) => {
  const T = SAJU_STAGE_TIMING;
  const outer = useSharedValue(0);
  const middle = useSharedValue(0);
  const inner = useSharedValue(0);

  // 고리 회전 — setup 은 느린 무한 회전, casting 은 빠르게 돌다 감속 정지.
  useEffect(() => {
    if (phase === 'setup') {
      outer.set(withRepeat(withTiming(outer.get() + 360, { duration: 100_000, easing: Easing.linear }), -1, false));
      middle.set(withRepeat(withTiming(middle.get() - 360, { duration: 140_000, easing: Easing.linear }), -1, false));
      inner.set(withRepeat(withTiming(inner.get() + 360, { duration: 190_000, easing: Easing.linear }), -1, false));
      return undefined;
    }
    if (phase === 'casting') {
      const [o, m, i] = T.stopsMs;
      outer.set(withTiming(outer.get() + 380, { duration: o, easing: Easing.out(Easing.cubic) }));
      middle.set(withTiming(middle.get() - 420, { duration: m, easing: Easing.out(Easing.cubic) }));
      inner.set(withTiming(inner.get() + 400, { duration: i, easing: Easing.out(Easing.cubic) }));
      return undefined;
    }
    cancelAnimation(outer);
    cancelAnimation(middle);
    cancelAnimation(inner);
    return undefined;
  }, [phase, outer, middle, inner, T]);

  const S = Math.round(size * 0.17);
  const specs = useMemo(() => (chart ? sealSpecs(chart, S) : []), [chart, S]);
  const showSeals = !!chart && (phase === 'stamping' || phase === 'reading');
  const R = size / 2;

  return (
    <View style={{ width: size, height: size + 18, alignItems: 'center' }} pointerEvents="none" accessibilityLabel={phase === 'setup' ? '천문도' : undefined}>
      {/* 정렬 표식 — 12시 방향 작은 삼각. */}
      <Text style={styles.marker}>▼</Text>
      <View style={{ width: size, height: size }}>
        <View style={[styles.disc, { width: size, height: size, borderRadius: R }]} />
        <View style={[styles.rim, { left: 5, top: 5, width: size - 10, height: size - 10, borderRadius: R - 5 }]} />
        {[0.76, 0.53, 0.28].map((k) => (
          <View key={k} style={[styles.guide, { left: R - R * k, top: R - R * k, width: R * k * 2, height: R * k * 2, borderRadius: R * k }]} />
        ))}
        {STARS.slice(0, 22).map((st, i) => {
          // 원판 위 성도 — 가운데 원 안쪽 점들.
          const a = st.x * Math.PI * 2;
          const d = Math.sqrt(st.y) * R * 0.9;
          return <View key={i} style={{ position: 'absolute', left: R + Math.cos(a) * d, top: R + Math.sin(a) * d, width: st.s, height: st.s, borderRadius: st.s, backgroundColor: `rgba(233,207,143,${st.o * 0.6})` }} />;
        })}
        <Ring size={size} radius={R * 0.87} glyphs={BRANCH_GLYPHS} fontSize={Math.max(12, size * 0.052)} color={SAJU_GOLD} angle={outer} />
        <Ring size={size} radius={R * 0.645} glyphs={STEM_GLYPHS} fontSize={Math.max(11, size * 0.046)} color="#e6d7a8" angle={middle} />
        <Ring size={size} radius={R * 0.405} glyphs={ELEMENT_GLYPHS} fontSize={Math.max(11, size * 0.044)} color={SAJU_JUSA} angle={inner} />
        {!showSeals ? <Text style={[styles.center, { left: R - 20, top: R - 20, fontSize: Math.max(18, size * 0.075) }]}>命</Text> : null}
        {showSeals
          ? specs.map((spec) => {
              if (phase === 'stamping' && spec.index > stamped) return null;
              const state = phase === 'reading' || spec.index < stamped ? 'landed' : 'dropping';
              return <Seal key={spec.index} spec={spec} S={S} center={R} state={state} />;
            })
          : null}
      </View>
    </View>
  );
};

/** 무대 뒤 밤하늘 별 — 화면 전체 배경용. */
export const SajuStarfield = () => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {STARS.map((st, i) => (
      <View key={i} style={{ position: 'absolute', left: `${st.x * 100}%`, top: `${st.y * 100}%`, width: st.s, height: st.s, borderRadius: st.s, backgroundColor: `rgba(232,207,143,${st.o})` }} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  marker: { height: 18, fontSize: 11, lineHeight: 18, color: SAJU_JUSA },
  disc: { position: 'absolute', backgroundColor: SAJU_STONE, borderWidth: 1, borderColor: 'rgba(0,0,0,0.6)', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  rim: { position: 'absolute', borderWidth: 2, borderColor: gold(0.8) },
  guide: { position: 'absolute', borderWidth: 1, borderColor: gold(0.18) },
  center: { position: 'absolute', width: 40, height: 40, textAlign: 'center', textAlignVertical: 'center', lineHeight: 40, fontFamily: SERIF, color: gold(0.55) },
  sealShadow: { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  sealFace: { flex: 1, overflow: 'hidden' },
  sealFrame: { flex: 1, alignItems: 'center', justifyContent: 'center', borderColor: SAJU_GOLD },
  glow: { shadowColor: '#ff5a3c', shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
});
