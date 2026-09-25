import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { sajuInitialMode, sajuInitialTab, useSajuSession } from '@repo/shared';
import { dayMasterText, sajuStampTotal } from '@repo/utils';
import { SajuForm } from '~/components/saju/SajuForm';
import { SajuPairPanel } from '~/components/saju/SajuPairPanel';
import { SajuReadingPanel } from '~/components/saju/SajuReadingPanel';
import { sajuStemImage } from '~/components/saju/sajuImages';
import { SajuStage2D, SajuStarfield } from '~/components/saju/SajuStage2D';
import type { SajuStage3D as SajuStage3DView, SajuStageFraming } from '~/components/saju/SajuStage3D';
import { SAJU_STAGE_TIMING } from '~/components/saju/stageConfig';
import { STAGE_3D_AVAILABLE } from '~/components/common/stage3d/stage3dAvailable';
import { useStage3DGate } from '~/components/common/stage3d/useStage3DGate';
import { Icon, TextButton } from '~/components/saju/sajuUi';
import { SERIF, SJ, gold, ink } from '~/components/saju/sajuTokens';

// 사주(C) — 네이티브 화면(웹 /saju-c 와 같은 흐름·API). 흐름·요청·병합·궁합·테마는 @repo/shared 의 useSajuSession
// (웹 SajuPage 와 공용)이 맡고, 이 화면은 무대와 패널을 그린다.
//   setup(천문도 + 입력) → casting·stamping(무대 연출, 건너뛰기) → reading(풀이 패널 전체 화면)
//   입구 "우리 궁합" 은 연출 없이 결과 화면으로.
// 무대: iOS 는 3D 천문도(expo-gl, 화면 뒤 캔버스 한 장 — 입력 땐 위쪽에 작게, 연출 땐 가운데 크게 카메라가 옮겨 간다).
// Android·"동작 줄이기"·느린 GPU(시뮬레이터 소프트웨어 GL 포함)·GL 오류면 2D 천문도(Reanimated). 입력 화면의 원판은
// 방문마다 한 번 정해(3D 준비를 잠깐 기다렸다가, 늦으면 2D) 도중에 바뀌지 않고, 기기 판정을 기억해 다음 방문부터는
// 처음부터 정한다(공용 useStage3DGate·stage3dVerdict). 연출 무대도 사주를 세우는 순간 정해 끝까지 간다. 흐름 전환(casting_done·stamp)은
// 이 화면의 JS 타이머가 낸다 — 무대는 그리기만.
// 딥링크: ?tool=daily|food|date|love|wealth|career|ask|match, ?tab=<패널 탭>(앱 홈 카드·이전 링크 호환).
// 기기 "동작 줄이기" 가 켜져 있으면 연출을 건너뛴다. 효과음은 두지 않는다.

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

// 3D 무대 모듈은 expo-gl 네이티브 모듈이 있는 빌드에서만 불러온다 — 없는 빌드에서 import 만으로 화면이 죽지 않게.
const SajuStage3D: typeof SajuStage3DView | null = STAGE_3D_AVAILABLE
  ? (require('~/components/saju/SajuStage3D') as { SajuStage3D: typeof SajuStage3DView }).SajuStage3D
  : null;

const PHASE_TEXT = { casting: '천문도를 맞추는 중…', stamping: '인장을 찍는 중…', reading: '사주를 세웠어요' } as const;
/** 인장을 다 찍은 뒤 무대를 붙잡는 시간 — 마지막 인장의 착지·파문과 일간 캐릭터를 보여 주고 풀이로 넘어간다. */
const REVEAL_HOLD_MS = 1100;

export default function SajuScreen() {
  const params = useLocalSearchParams<{ tool?: string | string[]; tab?: string | string[]; stage?: string | string[] }>();
  const tool = first(params.tool);
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  const session = useSajuSession({
    initialTab: sajuInitialTab(first(params.tab), tool),
    initialMode: sajuInitialMode(tool),
    skipAnimation: reduceMotion,
  });
  const { state, dispatch } = session;
  // 무대 타이머 콜백 — 안정 참조(풀이 polling 으로 다시 그려져도 타이머가 리셋되지 않게).
  const onCastingDone = useCallback(() => dispatch({ type: 'casting_done' }), [dispatch]);
  const onStamp = useCallback(() => dispatch({ type: 'stamp' }), [dispatch]);

  // 마지막 인장이 찍혀 reading 이 되면 잠깐 무대를 붙잡는다 — 직전이 "stamping, 한 장 남음" 일 때만(건너뛰기·동작
  // 줄이기로 온 reading 은 바로 패널). 전환 판정은 렌더 중 이전 값 비교, 해제만 타이머(외부 시스템)에서.
  const [prev, setPrev] = useState({ phase: state.phase, stamped: state.stamped });
  const [holding, setHolding] = useState(false);
  if (prev.phase !== state.phase || prev.stamped !== state.stamped) {
    setPrev({ phase: state.phase, stamped: state.stamped });
    setHolding(prev.phase === 'stamping' && state.phase === 'reading' && prev.stamped === sajuStampTotal(state.chart) - 1);
  }
  useEffect(() => {
    if (!holding) return undefined;
    const id = setTimeout(() => setHolding(false), REVEAL_HOLD_MS);
    return () => clearTimeout(id);
  }, [holding]);
  const stageOpen = session.animating || holding;
  const dm = state.chart ? dayMasterText(state.chart.dayMaster.index) : null;

  // 흐름 타이머 — 무대(2D·3D)와 무관하게 같은 타이밍으로 리듀서를 진행시킨다.
  const T = SAJU_STAGE_TIMING;
  useEffect(() => {
    if (state.phase !== 'casting') return undefined;
    const id = setTimeout(onCastingDone, T.castMs);
    return () => clearTimeout(id);
  }, [state.phase, onCastingDone, T]);
  useEffect(() => {
    if (state.phase !== 'stamping' || !state.chart || state.stamped >= sajuStampTotal(state.chart)) return undefined;
    const id = setTimeout(onStamp, T.dropStartMs + T.dropMs);
    return () => clearTimeout(id);
  }, [state.phase, state.stamped, state.chart, onStamp, T]);

  const heroSize = Math.round(Math.min(width * 0.62, 250));
  const stageSize = Math.round(Math.min(width - 48, height * 0.52, 380));

  // ── 3D 무대 ─────────────────────────────────────────────────────────────
  // 원판 자리(hero)를 3D 로 할지·캔버스를 언제 올리고 내릴지는 공용 문지기(useStage3DGate). 연출 무대는 사주를 세우는
  // 순간(무대가 열릴 때) 문지기가 정해 끝까지 — 도중에 3D 가 준비돼도 바꾸지 않는다.
  const [rootH, setRootH] = useState(0);
  // 개발 빌드 전용 ?stage=3d|2d — 판정·기억 없이 강제(시뮬레이터는 소프트웨어 GL 이라 평소엔 2D 로 간다).
  const stageParam = __DEV__ ? first(params.stage) : null;
  const inSetup = state.phase === 'setup' && !session.pairOpen;
  const gate = useStage3DGate({
    scope: 'saju',
    available: SajuStage3D !== null,
    stageParam,
    reduceMotion,
    layoutReady: rootH > 0,
    inHero: inSetup,
    performing: stageOpen,
  });
  const heroMode = gate.heroMode;
  // 3D 캔버스는 화면 위쪽 70% — 입력 땐 위쪽 원판, 연출 땐 가운데보다 조금 위(상태 알약·일간 캐릭터 자리를 두고).
  const canvasH = Math.round(rootH * 0.7);
  const heroFrame: SajuStageFraming = { centerY: 24 + heroSize / 2, radiusPx: heroSize / 2 };
  const stageFrame: SajuStageFraming = { centerY: Math.round(rootH * 0.47), radiusPx: stageSize / 2 };

  return (
    <View style={styles.root} onLayout={(e) => setRootH(Math.round(e.nativeEvent.layout.height))}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '사주(C)',
          headerStyle: { backgroundColor: SJ.bg },
          headerTintColor: SJ.cream,
          headerTitleStyle: { color: SJ.cream },
          headerShadowVisible: false,
          headerRight: session.isMember
            ? () => (
                <Pressable accessibilityRole="button" accessibilityLabel="내 사주 기록" onPress={() => router.push('/saju-c/me' as never)} hitSlop={10} style={{ paddingHorizontal: 4 }}>
                  <Icon name="history" size={22} color={SJ.cream} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <LinearGradient colors={['#1c1a22', SJ.bg]} locations={[0, 0.65]} style={StyleSheet.absoluteFill} />
      <SajuStarfield />
      {gate.mount && SajuStage3D ? (
        <SajuStage3D
          phase={state.phase}
          chart={state.chart}
          stamped={state.stamped}
          width={width}
          height={canvasH}
          framing={state.phase === 'setup' ? heroFrame : stageFrame}
          visible={gate.visible}
          onReady={gate.onReady}
          onFail={gate.onFail}
          onLost={gate.onLost}
          force={gate.force}
        />
      ) : null}

      {inSetup ? (
        <ScrollView contentContainerStyle={styles.setup} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets testID="saju-setup">
          {heroMode === '2d' ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.hero} testID="saju-hero-2d">
              <SajuStage2D phase="setup" chart={null} stamped={0} size={heroSize} />
            </Animated.View>
          ) : (
            // 3D 캔버스(화면 뒤) 자리 — 준비를 기다리는 동안은 비어 있다(별만).
            <View style={{ height: heroSize + 24 }} accessibilityLabel="천문도" testID={heroMode === '3d' ? 'saju-hero-3d' : 'saju-hero-pending'} />
          )}
          <SajuForm session={session} onSubmit={session.submit} />
        </ScrollView>
      ) : null}

      {stageOpen ? (
        <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(300)} style={styles.stageWrap} pointerEvents="box-none" testID="saju-stage">
          <View style={styles.statusPill}>
            {holding ? null : <ActivityIndicator size="small" color={SJ.gold} />}
            <Text style={[styles.statusText, holding && { paddingRight: 8 }]}>
              {PHASE_TEXT[state.phase as 'casting' | 'stamping' | 'reading']}
              {state.phase === 'stamping' ? ` ${state.stamped}/${sajuStampTotal(state.chart)}` : ''}
            </Text>
            {holding ? null : <TextButton label="건너뛰기" color={ink(0.65)} onPress={() => dispatch({ type: 'skip_animation' })} />}
          </View>
          {!gate.stage3D ? (
            <View style={styles.stageCenter}>
              <View>
                {holding && state.chart && dm ? (
                  <Animated.View entering={FadeInDown.duration(500)} style={styles.reveal}>
                    <Image source={sajuStemImage(state.chart.dayMaster.index)} style={styles.revealImage} contentFit="cover" />
                    <Text style={styles.revealTitle}>
                      {dm.title} <Text style={{ fontSize: 13, color: ink(0.6) }}>{dm.hanja}</Text>
                    </Text>
                  </Animated.View>
                ) : null}
                <SajuStage2D phase={state.phase} chart={state.chart} stamped={state.stamped} size={stageSize} />
              </View>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
      {gate.stage3D && holding && state.chart && dm ? (
        // 3D 무대 위 일간 캐릭터 — 원판 위쪽 가장자리(기울어진 원판은 반지름의 약 0.75 높이) 위에 띄운다.
        <Animated.View entering={FadeInDown.duration(500)} pointerEvents="none" style={[styles.reveal, { top: stageFrame.centerY - stageFrame.radiusPx * 0.78 - 104 }]}>
          <Image source={sajuStemImage(state.chart.dayMaster.index)} style={styles.revealImage} contentFit="cover" />
          <Text style={styles.revealTitle}>
            {dm.title} <Text style={{ fontSize: 13, color: ink(0.6) }}>{dm.hanja}</Text>
          </Text>
        </Animated.View>
      ) : null}

      {session.readingOpen && state.chart && !holding ? (
        <Animated.View entering={FadeIn.duration(420)} style={styles.fill}>
          <SajuReadingPanel
            chart={state.chart}
            birth={session.birth}
            result={session.result}
            status={session.status}
            themes={session.themes}
            themeStatus={session.themeStatus}
            animate={!reduceMotion}
            tab={session.tab}
            onTab={session.setTab}
            onOpenThemes={session.requestThemes}
            onRetryThemes={session.retryThemes}
            onRetry={session.retry}
            onEdit={session.edit}
            onPair={session.openPairFromReading}
          />
        </Animated.View>
      ) : null}

      {session.pairOpen && session.pair ? (
        <Animated.View entering={FadeIn.duration(300)} style={styles.fill}>
          <SajuPairPanel
            labels={{ a: '나', b: session.pair.labelB }}
            result={session.match.data ?? null}
            status={session.pairStatus}
            onRetry={() => void session.match.refetch()}
            onEdit={session.editPair}
            onDetail={session.openSelfFromPair}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SJ.bg },
  fill: { flex: 1 },
  setup: { paddingHorizontal: 14, paddingBottom: 32, gap: 8 },
  hero: { alignItems: 'center', paddingTop: 6 },
  stageWrap: { flex: 1, alignItems: 'center', paddingTop: 12 },
  stageCenter: { flex: 1, justifyContent: 'center', paddingBottom: 48 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: gold(0.15), backgroundColor: 'rgba(18,18,24,0.92)' },
  statusText: { fontSize: 13, color: SJ.ink },
  reveal: { position: 'absolute', top: -112, left: 0, right: 0, alignItems: 'center', gap: 4 },
  revealImage: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: gold(0.7), backgroundColor: SJ.panel },
  revealTitle: { fontFamily: SERIF, fontSize: 17, fontWeight: '700', color: SJ.cream },
});
