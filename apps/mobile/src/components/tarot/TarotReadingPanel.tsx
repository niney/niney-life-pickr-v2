import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TarotChoicesType, TarotDrawnCardType, TarotReadingResultType, TarotSpreadIdType, TarotTopicType } from '@repo/api-contract';
import { tarotMenuOf, TAROT_DISCLAIMER, TAROT_SOURCE_LABEL, type TarotShareBase } from '@repo/shared';
import { getTarotCard, getTarotSpread, tarotCardKeywords, tarotCardMeaning, tarotOrientationLabel, TAROT_TOPIC_LABEL, type TarotResultStatus } from '@repo/utils';
import { TarotCardFace } from './TarotCardImage';
import { TarotShareSheet } from './TarotShareSheet';
import { TAROT_STAGE_TIMING } from './stageTiming';
import { TarotChoiceBox, TarotMenuBox } from './TarotVerdicts';
import { Body, Caption, ErrorText, Icon, Loading, Muted, OutlineButton, Pill, PrimaryButton, SerifTitle, Tag, TextButton, TypedText } from './tarotUi';
import { SERIF, TR, coral, gold, ink, white } from './tarotTokens';

// 해석 패널 — 웹 TarotOverlay 의 ReadingPanel(세로 화면 = 아래 시트)과 같은 구성. 첫 카드가 뒤집히면 올라와 뒤집힌 카드부터
// 채운다: 카드별(자리·이름·방향·키워드·해석) → 다 뒤집히면 "읽는 중" / 실패·다시 시도 / 종합·조언·메뉴·선택·키워드·한도.
// 결과가 오기 전엔 카드 기본 의미를 보이고, 오면 서버 해석으로 바뀐다(서버가 다른 카드를 돌려주면 — 회원 오늘의 카드 잠금 —
// 결과의 카드가 진실). 접으면 머리줄만 남아 카드가 보인다.
// 움직임: 처음엔 아래에서 올라오고, 접고 펼 때 미끄러진다(UI 스레드, 0.32초 ease-out cubic — 무대의 2D 카드·3D 카메라가 같은
// 시간·곡선으로 따라간다). 본문은 접어도 내리지 않는다(펼 때마다 다시 만들며 JS 가 멈칫하고 타자 효과가 처음부터 다시
// 치던 것) — 아래로 밀고 흐리게만 한다. 머리줄 높이는 재서 화면에 알린다(무대가 접힌 패널 위 공간을 쓴다).
const PANEL_EASING = Easing.out(Easing.cubic);
/** 머리줄 높이 첫 값(재기 전) — 메타 한 줄 + 질문 한 줄. */
export const TAROT_PANEL_HEADER_H = 58;

export interface TarotReadingPanelProps {
  spreadId: TarotSpreadIdType;
  topic: TarotTopicType;
  question: string;
  choices: TarotChoicesType | null;
  drawn: readonly TarotDrawnCardType[];
  revealed: number;
  result: TarotReadingResultType | null;
  resultStatus: TarotResultStatus;
  animate: boolean;
  /** 공유 근거 — null 이면 공유 버튼 없음(결과 미도착 등). */
  shareBase: TarotShareBase | null;
  /** 펼친 높이. */
  height: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** 머리줄 높이(잰 값) — 접힌 패널이 덮는 높이 = 이 값 + 아래 안전 영역. */
  onHeaderLayout?: (height: number) => void;
  onRetry: () => void;
  onReset: () => void;
  /** 기록 다시 보기 — 닫기 버튼. */
  onClose?: () => void;
}

export const TarotReadingPanel = ({
  spreadId,
  topic,
  question,
  choices,
  drawn,
  revealed,
  result,
  resultStatus,
  animate,
  shareBase,
  height,
  collapsed,
  onToggleCollapsed,
  onHeaderLayout,
  onRetry,
  onReset,
  onClose,
}: TarotReadingPanelProps) => {
  const insets = useSafeAreaInsets();
  const [shareOpen, setShareOpen] = useState(false);
  const [headerH, setHeaderH] = useState(TAROT_PANEL_HEADER_H);
  // 접힌 위치 = 머리줄 + 아래 안전 영역만 남도록 아래로 민 거리. 처음엔 화면 밖(height)에서 올라온다. 미끄러짐은 기기
  // "동작 줄이기" 만 따른다(animate 는 타자 효과 — 기록 다시 보기는 끄지만 무대 카드는 패널과 같이 움직인다).
  const slideMotion = !useReducedMotion();
  const collapsedY = Math.max(0, height - headerH - insets.bottom);
  const target = collapsed ? collapsedY : 0;
  const y = useSharedValue(slideMotion ? height : target);
  useEffect(() => {
    y.set(slideMotion ? withTiming(target, { duration: TAROT_STAGE_TIMING.panelMs, easing: PANEL_EASING }) : target);
  }, [target, slideMotion, y]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  // 본문은 접히는 만큼 흐려진다 — 접힌 뒤 안전 영역 쪽으로 비치지 않게.
  const bodyFade = useAnimatedStyle(() => ({ opacity: collapsedY > 0 ? 1 - Math.min(1, Math.max(0, y.get() / collapsedY)) : 1 }));
  const spread = getTarotSpread(spreadId);
  const shown = drawn.slice(0, revealed);
  const allRevealed = revealed >= drawn.length && drawn.length > 0;
  const ready = resultStatus === 'ready' && !!result;
  const menu = tarotMenuOf(spreadId, drawn, ready ? result : null);

  return (
    <Animated.View style={[styles.panel, { height, paddingBottom: insets.bottom }, slide]} accessibilityLabel="해석" testID="tarot-reading-panel">
      <View
        style={styles.header}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setHeaderH(h);
          onHeaderLayout?.(h);
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.meta}>
            <Text style={styles.metaText}>
              {spread?.nameKo} · {TAROT_TOPIC_LABEL[topic]}
            </Text>
            {ready ? (
              <Pill color={result.source === 'llm' ? TR.gold : ink(0.6)} border={result.source === 'llm' ? gold(0.6) : white(0.2)}>
                {TAROT_SOURCE_LABEL[result.source]}
              </Pill>
            ) : null}
          </View>
          {question ? (
            <Text style={styles.question} numberOfLines={1}>
              “{question}”
            </Text>
          ) : null}
          {choices ? (
            <Text style={styles.choices} numberOfLines={1}>
              A {choices.a} · B {choices.b}
            </Text>
          ) : null}
        </View>
        <TextButton label={collapsed ? '펼치기' : '접기'} icon={collapsed ? 'chevron-up' : 'chevron-down'} onPress={onToggleCollapsed} />
        {onClose ? <TextButton label="" icon="close" accessibilityLabel="닫기" onPress={onClose} /> : null}
      </View>

      <Animated.View
        style={[styles.bodyWrap, bodyFade]}
        pointerEvents={collapsed ? 'none' : 'auto'}
        accessibilityElementsHidden={collapsed}
        importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
          {shown.map((drawnCard, i) => {
            const r = ready ? result.cards[i] : undefined;
            const d = r ? { cardId: r.cardId, position: r.position, reversed: r.reversed } : drawnCard;
            const card = getTarotCard(d.cardId);
            if (!card) return null;
            const text = r?.text ?? tarotCardMeaning(card, d.reversed);
            const keywords = r?.keywords ?? tarotCardKeywords(card, d.reversed);
            const isLast = i === shown.length - 1;
            return (
              <View key={d.cardId} style={styles.card} testID="tarot-reading-card">
                <TarotCardFace cardId={d.cardId} reversed={d.reversed} style={{ width: 58 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Caption>{spread?.positions[i]?.label}</Caption>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{card.nameKo}</Text>
                    <Text style={styles.nameEn}>{card.nameEn}</Text>
                    <Pill color={d.reversed ? coral(1) : ink(0.6)} border={d.reversed ? coral(0.5) : white(0.2)}>
                      {tarotOrientationLabel(d.reversed)}
                    </Pill>
                  </View>
                  <View style={styles.tags}>
                    {keywords.map((k) => (
                      <Tag key={k}>{k}</Tag>
                    ))}
                  </View>
                  {isLast && ready ? <TypedText text={text} animate={animate} /> : <Body>{text}</Body>}
                  {!ready && resultStatus === 'pending' ? <Muted size={11} dim={0.4}>카드 기본 의미예요. AI 해석이 오면 바뀝니다.</Muted> : null}
                </View>
              </View>
            );
          })}

          {allRevealed ? (
            <View style={styles.final}>
              {resultStatus === 'pending' ? <Loading text="카드를 읽는 중…" /> : null}
              {!ready && menu ? <TarotMenuBox menu={menu} pending /> : null}
              {resultStatus === 'failed' ? (
                <View style={{ gap: 8 }}>
                  <ErrorText>AI 해석을 불러오지 못했어요. 위 카드 기본 의미를 참고하거나 다시 시도해 주세요.</ErrorText>
                  <OutlineButton label="다시 시도" icon="restore" onPress={onRetry} style={{ alignSelf: 'flex-start' }} />
                </View>
              ) : null}
              {ready ? (
                <View style={{ gap: 12 }}>
                  <View style={{ gap: 3 }}>
                    <Caption>종합</Caption>
                    <TypedText text={result.summary} animate={animate} color={TR.cream} />
                  </View>
                  <View style={{ gap: 3 }}>
                    <Caption>조언</Caption>
                    <Body>{result.advice}</Body>
                  </View>
                  {menu ? <TarotMenuBox menu={menu} /> : null}
                  {result.choice && choices ? <TarotChoiceBox choice={result.choice} choices={choices} /> : null}
                  <View style={styles.keyword}>
                    <Icon name="star-four-points" size={15} />
                    <SerifTitle size={16}>{result.keyword}</SerifTitle>
                  </View>
                  {result.quota.remainingToday !== null ? (
                    <Muted size={11} dim={0.4}>
                      오늘 AI 해석 {result.quota.remainingToday}회 남음 · 로그인하면 제한이 없어요.
                    </Muted>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          <Muted size={10} dim={0.35} style={{ marginTop: 14 }}>
            {TAROT_DISCLAIMER}
          </Muted>
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton label={onClose ? '닫기' : '다시 뽑기'} icon={onClose ? 'close' : 'restore'} onPress={onReset} style={styles.footerButton} />
          {ready && shareBase ? <OutlineButton label="공유" icon="share-variant-outline" onPress={() => setShareOpen(true)} style={{ height: 40 }} /> : null}
        </View>
      </Animated.View>
      {shareBase ? <TarotShareSheet open={shareOpen} onClose={() => setShareOpen(false)} base={shareBase} hasQuestion={!!question} /> : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: white(0.1),
    backgroundColor: 'rgba(11,16,48,0.96)',
  },
  bodyWrap: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: white(0.12) },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: ink(0.6) },
  question: { fontSize: 14, color: TR.cream },
  choices: { fontSize: 12, color: ink(0.7) },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, gap: 16 },
  card: { flexDirection: 'row', gap: 12 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  name: { fontFamily: SERIF, fontSize: 16, fontWeight: '700', color: TR.cream },
  nameEn: { fontSize: 11, color: ink(0.5) },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  final: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: white(0.12), paddingTop: 14, gap: 12 },
  keyword: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: white(0.12) },
  footerButton: { height: 40, paddingHorizontal: 14 },
});
